"""Tests for the progress module."""

from __future__ import annotations

import json
import pathlib
import threading
from datetime import datetime

from codelicious.progress import ProgressReporter, _MAX_PROGRESS_BYTES

# -- None path is a no-op ---------------------------------------------------


def test_none_path_does_not_write() -> None:
    reporter = ProgressReporter(log_path=None)
    reporter.emit("test_event", key="value")  # should not raise
    # No file handle should ever be opened when log_path is None.
    assert reporter._handle is None


# -- valid path creates file and writes JSON ---------------------------------


def test_creates_file_on_first_emit(tmp_path: pathlib.Path) -> None:
    log_path = tmp_path / "progress.jsonl"
    reporter = ProgressReporter(log_path=log_path)
    reporter.emit("start", phase="init")

    assert log_path.is_file()
    line = log_path.read_text(encoding="utf-8").strip()
    event = json.loads(line)
    assert event["event"] == "start"
    assert event["phase"] == "init"
    assert "ts" in event


# -- append behavior ---------------------------------------------------------


def test_appends_multiple_events(tmp_path: pathlib.Path) -> None:
    log_path = tmp_path / "progress.jsonl"
    reporter = ProgressReporter(log_path=log_path)
    reporter.emit("event_a")
    reporter.emit("event_b")
    reporter.emit("event_c")

    lines = log_path.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 3
    events = [json.loads(line)["event"] for line in lines]
    assert events == ["event_a", "event_b", "event_c"]


# -- creates parent directories ---------------------------------------------


def test_creates_parent_dirs(tmp_path: pathlib.Path) -> None:
    log_path = tmp_path / "nested" / "deep" / "progress.jsonl"
    reporter = ProgressReporter(log_path=log_path)
    reporter.emit("nested_event")
    assert log_path.is_file()


# -- thread safety -----------------------------------------------------------


