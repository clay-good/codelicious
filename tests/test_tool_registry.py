"""Tests for ToolRegistry.dispatch error paths.

Finding 83: ToolRegistry.dispatch error paths not tested.
Covers:
- Dispatch with unknown tool name returns error dict
- TypeError-raising tool returns error dict
- RuntimeError-raising tool returns error dict
- Verifies exact error dict format
"""

from __future__ import annotations

import pathlib
from unittest import mock

import pytest

from codelicious.tools.registry import ToolRegistry


# ---------------------------------------------------------------------------
# Fixture: a ToolRegistry with all sub-components mocked out
# ---------------------------------------------------------------------------


@pytest.fixture
def registry(tmp_path: pathlib.Path) -> ToolRegistry:
    """Return a ToolRegistry with all external dependencies mocked.

    We mock FSTooling, CommandRunner, AuditLogger and RagEngine at class
    level so the constructor does not try to touch the filesystem or open
    database connections.
    """
    with (
        mock.patch("codelicious.tools.registry.FSTooling"),
        mock.patch("codelicious.tools.registry.CommandRunner"),
        mock.patch("codelicious.tools.registry.AuditLogger"),
        mock.patch("codelicious.tools.registry.RagEngine"),
    ):
        reg = ToolRegistry(
            repo_path=tmp_path,
            config={"allowlisted_commands": ["pytest"]},
            cache_manager=mock.MagicMock(),
        )
    return reg


# ---------------------------------------------------------------------------
# Unknown tool name
# ---------------------------------------------------------------------------


class TestDispatchUnknownTool:
    """Tests for dispatch behaviour when tool_name is not in the registry."""

    def test_unknown_tool_returns_error_dict(self, registry: ToolRegistry) -> None:
        """Dispatching an unknown tool name returns a dict with success=False."""
        result = registry.dispatch("nonexistent_tool", {})
        assert isinstance(result, dict)
        assert result["success"] is False

    def test_unknown_tool_error_contains_tool_name(self, registry: ToolRegistry) -> None:
        """The error message in stderr mentions the unknown tool name."""
        result = registry.dispatch("totally_made_up", {})
        assert "totally_made_up" in result.get("stderr", "")

    def test_unknown_tool_stdout_is_empty_string(self, registry: ToolRegistry) -> None:
        """The stdout field is an empty string for unknown-tool errors."""
        result = registry.dispatch("ghost_tool", {})
        assert result.get("stdout") == ""

    def test_audit_log_records_unknown_tool_intent(self, registry: ToolRegistry) -> None:
        """AuditLogger.log_tool_intent is still called for unknown tools."""
        registry.dispatch("unknown", {})
        registry.audit.log_tool_intent.assert_called_once_with("unknown", {})
        registry.audit.log_tool_outcome.assert_called_once()


# ---------------------------------------------------------------------------
# TypeError-raising tool
# ---------------------------------------------------------------------------


class TestDispatchTypeError:
    """Tests for dispatch behaviour when a tool raises TypeError (bad args)."""

    def test_type_error_returns_error_dict(self, registry: ToolRegistry) -> None:
        """A tool that raises TypeError returns a dict with success=False."""
        # Inject a tool that always raises TypeError
        registry.registry["bad_args_tool"] = mock.MagicMock(
            side_effect=TypeError("missing required argument: 'rel_path'")
        )
        result = registry.dispatch("bad_args_tool", {})
        assert isinstance(result, dict)
        assert result["success"] is False

    def test_type_error_message_in_stderr(self, registry: ToolRegistry) -> None:
        """The TypeError message appears in the stderr field."""
        registry.registry["bad_args_tool"] = mock.MagicMock(
            side_effect=TypeError("missing required argument: 'rel_path'")
        )
        result = registry.dispatch("bad_args_tool", {})
        assert "missing required argument" in result.get("stderr", "")

    def test_type_error_stdout_is_empty_string(self, registry: ToolRegistry) -> None:
        """The stdout field is an empty string for TypeError errors."""
        registry.registry["type_err_tool"] = mock.MagicMock(side_effect=TypeError("oops"))
        result = registry.dispatch("type_err_tool", {})
        assert result.get("stdout") == ""

    def test_type_error_audit_outcome_logged(self, registry: ToolRegistry) -> None:
        """AuditLogger.log_tool_outcome is called with the error dict."""
        registry.registry["type_err_tool"] = mock.MagicMock(side_effect=TypeError("bad"))
        result = registry.dispatch("type_err_tool", {})
        registry.audit.log_tool_outcome.assert_called_once_with("type_err_tool", result)


