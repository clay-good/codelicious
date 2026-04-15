"""Claude Code CLI build engine (spec-27 Phase 3.2).

Delegates to the ``claude`` binary in headless mode for chunk execution.
The v2 orchestrator (``V2Orchestrator``) drives the chunk loop — this
engine only implements ``execute_chunk``, ``verify_chunk``, ``fix_chunk``,
and a ``run_build_cycle`` that delegates to ``V2Orchestrator``.
"""

from __future__ import annotations

import logging
import pathlib
import sys
import time

from codelicious.engines.base import BuildEngine, BuildResult, ChunkResult, EngineContext

logger = logging.getLogger("codelicious.engines.claude")


class ClaudeCodeEngine(BuildEngine):
    """Build engine that uses the Claude Code CLI as its backend."""

    @property
    def name(self) -> str:
        return "Claude Code CLI"

    # ------------------------------------------------------------------
    # spec-27 Phase 3.2: Chunk-level interface
    # ------------------------------------------------------------------

    def execute_chunk(
        self,
        chunk: object,
        repo_path: pathlib.Path,
        context: EngineContext,
    ) -> ChunkResult:
        """Execute a single work chunk by delegating to Claude Code CLI.

        Spawns ``claude`` in headless mode with a focused prompt built from
        the chunk description and repo context.  Collects the list of files
        modified from ``git diff --name-only`` after the agent completes.
        """
        from codelicious.agent_runner import run_agent
        from codelicious.errors import AgentTimeout, ClaudeAuthError, ClaudeRateLimitError

        chunk_id = getattr(chunk, "id", "unknown")
        chunk_title = getattr(chunk, "title", "")
        chunk_description = getattr(chunk, "description", "")
        chunk_validation = getattr(chunk, "validation", "")

        # Build the focused prompt
        previous_work = ""
        if context.previous_chunks:
            previous_work = "\n".join(f"- {s}" for s in context.previous_chunks)
        else:
            previous_work = "(none — this is the first chunk)"

        prompt = (
            f"You are working in {repo_path}.\n\n"
            f"## Spec Context\n{context.spec_content[:3000]}\n\n"
            f"## Your Task (Chunk {chunk_id})\n{chunk_description}\n\n"
            f"## Constraints\n"
            f"- Only modify files relevant to this specific task\n"
            f"- Run tests after making changes to verify correctness\n"
            f"- Run linting (ruff check) to ensure code quality\n"
            f"- Do not modify files outside the scope of this task\n\n"
            f"## Previous Work\nThese chunks have already been completed:\n{previous_work}\n\n"
            f"## Validation\nThis task is complete when: {chunk_validation or chunk_title}\n"
        )

        # Build config for agent_runner
        class _ChunkConfig:
            pass

        config = _ChunkConfig()
        config.model = ""
        config.effort = ""
        config.max_turns = 50
        config.agent_timeout_s = max(int(context.deadline - time.monotonic()), 60) if context.deadline else 1800
        config.dry_run = False

        try:
            result = run_agent(
                prompt=prompt,
                project_root=repo_path,
                config=config,
                tee_to=sys.stdout,
            )
            logger.info(
                "Chunk %s agent complete: success=%s, elapsed=%.1fs", chunk_id, result.success, result.elapsed_s
            )
        except AgentTimeout as e:
            logger.error("Chunk %s timed out: %s", chunk_id, e)
            return ChunkResult(success=False, message=f"Chunk timed out: {e}")
        except ClaudeAuthError as e:
            logger.error("Auth failed during chunk %s: %s", chunk_id, e)
            return ChunkResult(success=False, message=str(e))
        except ClaudeRateLimitError as e:
            logger.warning("Rate limited during chunk %s: %s", chunk_id, e)
            return ChunkResult(success=False, message=f"Rate limited: {e}")
        except Exception as e:
            logger.error("Chunk %s failed: %s", chunk_id, e)
            return ChunkResult(success=False, message=str(e))

        # Collect modified files from git
        import subprocess

        try:
            diff_result = subprocess.run(
                ["git", "diff", "--name-only", "HEAD"],
                cwd=repo_path,
                capture_output=True,
                text=True,
                timeout=15,
            )
            staged_result = subprocess.run(
                ["git", "diff", "--cached", "--name-only"],
                cwd=repo_path,
                capture_output=True,
                text=True,
                timeout=15,
            )
            # Untracked files the agent may have created
            untracked_result = subprocess.run(
                ["git", "ls-files", "--others", "--exclude-standard"],
                cwd=repo_path,
                capture_output=True,
                text=True,
                timeout=15,
            )
            all_names = set()
            for r in (diff_result, staged_result, untracked_result):
                if r.returncode == 0 and r.stdout.strip():
                    all_names.update(r.stdout.strip().splitlines())

            files_modified = [pathlib.Path(f) for f in sorted(all_names) if f]
        except Exception as e:
            logger.warning("Could not collect modified files: %s", e)
            files_modified = []

        return ChunkResult(
            success=result.success,
            files_modified=files_modified,
            message=f"Chunk {chunk_id} complete" if result.success else f"Chunk {chunk_id} agent failed",
        )

    def verify_chunk(
        self,
        chunk: object,
        repo_path: pathlib.Path,
    ) -> ChunkResult:
        """Run verification checks (lint, test, security) on the repo.

        Uses the existing ``verifier.verify()`` function to run all
        applicable checks and returns the result as a ``ChunkResult``.
        """
        chunk_id = getattr(chunk, "id", "unknown")

        try:
            from codelicious.verifier import verify

            vresult = verify(repo_path)
            if vresult.all_passed:
                logger.info("Verification passed for chunk %s.", chunk_id)
                return ChunkResult(success=True, message="All checks passed.")

            failed = [c for c in vresult.checks if not c.passed]
            failure_details = "; ".join(f"{c.name}: {c.message}" for c in failed)
            logger.warning("Verification failed for chunk %s: %s", chunk_id, failure_details)
            return ChunkResult(success=False, message=failure_details)

        except ImportError:
            logger.debug("Verifier not available, treating as passed.")
            return ChunkResult(success=True, message="Verifier not available — skipped.")
        except Exception as e:
            logger.warning("Verification error for chunk %s: %s", chunk_id, e)
            return ChunkResult(success=False, message=str(e))

    def fix_chunk(
        self,
        chunk: object,
        repo_path: pathlib.Path,
        failures: list[str],
    ) -> ChunkResult:
        """Spawn a Claude agent to fix verification failures.

        Gives the agent the failure messages and asks it to fix them.
        """
        from codelicious.agent_runner import run_agent
        from codelicious.errors import AgentTimeout

        chunk_id = getattr(chunk, "id", "unknown")

        failure_text = "\n".join(f"- {f}" for f in failures)
        prompt = (
            f"You are working in {repo_path}.\n\n"
            f"## Fix Verification Failures (Chunk {chunk_id})\n\n"
            f"The following verification checks failed after your changes:\n\n"
            f"{failure_text}\n\n"
            f"Please fix these issues. Run tests and linting after your fixes "
            f"to confirm they pass.\n"
        )

        class _FixConfig:
            pass

        config = _FixConfig()
        config.model = ""
        config.effort = ""
        config.max_turns = 30
        config.agent_timeout_s = 600
        config.dry_run = False

        try:
            result = run_agent(
                prompt=prompt,
                project_root=repo_path,
                config=config,
                tee_to=sys.stdout,
            )
        except (AgentTimeout, Exception) as e:
            logger.warning("Fix agent for chunk %s failed: %s", chunk_id, e)
            return ChunkResult(success=False, message=str(e), retries_used=1)

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
            success=result.success,
            files_modified=files,
            message=f"Fix attempt for chunk {chunk_id}",
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
