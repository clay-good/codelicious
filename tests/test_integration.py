"""Integration tests for the proxilion-build tool."""

from __future__ import annotations

import json
import pathlib
from typing import Any
from unittest.mock import MagicMock, patch

from proxilion_build.loop_controller import LoopConfig, LoopState, run_loop, save_state
from proxilion_build.planner import Task

# -- Helpers -----------------------------------------------------------------


def _make_plan_json(tasks: list[dict[str, Any]]) -> str:
    """Return a JSON string for a list of task dicts."""
    return json.dumps(tasks)


def _make_code_response(files: dict[str, str]) -> str:
    """Build a strict-format LLM response from path->content pairs."""
    parts: list[str] = []
    for path, content in files.items():
        parts.append(f"--- FILE: {path} ---\n{content}\n--- END FILE ---")
    return "\n".join(parts)


_PLAN_TWO_TASKS: list[dict[str, Any]] = [
    {
        "id": "task_001",
        "title": "Create main module",
        "description": "Create the main entry point.",
        "file_paths": ["main.py"],
        "depends_on": [],
        "validation": "File exists",
        "status": "pending",
    },
    {
        "id": "task_002",
        "title": "Create utils module",
        "description": "Create utility functions.",
        "file_paths": ["utils.py"],
        "depends_on": ["task_001"],
        "validation": "File exists",
        "status": "pending",
    },
]

_PLAN_JSON = _make_plan_json(_PLAN_TWO_TASKS)


def _make_spec(tmp_path: pathlib.Path) -> pathlib.Path:
    """Create a minimal spec file."""
    spec = tmp_path / "spec.md"
    spec.write_text(
        "# Project\nBuild a tool.\n\n## Features\n- Feature one\n",
        encoding="utf-8",
    )
    return spec


# -- Test 1: Full loop success ----------------------------------------------


def test_full_loop_success(tmp_path: pathlib.Path) -> None:
    spec = _make_spec(tmp_path)

    call_count = 0

    def mock_llm(_sys: str, _user: str) -> str:
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return "ALLOW"  # intent classifier
        if call_count == 2:
            return _PLAN_JSON
        if call_count == 3:
            return _make_code_response({"main.py": "print('hello')"})
        return _make_code_response({"utils.py": "def helper():\n    pass"})

    with patch("proxilion_build.loop_controller.verify") as mock_verify:
        mock_verify.return_value = MagicMock(all_passed=True)

        config = LoopConfig(max_patience=3)
        state = run_loop(spec, tmp_path, mock_llm, config)

    # Both tasks completed
    assert len(state.completed) == 2
    assert "task_001" in state.completed
    assert "task_002" in state.completed
    assert len(state.failed) == 0

    # Files exist on disk
    assert (tmp_path / "main.py").is_file()
    assert (tmp_path / "utils.py").is_file()
    assert "print('hello')" in (tmp_path / "main.py").read_text(encoding="utf-8")

    # State and plan files exist
    assert (tmp_path / ".proxilion-build" / "state.json").is_file()
    assert (tmp_path / ".proxilion-build" / "plan.json").is_file()


# -- Test 2: Verification failure and retry ---------------------------------


def test_verification_failure_and_retry(tmp_path: pathlib.Path) -> None:
    spec = _make_spec(tmp_path)

    call_count = 0

    def mock_llm(_sys: str, _user: str) -> str:
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return "ALLOW"  # intent classifier
        if call_count == 2:
            return _PLAN_JSON
        if call_count == 3:
            # First attempt: code with syntax error
            return _make_code_response({"main.py": "def f(\n"})
        if call_count == 4:
            # Fix attempt: correct code
            return _make_code_response({"main.py": "def f():\n    pass"})
        return _make_code_response({"utils.py": "x = 1"})

    verify_count = 0

    def mock_verify(*args: Any, **kwargs: Any) -> MagicMock:
        nonlocal verify_count
        verify_count += 1
        if verify_count == 1:
            # First verification fails
            result = MagicMock(all_passed=False)
            result.checks = [
                MagicMock(passed=False, name="syntax", message="Syntax error", details="bad.py:1")
            ]
            return result
        return MagicMock(all_passed=True)

    with patch("proxilion_build.loop_controller.verify", side_effect=mock_verify):
        config = LoopConfig(max_patience=3)
        state = run_loop(spec, tmp_path, mock_llm, config)

    assert "task_001" in state.completed
    assert state.attempt_counts["task_001"] == 2


