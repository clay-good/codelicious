"""Tests for the CLI entry point module."""

from __future__ import annotations

import pathlib
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from proxilion_build.cli import (
    handle_plan,
    handle_reset,
    handle_run,
    handle_status,
    handle_verify,
    main,
)
from proxilion_build.errors import ProxilionBuildError
from proxilion_build.loop_controller import LoopState
from proxilion_build.planner import Task

# -- Helpers -----------------------------------------------------------------


def _make_task(
    task_id: str = "task_001",
    title: str = "Test Task",
    status: str = "pending",
) -> Task:
    return Task(
        id=task_id,
        title=title,
        description="Do something.",
        file_paths=["src/main.py"],
        depends_on=[],
        validation="File exists",
        status=status,
    )


def _make_args(**overrides: Any) -> MagicMock:
    """Build a mock args namespace with sensible defaults."""
    defaults = {
        "command": "run",
        "provider": "anthropic",
        "model": None,
        "patience": None,
        "dry_run": False,
        "stop_on_failure": False,
        "verbose": False,
        "project_dir": None,
        "verify_command": None,
        "max_context_tokens": None,
        "spec_file": "spec.md",
        "force": False,
    }
    defaults.update(overrides)
    args = MagicMock()
    for key, val in defaults.items():
        setattr(args, key, val)
    return args


# -- No subcommand prints help, exit 2 --------------------------------------


def test_no_subcommand_exits_2() -> None:
    with patch("sys.argv", ["proxilion-build"]):
        code = main()
    assert code == 2


# -- handle_plan with mocked dependencies -----------------------------------


def test_handle_plan_success(tmp_path: pathlib.Path, capsys: pytest.CaptureFixture[str]) -> None:
    spec = tmp_path / "spec.md"
    spec.write_text("# Task\nBuild it.\n", encoding="utf-8")

    tasks = [_make_task(task_id="t1", title="Build feature")]
    args = _make_args(
        command="plan",
        spec_file=str(spec),
        project_dir=str(tmp_path),
    )

    with (
        patch("proxilion_build.cli.build_config") as mock_config,
        patch("proxilion_build.cli.parse_spec", return_value=[]),
        patch("proxilion_build.cli.create_plan", return_value=tasks),
        patch("proxilion_build.cli.save_plan"),
    ):
        cfg = MagicMock()
        cfg.api_key = "sk-test1234567890"
        cfg.provider = "anthropic"
        cfg.get_effective_model.return_value = "claude-sonnet-4-20250514"
        cfg.get_api_key_env_var.return_value = "ANTHROPIC_API_KEY"
        cfg.project_dir = tmp_path
        mock_config.return_value = cfg

        code = handle_plan(args)

    assert code == 0
    captured = capsys.readouterr()
    assert "1 task(s)" in captured.out
    assert "t1" in captured.out


# -- handle_verify with mocked verify ---------------------------------------


def test_handle_verify_all_pass(
    tmp_path: pathlib.Path, capsys: pytest.CaptureFixture[str]
) -> None:
    args = _make_args(command="verify", project_dir=str(tmp_path))

    mock_result = MagicMock()
    mock_result.all_passed = True
    mock_result.checks = [
        MagicMock(name="syntax", passed=True, message="All files ok", details=""),
    ]

    with patch("proxilion_build.cli.verify", return_value=mock_result):
        code = handle_verify(args)

    assert code == 0
    captured = capsys.readouterr()
    assert "[OK]" in captured.out


def test_handle_verify_failure(tmp_path: pathlib.Path, capsys: pytest.CaptureFixture[str]) -> None:
    args = _make_args(command="verify", project_dir=str(tmp_path))

    mock_check = MagicMock()
    mock_check.name = "syntax"
    mock_check.passed = False
    mock_check.message = "Syntax errors found"
    mock_check.details = "bad.py:1: SyntaxError"
    mock_result = MagicMock()
    mock_result.all_passed = False
    mock_result.checks = [mock_check]

    with patch("proxilion_build.cli.verify", return_value=mock_result):
        code = handle_verify(args)

    assert code == 1
    captured = capsys.readouterr()
    assert "[FAIL]" in captured.out


# -- handle_status with no state --------------------------------------------


def test_handle_status_no_state(
    tmp_path: pathlib.Path, capsys: pytest.CaptureFixture[str]
) -> None:
    args = _make_args(command="status", project_dir=str(tmp_path))

    code = handle_status(args)

    assert code == 0
    captured = capsys.readouterr()
    assert "No active loop state" in captured.out


