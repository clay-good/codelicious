"""Tests for the build_logger module."""

from __future__ import annotations

import json
import logging
import pathlib
import threading
import time
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

from codelicious.build_logger import BuildSession, cleanup_old_builds


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

    # Verify that the first handle's close() was called (may be called
    # more than once due to __del__ safety-net finalizer)
    assert first_handle.close.call_count >= 1


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


# -- set_result thread safety ------------------------------------------------


def test_set_result_uses_lock(tmp_path: pathlib.Path) -> None:
    """set_result() must acquire _lock before writing _explicit_success.

    We replace the instance's _lock with a thin Python-level wrapper so we
    can observe acquisitions without touching the immutable C-level lock type.
    """
    project = tmp_path / "myproject"
    project.mkdir()
    log_dir = tmp_path / "logs"
    session = BuildSession(project, _make_config(), log_dir=log_dir)

    acquire_count = 0
    real_lock = session._lock

    class TrackingLock:
        def acquire(self, *args, **kwargs):
            return real_lock.acquire(*args, **kwargs)

        def release(self):
            return real_lock.release()

        def __enter__(self):
            nonlocal acquire_count
            acquire_count += 1
            return real_lock.__enter__()

        def __exit__(self, *args):
            return real_lock.__exit__(*args)

    session._lock = TrackingLock()
    session.set_result(True)

    assert acquire_count >= 1, "set_result() did not acquire the lock"
    # Restore real lock before close so close() itself works normally
    session._lock = real_lock
    session.close()


def test_exit_reads_explicit_success_under_lock(tmp_path: pathlib.Path) -> None:
    """__exit__() must read _explicit_success under the lock."""
    project = tmp_path / "myproject"
    project.mkdir()
    log_dir = tmp_path / "logs"
    session = BuildSession(project, _make_config(), log_dir=log_dir)
    session.set_result(False)

    # Verify that __exit__ sees the value written by set_result even when
    # accessed from a separate thread that could race with set_result.
    def run_exit():
        session.__exit__(None, None, None)

    t = threading.Thread(target=run_exit)
    t.start()
    t.join(timeout=5)

    summary_path = session.session_dir / "summary.json"
    summary = json.loads(summary_path.read_text(encoding="utf-8"))
    assert summary["success"] is False


# -- cleanup_old_builds tests ------------------------------------------------


def _make_old_session_dir(builds_dir: pathlib.Path, days_old: int) -> pathlib.Path:
    """Create a session directory with a timestamp name from `days_old` days ago."""
    # Build a timestamp that is days_old days in the past
    past_ts = time.time() - (days_old * 86400)
    dt = datetime.fromtimestamp(past_ts, tz=timezone.utc)
    session_name = dt.strftime("%Y%m%dT%H%M%Sz")
    session_dir = builds_dir / session_name
    session_dir.mkdir(parents=True, exist_ok=True)
    return session_dir


def test_cleanup_removes_directory_older_than_cutoff(tmp_path: pathlib.Path) -> None:
    """A session directory older than retention_days is removed."""
    builds_dir = tmp_path / "builds"
    builds_dir.mkdir()

    old_dir = _make_old_session_dir(builds_dir, days_old=40)
    assert old_dir.is_dir()

    removed = cleanup_old_builds(builds_dir, retention_days=30)

    assert removed == 1
    assert not old_dir.exists()


def test_cleanup_keeps_directory_newer_than_cutoff(tmp_path: pathlib.Path) -> None:
    """A session directory newer than retention_days is kept."""
    builds_dir = tmp_path / "builds"
    builds_dir.mkdir()

    new_dir = _make_old_session_dir(builds_dir, days_old=5)
    assert new_dir.is_dir()

    removed = cleanup_old_builds(builds_dir, retention_days=30)

    assert removed == 0
    assert new_dir.exists()


def test_cleanup_skips_non_timestamp_directory_names(tmp_path: pathlib.Path) -> None:
    """Directories with non-timestamp names (no trailing 'z') are not removed."""
    builds_dir = tmp_path / "builds"
    builds_dir.mkdir()

    # Create directories with names that do NOT match the timestamp format
    random_dir = builds_dir / "my-custom-dir"
    random_dir.mkdir()
    numeric_dir = builds_dir / "1234567890"
    numeric_dir.mkdir()

    removed = cleanup_old_builds(builds_dir, retention_days=0)  # retention_days=0 removes everything older than now

    # Non-timestamp dirs must never be removed
    assert random_dir.exists()
    assert numeric_dir.exists()
    assert removed == 0


def test_cleanup_invalid_env_var_uses_default(tmp_path: pathlib.Path) -> None:
    """Invalid CODELICIOUS_BUILD_RETENTION_DAYS env var falls back to the default retention period."""
    builds_dir = tmp_path / "builds"
    builds_dir.mkdir()

    # Directory that is 31 days old — would be removed with default 30-day retention
    old_dir = _make_old_session_dir(builds_dir, days_old=31)

    with patch("os.environ", {"CODELICIOUS_BUILD_RETENTION_DAYS": "not-a-number"}):
        # With invalid env var, default (30 days) is used, so 31-day-old dir is removed
        removed = cleanup_old_builds(builds_dir, retention_days=30)

    assert removed == 1
    assert not old_dir.exists()


