"""
Tests for cli.py - CLI orchestration and error handling.

codelicious has ONE command: `codelicious <repo_path>`
No flags. Everything is on by default.
"""

import io
import logging
import sys
from pathlib import Path
from unittest import mock

import pytest

import codelicious.cli as cli_module
from codelicious.cli import _parse_args, _print_banner, _print_result, _validate_dependencies, main, setup_logger
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

    @pytest.fixture(autouse=True)
    def _skip_dep_validation(self):
        """Skip dependency validation in main() tests — tested separately."""
        with mock.patch("codelicious.cli._validate_dependencies", side_effect=lambda e: e):
            yield

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

        # Build cycle called with orchestrate mode ON
        call_kwargs = mock_successful_engine.run_build_cycle.call_args
        assert call_kwargs.kwargs["orchestrate"] is True
        assert call_kwargs.kwargs["push_pr"] is True
        assert call_kwargs.kwargs["reflect"] is True

        # PR lifecycle is handled by git_orchestrator, not cli.py
        mock_git_manager.transition_pr_to_review.assert_not_called()

    def test_engine_flag_passed_to_select_engine(self, mock_repo: Path, mock_successful_engine, mock_git_manager):
        """Test that --engine flag is forwarded to select_engine."""
        spec_file = mock_repo / "spec.md"
        walk_patch, discover_patch = _mock_spec_discovery(spec_file)

        with mock.patch("codelicious.cli.select_engine", return_value=mock_successful_engine) as mock_select:
            with mock.patch("codelicious.cli.GitManager", return_value=mock_git_manager):
                with mock.patch("codelicious.cli.CacheManager"):
                    with walk_patch, discover_patch:
                        with mock.patch.object(sys, "argv", ["codelicious", str(mock_repo), "--engine", "claude"]):
                            main()

        mock_select.assert_called_once_with("claude")

    def test_engine_env_var_fallback(self, mock_repo: Path, mock_successful_engine, mock_git_manager):
        """Test that CODELICIOUS_ENGINE env var is used when --engine is not passed."""
        spec_file = mock_repo / "spec.md"
        walk_patch, discover_patch = _mock_spec_discovery(spec_file)

        with mock.patch("codelicious.cli.select_engine", return_value=mock_successful_engine) as mock_select:
            with mock.patch("codelicious.cli.GitManager", return_value=mock_git_manager):
                with mock.patch("codelicious.cli.CacheManager"):
                    with walk_patch, discover_patch:
                        with mock.patch.dict("os.environ", {"CODELICIOUS_ENGINE": "huggingface"}):
                            with mock.patch.object(sys, "argv", ["codelicious", str(mock_repo)]):
                                main()

        mock_select.assert_called_once_with("huggingface")

    def test_model_and_timeout_flags(self, mock_repo: Path, mock_successful_engine, mock_git_manager):
        """Test that --model and --agent-timeout are passed to run_build_cycle."""
        spec_file = mock_repo / "spec.md"
        walk_patch, discover_patch = _mock_spec_discovery(spec_file)

        with mock.patch("codelicious.cli.select_engine", return_value=mock_successful_engine):
            with mock.patch("codelicious.cli.GitManager", return_value=mock_git_manager):
                with mock.patch("codelicious.cli.CacheManager"):
                    with walk_patch, discover_patch:
                        with mock.patch.object(
                            sys,
                            "argv",
                            [
                                "codelicious",
                                str(mock_repo),
                                "--model",
                                "claude-sonnet-4-20250514",
                                "--agent-timeout",
                                "600",
                            ],
                        ):
                            main()

        call_kwargs = mock_successful_engine.run_build_cycle.call_args.kwargs
        assert call_kwargs["model"] == "claude-sonnet-4-20250514"
        assert call_kwargs["agent_timeout_s"] == 600


class TestErrorHandling:
    """Tests for argument validation and error handling."""

    @pytest.fixture(autouse=True)
    def _skip_dep_validation(self):
        with mock.patch("codelicious.cli._validate_dependencies", side_effect=lambda e: e):
            yield

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

    @pytest.fixture(autouse=True)
    def _skip_dep_validation(self):
        with mock.patch("codelicious.cli._validate_dependencies", side_effect=lambda e: e):
            yield

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

    @pytest.fixture(autouse=True)
    def _skip_dep_validation(self):
        with mock.patch("codelicious.cli._validate_dependencies", side_effect=lambda e: e):
            yield

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


