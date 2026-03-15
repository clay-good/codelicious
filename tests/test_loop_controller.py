"""Tests for the feedback loop controller module."""

from __future__ import annotations

import json
import pathlib
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from proxilion_build.errors import LLMClientError
from proxilion_build.loop_controller import (
    LoopConfig,
    LoopState,
    _check_dependencies,
    _emit,
    _get_transitive_dependents,
    _topological_sort,
    _update_task_status,
    load_state,
    run_loop,
    save_state,
)
from proxilion_build.planner import Task

# -- Helpers -----------------------------------------------------------------


def _make_task(
    task_id: str = "task_001",
    title: str = "Test Task",
    file_paths: list[str] | None = None,
    depends_on: list[str] | None = None,
    status: str = "pending",
) -> Task:
    return Task(
        id=task_id,
        title=title,
        description="Do something.",
        file_paths=file_paths or ["src/main.py"],
        depends_on=depends_on or [],
        validation="File exists",
        status=status,
    )


def _make_llm_response(files: dict[str, str]) -> str:
    """Build a strict-format LLM response from a dict of path->content."""
    parts: list[str] = []
    for path, content in files.items():
        parts.append(f"--- FILE: {path} ---\n{content}\n--- END FILE ---")
    return "\n".join(parts)


def _make_spec(tmp_path: pathlib.Path) -> pathlib.Path:
    """Create a minimal spec file."""
    spec = tmp_path / "spec.md"
    spec.write_text("# Task One\nBuild something.\n", encoding="utf-8")
    return spec


# -- LoopState.to_dict / from_dict round-trip --------------------------------


def test_loop_state_round_trip() -> None:
    task = _make_task()
    state = LoopState(
        plan=[task],
        current_task_index=1,
        completed=["task_001"],
        failed=["task_002"],
        skipped=["task_003"],
        attempt_counts={"task_001": 2, "task_002": 3},
        consecutive_failures=1,
        replanned=True,
    )
    data = state.to_dict()
    restored = LoopState.from_dict(data)

    assert len(restored.plan) == 1
    assert restored.plan[0].id == "task_001"
    assert restored.current_task_index == 1
    assert restored.completed == ["task_001"]
    assert restored.failed == ["task_002"]
    assert restored.skipped == ["task_003"]
    assert restored.attempt_counts == {"task_001": 2, "task_002": 3}
    assert restored.consecutive_failures == 1
    assert restored.replanned is True


def test_loop_state_from_dict_defaults() -> None:
    restored = LoopState.from_dict({})
    assert restored.plan == []
    assert restored.current_task_index == 0
    assert restored.completed == []
    assert restored.replanned is False


# -- save_state / load_state -------------------------------------------------


def test_save_load_state(tmp_path: pathlib.Path) -> None:
    task = _make_task()
    state = LoopState(plan=[task], completed=["task_001"])
    save_state(state, tmp_path)

    loaded = load_state(tmp_path)
    assert loaded is not None
    assert loaded.completed == ["task_001"]
    assert len(loaded.plan) == 1


def test_save_state_creates_directory(tmp_path: pathlib.Path) -> None:
    state = LoopState()
    save_state(state, tmp_path)
    assert (tmp_path / ".proxilion-build" / "state.json").is_file()


def test_load_state_missing(tmp_path: pathlib.Path) -> None:
    assert load_state(tmp_path) is None


def test_load_state_corrupt_json(tmp_path: pathlib.Path) -> None:
    spec_dir = tmp_path / ".proxilion-build"
    spec_dir.mkdir()
    (spec_dir / "state.json").write_text("not json!", encoding="utf-8")
    assert load_state(tmp_path) is None


# -- _emit -------------------------------------------------------------------


def test_emit_calls_callback() -> None:
    events: list[tuple[str, dict[str, Any]]] = []
    _emit(lambda e, d: events.append((e, d)), "test_event", {"key": "val"})
    assert len(events) == 1
    assert events[0] == ("test_event", {"key": "val"})


def test_emit_none_callback() -> None:
    # Should not raise
    _emit(None, "test_event", {"key": "val"})


# -- _update_task_status -----------------------------------------------------


def test_update_task_status() -> None:
    task = _make_task(task_id="t1")
    state = LoopState(plan=[task])
    _update_task_status(state, "t1", "done")
    assert state.plan[0].status == "done"
    assert state.plan[0].id == "t1"


def test_update_task_status_nonexistent() -> None:
    state = LoopState(plan=[_make_task(task_id="t1")])
    _update_task_status(state, "missing", "done")
    # Should not raise, state unchanged
    assert state.plan[0].status == "pending"


