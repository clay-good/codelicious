"""Tests for ToolRegistry module.

Covers initialisation, dispatch routing, audit logging, schema generation,
call-rate limiting, and error handling.  All heavy dependencies (FSTooling,
CommandRunner, AuditLogger, RagEngine, CacheManager) are mocked at import
time so no real filesystem or database access occurs.
"""

from __future__ import annotations

import pathlib
from unittest.mock import MagicMock, patch

import pytest

from codelicious.tools.registry import ToolCallLimitError, ToolRegistry

# ---------------------------------------------------------------------------
# Helper: build a fully-mocked ToolRegistry
# ---------------------------------------------------------------------------


def _make_registry(tmp_path: pathlib.Path, config: dict | None = None) -> ToolRegistry:
    """Return a ToolRegistry with all external dependencies mocked out.

    Uses patch() as a context manager so the mocks are active during
    __init__ and the instance keeps references to the mock objects.
    """
    if config is None:
        config = {"allowlisted_commands": ["pytest"]}

    with (
        patch("codelicious.tools.registry.FSTooling"),
        patch("codelicious.tools.registry.CommandRunner"),
        patch("codelicious.tools.registry.AuditLogger"),
        patch("codelicious.tools.registry.RagEngine"),
    ):
        reg = ToolRegistry(
            repo_path=tmp_path,
            config=config,
            cache_manager=MagicMock(),
        )
    return reg


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_known_tool_dispatches(tmp_path: pathlib.Path) -> None:
    """Dispatching a known tool name calls the registered function with the given kwargs."""
    reg = _make_registry(tmp_path)
    expected = {"success": True, "stdout": "file content", "stderr": ""}
    mock_fn = MagicMock(return_value=expected)
    reg.registry["read_file"] = mock_fn

    result = reg.dispatch("read_file", {"rel_path": "src/main.py"})

    mock_fn.assert_called_once_with(rel_path="src/main.py")
    assert result == expected


def test_unknown_tool_returns_error(tmp_path: pathlib.Path) -> None:
    """Dispatching a tool name not in the registry returns a success=False dict."""
    reg = _make_registry(tmp_path)

    result = reg.dispatch("nonexistent_tool", {})

    assert result["success"] is False
    assert "nonexistent_tool" in result["stderr"]
    assert result["stdout"] == ""


def test_argument_validation_returns_error(tmp_path: pathlib.Path) -> None:
    """A tool that raises TypeError (wrong kwargs) returns success=False with the error text."""
    reg = _make_registry(tmp_path)
    reg.registry["read_file"] = MagicMock(side_effect=TypeError("unexpected keyword argument"))

    # Provide required param to pass validation, but mock raises TypeError
    result = reg.dispatch("read_file", {"rel_path": "test.py"})

    assert result["success"] is False
    assert "unexpected keyword argument" in result["stderr"]
    assert result["stdout"] == ""


def test_missing_required_param_raises_validation_error(tmp_path: pathlib.Path) -> None:
    """Dispatch with missing required param raises ToolValidationError (spec-18 Phase 9)."""
    from codelicious.errors import ToolValidationError

    reg = _make_registry(tmp_path)

    with pytest.raises(ToolValidationError, match="missing required parameter: rel_path"):
        reg.dispatch("read_file", {})


def test_write_file_missing_content_raises_validation_error(tmp_path: pathlib.Path) -> None:
    """write_file without content raises ToolValidationError (spec-18 Phase 9)."""
    from codelicious.errors import ToolValidationError

    reg = _make_registry(tmp_path)

    with pytest.raises(ToolValidationError, match="missing required parameter: content"):
        reg.dispatch("write_file", {"rel_path": "test.py"})


def test_return_value_passthrough(tmp_path: pathlib.Path) -> None:
    """dispatch() returns the exact dict that the tool function returns."""
    reg = _make_registry(tmp_path)
    expected = {"success": True, "stdout": "ok", "stderr": ""}
    reg.registry["write_file"] = MagicMock(return_value=expected)

    result = reg.dispatch("write_file", {"rel_path": "out.py", "content": "pass\n"})

    assert result is expected


def test_audit_log_on_dispatch(tmp_path: pathlib.Path) -> None:
    """dispatch() calls log_tool_intent before and log_tool_outcome after a successful tool call."""
    reg = _make_registry(tmp_path)
    tool_result = {"success": True, "stdout": "ok", "stderr": ""}
    reg.registry["run_command"] = MagicMock(return_value=tool_result)

    reg.dispatch("run_command", {"command": "pytest"})

    reg.audit.log_tool_intent.assert_called_once_with("run_command", {"command": "pytest"})
    reg.audit.log_tool_outcome.assert_called_once_with("run_command", tool_result)


def test_generate_schema_returns_5_tools(tmp_path: pathlib.Path) -> None:
    """generate_schema() returns a list of exactly 5 dicts, one per registered tool."""
    reg = _make_registry(tmp_path)

    schema = reg.generate_schema()

    assert isinstance(schema, list)
    assert len(schema) == 5

    expected_names = {"read_file", "write_file", "list_directory", "run_command", "semantic_search"}
    returned_names = {entry["function"]["name"] for entry in schema}
    assert returned_names == expected_names


def test_tool_call_limit_raises(tmp_path: pathlib.Path) -> None:
    """When max_calls_per_iteration=2 and dispatch is called a 3rd time, ToolCallLimitError is raised."""
    reg = _make_registry(tmp_path, config={"allowlisted_commands": ["pytest"], "max_calls_per_iteration": 2})
    tool_result = {"success": True, "stdout": "", "stderr": ""}
    reg.registry["read_file"] = MagicMock(return_value=tool_result)

    reg.dispatch("read_file", {"rel_path": "a.py"})
    reg.dispatch("read_file", {"rel_path": "b.py"})

    with pytest.raises(ToolCallLimitError):
        reg.dispatch("read_file", {"rel_path": "c.py"})


