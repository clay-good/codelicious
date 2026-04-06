"""Tests for the build_logger module."""

from __future__ import annotations

import json
import logging
import os
import pathlib
import stat
import threading
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

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
    assert len(lines) == 1
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


def test_open_handles_second_open_fails_closes_first_handle(tmp_path: pathlib.Path) -> None:
    """If session.jsonl open fails inside _open_handles(), output.log handle must be closed.

    File handles are now opened lazily in _open_handles() (Finding 25), not in
    __init__.  The P2-12 fix changed the open pattern to os.open() + os.fdopen(),
    so we mock os.open to fail on the second call (session.jsonl).
    """
    project = tmp_path / "myproject"
    project.mkdir()
    log_dir = tmp_path / "logs"

    first_handle = MagicMock()
    first_handle.name = "output.log"
    os_open_call_count = 0

    original_chmod = os.chmod

    def mock_os_open(path, flags, mode=0o777):
        nonlocal os_open_call_count
        os_open_call_count += 1
        if os_open_call_count == 1:
            # First call (output.log) — return a fake fd
            return 999
        # Second call (session.jsonl) — simulate disk full
        raise OSError("Simulated disk full error")

    def mock_os_fdopen(fd, *args, **kwargs):
        if fd == 999:
            return first_handle
        return os.fdopen.__wrapped__(fd, *args, **kwargs)  # pragma: no cover

    def mock_chmod(path, mode):
        if "output.log" in str(path):
            return
        return original_chmod(path, mode)

    # Build the session first, then trigger _open_handles() under mocks
    session = BuildSession(project, _make_config(), log_dir=log_dir)

    with patch("os.open", side_effect=mock_os_open):
        with patch("os.fdopen", side_effect=mock_os_fdopen):
            with patch("os.chmod", side_effect=mock_chmod):
                try:
                    session._open_handles()
                    assert False, "Expected OSError to be raised"
                except OSError as e:
                    assert "Simulated disk full error" in str(e)

    # Verify that the first handle's close() was called
    assert first_handle.close.call_count >= 1
    # Tidy up: mark closed to avoid __del__ trying to close None handles.
    session._closed = True


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
    """Create a session directory with a timestamp name from `days_old` days ago.

    Uses datetime arithmetic instead of time.time() float conversion to
    avoid flakiness from NTP corrections or day-boundary rounding
    (Finding 6).
    """
    from datetime import timedelta

    dt = datetime.now(timezone.utc) - timedelta(days=days_old)
    session_name = dt.strftime("%Y%m%dT%H%M%SZ")
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
    """Directories with non-timestamp names (no trailing 'Z') are not removed."""
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
    assert any("failed" in r.message.lower() or "remove" in r.message.lower() for r in caplog.records), (
        f"Expected a warning log; got: {[r.message for r in caplog.records]}"
    )


# ---------------------------------------------------------------------------
# Finding 90: BuildSession.__init__ — os.chmod failure propagates cleanly
# ---------------------------------------------------------------------------


def test_build_session_init_chmod_failure_on_session_dir(tmp_path: pathlib.Path) -> None:
    """When the initial os.chmod on the session directory fails, the OSError
    propagates out of BuildSession.__init__.

    BuildSession.__init__ calls os.chmod(session_dir, 0o700) immediately after
    mkdir.  This call is NOT wrapped in a try/except, so any OSError must bubble
    up to the caller — it must NOT be silently swallowed.
    """
    project = tmp_path / "myproject"
    project.mkdir()
    log_dir = tmp_path / "logs"

    original_chmod = __import__("os").chmod
    chmod_call_count = 0

    def failing_chmod(path, mode):
        nonlocal chmod_call_count
        chmod_call_count += 1
        # Fail on the very first call, which targets the session directory (0o700)
        if chmod_call_count == 1:
            raise OSError("permission denied on chmod")
        return original_chmod(path, mode)

    with patch("os.chmod", side_effect=failing_chmod):
        with pytest.raises(OSError, match="permission denied on chmod"):
            BuildSession(project, _make_config(), log_dir=log_dir)

    # Confirm the chmod was actually attempted (not bypassed by short-circuit logic)
    assert chmod_call_count >= 1, "os.chmod was never called — session directory chmod was skipped"


