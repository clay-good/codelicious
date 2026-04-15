"""Tests for security event audit logging (spec-07 Phase 6, spec-08 Phase 8)."""

import logging
import tempfile
from pathlib import Path

import pytest

from codelicious.tools.audit_logger import AuditLogger, SecurityEvent


class TestSecurityEvent:
    """Tests for the SecurityEvent enum."""

    def test_all_event_types_exist(self):
        """Verify all required security event types are defined."""
        expected_events = [
            "COMMAND_DENIED",
            "METACHAR_BLOCKED",
            "PATH_TRAVERSAL_BLOCKED",
            "EXTENSION_BLOCKED",
            "SELF_MODIFICATION_BLOCKED",
            "FILE_SIZE_EXCEEDED",
            "FILE_COUNT_EXCEEDED",
            "SYMLINK_ESCAPE_BLOCKED",
            "SECURITY_PATTERN_DETECTED",
            "DENIED_PATH_WRITE",
        ]
        for event_name in expected_events:
            assert hasattr(SecurityEvent, event_name), f"Missing SecurityEvent.{event_name}"
            assert SecurityEvent[event_name].value == event_name

    def test_security_event_is_string_enum(self):
        """Verify SecurityEvent values are strings for easy logging."""
        event = SecurityEvent.COMMAND_DENIED
        assert isinstance(event.value, str)
        assert event.value == "COMMAND_DENIED"


