"""Tests for the progress module."""

from __future__ import annotations

import json
import pathlib
import threading

from codelicious.progress import ProgressReporter

# -- None path is a no-op ---------------------------------------------------


def test_none_path_does_not_write() -> None:
    reporter = ProgressReporter(log_path=None)
    reporter.emit("test_event", key="value")  # should not raise


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
    # ISO format ends with +00:00 or Z or has T separator
    assert "T" in ts


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