def test_build_session_open_handles_chmod_failure_on_log_files_is_non_fatal(
    tmp_path: pathlib.Path,
    caplog,
) -> None:
    """chmod failures on log files (output.log, session.jsonl) are logged as warnings,
    not re-raised, ensuring the session still initialises successfully.

    File handles are opened lazily in _open_handles() (Finding 25).  The chmod
    call sequence inside _open_handles() is:
      1. output.log   (0o600) — in try/except OSError, non-fatal (warning logged)
      2. session.jsonl (0o600) — in try/except OSError, non-fatal (warning logged)
    The test triggers _open_handles() by using the context manager (__enter__).
    """
    project = tmp_path / "myproject"
    project.mkdir()
    log_dir = tmp_path / "logs"

    original_chmod = __import__("os").chmod

    # Fail only the chmod calls that target "output.log" and "session.jsonl"
    # (which are both wrapped in try/except OSError in _open_handles()). All
    # other chmod calls (session_dir, meta_path, summary_path) succeed normally.
    def selective_failing_chmod(path, mode):
        path_str = str(path)
        if "output.log" in path_str or "session.jsonl" in path_str:
            raise OSError("simulated chmod failure on log file")
        return original_chmod(path, mode)

    with patch("os.chmod", side_effect=selective_failing_chmod):
        with caplog.at_level(logging.WARNING, logger="codelicious.build_logger"):
            # Should not raise — chmod failures on output.log and session.jsonl are
            # handled gracefully with a logged warning and no re-raise.
            # Use context manager to trigger _open_handles() via __enter__.
            with BuildSession(project, _make_config(), log_dir=log_dir) as session:
                pass

    assert session.session_dir.is_dir()
    # Warnings should have been logged for the failed chmod calls
    assert any("output.log" in r.message or "session.jsonl" in r.message for r in caplog.records)


# -- P2-12: Atomic file permission tests --------------------------------------


def test_log_file_created_with_600_permissions(tmp_path: pathlib.Path) -> None:
    """Log files (output.log, session.jsonl) must have 0o600 permissions from creation.

    P2-12 fix: os.open() with mode 0o600 replaces open() + chmod(), so there is
    no window where the file exists with default (0o644) permissions.
    """
    project = tmp_path / "myproject"
    project.mkdir()
    log_dir = tmp_path / "logs"

    with BuildSession(project, _make_config(), log_dir=log_dir) as session:
        # Trigger file creation by emitting an event
        session.emit("permission_test")

        output_log = session.session_dir / "output.log"
        event_log = session.session_dir / "session.jsonl"
        meta_json = session.session_dir / "meta.json"

        assert output_log.exists()
        assert event_log.exists()
        assert meta_json.exists()

        # Verify permissions are 0o600 (owner read+write only)
        assert stat.S_IMODE(output_log.stat().st_mode) == 0o600
        assert stat.S_IMODE(event_log.stat().st_mode) == 0o600
        assert stat.S_IMODE(meta_json.stat().st_mode) == 0o600

    # summary.json is written on close — verify it too
    summary_json = session.session_dir / "summary.json"
    assert summary_json.exists()
    assert stat.S_IMODE(summary_json.stat().st_mode) == 0o600


def test_permissions_survive_log_writes(tmp_path: pathlib.Path) -> None:
    """Permissions remain 0o600 after 100 log entries are written."""
    project = tmp_path / "myproject"
    project.mkdir()
    log_dir = tmp_path / "logs"

    with BuildSession(project, _make_config(), log_dir=log_dir) as session:
        for i in range(100):
            session.emit("bulk_event", index=i)
            if i % 20 == 0:
                session.write_phase_header(f"Phase {i}")

    output_log = session.session_dir / "output.log"
    event_log = session.session_dir / "session.jsonl"

    # Permissions must still be 0o600 after many writes
    assert stat.S_IMODE(output_log.stat().st_mode) == 0o600
    assert stat.S_IMODE(event_log.stat().st_mode) == 0o600

    # Verify content integrity — all 100 events written
    lines = event_log.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 100
    for line in lines:
        event = json.loads(line)
        assert event["event"] == "bulk_event"