class TestAuditLoggerSecurityLogging:
    """Tests for AuditLogger security event logging."""

    @pytest.fixture
    def temp_repo(self):
        """Create a temporary repository directory."""
        with tempfile.TemporaryDirectory() as tmpdir:
            repo_path = Path(tmpdir)
            yield repo_path

    @pytest.fixture
    def audit_logger(self, temp_repo, request):
        """Create an AuditLogger instance for testing.

        Registers a finalizer to close the file handles so that the temporary
        directory can be cleaned up on all platforms (Finding 57).
        """
        logger = AuditLogger(temp_repo)
        request.addfinalizer(logger.close)
        return logger

    def test_security_log_file_created(self, temp_repo, audit_logger):
        """Verify security.log file is created on initialization."""
        security_log = temp_repo / ".codelicious" / "security.log"
        assert security_log.exists()

    def test_audit_log_file_created(self, temp_repo, audit_logger):
        """Verify audit.log file is created on initialization."""
        audit_log = temp_repo / ".codelicious" / "audit.log"
        assert audit_log.exists()

    def test_set_iteration(self, audit_logger):
        """Verify iteration can be set."""
        audit_logger.set_iteration(5)
        assert audit_logger._current_iteration == 5

    def test_set_current_tool(self, audit_logger):
        """Verify current tool can be set."""
        audit_logger.set_current_tool("write_file")
        assert audit_logger._current_tool == "write_file"

    def test_log_security_event_writes_to_both_logs(self, temp_repo, audit_logger):
        """Verify security events are logged to both audit.log and security.log."""
        audit_logger.set_iteration(10)
        audit_logger.set_current_tool("run_command")
        audit_logger.log_security_event(
            SecurityEvent.COMMAND_DENIED,
            "'rm -rf /' base binary 'rm' is in denied list",
        )

        audit_log = temp_repo / ".codelicious" / "audit.log"
        security_log = temp_repo / ".codelicious" / "security.log"

        audit_content = audit_log.read_text()
        security_content = security_log.read_text()

        # Both logs should contain the event
        assert "COMMAND_DENIED" in audit_content
        assert "COMMAND_DENIED" in security_content

        # Both should include iteration and tool context
        assert "iteration 10" in audit_content
        assert "tool: run_command" in audit_content
        assert "iteration 10" in security_content
        assert "tool: run_command" in security_content

        # Both should include the message
        assert "'rm -rf /'" in audit_content
        assert "'rm -rf /'" in security_content

    def test_log_security_event_format(self, temp_repo, audit_logger):
        """Verify the security log format matches the spec."""
        audit_logger.set_iteration(18)
        audit_logger.set_current_tool("write_file")
        audit_logger.log_security_event(
            SecurityEvent.SELF_MODIFICATION_BLOCKED,
            "LLM attempted to write .codelicious/config.json",
        )

        security_log = temp_repo / ".codelicious" / "security.log"
        content = security_log.read_text()

        # Format should be:
        # 2026-03-15T15:06:23Z [SECURITY] EVENT_NAME: message (iteration N, tool: tool_name)
        assert "[SECURITY]" in content
        assert "SELF_MODIFICATION_BLOCKED:" in content
        assert "LLM attempted to write .codelicious/config.json" in content
        assert "(iteration 18, tool: write_file)" in content

    def test_log_security_event_with_override(self, temp_repo, audit_logger):
        """Verify iteration and tool can be overridden for specific events."""
        audit_logger.set_iteration(5)
        audit_logger.set_current_tool("some_tool")

        # Log with overridden values
        audit_logger.log_security_event(
            SecurityEvent.PATH_TRAVERSAL_BLOCKED,
            "Attempted to escape sandbox",
            iteration=99,
            tool="malicious_tool",
        )

        security_log = temp_repo / ".codelicious" / "security.log"
        content = security_log.read_text()

        # Should use overridden values
        assert "iteration 99" in content
        assert "tool: malicious_tool" in content

        # Original values should be restored
        assert audit_logger._current_iteration == 5
        assert audit_logger._current_tool == "some_tool"

    def test_all_security_event_categories_log_correctly(self, temp_repo, audit_logger):
        """Verify all security event categories produce correct log entries."""
        audit_logger.set_iteration(1)
        audit_logger.set_current_tool("test_tool")

        events_and_messages = [
            (SecurityEvent.COMMAND_DENIED, "Command blocked"),
            (SecurityEvent.METACHAR_BLOCKED, "Metacharacter blocked"),
            (SecurityEvent.PATH_TRAVERSAL_BLOCKED, "Path traversal blocked"),
            (SecurityEvent.EXTENSION_BLOCKED, "Extension blocked"),
            (SecurityEvent.SELF_MODIFICATION_BLOCKED, "Self modification blocked"),
            (SecurityEvent.FILE_SIZE_EXCEEDED, "File size exceeded"),
            (SecurityEvent.FILE_COUNT_EXCEEDED, "File count exceeded"),
            (SecurityEvent.SYMLINK_ESCAPE_BLOCKED, "Symlink escape blocked"),
            (SecurityEvent.SECURITY_PATTERN_DETECTED, "Security pattern detected"),
            (SecurityEvent.DENIED_PATH_WRITE, "Denied path write"),
        ]

        for event, message in events_and_messages:
            audit_logger.log_security_event(event, message)

        security_log = temp_repo / ".codelicious" / "security.log"
        content = security_log.read_text()

        # Verify all events were logged
        for event, message in events_and_messages:
            assert event.value in content, f"Missing {event.value} in security.log"
            assert message in content, f"Missing message '{message}' in security.log"

    def test_log_sandbox_violation_with_event_type(self, temp_repo, audit_logger):
        """Verify log_sandbox_violation uses security logging when event_type is provided."""
        audit_logger.set_iteration(23)
        audit_logger.set_current_tool("run_command")
        audit_logger.log_sandbox_violation(
            "Blocked metacharacter '|' in command",
            event_type=SecurityEvent.METACHAR_BLOCKED,
        )

        security_log = temp_repo / ".codelicious" / "security.log"
        content = security_log.read_text()

        assert "METACHAR_BLOCKED" in content
        assert "Blocked metacharacter '|'" in content
        assert "iteration 23" in content

    def test_log_sandbox_violation_without_event_type(self, temp_repo, audit_logger):
        """Verify log_sandbox_violation falls back to legacy format without event_type."""
        audit_logger.log_sandbox_violation("Generic sandbox violation")

        audit_log = temp_repo / ".codelicious" / "audit.log"
        security_log = temp_repo / ".codelicious" / "security.log"

        audit_content = audit_log.read_text()
        security_content = security_log.read_text()

        # Should be in audit.log with legacy format
        assert "SANDBOX TRAP" in audit_content
        assert "Generic sandbox violation" in audit_content

        # Should NOT be in security.log (legacy format doesn't write there)
        assert "Generic sandbox violation" not in security_content

    def test_security_log_only_contains_security_events(self, temp_repo, audit_logger):
        """Verify security.log only contains security events, not tool intents/outcomes.

        Finding 58: the negative assertion 'read_file' not in security_content is only
        meaningful if the file is non-empty and the expected security event IS present.
        Positive assertions are checked first to ensure the file has real content.
        """
        audit_logger.log_tool_intent("read_file", {"path": "test.txt"})
        audit_logger.log_tool_outcome("read_file", {"success": True, "stdout": "content"})
        audit_logger.log_security_event(SecurityEvent.COMMAND_DENIED, "Blocked command")

        security_log = temp_repo / ".codelicious" / "security.log"
        audit_log = temp_repo / ".codelicious" / "audit.log"

        security_content = security_log.read_text()
        audit_content = audit_log.read_text()

        # Positive assertions first: security.log is non-empty and contains the expected event
        assert len(security_content) > 0, "security.log must not be empty after logging a security event"
        assert "COMMAND_DENIED" in security_content, "Expected COMMAND_DENIED in security.log"
        assert "Blocked command" in security_content, "Expected event message in security.log"

        # Negative assertion is now meaningful because the file is confirmed non-empty
        assert "read_file" not in security_content, "Tool intent/outcome must not appear in security.log"

        # Audit log should have everything
        assert "COMMAND_DENIED" in audit_content
        assert "read_file" in audit_content

    def test_timestamp_format(self, temp_repo, audit_logger):
        """Verify timestamp format is ISO 8601 (YYYY-MM-DDThh:mm:ssZ).

        Finding 59: the original test relied on wall-clock time, making it fragile
        under time zone changes or slow CI. We now use a fixed datetime mock so the
        expected timestamp is fully deterministic, and we validate the exact value
        rather than just the regex match.
        """
        import datetime
        import re
        from unittest.mock import MagicMock, patch

        fixed_dt = datetime.datetime(2026, 3, 15, 15, 6, 23, tzinfo=datetime.timezone.utc)

        # Build a mock that replaces the datetime module used inside audit_logger.
        # We need datetime.datetime.now() to return fixed_dt, and the returned
        # object must have a working strftime() so the format string is applied.
        mock_datetime_module = MagicMock()
        mock_datetime_module.datetime.now.return_value = fixed_dt
        mock_datetime_module.timezone = datetime.timezone

        with patch("codelicious.tools.audit_logger.datetime", mock_datetime_module):
            audit_logger.log_security_event(SecurityEvent.COMMAND_DENIED, "Test message")

        security_log = temp_repo / ".codelicious" / "security.log"
        content = security_log.read_text()

        # Verify the exact fixed timestamp appears in the log
        assert "2026-03-15T15:06:23Z" in content, f"Expected fixed timestamp in log, got: {content!r}"

        # Also validate the general ISO 8601 pattern so the format is not
        # accidentally changed in a later refactor without this test catching it.
        iso_pattern = r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z"
        assert re.search(iso_pattern, content), "Timestamp should be ISO 8601 format (YYYY-MM-DDThh:mm:ssZ)"