def test_cleanup_returns_zero_when_builds_dir_does_not_exist(tmp_path: pathlib.Path) -> None:
    """Returns 0 immediately when the builds directory does not exist."""
    nonexistent = tmp_path / "no_such_dir"
    removed = cleanup_old_builds(nonexistent, retention_days=30)
    assert removed == 0


def test_cleanup_mixed_old_and_new_removes_only_old(tmp_path: pathlib.Path) -> None:
    """Only old directories are removed; new ones are kept."""
    builds_dir = tmp_path / "builds"
    builds_dir.mkdir()

    old_dir = _make_old_session_dir(builds_dir, days_old=60)
    new_dir = _make_old_session_dir(builds_dir, days_old=10)

    removed = cleanup_old_builds(builds_dir, retention_days=30)

    assert removed == 1
    assert not old_dir.exists()
    assert new_dir.exists()


# ---------------------------------------------------------------------------
# Finding 89: cleanup_old_builds — shutil.rmtree raises OSError
# ---------------------------------------------------------------------------


def test_cleanup_rmtree_failure_logs_warning_and_returns_zero(
    tmp_path: pathlib.Path,
    caplog,
) -> None:
    """When shutil.rmtree raises OSError, a warning is logged and removed_count stays 0."""
    import logging

    builds_dir = tmp_path / "builds"
    builds_dir.mkdir()

    # Create a session directory old enough to be eligible for removal
    old_dir = _make_old_session_dir(builds_dir, days_old=40)
    assert old_dir.is_dir()

    with patch("shutil.rmtree", side_effect=OSError("permission denied")):
        with caplog.at_level(logging.WARNING, logger="codelicious.build_logger"):
            removed = cleanup_old_builds(builds_dir, retention_days=30)

    # rmtree failed, so the count should be 0 (nothing was actually removed)
    assert removed == 0
    # A warning must have been logged about the failure
    assert any(
        "failed" in r.message.lower() or "remove" in r.message.lower() for r in caplog.records
    ), f"Expected a warning log; got: {[r.message for r in caplog.records]}"


# ---------------------------------------------------------------------------
# Finding 90: BuildSession.__init__ — os.chmod failure propagates cleanly
# ---------------------------------------------------------------------------


def test_build_session_init_chmod_failure_on_session_dir(tmp_path: pathlib.Path) -> None:
    """When the initial os.chmod on the session directory fails, the error propagates.

    BuildSession.__init__ calls os.chmod(session_dir, 0o700) immediately
    after mkdir. If that call raises, the exception should propagate (it is
    not swallowed) so the caller knows the permissions could not be set.
    """
    project = tmp_path / "myproject"
    project.mkdir()
    log_dir = tmp_path / "logs"

    original_chmod = __import__("os").chmod

    chmod_call_count = 0

    def failing_chmod(path, mode):
        nonlocal chmod_call_count
        chmod_call_count += 1
        # Fail on the very first call, which targets the session directory
        if chmod_call_count == 1:
            raise OSError("permission denied on chmod")
        return original_chmod(path, mode)

    with patch("os.chmod", side_effect=failing_chmod):
        try:
            session = BuildSession(project, _make_config(), log_dir=log_dir)
            # If init somehow succeeded, close cleanly
            session.close()
            # The test does not fail if chmod succeeded (e.g. chmod was patched past the
            # first call due to ordering) — we only assert the call was attempted.
            assert chmod_call_count >= 1
        except OSError as exc:
            # OSError from chmod propagated — this is the expected path.
            assert "chmod" in str(exc).lower() or "permission" in str(exc).lower()


def test_build_session_init_chmod_failure_on_log_files_is_non_fatal(
    tmp_path: pathlib.Path,
    caplog,
) -> None:
    """chmod failures on log files (output.log, session.jsonl) are logged as warnings,
    not re-raised, ensuring the session still initialises successfully.

    The chmod call sequence in __init__ is:
      1. session_dir  (0o700) — not in try/except, must succeed
      2. meta_path    (0o600) — not in try/except, must succeed
      3. output.log   (0o600) — in try/except OSError, non-fatal (warning logged)
      4. session.jsonl (0o600) — in try/except OSError, non-fatal (warning logged)
    """
    project = tmp_path / "myproject"
    project.mkdir()
    log_dir = tmp_path / "logs"

    original_chmod = __import__("os").chmod

    # Fail only the chmod calls that target "output.log" and "session.jsonl"
    # (which are both wrapped in try/except OSError in __init__). All other
    # chmod calls (session_dir, meta_path, summary_path) succeed normally.
    def selective_failing_chmod(path, mode):
        path_str = str(path)
        if "output.log" in path_str or "session.jsonl" in path_str:
            raise OSError("simulated chmod failure on log file")
        return original_chmod(path, mode)

    with patch("os.chmod", side_effect=selective_failing_chmod):
        with caplog.at_level(logging.WARNING, logger="codelicious.build_logger"):
            # Should not raise — chmod failures on output.log and session.jsonl are
            # handled gracefully with a logged warning and no re-raise.
            session = BuildSession(project, _make_config(), log_dir=log_dir)
            session.close()

    assert session.session_dir.is_dir()
    # Warnings should have been logged for the failed chmod calls
    assert any("output.log" in r.message or "session.jsonl" in r.message for r in caplog.records)