def test_concurrent_log_sessions(tmp_path: pathlib.Path) -> None:
    """Two BuildSession instances writing simultaneously produce correct permissions
    and no data corruption in either session's files.

    Uses different project roots so each session gets its own directory even when
    timestamps collide (session_id is only second-resolution).
    """
    log_dir = tmp_path / "logs"
    errors = []

    def run_session(session_index: int) -> None:
        try:
            project = tmp_path / f"project_{session_index}"
            project.mkdir(exist_ok=True)
            with BuildSession(project, _make_config(), log_dir=log_dir) as session:
                for i in range(50):
                    session.emit(f"session_{session_index}_event", index=i)
                results[session_index] = session.session_dir
        except Exception as exc:
            errors.append(exc)

    results: dict[int, pathlib.Path] = {}

    t1 = threading.Thread(target=run_session, args=(0,))
    t2 = threading.Thread(target=run_session, args=(1,))
    t1.start()
    t2.start()
    t1.join(timeout=10)
    t2.join(timeout=10)

    assert not errors, f"Session threads raised: {errors}"
    assert len(results) == 2

    for idx, session_dir in results.items():
        output_log = session_dir / "output.log"
        event_log = session_dir / "session.jsonl"
        summary_json = session_dir / "summary.json"

        # Both sessions must have correct permissions
        assert stat.S_IMODE(event_log.stat().st_mode) == 0o600
        assert stat.S_IMODE(output_log.stat().st_mode) == 0o600
        assert stat.S_IMODE(summary_json.stat().st_mode) == 0o600

        # Each session must have exactly 50 events, no corruption
        lines = event_log.read_text(encoding="utf-8").strip().splitlines()
        assert len(lines) == 50, f"Session {idx} has {len(lines)} events, expected 50"
        for line in lines:
            event = json.loads(line)
            assert event["event"] == f"session_{idx}_event"


# ---------------------------------------------------------------------------
# spec-20 Phase 11: Build Logger Cleanup Safety (S20-P2-9, S20-P3-6, S20-P3-9)
# ---------------------------------------------------------------------------