class TestAuditFormatter:
    """Tests for the AuditFormatter class (spec-08 Phase 8)."""

    def test_importing_audit_logger_does_not_mutate_global_log_levels(self):
        """Verify importing audit_logger does not mutate global logging state.

        This is the key fix: previously, module-level calls to logging.addLevelName()
        would inject ANSI escape codes into ALL loggers in the entire process.

        Uses importlib.reload() to re-import the module in a clean state so the test
        is not order-dependent on other tests that may have already imported the module.
        """
        import importlib

        import codelicious.tools.audit_logger as audit_logger_module

        # Snapshot global level names before reload
        info_before = logging.getLevelName(logging.INFO)
        warning_before = logging.getLevelName(logging.WARNING)
        error_before = logging.getLevelName(logging.ERROR)

        # Reload the module — this re-executes all module-level code
        importlib.reload(audit_logger_module)

        # After reload, global level names must remain unchanged
        info_after = logging.getLevelName(logging.INFO)
        warning_after = logging.getLevelName(logging.WARNING)
        error_after = logging.getLevelName(logging.ERROR)

        assert info_after == info_before, f"INFO changed after reload: '{info_before}' -> '{info_after}'"
        assert warning_after == warning_before, f"WARNING changed after reload: '{warning_before}' -> '{warning_after}'"
        assert error_after == error_before, f"ERROR changed after reload: '{error_before}' -> '{error_after}'"

        # The standard Python level names must not contain ANSI escape codes
        assert "\033" not in info_after, "INFO level name should not contain ANSI codes"
        assert "\033" not in warning_after, "WARNING level name should not contain ANSI codes"
        assert "\033" not in error_after, "ERROR level name should not contain ANSI codes"

        # Verify the actual values are the expected Python defaults
        assert info_after == "INFO", f"Expected 'INFO', got '{info_after}'"
        assert warning_after == "WARNING", f"Expected 'WARNING', got '{warning_after}'"
        assert error_after == "ERROR", f"Expected 'ERROR', got '{error_after}'"

    def test_formatter_with_color_enabled(self):
        """Verify AuditFormatter includes ANSI codes when use_color=True."""
        from codelicious.tools.audit_logger import AuditFormatter

        formatter = AuditFormatter("%(levelname)s %(message)s", use_color=True)

        # Create a test log record
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="test.py",
            lineno=1,
            msg="Test message",
            args=(),
            exc_info=None,
        )

        formatted = formatter.format(record)

        # Should contain ANSI escape codes for color
        assert "\033[1;36m" in formatted, "INFO with color should have cyan ANSI code"
        assert "[AGENT INFO]" in formatted, "Should have custom level name"
        assert "Test message" in formatted

    def test_formatter_with_color_disabled(self):
        """Verify AuditFormatter uses plain text when use_color=False."""
        from codelicious.tools.audit_logger import AuditFormatter

        formatter = AuditFormatter("%(levelname)s %(message)s", use_color=False)

        # Create a test log record
        record = logging.LogRecord(
            name="test",
            level=logging.WARNING,
            pathname="test.py",
            lineno=1,
            msg="Warning message",
            args=(),
            exc_info=None,
        )

        formatted = formatter.format(record)

        # Should NOT contain ANSI escape codes
        assert "\033" not in formatted, "Non-TTY output should not have ANSI codes"
        assert "[AGENT WARN]" in formatted, "Should have custom level name"
        assert "Warning message" in formatted

    def test_formatter_error_level_with_color(self):
        """Verify ERROR level formatting with color enabled."""
        from codelicious.tools.audit_logger import AuditFormatter

        formatter = AuditFormatter("%(levelname)s %(message)s", use_color=True)

        record = logging.LogRecord(
            name="test",
            level=logging.ERROR,
            pathname="test.py",
            lineno=1,
            msg="Error message",
            args=(),
            exc_info=None,
        )

        formatted = formatter.format(record)

        # Should contain red ANSI code for errors
        assert "\033[1;31m" in formatted, "ERROR with color should have red ANSI code"
        assert "[AGENT ERROR]" in formatted
        assert "Error message" in formatted

    def test_formatter_error_level_without_color(self):
        """Verify ERROR level formatting with color disabled."""
        from codelicious.tools.audit_logger import AuditFormatter

        formatter = AuditFormatter("%(levelname)s %(message)s", use_color=False)

        record = logging.LogRecord(
            name="test",
            level=logging.ERROR,
            pathname="test.py",
            lineno=1,
            msg="Error message",
            args=(),
            exc_info=None,
        )

        formatted = formatter.format(record)

        # Should NOT contain ANSI escape codes
        assert "\033" not in formatted
        assert "[AGENT ERROR]" in formatted
        assert "Error message" in formatted

    def test_formatter_unknown_level_unchanged(self):
        """Verify levels not in COLORS/PLAIN dict are left unchanged."""
        from codelicious.tools.audit_logger import AuditFormatter

        formatter = AuditFormatter("%(levelname)s %(message)s", use_color=True)

        # DEBUG is not in our COLORS dict
        record = logging.LogRecord(
            name="test",
            level=logging.DEBUG,
            pathname="test.py",
            lineno=1,
            msg="Debug message",
            args=(),
            exc_info=None,
        )

        formatted = formatter.format(record)

        # Should use standard DEBUG level name
        assert "DEBUG" in formatted or "debug" in formatted.lower()
        assert "Debug message" in formatted


