"""Tests for ClaudeCodeEngine (spec-08 Phase 1).

Validates that BuildResult.success correctly reflects build outcome based on
the BUILD_COMPLETE sentinel file.
"""

from __future__ import annotations

import pathlib
from unittest import mock

import pytest

from codelicious.engines.claude_engine import ClaudeCodeEngine
from codelicious.engines.base import BuildResult
from codelicious.errors import (
    AgentTimeout,
    ClaudeAuthError,
    ClaudeRateLimitError,
    CodeliciousError,
)


@pytest.fixture
def mock_config():
    """Create a minimal mock config object."""

    class MockConfig:
        model = ""
        effort = ""
        max_turns = 0
        agent_timeout_s = 30
        dry_run = True

    return MockConfig()


@pytest.fixture
def mock_git_manager():
    """Create a mock git manager that does nothing."""
    manager = mock.MagicMock()
    manager.commit_verified_changes.return_value = None
    manager.push_to_origin.return_value = True
    manager.ensure_draft_pr_exists.return_value = None
    manager.transition_pr_to_review.return_value = None
    return manager


@pytest.fixture
def mock_cache_manager():
    """Create a mock cache manager."""
    return mock.MagicMock()


class TestBuildResultSuccess:
    """Tests for BuildResult.success correctness (spec-08 Phase 1)."""

    def test_success_false_when_build_complete_missing(
        self, tmp_path: pathlib.Path, mock_git_manager, mock_cache_manager
    ):
        """BuildResult.success is False when BUILD_COMPLETE is missing.

        This simulates the case where the agent never signals completion.
        """
        # Create the repo structure but no BUILD_COMPLETE file
        codelicious_dir = tmp_path / ".codelicious"
        codelicious_dir.mkdir()

        engine = ClaudeCodeEngine()

        # Mock all the heavy operations at their source modules
        with (
            mock.patch("codelicious.agent_runner.run_agent") as mock_run,
            mock.patch("codelicious.scaffolder.scaffold") as mock_scaffold,
            mock.patch("codelicious.scaffolder.scaffold_claude_dir"),
        ):
            # Mock run_agent to NOT write BUILD_COMPLETE (incomplete build)
            mock_run.return_value = mock.MagicMock(success=True, session_id="test-session", elapsed_s=1.0)
            mock_scaffold.return_value = None

            # Also mock the verifier to avoid ImportError
            with mock.patch("codelicious.verifier.verify") as mock_verify:
                mock_verify.return_value = mock.MagicMock(all_passed=True, checks=[])

                result = engine.run_build_cycle(
                    repo_path=tmp_path,
                    git_manager=mock_git_manager,
                    cache_manager=mock_cache_manager,
                    verify_passes=0,  # Skip verification
                    reflect=False,  # Skip reflection
                    push_pr=False,  # Skip PR
                )

        assert isinstance(result, BuildResult)
        assert result.success is False, "BuildResult.success should be False when BUILD_COMPLETE is missing"

    def test_success_true_when_build_complete_contains_done(
        self, tmp_path: pathlib.Path, mock_git_manager, mock_cache_manager
    ):
        """BuildResult.success is True when BUILD_COMPLETE contains 'DONE'.

        This simulates the case where the agent successfully completes and
        writes the BUILD_COMPLETE sentinel file.
        """
        # Create the repo structure
        codelicious_dir = tmp_path / ".codelicious"
        codelicious_dir.mkdir()

        engine = ClaudeCodeEngine()

        def write_build_complete(*args, **kwargs):
            """Side effect that simulates agent writing BUILD_COMPLETE."""
            build_file = codelicious_dir / "BUILD_COMPLETE"
            build_file.write_text("DONE", encoding="utf-8")
            return mock.MagicMock(success=True, session_id="test-session", elapsed_s=1.0)

        # Mock all the heavy operations at their source modules
        with (
            mock.patch(
                "codelicious.agent_runner.run_agent",
                side_effect=write_build_complete,
            ),
            mock.patch("codelicious.scaffolder.scaffold"),
            mock.patch("codelicious.scaffolder.scaffold_claude_dir"),
        ):
            result = engine.run_build_cycle(
                repo_path=tmp_path,
                git_manager=mock_git_manager,
                cache_manager=mock_cache_manager,
                verify_passes=0,
                reflect=False,
                push_pr=False,
            )

        assert isinstance(result, BuildResult)
        assert result.success is True, "BuildResult.success should be True when BUILD_COMPLETE = 'DONE'"

    def test_success_true_with_case_variations(self, tmp_path: pathlib.Path, mock_git_manager, mock_cache_manager):
        """BuildResult.success is True with case variations of 'done'."""
        codelicious_dir = tmp_path / ".codelicious"
        codelicious_dir.mkdir()

        engine = ClaudeCodeEngine()

        def write_lowercase(*args, **kwargs):
            """Side effect that simulates agent writing lowercase 'done'."""
            build_file = codelicious_dir / "BUILD_COMPLETE"
            build_file.write_text("done", encoding="utf-8")
            return mock.MagicMock(success=True, session_id="test-session", elapsed_s=1.0)

        with (
            mock.patch(
                "codelicious.agent_runner.run_agent",
                side_effect=write_lowercase,
            ),
            mock.patch("codelicious.scaffolder.scaffold"),
            mock.patch("codelicious.scaffolder.scaffold_claude_dir"),
        ):
            result = engine.run_build_cycle(
                repo_path=tmp_path,
                git_manager=mock_git_manager,
                cache_manager=mock_cache_manager,
                verify_passes=0,
                reflect=False,
                push_pr=False,
            )

        assert result.success is True, "BuildResult.success should be True with lowercase 'done'"

    def test_success_false_with_invalid_content(self, tmp_path: pathlib.Path, mock_git_manager, mock_cache_manager):
        """BuildResult.success is False when BUILD_COMPLETE has bad content."""
        codelicious_dir = tmp_path / ".codelicious"
        codelicious_dir.mkdir()

        engine = ClaudeCodeEngine()

        def write_invalid(*args, **kwargs):
            """Side effect that simulates agent writing invalid content."""
            build_file = codelicious_dir / "BUILD_COMPLETE"
            build_file.write_text("IN_PROGRESS", encoding="utf-8")
            return mock.MagicMock(success=True, session_id="test-session", elapsed_s=1.0)

        with (
            mock.patch(
                "codelicious.agent_runner.run_agent",
                side_effect=write_invalid,
            ),
            mock.patch("codelicious.scaffolder.scaffold"),
            mock.patch("codelicious.scaffolder.scaffold_claude_dir"),
        ):
            result = engine.run_build_cycle(
                repo_path=tmp_path,
                git_manager=mock_git_manager,
                cache_manager=mock_cache_manager,
                verify_passes=0,
                reflect=False,
                push_pr=False,
            )

        assert result.success is False, "BuildResult.success should be False when BUILD_COMPLETE != 'DONE'"