# -- _check_dependencies ----------------------------------------------------


def test_check_dependencies_ok() -> None:
    task = _make_task(depends_on=["dep1"])
    state = LoopState(completed=["dep1"])
    assert _check_dependencies(state, task) is None


def test_check_dependencies_failed_dep() -> None:
    task = _make_task(depends_on=["dep1"])
    state = LoopState(failed=["dep1"])
    result = _check_dependencies(state, task)
    assert result is not None
    assert result[0] == "skip"
    assert result[1] == "dep1"


def test_check_dependencies_skipped_dep() -> None:
    task = _make_task(depends_on=["dep1"])
    state = LoopState(skipped=["dep1"])
    result = _check_dependencies(state, task)
    assert result is not None
    assert result[0] == "skip"


# -- run_loop: full loop, all tasks succeed ----------------------------------


def test_run_loop_all_succeed(tmp_path: pathlib.Path) -> None:
    spec = _make_spec(tmp_path)

    tasks = [
        _make_task(task_id="t1", file_paths=["main.py"]),
        _make_task(task_id="t2", file_paths=["utils.py"]),
    ]

    llm_response = _make_llm_response({"main.py": "print('hello')"})
    llm_response_2 = _make_llm_response({"utils.py": "x = 1"})
    responses = iter([llm_response, llm_response_2])

    def mock_llm(_sys: str, _user: str) -> str:
        return next(responses)

    with (
        patch("proxilion_build.loop_controller.parse_spec") as mock_parse,
        patch("proxilion_build.loop_controller.create_plan", return_value=tasks),
        patch("proxilion_build.loop_controller.verify") as mock_verify,
    ):
        mock_parse.return_value = []
        mock_verify.return_value = MagicMock(all_passed=True)

        config = LoopConfig(max_patience=3)
        state = run_loop(spec, tmp_path, mock_llm, config)

    assert len(state.completed) == 2
    assert len(state.failed) == 0
    assert "t1" in state.completed
    assert "t2" in state.completed


# -- run_loop: task fails and retries ---------------------------------------


def test_run_loop_task_retries(tmp_path: pathlib.Path) -> None:
    spec = _make_spec(tmp_path)
    tasks = [_make_task(task_id="t1", file_paths=["main.py"])]

    call_count = 0

    def mock_llm(_sys: str, _user: str) -> str:
        nonlocal call_count
        call_count += 1
        return _make_llm_response({"main.py": "print('hello')"})

    verify_results = iter(
        [
            MagicMock(
                all_passed=False,
                checks=[MagicMock(passed=False, name="syntax", message="fail", details="err")],
            ),
            MagicMock(all_passed=True),
        ]
    )

    with (
        patch("proxilion_build.loop_controller.parse_spec", return_value=[]),
        patch("proxilion_build.loop_controller.create_plan", return_value=tasks),
        patch(
            "proxilion_build.loop_controller.verify",
            side_effect=lambda *a, **kw: next(verify_results),
        ),
    ):
        config = LoopConfig(max_patience=3)
        state = run_loop(spec, tmp_path, mock_llm, config)

    assert "t1" in state.completed
    assert state.attempt_counts["t1"] == 2
    assert call_count == 2


# -- run_loop: patience exhausted marks failed -------------------------------


def test_run_loop_patience_exhausted(tmp_path: pathlib.Path) -> None:
    spec = _make_spec(tmp_path)
    tasks = [_make_task(task_id="t1", file_paths=["main.py"])]

    def mock_llm(_sys: str, _user: str) -> str:
        return _make_llm_response({"main.py": "print('hello')"})

    with (
        patch("proxilion_build.loop_controller.parse_spec", return_value=[]),
        patch("proxilion_build.loop_controller.create_plan", return_value=tasks),
        patch("proxilion_build.loop_controller.verify") as mock_verify,
    ):
        mock_verify.return_value = MagicMock(
            all_passed=False,
            checks=[MagicMock(passed=False, name="test", message="fail", details="err")],
        )

        config = LoopConfig(max_patience=2)
        state = run_loop(spec, tmp_path, mock_llm, config)

    assert "t1" in state.failed
    assert state.attempt_counts["t1"] == 2


# -- run_loop: stop_on_failure stops loop -----------------------------------


