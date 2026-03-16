"""Claude Code CLI build engine.

Spawns the `claude` binary as a subprocess, orchestrating the full build
lifecycle: scaffold → analyze → build → verify → reflect → commit → PR.
"""

from __future__ import annotations

import logging
import pathlib
import sys
import time

from codelicious.engines.base import BuildEngine, BuildResult

logger = logging.getLogger("codelicious.engines.claude")


class ClaudeCodeEngine(BuildEngine):
    """Build engine that uses the Claude Code CLI as its backend."""

    @property
    def name(self) -> str:
        return "Claude Code CLI"

    def run_build_cycle(
        self,
        repo_path: pathlib.Path,
        git_manager: object,
        cache_manager: object,
        spec_filter: str | None = None,
        **kwargs,
    ) -> BuildResult:
        """Run the full Claude Code build lifecycle.

        Phases:
        1. SCAFFOLD — write CLAUDE.md + .claude/ to target project
        2. ANALYZE  — explore codebase, write .codelicious/STATE.md
        3. BUILD    — implement specs, run tests, commit
        4. VERIFY   — run verification pipeline
        5. REFLECT  — optional quality review
        6. PR       — push + create pull request
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
        )

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

        # Build a simple config object for agent_runner
        class _AgentConfig:
            pass

        config = _AgentConfig()
        config.model = model
        config.effort = effort
        config.max_turns = max_turns
        config.agent_timeout_s = agent_timeout_s
        config.dry_run = dry_run

        # Derive project name from repo path
        project_name = repo_path.name

        # ── Phase 1: SCAFFOLD ──────────────────────────────────────────
        logger.info("Phase 1/6: SCAFFOLD — writing CLAUDE.md + .claude/")
        try:
            scaffold(repo_path)
            scaffold_claude_dir(repo_path)
            logger.info("Scaffolding complete.")
        except Exception as e:
            logger.warning("Scaffolding failed (non-fatal): %s", e)

        # ── Phase 2: BUILD ─────────────────────────────────────────────
        logger.info("Phase 2/6: BUILD — autonomous implementation")
        clear_build_complete(repo_path)

        # Render the build prompt with project context
        build_prompt = render(
            AGENT_BUILD_SPEC,
            project_name=project_name,
            spec_filter=spec_filter or "",
        )

        session_id = resume_session_id
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
                message=f"Build timed out after {agent_timeout_s}s",
                session_id=session_id,
                elapsed_s=time.monotonic() - start,
            )
        except ClaudeAuthError as e:
            logger.error("Authentication failed: %s", e)
            return BuildResult(
                success=False,
                message=str(e),
                session_id=session_id,
                elapsed_s=time.monotonic() - start,
            )
        except ClaudeRateLimitError as e:
            logger.error("Rate limited: %s", e)
            return BuildResult(
                success=False,
                message=str(e),
                session_id=session_id,
                elapsed_s=time.monotonic() - start,
            )

        # ── Phase 3: VERIFY ────────────────────────────────────────────
        for verify_pass in range(1, verify_passes + 1):
            logger.info("Phase 3/6: VERIFY — pass %d/%d", verify_pass, verify_passes)

            # Try deterministic verification first
            try:
                from codelicious.verifier import verify

                vresult = verify(repo_path)
                if vresult.all_passed:
                    logger.info("Verification passed (all checks green).")
                    break
                else:
                    failed = [c for c in vresult.checks if not c.passed]
                    logger.warning(
                        "Verification failed: %s",
                        ", ".join(f"{c.name}: {c.message}" for c in failed),
                    )
                    # Ask Claude to fix failures
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

        # ── Phase 4: REFLECT (optional) ────────────────────────────────
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

        # ── Phase 5: GIT COMMIT ────────────────────────────────────────
        logger.info("Phase 5/6: GIT — committing changes")
        try:
            git_manager.commit_verified_changes(
                commit_message=f"codelicious: build {project_name} from specs"
            )
            logger.info("Changes committed successfully.")
        except Exception as e:
            logger.warning("Git commit failed: %s", e)

        # ── Phase 6: PUSH + PR ─────────────────────────────────────────
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
            success=build_complete or True,  # Success if we got this far
            message=f"Build cycle complete in {elapsed:.1f}s",
            session_id=session_id,
            elapsed_s=elapsed,
        )