class TestNoIncompleteSpecsEarlyExit:
    """Test the early-exit path when all specs are already complete (Finding 48)."""

    @pytest.fixture(autouse=True)
    def _skip_dep_validation(self):
        with mock.patch("codelicious.cli._validate_dependencies", side_effect=lambda e: e):
            yield

    def test_no_incomplete_specs_exits_zero_without_build(
        self, mock_repo: Path, mock_successful_engine, mock_git_manager
    ):
        """When _discover_incomplete_specs returns [], main() exits 0 without running engine.run_build_cycle."""
        # Patch both _walk_for_specs (for the banner) and _discover_incomplete_specs (for the guard)
        # to return empty lists, simulating a fully-complete repo.
        with mock.patch("codelicious.cli.select_engine", return_value=mock_successful_engine):
            with mock.patch("codelicious.cli.GitManager", return_value=mock_git_manager):
                with mock.patch("codelicious.cli.CacheManager"):
                    with mock.patch("codelicious.cli._walk_for_specs", return_value=[]):
                        with mock.patch("codelicious.cli._discover_incomplete_specs", return_value=[]):
                            with mock.patch.object(sys, "argv", ["codelicious", str(mock_repo)]):
                                with pytest.raises(SystemExit) as exc_info:
                                    main()

        assert exc_info.value.code == 0
        mock_successful_engine.run_build_cycle.assert_not_called()


class TestPrintBanner:
    """Tests for _print_banner (Finding 51)."""

    def test_print_banner_shows_spec_counts(self, tmp_path: Path):
        """_print_banner prints total, complete, and incomplete spec counts."""
        spec1 = tmp_path / "spec-01.md"
        spec2 = tmp_path / "spec-02.md"

        captured = io.StringIO()
        with mock.patch("codelicious.cli._walk_for_specs", return_value=[spec1, spec2]):
            with mock.patch("sys.stdout", captured):
                _print_banner(
                    repo_path=tmp_path,
                    engine_name="mock-engine",
                    branch="feature/test",
                    all_specs=[spec1, spec2],
                    incomplete_specs=[spec2],
                )

        output = captured.getvalue()
        assert "CODELICIOUS BUILD" in output
        assert "mock-engine" in output
        assert "feature/test" in output
        # Total specs = 2, complete = 1, to build = 1
        assert "2" in output
        assert "1" in output

    def test_print_banner_no_specs(self, tmp_path: Path):
        """_print_banner handles zero specs without division by zero."""
        captured = io.StringIO()
        with mock.patch("sys.stdout", captured):
            _print_banner(
                repo_path=tmp_path,
                engine_name="mock-engine",
                branch="main",
                all_specs=[],
                incomplete_specs=[],
            )

        output = captured.getvalue()
        assert "CODELICIOUS BUILD" in output
        # 0% progress when no specs exist
        assert "0%" in output

    def test_print_banner_lists_incomplete_specs(self, tmp_path: Path):
        """_print_banner lists the specs that still need to be built."""
        spec = tmp_path / "spec-01.md"

        captured = io.StringIO()
        with mock.patch("sys.stdout", captured):
            _print_banner(
                repo_path=tmp_path,
                engine_name="mock-engine",
                branch="feature/test",
                all_specs=[spec],
                incomplete_specs=[spec],
            )

        output = captured.getvalue()
        assert "spec-01.md" in output