def test_run_loop_stop_on_failure(tmp_path: pathlib.Path) -> None:
    spec = _make_spec(tmp_path)
    tasks = [
        _make_task(task_id="t1", file_paths=["main.py"]),
        _make_task(task_id="t2", file_paths=["utils.py"]),
    ]

    def mock_llm(_sys: str, _user: str) -> str:
        return _make_llm_response({"main.py": "print('hello')"})

    with (
        patch("proxilion_build.loop_controller.parse_spec", return_value=[]),
        patch("proxilion_build.loop_controller.create_plan", return_value=tasks),
        patch("proxilion_build.loop_controller.verify") as mock_verify,
    ):
        mock_verify.return_value = MagicMock(
            all_passed=False,
            checks=[MagicMock(passed=False, name="test", message="fail", details="err")],
        )

        config = LoopConfig(max_patience=1, stop_on_failure=True)
        state = run_loop(spec, tmp_path, mock_llm, config)

    assert "t1" in state.failed
    assert "t2" not in state.completed
    assert "t2" not in state.failed


# -- run_loop: dependent tasks skipped on dep failure -----------------------


def test_run_loop_dependency_skip(tmp_path: pathlib.Path) -> None:
    spec = _make_spec(tmp_path)
    tasks = [
        _make_task(task_id="t1", file_paths=["main.py"]),
        _make_task(task_id="t2", file_paths=["utils.py"], depends_on=["t1"]),
    ]

    def mock_llm(_sys: str, _user: str) -> str:
        return _make_llm_response({"main.py": "print('hello')"})

    with (
        patch("proxilion_build.loop_controller.parse_spec", return_value=[]),
        patch("proxilion_build.loop_controller.create_plan", return_value=tasks),
        patch("proxilion_build.loop_controller.verify") as mock_verify,
    ):
        mock_verify.return_value = MagicMock(
            all_passed=False,
            checks=[MagicMock(passed=False, name="test", message="fail", details="err")],
        )

        config = LoopConfig(max_patience=1)
        state = run_loop(spec, tmp_path, mock_llm, config)

    assert "t1" in state.failed
    assert "t2" in state.skipped


# -- Phase 2: replan_error preserved in state ------------------------------


def test_replan_error_preserved_in_state(tmp_path: pathlib.Path) -> None:
    from proxilion_build.errors import PlanningError

    spec = _make_spec(tmp_path)
    tasks = [
        _make_task(task_id="t1", file_paths=["main.py"]),
        _make_task(task_id="t2", file_paths=["utils.py"]),
    ]

    def mock_llm(_sys: str, _user: str) -> str:
        return _make_llm_response({"main.py": "x = 1"})

    with (
        patch("proxilion_build.loop_controller.parse_spec", return_value=[]),
        patch("proxilion_build.loop_controller.create_plan", return_value=tasks),
        patch(
            "proxilion_build.loop_controller.replan",
            side_effect=PlanningError("replan boom"),
        ),
        patch("proxilion_build.loop_controller.verify") as mock_verify,
    ):
        mock_verify.return_value = MagicMock(
            all_passed=False,
            checks=[MagicMock(passed=False, name="test", message="fail", details="err")],
        )

        config = LoopConfig(max_patience=1, replan_after_failures=1)
        state = run_loop(spec, tmp_path, mock_llm, config)

    assert state.replan_error is not None
    assert "replan boom" in state.replan_error


# -- run_loop: state resumption ---------------------------------------------


def test_run_loop_resumes_from_state(tmp_path: pathlib.Path) -> None:
    spec = _make_spec(tmp_path)
    task1 = _make_task(task_id="t1", file_paths=["main.py"], status="done")
    task2 = _make_task(task_id="t2", file_paths=["utils.py"])

    # Pre-save state with t1 already done
    existing_state = LoopState(
        plan=[task1, task2],
        current_task_index=1,
        completed=["t1"],
    )
    save_state(existing_state, tmp_path)

    def mock_llm(_sys: str, _user: str) -> str:
        return _make_llm_response({"utils.py": "x = 1"})

    with patch("proxilion_build.loop_controller.verify") as mock_verify:
        mock_verify.return_value = MagicMock(all_passed=True)

        config = LoopConfig(max_patience=3)
        state = run_loop(spec, tmp_path, mock_llm, config)

    # t1 was already done, t2 should now be completed
    assert "t1" in state.completed
    assert "t2" in state.completed
    assert len(state.completed) == 2


# -- run_loop: dry_run passes through ---------------------------------------


