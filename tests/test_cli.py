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
from codelicious.cli import (
    PreFlightResult,
    _detect_platform,
    _ensure_git_credentials_unlocked,
    _parse_args,
    _print_banner,
    _print_result,
    _probe_git_credentials,
    _run_auth_preflight,
    _validate_dependencies,
    main,
    setup_logger,
)
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
    from codelicious.engines.base import ChunkResult

    engine = mock.MagicMock()
    engine.name = "mock-engine"
    engine.run_build_cycle.return_value = BuildResult(
        success=True,
        message="Build completed successfully",
        session_id="test-123",
        elapsed_s=10.5,
    )
    # v2 orchestrator chunk methods
    engine.execute_chunk.return_value = ChunkResult(success=True, files_modified=["src/foo.py"], message="done")
    engine.verify_chunk.return_value = ChunkResult(success=True, message="passed")
    engine.fix_chunk.return_value = ChunkResult(success=True, message="fixed")
    return engine


@pytest.fixture
def mock_failed_engine():
    """Create a mock engine that returns a failed build result."""
    from codelicious.engines.base import ChunkResult

    engine = mock.MagicMock()
    engine.name = "mock-engine"
    engine.run_build_cycle.return_value = BuildResult(
        success=False,
        message="Build failed: test error",
        session_id="test-456",
        elapsed_s=5.0,
    )
    # v2 orchestrator chunk methods
    engine.execute_chunk.return_value = ChunkResult(success=False, message="failed")
    engine.verify_chunk.return_value = ChunkResult(success=False, message="failed")
    engine.fix_chunk.return_value = ChunkResult(success=False, message="failed")
    return engine


@pytest.fixture
def mock_git_manager():
    """Create a mock GitManager with proper spec to handle assert_safe_branch."""
    manager = mock.MagicMock(spec=GitManager)
    manager.current_branch = "feature/test"
    # v2 orchestrator return values
    manager.push_to_origin.return_value = mock.MagicMock(success=True, error_type=None, message="")
    manager.commit_chunk.return_value = mock.MagicMock(success=True, sha="abc1234", message="ok")
    manager.get_pr_commit_count.return_value = 0
    manager.get_pr_diff_loc.return_value = 0
    manager.ensure_draft_pr_exists.return_value = 42
    manager.revert_chunk_changes.return_value = True
    return manager