class TestRunAgentExceptionHandling:
    """Tests for ClaudeCodeEngine error-handling when run_agent raises (Finding 47).

    Each exception type raised by run_agent during the BUILD phase should produce
    a BuildResult with success=False and a meaningful message.
    """

    def _run_with_exception(
        self,
        tmp_path: pathlib.Path,
        mock_git_manager,
        mock_cache_manager,
        exception: Exception,
    ) -> BuildResult:
        """Helper: run the single-cycle build where run_agent raises the given exception."""
        codelicious_dir = tmp_path / ".codelicious"
        codelicious_dir.mkdir()
        engine = ClaudeCodeEngine()

        with (
            mock.patch("codelicious.agent_runner.run_agent", side_effect=exception),
            mock.patch("codelicious.scaffolder.scaffold"),
            mock.patch("codelicious.scaffolder.scaffold_claude_dir"),
        ):
            return engine.run_build_cycle(
                repo_path=tmp_path,
                git_manager=mock_git_manager,
                cache_manager=mock_cache_manager,
                verify_passes=0,
                reflect=False,
                push_pr=False,
            )

    def test_agent_timeout_returns_failure(self, tmp_path: pathlib.Path, mock_git_manager, mock_cache_manager) -> None:
        """AgentTimeout during BUILD phase produces success=False with timeout message."""
        exc = AgentTimeout("Agent exceeded timeout of 1800s", elapsed_s=1800.5)
        result = self._run_with_exception(tmp_path, mock_git_manager, mock_cache_manager, exc)

        assert isinstance(result, BuildResult)
        assert result.success is False
        assert "timed out" in result.message.lower() or "timeout" in result.message.lower()

    def test_claude_auth_error_returns_failure(
        self, tmp_path: pathlib.Path, mock_git_manager, mock_cache_manager
    ) -> None:
        """ClaudeAuthError during BUILD phase produces success=False with auth error message."""
        exc = ClaudeAuthError("claude CLI not found on PATH.")
        result = self._run_with_exception(tmp_path, mock_git_manager, mock_cache_manager, exc)

        assert isinstance(result, BuildResult)
        assert result.success is False
        assert (
            "claude" in result.message.lower()
            or "auth" in result.message.lower()
            or "not found" in result.message.lower()
        )

    def test_claude_rate_limit_error_returns_failure(
        self, tmp_path: pathlib.Path, mock_git_manager, mock_cache_manager
    ) -> None:
        """ClaudeRateLimitError during BUILD phase produces success=False with RATE_LIMIT prefix."""
        exc = ClaudeRateLimitError("Rate limit exceeded", retry_after_s=65.0)
        result = self._run_with_exception(tmp_path, mock_git_manager, mock_cache_manager, exc)

        assert isinstance(result, BuildResult)
        assert result.success is False
        # The engine encodes rate limit info in the message for auto-mode retry logic
        assert "RATE_LIMIT" in result.message

    def test_codelicious_error_re_raises(self, tmp_path: pathlib.Path, mock_git_manager, mock_cache_manager) -> None:
        """Generic CodeliciousError (non-token) during BUILD phase propagates upward."""
        exc = CodeliciousError("Claude CLI exited with code 1: unexpected error")
        codelicious_dir = tmp_path / ".codelicious"
        codelicious_dir.mkdir()
        engine = ClaudeCodeEngine()

        with (
            mock.patch("codelicious.agent_runner.run_agent", side_effect=exc),
            mock.patch("codelicious.scaffolder.scaffold"),
            mock.patch("codelicious.scaffolder.scaffold_claude_dir"),
        ):
            with pytest.raises(CodeliciousError):
                engine.run_build_cycle(
                    repo_path=tmp_path,
                    git_manager=mock_git_manager,
                    cache_manager=mock_cache_manager,
                    verify_passes=0,
                    reflect=False,
                    push_pr=False,
                )


# ---------------------------------------------------------------------------
# Finding 18 — Continuous mode loop (lines 534-681)
# ---------------------------------------------------------------------------