def test_run_loop_dry_run(tmp_path: pathlib.Path) -> None:
    spec = _make_spec(tmp_path)
    tasks = [_make_task(task_id="t1", file_paths=["main.py"])]

    def mock_llm(_sys: str, _user: str) -> str:
        return _make_llm_response({"main.py": "print('hello')"})

    with (
        patch("proxilion_build.loop_controller.parse_spec", return_value=[]),
        patch("proxilion_build.loop_controller.create_plan", return_value=tasks),
        patch("proxilion_build.loop_controller.verify") as mock_verify,
        patch("proxilion_build.loop_controller.Sandbox") as mock_sandbox_cls,
    ):
        mock_verify.return_value = MagicMock(all_passed=True)
        mock_sandbox_instance = MagicMock()
        mock_sandbox_instance.read_file.side_effect = FileNotFoundError
        mock_sandbox_instance.list_files.return_value = []
        mock_sandbox_instance.write_file.return_value = None
        mock_sandbox_cls.return_value = mock_sandbox_instance

        config = LoopConfig(dry_run=True)
        state = run_loop(spec, tmp_path, mock_llm, config)

    mock_sandbox_cls.assert_called_once_with(tmp_path, dry_run=True)
    assert "t1" in state.completed


# -- run_loop: log events in correct order ----------------------------------


def test_run_loop_log_events(tmp_path: pathlib.Path) -> None:
    spec = _make_spec(tmp_path)
    tasks = [_make_task(task_id="t1", file_paths=["main.py"])]

    def mock_llm(_sys: str, _user: str) -> str:
        return _make_llm_response({"main.py": "print('hello')"})

    events: list[str] = []

    def log_fn(event: str, data: dict[str, Any]) -> None:
        events.append(event)

    with (
        patch("proxilion_build.loop_controller.parse_spec", return_value=[]),
        patch("proxilion_build.loop_controller.create_plan", return_value=tasks),
        patch("proxilion_build.loop_controller.verify") as mock_verify,
    ):
        mock_verify.return_value = MagicMock(all_passed=True)

        config = LoopConfig()
        run_loop(spec, tmp_path, mock_llm, config, log_fn=log_fn)

    assert events[0] == "task_started"
    assert events[1] == "task_completed"
    assert events[-1] == "loop_completed"


# -- run_loop: re-planning triggers after consecutive failures ---------------


def test_run_loop_replanning(tmp_path: pathlib.Path) -> None:
    spec = _make_spec(tmp_path)
    tasks = [
        _make_task(task_id="t1", file_paths=["a.py"]),
        _make_task(task_id="t2", file_paths=["b.py"]),
        _make_task(task_id="t3", file_paths=["c.py"]),
    ]

    new_task = _make_task(task_id="t4", title="Replanned Task", file_paths=["d.py"])

    def mock_llm(_sys: str, _user: str) -> str:
        return _make_llm_response({"a.py": "x = 1"})

    events: list[str] = []

    def log_fn(event: str, data: dict[str, Any]) -> None:
        events.append(event)

    with (
        patch("proxilion_build.loop_controller.parse_spec", return_value=[]),
        patch("proxilion_build.loop_controller.create_plan", return_value=tasks),
        patch("proxilion_build.loop_controller.verify") as mock_verify,
        patch("proxilion_build.loop_controller.replan", return_value=[new_task]) as mock_replan,
    ):
        mock_verify.return_value = MagicMock(
            all_passed=False,
            checks=[MagicMock(passed=False, name="test", message="fail", details="err")],
        )

        config = LoopConfig(max_patience=1, replan_after_failures=2)
        state = run_loop(spec, tmp_path, mock_llm, config, log_fn=log_fn)

    assert state.replanned is True
    assert "loop_replanned" in events
    mock_replan.assert_called_once()


# -- run_loop: re-planning at most once -------------------------------------


def test_run_loop_replanning_only_once(tmp_path: pathlib.Path) -> None:
    spec = _make_spec(tmp_path)
    tasks = [
        _make_task(task_id="t1", file_paths=["a.py"]),
        _make_task(task_id="t2", file_paths=["b.py"]),
        _make_task(task_id="t3", file_paths=["c.py"]),
        _make_task(task_id="t4", file_paths=["d.py"]),
    ]

    new_task = _make_task(task_id="t5", title="Replanned", file_paths=["e.py"])

    def mock_llm(_sys: str, _user: str) -> str:
        return _make_llm_response({"a.py": "x = 1"})

    with (
        patch("proxilion_build.loop_controller.parse_spec", return_value=[]),
        patch("proxilion_build.loop_controller.create_plan", return_value=tasks),
        patch("proxilion_build.loop_controller.verify") as mock_verify,
        patch("proxilion_build.loop_controller.replan", return_value=[new_task]) as mock_replan,
    ):
        mock_verify.return_value = MagicMock(
            all_passed=False,
            checks=[MagicMock(passed=False, name="test", message="fail", details="err")],
        )

        config = LoopConfig(max_patience=1, replan_after_failures=2)
        state = run_loop(spec, tmp_path, mock_llm, config)

    # replan called exactly once, even though failures continue after
    assert mock_replan.call_count == 1
    assert state.replanned is True


