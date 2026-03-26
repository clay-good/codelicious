"""
Tests for cli.py - CLI orchestration and error handling.

codelicious has ONE command: `codelicious <repo_path>`
No flags. Everything is on by default.
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
    """Create a minimal mock repository directory with a spec file."""
    spec = tmp_path / "spec.md"
    spec.write_text("# Spec\n- [ ] Build the thing\n")
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


def _mock_spec_discovery(*specs):
    """Return mock patches for _walk_for_specs and _discover_incomplete_specs."""
    return (
        mock.patch("codelicious.cli._walk_for_specs", return_value=list(specs)),
        mock.patch("codelicious.cli._discover_incomplete_specs", return_value=list(specs)),
    )


class TestSetupLogger:
    """Tests for the setup_logger function."""

    def test_setup_logger_returns_logger(self):
        """Test that setup_logger returns a logger instance."""
        logger = setup_logger()
        assert isinstance(logger, logging.Logger)
        assert logger.name == "codelicious"


class TestSingleCommand:
    """Tests that codelicious works with just a repo path and nothing else."""

    def test_bare_command_runs_full_pipeline(self, mock_repo: Path, mock_successful_engine, mock_git_manager):
        """Test that `codelicious <repo>` runs the full pipeline."""
        spec_file = mock_repo / "spec.md"
        walk_patch, discover_patch = _mock_spec_discovery(spec_file)

        with mock.patch("codelicious.cli.select_engine", return_value=mock_successful_engine) as mock_select:
            with mock.patch("codelicious.cli.GitManager", return_value=mock_git_manager):
                with mock.patch("codelicious.cli.CacheManager"):
                    with walk_patch, discover_patch:
                        with mock.patch.object(sys, "argv", ["codelicious", str(mock_repo)]):
                            main()

        # Engine auto-detected
        mock_select.assert_called_once_with("auto")

        # Build cycle called with everything ON
        call_kwargs = mock_successful_engine.run_build_cycle.call_args
        assert call_kwargs.kwargs["auto_mode"] is True
        assert call_kwargs.kwargs["orchestrate"] is True
        assert call_kwargs.kwargs["push_pr"] is True
        assert call_kwargs.kwargs["reflect"] is True

        # PR lifecycle is handled by git_orchestrator, not cli.py
        mock_git_manager.transition_pr_to_review.assert_not_called()


class TestErrorHandling:
    """Tests for argument validation and error handling."""

    def test_no_args_exits(self):
        """Test that no arguments causes exit."""
        with mock.patch.object(sys, "argv", ["codelicious"]):
            with pytest.raises(SystemExit) as exc_info:
                main()
            assert exc_info.value.code == 2

    def test_help_flag_exits_zero(self):
        """Test that --help exits with code 0."""
        with mock.patch.object(sys, "argv", ["codelicious", "--help"]):
            with pytest.raises(SystemExit) as exc_info:
                main()
            assert exc_info.value.code == 0

    def test_nonexistent_repo_path_exits(self, tmp_path: Path):
        """Test that a nonexistent repo path causes exit with error."""
        nonexistent_path = tmp_path / "does_not_exist"

        with mock.patch.object(sys, "argv", ["codelicious", str(nonexistent_path)]):
            with pytest.raises(SystemExit) as exc_info:
                main()
            assert exc_info.value.code == 1

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


class TestBuildFailure:
    """Tests for build failure handling."""

    def test_failed_build_exits_with_error(self, mock_repo: Path, mock_failed_engine, mock_git_manager):
        """Test that a failed build result causes exit with code 1."""
        spec_file = mock_repo / "spec.md"
        walk_patch, discover_patch = _mock_spec_discovery(spec_file)

        with mock.patch("codelicious.cli.select_engine", return_value=mock_failed_engine):
            with mock.patch("codelicious.cli.GitManager", return_value=mock_git_manager):
                with mock.patch("codelicious.cli.CacheManager"):
                    with walk_patch, discover_patch:
                        with mock.patch.object(sys, "argv", ["codelicious", str(mock_repo)]):
                            with pytest.raises(SystemExit) as exc_info:
                                main()
                            assert exc_info.value.code == 1

    def test_failed_build_does_not_transition_pr(self, mock_repo: Path, mock_failed_engine, mock_git_manager):
        """Test that a failed build does not attempt PR transition."""
        spec_file = mock_repo / "spec.md"
        walk_patch, discover_patch = _mock_spec_discovery(spec_file)

        with mock.patch("codelicious.cli.select_engine", return_value=mock_failed_engine):
            with mock.patch("codelicious.cli.GitManager", return_value=mock_git_manager):
                with mock.patch("codelicious.cli.CacheManager"):
                    with walk_patch, discover_patch:
                        with mock.patch.object(sys, "argv", ["codelicious", str(mock_repo)]):
                            with pytest.raises(SystemExit):
                                main()

        mock_git_manager.transition_pr_to_review.assert_not_called()


class TestKeyboardInterrupt:
    """Tests for keyboard interrupt handling."""

    def test_keyboard_interrupt_exits_gracefully(self, mock_repo: Path, mock_successful_engine, mock_git_manager):
        """Test that KeyboardInterrupt is caught and exits with code 130."""
        mock_successful_engine.run_build_cycle.side_effect = KeyboardInterrupt()
        spec_file = mock_repo / "spec.md"
        walk_patch, discover_patch = _mock_spec_discovery(spec_file)

        with mock.patch("codelicious.cli.select_engine", return_value=mock_successful_engine):
            with mock.patch("codelicious.cli.GitManager", return_value=mock_git_manager):
                with mock.patch("codelicious.cli.CacheManager"):
                    with walk_patch, discover_patch:
                        with mock.patch.object(sys, "argv", ["codelicious", str(mock_repo)]):
                            with pytest.raises(SystemExit) as exc_info:
                                main()
                            assert exc_info.value.code == 130