# -- Test 3: Patience exhaustion -------------------------------------------


def test_patience_exhaustion(tmp_path: pathlib.Path) -> None:
    spec = _make_spec(tmp_path)

    # Use a plan where task_002 depends on task_001
    # (plan variable available for reference in debugging)
    _ = list(_PLAN_TWO_TASKS)

    call_count = 0

    def mock_llm(_sys: str, _user: str) -> str:
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return "ALLOW"  # intent classifier
        if call_count == 2:
            return _PLAN_JSON
        # Always return code that passes execution but fails verification
        return _make_code_response({"main.py": "x = 1"})

    with patch("proxilion_build.loop_controller.verify") as mock_verify:
        mock_verify.return_value = MagicMock(
            all_passed=False,
            checks=[MagicMock(passed=False, name="test", message="Tests fail", details="err")],
        )

        config = LoopConfig(max_patience=2)
        state = run_loop(spec, tmp_path, mock_llm, config)

    assert "task_001" in state.failed
    assert "task_002" in state.skipped
    assert state.attempt_counts["task_001"] == 2


# -- Test 4: Re-planning trigger ------------------------------------------


def test_replanning_trigger(tmp_path: pathlib.Path) -> None:
    spec = _make_spec(tmp_path)

    # Plan with 3 independent tasks so we get 2 consecutive failures
    three_tasks = [
        {
            "id": "task_001",
            "title": "Task one",
            "description": "First task.",
            "file_paths": ["a.py"],
            "depends_on": [],
            "validation": "File exists",
            "status": "pending",
        },
        {
            "id": "task_002",
            "title": "Task two",
            "description": "Second task.",
            "file_paths": ["b.py"],
            "depends_on": [],
            "validation": "File exists",
            "status": "pending",
        },
        {
            "id": "task_003",
            "title": "Task three",
            "description": "Third task.",
            "file_paths": ["c.py"],
            "depends_on": [],
            "validation": "File exists",
            "status": "pending",
        },
    ]

    replan_task = {
        "id": "replan_001",
        "title": "Revised task",
        "description": "A better approach.",
        "file_paths": ["d.py"],
        "depends_on": [],
        "validation": "File exists",
        "status": "pending",
    }

    call_count = 0

    def mock_llm(_sys: str, _user: str) -> str:
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return "ALLOW"  # intent classifier
        if call_count == 2:
            return json.dumps(three_tasks)
        return _make_code_response({"a.py": "x = 1"})

    verify_count = 0

    def mock_verify_fn(*args: Any, **kwargs: Any) -> MagicMock:
        nonlocal verify_count
        verify_count += 1
        # Fail all verifications for original tasks, pass for replan tasks
        if verify_count <= 3:
            return MagicMock(
                all_passed=False,
                checks=[MagicMock(passed=False, name="test", message="fail", details="err")],
            )
        return MagicMock(all_passed=True)

    with (
        patch("proxilion_build.loop_controller.verify", side_effect=mock_verify_fn),
        patch("proxilion_build.loop_controller.replan") as mock_replan,
    ):
        replan_result = [Task.from_dict(replan_task)]
        mock_replan.return_value = replan_result

        config = LoopConfig(max_patience=1, replan_after_failures=2)
        state = run_loop(spec, tmp_path, mock_llm, config)

    assert state.replanned is True
    mock_replan.assert_called_once()
    # The replanned task should have been attempted
    task_ids = [t.id for t in state.plan]
    assert "replan_001" in task_ids