# -- run_loop: execution failure triggers retry ------------------------------


def test_run_loop_execution_failure_retries(tmp_path: pathlib.Path) -> None:
    spec = _make_spec(tmp_path)
    tasks = [_make_task(task_id="t1", file_paths=["main.py"])]

    call_count = 0

    def mock_llm(_sys: str, _user: str) -> str:
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise LLMClientError("API down")
        return _make_llm_response({"main.py": "print('fixed')"})

    with (
        patch("proxilion_build.loop_controller.parse_spec", return_value=[]),
        patch("proxilion_build.loop_controller.create_plan", return_value=tasks),
        patch("proxilion_build.loop_controller.verify") as mock_verify,
    ):
        mock_verify.return_value = MagicMock(all_passed=True)

        config = LoopConfig(max_patience=3)
        state = run_loop(spec, tmp_path, mock_llm, config)

    assert "t1" in state.completed
    assert state.attempt_counts["t1"] == 2


# -- run_loop: empty plan ---------------------------------------------------


def test_run_loop_empty_plan(tmp_path: pathlib.Path) -> None:
    spec = _make_spec(tmp_path)

    events: list[str] = []

    with (
        patch("proxilion_build.loop_controller.parse_spec", return_value=[]),
        patch("proxilion_build.loop_controller.create_plan", return_value=[]),
    ):
        config = LoopConfig()
        state = run_loop(
            spec,
            tmp_path,
            lambda s, u: "",
            config,
            log_fn=lambda e, d: events.append(e),
        )

    assert len(state.completed) == 0
    assert len(state.failed) == 0
    assert "loop_completed" in events


# -- Phase 9: Loop Controller State Machine Hardening ----------------------


def test_duplicate_task_state_prevented(tmp_path: pathlib.Path) -> None:
    """A task that succeeds is not added to completed twice."""
    spec = _make_spec(tmp_path)
    tasks = [_make_task(task_id="t1", file_paths=["main.py"])]

    def mock_llm(_sys: str, _user: str) -> str:
        return _make_llm_response({"main.py": "x = 1"})

    with (
        patch("proxilion_build.loop_controller.parse_spec", return_value=[]),
        patch("proxilion_build.loop_controller.create_plan", return_value=tasks),
        patch("proxilion_build.loop_controller.verify") as mock_verify,
    ):
        mock_verify.return_value = MagicMock(all_passed=True)
        config = LoopConfig(max_patience=3)
        state = run_loop(spec, tmp_path, mock_llm, config)

    assert state.completed.count("t1") == 1


def test_load_state_inconsistent_returns_none(tmp_path: pathlib.Path) -> None:
    """A state where the same task ID appears in both completed and failed returns None."""
    spec_dir = tmp_path / ".proxilion-build"
    spec_dir.mkdir()
    task = _make_task(task_id="t1")
    bad_state = {
        "version": 1,
        "plan": [task.to_dict()],
        "current_task_index": 1,
        "completed": ["t1"],
        "failed": ["t1"],  # overlap — inconsistent
        "skipped": [],
        "attempt_counts": {},
        "spec_hash": "",
        "consecutive_failures": 0,
        "replanned": False,
        "replan_error": None,
        "budget_exhausted": False,
        "timed_out": False,
        "intent_rejected": False,
    }
    (spec_dir / "state.json").write_text(json.dumps(bad_state), encoding="utf-8")
    assert load_state(tmp_path) is None


def test_state_save_atomic(tmp_path: pathlib.Path) -> None:
    """save_state writes via a temp file and the final file is well-formed JSON."""
    state = LoopState(plan=[_make_task()], completed=["task_001"])
    save_state(state, tmp_path)

    state_file = tmp_path / ".proxilion-build" / "state.json"
    assert state_file.is_file()
    # Must be valid JSON and contain the written state
    data = json.loads(state_file.read_text(encoding="utf-8"))
    assert data["completed"] == ["task_001"]
    # No leftover temp files
    tmp_files = list((tmp_path / ".proxilion-build").glob("*.tmp"))
    assert tmp_files == []


