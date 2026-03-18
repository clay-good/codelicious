"""Tests for the build_logger module."""

from __future__ import annotations

import json
import pathlib
from unittest.mock import MagicMock, patch

from codelicious.build_logger import BuildSession


def _make_config(**overrides):
    cfg = MagicMock()
    cfg.model = overrides.get("model", "test-model")
    cfg.max_iterations = overrides.get("max_iterations", 10)
    cfg.agent_timeout_s = overrides.get("agent_timeout_s", 1800)
    cfg.reflect = overrides.get("reflect", False)
    cfg.dry_run = overrides.get("dry_run", False)
    cfg.effort = overrides.get("effort", "")
    cfg.max_turns = overrides.get("max_turns", 0)
    return cfg


# -- session directory creation ----------------------------------------------


def test_session_dir_created(tmp_path: pathlib.Path) -> None:
    project = tmp_path / "myproject"
    project.mkdir()
    log_dir = tmp_path / "logs"
    session = BuildSession(project, _make_config(), log_dir=log_dir)
    assert session.session_dir.is_dir()
    assert "myproject" in str(session.session_dir)
    session.close()


# -- meta.json contents ------------------------------------------------------


def test_meta_json_fields(tmp_path: pathlib.Path) -> None:
    project = tmp_path / "myproject"
    project.mkdir()
    log_dir = tmp_path / "logs"
    session = BuildSession(project, _make_config(model="opus"), log_dir=log_dir)

    meta_path = session.session_dir / "meta.json"
    assert meta_path.is_file()
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    assert meta["project_name"] == "myproject"
    assert meta["config"]["model"] == "opus"
    assert "started_at" in meta
    session.close()


# -- emit() writes valid JSON ------------------------------------------------


def test_emit_writes_json_line(tmp_path: pathlib.Path) -> None:
    project = tmp_path / "myproject"
    project.mkdir()
    log_dir = tmp_path / "logs"
    session = BuildSession(project, _make_config(), log_dir=log_dir)

    session.emit("test_event", key="value")
    session.close()

    jsonl_path = session.session_dir / "session.jsonl"
    lines = jsonl_path.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) >= 1
    event = json.loads(lines[0])
    assert event["event"] == "test_event"
    assert event["key"] == "value"
    assert "ts" in event


# -- close() writes summary.json --------------------------------------------


def test_close_writes_summary(tmp_path: pathlib.Path) -> None:
    project = tmp_path / "myproject"
    project.mkdir()
    log_dir = tmp_path / "logs"
    session = BuildSession(project, _make_config(), log_dir=log_dir)
    session.close(success=True, tasks_done=5, tasks_failed=1)

    summary_path = session.session_dir / "summary.json"
    assert summary_path.is_file()
    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    assert summary["success"] is True
    assert summary["tasks_done"] == 5
    assert summary["tasks_failed"] == 1
    assert "elapsed_s" in summary
    assert "finished_at" in summary


# -- double-close is safe ---------------------------------------------------


def test_double_close_is_safe(tmp_path: pathlib.Path) -> None:
    project = tmp_path / "myproject"
    project.mkdir()
    log_dir = tmp_path / "logs"
    session = BuildSession(project, _make_config(), log_dir=log_dir)
    session.close(success=True)
    session.close(success=False)  # should not raise or overwrite

    summary = json.loads((session.session_dir / "summary.json").read_text(encoding="utf-8"))
    assert summary["success"] is True  # first close wins


# -- context manager ---------------------------------------------------------


def test_context_manager_closes(tmp_path: pathlib.Path) -> None:
    project = tmp_path / "myproject"
    project.mkdir()
    log_dir = tmp_path / "logs"

    with BuildSession(project, _make_config(), log_dir=log_dir) as session:
        session.emit("inside_context")

    summary_path = session.session_dir / "summary.json"
    assert summary_path.is_file()
    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    assert summary["success"] is True


# -- emit after close is a no-op --------------------------------------------


def test_emit_after_close_is_noop(tmp_path: pathlib.Path) -> None:
    project = tmp_path / "myproject"
    project.mkdir()
    log_dir = tmp_path / "logs"
    session = BuildSession(project, _make_config(), log_dir=log_dir)
    session.emit("before_close")
    session.close()
    session.emit("after_close")  # should not raise

    jsonl_content = (session.session_dir / "session.jsonl").read_text(encoding="utf-8")
    lines = jsonl_content.strip().splitlines()
    events = [json.loads(line)["event"] for line in lines]
    assert "before_close" in events
    assert "after_close" not in events