# ---------------------------------------------------------------------------
# RuntimeError-raising tool
# ---------------------------------------------------------------------------


class TestDispatchRuntimeError:
    """Tests for dispatch behaviour when a tool raises RuntimeError."""

    def test_runtime_error_returns_error_dict(self, registry: ToolRegistry) -> None:
        """A tool that raises RuntimeError returns a dict with success=False."""
        registry.registry["crash_tool"] = mock.MagicMock(side_effect=RuntimeError("Internal tool fault"))
        result = registry.dispatch("crash_tool", {})
        assert isinstance(result, dict)
        assert result["success"] is False

    def test_runtime_error_message_in_stderr(self, registry: ToolRegistry) -> None:
        """The RuntimeError message appears in the stderr field."""
        registry.registry["crash_tool"] = mock.MagicMock(side_effect=RuntimeError("disk full"))
        result = registry.dispatch("crash_tool", {})
        assert "disk full" in result.get("stderr", "")

    def test_runtime_error_stdout_is_empty_string(self, registry: ToolRegistry) -> None:
        """The stdout field is an empty string for RuntimeError faults."""
        registry.registry["crash_tool"] = mock.MagicMock(side_effect=RuntimeError("boom"))
        result = registry.dispatch("crash_tool", {})
        assert result.get("stdout") == ""

    def test_runtime_error_logs_sandbox_violation(self, registry: ToolRegistry) -> None:
        """AuditLogger.log_sandbox_violation is called for RuntimeError faults."""
        registry.registry["crash_tool"] = mock.MagicMock(side_effect=RuntimeError("boom"))
        registry.dispatch("crash_tool", {})
        registry.audit.log_sandbox_violation.assert_called()

    def test_runtime_error_does_not_call_log_tool_outcome(self, registry: ToolRegistry) -> None:
        """RuntimeError path calls log_sandbox_violation, NOT log_tool_outcome."""
        registry.registry["crash_tool"] = mock.MagicMock(side_effect=RuntimeError("boom"))
        registry.dispatch("crash_tool", {})
        registry.audit.log_tool_outcome.assert_not_called()


# ---------------------------------------------------------------------------
# Error dict format
# ---------------------------------------------------------------------------


class TestDispatchErrorDictFormat:
    """Verify the exact shape of error dicts from dispatch."""

    def test_unknown_tool_error_dict_has_required_keys(self, registry: ToolRegistry) -> None:
        """Error dicts must always contain 'success', 'stdout', 'stderr'."""
        result = registry.dispatch("no_such_tool", {})
        assert "success" in result
        assert "stdout" in result
        assert "stderr" in result

    def test_type_error_dict_has_required_keys(self, registry: ToolRegistry) -> None:
        """TypeError error dicts must contain 'success', 'stdout', 'stderr'."""
        registry.registry["t"] = mock.MagicMock(side_effect=TypeError("x"))
        result = registry.dispatch("t", {})
        assert "success" in result
        assert "stdout" in result
        assert "stderr" in result

    def test_runtime_error_dict_has_required_keys(self, registry: ToolRegistry) -> None:
        """RuntimeError error dicts must contain 'success', 'stdout', 'stderr'."""
        registry.registry["r"] = mock.MagicMock(side_effect=RuntimeError("y"))
        result = registry.dispatch("r", {})
        assert "success" in result
        assert "stdout" in result
        assert "stderr" in result

    def test_success_value_is_boolean_false(self, registry: ToolRegistry) -> None:
        """The 'success' value in error dicts is the boolean False, not a falsy string."""
        result = registry.dispatch("missing_tool", {})
        assert result["success"] is False


# ---------------------------------------------------------------------------
# Per-tool timeout (spec-18 Phase 6: TE-2)
# ---------------------------------------------------------------------------


class TestToolDispatchTimeout:
    """Tests for per-tool timeout (spec-18 Phase 6: TE-2)."""

    def test_tool_timeout_error_exists(self):
        """ToolTimeoutError can be imported from errors."""
        from codelicious.errors import ToolTimeoutError

        assert issubclass(ToolTimeoutError, Exception)