class TestContinuousModeLoop:
    """Tests for ClaudeCodeEngine auto_mode continuous loop (Finding 18)."""

    def _engine_and_path(self, tmp_path: pathlib.Path):
        """Return a configured engine and ensure .codelicious dir exists."""
        (tmp_path / ".codelicious").mkdir(exist_ok=True)
        return ClaudeCodeEngine(), tmp_path

    def test_rate_limit_triggers_backoff_then_success(
        self, tmp_path: pathlib.Path, mock_git_manager, mock_cache_manager
    ) -> None:
        """Continuous mode backs off on RATE_LIMIT result, then succeeds on retry.

        _run_single_cycle returns RATE_LIMIT on the first call and a
        successful result on the second.  time.sleep must be called with the
        backoff value extracted from the message.  The final BuildResult must
        be success=True.
        """
        engine, repo = self._engine_and_path(tmp_path)

        rate_limit_result = BuildResult(success=False, message="RATE_LIMIT:30.0", session_id="", elapsed_s=0.1)
        success_result = BuildResult(
            success=True, message="Build cycle complete in 1.0s", session_id="s1", elapsed_s=1.0
        )

        call_count = 0

        def fake_single_cycle(**kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return rate_limit_result
            return success_result

        with (
            mock.patch.object(engine, "_run_single_cycle", side_effect=fake_single_cycle),
            mock.patch("codelicious.engines.claude_engine.time.sleep") as mock_sleep,
            mock.patch("codelicious.prompts.scan_remaining_tasks", return_value=0),
            mock.patch("codelicious.prompts.check_build_complete", return_value=True),
        ):
            result = engine.run_build_cycle(
                repo_path=repo,
                git_manager=mock_git_manager,
                cache_manager=mock_cache_manager,
                auto_mode=True,
                max_cycles=5,
                verify_passes=0,
                reflect=False,
                push_pr=False,
            )

        assert result.success is True
        # sleep must have been called with the parsed backoff value (30.0)
        mock_sleep.assert_any_call(30.0)
        assert call_count == 2

    def test_five_consecutive_failures_abort(
        self, tmp_path: pathlib.Path, mock_git_manager, mock_cache_manager
    ) -> None:
        """Continuous mode aborts when consecutive_failures reaches 5 and returns success=False."""
        engine, repo = self._engine_and_path(tmp_path)

        failure_result = BuildResult(success=False, message="hard failure", session_id="", elapsed_s=0.1)

        with (
            mock.patch.object(engine, "_run_single_cycle", return_value=failure_result),
            mock.patch("codelicious.engines.claude_engine.time.sleep"),
            mock.patch("codelicious.prompts.scan_remaining_tasks", return_value=5),
            mock.patch("codelicious.prompts.check_build_complete", return_value=False),
        ):
            result = engine.run_build_cycle(
                repo_path=repo,
                git_manager=mock_git_manager,
                cache_manager=mock_cache_manager,
                auto_mode=True,
                max_cycles=20,
                verify_passes=0,
                reflect=False,
                push_pr=False,
            )

        assert result.success is False
        assert "hard failure" in result.message

    def test_early_exit_when_agent_done_and_no_remaining(
        self, tmp_path: pathlib.Path, mock_git_manager, mock_cache_manager
    ) -> None:
        """Continuous mode exits early (success=True) when agent_done=True and remaining==0."""
        engine, repo = self._engine_and_path(tmp_path)

        success_result = BuildResult(
            success=True, message="Build cycle complete in 1.0s", session_id="s1", elapsed_s=1.0
        )

        with (
            mock.patch.object(engine, "_run_single_cycle", return_value=success_result),
            mock.patch("codelicious.engines.claude_engine.time.sleep"),
            mock.patch("codelicious.prompts.scan_remaining_tasks", return_value=0),
            mock.patch("codelicious.prompts.check_build_complete", return_value=True),
        ):
            result = engine.run_build_cycle(
                repo_path=repo,
                git_manager=mock_git_manager,
                cache_manager=mock_cache_manager,
                auto_mode=True,
                max_cycles=10,
                verify_passes=0,
                reflect=False,
                push_pr=False,
            )

        assert result.success is True
        assert "complete" in result.message.lower()

    def test_token_exhaustion_resets_session_and_continues(
        self, tmp_path: pathlib.Path, mock_git_manager, mock_cache_manager
    ) -> None:
        """TOKEN_EXHAUSTED result causes backoff + fresh session, then loop exits successfully."""
        engine, repo = self._engine_and_path(tmp_path)

        token_result = BuildResult(success=False, message="TOKEN_EXHAUSTED:", session_id="old", elapsed_s=0.1)
        success_result = BuildResult(
            success=True, message="Build cycle complete in 1.0s", session_id="new", elapsed_s=1.0
        )

        call_count = 0

        def fake_single_cycle(**kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return token_result
            return success_result

        with (
            mock.patch.object(engine, "_run_single_cycle", side_effect=fake_single_cycle),
            mock.patch("codelicious.engines.claude_engine.time.sleep") as mock_sleep,
            mock.patch("codelicious.prompts.scan_remaining_tasks", return_value=0),
            mock.patch("codelicious.prompts.check_build_complete", return_value=True),
        ):
            result = engine.run_build_cycle(
                repo_path=repo,
                git_manager=mock_git_manager,
                cache_manager=mock_cache_manager,
                auto_mode=True,
                max_cycles=5,
                verify_passes=0,
                reflect=False,
                push_pr=False,
            )

        assert result.success is True
        mock_sleep.assert_called()
        assert call_count == 2

    def test_max_cycles_exhausted_returns_failure(
        self, tmp_path: pathlib.Path, mock_git_manager, mock_cache_manager
    ) -> None:
        """When max_cycles is reached without completion the result is success=False."""
        engine, repo = self._engine_and_path(tmp_path)

        # Always succeed but remaining tasks never drop to 0 (and agent never signals done)
        partial_result = BuildResult(success=True, message="partial", session_id="", elapsed_s=0.1)

        with (
            mock.patch.object(engine, "_run_single_cycle", return_value=partial_result),
            mock.patch("codelicious.engines.claude_engine.time.sleep"),
            mock.patch("codelicious.prompts.scan_remaining_tasks", return_value=3),
            mock.patch("codelicious.prompts.check_build_complete", return_value=False),
        ):
            result = engine.run_build_cycle(
                repo_path=repo,
                git_manager=mock_git_manager,
                cache_manager=mock_cache_manager,
                auto_mode=True,
                max_cycles=3,
                verify_passes=0,
                reflect=False,
                push_pr=False,
            )

        assert result.success is False
        assert "Continuous mode ended" in result.message


# ---------------------------------------------------------------------------
# Finding 19 — AgentTimeout and token-exhaustion handlers in _run_single_cycle
# ---------------------------------------------------------------------------


class TestSingleCycleErrorHandlers:
    """Tests for _run_single_cycle exception handling (Finding 19).

    These tests exercise the BUILD-phase exception handlers inside
    _run_single_cycle by calling run_build_cycle in single-shot mode
    (auto_mode=False, which is the default).
    """

    def _run_with_run_agent_side_effect(
        self,
        tmp_path: pathlib.Path,
        mock_git_manager,
        mock_cache_manager,
        side_effect,
    ) -> BuildResult:
        """Helper: invoke run_build_cycle in single-shot mode with run_agent raising side_effect."""
        (tmp_path / ".codelicious").mkdir(exist_ok=True)
        engine = ClaudeCodeEngine()

        with (
            mock.patch("codelicious.agent_runner.run_agent", side_effect=side_effect),
            mock.patch("codelicious.scaffolder.scaffold"),
            mock.patch("codelicious.scaffolder.scaffold_claude_dir"),
        ):
            return engine.run_build_cycle(
                repo_path=tmp_path,
                git_manager=mock_git_manager,
                cache_manager=mock_cache_manager,
                verify_passes=0,
                reflect=False,
                push_pr=False,
            )

    def test_agent_timeout_returns_false_with_timeout_message(
        self, tmp_path: pathlib.Path, mock_git_manager, mock_cache_manager
    ) -> None:
        """AgentTimeout during BUILD phase produces success=False with 'timed out' in message."""
        exc = AgentTimeout("Agent exceeded configured timeout.", elapsed_s=1800.0)
        result = self._run_with_run_agent_side_effect(tmp_path, mock_git_manager, mock_cache_manager, exc)

        assert isinstance(result, BuildResult)
        assert result.success is False
        msg_lower = result.message.lower()
        assert "timed out" in msg_lower or "timeout" in msg_lower, f"Expected timeout message, got: {result.message!r}"

    def test_agent_timeout_message_includes_config_timeout(
        self, tmp_path: pathlib.Path, mock_git_manager, mock_cache_manager
    ) -> None:
        """BuildResult message from AgentTimeout references the configured agent_timeout_s value."""
        (tmp_path / ".codelicious").mkdir(exist_ok=True)
        engine = ClaudeCodeEngine()
        exc = AgentTimeout("timed out", elapsed_s=999.0)

        with (
            mock.patch("codelicious.agent_runner.run_agent", side_effect=exc),
            mock.patch("codelicious.scaffolder.scaffold"),
            mock.patch("codelicious.scaffolder.scaffold_claude_dir"),
        ):
            result = engine.run_build_cycle(
                repo_path=tmp_path,
                git_manager=mock_git_manager,
                cache_manager=mock_cache_manager,
                agent_timeout_s=42,
                verify_passes=0,
                reflect=False,
                push_pr=False,
            )

        # The message must mention the configured timeout value
        assert "42" in result.message

    def test_token_limit_exceeded_returns_token_exhausted_prefix(
        self, tmp_path: pathlib.Path, mock_git_manager, mock_cache_manager
    ) -> None:
        """CodeliciousError with 'token limit exceeded' returns TOKEN_EXHAUSTED: prefix."""
        exc = CodeliciousError("token limit exceeded during processing")
        result = self._run_with_run_agent_side_effect(tmp_path, mock_git_manager, mock_cache_manager, exc)

        assert isinstance(result, BuildResult)
        assert result.success is False
        assert result.message.startswith("TOKEN_EXHAUSTED:"), (
            f"Expected TOKEN_EXHAUSTED prefix, got: {result.message!r}"
        )

    def test_token_exhaust_detected_for_various_messages(
        self, tmp_path: pathlib.Path, mock_git_manager, mock_cache_manager
    ) -> None:
        """Token exhaustion is detected for different token-related error messages."""
        token_messages = [
            "token limit exceeded",
            "token exhausted by this request",
            "context window exceeded token budget",
        ]
        for msg in token_messages:
            exc = CodeliciousError(msg)
            result = self._run_with_run_agent_side_effect(tmp_path, mock_git_manager, mock_cache_manager, exc)
            assert result.success is False
            assert result.message.startswith("TOKEN_EXHAUSTED:"), (
                f"Expected TOKEN_EXHAUSTED prefix for message {msg!r}, got: {result.message!r}"
            )

    def test_non_token_codelicious_error_re_raises(
        self, tmp_path: pathlib.Path, mock_git_manager, mock_cache_manager
    ) -> None:
        """CodeliciousError that is NOT token-related propagates out of run_build_cycle."""
        exc = CodeliciousError("network connection reset by peer")
        (tmp_path / ".codelicious").mkdir(exist_ok=True)
        engine = ClaudeCodeEngine()

        with (
            mock.patch("codelicious.agent_runner.run_agent", side_effect=exc),
            mock.patch("codelicious.scaffolder.scaffold"),
            mock.patch("codelicious.scaffolder.scaffold_claude_dir"),
        ):
            with pytest.raises(CodeliciousError, match="network connection reset"):
                engine.run_build_cycle(
                    repo_path=tmp_path,
                    git_manager=mock_git_manager,
                    cache_manager=mock_cache_manager,
                    verify_passes=0,
                    reflect=False,
                    push_pr=False,
                )


# ---------------------------------------------------------------------------
# Finding 20 — Orchestrate mode entry point
# ---------------------------------------------------------------------------


class TestOrchestrateMode:
    """Tests for the orchestrate=True branch in run_build_cycle (Finding 20)."""

    def test_empty_specs_returns_success_with_no_incomplete_message(
        self, tmp_path: pathlib.Path, mock_git_manager, mock_cache_manager
    ) -> None:
        """When _discover_incomplete_specs returns empty list, result is success=True with 'No incomplete specs'."""
        engine = ClaudeCodeEngine()

        with (
            mock.patch("codelicious.engines.claude_engine._discover_incomplete_specs", return_value=[]),
            mock.patch("codelicious.prompts.clear_build_complete"),
        ):
            result = engine.run_build_cycle(
                repo_path=tmp_path,
                git_manager=mock_git_manager,
                cache_manager=mock_cache_manager,
                orchestrate=True,
                verify_passes=0,
                reflect=False,
                push_pr=False,
            )

        assert isinstance(result, BuildResult)
        assert result.success is True
        assert "No incomplete specs" in result.message

    def test_specs_found_runs_orchestrator_and_returns_result(
        self, tmp_path: pathlib.Path, mock_git_manager, mock_cache_manager
    ) -> None:
        """With specs present, Orchestrator.run is called and its result is passed through."""
        from codelicious.orchestrator import OrchestratorResult

        engine = ClaudeCodeEngine()

        fake_spec = tmp_path / "spec.md"
        fake_spec.write_text("- [ ] task one\n", encoding="utf-8")

        orch_result = OrchestratorResult(success=True, message="orchestrator done", elapsed_s=2.5)

        mock_orch = mock.MagicMock()
        mock_orch.run.return_value = orch_result

        with (
            mock.patch("codelicious.engines.claude_engine._discover_incomplete_specs", return_value=[fake_spec]),
            mock.patch("codelicious.prompts.clear_build_complete"),
            mock.patch("codelicious.orchestrator.Orchestrator", return_value=mock_orch),
        ):
            result = engine.run_build_cycle(
                repo_path=tmp_path,
                git_manager=mock_git_manager,
                cache_manager=mock_cache_manager,
                orchestrate=True,
                verify_passes=0,
                reflect=False,
                push_pr=False,
            )

        assert isinstance(result, BuildResult)
        assert result.success is True
        assert result.message == "orchestrator done"
        assert result.elapsed_s == pytest.approx(2.5)
        mock_orch.run.assert_called_once()

    def test_orchestrator_run_receives_specs_and_push_pr(
        self, tmp_path: pathlib.Path, mock_git_manager, mock_cache_manager
    ) -> None:
        """Orchestrator.run is called with the discovered specs and correct push_pr flag."""
        from codelicious.orchestrator import OrchestratorResult

        engine = ClaudeCodeEngine()

        fake_spec_a = tmp_path / "spec-a.md"
        fake_spec_b = tmp_path / "spec-b.md"
        for sp in (fake_spec_a, fake_spec_b):
            sp.write_text("- [ ] task\n", encoding="utf-8")

        orch_result = OrchestratorResult(success=False, message="partial build", elapsed_s=5.0)

        mock_orch = mock.MagicMock()
        mock_orch.run.return_value = orch_result

        with (
            mock.patch(
                "codelicious.engines.claude_engine._discover_incomplete_specs",
                return_value=[fake_spec_a, fake_spec_b],
            ),
            mock.patch("codelicious.prompts.clear_build_complete"),
            mock.patch("codelicious.orchestrator.Orchestrator", return_value=mock_orch),
        ):
            result = engine.run_build_cycle(
                repo_path=tmp_path,
                git_manager=mock_git_manager,
                cache_manager=mock_cache_manager,
                orchestrate=True,
                push_pr=True,
                verify_passes=0,
                reflect=False,
            )

        assert result.success is False
        assert result.message == "partial build"

        call_kwargs = mock_orch.run.call_args
        passed_specs = call_kwargs.kwargs.get("specs") or call_kwargs.args[0]
        assert fake_spec_a in passed_specs
        assert fake_spec_b in passed_specs
        assert call_kwargs.kwargs.get("push_pr") is True

    def test_orchestrate_clears_build_complete_before_scanning(
        self, tmp_path: pathlib.Path, mock_git_manager, mock_cache_manager
    ) -> None:
        """clear_build_complete is invoked before _discover_incomplete_specs in orchestrate mode."""
        engine = ClaudeCodeEngine()
        call_order: list[str] = []

        def fake_clear(_path):
            call_order.append("clear")

        def fake_discover(_path):
            call_order.append("discover")
            return []

        with (
            mock.patch("codelicious.prompts.clear_build_complete", side_effect=fake_clear),
            mock.patch("codelicious.engines.claude_engine._discover_incomplete_specs", side_effect=fake_discover),
        ):
            engine.run_build_cycle(
                repo_path=tmp_path,
                git_manager=mock_git_manager,
                cache_manager=mock_cache_manager,
                orchestrate=True,
                verify_passes=0,
                reflect=False,
                push_pr=False,
            )

        assert call_order == ["clear", "discover"], f"Expected clear before discover, got: {call_order}"


# ---------------------------------------------------------------------------
# Finding 29 — _git_tracked_files error paths
# ---------------------------------------------------------------------------


class TestGitTrackedFiles:
    """Tests for the _git_tracked_files helper error paths (Finding 29).

    The function must return None for any subprocess failure so that callers
    can gracefully fall back to a plain filesystem walk.
    """

    def test_nonzero_returncode_returns_none(self, tmp_path: pathlib.Path) -> None:
        """A non-zero exit code from git ls-files causes the function to return None."""
        from codelicious.engines.claude_engine import _git_tracked_files

        fake_result = mock.MagicMock()
        fake_result.returncode = 128  # git error (not a repo, etc.)
        fake_result.stdout = ""

        with mock.patch("subprocess.run", return_value=fake_result):
            result = _git_tracked_files(tmp_path)

        assert result is None, f"Expected None for non-zero returncode, got {result!r}"

    def test_file_not_found_returns_none(self, tmp_path: pathlib.Path) -> None:
        """FileNotFoundError (git not on PATH) causes the function to return None."""
        from codelicious.engines.claude_engine import _git_tracked_files

        with mock.patch("subprocess.run", side_effect=FileNotFoundError("git not found")):
            result = _git_tracked_files(tmp_path)

        assert result is None, f"Expected None when git binary is missing, got {result!r}"

    def test_timeout_expired_returns_none(self, tmp_path: pathlib.Path) -> None:
        """subprocess.TimeoutExpired causes the function to return None."""
        import subprocess

        from codelicious.engines.claude_engine import _git_tracked_files

        with mock.patch(
            "subprocess.run",
            side_effect=subprocess.TimeoutExpired(cmd=["git", "ls-files"], timeout=15),
        ):
            result = _git_tracked_files(tmp_path)

        assert result is None, f"Expected None on timeout, got {result!r}"

    def test_os_error_returns_none(self, tmp_path: pathlib.Path) -> None:
        """OSError (permission denied, etc.) causes the function to return None."""
        from codelicious.engines.claude_engine import _git_tracked_files

        with mock.patch("subprocess.run", side_effect=OSError("permission denied")):
            result = _git_tracked_files(tmp_path)

        assert result is None, f"Expected None on OSError, got {result!r}"

    def test_success_returns_set_of_paths(self, tmp_path: pathlib.Path) -> None:
        """A zero returncode with valid output returns a set of resolved Path objects."""
        from codelicious.engines.claude_engine import _git_tracked_files

        fake_result = mock.MagicMock()
        fake_result.returncode = 0
        fake_result.stdout = "src/foo.py\0tests/test_foo.py\0"

        with mock.patch("subprocess.run", return_value=fake_result):
            result = _git_tracked_files(tmp_path)

        assert result is not None
        assert isinstance(result, set)
        assert (tmp_path / "src/foo.py").resolve() in result
        assert (tmp_path / "tests/test_foo.py").resolve() in result


# ---------------------------------------------------------------------------
# Finding 63 — _walk_for_specs filesystem traversal
# ---------------------------------------------------------------------------


class TestWalkForSpecs:
    """Tests for the _walk_for_specs filesystem walk (Finding 63).

    The function must return spec-matched files found in ordinary directories
    (e.g. docs/specs/) and silently skip files located inside skipped
    directories (.git/, node_modules/, .codelicious/, etc.).

    Git-tracking is bypassed by patching _git_tracked_files to return None
    so the plain-walk path is exercised regardless of whether the tmp_path is
    actually a git repo.
    """

    def _walk(self, repo_path: pathlib.Path) -> list[pathlib.Path]:
        """Run _walk_for_specs with git tracking disabled."""
        from codelicious.engines.claude_engine import _walk_for_specs

        with mock.patch("codelicious.engines.claude_engine._git_tracked_files", return_value=None):
            return _walk_for_specs(repo_path)

    def test_spec_in_allowed_dir_is_returned(self, tmp_path: pathlib.Path) -> None:
        """A spec file inside docs/specs/ is included in the results."""
        spec_dir = tmp_path / "docs" / "specs"
        spec_dir.mkdir(parents=True)
        spec_file = spec_dir / "spec-01.md"
        spec_file.write_text("- [ ] task\n", encoding="utf-8")

        results = self._walk(tmp_path)

        assert spec_file.resolve() in results

    def test_spec_in_git_dir_is_skipped(self, tmp_path: pathlib.Path) -> None:
        """A spec file inside .git/ must NOT be returned."""
        git_dir = tmp_path / ".git" / "info"
        git_dir.mkdir(parents=True)
        hidden_spec = git_dir / "spec.md"
        hidden_spec.write_text("- [ ] secret\n", encoding="utf-8")

        results = self._walk(tmp_path)

        assert hidden_spec.resolve() not in results

    def test_spec_in_node_modules_is_skipped(self, tmp_path: pathlib.Path) -> None:
        """A spec file inside node_modules/ must NOT be returned."""
        nm_dir = tmp_path / "node_modules" / "some-pkg"
        nm_dir.mkdir(parents=True)
        nm_spec = nm_dir / "spec.md"
        nm_spec.write_text("- [ ] npm task\n", encoding="utf-8")

        results = self._walk(tmp_path)

        assert nm_spec.resolve() not in results

    def test_spec_in_codelicious_dir_is_skipped(self, tmp_path: pathlib.Path) -> None:
        """A spec file inside .codelicious/ must NOT be returned."""
        cl_dir = tmp_path / ".codelicious"
        cl_dir.mkdir(parents=True)
        cl_spec = cl_dir / "spec.md"
        cl_spec.write_text("- [ ] internal task\n", encoding="utf-8")

        results = self._walk(tmp_path)

        assert cl_spec.resolve() not in results

    def test_multiple_allowed_specs_all_returned(self, tmp_path: pathlib.Path) -> None:
        """Multiple spec files in allowed directories are all returned, sorted."""
        docs_dir = tmp_path / "docs" / "specs"
        docs_dir.mkdir(parents=True)
        root_spec = tmp_path / "spec.md"
        nested_spec = docs_dir / "spec-02.md"

        root_spec.write_text("- [ ] root\n", encoding="utf-8")
        nested_spec.write_text("- [ ] nested\n", encoding="utf-8")

        results = self._walk(tmp_path)

        assert root_spec.resolve() in results
        assert nested_spec.resolve() in results
        # Results must be sorted
        assert results == sorted(results)

    def test_non_spec_filenames_are_not_returned(self, tmp_path: pathlib.Path) -> None:
        """Regular .md files whose names do not match spec patterns are excluded."""
        docs_dir = tmp_path / "docs"
        docs_dir.mkdir()
        readme = docs_dir / "README.md"
        readme.write_text("# README\n", encoding="utf-8")

        results = self._walk(tmp_path)

        assert readme.resolve() not in results

    def test_roadmap_and_todo_matched(self, tmp_path: pathlib.Path) -> None:
        """roadmap.md and todo.md are matched by the spec filename pattern."""
        roadmap = tmp_path / "ROADMAP.md"
        todo = tmp_path / "todo.md"
        roadmap.write_text("roadmap\n", encoding="utf-8")
        todo.write_text("todo\n", encoding="utf-8")

        results = self._walk(tmp_path)

        assert roadmap.resolve() in results
        assert todo.resolve() in results

    def test_git_tracked_set_filters_out_untracked_file(self, tmp_path: pathlib.Path) -> None:
        """When git tracking is available, files NOT in the tracked set are excluded."""
        from codelicious.engines.claude_engine import _walk_for_specs

        spec_tracked = tmp_path / "spec-tracked.md"
        spec_untracked = tmp_path / "spec-untracked.md"
        spec_tracked.write_text("- [ ] tracked\n", encoding="utf-8")
        spec_untracked.write_text("- [ ] untracked\n", encoding="utf-8")

        # Only spec_tracked is in the "git-tracked" set
        tracked_set = {spec_tracked.resolve()}
        with mock.patch("codelicious.engines.claude_engine._git_tracked_files", return_value=tracked_set):
            results = _walk_for_specs(tmp_path)

        assert spec_tracked.resolve() in results
        assert spec_untracked.resolve() not in results


# ---------------------------------------------------------------------------
# Finding 64 — _discover_incomplete_specs detection logic
# ---------------------------------------------------------------------------


class TestDiscoverIncompleteSpecs:
    """Tests for _discover_incomplete_specs checkbox and read-error handling (Finding 64).

    The function classifies specs as incomplete when they contain unchecked
    boxes or no boxes at all.  A spec is complete only when every box is
    checked.  Unreadable files must be silently skipped.
    """

    def _discover(self, specs: list[pathlib.Path], repo_path: pathlib.Path) -> list[pathlib.Path]:
        """Call _discover_incomplete_specs with a pre-built spec list (skip walk)."""
        from codelicious.engines.claude_engine import _discover_incomplete_specs

        return _discover_incomplete_specs(repo_path, all_specs=specs)

    def test_unchecked_box_marks_spec_incomplete(self, tmp_path: pathlib.Path) -> None:
        """A spec with at least one unchecked - [ ] box is returned as incomplete."""
        spec = tmp_path / "spec.md"
        spec.write_text("- [ ] do this\n- [x] done that\n", encoding="utf-8")

        result = self._discover([spec], tmp_path)

        assert spec in result

    def test_fully_checked_spec_is_not_returned(self, tmp_path: pathlib.Path) -> None:
        """A spec where every box is checked is treated as complete and excluded."""
        spec = tmp_path / "spec.md"
        spec.write_text("- [x] done A\n- [X] done B\n", encoding="utf-8")

        result = self._discover([spec], tmp_path)

        assert spec not in result

    def test_no_checkboxes_marks_spec_incomplete(self, tmp_path: pathlib.Path) -> None:
        """A spec with no checkboxes at all is treated as incomplete."""
        spec = tmp_path / "spec.md"
        spec.write_text("# Title\n\nSome narrative text, no boxes.\n", encoding="utf-8")

        result = self._discover([spec], tmp_path)

        assert spec in result

    def test_unreadable_file_is_silently_skipped(self, tmp_path: pathlib.Path) -> None:
        """An OSError when reading a spec file must not propagate — the file is just skipped."""
        from codelicious.engines.claude_engine import _discover_incomplete_specs

        bad_spec = tmp_path / "spec-bad.md"
        good_spec = tmp_path / "spec-good.md"
        good_spec.write_text("- [ ] remaining\n", encoding="utf-8")

        # bad_spec does not exist on disk — reading it raises OSError
        result = _discover_incomplete_specs(tmp_path, all_specs=[bad_spec, good_spec])

        # good_spec is incomplete and must appear; bad_spec must not cause a crash
        assert good_spec in result
        assert bad_spec not in result

    def test_mixed_specs_classification(self, tmp_path: pathlib.Path) -> None:
        """Mix of complete, incomplete, and no-box specs produces correct partition."""
        complete_spec = tmp_path / "spec-complete.md"
        incomplete_spec = tmp_path / "spec-incomplete.md"
        no_box_spec = tmp_path / "spec-nobox.md"

        complete_spec.write_text("- [x] done\n- [X] also done\n", encoding="utf-8")
        incomplete_spec.write_text("- [x] done\n- [ ] not yet\n", encoding="utf-8")
        no_box_spec.write_text("# Plan\nJust text.\n", encoding="utf-8")

        result = self._discover([complete_spec, incomplete_spec, no_box_spec], tmp_path)

        assert complete_spec not in result
        assert incomplete_spec in result
        assert no_box_spec in result


# ---------------------------------------------------------------------------
# Finding 65 — VERIFY phase multi-pass loop
# ---------------------------------------------------------------------------


class TestVerifyPhase:
    """Tests for the VERIFY phase in _run_single_cycle (Finding 65).

    The verify loop should call the fix agent whenever verification fails,
    stop after the first passing pass, and gracefully skip when the verifier
    module is not importable.
    """

    def _base_patches(self, tmp_path: pathlib.Path):
        """Return the common set of patches needed for single-cycle tests."""
        (tmp_path / ".codelicious").mkdir(exist_ok=True)
        return [
            mock.patch("codelicious.agent_runner.run_agent"),
            mock.patch("codelicious.scaffolder.scaffold"),
            mock.patch("codelicious.scaffolder.scaffold_claude_dir"),
        ]

    def test_verify_fail_then_pass_calls_fix_agent_once(
        self, tmp_path: pathlib.Path, mock_git_manager, mock_cache_manager
    ) -> None:
        """When verify fails on pass 1 and passes on pass 2, the fix agent is called once.

        Sequence:
          - BUILD phase: run_agent succeeds (call 1)
          - VERIFY pass 1: vresult.all_passed=False → fix agent called (call 2)
          - VERIFY pass 2: vresult.all_passed=True → loop breaks
        """
        (tmp_path / ".codelicious").mkdir(exist_ok=True)
        engine = ClaudeCodeEngine()

        fail_check = mock.MagicMock()
        fail_check.passed = False
        fail_check.name = "tests"
        fail_check.message = "3 failures"

        vresult_fail = mock.MagicMock()
        vresult_fail.all_passed = False
        vresult_fail.checks = [fail_check]

        vresult_pass = mock.MagicMock()
        vresult_pass.all_passed = True
        vresult_pass.checks = []

        run_agent_mock = mock.MagicMock(return_value=mock.MagicMock(success=True, session_id="s1", elapsed_s=1.0))

        with (
            mock.patch("codelicious.agent_runner.run_agent", run_agent_mock),
            mock.patch("codelicious.scaffolder.scaffold"),
            mock.patch("codelicious.scaffolder.scaffold_claude_dir"),
            mock.patch("codelicious.verifier.verify", side_effect=[vresult_fail, vresult_pass]),
        ):
            engine.run_build_cycle(
                repo_path=tmp_path,
                git_manager=mock_git_manager,
                cache_manager=mock_cache_manager,
                verify_passes=3,
                reflect=False,
                push_pr=False,
            )

        # run_agent is called once for BUILD and once for the verify-fix.
        # Any additional calls would be wrong.
        assert run_agent_mock.call_count == 2, (
            f"Expected 2 run_agent calls (build + fix), got {run_agent_mock.call_count}"
        )

    def test_verify_importerror_skips_phase(self, tmp_path: pathlib.Path, mock_git_manager, mock_cache_manager) -> None:
        """When the verifier module cannot be imported, the VERIFY phase is silently skipped.

        The overall cycle must still complete and return a BuildResult.
        """
        (tmp_path / ".codelicious").mkdir(exist_ok=True)
        engine = ClaudeCodeEngine()

        def fake_import(name, *args, **kwargs):
            if name == "codelicious.verifier":
                raise ImportError("verifier not available")
            return original_import(name, *args, **kwargs)

        import builtins

        original_import = builtins.__import__

        run_agent_mock = mock.MagicMock(return_value=mock.MagicMock(success=True, session_id="s1", elapsed_s=1.0))

        with (
            mock.patch("codelicious.agent_runner.run_agent", run_agent_mock),
            mock.patch("codelicious.scaffolder.scaffold"),
            mock.patch("codelicious.scaffolder.scaffold_claude_dir"),
            mock.patch("builtins.__import__", side_effect=fake_import),
        ):
            result = engine.run_build_cycle(
                repo_path=tmp_path,
                git_manager=mock_git_manager,
                cache_manager=mock_cache_manager,
                verify_passes=2,
                reflect=False,
                push_pr=False,
            )

        assert isinstance(result, BuildResult)
        # Only the BUILD call was made — no verify-fix agent calls
        assert run_agent_mock.call_count == 1

    def test_verify_passes_zero_skips_loop_entirely(
        self, tmp_path: pathlib.Path, mock_git_manager, mock_cache_manager
    ) -> None:
        """Setting verify_passes=0 means the VERIFY loop body never executes."""
        (tmp_path / ".codelicious").mkdir(exist_ok=True)
        engine = ClaudeCodeEngine()

        run_agent_mock = mock.MagicMock(return_value=mock.MagicMock(success=True, session_id="s1", elapsed_s=1.0))

        with (
            mock.patch("codelicious.agent_runner.run_agent", run_agent_mock),
            mock.patch("codelicious.scaffolder.scaffold"),
            mock.patch("codelicious.scaffolder.scaffold_claude_dir"),
            mock.patch("codelicious.verifier.verify") as mock_verify,
        ):
            engine.run_build_cycle(
                repo_path=tmp_path,
                git_manager=mock_git_manager,
                cache_manager=mock_cache_manager,
                verify_passes=0,
                reflect=False,
                push_pr=False,
            )

        # verify() must never be called when verify_passes=0
        mock_verify.assert_not_called()
        # run_agent called once for BUILD only
        assert run_agent_mock.call_count == 1

    def test_verify_fix_agent_exception_does_not_abort_cycle(
        self, tmp_path: pathlib.Path, mock_git_manager, mock_cache_manager
    ) -> None:
        """An exception raised by the verify-fix agent is logged and does not abort the cycle."""
        (tmp_path / ".codelicious").mkdir(exist_ok=True)
        engine = ClaudeCodeEngine()

        fail_check = mock.MagicMock()
        fail_check.passed = False
        fail_check.name = "lint"
        fail_check.message = "lint error"

        vresult_fail = mock.MagicMock()
        vresult_fail.all_passed = False
        vresult_fail.checks = [fail_check]

        call_count = 0

        def run_agent_side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                # BUILD phase succeeds
                return mock.MagicMock(success=True, session_id="s1", elapsed_s=1.0)
            # Fix agent raises
            raise RuntimeError("fix agent crashed")

        with (
            mock.patch("codelicious.agent_runner.run_agent", side_effect=run_agent_side_effect),
            mock.patch("codelicious.scaffolder.scaffold"),
            mock.patch("codelicious.scaffolder.scaffold_claude_dir"),
            mock.patch("codelicious.verifier.verify", return_value=vresult_fail),
        ):
            result = engine.run_build_cycle(
                repo_path=tmp_path,
                git_manager=mock_git_manager,
                cache_manager=mock_cache_manager,
                verify_passes=1,
                reflect=False,
                push_pr=False,
            )

        # The cycle must return a result despite the fix agent crashing
        assert isinstance(result, BuildResult)


# ---------------------------------------------------------------------------
# Finding 66 — REFLECT and PR phases
# ---------------------------------------------------------------------------


class TestReflectAndPRPhases:
    """Tests for the REFLECT and PR phases in _run_single_cycle (Finding 66).

    Both phases are explicitly non-fatal: any exception they raise is caught
    and logged.  The overall BuildResult must still be returned regardless.
    """

    def _run_cycle(
        self,
        tmp_path: pathlib.Path,
        mock_git_manager,
        mock_cache_manager,
        *,
        reflect: bool,
        push_pr: bool,
        reflect_side_effect=None,
        pr_side_effect=None,
    ) -> BuildResult:
        """Helper: execute one single-shot cycle with controlled reflect/PR side effects."""
        (tmp_path / ".codelicious").mkdir(exist_ok=True)
        engine = ClaudeCodeEngine()

        # If caller wants the reflect agent to raise, wire it up; otherwise succeed
        run_agent_calls: list[mock.MagicMock] = []
        build_result = mock.MagicMock(success=True, session_id="s1", elapsed_s=1.0)

        def run_agent_dispatcher(*args, **kwargs):
            call_idx = len(run_agent_calls)
            run_agent_calls.append(True)
            if call_idx == 0:
                # First call is always BUILD — succeeds
                return build_result
            # Subsequent calls are reflect / verify-fix agents
            if reflect_side_effect is not None:
                raise reflect_side_effect
            return build_result

        # Wire PR-phase side effect via git_manager
        if pr_side_effect is not None:
            mock_git_manager.ensure_draft_pr_exists.side_effect = pr_side_effect

        with (
            mock.patch("codelicious.agent_runner.run_agent", side_effect=run_agent_dispatcher),
            mock.patch("codelicious.scaffolder.scaffold"),
            mock.patch("codelicious.scaffolder.scaffold_claude_dir"),
            mock.patch("codelicious.verifier.verify", return_value=mock.MagicMock(all_passed=True, checks=[])),
        ):
            return engine.run_build_cycle(
                repo_path=tmp_path,
                git_manager=mock_git_manager,
                cache_manager=mock_cache_manager,
                verify_passes=1,
                reflect=reflect,
                push_pr=push_pr,
            )

    def test_reflect_exception_does_not_abort_cycle(
        self, tmp_path: pathlib.Path, mock_git_manager, mock_cache_manager
    ) -> None:
        """An exception in the REFLECT phase is non-fatal; the cycle still returns a BuildResult."""
        result = self._run_cycle(
            tmp_path,
            mock_git_manager,
            mock_cache_manager,
            reflect=True,
            push_pr=False,
            reflect_side_effect=RuntimeError("reflect crashed"),
        )

        assert isinstance(result, BuildResult)

    def test_reflect_skipped_when_flag_false(
        self, tmp_path: pathlib.Path, mock_git_manager, mock_cache_manager
    ) -> None:
        """When reflect=False, the reflect agent is never called."""
        (tmp_path / ".codelicious").mkdir(exist_ok=True)
        engine = ClaudeCodeEngine()

        run_agent_mock = mock.MagicMock(return_value=mock.MagicMock(success=True, session_id="s1", elapsed_s=1.0))

        with (
            mock.patch("codelicious.agent_runner.run_agent", run_agent_mock),
            mock.patch("codelicious.scaffolder.scaffold"),
            mock.patch("codelicious.scaffolder.scaffold_claude_dir"),
            mock.patch("codelicious.verifier.verify", return_value=mock.MagicMock(all_passed=True, checks=[])),
        ):
            result = engine.run_build_cycle(
                repo_path=tmp_path,
                git_manager=mock_git_manager,
                cache_manager=mock_cache_manager,
                verify_passes=1,
                reflect=False,
                push_pr=False,
            )

        # Only BUILD + possible verify-fix; no reflect call
        assert isinstance(result, BuildResult)
        # run_agent called once (BUILD only; verify passed so no fix agent)
        assert run_agent_mock.call_count == 1

    def test_pr_exception_does_not_abort_cycle(
        self, tmp_path: pathlib.Path, mock_git_manager, mock_cache_manager
    ) -> None:
        """An exception during PR creation is non-fatal; the cycle still returns a BuildResult."""
        result = self._run_cycle(
            tmp_path,
            mock_git_manager,
            mock_cache_manager,
            reflect=False,
            push_pr=True,
            pr_side_effect=RuntimeError("gh CLI not found"),
        )

        assert isinstance(result, BuildResult)

    def test_pr_skipped_when_push_pr_false(self, tmp_path: pathlib.Path, mock_git_manager, mock_cache_manager) -> None:
        """When push_pr=False, ensure_draft_pr_exists is never called."""
        self._run_cycle(
            tmp_path,
            mock_git_manager,
            mock_cache_manager,
            reflect=False,
            push_pr=False,
        )

        mock_git_manager.ensure_draft_pr_exists.assert_not_called()

    def test_pr_called_when_push_pr_true(self, tmp_path: pathlib.Path, mock_git_manager, mock_cache_manager) -> None:
        """When push_pr=True, ensure_draft_pr_exists is called with a spec_summary string."""
        self._run_cycle(
            tmp_path,
            mock_git_manager,
            mock_cache_manager,
            reflect=False,
            push_pr=True,
        )

        mock_git_manager.ensure_draft_pr_exists.assert_called_once()
        call_kwargs = mock_git_manager.ensure_draft_pr_exists.call_args
        # spec_summary should be a non-empty string
        spec_summary = call_kwargs.kwargs.get("spec_summary") or (call_kwargs.args[0] if call_kwargs.args else None)
        assert spec_summary and isinstance(spec_summary, str)


# ---------------------------------------------------------------------------
# Finding 67 — _run_parallel_cycle
# ---------------------------------------------------------------------------


class TestRunParallelCycle:
    """Tests for _run_parallel_cycle spec discovery and dispatch (Finding 67).

    _run_parallel_cycle discovers incomplete specs via _discover_incomplete_specs
    and runs _run_single_cycle for each one.  When the discovery returns an
    empty list it must return a single success result immediately.
    """

    @pytest.fixture
    def engine(self):
        return ClaudeCodeEngine()

    def test_empty_specs_returns_single_success_no_incomplete(
        self, engine: ClaudeCodeEngine, tmp_path: pathlib.Path, mock_git_manager, mock_cache_manager
    ) -> None:
        """When no incomplete specs are found, the return value is [BuildResult(success=True)]
        with a message containing 'No incomplete specs'.
        """
        with mock.patch(
            "codelicious.engines.claude_engine._discover_incomplete_specs",
            return_value=[],
        ):
            results = engine._run_parallel_cycle(
                repo_path=tmp_path,
                git_manager=mock_git_manager,
                project_name="myproject",
                config=mock.MagicMock(),
                verify_passes=0,
                reflect=False,
                push_pr=False,
                max_workers=1,
            )

        assert len(results) == 1
        assert results[0].success is True
        assert "No incomplete specs" in results[0].message

    def test_two_specs_triggers_two_single_cycle_calls(
        self, engine: ClaudeCodeEngine, tmp_path: pathlib.Path, mock_git_manager, mock_cache_manager
    ) -> None:
        """When two incomplete specs are discovered, _run_single_cycle is called once per spec."""
        spec_a = tmp_path / "spec-a.md"
        spec_b = tmp_path / "spec-b.md"
        spec_a.write_text("- [ ] task a\n", encoding="utf-8")
        spec_b.write_text("- [ ] task b\n", encoding="utf-8")

        single_cycle_result = BuildResult(success=True, message="done", session_id="", elapsed_s=0.5)

        with (
            mock.patch(
                "codelicious.engines.claude_engine._discover_incomplete_specs",
                return_value=[spec_a, spec_b],
            ),
            mock.patch.object(engine, "_run_single_cycle", return_value=single_cycle_result) as mock_single,
        ):
            results = engine._run_parallel_cycle(
                repo_path=tmp_path,
                git_manager=mock_git_manager,
                project_name="myproject",
                config=mock.MagicMock(),
                verify_passes=0,
                reflect=False,
                push_pr=False,
                max_workers=1,
            )

        assert mock_single.call_count == 2
        assert len(results) == 2
        assert all(r.success for r in results)

    def test_spec_filter_passed_to_single_cycle(
        self, engine: ClaudeCodeEngine, tmp_path: pathlib.Path, mock_git_manager
    ) -> None:
        """Each _run_single_cycle call receives the matching spec path as spec_filter."""
        spec_a = tmp_path / "spec-a.md"
        spec_b = tmp_path / "spec-b.md"
        spec_a.write_text("- [ ] a\n", encoding="utf-8")
        spec_b.write_text("- [ ] b\n", encoding="utf-8")

        captured_filters: list[str | None] = []

        def capture_single_cycle(**kwargs):
            captured_filters.append(kwargs.get("spec_filter"))
            return BuildResult(success=True, message="ok", session_id="", elapsed_s=0.1)

        with (
            mock.patch(
                "codelicious.engines.claude_engine._discover_incomplete_specs",
                return_value=[spec_a, spec_b],
            ),
            mock.patch.object(engine, "_run_single_cycle", side_effect=capture_single_cycle),
        ):
            engine._run_parallel_cycle(
                repo_path=tmp_path,
                git_manager=mock_git_manager,
                project_name="myproject",
                config=mock.MagicMock(),
                verify_passes=0,
                reflect=False,
                push_pr=False,
                max_workers=1,
            )

        assert str(spec_a) in captured_filters
        assert str(spec_b) in captured_filters

    def test_single_spec_no_parallel_warning(
        self, engine: ClaudeCodeEngine, tmp_path: pathlib.Path, mock_git_manager
    ) -> None:
        """With only one spec, the serial-warning log is not emitted even with max_workers>1."""
        spec = tmp_path / "spec.md"
        spec.write_text("- [ ] single\n", encoding="utf-8")

        with (
            mock.patch(
                "codelicious.engines.claude_engine._discover_incomplete_specs",
                return_value=[spec],
            ),
            mock.patch.object(
                engine,
                "_run_single_cycle",
                return_value=BuildResult(success=True, message="ok", session_id="", elapsed_s=0.1),
            ),
            mock.patch("codelicious.engines.claude_engine.logger") as mock_logger,
        ):
            engine._run_parallel_cycle(
                repo_path=tmp_path,
                git_manager=mock_git_manager,
                project_name="myproject",
                config=mock.MagicMock(),
                verify_passes=0,
                reflect=False,
                push_pr=False,
                max_workers=4,
            )

        # The warning about serial execution should not fire with only one spec
        for call_args in mock_logger.warning.call_args_list:
            assert "serially" not in str(call_args), "Unexpected serial-warning with only one spec"
