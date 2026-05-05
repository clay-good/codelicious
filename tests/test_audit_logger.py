"""Tests for ``codelicious.tools.audit_logger`` (spec v29 Step 12).

Covers initialization, intent/outcome routing, security-event dual-write to
``audit.log`` and ``security.log``, thread-safe appends under contention,
context-manager lifecycle, and the SecurityEvent enum surface.
"""

from __future__ import annotations

import threading
from pathlib import Path

import pytest

from codelicious.tools.audit_logger import AuditLogger, SecurityEvent


@pytest.fixture
def audit(tmp_path: Path) -> AuditLogger:
    logger = AuditLogger(tmp_path)
    yield logger
    logger.close()


class TestAuditLoggerInit:
    def test_creates_log_files(self, tmp_path: Path) -> None:
        AuditLogger(tmp_path).close()
        assert (tmp_path / ".codelicious" / "audit.log").exists()
        assert (tmp_path / ".codelicious" / "security.log").exists()

    def test_init_creates_codelicious_dir(self, tmp_path: Path) -> None:
        target = tmp_path / "nested" / "repo"
        target.mkdir(parents=True)
        AuditLogger(target).close()
        assert (target / ".codelicious").is_dir()


class TestToolDispatchLogging:
    def test_log_tool_intent_writes_dispatch_line(self, audit: AuditLogger, tmp_path: Path) -> None:
        audit.log_tool_intent("read_file", {"path": "src/main.py"})
        body = (tmp_path / ".codelicious" / "audit.log").read_text()
        assert "TOOL_DISPATCH" in body
        assert "read_file" in body
        assert "src/main.py" in body

    def test_log_tool_outcome_success(self, audit: AuditLogger, tmp_path: Path) -> None:
        audit.log_tool_outcome("read_file", {"success": True, "stdout": "hello world"})
        body = (tmp_path / ".codelicious" / "audit.log").read_text()
        assert "TOOL_SUCCESS" in body
        assert "INFO" in body

    def test_log_tool_outcome_failure(self, audit: AuditLogger, tmp_path: Path) -> None:
        audit.log_tool_outcome("write_file", {"success": False, "stderr": "permission denied"})
        body = (tmp_path / ".codelicious" / "audit.log").read_text()
        assert "TOOL_FAILED" in body
        assert "ERROR" in body
        assert "permission denied" in body


class TestSecurityEventLogging:
    def test_writes_to_both_audit_and_security(self, audit: AuditLogger, tmp_path: Path) -> None:
        audit.log_security_event(SecurityEvent.PATH_TRAVERSAL_BLOCKED, "blocked ../etc/passwd")
        audit_body = (tmp_path / ".codelicious" / "audit.log").read_text()
        security_body = (tmp_path / ".codelicious" / "security.log").read_text()
        assert "PATH_TRAVERSAL_BLOCKED" in audit_body
        assert "PATH_TRAVERSAL_BLOCKED" in security_body
        assert "blocked ../etc/passwd" in security_body

    def test_iteration_and_tool_context_in_security_line(self, audit: AuditLogger, tmp_path: Path) -> None:
        audit.set_iteration(7)
        audit.set_current_tool("write_file")
        audit.log_security_event(SecurityEvent.EXTENSION_BLOCKED, "blocked .exe")
        body = (tmp_path / ".codelicious" / "security.log").read_text()
        assert "iteration 7" in body
        assert "write_file" in body

    def test_explicit_overrides_take_precedence(self, audit: AuditLogger, tmp_path: Path) -> None:
        audit.set_iteration(1)
        audit.set_current_tool("read_file")
        audit.log_security_event(
            SecurityEvent.COMMAND_DENIED,
            "denied rm -rf /",
            iteration=99,
            tool="run_command",
        )
        body = (tmp_path / ".codelicious" / "security.log").read_text()
        assert "iteration 99" in body
        assert "run_command" in body

    def test_log_sandbox_violation_with_explicit_event_routes_to_security_log(
        self, audit: AuditLogger, tmp_path: Path
    ) -> None:
        audit.log_sandbox_violation("denied symlink escape", event_type=SecurityEvent.SYMLINK_ESCAPE_BLOCKED)
        body = (tmp_path / ".codelicious" / "security.log").read_text()
        assert "SYMLINK_ESCAPE_BLOCKED" in body

    def test_log_sandbox_violation_without_event_falls_back_to_audit(self, audit: AuditLogger, tmp_path: Path) -> None:
        audit.log_sandbox_violation("legacy untyped violation")
        audit_body = (tmp_path / ".codelicious" / "audit.log").read_text()
        security_body = (tmp_path / ".codelicious" / "security.log").read_text()
        assert "SANDBOX TRAP" in audit_body
        # Untyped violations are not security-event-typed, so they don't
        # land in security.log.
        assert "legacy untyped violation" not in security_body