class TestPrintResult:
    """Tests for _print_result (Finding 51)."""

    def test_print_result_success(self, tmp_path: Path):
        """_print_result prints BUILD COMPLETE for a successful result."""
        result = BuildResult(success=True, message="Done.", session_id="s1", elapsed_s=5.0)

        captured = io.StringIO()
        with mock.patch("codelicious.cli._walk_for_specs", return_value=[]):
            # _print_result calls _walk_for_specs internally; patch it to avoid filesystem access
            with mock.patch("sys.stdout", captured):
                _print_result(
                    repo_path=tmp_path,
                    result=result,
                    elapsed=5.0,
                    initial_incomplete=1,
                )

        output = captured.getvalue()
        assert "BUILD COMPLETE" in output
        assert "Done." in output

    def test_print_result_failure(self, tmp_path: Path):
        """_print_result prints BUILD FINISHED (with issues) for a failed result."""
        result = BuildResult(success=False, message="Some error.", session_id="s2", elapsed_s=3.0)

        captured = io.StringIO()
        with mock.patch("codelicious.cli._walk_for_specs", return_value=[]):
            with mock.patch("sys.stdout", captured):
                _print_result(
                    repo_path=tmp_path,
                    result=result,
                    elapsed=3.0,
                    initial_incomplete=2,
                )

        output = captured.getvalue()
        assert "BUILD FINISHED" in output
        assert "with issues" in output
        assert "Some error." in output

    def test_print_result_elapsed_time_formatted(self, tmp_path: Path):
        """_print_result formats elapsed time in minutes and seconds for long runs."""
        result = BuildResult(success=True, message="", session_id="s3", elapsed_s=90.0)

        captured = io.StringIO()
        with mock.patch("codelicious.cli._walk_for_specs", return_value=[]):
            with mock.patch("sys.stdout", captured):
                _print_result(
                    repo_path=tmp_path,
                    result=result,
                    elapsed=90.0,
                    initial_incomplete=0,
                )

        output = captured.getvalue()
        # 90 seconds = 1m 30s
        assert "1m" in output
        assert "30s" in output


class TestRunBuildCycleRuntimeError:
    """Tests for run_build_cycle raising an exception during execution (Finding 52)."""

    @pytest.fixture(autouse=True)
    def _skip_dep_validation(self):
        with mock.patch("codelicious.cli._validate_dependencies", side_effect=lambda e: e):
            yield

    def test_runtime_error_during_build_cycle_exits_nonzero(self, mock_repo: Path, mock_git_manager):
        """When run_build_cycle raises RuntimeError, main() exits with code 1."""
        engine = mock.MagicMock()
        engine.name = "mock-engine"
        engine.run_build_cycle.side_effect = RuntimeError("Internal engine error")

        spec_file = mock_repo / "spec.md"
        walk_patch, discover_patch = _mock_spec_discovery(spec_file)

        with mock.patch("codelicious.cli.select_engine", return_value=engine):
            with mock.patch("codelicious.cli.GitManager", return_value=mock_git_manager):
                with mock.patch("codelicious.cli.CacheManager"):
                    with walk_patch, discover_patch:
                        with mock.patch.object(sys, "argv", ["codelicious", str(mock_repo)]):
                            with pytest.raises(SystemExit) as exc_info:
                                main()

        assert exc_info.value.code == 1

    def test_runtime_error_does_not_print_banner_result(self, mock_repo: Path, mock_git_manager):
        """When run_build_cycle raises RuntimeError, _print_result is NOT called."""
        engine = mock.MagicMock()
        engine.name = "mock-engine"
        engine.run_build_cycle.side_effect = RuntimeError("boom")

        spec_file = mock_repo / "spec.md"
        walk_patch, discover_patch = _mock_spec_discovery(spec_file)

        with mock.patch("codelicious.cli.select_engine", return_value=engine):
            with mock.patch("codelicious.cli.GitManager", return_value=mock_git_manager):
                with mock.patch("codelicious.cli.CacheManager"):
                    with walk_patch, discover_patch:
                        with mock.patch("codelicious.cli._print_result") as mock_print_result:
                            with mock.patch.object(sys, "argv", ["codelicious", str(mock_repo)]):
                                with pytest.raises(SystemExit):
                                    main()

        mock_print_result.assert_not_called()


class TestSigtermHandler:
    """Tests for SIGTERM graceful shutdown (spec-18 Phase 1)."""

    def test_sigterm_handler_sets_flag(self):
        """_handle_sigterm sets the _shutdown_requested flag."""
        cli_module._shutdown_requested = False
        with pytest.raises(SystemExit):
            cli_module._handle_sigterm(15, None)
        assert cli_module._shutdown_requested is True
        cli_module._shutdown_requested = False  # cleanup

    def test_sigterm_handler_raises_system_exit_143(self):
        """_handle_sigterm raises SystemExit with code 143."""
        cli_module._shutdown_requested = False
        with pytest.raises(SystemExit) as exc_info:
            cli_module._handle_sigterm(15, None)
        assert exc_info.value.code == 143
        cli_module._shutdown_requested = False  # cleanup

    def test_sigterm_handler_logs_warning(self, caplog):
        """_handle_sigterm logs a WARNING about the signal."""
        cli_module._shutdown_requested = False
        with pytest.raises(SystemExit), caplog.at_level(logging.WARNING):
            cli_module._handle_sigterm(15, None)
        assert any("SIGTERM" in r.message for r in caplog.records)
        cli_module._shutdown_requested = False  # cleanup


