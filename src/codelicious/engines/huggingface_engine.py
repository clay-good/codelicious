"""HuggingFace Inference API build engine.

This is the original codelicious engine, refactored into the engine interface.
Uses HuggingFace-hosted models (DeepSeek-V3 planner, Qwen3-235B coder) via
the OpenAI-compatible HTTP API.
"""

from __future__ import annotations

import json
import logging
import pathlib
import random
import time

from codelicious.engines.base import BuildEngine, BuildResult, ChunkResult, EngineContext
from codelicious.errors import LLMRateLimitError
from codelicious.loop_controller import MAX_HISTORY_TOKENS, MAX_TOOL_RESULT_BYTES, truncate_history

logger = logging.getLogger("codelicious.engines.huggingface")


def _is_transient(exc: Exception) -> bool:
    """Classify an exception as transient (retryable) vs fatal."""
    import urllib.error

    if isinstance(exc, urllib.error.HTTPError):
        return exc.code in (429, 500, 502, 503, 504)
    return isinstance(exc, (urllib.error.URLError, TimeoutError, ConnectionResetError, OSError))


class HuggingFaceEngine(BuildEngine):
    """Build engine using HuggingFace Inference API with tool dispatch."""

    @property
    def name(self) -> str:
        return "HuggingFace Inference"

    # ------------------------------------------------------------------
    # spec-27 Phase 3.3: Chunk-level interface
    # ------------------------------------------------------------------

    def execute_chunk(
        self,
        chunk: object,
        repo_path: pathlib.Path,
        context: EngineContext,
    ) -> ChunkResult:
        """Execute a single work chunk using the HF agentic loop.

        Builds a detailed system prompt with autonomous dev instructions,
        runs the tool-dispatch loop, and collects modified files.
        """
        from codelicious.config import load_project_config
        from codelicious.llm_client import LLMClient
        from codelicious.tools.registry import ToolRegistry

        start = time.monotonic()
        repo_path = pathlib.Path(repo_path).resolve()

        chunk_id = getattr(chunk, "id", "unknown")
        chunk_description = getattr(chunk, "description", "")
        chunk_validation = getattr(chunk, "validation", "")

        # Build previous work context
        previous_work = ""
        if context.previous_chunks:
            previous_work = "\n".join(f"- {s}" for s in context.previous_chunks)
        else:
            previous_work = "(none — this is the first chunk)"

        system_prompt = (
            "You are an autonomous software developer. You have tools to read, write, search, "
            "and execute commands in a repository. Your task is to implement one specific chunk "
            "of work from a larger spec.\n\n"
            "WORKFLOW:\n"
            "1. Read the relevant existing files to understand the codebase\n"
            "2. Plan your changes\n"
            "3. Implement the changes using write_file\n"
            "4. Run tests using run_command to verify your work\n"
            "5. Run linting using run_command to check code quality\n"
            "6. Fix any issues found\n"
            "7. When all tests pass and lint is clean, respond with CHUNK_COMPLETE\n\n"
            "RULES:\n"
            "- Make minimal, focused changes\n"
            "- Follow existing code patterns and conventions\n"
            "- Always run tests after changes\n"
            "- Never modify files outside the scope of your assigned chunk\n"
            "- Do NOT run git or gh commands. The orchestrator handles git.\n\n"
            f"## Spec Context\n{context.spec_content[:3000]}\n\n"
            f"## Your Task (Chunk {chunk_id})\n{chunk_description}\n\n"
            f"## Previous Work\n{previous_work}\n\n"
            f"## Validation\nThis task is complete when: {chunk_validation or 'all changes are implemented and tests pass'}\n"
        )

        config = load_project_config(repo_path)
        tool_registry = ToolRegistry(repo_path=repo_path, config=config, cache_manager=None)
        # Pass --model flag through to LLMClient if provided
        model_override = getattr(context, "model", "") or ""
        llm = LLMClient(coder_model=model_override or None)

        messages: list[dict] = [{"role": "system", "content": system_prompt}]
        tool_schema = tool_registry.generate_schema()

        max_iterations = 50
        deadline = context.deadline or (start + 1800)
        completed = False
        consecutive_errors = 0

        for iteration in range(max_iterations):
            if time.monotonic() > deadline:
                logger.warning("Chunk %s exceeded deadline at iteration %d.", chunk_id, iteration + 1)
                break

            messages = truncate_history(messages, MAX_HISTORY_TOKENS)

            try:
                response = llm.chat_completion(messages, tools=tool_schema, role="coder")
                consecutive_errors = 0
            except LLMRateLimitError as e:
                delay = min(e.retry_after_s, 60.0)
                logger.warning("Rate limited during chunk %s, sleeping %.1fs", chunk_id, delay)
                time.sleep(delay)
                continue
            except Exception as e:
                if _is_transient(e):
                    consecutive_errors += 1
                    if consecutive_errors >= 5:
                        logger.error("Chunk %s: aborting after %d transient failures.", chunk_id, consecutive_errors)
                        break
                    delay = min(2.0 * (2**consecutive_errors) + random.uniform(0, 1), 30.0)  # nosec B311
                    time.sleep(delay)
                    continue
                raise

            choices = response.get("choices") or []
            if not choices or not isinstance(choices[0], dict):
                messages.append({"role": "assistant", "content": "[Empty response]"})
                messages.append({"role": "user", "content": "Your response was empty. Please continue."})
                continue

            message_obj = choices[0].get("message")
            if not isinstance(message_obj, dict) or "role" not in message_obj:
                break
            messages.append(message_obj)

            tool_calls = llm.parse_tool_calls(response)
            if not tool_calls:
                content = llm.parse_content(response)
                if "CHUNK_COMPLETE" in content:
                    completed = True
                    break
                messages.append(
                    {"role": "user", "content": "Continue implementing until you can declare CHUNK_COMPLETE."}
                )
                continue

            # Execute tool calls
            for tool_call in tool_calls:
                try:
                    args = json.loads(tool_call["function"]["arguments"])
                    name = tool_call["function"]["name"]
                    tool_result = tool_registry.dispatch(name, args)
                    tool_content = json.dumps(tool_result)
                    if len(tool_content) > MAX_TOOL_RESULT_BYTES:
                        tool_content = tool_content[:MAX_TOOL_RESULT_BYTES] + "...<truncated>"
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": tool_call["id"],
                            "name": name,
                            "content": tool_content,
                        }
                    )
                except Exception as e:
                    tool_name = tool_call.get("function", {}).get("name", "unknown")
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": tool_call.get("id", ""),
                            "name": tool_name,
                            "content": json.dumps({"success": False, "stderr": f"Error: {e}"}),
                        }
                    )

        # spec-27: Reflection step — ask the model to review its own changes
        if completed and time.monotonic() < deadline:
            logger.info("Chunk %s: running reflection step...", chunk_id)
            messages = truncate_history(messages, MAX_HISTORY_TOKENS)
            messages.append(
                {
                    "role": "user",
                    "content": (
                        "Before finalizing, please review your changes:\n"
                        "1. Are there any obvious bugs or typos?\n"
                        "2. Did you miss any edge cases?\n"
                        "3. Are imports correct and complete?\n"
                        "If you find issues, fix them using the tools. "
                        "If everything looks good, respond with CHUNK_COMPLETE."
                    ),
                }
            )
            try:
                reflect_response = llm.chat_completion(messages, tools=tool_schema, role="coder")
                reflect_choices = reflect_response.get("choices") or []
                if reflect_choices and isinstance(reflect_choices[0], dict):
                    reflect_msg = reflect_choices[0].get("message")
                    if isinstance(reflect_msg, dict):
                        messages.append(reflect_msg)
                        # If the reflection produced tool calls, execute them
                        reflect_tool_calls = llm.parse_tool_calls(reflect_response)
                        for tool_call in reflect_tool_calls:
                            try:
                                args = json.loads(tool_call["function"]["arguments"])
                                name = tool_call["function"]["name"]
                                tool_result = tool_registry.dispatch(name, args)
                                tool_content = json.dumps(tool_result)
                                if len(tool_content) > MAX_TOOL_RESULT_BYTES:
                                    tool_content = tool_content[:MAX_TOOL_RESULT_BYTES] + "...<truncated>"
                                messages.append(
                                    {
                                        "role": "tool",
                                        "tool_call_id": tool_call["id"],
                                        "name": name,
                                        "content": tool_content,
                                    }
                                )
                            except Exception:  # nosec B110
                                pass  # Reflection fixes are best-effort
            except Exception as e:
                logger.debug("Reflection step failed (non-fatal): %s", e)

        tool_registry.close()

        # Collect modified files
        import subprocess

        try:
            diff_result = subprocess.run(
                ["git", "diff", "--name-only", "HEAD"],
                cwd=repo_path,
                capture_output=True,
                text=True,
                timeout=15,
            )
            files = (
                [pathlib.Path(f) for f in diff_result.stdout.strip().splitlines() if f]
                if diff_result.returncode == 0
                else []
            )
        except Exception:
            files = []

        return ChunkResult(
            success=completed,
            files_modified=files,
            message=f"Chunk {chunk_id} {'complete' if completed else 'incomplete'}",
        )

    def verify_chunk(
        self,
        chunk: object,
        repo_path: pathlib.Path,
    ) -> ChunkResult:
        """Run verification checks on the repo after a chunk."""
        try:
            from codelicious.verifier import verify

            vresult = verify(repo_path)
            if vresult.all_passed:
                return ChunkResult(success=True, message="All checks passed.")

            failed = [c for c in vresult.checks if not c.passed]
            failure_details = "; ".join(f"{c.name}: {c.message}" for c in failed)
            return ChunkResult(success=False, message=failure_details)
        except ImportError:
            return ChunkResult(success=True, message="Verifier not available — skipped.")
        except Exception as e:
            return ChunkResult(success=False, message=str(e))

    def fix_chunk(
        self,
        chunk: object,
        repo_path: pathlib.Path,
        failures: list[str],
    ) -> ChunkResult:
        """Use the HF agentic loop to fix verification failures."""
        chunk_id = getattr(chunk, "id", "unknown")
        failure_text = "\n".join(f"- {f}" for f in failures)

        # Build a fix-focused context and re-run execute_chunk with fix prompt
        fix_context = EngineContext(
            spec_content=(
                f"## Fix Verification Failures (Chunk {chunk_id})\n\n"
                f"The following checks failed:\n{failure_text}\n\n"
                f"Fix these issues. Run tests and linting to confirm they pass.\n"
            ),
            deadline=time.monotonic() + 600,
        )

        # Create a minimal chunk-like object for the fix
        class _FixChunk:
            pass

        fix_chunk_obj = _FixChunk()
        fix_chunk_obj.id = f"{chunk_id}-fix"
        fix_chunk_obj.title = f"Fix failures for {chunk_id}"
        fix_chunk_obj.description = f"Fix: {failure_text}"
        fix_chunk_obj.validation = "All tests pass and linting is clean"

        result = self.execute_chunk(fix_chunk_obj, repo_path, fix_context)
        return ChunkResult(
            success=result.success,
            files_modified=result.files_modified,
            message=result.message,
            retries_used=1,
        )

    # ------------------------------------------------------------------
    # Legacy interface — delegates to V2Orchestrator
    # ------------------------------------------------------------------

    def run_build_cycle(
        self,
        repo_path: pathlib.Path,
        git_manager: object,
        cache_manager: object,
        spec_filter: str | None = None,
        **kwargs,
    ) -> BuildResult:
        """Run the build lifecycle by delegating to V2Orchestrator.

        This method exists for backward compatibility with the ``BuildEngine``
        interface.  The ``cli.py`` main entry point now calls ``V2Orchestrator``
        directly, so this path is only used if an external caller invokes the
        engine directly.
        """
        from codelicious.orchestrator import V2Orchestrator
        from codelicious.spec_discovery import discover_incomplete_specs

        start = time.monotonic()
        repo_path = pathlib.Path(repo_path).resolve()
        agent_timeout_s = kwargs.get("agent_timeout_s", 1800)
        push_pr = kwargs.get("push_pr", False)
        max_commits_per_pr = kwargs.get("max_commits_per_pr", 50)

        specs = discover_incomplete_specs(repo_path)
        if not specs:
            return BuildResult(success=True, message="No incomplete specs found.", elapsed_s=time.monotonic() - start)

        orch = V2Orchestrator(repo_path, git_manager, self, max_commits_per_pr=max_commits_per_pr)
        result = orch.run(
            specs=specs,
            deadline=start + agent_timeout_s,
            push_pr=push_pr,
        )

        return BuildResult(
            success=result.success,
            message=result.message,
            elapsed_s=result.elapsed_s,
        )