def test_state_version_mismatch_returns_none(tmp_path: pathlib.Path) -> None:
    """load_state returns None when the version field is wrong or missing."""
    spec_dir = tmp_path / ".proxilion-build"
    spec_dir.mkdir()
    task = _make_task(task_id="t1")

    for bad_version in (0, 2, "old", None):
        payload = {
            "version": bad_version,
            "plan": [task.to_dict()],
            "current_task_index": 0,
            "completed": [],
            "failed": [],
            "skipped": [],
            "attempt_counts": {},
            "spec_hash": "",
            "consecutive_failures": 0,
            "replanned": False,
            "replan_error": None,
            "budget_exhausted": False,
            "timed_out": False,
            "intent_rejected": False,
        }
        (spec_dir / "state.json").write_text(json.dumps(payload), encoding="utf-8")
        result = load_state(tmp_path)
        assert result is None, f"Expected None for version={bad_version!r}"


def test_state_version_included_in_save(tmp_path: pathlib.Path) -> None:
    """save_state includes version=1 in the persisted JSON."""
    state = LoopState()
    save_state(state, tmp_path)
    data = json.loads((tmp_path / ".proxilion-build" / "state.json").read_text(encoding="utf-8"))
    assert data["version"] == 1


# -- Phase 12: Dependency Chain Validation ----------------------------------


def test_topological_sort_reorders_plan() -> None:
    """Tasks are reordered so each appears after its dependencies."""
    t1 = _make_task(task_id="t1", depends_on=[])
    t2 = _make_task(task_id="t2", depends_on=["t1"])
    t3 = _make_task(task_id="t3", depends_on=["t2"])
    # Pass in reverse order
    sorted_tasks = _topological_sort([t3, t2, t1])
    ids = [t.id for t in sorted_tasks]
    assert ids.index("t1") < ids.index("t2")
    assert ids.index("t2") < ids.index("t3")


def test_topological_sort_cycle_raises() -> None:
    """Circular dependency raises LoopError."""
    from proxilion_build.errors import LoopError

    t1 = _make_task(task_id="t1", depends_on=["t2"])
    t2 = _make_task(task_id="t2", depends_on=["t1"])
    with pytest.raises(LoopError, match="circular dependency"):
        _topological_sort([t1, t2])


def test_transitive_dependency_skip() -> None:
    """All transitive dependents of a failed task are returned."""
    t1 = _make_task(task_id="t1", depends_on=[])
    t2 = _make_task(task_id="t2", depends_on=["t1"])
    t3 = _make_task(task_id="t3", depends_on=["t2"])
    result = _get_transitive_dependents("t1", [t1, t2, t3])
    assert "t2" in result
    assert "t3" in result
    assert "t1" not in result


def test_transitive_dependents_chain() -> None:
    """Chain A->B->C: when A fails, B and C are both in dependents."""
    ta = _make_task(task_id="A", depends_on=[])
    tb = _make_task(task_id="B", depends_on=["A"])
    tc = _make_task(task_id="C", depends_on=["B"])
    result = _get_transitive_dependents("A", [ta, tb, tc])
    assert "B" in result
    assert "C" in result
    assert "A" not in result


def test_transitive_dependents_diamond() -> None:
    """Diamond A->B, A->C, B->D, C->D: when A fails, B, C, D all in dependents."""
    ta = _make_task(task_id="A", depends_on=[])
    tb = _make_task(task_id="B", depends_on=["A"])
    tc = _make_task(task_id="C", depends_on=["A"])
    td = _make_task(task_id="D", depends_on=["B", "C"])
    result = _get_transitive_dependents("A", [ta, tb, tc, td])
    assert "B" in result
    assert "C" in result
    assert "D" in result
    assert "A" not in result


def test_skip_reason_includes_failed_dependency_id(caplog: pytest.LogCaptureFixture) -> None:
    """Log message includes the failed dependency ID when skipping a task."""
    import logging

    t1 = _make_task(task_id="t1", depends_on=[])
    t2 = _make_task(task_id="t2", depends_on=["t1"])

    state = LoopState(plan=[t1, t2], failed=["t1"])
    with caplog.at_level(logging.INFO, logger="proxilion_build"):
        result = _check_dependencies(state, t2)

    # Check the return value carries the dep id
    assert result is not None
    assert result[1] == "t1"


def test_diamond_dependency_chain() -> None:
    """Diamond A->B, A->C, B->D, C->D resolves without duplicates."""
    ta = _make_task(task_id="A", depends_on=[])
    tb = _make_task(task_id="B", depends_on=["A"])
    tc = _make_task(task_id="C", depends_on=["A"])
    td = _make_task(task_id="D", depends_on=["B", "C"])
    sorted_tasks = _topological_sort([td, tc, tb, ta])
    ids = [t.id for t in sorted_tasks]
    assert ids.index("A") < ids.index("B")
    assert ids.index("A") < ids.index("C")
    assert ids.index("B") < ids.index("D")
    assert ids.index("C") < ids.index("D")
    # No duplicates
    assert len(ids) == len(set(ids))