class TestValidateDependencies:
    """Tests for startup dependency validation (spec-18 Phase 4)."""

    def test_startup_fails_without_git(self):
        """Missing git should exit with code 1."""
        with mock.patch("shutil.which", return_value=None):
            with pytest.raises(SystemExit) as exc_info:
                _validate_dependencies("auto")
            assert exc_info.value.code == 1

    def test_startup_fails_without_claude_explicit(self):
        """Explicit --engine claude with missing binary should exit."""

        def which_side_effect(name):
            return "/usr/bin/git" if name == "git" else None

        with mock.patch("shutil.which", side_effect=which_side_effect):
            with pytest.raises(SystemExit) as exc_info:
                _validate_dependencies("claude")
            assert exc_info.value.code == 1

    def test_startup_auto_falls_back_to_hf(self):
        """Auto engine with missing claude should fall back to huggingface."""

        def which_side_effect(name):
            return "/usr/bin/git" if name == "git" else None

        with mock.patch("shutil.which", side_effect=which_side_effect):
            with mock.patch.dict("os.environ", {"HF_TOKEN": "hf_test123"}):
                result = _validate_dependencies("auto")
        assert result == "huggingface"

    def test_startup_fails_without_hf_token(self):
        """HuggingFace engine without token should exit."""

        def which_side_effect(name):
            return "/usr/bin/git" if name == "git" else None

        with mock.patch("shutil.which", side_effect=which_side_effect):
            with mock.patch.dict("os.environ", {}, clear=True):
                import os

                os.environ.pop("HF_TOKEN", None)
                os.environ.pop("LLM_API_KEY", None)
                with pytest.raises(SystemExit) as exc_info:
                    _validate_dependencies("huggingface")
                assert exc_info.value.code == 1

    def test_startup_warns_invalid_hf_token_prefix(self, caplog):
        """HF token not starting with 'hf_' should log a warning."""

        def which_side_effect(name):
            return "/usr/bin/git" if name == "git" else None

        with mock.patch("shutil.which", side_effect=which_side_effect):
            with mock.patch.dict("os.environ", {"HF_TOKEN": "invalid_token_123"}):
                with caplog.at_level(logging.WARNING):
                    result = _validate_dependencies("huggingface")
        assert result == "huggingface"
        assert any("hf_" in r.message for r in caplog.records)


class TestCLIArgumentValidation:
    """Tests for CLI argument edge cases (spec-18 Phase 11: TC-3)."""

    def test_invalid_engine_falls_through_to_auto(self):
        """Unknown engine name falls through to auto-detect in select_engine."""
        from codelicious.engines import select_engine

        # With no claude binary and no HF token, any unknown engine raises RuntimeError
        with mock.patch("shutil.which", return_value=None):
            with mock.patch.dict("os.environ", {}, clear=True):
                import os

                os.environ.pop("HF_TOKEN", None)
                os.environ.pop("LLM_API_KEY", None)
                with pytest.raises(RuntimeError, match="No build engine available"):
                    select_engine("invalid")

    def test_non_integer_timeout_exits(self):
        """--agent-timeout with non-integer exits with code 2."""
        with mock.patch.object(sys, "argv", ["codelicious", "/tmp/repo", "--agent-timeout", "abc"]):
            with pytest.raises(SystemExit) as exc_info:
                _parse_args(sys.argv)
            assert exc_info.value.code == 2

    def test_unknown_flag_exits(self):
        """Unknown flag exits with code 2."""
        with mock.patch.object(sys, "argv", ["codelicious", "/tmp/repo", "--unknown-flag"]):
            with pytest.raises(SystemExit) as exc_info:
                _parse_args(sys.argv)
            assert exc_info.value.code == 2

    def test_parse_args_returns_defaults(self):
        """Default values are set when no flags provided."""
        with mock.patch.object(sys, "argv", ["codelicious", "/tmp/repo"]):
            opts = _parse_args(sys.argv)
        assert opts["repo_path"] == "/tmp/repo"
        assert opts["agent_timeout_s"] == 1800
        assert opts["model"] == ""
        assert opts["resume_session_id"] == ""
