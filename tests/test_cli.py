"""
Tests for cli.py - CLI orchestration and error handling.

These tests verify the CLI argument parsing, engine selection delegation,
PR transition error handling, and the overall orchestration logic.
"""

import logging
import sys
from pathlib import Path
from unittest import mock

import pytest

from codelicious.cli import main, setup_logger
from codelicious.engines.base import BuildResult
from codelicious.git.git_orchestrator import GitManager


@pytest.fixture
def mock_repo(tmp_path: Path) -> Path:
    """Create a minimal mock repository directory."""
    return tmp_path


@pytest.fixture
def mock_successful_engine():
    """Create a mock engine that returns a successful build result."""
    engine = mock.MagicMock()
    engine.name = "mock-engine"
    engine.run_build_cycle.return_value = BuildResult(
        success=True,
        message="Build completed successfully",
        session_id="test-123",
        elapsed_s=10.5,
    )
    return engine


@pytest.fixture
def mock_failed_engine():
    """Create a mock engine that returns a failed build result."""
    engine = mock.MagicMock()
    engine.name = "mock-engine"
    engine.run_build_cycle.return_value = BuildResult(
        success=False,
        message="Build failed: test error",
        session_id="test-456",
        elapsed_s=5.0,
    )
    return engine


@pytest.fixture
def mock_git_manager():
    """Create a mock GitManager with proper spec to handle assert_safe_branch."""
    manager = mock.MagicMock(spec=GitManager)
    manager.current_branch = "feature/test"
    return manager


class TestSetupLogger:
    """Tests for the setup_logger function."""

    def test_setup_logger_returns_logger(self):
        """Test that setup_logger returns a logger instance."""
        logger = setup_logger()
        assert isinstance(logger, logging.Logger)
        assert logger.name == "codelicious"


class TestPRTransitionErrorHandling:
    """Tests for PR transition error handling (P1-8 fix)."""

    def test_pr_transition_failure_logs_warning(
        self, mock_repo: Path, mock_successful_engine, mock_git_manager, caplog
    ):
        """Test that PR transition failure logs a warning but doesn't raise.

        This verifies the fix for P1-8: silent exception swallowing.
        """
        mock_git_manager.transition_pr_to_review.side_effect = RuntimeError("GitHub API error: rate limit exceeded")

        with mock.patch("codelicious.cli.select_engine", return_value=mock_successful_engine):
            with mock.patch("codelicious.cli.GitManager", return_value=mock_git_manager):
                with mock.patch("codelicious.cli.CacheManager"):
                    with mock.patch.object(sys, "argv", ["codelicious", str(mock_repo), "--push-pr"]):
                        with caplog.at_level(logging.WARNING):
                            # Should not raise despite the transition error
                            main()

        # Verify warning was logged with the error message
        assert any(
            "PR transition to ready-for-review failed" in record.message and "rate limit exceeded" in record.message
            for record in caplog.records
        )

    def test_pr_transition_success_no_warning(self, mock_repo: Path, mock_successful_engine, mock_git_manager, caplog):
        """Test that successful PR transition does not log a warning."""
        mock_git_manager.transition_pr_to_review.return_value = None

        with mock.patch("codelicious.cli.select_engine", return_value=mock_successful_engine):
            with mock.patch("codelicious.cli.GitManager", return_value=mock_git_manager):
                with mock.patch("codelicious.cli.CacheManager"):
                    with mock.patch.object(sys, "argv", ["codelicious", str(mock_repo), "--push-pr"]):
                        with caplog.at_level(logging.WARNING):
                            main()

        # Verify no warning was logged about PR transition
        assert not any("PR transition to ready-for-review failed" in record.message for record in caplog.records)


class TestArgumentParsing:
    """Tests for CLI argument parsing."""

    def test_missing_repo_path_exits(self, capsys):
        """Test that missing repo path argument causes exit with error."""
        with mock.patch.object(sys, "argv", ["codelicious"]):
            with pytest.raises(SystemExit) as exc_info:
                main()
            # argparse exits with code 2 for missing required arguments
            assert exc_info.value.code == 2

    def test_nonexistent_repo_path_exits(self, tmp_path: Path):
        """Test that a nonexistent repo path causes exit with error."""
        nonexistent_path = tmp_path / "does_not_exist"

        with mock.patch.object(sys, "argv", ["codelicious", str(nonexistent_path)]):
            with pytest.raises(SystemExit) as exc_info:
                main()
            assert exc_info.value.code == 1