def test_reset_call_count(tmp_path: pathlib.Path) -> None:
    """After hitting the limit, reset_call_count() allows dispatch to succeed again."""
    reg = _make_registry(tmp_path, config={"allowlisted_commands": ["pytest"], "max_calls_per_iteration": 1})
    tool_result = {"success": True, "stdout": "", "stderr": ""}
    reg.registry["read_file"] = MagicMock(return_value=tool_result)

    reg.dispatch("read_file", {"rel_path": "a.py"})

    with pytest.raises(ToolCallLimitError):
        reg.dispatch("read_file", {"rel_path": "b.py"})

    reg.reset_call_count()

    # Should not raise after reset
    result = reg.dispatch("read_file", {"rel_path": "c.py"})
    assert result["success"] is True


def test_close_calls_audit_close(tmp_path: pathlib.Path) -> None:
    """close() delegates to audit.close() to release file handles."""
    reg = _make_registry(tmp_path)

    reg.close()

    reg.audit.close.assert_called_once()


def test_exception_in_tool_returns_error(tmp_path: pathlib.Path) -> None:
    """A tool that raises RuntimeError returns success=False with 'Internal Tool Fault' in stderr."""
    reg = _make_registry(tmp_path)
    reg.registry["semantic_search"] = MagicMock(side_effect=RuntimeError("db connection lost"))

    result = reg.dispatch("semantic_search", {"query": "auth middleware"})

    assert result["success"] is False
    assert "Internal Tool Fault" in result["stderr"]
    assert "db connection lost" in result["stderr"]
    assert result["stdout"] == ""


def test_custom_max_calls_from_config(tmp_path: pathlib.Path) -> None:
    """The max_calls_per_iteration config key controls the enforced call limit."""
    reg = _make_registry(tmp_path, config={"allowlisted_commands": ["pytest"], "max_calls_per_iteration": 10})

    assert reg._max_calls_per_iteration == 10

    tool_result = {"success": True, "stdout": "", "stderr": ""}
    reg.registry["read_file"] = MagicMock(return_value=tool_result)

    # 10 calls should succeed
    for i in range(10):
        reg.dispatch("read_file", {"rel_path": f"file{i}.py"})

    # 11th call must raise
    with pytest.raises(ToolCallLimitError):
        reg.dispatch("read_file", {"rel_path": "over_limit.py"})


# ---------------------------------------------------------------------------
# spec-21 Phase 16c: registry.py — dispatch unknown tool and audit logging
# ---------------------------------------------------------------------------


class TestRegistryCoverageS21:
    """Additional registry tests for spec-21 Phase 16c."""

    def test_dispatch_unknown_tool_returns_failure(self, tmp_path: pathlib.Path) -> None:
        """Dispatching an unregistered tool must return success=False with error message."""
        reg = _make_registry(tmp_path)
        result = reg.dispatch("nonexistent_tool_xyz", {})
        assert result["success"] is False
        assert "does not exist" in result["stderr"]

    def test_dispatch_calls_audit_logger(self, tmp_path: pathlib.Path) -> None:
        """dispatch() must log tool intent via the audit logger (self.audit)."""
        reg = _make_registry(tmp_path)
        tool_result = {"success": True, "stdout": "ok", "stderr": ""}
        reg.registry["read_file"] = MagicMock(return_value=tool_result)
        reg.dispatch("read_file", {"rel_path": "test.py"})
        # Verify audit logger was called (log_tool_intent + log_tool_outcome)
        reg.audit.log_tool_intent.assert_called()
        reg.audit.log_tool_outcome.assert_called()


# ---------------------------------------------------------------------------
# Unique error-path tests from spec-83 (merged from test_tool_registry.py)
# ---------------------------------------------------------------------------


class TestDispatchTypeErrorAudit:
    """Verify audit logging behaviour for TypeError-raising tools."""

    def test_type_error_audit_outcome_logged(self, tmp_path: pathlib.Path) -> None:
        """AuditLogger.log_tool_outcome is called with the error dict on TypeError."""
        reg = _make_registry(tmp_path)
        reg.registry["type_err_tool"] = MagicMock(side_effect=TypeError("bad"))
        result = reg.dispatch("type_err_tool", {})
        reg.audit.log_tool_outcome.assert_called_once_with("type_err_tool", result)


class TestDispatchRuntimeErrorAudit:
    """Verify audit logging behaviour for RuntimeError-raising tools."""

    def test_runtime_error_logs_sandbox_violation(self, tmp_path: pathlib.Path) -> None:
        """AuditLogger.log_sandbox_violation is called for RuntimeError faults."""
        reg = _make_registry(tmp_path)
        reg.registry["crash_tool"] = MagicMock(side_effect=RuntimeError("boom"))
        reg.dispatch("crash_tool", {})
        reg.audit.log_sandbox_violation.assert_called()

    def test_runtime_error_does_not_call_log_tool_outcome(self, tmp_path: pathlib.Path) -> None:
        """RuntimeError path calls log_sandbox_violation, NOT log_tool_outcome."""
        reg = _make_registry(tmp_path)
        reg.registry["crash_tool"] = MagicMock(side_effect=RuntimeError("boom"))
        reg.dispatch("crash_tool", {})
        reg.audit.log_tool_outcome.assert_not_called()


class TestToolDispatchTimeout:
    """Tests for per-tool timeout (spec-18 Phase 6: TE-2)."""

    def test_tool_timeout_error_exists(self) -> None:
        """ToolTimeoutError can be imported from errors."""
        from codelicious.errors import ToolTimeoutError

        assert issubclass(ToolTimeoutError, Exception)