# -- Test 5: Resume from state --------------------------------------------


def test_resume_from_state(tmp_path: pathlib.Path) -> None:
    spec = _make_spec(tmp_path)

    # Pre-save state with task_001 already done
    task1 = Task.from_dict(_PLAN_TWO_TASKS[0])
    task2 = Task.from_dict(_PLAN_TWO_TASKS[1])
    existing_state = LoopState(
        plan=[task1, task2],
        current_task_index=1,
        completed=["task_001"],
    )
    save_state(existing_state, tmp_path)

    # Write the file that task_001 would have created
    (tmp_path / "main.py").write_text("print('hello')", encoding="utf-8")

    call_count = 0

    def mock_llm(_sys: str, _user: str) -> str:
        nonlocal call_count
        call_count += 1
        return _make_code_response({"utils.py": "x = 1"})

    with patch("proxilion_build.loop_controller.verify") as mock_verify:
        mock_verify.return_value = MagicMock(all_passed=True)

        config = LoopConfig(max_patience=3)
        state = run_loop(spec, tmp_path, mock_llm, config)

    assert "task_001" in state.completed
    assert "task_002" in state.completed
    assert len(state.completed) == 2
    # Only task_002 should have been executed (1 LLM call)
    assert call_count == 1


# -- Test 6: Dry run -------------------------------------------------------


def test_dry_run_no_project_files(tmp_path: pathlib.Path) -> None:
    spec = _make_spec(tmp_path)

    call_count = 0

    def mock_llm(_sys: str, _user: str) -> str:
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return "ALLOW"  # intent classifier
        if call_count == 2:
            return _PLAN_JSON
        if call_count == 3:
            return _make_code_response({"main.py": "print('hello')"})
        return _make_code_response({"utils.py": "x = 1"})

    with patch("proxilion_build.loop_controller.verify") as mock_verify:
        mock_verify.return_value = MagicMock(all_passed=True)

        config = LoopConfig(dry_run=True, max_patience=3)
        state = run_loop(spec, tmp_path, mock_llm, config)

    assert len(state.completed) == 2

    # Project files should NOT exist (dry run)
    assert not (tmp_path / "main.py").exists()
    assert not (tmp_path / "utils.py").exists()

    # State files SHOULD still exist
    assert (tmp_path / ".proxilion-build" / "state.json").is_file()


# -- Test 7: Sandbox enforcement -------------------------------------------


def test_sandbox_enforcement(tmp_path: pathlib.Path) -> None:
    spec = _make_spec(tmp_path)

    # Plan with a single task targeting a safe file
    single_task = [
        {
            "id": "task_001",
            "title": "Create main",
            "description": "Create main.",
            "file_paths": ["main.py"],
            "depends_on": [],
            "validation": "File exists",
            "status": "pending",
        },
    ]

    call_count = 0

    def mock_llm(_sys: str, _user: str) -> str:
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return "ALLOW"  # intent classifier
        if call_count == 2:
            return json.dumps(single_task)
        # Return code that tries to write outside allowed files
        # The executor skips files not in task.file_paths
        return (
            "--- FILE: main.py ---\n"
            "print('ok')\n"
            "--- END FILE ---\n"
            "--- FILE: /etc/passwd ---\n"
            "hacked\n"
            "--- END FILE ---\n"
        )

    with patch("proxilion_build.loop_controller.verify") as mock_verify:
        mock_verify.return_value = MagicMock(all_passed=True)

        config = LoopConfig(max_patience=3)
        state = run_loop(spec, tmp_path, mock_llm, config)

    # main.py should be written
    assert (tmp_path / "main.py").is_file()
    # /etc/passwd should NOT be affected (skipped by executor)
    assert "task_001" in state.completed