class TestEngineSelection:
    """Tests for engine selection delegation."""

    def test_engine_selection_default_uses_auto(self, mock_repo: Path, mock_successful_engine, mock_git_manager):
        """Test that when no --engine flag is passed, auto-detection runs."""
        with mock.patch("codelicious.cli.select_engine", return_value=mock_successful_engine) as mock_select:
            with mock.patch("codelicious.cli.GitManager", return_value=mock_git_manager):
                with mock.patch("codelicious.cli.CacheManager"):
                    with mock.patch.object(sys, "argv", ["codelicious", str(mock_repo)]):
                        main()

        # Verify select_engine was called with "auto" (the default)
        mock_select.assert_called_once_with("auto")

    def test_engine_selection_runtime_error_exits(self, mock_repo: Path):
        """Test that RuntimeError from engine selection causes exit."""
        with mock.patch(
            "codelicious.cli.select_engine",
            side_effect=RuntimeError("No engine available"),
        ):
            with mock.patch.object(sys, "argv", ["codelicious", str(mock_repo)]):
                with pytest.raises(SystemExit) as exc_info:
                    main()
                assert exc_info.value.code == 1


class TestPushPRFlag:
    """Tests for --push-pr flag behavior."""

    def test_push_pr_flag_triggers_git_operations(self, mock_repo: Path, mock_successful_engine, mock_git_manager):
        """Test that --push-pr causes git transition to be called."""
        with mock.patch("codelicious.cli.select_engine", return_value=mock_successful_engine):
            with mock.patch("codelicious.cli.GitManager", return_value=mock_git_manager):
                with mock.patch("codelicious.cli.CacheManager"):
                    with mock.patch.object(sys, "argv", ["codelicious", str(mock_repo), "--push-pr"]):
                        main()

        # Verify transition_pr_to_review was called
        mock_git_manager.transition_pr_to_review.assert_called_once()

    def test_without_push_pr_flag_no_transition(self, mock_repo: Path, mock_successful_engine):
        """Test that without --push-pr, PR transition is not called."""
        # Use a fresh mock to avoid state leakage from other tests
        fresh_git_manager = mock.MagicMock(spec=GitManager)
        fresh_git_manager.current_branch = "feature/test"

        with mock.patch("codelicious.cli.select_engine", return_value=mock_successful_engine):
            with mock.patch("codelicious.cli.GitManager", return_value=fresh_git_manager):
                with mock.patch("codelicious.cli.CacheManager"):
                    with mock.patch.object(sys, "argv", ["codelicious", str(mock_repo)]):
                        main()

        # Verify transition_pr_to_review was NOT called
        fresh_git_manager.transition_pr_to_review.assert_not_called()


class TestBuildFailure:
    """Tests for build failure handling."""

    def test_failed_build_exits_with_error(self, mock_repo: Path, mock_failed_engine, mock_git_manager):
        """Test that a failed build result causes exit with code 1."""
        with mock.patch("codelicious.cli.select_engine", return_value=mock_failed_engine):
            with mock.patch("codelicious.cli.GitManager", return_value=mock_git_manager):
                with mock.patch("codelicious.cli.CacheManager"):
                    with mock.patch.object(sys, "argv", ["codelicious", str(mock_repo)]):
                        with pytest.raises(SystemExit) as exc_info:
                            main()
                        assert exc_info.value.code == 1

    def test_failed_build_does_not_transition_pr(self, mock_repo: Path, mock_failed_engine, mock_git_manager):
        """Test that a failed build does not attempt PR transition."""
        with mock.patch("codelicious.cli.select_engine", return_value=mock_failed_engine):
            with mock.patch("codelicious.cli.GitManager", return_value=mock_git_manager):
                with mock.patch("codelicious.cli.CacheManager"):
                    with mock.patch.object(sys, "argv", ["codelicious", str(mock_repo), "--push-pr"]):
                        with pytest.raises(SystemExit):
                            main()

        # Even with --push-pr, failed build should not attempt transition
        mock_git_manager.transition_pr_to_review.assert_not_called()


class TestKeyboardInterrupt:
    """Tests for keyboard interrupt handling."""

    def test_keyboard_interrupt_exits_gracefully(self, mock_repo: Path, mock_successful_engine, mock_git_manager):
        """Test that KeyboardInterrupt is caught and exits with code 130."""
        mock_successful_engine.run_build_cycle.side_effect = KeyboardInterrupt()

        with mock.patch("codelicious.cli.select_engine", return_value=mock_successful_engine):
            with mock.patch("codelicious.cli.GitManager", return_value=mock_git_manager):
                with mock.patch("codelicious.cli.CacheManager"):
                    with mock.patch.object(sys, "argv", ["codelicious", str(mock_repo)]):
                        with pytest.raises(SystemExit) as exc_info:
                            main()
                        assert exc_info.value.code == 130
