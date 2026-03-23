"""Claude Code CLI build engine.

Spawns the `claude` binary as a subprocess, orchestrating the full build
lifecycle: scaffold → analyze → build → verify → reflect → commit → PR.

Supports continuous mode (``--auto``): repeats the build cycle with fresh
agent sessions until every spec task is checked off or a hard iteration
cap is reached.  Token exhaustion and rate limits trigger automatic
backoff and retry with a new session context.
"""

from __future__ import annotations

import concurrent.futures
import logging
import pathlib
import re
import sys
import time

from codelicious.engines.base import BuildEngine, BuildResult

logger = logging.getLogger("codelicious.engines.claude")

# Continuous-mode defaults
_DEFAULT_MAX_CYCLES = 50  # Hard cap on build→verify cycles
_DEFAULT_RATE_LIMIT_BACKOFF_S = 65.0  # Wait after rate limit before retry
_DEFAULT_TOKEN_EXHAUST_BACKOFF_S = 10.0  # Wait after token exhaustion before retry
_DEFAULT_PARALLEL_WORKERS = 1  # Default: serial execution

# Patterns used to discover spec files in a repo
_SPEC_FILE_GLOBS: list[str] = [
    "docs/specs/*.md",
    "specs/*.md",
    "spec.md",
    "spec-*.md",
    "*.spec.md",
    "ROADMAP.md",
    "TODO.md",
]

_UNCHECKED_RE = re.compile(r"^\s*-\s*\[\s*\]", re.MULTILINE)


def _discover_incomplete_specs(repo_path: pathlib.Path) -> list[pathlib.Path]:
    """Find spec files that still have unchecked ``- [ ]`` items."""
    specs: list[pathlib.Path] = []
    seen: set[pathlib.Path] = set()
    for pattern in _SPEC_FILE_GLOBS:
        for path in repo_path.glob(pattern):
            resolved = path.resolve()
            if resolved in seen or not resolved.is_file():
                continue
            seen.add(resolved)
            try:
                content = resolved.read_text(encoding="utf-8", errors="replace")
                if _UNCHECKED_RE.search(content):
                    specs.append(resolved)
            except OSError:
                pass
    return specs