# ---------------------------------------------------------------------------
# spec-22 Phase 6: AuditFormatter preserves original levelname
# ---------------------------------------------------------------------------


class TestAuditFormatterLevelnameRestore:
    """AuditFormatter must not permanently mutate record.levelname (spec-22 Phase 6)."""

    def test_levelname_restored_after_format_with_color(self):
        """After format(), the record's levelname must be the original value."""
        from codelicious.tools.audit_logger import AuditFormatter

        formatter = AuditFormatter("%(levelname)s %(message)s", use_color=True)
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="",
            lineno=0,
            msg="test message",
            args=(),
            exc_info=None,
        )
        original = record.levelname
        formatter.format(record)
        assert record.levelname == original, "levelname must be restored after format()"

    def test_levelname_restored_after_format_without_color(self):
        """Plain (no color) mode also must restore levelname."""
        from codelicious.tools.audit_logger import AuditFormatter

        formatter = AuditFormatter("%(levelname)s %(message)s", use_color=False)
        record = logging.LogRecord(
            name="test",
            level=logging.WARNING,
            pathname="",
            lineno=0,
            msg="warn msg",
            args=(),
            exc_info=None,
        )
        original = record.levelname
        formatter.format(record)
        assert record.levelname == original

    def test_two_formatters_do_not_corrupt_each_other(self):
        """When two formatters process the same record, neither corrupts the other."""
        from codelicious.tools.audit_logger import AuditFormatter

        color_fmt = AuditFormatter("%(levelname)s", use_color=True)
        plain_fmt = AuditFormatter("%(levelname)s", use_color=False)

        record = logging.LogRecord(
            name="test",
            level=logging.ERROR,
            pathname="",
            lineno=0,
            msg="err",
            args=(),
            exc_info=None,
        )
        original = record.levelname
        color_fmt.format(record)
        assert record.levelname == original
        plain_fmt.format(record)
        assert record.levelname == original