# -- handle_status with state -----------------------------------------------


def test_handle_status_with_state(
    tmp_path: pathlib.Path, capsys: pytest.CaptureFixture[str]
) -> None:
    args = _make_args(command="status", project_dir=str(tmp_path))

    task = _make_task(task_id="t1", title="Build feature")
    state = LoopState(
        plan=[task],
        completed=["t1"],
    )

    with patch("proxilion_build.cli.load_state", return_value=state):
        code = handle_status(args)

    assert code == 0
    captured = capsys.readouterr()
    assert "1/1 completed" in captured.out
    assert "[OK]" in captured.out
    assert "t1" in captured.out


# -- handle_reset with --force ----------------------------------------------


def test_handle_reset_force(tmp_path: pathlib.Path, capsys: pytest.CaptureFixture[str]) -> None:
    spec_dir = tmp_path / ".proxilion-build"
    spec_dir.mkdir()
    (spec_dir / "state.json").write_text("{}", encoding="utf-8")
    (spec_dir / "plan.json").write_text("[]", encoding="utf-8")

    args = _make_args(command="reset", force=True, project_dir=str(tmp_path))

    code = handle_reset(args)

    assert code == 0
    assert not (spec_dir / "state.json").exists()
    assert not (spec_dir / "plan.json").exists()
    captured = capsys.readouterr()
    assert "Removed" in captured.out


# -- handle_reset without --force (mock input) -------------------------------


def test_handle_reset_confirm_yes(
    tmp_path: pathlib.Path, capsys: pytest.CaptureFixture[str]
) -> None:
    spec_dir = tmp_path / ".proxilion-build"
    spec_dir.mkdir()
    (spec_dir / "state.json").write_text("{}", encoding="utf-8")

    args = _make_args(command="reset", force=False, project_dir=str(tmp_path))

    with patch("builtins.input", return_value="y"):
        code = handle_reset(args)

    assert code == 0
    assert not (spec_dir / "state.json").exists()


def test_handle_reset_confirm_no(
    tmp_path: pathlib.Path, capsys: pytest.CaptureFixture[str]
) -> None:
    spec_dir = tmp_path / ".proxilion-build"
    spec_dir.mkdir()
    (spec_dir / "state.json").write_text("{}", encoding="utf-8")

    args = _make_args(command="reset", force=False, project_dir=str(tmp_path))

    with patch("builtins.input", return_value="n"):
        code = handle_reset(args)

    assert code == 0
    assert (spec_dir / "state.json").exists()
    captured = capsys.readouterr()
    assert "cancelled" in captured.out


# -- Missing API key gives clear error --------------------------------------


def test_missing_api_key_error(tmp_path: pathlib.Path) -> None:
    spec = tmp_path / "spec.md"
    spec.write_text("# Task\nBuild it.\n", encoding="utf-8")

    args = _make_args(
        command="run",
        spec_file=str(spec),
        project_dir=str(tmp_path),
    )

    with (
        patch("proxilion_build.cli.build_config") as mock_config,
        patch.dict("os.environ", {}, clear=True),
    ):
        cfg = MagicMock()
        cfg.api_key = ""
        cfg.provider = "anthropic"
        cfg.get_api_key_env_var.return_value = "ANTHROPIC_API_KEY"
        cfg.project_dir = tmp_path
        mock_config.return_value = cfg

        with pytest.raises(ProxilionBuildError, match="API key not found"):
            handle_run(args)


# -- Invalid project_dir gives error ----------------------------------------


def test_invalid_project_dir() -> None:
    argv = ["proxilion-build", "--project-dir", "/nonexistent/path", "run", "spec.md"]
    with patch("sys.argv", argv):
        code = main()
    assert code == 1


# -- Exit codes correct: run success ----------------------------------------


def test_run_exit_code_success(tmp_path: pathlib.Path) -> None:
    spec = tmp_path / "spec.md"
    spec.write_text("# Task\nBuild it.\n", encoding="utf-8")

    args = _make_args(
        command="run",
        spec_file=str(spec),
        project_dir=str(tmp_path),
    )

    state = LoopState(
        plan=[_make_task()],
        completed=["task_001"],
    )

    with (
        patch("proxilion_build.cli.build_config") as mock_config,
        patch("proxilion_build.cli.setup_logging"),
        patch("proxilion_build.cli.create_log_callback", return_value=lambda e, d: None),
        patch("proxilion_build.cli.run_loop", return_value=state),
    ):
        cfg = MagicMock()
        cfg.api_key = "sk-test1234567890"
        cfg.provider = "anthropic"
        cfg.get_effective_model.return_value = "claude-sonnet-4-20250514"
        cfg.get_api_key_env_var.return_value = "ANTHROPIC_API_KEY"
        cfg.project_dir = tmp_path
        cfg.patience = 3
        cfg.stop_on_failure = False
        cfg.dry_run = False
        cfg.verification_timeout = 120
        cfg.verify_command = None
        cfg.max_context_tokens = 100_000
        cfg.replan_after_failures = 2
        cfg.verbose = False
        mock_config.return_value = cfg

        code = handle_run(args)

    assert code == 0