# -- write_phase_header ------------------------------------------------------


def test_write_phase_header(tmp_path: pathlib.Path) -> None:
    project = tmp_path / "myproject"
    project.mkdir()
    log_dir = tmp_path / "logs"
    session = BuildSession(project, _make_config(), log_dir=log_dir)
    session.write_phase_header("Phase 1: Build")
    session.close()

    output = (session.session_dir / "output.log").read_text(encoding="utf-8")
    assert "Phase 1: Build" in output
    assert "====" in output


# -- output_file property ----------------------------------------------------


def test_output_file_is_writable(tmp_path: pathlib.Path) -> None:
    project = tmp_path / "myproject"
    project.mkdir()
    log_dir = tmp_path / "logs"
    session = BuildSession(project, _make_config(), log_dir=log_dir)
    session.output_file.write("test line\n")
    session.close()

    output = (session.session_dir / "output.log").read_text(encoding="utf-8")
    assert "test line" in output


# -- partial init failure closes first handle --------------------------------


def test_init_second_open_fails_closes_first_handle(tmp_path: pathlib.Path) -> None:
    """If session.jsonl open fails, output.log handle must be closed."""
    project = tmp_path / "myproject"
    project.mkdir()
    log_dir = tmp_path / "logs"

    # Track calls to open() and the mock file handle
    first_handle = MagicMock()
    first_handle.name = "output.log"
    open_call_count = 0

    original_open = open
    original_chmod = __import__("os").chmod

    def mock_open_side_effect(*args, **kwargs):
        nonlocal open_call_count
        # Allow meta.json to be written normally
        if "meta.json" in str(args[0]):
            return original_open(*args, **kwargs)

        open_call_count += 1
        if open_call_count == 1:
            # First call (output.log) - return mock handle
            return first_handle
        else:
            # Second call (session.jsonl) - raise OSError
            raise OSError("Simulated disk full error")

    def mock_chmod(path, mode):
        # Skip chmod for output.log (mock handle) but allow others
        if "output.log" in str(path):
            return
        return original_chmod(path, mode)

    with patch("builtins.open", side_effect=mock_open_side_effect):
        with patch("os.chmod", side_effect=mock_chmod):
            try:
                BuildSession(project, _make_config(), log_dir=log_dir)
                assert False, "Expected OSError to be raised"
            except OSError as e:
                assert "Simulated disk full error" in str(e)

    # Verify that the first handle's close() was called
    first_handle.close.assert_called_once()


# -- set_result explicit success override ------------------------------------


def test_set_result_false_overrides_no_exception(tmp_path: pathlib.Path) -> None:
    """When set_result(False) is called, __exit__ records success=False even without exception."""
    project = tmp_path / "myproject"
    project.mkdir()
    log_dir = tmp_path / "logs"

    with BuildSession(project, _make_config(), log_dir=log_dir) as session:
        # Simulate a build that catches its own errors and returns BuildResult(success=False)
        session.set_result(False)
        # No exception raised, but build failed

    summary_path = session.session_dir / "summary.json"
    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    assert summary["success"] is False


def test_set_result_true_overrides_exception(tmp_path: pathlib.Path) -> None:
    """When set_result(True) is called, __exit__ records success=True even with exception."""
    project = tmp_path / "myproject"
    project.mkdir()
    log_dir = tmp_path / "logs"

    try:
        with BuildSession(project, _make_config(), log_dir=log_dir) as session:
            # Set result before raising exception
            session.set_result(True)
            raise RuntimeError("Expected error")
    except RuntimeError:
        pass

    summary_path = session.session_dir / "summary.json"
    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    assert summary["success"] is True


def test_no_set_result_uses_exception_logic(tmp_path: pathlib.Path) -> None:
    """When set_result is not called, __exit__ uses exc_type is None (backwards compatible)."""
    project = tmp_path / "myproject"
    project.mkdir()
    log_dir = tmp_path / "logs"

    # Case 1: No exception -> success=True
    with BuildSession(project, _make_config(), log_dir=log_dir) as session1:
        pass

    summary1 = json.loads((session1.session_dir / "summary.json").read_text(encoding="utf-8"))
    assert summary1["success"] is True

    # Case 2: Exception raised -> success=False
    try:
        with BuildSession(project, _make_config(), log_dir=log_dir) as session2:
            raise ValueError("Test error")
    except ValueError:
        pass

    summary2 = json.loads((session2.session_dir / "summary.json").read_text(encoding="utf-8"))
    assert summary2["success"] is False