# ---------------------------------------------------------------------------
# spec-20 Phase 9: AuditLogger thread safety tests (S20-P2-11)
# ---------------------------------------------------------------------------


class TestAuditLoggerThreadSafety:
    """Tests for S20-P2-11: AuditLogger thread-safe writes."""

    def test_audit_logger_lock_exists(self, tmp_path: Path) -> None:
        """AuditLogger must have a threading.Lock instance."""
        import threading

        audit = AuditLogger(tmp_path)
        assert hasattr(audit, "_write_lock")
        assert isinstance(audit._write_lock, type(threading.Lock()))
        audit.close()

    def test_audit_logger_thread_safe_write(self, tmp_path: Path) -> None:
        """10 threads x 50 writes must produce exactly 500 lines in audit.log."""
        import concurrent.futures

        audit = AuditLogger(tmp_path)

        def writer(thread_id: int):
            for i in range(50):
                audit.log_tool_intent(f"tool_{thread_id}", {"i": i})

        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
            futures = [pool.submit(writer, tid) for tid in range(10)]
            for f in futures:
                f.result()

        audit.close()
        lines = audit.log_file.read_text(encoding="utf-8").strip().splitlines()
        assert len(lines) == 500, f"Expected 500 lines, got {len(lines)}"

    def test_audit_logger_no_interleaved_output(self, tmp_path: Path) -> None:
        """Each line in audit.log must be a complete log entry (no partial lines)."""
        import concurrent.futures

        audit = AuditLogger(tmp_path)

        def writer(thread_id: int):
            for i in range(20):
                audit.log_tool_intent(f"thread_{thread_id}_tool", {"idx": i})

        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
            futures = [pool.submit(writer, tid) for tid in range(5)]
            for f in futures:
                f.result()

        audit.close()
        lines = audit.log_file.read_text(encoding="utf-8").strip().splitlines()
        for line in lines:
            # Each line must start with a timestamp bracket and contain TOOL_DISPATCH
            assert line.startswith("["), f"Incomplete line: {line[:80]}"
            assert "TOOL_DISPATCH" in line, f"Missing tag: {line[:80]}"

    def test_audit_logger_concurrent_write_ordering(self, tmp_path: Path) -> None:
        """All entries from each thread must appear in audit.log (no drops)."""
        import concurrent.futures

        audit = AuditLogger(tmp_path)

        def writer(thread_id: int):
            for i in range(10):
                audit.log_tool_intent(f"t{thread_id}", {"seq": i})

        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            futures = [pool.submit(writer, tid) for tid in range(8)]
            for f in futures:
                f.result()

        audit.close()
        content = audit.log_file.read_text(encoding="utf-8")
        # 8 threads x 10 entries = 80 lines
        lines = content.strip().splitlines()
        assert len(lines) == 80

    def test_audit_logger_large_entry_atomicity(self, tmp_path: Path) -> None:
        """A large tool intent entry must be written atomically (not split across lines)."""
        import concurrent.futures

        audit = AuditLogger(tmp_path)
        large_args = {"data": "x" * 5000}

        def writer():
            for _ in range(5):
                audit.log_tool_intent("large_tool", large_args)

        with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
            futures = [pool.submit(writer) for _ in range(4)]
            for f in futures:
                f.result()

        audit.close()
        lines = audit.log_file.read_text(encoding="utf-8").strip().splitlines()
        assert len(lines) == 20
        for line in lines:
            assert "large_tool" in line
            assert line.startswith("[")