def test_run_exit_code_failure(tmp_path: pathlib.Path) -> None:
    spec = tmp_path / "spec.md"
    spec.write_text("# Task\nBuild it.\n", encoding="utf-8")

    args = _make_args(
        command="run",
        spec_file=str(spec),
        project_dir=str(tmp_path),
    )

    state = LoopState(
        plan=[_make_task()],
        failed=["task_001"],
    )

    with (
        patch("proxilion_build.cli.build_config") as mock_config,
        patch("proxilion_build.cli.setup_logging"),
        patch("proxilion_build.cli.create_log_callback", return_value=lambda e, d: None),
        patch("proxilion_build.cli.run_loop", return_value=state),
    ):
        cfg = MagicMock()
        cfg.api_key = "sk-test1234567890"
        cfg.provider = "anthropic"
        cfg.get_effective_model.return_value = "claude-sonnet-4-20250514"
        cfg.get_api_key_env_var.return_value = "ANTHROPIC_API_KEY"
        cfg.project_dir = tmp_path
        cfg.patience = 3
        cfg.stop_on_failure = False
        cfg.dry_run = False
        cfg.verification_timeout = 120
        cfg.verify_command = None
        cfg.max_context_tokens = 100_000
        cfg.replan_after_failures = 2
        cfg.verbose = False
        mock_config.return_value = cfg

        code = handle_run(args)

    assert code == 1


# -- Spec file not found ----------------------------------------------------


def test_run_spec_not_found(tmp_path: pathlib.Path) -> None:
    args = _make_args(
        command="run",
        spec_file=str(tmp_path / "missing.md"),
        project_dir=str(tmp_path),
    )
    code = handle_run(args)
    assert code == 1


def test_plan_spec_not_found(tmp_path: pathlib.Path) -> None:
    args = _make_args(
        command="plan",
        spec_file=str(tmp_path / "missing.md"),
        project_dir=str(tmp_path),
    )
    code = handle_plan(args)
    assert code == 1


# -- ProxilionBuildError caught by main -------------------------------------------


def test_main_catches_proxilion_build_error() -> None:
    with (
        patch("sys.argv", ["proxilion-build", "verify"]),
        patch("proxilion_build.cli.handle_verify", side_effect=ProxilionBuildError("boom")),
    ):
        code = main()
    assert code == 1


# -- Reset with no state directory ------------------------------------------


def test_handle_reset_no_state_dir(
    tmp_path: pathlib.Path, capsys: pytest.CaptureFixture[str]
) -> None:
    args = _make_args(command="reset", force=True, project_dir=str(tmp_path))
    code = handle_reset(args)
    assert code == 0
    captured = capsys.readouterr()
    assert "No state to reset" in captured.out


# -- Phase 10: CLI Argument Validation -------------------------------------


def test_spec_file_not_readable(tmp_path: pathlib.Path) -> None:
    """handle_run returns 1 when spec file exists but is not readable."""
    spec = tmp_path / "spec.md"
    spec.write_text("# Task\nBuild it.\n", encoding="utf-8")

    args = _make_args(
        command="run",
        spec_file=str(spec),
        project_dir=str(tmp_path),
    )

    with patch("os.access", return_value=False):
        code = handle_run(args)

    assert code == 1


def test_spec_file_not_readable_plan(tmp_path: pathlib.Path) -> None:
    """handle_plan returns 1 when spec file exists but is not readable."""
    spec = tmp_path / "spec.md"
    spec.write_text("# Task\nBuild it.\n", encoding="utf-8")

    args = _make_args(
        command="plan",
        spec_file=str(spec),
        project_dir=str(tmp_path),
    )

    with patch("os.access", return_value=False):
        code = handle_plan(args)

    assert code == 1


def test_patience_zero_cli_exits_2() -> None:
    """--patience 0 is rejected at parse time with exit code 2."""
    with patch("sys.argv", ["proxilion-build", "--patience", "0", "run", "spec.md"]):
        code = main()
    assert code == 2