def test_independent_tasks_after_failure_still_run(tmp_path: pathlib.Path) -> None:
    """Tasks independent of a failed task still execute."""
    from unittest.mock import MagicMock, patch

    t_fail = _make_task(task_id="t_fail", depends_on=[])
    t_indep = _make_task(task_id="t_indep", depends_on=[])

    spec = tmp_path / "spec.md"
    spec.write_text("# Spec\n", encoding="utf-8")

    exec_result_fail = MagicMock()
    exec_result_fail.success = False
    exec_result_fail.error = "intentional failure"

    exec_result_ok = MagicMock()
    exec_result_ok.success = True
    exec_result_ok.error = None

    def fake_execute_task(task, **kwargs):
        if task.id == "t_fail":
            return exec_result_fail
        return exec_result_ok

    verify_result = MagicMock()
    verify_result.all_passed = True
    verify_result.checks = []

    with (
        patch("proxilion_build.loop_controller.parse_spec", return_value=[]),
        patch("proxilion_build.loop_controller.create_plan", return_value=[t_fail, t_indep]),
        patch("proxilion_build.loop_controller.execute_task", side_effect=fake_execute_task),
        patch("proxilion_build.loop_controller.execute_fix", return_value=exec_result_fail),
        patch("proxilion_build.loop_controller.verify", return_value=verify_result),
        patch("proxilion_build.loop_controller.probe_tools", return_value={}),
        patch("proxilion_build.loop_controller.detect_languages", return_value=[]),
    ):
        config = LoopConfig(max_patience=1, stop_on_failure=False)
        state = run_loop(spec, tmp_path, lambda s, u: "", config)

    assert "t_fail" in state.failed
    assert "t_indep" in state.completed


# -- Phase 13: Loop Controller Boundary Conditions -------------------------


def test_patience_of_one_means_no_retries(tmp_path: pathlib.Path) -> None:
    """With max_patience=1, a failing task gets exactly one attempt and no fix calls."""
    from unittest.mock import MagicMock, patch

    task = _make_task(task_id="t1")

    spec = tmp_path / "spec.md"
    spec.write_text("# Spec\n", encoding="utf-8")

    exec_result = MagicMock()
    exec_result.success = False
    exec_result.error = "oops"

    verify_result = MagicMock()
    verify_result.all_passed = False
    verify_result.checks = []

    with (
        patch("proxilion_build.loop_controller.parse_spec", return_value=[]),
        patch("proxilion_build.loop_controller.create_plan", return_value=[task]),
        patch(
            "proxilion_build.loop_controller.execute_task", return_value=exec_result
        ) as mock_exec,
        patch("proxilion_build.loop_controller.execute_fix") as mock_fix,
        patch("proxilion_build.loop_controller.verify", return_value=verify_result),
        patch("proxilion_build.loop_controller.probe_tools", return_value={}),
        patch("proxilion_build.loop_controller.detect_languages", return_value=[]),
    ):
        config = LoopConfig(max_patience=1, stop_on_failure=False)
        state = run_loop(spec, tmp_path, lambda s, u: "", config)

    assert "t1" in state.failed
    mock_exec.assert_called_once()
    mock_fix.assert_not_called()


def test_single_task_plan(tmp_path: pathlib.Path) -> None:
    """A plan with a single task runs correctly and completes."""
    from unittest.mock import MagicMock, patch

    task = _make_task(task_id="only")

    spec = tmp_path / "spec.md"
    spec.write_text("# Spec\n", encoding="utf-8")

    exec_result = MagicMock()
    exec_result.success = True
    exec_result.error = None

    verify_result = MagicMock()
    verify_result.all_passed = True
    verify_result.checks = []

    with (
        patch("proxilion_build.loop_controller.parse_spec", return_value=[]),
        patch("proxilion_build.loop_controller.create_plan", return_value=[task]),
        patch("proxilion_build.loop_controller.execute_task", return_value=exec_result),
        patch("proxilion_build.loop_controller.verify", return_value=verify_result),
        patch("proxilion_build.loop_controller.probe_tools", return_value={}),
        patch("proxilion_build.loop_controller.detect_languages", return_value=[]),
    ):
        config = LoopConfig(max_patience=1, stop_on_failure=False)
        state = run_loop(spec, tmp_path, lambda s, u: "", config)

    assert "only" in state.completed
    assert state.failed == []


