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
import re
import time

from codelicious.engines.base import BuildEngine, BuildResult
from codelicious.errors import LLMRateLimitError
from codelicious.loop_controller import MAX_HISTORY_TOKENS, MAX_TOOL_RESULT_BYTES, truncate_history

logger = logging.getLogger("codelicious.engines.huggingface")


def _is_transient(exc: Exception) -> bool:
    """Classify an exception as transient (retryable) vs fatal."""
    import urllib.error

    if isinstance(exc, urllib.error.HTTPError):
        return exc.code in (429, 500, 502, 503, 504)
    if isinstance(exc, (urllib.error.URLError, TimeoutError, ConnectionResetError, OSError)):
        return True
    return False


class HuggingFaceEngine(BuildEngine):
    """Build engine using HuggingFace Inference API with tool dispatch."""

    @property
    def name(self) -> str:
        return "HuggingFace Inference"

    def run_build_cycle(
        self,
        repo_path: pathlib.Path,
        git_manager: object,
        cache_manager: object,
        spec_filter: str | None = None,
        **kwargs,
    ) -> BuildResult:
        """Run the HuggingFace tool-dispatch agentic loop.

        This is the original BuildLoop logic, refactored into the engine
        interface without changing behavior.
        """
        from codelicious.tools.registry import ToolRegistry
        from codelicious.llm_client import LLMClient

        start = time.monotonic()
        repo_path = pathlib.Path(repo_path).resolve()
        max_iterations = kwargs.get("max_iterations", 50)
        max_build_time = kwargs.get("agent_timeout_s", 3600)
        build_deadline = start + max_build_time

        # Load config
        config_path = repo_path / ".codelicious" / "config.json"
        # Allowed config keys — must match git_orchestrator._ALLOWED_CONFIG_KEYS (Finding 11)
        _allowed_keys = frozenset(
            {"allowlisted_commands", "default_reviewers", "max_calls_per_iteration", "verify_command"}
        )
        _config_max_bytes = 100_000

        config: dict = {}
        if config_path.exists():
            try:
                config_size = config_path.stat().st_size
                if config_size > _config_max_bytes:
                    logger.error("config.json too large (%d bytes); skipping.", config_size)
                else:
                    loaded = json.loads(config_path.read_text())
                    if isinstance(loaded, dict):
                        # Filter to allowed keys only (Finding 11: prevent config injection)
                        filtered = {k: v for k, v in loaded.items() if k in _allowed_keys}
                        config.update(filtered)
                        # S20-P3-4: Deprecation warning for allowlisted_commands
                        if "allowlisted_commands" in config:
                            logger.warning(
                                "Config key 'allowlisted_commands' is deprecated and ignored. "
                                "Command restrictions are hardcoded in security_constants.py."
                            )
                            del config["allowlisted_commands"]
                        # Clamp max_calls_per_iteration to safe range
                        if "max_calls_per_iteration" in config:
                            config["max_calls_per_iteration"] = max(
                                10, min(100, int(config["max_calls_per_iteration"]))
                            )
            except (json.JSONDecodeError, ValueError):
                pass

        # Initialize components
        tool_registry = ToolRegistry(
            repo_path=repo_path,
            config=config,
            cache_manager=cache_manager,
        )
        llm = LLMClient()

        # System prompt
        spec_focus = ""
        if spec_filter:
            # Sanitize spec_filter to prevent prompt injection (Finding 32)
            safe_filter = re.sub(r"[^\w\-./]", "_", spec_filter).replace("\n", "").replace("\x00", "")
            spec_focus = (
                f"\n\nIMPORTANT: Focus ONLY on the spec file: {safe_filter}\n"
                "Build ALL unchecked tasks from that spec. Do not look at other spec files.\n"
            )

        system_prompt = (
            "You are Codelicious, an autonomous Outcome-as-a-Service CLI. You operate under a 90% probabilistic model, meaning "
            "YOU are responsible for finding work, planning, and executing. Python is just your sandboxed constraint overlay.\n\n"
            "CRITICAL: Do NOT run git or gh commands. The orchestrator handles all git operations.\n\n"
            "PHASE 1 (SPEC FINDER): Use the `list_directory` tool to deeply scan the repository root. Find any `*.md` files "
            "(especially in `docs/` or `specs/`) that define your objective.\n\n"
            "PHASE 2 (EXECUTION): Use `read_file` to read the found specifications. Then, aggressively use `write_file` to modify "
            "the codebase to achieve the spec requirements. Run verification tools (like `pytest` or `eslint`) using `run_command`.\n\n"
            "When every single requirement is met and tests pass, reply with the explicit text: 'ALL_SPECS_COMPLETE' so the core "
            "can trigger the GitHub PR transition." + spec_focus
        )
        messages = [{"role": "system", "content": system_prompt}]

        logger.info("LLM Planner: %s | Coder: %s", llm.planner_model, llm.coder_model)
        logger.info("LLM Endpoint: %s", llm.endpoint_url)
        logger.info("Initializing Continuous Agentic Loop.")

        # Generate tool schema once before the loop — it is static for the
        # lifetime of this build cycle and does not need to be regenerated
        # on every iteration.
        tool_schema = tool_registry.generate_schema()

        completed = False
        consecutive_errors = 0
        consecutive_empty = 0
        max_retries = 5

        for iteration in range(max_iterations):
            if time.monotonic() > build_deadline:
                from codelicious.errors import BuildTimeoutError

                raise BuildTimeoutError(f"Build exceeded {max_build_time}s deadline at iteration {iteration + 1}")
            logger.info("--- Iteration %d/%d ---", iteration + 1, max_iterations)
            logger.info("Pinging HuggingFace LLM inference endpoint...")

            # Truncate history before each call to prevent OOM and API rejection
            messages = truncate_history(messages, MAX_HISTORY_TOKENS)

            try:
                response = llm.chat_completion(
                    messages,
                    tools=tool_schema,
                    role="coder",
                )
                consecutive_errors = 0  # Reset on success
            except LLMRateLimitError as e:
                # S20-P2-6: Honour retry_after_s from rate limit response
                delay = min(e.retry_after_s, 60.0)
                logger.warning("Rate limited, sleeping %.1fs", delay)
                time.sleep(delay)
                continue
            except Exception as e:
                if _is_transient(e):
                    consecutive_errors += 1
                    if consecutive_errors >= max_retries:
                        logger.error("Aborting after %d consecutive transient failures.", max_retries)
                        break
                    # S20-P2-4: Exponential backoff with jitter, capped at 30s
                    delay = min(2.0 * (2**consecutive_errors) + random.uniform(0, 1), 30.0)  # nosec B311
                    logger.warning(
                        "Transient LLM error (%d/%d): %s — retrying in %.1fs",
                        consecutive_errors,
                        max_retries,
                        e,
                        delay,
                    )
                    time.sleep(delay)
                    messages.append(
                        {
                            "role": "user",
                            "content": "The previous API call failed. Please continue your work.",
                        }
                    )
                    continue
                else:
                    logger.error("Fatal LLM error: %s", e)
                    logger.debug("Fatal error details:", exc_info=True)
                    raise

            choices = response.get("choices") or []
            if not choices or not isinstance(choices[0], dict):
                consecutive_empty += 1
                logger.warning("LLM returned empty choices array (attempt %d)", consecutive_empty)
                if consecutive_empty >= 3:
                    from codelicious.errors import LLMClientError

                    raise LLMClientError("LLM returned 3 consecutive empty responses, aborting")
                messages.append({"role": "assistant", "content": "[Empty response from LLM]"})
                messages.append(
                    {
                        "role": "user",
                        "content": "Your previous response was empty. Please try again with a valid tool call or text response.",
                    }
                )
                continue
            consecutive_empty = 0  # Reset on valid response
            message_obj = choices[0].get("message")
            if not isinstance(message_obj, dict) or "role" not in message_obj:
                raise RuntimeError("Malformed LLM response: invalid message object")
            messages.append(message_obj)

            # Handle tool calls
            tool_calls = llm.parse_tool_calls(response)

            if not tool_calls:
                content = llm.parse_content(response)
                if "ALL_SPECS_COMPLETE" in content:
                    logger.info("Agent signaled completion criteria met.")
                    completed = True
                    break
                else:
                    messages.append(
                        {
                            "role": "user",
                            "content": "Please continue exploring or implementing using your toolset until you can declare ALL_SPECS_COMPLETE.",
                        }
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
                        logger.warning(
                            "Tool result for '%s' truncated to %d bytes (original: %d bytes)",
                            name,
                            MAX_TOOL_RESULT_BYTES,
                            len(tool_content),
                        )
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
                    # Log only tool name, not full arguments which may contain secrets (Finding 40)
                    # Use safe .get() access to avoid secondary KeyError in error handler (Finding 2)
                    tool_name = tool_call.get("function", {}).get("name", "unknown")
                    tool_call_id = tool_call.get("id", "")
                    logger.warning("Tool call failed: %s: %s", tool_name, type(e).__name__)
                    logger.debug("Tool call traceback for %s:", tool_name, exc_info=True)
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": tool_call_id,
                            "name": tool_name,
                            "content": json.dumps(
                                {
                                    "success": False,
                                    "stderr": f"Tool Execution Pipeline Error: {e}",
                                }
                            ),
                        }
                    )

        # Close tool registry to release file handles (Finding 1: AuditLogger leak)
        tool_registry.close()

        if completed:
            try:
                git_manager.commit_verified_changes(commit_message="Auto-Implementation: All specs complete.")
                git_manager.push_to_origin()
            except Exception as e:
                logger.warning("Git commit/push failed: %s", e)
                logger.debug("Git error traceback:", exc_info=True)

        elapsed = time.monotonic() - start
        return BuildResult(
            success=completed,
            message="All specs complete." if completed else "Exhausted iteration limit.",
            elapsed_s=elapsed,
        )