def test_patience_negative_cli_exits_2() -> None:
    """--patience -1 is rejected at parse time with exit code 2."""
    with patch("sys.argv", ["proxilion-build", "--patience", "-1", "run", "spec.md"]):
        code = main()
    assert code == 2


def test_max_context_tokens_too_small_cli_exits_2() -> None:
    """--max-context-tokens 500 is rejected with exit code 2."""
    with patch("sys.argv", ["proxilion-build", "--max-context-tokens", "500", "run", "spec.md"]):
        code = main()
    assert code == 2


def test_keyboard_interrupt_returns_130() -> None:
    """KeyboardInterrupt during a handler returns exit code 130."""
    with (
        patch("sys.argv", ["proxilion-build", "verify"]),
        patch("proxilion_build.cli.handle_verify", side_effect=KeyboardInterrupt),
    ):
        code = main()
    assert code == 130


def test_broken_pipe_returns_0() -> None:
    """BrokenPipeError is caught at the top level and returns 0."""
    with (
        patch("sys.argv", ["proxilion-build", "verify"]),
        patch("proxilion_build.cli._main", side_effect=BrokenPipeError),
    ):
        code = main()
    assert code == 0


# -- handle_status with failed and skipped tasks ----------------------------


def test_handle_status_mixed(tmp_path: pathlib.Path, capsys: pytest.CaptureFixture[str]) -> None:
    args = _make_args(command="status", project_dir=str(tmp_path))

    tasks = [
        _make_task(task_id="t1", title="Done task"),
        _make_task(task_id="t2", title="Failed task"),
        _make_task(task_id="t3", title="Skipped task"),
    ]
    state = LoopState(
        plan=tasks,
        completed=["t1"],
        failed=["t2"],
        skipped=["t3"],
        attempt_counts={"t2": 3},
    )

    with patch("proxilion_build.cli.load_state", return_value=state):
        code = handle_status(args)

    assert code == 0
    captured = capsys.readouterr()
    assert "[OK]" in captured.out
    assert "[FAIL]" in captured.out
    assert "[SKIP]" in captured.out
    assert "3 attempts" in captured.out


# -- Phase 12: CLI Argument Validation Hardening -------------------------------


def test_invalid_verify_passes_zero() -> None:
    """--verify-passes 0 is rejected with exit code 2."""
    with patch("sys.argv", ["proxilion-build", "run", "spec.md", "--verify-passes", "0"]):
        code = main()
    assert code == 2


def test_invalid_verify_passes_negative() -> None:
    """--verify-passes -1 is rejected with exit code 2."""
    with patch("sys.argv", ["proxilion-build", "run", "spec.md", "--verify-passes", "-1"]):
        code = main()
    assert code == 2


def test_invalid_agent_timeout_negative() -> None:
    """--iterations -1 is rejected with exit code 2."""
    with patch("sys.argv", ["proxilion-build", "run", "spec.md", "--iterations", "-1"]):
        code = main()
    assert code == 2


def test_invalid_agent_timeout_zero() -> None:
    """--iterations 0 is rejected with exit code 2."""
    with patch("sys.argv", ["proxilion-build", "run", "spec.md", "--iterations", "0"]):
        code = main()
    assert code == 2


def test_invalid_ci_fix_passes_negative() -> None:
    """--ci-fix-passes -1 is rejected with exit code 2."""
    with patch("sys.argv", ["proxilion-build", "run", "spec.md", "--ci-fix-passes", "-1"]):
        code = main()
    assert code == 2


def test_invalid_test_timeout_zero() -> None:
    """--test-timeout 0 is rejected with exit code 2."""
    with patch("sys.argv", ["proxilion-build", "run", "spec.md", "--test-timeout", "0"]):
        code = main()
    assert code == 2


def test_invalid_test_timeout_negative() -> None:
    """--test-timeout -1 is rejected with exit code 2."""
    with patch("sys.argv", ["proxilion-build", "run", "spec.md", "--test-timeout", "-1"]):
        code = main()
    assert code == 2


def test_invalid_lint_timeout_zero() -> None:
    """--lint-timeout 0 is rejected with exit code 2."""
    with patch("sys.argv", ["proxilion-build", "run", "spec.md", "--lint-timeout", "0"]):
        code = main()
    assert code == 2


def test_invalid_lint_timeout_negative() -> None:
    """--lint-timeout -1 is rejected with exit code 2."""
    with patch("sys.argv", ["proxilion-build", "run", "spec.md", "--lint-timeout", "-1"]):
        code = main()
    assert code == 2