class ClaudeCodeEngine(BuildEngine):
    """Build engine that uses the Claude Code CLI as its backend."""

    @property
    def name(self) -> str:
        return "Claude Code CLI"

    # ------------------------------------------------------------------
    # Single-cycle build (the original 6-phase pipeline)
    # ------------------------------------------------------------------

    def _run_single_cycle(
        self,
        repo_path: pathlib.Path,
        git_manager: object,
        project_name: str,
        config: object,
        session_id: str,
        spec_filter: str | None,
        verify_passes: int,
        reflect: bool,
        push_pr: bool,
    ) -> BuildResult:
        """Execute one scaffold→build→verify→reflect→commit→PR cycle.

        Returns a BuildResult.  On recoverable errors (rate limit, token
        exhaustion) the result has ``success=False`` and a message starting
        with ``"RATE_LIMIT:"`` or ``"TOKEN_EXHAUSTED:"`` so the outer loop
        can decide whether to retry.
        """
        from codelicious.agent_runner import run_agent
        from codelicious.scaffolder import scaffold, scaffold_claude_dir
        from codelicious.prompts import (
            AGENT_BUILD_SPEC,
            AGENT_VERIFY,
            check_build_complete,
            clear_build_complete,
            render,
        )
        from codelicious.errors import (
            AgentTimeout,
            ClaudeAuthError,
            ClaudeRateLimitError,
            CodeliciousError,
        )

        start = time.monotonic()

        # ── Phase 1: SCAFFOLD ──────────────────────────────────────
        logger.info("Phase 1/6: SCAFFOLD — writing CLAUDE.md + .claude/")
        try:
            scaffold(repo_path)
            scaffold_claude_dir(repo_path)
        except Exception as e:
            logger.warning("Scaffolding failed (non-fatal): %s", e)

        # ── Phase 2: BUILD ─────────────────────────────────────────
        logger.info("Phase 2/6: BUILD — autonomous implementation")
        clear_build_complete(repo_path)

        build_prompt = render(
            AGENT_BUILD_SPEC,
            project_name=project_name,
            spec_filter=spec_filter or "",
        )

        try:
            result = run_agent(
                prompt=build_prompt,
                project_root=repo_path,
                config=config,
                tee_to=sys.stdout,
                resume_session_id=session_id,
            )
            session_id = result.session_id or session_id
            logger.info(
                "BUILD phase complete: success=%s, elapsed=%.1fs",
                result.success,
                result.elapsed_s,
            )
        except AgentTimeout as e:
            logger.error("BUILD phase timed out: %s", e)
            return BuildResult(
                success=False,
                message=f"Build timed out after {getattr(config, 'agent_timeout_s', '?')}s",
                session_id=session_id,
                elapsed_s=time.monotonic() - start,
            )
        except ClaudeAuthError as e:
            logger.error("Authentication failed: %s", e)
            return BuildResult(success=False, message=str(e), session_id=session_id, elapsed_s=time.monotonic() - start)
        except ClaudeRateLimitError as e:
            logger.warning("Rate limited during BUILD: %s", e)
            return BuildResult(
                success=False,
                message=f"RATE_LIMIT:{e.retry_after_s}",
                session_id=session_id,
                elapsed_s=time.monotonic() - start,
            )
        except CodeliciousError as e:
            # Detect token exhaustion from Claude CLI error messages
            msg_lower = str(e).lower()
            if "token" in msg_lower and ("limit" in msg_lower or "exhaust" in msg_lower or "exceed" in msg_lower):
                logger.warning("Token exhaustion detected: %s", e)
                return BuildResult(
                    success=False,
                    message="TOKEN_EXHAUSTED:",
                    session_id=session_id,
                    elapsed_s=time.monotonic() - start,
                )
            raise

        # ── Phase 3: VERIFY ────────────────────────────────────────
        for verify_pass in range(1, verify_passes + 1):
            logger.info("Phase 3/6: VERIFY — pass %d/%d", verify_pass, verify_passes)
            try:
                from codelicious.verifier import verify

                vresult = verify(repo_path)
                if vresult.all_passed:
                    logger.info("Verification passed (all checks green).")
                    break
                failed = [c for c in vresult.checks if not c.passed]
                logger.warning(
                    "Verification failed: %s",
                    ", ".join(f"{c.name}: {c.message}" for c in failed),
                )
                fix_prompt = render(
                    AGENT_VERIFY,
                    project_name=project_name,
                    verify_pass=str(verify_pass),
                    max_verify_passes=str(verify_passes),
                )
                try:
                    run_agent(
                        prompt=fix_prompt,
                        project_root=repo_path,
                        config=config,
                        tee_to=sys.stdout,
                        resume_session_id=session_id,
                    )
                except Exception as e:
                    logger.warning("Verify-fix agent failed: %s", e)
            except ImportError:
                logger.debug("Verifier not available, skipping deterministic checks.")
                break
            except Exception as e:
                logger.warning("Verification error: %s", e)
                break

        # ── Phase 4: REFLECT (optional) ────────────────────────────
        if reflect:
            logger.info("Phase 4/6: REFLECT — quality review (read-only)")
            try:
                from codelicious.prompts import AGENT_REFLECT

                reflect_prompt = render(AGENT_REFLECT, project_name=project_name)
                run_agent(
                    prompt=reflect_prompt,
                    project_root=repo_path,
                    config=config,
                    tee_to=sys.stdout,
                    resume_session_id=session_id,
                )
            except Exception as e:
                logger.warning("Reflect phase failed (non-fatal): %s", e)
        else:
            logger.info("Phase 4/6: REFLECT — skipped (--no-reflect)")

        # ── Phase 5: GIT COMMIT ────────────────────────────────────
        logger.info("Phase 5/6: GIT — committing changes")
        try:
            git_manager.commit_verified_changes(commit_message=f"codelicious: build {project_name} from specs")
            logger.info("Changes committed successfully.")
        except Exception as e:
            logger.warning("Git commit failed: %s", e)

        # ── Phase 6: PUSH + PR ─────────────────────────────────────
        if push_pr:
            logger.info("Phase 6/6: PR — pushing and creating pull request")
            try:
                git_manager.ensure_draft_pr_exists()
                git_manager.transition_pr_to_review()
                logger.info("PR created/updated.")
            except Exception as e:
                logger.warning("PR creation failed: %s", e)
        else:
            logger.info("Phase 6/6: PR — skipped (use --push-pr to enable)")

        elapsed = time.monotonic() - start
        build_complete = check_build_complete(repo_path)

        return BuildResult(
            success=build_complete,
            message=f"Build cycle complete in {elapsed:.1f}s",
            session_id=session_id,
            elapsed_s=elapsed,
        )

    # ------------------------------------------------------------------
    # Parallel execution
    # ------------------------------------------------------------------

    def _run_parallel_cycle(
        self,
        repo_path: pathlib.Path,
        git_manager: object,
        project_name: str,
        config: object,
        verify_passes: int,
        reflect: bool,
        push_pr: bool,
        max_workers: int,
    ) -> list[BuildResult]:
        """Discover incomplete specs and run them in parallel.

        Each spec gets its own agent session (no session sharing).
        Returns a list of BuildResults, one per spec processed.
        If only one or zero specs are found, falls back to a single
        serial cycle with no spec filter.
        """
        specs = _discover_incomplete_specs(repo_path)

        if len(specs) <= 1:
            # Not enough specs for parallelization — run a normal cycle
            spec_filter = str(specs[0]) if specs else None
            result = self._run_single_cycle(
                repo_path=repo_path,
                git_manager=git_manager,
                project_name=project_name,
                config=config,
                session_id="",
                spec_filter=spec_filter,
                verify_passes=verify_passes,
                reflect=reflect,
                push_pr=push_pr,
            )
            return [result]

        workers = min(max_workers, len(specs))
        logger.info(
            "PARALLEL: running %d specs across %d workers: %s",
            len(specs),
            workers,
            [s.name for s in specs],
        )

        def _worker(spec_path: pathlib.Path) -> BuildResult:
            return self._run_single_cycle(
                repo_path=repo_path,
                git_manager=git_manager,
                project_name=project_name,
                config=config,
                session_id="",
                spec_filter=str(spec_path),
                verify_passes=verify_passes,
                reflect=False,  # Skip reflect in parallel — do one at end
                push_pr=push_pr,
            )

        results: list[BuildResult] = []
        with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {pool.submit(_worker, spec): spec for spec in specs}
            for future in concurrent.futures.as_completed(futures):
                spec = futures[future]
                try:
                    result = future.result()
                    logger.info("Parallel spec %s: success=%s", spec.name, result.success)
                    results.append(result)
                except Exception as e:
                    logger.error("Parallel spec %s failed with exception: %s", spec.name, e)
                    results.append(BuildResult(success=False, message=str(e)))

        return results

    # ------------------------------------------------------------------
    # Public entry point
    # ------------------------------------------------------------------

    def run_build_cycle(
        self,
        repo_path: pathlib.Path,
        git_manager: object,
        cache_manager: object,
        spec_filter: str | None = None,
        **kwargs,
    ) -> BuildResult:
        """Run the Claude Code build lifecycle.

        In single-shot mode (default) this behaves identically to before:
        one scaffold→build→verify→reflect→commit→PR pass.

        In continuous mode (``auto_mode=True``), the cycle repeats with
        fresh agent sessions until all spec tasks are complete or the
        iteration cap is reached.  Rate limits and token exhaustion
        trigger automatic backoff and retry.
        """
        start = time.monotonic()
        repo_path = pathlib.Path(repo_path).resolve()

        # Extract config kwargs
        model = kwargs.get("model", "")
        agent_timeout_s = kwargs.get("agent_timeout_s", 1800)
        verify_passes = kwargs.get("verify_passes", 3)
        reflect = kwargs.get("reflect", True)
        push_pr = kwargs.get("push_pr", False)
        resume_session_id = kwargs.get("resume_session_id", "")
        dry_run = kwargs.get("dry_run", False)
        effort = kwargs.get("effort", "")
        max_turns = kwargs.get("max_turns", 0)
        auto_mode = kwargs.get("auto_mode", False)
        max_cycles = kwargs.get("max_cycles", _DEFAULT_MAX_CYCLES)
        parallel = kwargs.get("parallel", _DEFAULT_PARALLEL_WORKERS)
        orchestrate = kwargs.get("orchestrate", False)
        reviewers_str = kwargs.get("reviewers", "")
        build_workers = kwargs.get("build_workers", 3)
        review_workers = kwargs.get("review_workers", 4)

        # Build a simple config object for agent_runner
        class _AgentConfig:
            pass

        config = _AgentConfig()
        config.model = model
        config.effort = effort
        config.max_turns = max_turns
        config.agent_timeout_s = agent_timeout_s
        config.dry_run = dry_run

        project_name = repo_path.name
        session_id = resume_session_id

        # ── Orchestrate mode: phase-based pipeline ────────────────
        if orchestrate:
            from codelicious.orchestrator import Orchestrator

            specs = _discover_incomplete_specs(repo_path)
            if not specs:
                return BuildResult(
                    success=True,
                    message="No incomplete specs found.",
                    elapsed_s=time.monotonic() - start,
                )

            reviewer_roles: list[str] | None = None
            if reviewers_str:
                reviewer_roles = [r.strip() for r in reviewers_str.split(",") if r.strip()]

            orch = Orchestrator(repo_path, git_manager, config)
            orch_result = orch.run(
                specs=specs,
                reviewers=reviewer_roles,
                max_build_workers=build_workers,
                max_review_workers=review_workers,
                push_pr=push_pr,
            )

            return BuildResult(
                success=orch_result.success,
                message=orch_result.message,
                elapsed_s=orch_result.elapsed_s,
            )

        if not auto_mode:
            # ── Single-shot mode (original behavior) ──────────────
            return self._run_single_cycle(
                repo_path=repo_path,
                git_manager=git_manager,
                project_name=project_name,
                config=config,
                session_id=session_id,
                spec_filter=spec_filter,
                verify_passes=verify_passes,
                reflect=reflect,
                push_pr=push_pr,
            )

        # ── Continuous mode: loop until all specs are done ────────
        from codelicious.prompts import check_build_complete, scan_remaining_tasks

        use_parallel = parallel > 1
        logger.info(
            "CONTINUOUS MODE: max_cycles=%d, parallel=%d, until all specs complete.",
            max_cycles,
            parallel,
        )

        consecutive_failures = 0
        max_consecutive_failures = 5
        last_result: BuildResult | None = None

        for cycle in range(1, max_cycles + 1):
            logger.info("═══ Continuous cycle %d/%d ═══", cycle, max_cycles)

            if use_parallel and not spec_filter:
                # Parallel mode: discover specs and fan out
                parallel_results = self._run_parallel_cycle(
                    repo_path=repo_path,
                    git_manager=git_manager,
                    project_name=project_name,
                    config=config,
                    verify_passes=verify_passes,
                    reflect=reflect,
                    push_pr=push_pr,
                    max_workers=parallel,
                )
                # Aggregate: success if any worker succeeded
                any_success = any(r.success for r in parallel_results)
                cycle_result = BuildResult(
                    success=any_success,
                    message=f"Parallel cycle: {sum(r.success for r in parallel_results)}/{len(parallel_results)} succeeded",
                    session_id="",
                    elapsed_s=max((r.elapsed_s for r in parallel_results), default=0.0),
                )
                # Check for rate limit / token exhaustion in any result
                for r in parallel_results:
                    if r.message.startswith("RATE_LIMIT:") or r.message.startswith("TOKEN_EXHAUSTED:"):
                        cycle_result = r
                        break
            else:
                # Serial mode
                cycle_session = session_id if cycle == 1 else ""
                cycle_result = self._run_single_cycle(
                    repo_path=repo_path,
                    git_manager=git_manager,
                    project_name=project_name,
                    config=config,
                    session_id=cycle_session,
                    spec_filter=spec_filter,
                    verify_passes=verify_passes,
                    reflect=reflect,
                    push_pr=push_pr,
                )

            last_result = cycle_result

            # Track the latest session for logging
            if cycle_result.session_id:
                session_id = cycle_result.session_id

            # Handle recoverable errors with backoff
            if not cycle_result.success and cycle_result.message.startswith("RATE_LIMIT:"):
                try:
                    backoff = float(cycle_result.message.split(":")[1])
                except (IndexError, ValueError):
                    backoff = _DEFAULT_RATE_LIMIT_BACKOFF_S
                logger.warning("Rate limited — backing off %.0fs before retry...", backoff)
                time.sleep(backoff)
                # Don't count rate limits as consecutive failures
                continue

            if not cycle_result.success and cycle_result.message.startswith("TOKEN_EXHAUSTED:"):
                logger.warning(
                    "Token exhaustion — starting fresh session after %.0fs backoff...",
                    _DEFAULT_TOKEN_EXHAUST_BACKOFF_S,
                )
                time.sleep(_DEFAULT_TOKEN_EXHAUST_BACKOFF_S)
                session_id = ""  # Force fresh session
                # Don't count token exhaustion as failure — it just means the task was big
                continue

            # Check for completion via two signals:
            # 1. Agent wrote BUILD_COMPLETE with "DONE"
            # 2. No unchecked "- [ ]" items remain in spec files
            remaining = scan_remaining_tasks(repo_path)
            agent_done = check_build_complete(repo_path)

            if agent_done and remaining == 0:
                logger.info(
                    "All specs complete after %d cycle(s) (%.1fs total).",
                    cycle,
                    time.monotonic() - start,
                )
                return BuildResult(
                    success=True,
                    message=f"All specs complete after {cycle} cycle(s) in {time.monotonic() - start:.1f}s",
                    session_id=session_id,
                    elapsed_s=time.monotonic() - start,
                )

            if agent_done and remaining > 0:
                logger.info(
                    "Agent signaled DONE but %d unchecked tasks remain. Continuing...",
                    remaining,
                )
            elif remaining == 0 and cycle_result.success:
                logger.info(
                    "All tasks checked off (no BUILD_COMPLETE file). Treating as complete.",
                )
                return BuildResult(
                    success=True,
                    message=f"All tasks complete after {cycle} cycle(s) in {time.monotonic() - start:.1f}s",
                    session_id=session_id,
                    elapsed_s=time.monotonic() - start,
                )

            # Track consecutive hard failures
            if not cycle_result.success:
                consecutive_failures += 1
                logger.warning(
                    "Cycle %d failed (%d/%d consecutive): %s",
                    cycle,
                    consecutive_failures,
                    max_consecutive_failures,
                    cycle_result.message,
                )
                if consecutive_failures >= max_consecutive_failures:
                    logger.error("Aborting: %d consecutive failures.", consecutive_failures)
                    break
            else:
                consecutive_failures = 0
                logger.info(
                    "Cycle %d succeeded but more work remains. Continuing...",
                    cycle,
                )

        # Loop exhausted or too many failures
        elapsed = time.monotonic() - start
        final_msg = last_result.message if last_result else "No cycles completed"
        return BuildResult(
            success=False,
            message=f"Continuous mode ended after {elapsed:.1f}s: {final_msg}",
            session_id=session_id,
            elapsed_s=elapsed,
        )