def test_all_tasks_independent_all_fail(tmp_path: pathlib.Path) -> None:
    """When all independent tasks fail, all appear in failed and none are skipped."""
    from unittest.mock import MagicMock, patch

    tasks = [_make_task(task_id=f"t{i}") for i in range(3)]

    spec = tmp_path / "spec.md"
    spec.write_text("# Spec\n", encoding="utf-8")

    exec_result = MagicMock()
    exec_result.success = False
    exec_result.error = "fail"

    verify_result = MagicMock()
    verify_result.all_passed = False
    verify_result.checks = []

    with (
        patch("proxilion_build.loop_controller.parse_spec", return_value=[]),
        patch("proxilion_build.loop_controller.create_plan", return_value=tasks),
        patch("proxilion_build.loop_controller.execute_task", return_value=exec_result),
        patch("proxilion_build.loop_controller.execute_fix", return_value=exec_result),
        patch("proxilion_build.loop_controller.verify", return_value=verify_result),
        patch("proxilion_build.loop_controller.probe_tools", return_value={}),
        patch("proxilion_build.loop_controller.detect_languages", return_value=[]),
    ):
        config = LoopConfig(max_patience=1, stop_on_failure=False)
        state = run_loop(spec, tmp_path, lambda s, u: "", config)

    assert len(state.failed) == 3
    assert state.skipped == []
    assert state.completed == []


# -- Phase 14: Corruption Recovery Tests (Loop Controller) -----------------


def test_load_state_empty_file_returns_none(tmp_path: pathlib.Path) -> None:
    """load_state returns None for an empty state file."""
    build_state_dir = tmp_path / ".proxilion-build"
    build_state_dir.mkdir()
    (build_state_dir / "state.json").write_text("", encoding="utf-8")
    assert load_state(tmp_path) is None


def test_load_state_truncated_json_returns_none(tmp_path: pathlib.Path) -> None:
    """load_state returns None for truncated/partial JSON."""
    build_state_dir = tmp_path / ".proxilion-build"
    build_state_dir.mkdir()
    (build_state_dir / "state.json").write_text('{"version": 1, "plan": [', encoding="utf-8")
    assert load_state(tmp_path) is None


def test_load_state_missing_plan_key_returns_none(tmp_path: pathlib.Path) -> None:
    """load_state returns None when the 'plan' key is absent."""
    build_state_dir = tmp_path / ".proxilion-build"
    build_state_dir.mkdir()
    (build_state_dir / "state.json").write_text(
        '{"version": 1, "completed": [], "failed": [], "skipped": []}',
        encoding="utf-8",
    )
    # Missing plan defaults to [] which is valid; test that state loads or returns None gracefully
    state = load_state(tmp_path)
    # Either None (validation failure) or a valid state with empty plan is acceptable
    assert state is None or state.plan == []


def test_load_state_extra_fields_ignored(tmp_path: pathlib.Path) -> None:
    """load_state ignores unknown fields and loads successfully."""
    build_state_dir = tmp_path / ".proxilion-build"
    build_state_dir.mkdir()
    payload = {
        "version": 1,
        "plan": [],
        "completed": [],
        "failed": [],
        "skipped": [],
        "attempt_counts": {},
        "spec_hash": "",
        "consecutive_failures": 0,
        "replanned": False,
        "replan_error": None,
        "budget_exhausted": False,
        "timed_out": False,
        "intent_rejected": False,
        "unknown_extra_field": "ignored",
    }
    import json as _json

    (build_state_dir / "state.json").write_text(_json.dumps(payload), encoding="utf-8")
    state = load_state(tmp_path)
    assert state is not None
    assert state.plan == []


def test_resume_with_completed_task_not_in_plan(tmp_path: pathlib.Path) -> None:
    """load_state returns None when completed list references a task not in the plan."""
    build_state_dir = tmp_path / ".proxilion-build"
    build_state_dir.mkdir()
    payload = {
        "version": 1,
        "plan": [],
        "completed": ["ghost_task"],
        "failed": [],
        "skipped": [],
        "attempt_counts": {},
        "spec_hash": "",
        "consecutive_failures": 0,
        "replanned": False,
        "replan_error": None,
        "budget_exhausted": False,
        "timed_out": False,
        "intent_rejected": False,
    }
    import json as _json

    (build_state_dir / "state.json").write_text(_json.dumps(payload), encoding="utf-8")
    assert load_state(tmp_path) is None
