"""Tests for security event audit logging (spec-07 Phase 6)."""

import os
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
    def audit_logger(self, temp_repo):
        """Create an AuditLogger instance for testing."""
        return AuditLogger(temp_repo)

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
            "'rm -rf /' base binary 'rm' is in denied list"
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
            "LLM attempted to write .codelicious/config.json"
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
            tool="malicious_tool"
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
            event_type=SecurityEvent.METACHAR_BLOCKED
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
        """Verify security.log only contains security events, not tool intents/outcomes."""
        audit_logger.log_tool_intent("read_file", {"path": "test.txt"})
        audit_logger.log_tool_outcome("read_file", {"success": True, "stdout": "content"})
        audit_logger.log_security_event(
            SecurityEvent.COMMAND_DENIED,
            "Blocked command"
        )

        security_log = temp_repo / ".codelicious" / "security.log"
        audit_log = temp_repo / ".codelicious" / "audit.log"

        security_content = security_log.read_text()
        audit_content = audit_log.read_text()

        # Security log should only have security event
        assert "COMMAND_DENIED" in security_content
        assert "read_file" not in security_content  # Tool intent/outcome not in security log

        # Audit log should have everything
        assert "COMMAND_DENIED" in audit_content
        assert "read_file" in audit_content

    def test_timestamp_format(self, temp_repo, audit_logger):
        """Verify timestamp format is ISO 8601."""
        import re

        audit_logger.log_security_event(
            SecurityEvent.COMMAND_DENIED,
            "Test message"
        )

        security_log = temp_repo / ".codelicious" / "security.log"
        content = security_log.read_text()

        # Should match format: 2026-03-15T15:06:23Z
        iso_pattern = r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z"
        assert re.search(iso_pattern, content), "Timestamp should be ISO 8601 format"