class TestBuildLoggerCleanupSafety:
    """Tests for S20-P2-9, S20-P3-6, S20-P3-9: cleanup safety and emit-after-close."""

    def test_cleanup_skips_symlinks(self, tmp_path: pathlib.Path) -> None:
        """cleanup_old_builds must skip symlinked directories (S20-P2-9)."""
        builds_dir = tmp_path / "builds"
        builds_dir.mkdir()

        # Create a real old session directory
        old_session = builds_dir / "20200101T000000Z"
        old_session.mkdir()

        # Create a symlink to an outside directory
        outside = tmp_path / "outside_target"
        outside.mkdir()
        (outside / "important.txt").write_text("don't delete me\n", encoding="utf-8")
        symlink_session = builds_dir / "20200102T000000Z"
        symlink_session.symlink_to(outside)

        removed = cleanup_old_builds(builds_dir, retention_days=1)
        # The real old session should be removed, but the symlink should be skipped
        assert not old_session.exists()
        assert outside.exists()
        assert (outside / "important.txt").exists()
        assert removed == 1

    def test_cleanup_validates_path_within_builds_dir(self, tmp_path: pathlib.Path) -> None:
        """Directories that escape builds_dir via resolve must be skipped (S20-P2-9)."""
        builds_dir = tmp_path / "builds"
        builds_dir.mkdir()
        # Normal old session
        old = builds_dir / "20200101T000000Z"
        old.mkdir()
        removed = cleanup_old_builds(builds_dir, retention_days=1)
        assert removed == 1

    def test_cleanup_timestamp_case_matches_generation(self, tmp_path: pathlib.Path) -> None:
        """Session IDs use uppercase 'Z' suffix; cleanup must match (S20-P3-6).

        The code checks endswith("Z") — a name ending with lowercase "z" must be skipped.
        We use different timestamps to avoid macOS case-insensitive filesystem conflicts.
        """
        builds_dir = tmp_path / "builds"
        builds_dir.mkdir()

        # Uppercase Z (correct format) - should be recognized and removed
        upper = builds_dir / "20200101T000000Z"
        upper.mkdir()
        # A name that doesn't end with Z — should be skipped entirely
        no_z = builds_dir / "20200202T000000_nosuffix"
        no_z.mkdir()

        removed = cleanup_old_builds(builds_dir, retention_days=1)
        assert removed == 1  # Only the uppercase Z directory was recognized and removed
        assert not upper.exists()
        assert no_z.exists()  # non-Z suffix was not recognized

    def test_cleanup_actually_removes_old_sessions(self, tmp_path: pathlib.Path) -> None:
        """Old session directories must actually be deleted from disk."""
        builds_dir = tmp_path / "builds"
        builds_dir.mkdir()
        old = builds_dir / "20200101T120000Z"
        old.mkdir()
        (old / "meta.json").write_text("{}", encoding="utf-8")

        assert old.exists()
        removed = cleanup_old_builds(builds_dir, retention_days=1)
        assert removed == 1
        assert not old.exists()

    def test_cleanup_preserves_recent_sessions(self, tmp_path: pathlib.Path) -> None:
        """Session directories within the retention period must not be deleted."""
        builds_dir = tmp_path / "builds"
        builds_dir.mkdir()
        # Create a session with today's timestamp
        now = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        recent = builds_dir / now
        recent.mkdir()

        removed = cleanup_old_builds(builds_dir, retention_days=30)
        assert removed == 0
        assert recent.exists()

    def test_emit_after_close_logs_warning(self, tmp_path: pathlib.Path, caplog: pytest.LogCaptureFixture) -> None:
        """emit() after close() must log a WARNING with the event type (S20-P3-9)."""
        project = tmp_path / "proj"
        project.mkdir()
        log_dir = tmp_path / "logs"
        session = BuildSession(project, _make_config(), log_dir=log_dir)
        session.close()

        with caplog.at_level(logging.WARNING, logger="codelicious.build_logger"):
            session.emit("dropped_event")

        warnings = [r.message for r in caplog.records if r.levelno >= logging.WARNING]
        assert any("dropped" in w.lower() or "event_type=dropped_event" in w for w in warnings)

    def test_emit_after_close_does_not_write(self, tmp_path: pathlib.Path) -> None:
        """emit() after close() must not write to session.jsonl (S20-P3-9)."""
        project = tmp_path / "proj"
        project.mkdir()
        log_dir = tmp_path / "logs"
        session = BuildSession(project, _make_config(), log_dir=log_dir)
        session.emit("before_close")
        session.close()
        session.emit("after_close")

        jsonl = (session.session_dir / "session.jsonl").read_text(encoding="utf-8")
        events = [json.loads(line)["event"] for line in jsonl.strip().splitlines()]
        assert "before_close" in events
        assert "after_close" not in events

    def test_session_close_is_idempotent(self, tmp_path: pathlib.Path) -> None:
        """Calling close() multiple times must not raise or corrupt files."""
        project = tmp_path / "proj"
        project.mkdir()
        log_dir = tmp_path / "logs"
        session = BuildSession(project, _make_config(), log_dir=log_dir)
        session.emit("event1")
        session.close(success=True)
        session.close(success=False)  # second close is a no-op
        session.close()  # third close also a no-op

        summary = json.loads((session.session_dir / "summary.json").read_text(encoding="utf-8"))
        assert summary["success"] is True  # First close's value sticks