def _mock_spec_discovery(*specs):
    """Return mock patches for walk_for_specs and discover_incomplete_specs."""
    return (
        mock.patch("codelicious.cli.walk_for_specs", return_value=list(specs)),
        mock.patch("codelicious.cli.discover_incomplete_specs", return_value=list(specs)),
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
            with mock.patch(
                "codelicious.cli._run_auth_preflight",
                return_value=PreFlightResult(platform="github", authenticated_user="test", cli_tool="gh", skipped=True),
            ):
                yield

    def test_bare_command_runs_full_pipeline(self, mock_repo: Path, mock_successful_engine, mock_git_manager):
        """Test that `codelicious <repo>` runs the v2 chunk-based pipeline."""
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

        # v2 orchestrator calls execute_chunk on the engine (not run_build_cycle)
        mock_successful_engine.execute_chunk.assert_called()

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
        """Test that --model and --agent-timeout are parsed correctly."""
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

        # V2 orchestrator was invoked (execute_chunk called)
        mock_successful_engine.execute_chunk.assert_called()


class TestErrorHandling:
    """Tests for argument validation and error handling."""

    @pytest.fixture(autouse=True)
    def _skip_dep_validation(self):
        with mock.patch("codelicious.cli._validate_dependencies", side_effect=lambda e: e):
            with mock.patch(
                "codelicious.cli._run_auth_preflight",
                return_value=PreFlightResult(platform="github", authenticated_user="test", cli_tool="gh", skipped=True),
            ):
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
        with (
            mock.patch(
                "codelicious.cli.select_engine",
                side_effect=RuntimeError("No engine available"),
            ),
            mock.patch.object(sys, "argv", ["codelicious", str(mock_repo)]),
        ):
            with pytest.raises(SystemExit) as exc_info:
                main()
            assert exc_info.value.code == 1


class TestBuildFailure:
    """Tests for build failure handling."""

    @pytest.fixture(autouse=True)
    def _skip_dep_validation(self):
        with mock.patch("codelicious.cli._validate_dependencies", side_effect=lambda e: e):
            with mock.patch(
                "codelicious.cli._run_auth_preflight",
                return_value=PreFlightResult(platform="github", authenticated_user="test", cli_tool="gh", skipped=True),
            ):
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
            with mock.patch(
                "codelicious.cli._run_auth_preflight",
                return_value=PreFlightResult(platform="github", authenticated_user="test", cli_tool="gh", skipped=True),
            ):
                yield

    def test_keyboard_interrupt_exits_gracefully(self, mock_repo: Path, mock_successful_engine, mock_git_manager):
        """Test that KeyboardInterrupt is caught and exits with code 130."""
        mock_successful_engine.execute_chunk.side_effect = KeyboardInterrupt()
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
            with mock.patch(
                "codelicious.cli._run_auth_preflight",
                return_value=PreFlightResult(platform="github", authenticated_user="test", cli_tool="gh", skipped=True),
            ):
                yield

    def test_no_incomplete_specs_exits_zero_without_build(
        self, mock_repo: Path, mock_successful_engine, mock_git_manager
    ):
        """When discover_incomplete_specs returns [], main() exits 0 without running engine.run_build_cycle."""
        # Patch both walk_for_specs (for the banner) and discover_incomplete_specs (for the guard)
        # to return empty lists, simulating a fully-complete repo.
        with mock.patch("codelicious.cli.select_engine", return_value=mock_successful_engine):
            with mock.patch("codelicious.cli.GitManager", return_value=mock_git_manager):
                with mock.patch("codelicious.cli.CacheManager"):
                    with mock.patch("codelicious.cli.walk_for_specs", return_value=[]):
                        with mock.patch("codelicious.cli.discover_incomplete_specs", return_value=[]):
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
        with mock.patch("codelicious.cli.walk_for_specs", return_value=[spec1, spec2]):
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
        with mock.patch("codelicious.cli.walk_for_specs", return_value=[]):
            # _print_result calls walk_for_specs internally; patch it to avoid filesystem access
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
        with mock.patch("codelicious.cli.walk_for_specs", return_value=[]), mock.patch("sys.stdout", captured):
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
        with mock.patch("codelicious.cli.walk_for_specs", return_value=[]), mock.patch("sys.stdout", captured):
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
    """Tests for engine raising an exception during execution (Finding 52)."""

    @pytest.fixture(autouse=True)
    def _skip_dep_validation(self):
        with mock.patch("codelicious.cli._validate_dependencies", side_effect=lambda e: e):
            with mock.patch(
                "codelicious.cli._run_auth_preflight",
                return_value=PreFlightResult(platform="github", authenticated_user="test", cli_tool="gh", skipped=True),
            ):
                yield

    def test_runtime_error_during_build_cycle_exits_nonzero(self, mock_repo: Path, mock_git_manager):
        """When execute_chunk raises RuntimeError, main() exits with code 1."""
        engine = mock.MagicMock()
        engine.name = "mock-engine"
        engine.execute_chunk.side_effect = RuntimeError("Internal engine error")

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
        """When execute_chunk raises RuntimeError, _print_result is NOT called."""
        engine = mock.MagicMock()
        engine.name = "mock-engine"
        engine.execute_chunk.side_effect = RuntimeError("boom")

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

    def test_sigterm_handler_raises_system_exit_143(self):
        """_handle_sigterm raises SystemExit with code 143."""
        with pytest.raises(SystemExit) as exc_info:
            cli_module._handle_sigterm(15, None)
        assert exc_info.value.code == 143

    def test_sigterm_handler_logs_warning(self, caplog):
        """_handle_sigterm logs a WARNING about the signal."""
        with pytest.raises(SystemExit), caplog.at_level(logging.WARNING):
            cli_module._handle_sigterm(15, None)
        assert any("SIGTERM" in r.message for r in caplog.records)


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
        with mock.patch("shutil.which", return_value=None), mock.patch.dict("os.environ", {}, clear=True):
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

    def test_negative_timeout_accepted(self):
        """Negative --agent-timeout is accepted as integer (validation is at runtime, not parse time)."""
        # _parse_args accepts any integer — it doesn't validate the range
        with mock.patch.object(sys, "argv", ["codelicious", "/tmp/repo", "--agent-timeout", "-1"]):
            opts = _parse_args(sys.argv)
        assert opts["agent_timeout_s"] == -1

    def test_resume_with_huggingface_engine_accepted(self):
        """--resume with --engine huggingface is accepted at parse time (engines handle it)."""
        with mock.patch.object(
            sys,
            "argv",
            ["codelicious", "/tmp/repo", "--resume", "sess-123", "--engine", "huggingface"],
        ):
            opts = _parse_args(sys.argv)
        assert opts["resume_session_id"] == "sess-123"
        assert opts["engine"] == "huggingface"

    def test_skip_auth_check_flag_parsed(self):
        """--skip-auth-check sets skip_auth_check=True."""
        with mock.patch.object(sys, "argv", ["codelicious", "/tmp/repo", "--skip-auth-check"]):
            opts = _parse_args(sys.argv)
        assert opts["skip_auth_check"] is True

    def test_skip_auth_check_default_false(self):
        """skip_auth_check defaults to False."""
        with mock.patch.object(sys, "argv", ["codelicious", "/tmp/repo"]):
            opts = _parse_args(sys.argv)
        assert opts["skip_auth_check"] is False


# ---------------------------------------------------------------------------
# spec-27 Phase 0.1 — _detect_platform
# ---------------------------------------------------------------------------


class TestDetectPlatform:
    """spec-27 Phase 0.1: _detect_platform identifies GitHub vs GitLab from remote URL."""

    def test_github_url(self, tmp_path: Path) -> None:
        """GitHub remote URL returns 'github'."""
        result = mock.MagicMock()
        result.returncode = 0
        result.stdout = "git@github.com:user/repo.git\n"
        with mock.patch("subprocess.run", return_value=result):
            assert _detect_platform(tmp_path) == "github"

    def test_gitlab_url(self, tmp_path: Path) -> None:
        """GitLab remote URL returns 'gitlab'."""
        result = mock.MagicMock()
        result.returncode = 0
        result.stdout = "git@gitlab.com:user/repo.git\n"
        with mock.patch("subprocess.run", return_value=result):
            assert _detect_platform(tmp_path) == "gitlab"

    def test_unknown_url(self, tmp_path: Path) -> None:
        """Unrecognized remote URL returns 'unknown'."""
        result = mock.MagicMock()
        result.returncode = 0
        result.stdout = "git@bitbucket.org:user/repo.git\n"
        with mock.patch("subprocess.run", return_value=result):
            assert _detect_platform(tmp_path) == "unknown"

    def test_no_remote(self, tmp_path: Path) -> None:
        """When git remote fails, returns 'unknown'."""
        result = mock.MagicMock()
        result.returncode = 1
        result.stdout = ""
        with mock.patch("subprocess.run", return_value=result):
            assert _detect_platform(tmp_path) == "unknown"


# ---------------------------------------------------------------------------
# spec-27 Phase 0.1 — _run_auth_preflight
# ---------------------------------------------------------------------------


class TestRunAuthPreflight:
    """spec-27 Phase 0.1: _run_auth_preflight validates gh/glab auth."""

    def test_skip_returns_immediately(self, tmp_path: Path) -> None:
        """When skip=True, returns PreFlightResult with skipped=True."""
        result = _run_auth_preflight(tmp_path, skip=True)
        assert result.skipped is True
        assert result.platform == "unknown"

    def test_github_authenticated(self, tmp_path: Path) -> None:
        """When gh is installed and authenticated, returns success."""
        auth_result = mock.MagicMock()
        auth_result.returncode = 0
        auth_result.stdout = "  Logged in to github.com account testuser (keyring)\n"
        auth_result.stderr = ""

        with mock.patch("codelicious.cli._detect_platform", return_value="github"):
            with mock.patch("shutil.which", return_value="/usr/bin/gh"):
                with mock.patch("subprocess.run", return_value=auth_result):
                    result = _run_auth_preflight(tmp_path, skip=False)

        assert result.platform == "github"
        assert result.authenticated_user == "testuser"
        assert result.cli_tool == "gh"
        assert result.skipped is False

    def test_github_gh_not_installed_exits(self, tmp_path: Path) -> None:
        """When gh is not installed, exits with code 1."""
        with mock.patch("codelicious.cli._detect_platform", return_value="github"):
            with mock.patch("shutil.which", return_value=None):
                with pytest.raises(SystemExit) as exc_info:
                    _run_auth_preflight(tmp_path, skip=False)
                assert exc_info.value.code == 1

    def test_gitlab_glab_not_installed_exits(self, tmp_path: Path) -> None:
        """When glab is not installed for GitLab repo, exits with code 1."""
        with mock.patch("codelicious.cli._detect_platform", return_value="gitlab"):
            with mock.patch("shutil.which", return_value=None):
                with pytest.raises(SystemExit) as exc_info:
                    _run_auth_preflight(tmp_path, skip=False)
                assert exc_info.value.code == 1

    def test_github_not_authed_triggers_login(self, tmp_path: Path) -> None:
        """When gh is installed but not authed, triggers gh auth login."""
        not_authed = mock.MagicMock()
        not_authed.returncode = 1
        not_authed.stdout = ""
        not_authed.stderr = "You are not logged in"

        login_result = mock.MagicMock()
        login_result.returncode = 0

        post_login_auth = mock.MagicMock()
        post_login_auth.returncode = 0
        post_login_auth.stdout = "Logged in to github.com account freshuser"
        post_login_auth.stderr = ""

        call_count = {"n": 0}

        def fake_subprocess_run(args, **kw):
            call_count["n"] += 1
            if args[:3] == ["gh", "auth", "status"]:
                # First call: not authed; second call: authed
                return not_authed if call_count["n"] <= 1 else post_login_auth
            if args[:3] == ["gh", "auth", "login"]:
                return login_result
            return mock.MagicMock(returncode=0)

        with mock.patch("codelicious.cli._detect_platform", return_value="github"):
            with mock.patch("shutil.which", return_value="/usr/bin/gh"):
                with mock.patch("subprocess.run", side_effect=fake_subprocess_run):
                    result = _run_auth_preflight(tmp_path, skip=False)

        assert result.platform == "github"
        assert result.authenticated_user == "freshuser"

    def test_preflight_result_dataclass(self) -> None:
        """PreFlightResult is frozen and has expected fields."""
        r = PreFlightResult(platform="github", authenticated_user="me", cli_tool="gh", skipped=False)
        assert r.platform == "github"
        assert r.authenticated_user == "me"
        assert r.cli_tool == "gh"
        assert r.skipped is False


# ---------------------------------------------------------------------------
# spec-27 Phase 1.1 — New CLI flags
# ---------------------------------------------------------------------------


class TestNewCLIFlags:
    """spec-27 Phase 1.1: --dry-run, --spec, --max-commits-per-pr, --platform flags."""

    def test_dry_run_flag(self):
        """--dry-run sets dry_run=True."""
        with mock.patch.object(sys, "argv", ["codelicious", "/tmp/repo", "--dry-run"]):
            opts = _parse_args(sys.argv)
        assert opts["dry_run"] is True

    def test_dry_run_default_false(self):
        """dry_run defaults to False."""
        with mock.patch.object(sys, "argv", ["codelicious", "/tmp/repo"]):
            opts = _parse_args(sys.argv)
        assert opts["dry_run"] is False

    def test_spec_flag(self):
        """--spec sets spec to the given path."""
        with mock.patch.object(sys, "argv", ["codelicious", "/tmp/repo", "--spec", "docs/specs/feature.md"]):
            opts = _parse_args(sys.argv)
        assert opts["spec"] == "docs/specs/feature.md"

    def test_spec_default_empty(self):
        """spec defaults to empty string."""
        with mock.patch.object(sys, "argv", ["codelicious", "/tmp/repo"]):
            opts = _parse_args(sys.argv)
        assert opts["spec"] == ""

    def test_max_commits_per_pr_flag(self):
        """--max-commits-per-pr sets the value as integer."""
        with mock.patch.object(sys, "argv", ["codelicious", "/tmp/repo", "--max-commits-per-pr", "75"]):
            opts = _parse_args(sys.argv)
        assert opts["max_commits_per_pr"] == 75

    def test_max_commits_per_pr_default_8(self):
        """max_commits_per_pr defaults to 8 (spec 28: bite-sized PRs)."""
        with mock.patch.object(sys, "argv", ["codelicious", "/tmp/repo"]):
            opts = _parse_args(sys.argv)
        assert opts["max_commits_per_pr"] == 8

    def test_max_commits_per_pr_over_100_exits(self):
        """--max-commits-per-pr > 100 exits with code 2."""
        with mock.patch.object(sys, "argv", ["codelicious", "/tmp/repo", "--max-commits-per-pr", "101"]):
            with pytest.raises(SystemExit) as exc_info:
                _parse_args(sys.argv)
            assert exc_info.value.code == 2

    def test_max_commits_per_pr_zero_exits(self):
        """--max-commits-per-pr 0 exits with code 2."""
        with mock.patch.object(sys, "argv", ["codelicious", "/tmp/repo", "--max-commits-per-pr", "0"]):
            with pytest.raises(SystemExit) as exc_info:
                _parse_args(sys.argv)
            assert exc_info.value.code == 2

    def test_continuous_default_false(self):
        """continuous defaults to False (spec 28 Phase 3.1)."""
        with mock.patch.object(sys, "argv", ["codelicious", "/tmp/repo"]):
            opts = _parse_args(sys.argv)
        assert opts["continuous"] is False
        assert opts["cycle_sleep_s"] == 60

    def test_continuous_flag_sets_true(self):
        """--continuous sets the flag to True."""
        with mock.patch.object(sys, "argv", ["codelicious", "/tmp/repo", "--continuous"]):
            opts = _parse_args(sys.argv)
        assert opts["continuous"] is True

    def test_cycle_sleep_s_accepts_value(self):
        """--cycle-sleep-s 30 sets cycle_sleep_s to 30."""
        with mock.patch.object(sys, "argv", ["codelicious", "/tmp/repo", "--cycle-sleep-s", "30"]):
            opts = _parse_args(sys.argv)
        assert opts["cycle_sleep_s"] == 30

    def test_cycle_sleep_s_zero_allowed(self):
        """--cycle-sleep-s 0 is accepted (no sleep between cycles)."""
        with mock.patch.object(sys, "argv", ["codelicious", "/tmp/repo", "--cycle-sleep-s", "0"]):
            opts = _parse_args(sys.argv)
        assert opts["cycle_sleep_s"] == 0

    def test_cycle_sleep_s_over_3600_exits(self):
        """--cycle-sleep-s > 3600 exits with code 2."""
        with mock.patch.object(sys, "argv", ["codelicious", "/tmp/repo", "--cycle-sleep-s", "3601"]):
            with pytest.raises(SystemExit) as exc_info:
                _parse_args(sys.argv)
            assert exc_info.value.code == 2

    def test_platform_github(self):
        """--platform github is accepted."""
        with mock.patch.object(sys, "argv", ["codelicious", "/tmp/repo", "--platform", "github"]):
            opts = _parse_args(sys.argv)
        assert opts["platform"] == "github"

    def test_platform_gitlab(self):
        """--platform gitlab is accepted."""
        with mock.patch.object(sys, "argv", ["codelicious", "/tmp/repo", "--platform", "gitlab"]):
            opts = _parse_args(sys.argv)
        assert opts["platform"] == "gitlab"

    def test_platform_auto_default(self):
        """platform defaults to 'auto'."""
        with mock.patch.object(sys, "argv", ["codelicious", "/tmp/repo"]):
            opts = _parse_args(sys.argv)
        assert opts["platform"] == "auto"

    def test_platform_invalid_exits(self):
        """--platform with an invalid value exits with code 2."""
        with mock.patch.object(sys, "argv", ["codelicious", "/tmp/repo", "--platform", "bitbucket"]):
            with pytest.raises(SystemExit) as exc_info:
                _parse_args(sys.argv)
            assert exc_info.value.code == 2


# ---------------------------------------------------------------------------
# spec 28 Phase 4.1 — _probe_git_credentials
# ---------------------------------------------------------------------------


class TestProbeGitCredentials:
    """spec 28 Phase 4.1: _probe_git_credentials inspects push transport + cred state."""

    @staticmethod
    def _result(rc: int, stdout: str = "", stderr: str = "") -> mock.MagicMock:
        r = mock.MagicMock()
        r.returncode = rc
        r.stdout = stdout
        r.stderr = stderr
        return r

    def test_https_repo_skips_ssh_probe(self, tmp_path: Path) -> None:
        """HTTPS remote: ssh_key_loaded defaults to True (probe skipped)."""
        cls = self.__class__

        def fake_run(args, **kw):
            if args[:2] == ["git", "-C"] and "remote.origin.url" in args:
                return cls._result(0, "https://github.com/o/r.git\n")
            if args[:2] == ["git", "-C"] and "commit.gpgsign" in args:
                return cls._result(1, "")
            raise AssertionError(f"unexpected call {args}")

        with mock.patch("subprocess.run", side_effect=fake_run):
            info = _probe_git_credentials(tmp_path)

        assert info["transport"] == "https"
        assert info["ssh_key_loaded"] is True
        assert info["gpg_signing"] is False
        assert info["gpg_agent_warm"] is True

    def test_ssh_repo_with_loaded_key(self, tmp_path: Path) -> None:
        """SSH remote with a loaded key → ssh_key_loaded True."""
        cls = self.__class__

        def fake_run(args, **kw):
            if args[:2] == ["git", "-C"] and "remote.origin.url" in args:
                return cls._result(0, "git@github.com:o/r.git\n")
            if args[:2] == ["git", "-C"] and "commit.gpgsign" in args:
                return cls._result(1, "")
            if args[0] == "ssh-add":
                return cls._result(0, "2048 SHA256:abc /Users/x/.ssh/id_rsa (RSA)\n")
            raise AssertionError(f"unexpected call {args}")

        with mock.patch("subprocess.run", side_effect=fake_run):
            info = _probe_git_credentials(tmp_path)

        assert info["transport"] == "ssh"
        assert info["ssh_key_loaded"] is True

    def test_ssh_repo_with_no_keys(self, tmp_path: Path) -> None:
        """SSH remote with no agent keys → ssh_key_loaded False."""
        cls = self.__class__

        def fake_run(args, **kw):
            if args[:2] == ["git", "-C"] and "remote.origin.url" in args:
                return cls._result(0, "ssh://git@github.com/o/r.git\n")
            if args[:2] == ["git", "-C"] and "commit.gpgsign" in args:
                return cls._result(1, "")
            if args[0] == "ssh-add":
                return cls._result(1, "", "The agent has no identities.\n")
            raise AssertionError(f"unexpected call {args}")

        with mock.patch("subprocess.run", side_effect=fake_run):
            info = _probe_git_credentials(tmp_path)

        assert info["transport"] == "ssh"
        assert info["ssh_key_loaded"] is False

    def test_gpgsign_true_with_warm_agent(self, tmp_path: Path) -> None:
        """commit.gpgsign=true + secret keys present → gpg_agent_warm True."""
        cls = self.__class__

        def fake_run(args, **kw):
            if args[:2] == ["git", "-C"] and "remote.origin.url" in args:
                return cls._result(0, "https://github.com/o/r.git\n")
            if args[:2] == ["git", "-C"] and "commit.gpgsign" in args:
                return cls._result(0, "true\n")
            if args[0] == "gpg":
                return cls._result(0, "sec:u:4096:1:ABCDEF...\n")
            raise AssertionError(f"unexpected call {args}")

        with mock.patch("subprocess.run", side_effect=fake_run):
            info = _probe_git_credentials(tmp_path)

        assert info["gpg_signing"] is True
        assert info["gpg_agent_warm"] is True

    def test_gpgsign_false_short_circuits_gpg_probe(self, tmp_path: Path) -> None:
        """gpgsign=false → gpg_agent_warm True without invoking gpg."""
        cls = self.__class__
        gpg_called = {"n": 0}

        def fake_run(args, **kw):
            if args[0] == "gpg":
                gpg_called["n"] += 1
                return cls._result(0, "")
            if args[:2] == ["git", "-C"] and "remote.origin.url" in args:
                return cls._result(0, "https://github.com/o/r.git\n")
            if args[:2] == ["git", "-C"] and "commit.gpgsign" in args:
                return cls._result(0, "false\n")
            raise AssertionError(f"unexpected call {args}")

        with mock.patch("subprocess.run", side_effect=fake_run):
            info = _probe_git_credentials(tmp_path)

        assert info["gpg_signing"] is False
        assert info["gpg_agent_warm"] is True
        assert gpg_called["n"] == 0

    def test_subprocess_failures_use_conservative_defaults(self, tmp_path: Path) -> None:
        """Any OSError/timeout falls back to conservative defaults (don't auto-skip prompts)."""
        with mock.patch("subprocess.run", side_effect=OSError("nope")):
            info = _probe_git_credentials(tmp_path)

        assert info["transport"] == "unknown"
        assert info["gpg_signing"] is False
        # transport is unknown (not ssh) so ssh_key_loaded defaults True
        assert info["ssh_key_loaded"] is True
        # gpg_signing is False so gpg_agent_warm defaults True
        assert info["gpg_agent_warm"] is True


# ---------------------------------------------------------------------------
# spec 28 Phase 4.2 — _ensure_git_credentials_unlocked
# ---------------------------------------------------------------------------


class TestEnsureGitCredentialsUnlocked:
    """spec 28 Phase 4.2: interactive prompt when SSH/GPG agents are locked."""

    def test_skip_short_circuits(self, tmp_path: Path) -> None:
        """skip=True returns immediately without probing or prompting."""
        with mock.patch("codelicious.cli._probe_git_credentials") as probe:
            result = _ensure_git_credentials_unlocked(tmp_path, skip=True)
        probe.assert_not_called()
        assert result == {"skipped": True}

    def test_no_prompt_when_credentials_ready(self, tmp_path: Path) -> None:
        """When probe reports everything ready, no subprocess prompt is run."""
        ready = {
            "transport": "https",
            "gpg_signing": False,
            "ssh_key_loaded": True,
            "gpg_agent_warm": True,
        }
        with mock.patch("codelicious.cli._probe_git_credentials", return_value=ready):
            with mock.patch("subprocess.run") as run:
                _ensure_git_credentials_unlocked(tmp_path)
        run.assert_not_called()

    def test_ssh_locked_prompts_ssh_add(self, tmp_path: Path) -> None:
        """SSH transport with no loaded key triggers ssh-add interactively."""
        locked = {
            "transport": "ssh",
            "gpg_signing": False,
            "ssh_key_loaded": False,
            "gpg_agent_warm": True,
        }
        unlocked = {**locked, "ssh_key_loaded": True}
        with mock.patch("codelicious.cli._probe_git_credentials", side_effect=[locked, unlocked]):
            with mock.patch("subprocess.run") as run:
                _ensure_git_credentials_unlocked(tmp_path)
        # ssh-add should have been invoked exactly once
        ssh_calls = [c for c in run.call_args_list if c.args and c.args[0] == ["ssh-add"]]
        assert len(ssh_calls) == 1

    def test_continuous_mode_exits_when_ssh_still_locked(self, tmp_path: Path) -> None:
        """In --continuous mode, refuse to start if ssh key is still locked after prompt."""
        locked = {
            "transport": "ssh",
            "gpg_signing": False,
            "ssh_key_loaded": False,
            "gpg_agent_warm": True,
        }
        with mock.patch("codelicious.cli._probe_git_credentials", side_effect=[locked, locked]):
            with mock.patch("subprocess.run"):
                with pytest.raises(SystemExit) as exc:
                    _ensure_git_credentials_unlocked(tmp_path, continuous=True)
        assert exc.value.code == 1

    def test_gpg_cold_prompts_warmup(self, tmp_path: Path) -> None:
        """gpgsign=true with cold agent triggers a one-shot gpg sign."""
        cold = {
            "transport": "https",
            "gpg_signing": True,
            "ssh_key_loaded": True,
            "gpg_agent_warm": False,
        }
        warm = {**cold, "gpg_agent_warm": True}
        with mock.patch("codelicious.cli._probe_git_credentials", side_effect=[cold, warm]):
            with mock.patch("subprocess.run") as run:
                _ensure_git_credentials_unlocked(tmp_path)
        gpg_calls = [c for c in run.call_args_list if c.args and c.args[0] and c.args[0][0] == "gpg"]
        assert len(gpg_calls) == 1

    def test_continuous_mode_exits_when_gpg_still_cold(self, tmp_path: Path) -> None:
        """In --continuous mode, refuse to start if GPG agent is still cold after prompt."""
        cold = {
            "transport": "https",
            "gpg_signing": True,
            "ssh_key_loaded": True,
            "gpg_agent_warm": False,
        }
        with mock.patch("codelicious.cli._probe_git_credentials", side_effect=[cold, cold]):
            with mock.patch("subprocess.run"):
                with pytest.raises(SystemExit) as exc:
                    _ensure_git_credentials_unlocked(tmp_path, continuous=True)
        assert exc.value.code == 1


class TestSkipCredentialProbeFlag:
    """spec 28 Phase 4.2: --skip-credential-probe parses correctly."""

    def test_default_false(self):
        with mock.patch.object(sys, "argv", ["codelicious", "/tmp/repo"]):
            opts = _parse_args(sys.argv)
        assert opts["skip_credential_probe"] is False

    def test_flag_sets_true(self):
        with mock.patch.object(sys, "argv", ["codelicious", "/tmp/repo", "--skip-credential-probe"]):
            opts = _parse_args(sys.argv)
        assert opts["skip_credential_probe"] is True


# ---------------------------------------------------------------------------
# spec-27 Phase 1.2 — spec_discovery standalone module
# ---------------------------------------------------------------------------


class TestSpecDiscoveryModule:
    """spec-27 Phase 1.2: spec_discovery.py works as standalone module."""

    def test_walk_for_specs_finds_specs_dir(self, tmp_path: Path) -> None:
        """walk_for_specs finds .md files inside specs/ directories."""
        from codelicious.spec_discovery import walk_for_specs as wfs

        spec_dir = tmp_path / "docs" / "specs"
        spec_dir.mkdir(parents=True)
        f1 = spec_dir / "feature.md"
        f1.write_text("- [ ] task\n", encoding="utf-8")

        results = wfs(tmp_path)
        assert f1.resolve() in results

    def test_walk_for_specs_skips_excluded(self, tmp_path: Path) -> None:
        """walk_for_specs skips README.md even inside specs/ dirs."""
        from codelicious.spec_discovery import walk_for_specs as wfs

        spec_dir = tmp_path / "docs" / "specs"
        spec_dir.mkdir(parents=True)
        (spec_dir / "README.md").write_text("# Readme\n", encoding="utf-8")

        results = wfs(tmp_path)
        assert (spec_dir / "README.md").resolve() not in results

    def test_discover_incomplete_finds_unchecked(self, tmp_path: Path) -> None:
        """discover_incomplete_specs finds specs with unchecked boxes."""
        from codelicious.spec_discovery import discover_incomplete_specs as dis

        spec = tmp_path / "spec.md"
        spec.write_text("- [ ] todo\n- [x] done\n", encoding="utf-8")

        result = dis(tmp_path, all_specs=[spec])
        assert spec in result

    def test_discover_incomplete_skips_complete(self, tmp_path: Path) -> None:
        """discover_incomplete_specs skips fully-checked specs."""
        from codelicious.spec_discovery import discover_incomplete_specs as dis

        spec = tmp_path / "spec.md"
        spec.write_text("- [x] done1\n- [X] done2\n", encoding="utf-8")

        result = dis(tmp_path, all_specs=[spec])
        assert spec not in result


# ---------------------------------------------------------------------------
# --version / -V flag (lines 390-394 in cli.py)
# ---------------------------------------------------------------------------


class TestVersionFlag:
    """Tests for the -V / --version flag."""

    def test_version_flag_short(self, capsys):
        """-V prints the version string and exits with code 0."""
        with mock.patch.object(sys, "argv", ["codelicious", "-V"]):
            with pytest.raises(SystemExit) as exc_info:
                _parse_args(sys.argv)
        assert exc_info.value.code == 0
        captured = capsys.readouterr()
        assert "codelicious" in captured.out

    def test_version_flag_long(self, capsys):
        """--version prints the version string and exits with code 0."""
        with mock.patch.object(sys, "argv", ["codelicious", "--version"]):
            with pytest.raises(SystemExit) as exc_info:
                _parse_args(sys.argv)
        assert exc_info.value.code == 0
        captured = capsys.readouterr()
        assert "codelicious" in captured.out


# ---------------------------------------------------------------------------
# --parallel flag integer validation (lines 424-428 in cli.py)
# ---------------------------------------------------------------------------


class TestParseArgsIntFlagValidation:
    """Tests for integer flag validation in _parse_args."""

    def test_parallel_non_integer_exits(self):
        """--parallel with a non-integer value exits with code 2."""
        with mock.patch.object(sys, "argv", ["codelicious", "/tmp/repo", "--parallel", "abc"]):
            with pytest.raises(SystemExit) as exc_info:
                _parse_args(sys.argv)
        assert exc_info.value.code == 2

    def test_parallel_integer_accepted(self):
        """--parallel with a valid integer is parsed correctly."""
        with mock.patch.object(sys, "argv", ["codelicious", "/tmp/repo", "--parallel", "4"]):
            opts = _parse_args(sys.argv)
        assert opts["parallel"] == 4

    def test_max_commits_non_integer_exits(self):
        """--max-commits-per-pr with a non-integer value exits with code 2."""
        with mock.patch.object(sys, "argv", ["codelicious", "/tmp/repo", "--max-commits-per-pr", "notanint"]):
            with pytest.raises(SystemExit) as exc_info:
                _parse_args(sys.argv)
        assert exc_info.value.code == 2

    def test_value_flag_without_following_value_is_unknown(self):
        """A value flag at the end of argv with no following token is treated as unknown."""
        # When "--engine" is the last token, i + 1 < len(args) is False,
        # so the unknown-flag branch fires and exits with code 2.
        with mock.patch.object(sys, "argv", ["codelicious", "/tmp/repo", "--engine"]):
            with pytest.raises(SystemExit) as exc_info:
                _parse_args(sys.argv)
        assert exc_info.value.code == 2


# ---------------------------------------------------------------------------
# --dry-run path through main() (lines 535-556 in cli.py)
# ---------------------------------------------------------------------------


class TestDryRunMainPath:
    """Tests for the --dry-run code path executed through main()."""

    @pytest.fixture(autouse=True)
    def _skip_external(self):
        with mock.patch("codelicious.cli._validate_dependencies", side_effect=lambda e: e):
            with mock.patch(
                "codelicious.cli._run_auth_preflight",
                return_value=PreFlightResult(platform="github", authenticated_user="test", cli_tool="gh", skipped=True),
            ):
                yield

    def test_dry_run_exits_zero_without_building(self, mock_repo: Path, mock_git_manager, capsys):
        """--dry-run prints the plan and exits with code 0 without running the engine."""
        spec_file = mock_repo / "spec.md"
        engine = mock.MagicMock()
        engine.name = "mock-engine"

        walk_patch, discover_patch = _mock_spec_discovery(spec_file)

        with mock.patch("codelicious.cli.select_engine", return_value=engine):
            with mock.patch("codelicious.cli.GitManager", return_value=mock_git_manager):
                with mock.patch("codelicious.cli.CacheManager"):
                    with walk_patch, discover_patch:
                        with mock.patch.object(sys, "argv", ["codelicious", str(mock_repo), "--dry-run"]):
                            with pytest.raises(SystemExit) as exc_info:
                                main()

        assert exc_info.value.code == 0
        # Engine must never run in dry-run mode
        engine.execute_chunk.assert_not_called()

    def test_dry_run_prints_spec_list(self, mock_repo: Path, mock_git_manager, capsys):
        """--dry-run output includes the discovered spec path."""
        spec_file = mock_repo / "spec.md"
        engine = mock.MagicMock()
        engine.name = "mock-engine"

        walk_patch, discover_patch = _mock_spec_discovery(spec_file)

        with mock.patch("codelicious.cli.select_engine", return_value=engine):
            with mock.patch("codelicious.cli.GitManager", return_value=mock_git_manager):
                with mock.patch("codelicious.cli.CacheManager"):
                    with walk_patch, discover_patch:
                        with mock.patch.object(sys, "argv", ["codelicious", str(mock_repo), "--dry-run"]):
                            with pytest.raises(SystemExit):
                                main()

        captured = capsys.readouterr()
        assert "DRY RUN" in captured.out
        assert "spec.md" in captured.out

    def test_dry_run_shows_unchecked_task_count(self, mock_repo: Path, mock_git_manager, capsys):
        """--dry-run output shows the number of unchecked tasks per spec."""
        spec_file = mock_repo / "spec.md"
        spec_file.write_text("# Spec\n- [ ] task one\n- [ ] task two\n", encoding="utf-8")
        engine = mock.MagicMock()
        engine.name = "mock-engine"

        walk_patch, discover_patch = _mock_spec_discovery(spec_file)

        with mock.patch("codelicious.cli.select_engine", return_value=engine):
            with mock.patch("codelicious.cli.GitManager", return_value=mock_git_manager):
                with mock.patch("codelicious.cli.CacheManager"):
                    with walk_patch, discover_patch:
                        with mock.patch.object(sys, "argv", ["codelicious", str(mock_repo), "--dry-run"]):
                            with pytest.raises(SystemExit):
                                main()

        captured = capsys.readouterr()
        assert "2 unchecked task" in captured.out


# ---------------------------------------------------------------------------
# --spec override path through main() (lines 508-515 in cli.py)
# ---------------------------------------------------------------------------


class TestSpecOverrideMainPath:
    """Tests for the --spec single-file override through main()."""

    @pytest.fixture(autouse=True)
    def _skip_external(self):
        with mock.patch("codelicious.cli._validate_dependencies", side_effect=lambda e: e):
            with mock.patch(
                "codelicious.cli._run_auth_preflight",
                return_value=PreFlightResult(platform="github", authenticated_user="test", cli_tool="gh", skipped=True),
            ):
                yield

    def test_spec_override_missing_file_exits(self, mock_repo: Path, mock_git_manager):
        """--spec pointing to a nonexistent file exits with code 1."""
        engine = mock.MagicMock()
        engine.name = "mock-engine"

        with mock.patch("codelicious.cli.select_engine", return_value=engine):
            with mock.patch("codelicious.cli.GitManager", return_value=mock_git_manager):
                with mock.patch("codelicious.cli.CacheManager"):
                    with mock.patch.object(
                        sys,
                        "argv",
                        ["codelicious", str(mock_repo), "--spec", "nonexistent/spec.md"],
                    ):
                        with pytest.raises(SystemExit) as exc_info:
                            main()

        assert exc_info.value.code == 1

    def test_spec_override_builds_single_spec(self, mock_repo: Path, mock_git_manager, mock_successful_engine):
        """--spec with a valid file builds only that spec."""
        spec_file = mock_repo / "targeted.md"
        spec_file.write_text("# Target\n- [ ] do this\n", encoding="utf-8")

        with mock.patch("codelicious.cli.select_engine", return_value=mock_successful_engine):
            with mock.patch("codelicious.cli.GitManager", return_value=mock_git_manager):
                with mock.patch("codelicious.cli.CacheManager"):
                    with mock.patch.object(
                        sys,
                        "argv",
                        ["codelicious", str(mock_repo), "--spec", "targeted.md"],
                    ):
                        main()

        mock_successful_engine.execute_chunk.assert_called()