def test_concurrent_emits(tmp_path: pathlib.Path) -> None:
    log_path = tmp_path / "progress.jsonl"
    reporter = ProgressReporter(log_path=log_path)

    def emit_n(n: int) -> None:
        for i in range(20):
            reporter.emit(f"thread_{n}", index=i)

    threads = [threading.Thread(target=emit_n, args=(t,)) for t in range(5)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    lines = log_path.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 100  # 5 threads * 20 events
    for line in lines:
        event = json.loads(line)
        assert "event" in event
        assert "ts" in event
        # Verify event content integrity: every event name must start with 'thread_'
        # to confirm no data was corrupted or interleaved during concurrent writes.
        assert event["event"].startswith("thread_"), (
            f"Expected event name to start with 'thread_', got: {event['event']!r}"
        )


# -- kwargs are included in output -------------------------------------------


def test_kwargs_in_output(tmp_path: pathlib.Path) -> None:
    log_path = tmp_path / "progress.jsonl"
    reporter = ProgressReporter(log_path=log_path)
    reporter.emit("task_done", task_id="t1", elapsed_s=3.14)

    event = json.loads(log_path.read_text(encoding="utf-8").strip())
    assert event["task_id"] == "t1"
    assert event["elapsed_s"] == 3.14


# -- timestamp format --------------------------------------------------------


def test_timestamp_is_iso_format(tmp_path: pathlib.Path) -> None:
    log_path = tmp_path / "progress.jsonl"
    reporter = ProgressReporter(log_path=log_path)
    reporter.emit("ts_check")

    event = json.loads(log_path.read_text(encoding="utf-8").strip())
    ts = event["ts"]

    # Must be parseable as a valid ISO-8601 datetime — raises ValueError if malformed.
    parsed = datetime.fromisoformat(ts)

    # The parsed datetime must carry timezone info (not a naive datetime).
    assert parsed.tzinfo is not None, "timestamp must be timezone-aware"

    # The serialised string must end with '+00:00' — the UTC offset emitted by
    # datetime.now(timezone.utc).isoformat().
    assert ts.endswith("+00:00"), f"expected UTC offset '+00:00' in timestamp, got: {ts!r}"


# -- close() method ----------------------------------------------------------


def test_close_closes_handle(tmp_path: pathlib.Path) -> None:
    """close() should close the underlying file handle."""
    log_path = tmp_path / "progress.jsonl"
    reporter = ProgressReporter(log_path=log_path)
    reporter.emit("before_close")

    # Verify handle is open
    assert reporter._handle is not None
    assert not reporter._handle.closed

    reporter.close()

    # Verify handle is now None (closed and cleared)
    assert reporter._handle is None
    assert reporter._closed is True


def test_close_idempotent(tmp_path: pathlib.Path) -> None:
    """Calling close() twice should not raise."""
    log_path = tmp_path / "progress.jsonl"
    reporter = ProgressReporter(log_path=log_path)
    reporter.emit("event")

    reporter.close()
    reporter.close()  # Should not raise

    assert reporter._closed is True


def test_close_without_emit(tmp_path: pathlib.Path) -> None:
    """close() on a reporter that never emitted should not raise."""
    log_path = tmp_path / "progress.jsonl"
    reporter = ProgressReporter(log_path=log_path)

    reporter.close()  # Should not raise

    assert reporter._closed is True
    assert reporter._handle is None


def test_progress_reporter_close_idempotent(tmp_path: pathlib.Path) -> None:
    """Calling close() twice should not raise (spec-18 Phase 1)."""
    progress_file = tmp_path / "progress.jsonl"
    reporter = ProgressReporter(progress_file)
    reporter.emit("test", data="hello")
    reporter.close()
    reporter.close()  # Should not raise
    assert reporter._closed is True


# -- context manager protocol ------------------------------------------------


def test_context_manager_closes_on_exit(tmp_path: pathlib.Path) -> None:
    """Using ProgressReporter as context manager should close on exit."""
    log_path = tmp_path / "progress.jsonl"

    with ProgressReporter(log_path=log_path) as reporter:
        reporter.emit("inside_context")
        assert reporter._handle is not None

    # After exiting context, should be closed
    assert reporter._closed is True
    assert reporter._handle is None


def test_context_manager_closes_on_exception(tmp_path: pathlib.Path) -> None:
    """Context manager should close even if exception occurs inside."""
    log_path = tmp_path / "progress.jsonl"

    try:
        with ProgressReporter(log_path=log_path) as reporter:
            reporter.emit("before_exception")
            raise ValueError("Test exception")
    except ValueError:
        pass

    # Should still be closed after exception
    assert reporter._closed is True
    assert reporter._handle is None


# -- emit after close --------------------------------------------------------


def test_emit_after_close_is_noop(tmp_path: pathlib.Path) -> None:
    """Calling emit() after close() should be a no-op."""
    log_path = tmp_path / "progress.jsonl"
    reporter = ProgressReporter(log_path=log_path)
    reporter.emit("before_close")
    reporter.close()
    reporter.emit("after_close")  # Should not raise and should not write

    lines = log_path.read_text(encoding="utf-8").strip().splitlines()
    events = [json.loads(line)["event"] for line in lines]
    assert "before_close" in events
    assert "after_close" not in events


# -- log rotation -----------------------------------------------------------


def test_log_rotation_creates_backup_and_new_file(tmp_path: pathlib.Path) -> None:
    """When progress.jsonl exceeds _MAX_PROGRESS_BYTES the file is rotated.

    Expected behaviour:
    - The oversized original is renamed to progress.jsonl.1
    - A new progress.jsonl is created containing only the latest event
    """
    log_path = tmp_path / "progress.jsonl"
    backup_path = log_path.with_suffix(".jsonl.1")

    # Pre-create a file that exceeds the rotation threshold.
    # Write in chunks to avoid allocating the full 10 MB in one shot.
    chunk = b"x" * (1024 * 1024)  # 1 MB per chunk
    chunks_needed = _MAX_PROGRESS_BYTES // len(chunk) + 1
    with log_path.open("wb") as fh:
        for _ in range(chunks_needed):
            fh.write(chunk)

    assert log_path.stat().st_size > _MAX_PROGRESS_BYTES

    reporter = ProgressReporter(log_path=log_path)
    reporter.emit("after_rotation", marker="rotated")
    reporter.close()

    # Backup must exist (the oversized original was renamed)
    assert backup_path.is_file(), "Expected .jsonl.1 backup to exist after rotation"

    # Backup must contain the pre-rotation content (non-empty, exceeds threshold)
    assert backup_path.stat().st_size > _MAX_PROGRESS_BYTES, (
        f"Backup file size ({backup_path.stat().st_size}) should exceed the rotation "
        f"threshold ({_MAX_PROGRESS_BYTES}); it must hold the original oversized content"
    )

    # The new log file must exist and contain only the single latest event
    assert log_path.is_file(), "Expected new progress.jsonl to be created after rotation"
    lines = log_path.read_text(encoding="utf-8").strip().splitlines()
    assert len(lines) == 1, f"Expected exactly 1 line in rotated file, got {len(lines)}"
    event = json.loads(lines[0])
    assert event["event"] == "after_rotation"
    assert event["marker"] == "rotated"