class TestSecurityEventEnum:
    def test_known_members_are_strings(self) -> None:
        assert SecurityEvent.COMMAND_DENIED.value == "COMMAND_DENIED"
        assert SecurityEvent.METACHAR_BLOCKED.value == "METACHAR_BLOCKED"

    def test_str_inheritance(self) -> None:
        # SecurityEvent inherits from str → comparable to plain strings.
        assert SecurityEvent.PATH_TRAVERSAL_BLOCKED == "PATH_TRAVERSAL_BLOCKED"


class TestThreadSafeAppend:
    def test_concurrent_appends_preserve_all_lines(self, tmp_path: Path) -> None:
        """10 threads × 100 entries each produce 1000 distinct lines, none truncated."""
        logger = AuditLogger(tmp_path)
        try:
            entries_per_thread = 100
            thread_count = 10
            barrier = threading.Barrier(thread_count)

            def writer(worker_id: int) -> None:
                barrier.wait()
                for i in range(entries_per_thread):
                    logger.log_tool_intent("noop", {"worker": worker_id, "i": i})

            threads = [threading.Thread(target=writer, args=(w,)) for w in range(thread_count)]
            for t in threads:
                t.start()
            for t in threads:
                t.join(timeout=15)
        finally:
            logger.close()

        lines = (tmp_path / ".codelicious" / "audit.log").read_text().splitlines()
        assert len(lines) == thread_count * entries_per_thread
        # No line should be truncated mid-write — every line ends with '...'
        # because log_tool_intent appends ellipsis-free Intent: prefix; verify
        # presence of the dispatch tag instead.
        for line in lines:
            assert "TOOL_DISPATCH" in line


def _mp_writer(repo_path_str: str, worker_id: int, count: int) -> None:  # pragma: no cover
    """Multiprocessing target — must be module-level for pickling."""
    from codelicious.tools.audit_logger import AuditLogger

    logger = AuditLogger(Path(repo_path_str))
    try:
        for i in range(count):
            logger.log_tool_intent("noop", {"worker": worker_id, "i": i})
    finally:
        logger.close()


class TestCrossProcessAppend:
    """spec v30 Step 11: ``fcntl.flock`` keeps audit lines from interleaving across processes."""

    def test_concurrent_processes_do_not_interleave(self, tmp_path: Path) -> None:
        import multiprocessing
        import sys as _sys

        if _sys.platform == "win32":
            import pytest as _pytest

            _pytest.skip("POSIX-only test; Windows uses msvcrt fallback or no locking")

        workers = 4
        per_worker = 50
        # Use spawn to keep the child interpreter clean of pytest state.
        ctx = multiprocessing.get_context("spawn")
        procs = [ctx.Process(target=_mp_writer, args=(str(tmp_path), w, per_worker)) for w in range(workers)]
        for p in procs:
            p.start()
        for p in procs:
            p.join(timeout=20)
            assert p.exitcode == 0, f"worker {p.pid} exited with {p.exitcode}"

        lines = (tmp_path / ".codelicious" / "audit.log").read_text().splitlines()
        assert len(lines) == workers * per_worker
        for line in lines:
            assert "TOOL_DISPATCH" in line, f"interleaved line: {line!r}"


class TestLifecycle:
    def test_context_manager_closes_handles(self, tmp_path: Path) -> None:
        with AuditLogger(tmp_path) as logger:
            logger.log_tool_intent("noop", {})
            assert logger._audit_fh is not None
            assert not logger._audit_fh.closed
        assert logger._audit_fh.closed
        assert logger._security_fh.closed

    def test_double_close_is_safe(self, tmp_path: Path) -> None:
        logger = AuditLogger(tmp_path)
        logger.close()
        # Should not raise.
        logger.close()
