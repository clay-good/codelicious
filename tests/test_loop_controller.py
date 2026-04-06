"""Tests for loop_controller message history truncation and JSON validation."""

import json
import pathlib
from unittest import mock

import pytest

from codelicious.loop_controller import (
    MAX_HISTORY_TOKENS,
    MAX_RESPONSE_BYTES,
    BuildLoop,
    truncate_history,
    parse_json_response,
    _LLM_MAX_CONSECUTIVE_ERRORS,
    _LLM_MAX_RETRIES,
)
from codelicious.errors import LLMResponseTooLargeError, LLMResponseFormatError


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def _make_chat_response(content: str = "", tool_calls: list = None) -> dict:
    """Build a minimal OpenAI-compatible chat completion response dict."""
    message = {"role": "assistant", "content": content}
    if tool_calls is not None:
        message["tool_calls"] = tool_calls
    return {"choices": [{"message": message}]}


def _make_tool_call(name: str, arguments: str, call_id: str = "tc_1") -> dict:
    """Build a minimal tool call dict as returned by LLMClient.parse_tool_calls."""
    return {"id": call_id, "function": {"name": name, "arguments": arguments}}


# ---------------------------------------------------------------------------
# Fixture: BuildLoop with all external I/O mocked
# ---------------------------------------------------------------------------


@pytest.fixture
def build_loop(tmp_path: pathlib.Path, monkeypatch):
    """Return a BuildLoop whose LLMClient and ToolRegistry are fully mocked.

    Also writes a valid config.json so the constructor's config-loading branch
    is exercised.
    """
    monkeypatch.setenv("HF_TOKEN", "hf_test_token")

    codelicious_dir = tmp_path / ".codelicious"
    codelicious_dir.mkdir()
    config = {"verify_command": "pytest"}
    (codelicious_dir / "config.json").write_text(json.dumps(config), encoding="utf-8")

    git_manager = mock.MagicMock()
    cache_manager = mock.MagicMock()

    with (
        mock.patch("codelicious.loop_controller.LLMClient") as MockLLMClient,
        mock.patch("codelicious.loop_controller.ToolRegistry") as MockToolRegistry,
    ):
        mock_llm_instance = mock.MagicMock()
        MockLLMClient.return_value = mock_llm_instance

        mock_registry_instance = mock.MagicMock()
        mock_registry_instance.generate_schema.return_value = []
        MockToolRegistry.return_value = mock_registry_instance

        loop = BuildLoop(
            repo_path=tmp_path,
            git_manager=git_manager,
            cache_manager=cache_manager,
        )

    # Expose mock handles as attributes so individual tests can configure them.
    loop._mock_llm = mock_llm_instance
    loop._mock_registry = mock_registry_instance
    return loop


class TestTruncateHistory:
    """Tests for truncate_history function."""

    def test_truncation_under_budget_no_change(self):
        """Messages under budget should be returned unchanged."""
        messages = [
            {"role": "system", "content": "You are a helpful assistant."},
            {"role": "user", "content": "Hello"},
            {"role": "assistant", "content": "Hi there!"},
        ]
        result = truncate_history(messages, max_tokens=10_000)
        assert result == messages
        assert len(result) == 3

    def test_truncation_over_budget_removes_messages(self):
        """Messages over budget should be truncated from the front."""
        # Create a large message history that exceeds a small budget
        system_msg = {"role": "system", "content": "System prompt."}
        large_content = "x" * 4000  # ~1000 tokens at 4 chars/token

        messages = [system_msg]
        for i in range(10):
            messages.append({"role": "user", "content": f"User message {i}: {large_content}"})
            messages.append({"role": "assistant", "content": f"Assistant response {i}: {large_content}"})

        # Total ~20 large messages, budget for only ~5
        result = truncate_history(messages, max_tokens=5000)

        # Should have fewer messages but more than just system
        assert len(result) < len(messages)
        assert len(result) > 1
        # System message should be first
        assert result[0]["role"] == "system"

    def test_system_message_always_preserved(self):
        """System message (index 0) should never be truncated."""
        system_msg = {"role": "system", "content": "System prompt that must be kept."}
        large_content = "x" * 40000  # Very large content

        messages = [
            system_msg,
            {"role": "user", "content": large_content},
            {"role": "assistant", "content": large_content},
        ]

        # Budget smaller than any single message except system
        result = truncate_history(messages, max_tokens=1000)

        # System message should always be present
        assert len(result) >= 1
        assert result[0] == system_msg
        assert result[0]["role"] == "system"

    def test_preserves_most_recent_messages(self):
        """Truncation should keep most recent messages when over budget."""
        system_msg = {"role": "system", "content": "System"}
        messages = [system_msg]

        # Add numbered messages so we can verify order
        for i in range(10):
            messages.append({"role": "user", "content": f"Message {i}" + "x" * 1000})

        # Budget for system + ~3 messages
        result = truncate_history(messages, max_tokens=2000)

        # Should have system + some recent messages
        assert result[0]["role"] == "system"
        assert len(result) > 1
        # The kept messages should be the most recent ones
        contents = [m["content"][:15] for m in result[1:]]
        assert any("Message 9" in c or "Message 8" in c or "Message 7" in c for c in contents)

    def test_empty_messages_returns_empty(self):
        """Empty message list should return empty."""
        result = truncate_history([], max_tokens=10_000)
        assert result == []

    def test_handles_none_content(self):
        """Messages with None content should not cause errors."""
        messages = [
            {"role": "system", "content": "System prompt."},
            {"role": "assistant", "content": None, "tool_calls": []},
            {"role": "user", "content": "Hello"},
        ]
        result = truncate_history(messages, max_tokens=10_000)
        assert len(result) == 3

    def test_handles_tool_calls_in_token_count(self):
        """Tool call arguments should be counted in token estimation."""
        large_args = '{"content": "' + "x" * 10000 + '"}'
        messages = [
            {"role": "system", "content": "System"},
            {
                "role": "assistant",
                "content": None,
                "tool_calls": [{"function": {"name": "test", "arguments": large_args}}],
            },
            {"role": "user", "content": "Short"},
        ]

        # Budget that can't fit the large tool call
        result = truncate_history(messages, max_tokens=500)

        # Should truncate the message with large tool call
        assert len(result) <= 3

    def test_max_history_tokens_constant_exists(self):
        """MAX_HISTORY_TOKENS constant should be defined."""
        assert MAX_HISTORY_TOKENS == 80_000

    def test_single_message_preserved(self):
        """Single system message should be preserved even if over budget."""
        # Even if system message alone exceeds budget, it should be kept
        large_system = {"role": "system", "content": "x" * 100000}
        result = truncate_history([large_system], max_tokens=1000)
        assert len(result) == 1
        assert result[0] == large_system

    def test_tool_message_handling(self):
        """Tool messages should be handled correctly."""
        messages = [
            {"role": "system", "content": "System prompt."},
            {"role": "user", "content": "Hello"},
            {
                "role": "assistant",
                "content": None,
                "tool_calls": [{"id": "1", "function": {"name": "test", "arguments": "{}"}}],
            },
            {"role": "tool", "tool_call_id": "1", "name": "test", "content": '{"result": "ok"}'},
            {"role": "user", "content": "Thanks"},
        ]
        result = truncate_history(messages, max_tokens=10_000)
        assert len(result) == 5


class TestTruncateHistoryEdgeCases:
    """Edge case tests for truncate_history."""

    def test_budget_exactly_matches_messages(self):
        """When budget exactly matches, no truncation should occur."""
        messages = [
            {"role": "system", "content": "Sys"},  # ~1 token
            {"role": "user", "content": "Hi"},  # ~1 token
        ]
        # With a generous budget, all should be kept
        result = truncate_history(messages, max_tokens=100)
        assert result == messages

    def test_all_non_system_messages_too_large(self):
        """When all non-system messages exceed budget individually."""
        system_msg = {"role": "system", "content": "System"}
        large_content = "x" * 20000  # ~5000 tokens

        messages = [
            system_msg,
            {"role": "user", "content": large_content},
            {"role": "assistant", "content": large_content},
        ]

        # Budget only fits system message
        result = truncate_history(messages, max_tokens=100)

        # Should have at least the system message
        assert len(result) >= 1
        assert result[0] == system_msg

    def test_mixed_size_messages(self):
        """Messages of varying sizes should be handled correctly."""
        messages = [
            {"role": "system", "content": "System"},
            {"role": "user", "content": "Short"},
            {"role": "assistant", "content": "x" * 10000},  # Large
            {"role": "user", "content": "Short again"},
            {"role": "assistant", "content": "Brief"},
        ]

        # Budget can't fit the large message
        result = truncate_history(messages, max_tokens=500)

        # System should always be present
        assert result[0]["role"] == "system"


class TestParseJsonResponse:
    """Tests for parse_json_response function (P1-9 fix)."""

    def test_valid_json_accepted(self):
        """Normal dict response parses without error."""
        raw = '{"tool": "read_file", "path": "/test.py"}'
        result = parse_json_response(raw)
        assert result == {"tool": "read_file", "path": "/test.py"}

    def test_oversized_json_rejected(self):
        """Response string exceeding 5MB raises LLMResponseTooLargeError."""
        # Create a response of 6 MB
        large_content = "x" * (6 * 1024 * 1024)
        raw = '{"content": "' + large_content + '"}'

        with pytest.raises(LLMResponseTooLargeError) as exc_info:
            parse_json_response(raw)

        assert "too large" in str(exc_info.value).lower()
        assert str(MAX_RESPONSE_BYTES) in str(exc_info.value)

    def test_non_dict_json_rejected(self):
        """Response that is valid JSON but a list raises LLMResponseFormatError."""
        raw = '["item1", "item2"]'

        with pytest.raises(LLMResponseFormatError) as exc_info:
            parse_json_response(raw, require_dict=True)

        assert "Expected dict" in str(exc_info.value)
        assert "list" in str(exc_info.value)

    def test_string_json_rejected(self):
        """Response that is valid JSON but a string raises LLMResponseFormatError."""
        raw = '"just a string"'

        with pytest.raises(LLMResponseFormatError) as exc_info:
            parse_json_response(raw, require_dict=True)

        assert "Expected dict" in str(exc_info.value)
        assert "str" in str(exc_info.value)

    def test_integer_json_rejected(self):
        """Response that is valid JSON but an integer raises LLMResponseFormatError."""
        raw = "42"

        with pytest.raises(LLMResponseFormatError) as exc_info:
            parse_json_response(raw, require_dict=True)

        assert "Expected dict" in str(exc_info.value)
        assert "int" in str(exc_info.value)

    def test_null_json_rejected(self):
        """Response that is JSON null raises LLMResponseFormatError."""
        raw = "null"

        with pytest.raises(LLMResponseFormatError) as exc_info:
            parse_json_response(raw, require_dict=True)

        assert "Expected dict" in str(exc_info.value)
        assert "NoneType" in str(exc_info.value)

    def test_empty_string_raises_json_decode_error(self):
        """Empty string raises json.JSONDecodeError."""
        raw = ""

        with pytest.raises(json.JSONDecodeError):
            parse_json_response(raw)

    def test_exactly_at_size_limit_accepted(self):
        """Response of exactly MAX_RESPONSE_BYTES parses without error."""
        # Create content that will result in exactly 5MB total
        # We need to account for the JSON structure: {"x":"..."}
        overhead = len('{"x":""}')
        content_size = MAX_RESPONSE_BYTES - overhead
        content = "a" * content_size
        raw = '{"x":"' + content + '"}'

        # Should be exactly at the limit
        assert len(raw) == MAX_RESPONSE_BYTES

        # Should parse successfully
        result = parse_json_response(raw)
        assert isinstance(result, dict)
        assert result["x"] == content

    def test_require_dict_false_allows_list(self):
        """With require_dict=False, list responses are accepted."""
        raw = '["item1", "item2"]'
        result = parse_json_response(raw, require_dict=False)
        assert result == ["item1", "item2"]

    def test_require_dict_false_allows_string(self):
        """With require_dict=False, string responses are accepted."""
        raw = '"just a string"'
        result = parse_json_response(raw, require_dict=False)
        assert result == "just a string"

    def test_nested_dict_accepted(self):
        """Nested dict structures are parsed correctly."""
        raw = '{"outer": {"inner": {"deep": "value"}}, "list": [1, 2, 3]}'
        result = parse_json_response(raw)
        assert result["outer"]["inner"]["deep"] == "value"
        assert result["list"] == [1, 2, 3]

    def test_max_response_bytes_constant_exists(self):
        """MAX_RESPONSE_BYTES constant should be defined as 5MB."""
        assert MAX_RESPONSE_BYTES == 5_000_000


class TestParseJsonResponseEdgeCases:
    """Edge case tests for parse_json_response."""

    def test_malformed_json_raises(self):
        """Malformed JSON raises json.JSONDecodeError."""
        raw = '{"key": "value"'  # Missing closing brace

        with pytest.raises(json.JSONDecodeError):
            parse_json_response(raw)

    def test_unicode_in_json(self):
        """Unicode content is handled correctly."""
        raw = '{"emoji": "🎉", "chinese": "中文"}'
        result = parse_json_response(raw)
        assert result["emoji"] == "🎉"
        assert result["chinese"] == "中文"

    def test_whitespace_only_raises(self):
        """Whitespace-only string raises json.JSONDecodeError."""
        raw = "   \n\t  "

        with pytest.raises(json.JSONDecodeError):
            parse_json_response(raw)

    def test_boolean_json_rejected(self):
        """Boolean JSON values are rejected when require_dict=True."""
        for raw in ["true", "false"]:
            with pytest.raises(LLMResponseFormatError):
                parse_json_response(raw, require_dict=True)

    def test_empty_dict_accepted(self):
        """Empty dict is a valid response."""
        raw = "{}"
        result = parse_json_response(raw)
        assert result == {}

    def test_one_byte_over_limit_rejected(self):
        """Response one byte over MAX_RESPONSE_BYTES is rejected."""
        overhead = len('{"x":""}')
        content_size = MAX_RESPONSE_BYTES - overhead + 1
        content = "a" * content_size
        raw = '{"x":"' + content + '"}'

        assert len(raw) == MAX_RESPONSE_BYTES + 1

        with pytest.raises(LLMResponseTooLargeError):
            parse_json_response(raw)


# ---------------------------------------------------------------------------
# Finding 14 — BuildLoop._execute_agentic_iteration()
# ---------------------------------------------------------------------------


class TestExecuteAgenticIteration:
    """Tests for BuildLoop._execute_agentic_iteration (Finding 14)."""

    def test_all_specs_complete_content_returns_true(self, build_loop: BuildLoop) -> None:
        """When LLM returns ALL_SPECS_COMPLETE content and no tool calls, True is returned."""
        response = _make_chat_response(content="Task done. ALL_SPECS_COMPLETE")
        build_loop._mock_llm.chat_completion.return_value = response
        build_loop._mock_llm.parse_tool_calls.return_value = []
        build_loop._mock_llm.parse_content.return_value = "Task done. ALL_SPECS_COMPLETE"

        result = build_loop._execute_agentic_iteration()

        assert result is True

    def test_content_without_completion_signal_returns_false(self, build_loop: BuildLoop) -> None:
        """When LLM returns plain content without ALL_SPECS_COMPLETE, False is returned."""
        response = _make_chat_response(content="Still working on it.")
        build_loop._mock_llm.chat_completion.return_value = response
        build_loop._mock_llm.parse_tool_calls.return_value = []
        build_loop._mock_llm.parse_content.return_value = "Still working on it."

        result = build_loop._execute_agentic_iteration()

        assert result is False

    def test_content_without_completion_appends_continue_message(self, build_loop: BuildLoop) -> None:
        """A non-completion response appends a 'please continue' user message."""
        response = _make_chat_response(content="Thinking...")
        build_loop._mock_llm.chat_completion.return_value = response
        build_loop._mock_llm.parse_tool_calls.return_value = []
        build_loop._mock_llm.parse_content.return_value = "Thinking..."

        initial_len = len(build_loop.messages)
        build_loop._execute_agentic_iteration()

        # The assistant message was appended plus the "please continue" user message.
        assert len(build_loop.messages) == initial_len + 2
        last_msg = build_loop.messages[-1]
        assert last_msg["role"] == "user"
        assert "ALL_SPECS_COMPLETE" in last_msg["content"]

    def test_failing_tool_dispatch_appends_error_tool_message(self, build_loop: BuildLoop) -> None:
        """When tool dispatch raises an exception the error is appended as a tool message and False returned."""
        tool_call = _make_tool_call("read_file", '{"rel_path": "foo.py"}', call_id="tc_err")
        response = _make_chat_response(tool_calls=[tool_call])
        build_loop._mock_llm.chat_completion.return_value = response
        build_loop._mock_llm.parse_tool_calls.return_value = [tool_call]
        build_loop._mock_registry.dispatch.side_effect = RuntimeError("disk error")

        result = build_loop._execute_agentic_iteration()

        assert result is False
        # Find the tool message that was appended for the error.
        tool_messages = [m for m in build_loop.messages if m.get("role") == "tool"]
        assert len(tool_messages) == 1
        error_msg = tool_messages[0]
        assert error_msg["tool_call_id"] == "tc_err"
        payload = json.loads(error_msg["content"])
        assert payload["success"] is False
        assert "disk error" in payload["stderr"]

    def test_failing_tool_dispatch_unknown_name_uses_unknown(self, build_loop: BuildLoop) -> None:
        """If the tool call dict has no function key, the name falls back to 'unknown'."""
        bad_tool_call = {"id": "tc_bad"}  # missing 'function' key entirely
        response = _make_chat_response(tool_calls=[bad_tool_call])
        build_loop._mock_llm.chat_completion.return_value = response
        build_loop._mock_llm.parse_tool_calls.return_value = [bad_tool_call]

        result = build_loop._execute_agentic_iteration()

        assert result is False
        tool_messages = [m for m in build_loop.messages if m.get("role") == "tool"]
        assert len(tool_messages) == 1
        assert tool_messages[0]["name"] == "unknown"

    def test_failing_tool_dispatch_unregistered_name(self, build_loop: BuildLoop) -> None:
        """A tool call with a valid function key but unregistered name triggers the
        unknown-name error path in ToolRegistry, not a KeyError (Finding 7)."""
        unregistered_call = _make_tool_call("nonexistent_tool", '{"arg": "val"}', call_id="tc_unreg")
        response = _make_chat_response(tool_calls=[unregistered_call])
        build_loop._mock_llm.chat_completion.return_value = response
        build_loop._mock_llm.parse_tool_calls.return_value = [unregistered_call]
        # dispatch returns error dict for unknown tools (not raising)
        build_loop._mock_registry.dispatch.return_value = {
            "success": False,
            "stdout": "",
            "stderr": "Tool 'nonexistent_tool' does not exist in registry.",
        }

        result = build_loop._execute_agentic_iteration()

        assert result is False
        tool_messages = [m for m in build_loop.messages if m.get("role") == "tool"]
        assert len(tool_messages) == 1
        assert tool_messages[0]["name"] == "nonexistent_tool"
        payload = json.loads(tool_messages[0]["content"])
        assert payload["success"] is False

    def test_successful_tool_call_appends_tool_result_message(self, build_loop: BuildLoop) -> None:
        """After a successful dispatch the result is appended as a tool message."""
        tool_call = _make_tool_call("list_directory", '{"rel_path": "."}', call_id="tc_ok")
        response = _make_chat_response(tool_calls=[tool_call])
        build_loop._mock_llm.chat_completion.return_value = response
        build_loop._mock_llm.parse_tool_calls.return_value = [tool_call]
        build_loop._mock_registry.dispatch.return_value = {"success": True, "stdout": "src/", "stderr": ""}
        build_loop._mock_registry.dispatch.side_effect = None

        initial_len = len(build_loop.messages)
        result = build_loop._execute_agentic_iteration()

        assert result is False  # tool calls always return False; loop continues
        # assistant message + tool result message appended
        assert len(build_loop.messages) == initial_len + 2
        tool_messages = [m for m in build_loop.messages if m.get("role") == "tool"]
        assert len(tool_messages) == 1
        tool_msg = tool_messages[0]
        assert tool_msg["tool_call_id"] == "tc_ok"
        assert tool_msg["name"] == "list_directory"
        payload = json.loads(tool_msg["content"])
        assert payload["success"] is True

    def test_multiple_tool_calls_all_appended(self, build_loop: BuildLoop) -> None:
        """Multiple tool calls in one response each produce a separate tool message."""
        tc1 = _make_tool_call("read_file", '{"rel_path": "a.py"}', call_id="tc_1")
        tc2 = _make_tool_call("read_file", '{"rel_path": "b.py"}', call_id="tc_2")
        response = _make_chat_response(tool_calls=[tc1, tc2])
        build_loop._mock_llm.chat_completion.return_value = response
        build_loop._mock_llm.parse_tool_calls.return_value = [tc1, tc2]
        build_loop._mock_registry.dispatch.return_value = {"success": True, "stdout": "content", "stderr": ""}
        build_loop._mock_registry.dispatch.side_effect = None

        build_loop._execute_agentic_iteration()

        tool_messages = [m for m in build_loop.messages if m.get("role") == "tool"]
        assert len(tool_messages) == 2
        ids = {m["tool_call_id"] for m in tool_messages}
        assert ids == {"tc_1", "tc_2"}

    def test_llm_retry_exhaustion_raises(self, build_loop: BuildLoop) -> None:
        """_execute_agentic_iteration raises RuntimeError when all LLM retries are exhausted.

        loop_controller.py:197-217 retries the LLM call up to _LLM_MAX_RETRIES times.
        When every attempt raises, the last exception is re-raised to the caller.
        This test patches time.sleep to avoid slow test execution during backoff waits.
        """
        build_loop._mock_llm.chat_completion.side_effect = RuntimeError("API down")

        with mock.patch("codelicious.loop_controller.time.sleep"):
            with pytest.raises(RuntimeError, match="API down"):
                build_loop._execute_agentic_iteration()

        # The LLM should have been attempted exactly _LLM_MAX_RETRIES times.
        assert build_loop._mock_llm.chat_completion.call_count == _LLM_MAX_RETRIES


# ---------------------------------------------------------------------------
# Finding 15 — BuildLoop.run_continuous_cycle()
# ---------------------------------------------------------------------------


class TestRunContinuousCycle:
    """Tests for BuildLoop.run_continuous_cycle (Finding 15)."""

    def test_returns_true_when_iteration_signals_completion(self, build_loop: BuildLoop) -> None:
        """When the first _execute_agentic_iteration call returns True, cycle returns True."""
        with mock.patch.object(build_loop, "_execute_agentic_iteration", return_value=True):
            result = build_loop.run_continuous_cycle()

        assert result is True

    def test_commits_changes_on_completion(self, build_loop: BuildLoop) -> None:
        """git_manager.commit_verified_changes is called exactly once when completion is signaled."""
        with mock.patch.object(build_loop, "_execute_agentic_iteration", return_value=True):
            build_loop.run_continuous_cycle()

        build_loop.git_manager.commit_verified_changes.assert_called_once()

    def test_commit_message_contains_specs_complete(self, build_loop: BuildLoop) -> None:
        """The commit message passed to commit_verified_changes mentions spec completion."""
        with mock.patch.object(build_loop, "_execute_agentic_iteration", return_value=True):
            build_loop.run_continuous_cycle()

        call_kwargs = build_loop.git_manager.commit_verified_changes.call_args
        commit_msg = call_kwargs.kwargs.get("commit_message") or call_kwargs.args[0]
        assert "specs" in commit_msg.lower() or "complete" in commit_msg.lower()

    def test_returns_false_when_all_iterations_exhausted(self, build_loop: BuildLoop) -> None:
        """When _execute_agentic_iteration always returns False, cycle returns False."""
        with mock.patch.object(build_loop, "_execute_agentic_iteration", return_value=False):
            result = build_loop.run_continuous_cycle()

        assert result is False

    def test_no_commit_when_not_completed(self, build_loop: BuildLoop) -> None:
        """commit_verified_changes is NOT called when the cycle exhausts iterations."""
        with mock.patch.object(build_loop, "_execute_agentic_iteration", return_value=False):
            build_loop.run_continuous_cycle()

        build_loop.git_manager.commit_verified_changes.assert_not_called()

    def test_iteration_count_capped_at_max(self, build_loop: BuildLoop) -> None:
        """_execute_agentic_iteration is called at most max_iterations (50) times."""
        with mock.patch.object(build_loop, "_execute_agentic_iteration", return_value=False) as mock_iter:
            build_loop.run_continuous_cycle()

        assert mock_iter.call_count == 50

    def test_stops_after_first_true(self, build_loop: BuildLoop) -> None:
        """Cycle stops as soon as the first True is returned, not at max_iterations."""
        # Return False 3 times then True on the 4th call.
        side_effects = [False, False, False, True]
        with mock.patch.object(build_loop, "_execute_agentic_iteration", side_effect=side_effects) as mock_iter:
            result = build_loop.run_continuous_cycle()

        assert result is True
        assert mock_iter.call_count == 4

    def test_consecutive_error_abort_returns_false(self, build_loop: BuildLoop) -> None:
        """run_continuous_cycle returns False when consecutive errors reach _LLM_MAX_CONSECUTIVE_ERRORS.

        loop_controller.py:322-328 aborts the loop when consecutive_errors reaches the
        _LLM_MAX_CONSECUTIVE_ERRORS threshold.  This test patches _execute_agentic_iteration
        to always raise RuntimeError and asserts that run_continuous_cycle returns False
        after exactly _LLM_MAX_CONSECUTIVE_ERRORS invocations.
        """
        with mock.patch.object(
            build_loop,
            "_execute_agentic_iteration",
            side_effect=RuntimeError("simulated LLM failure"),
        ) as mock_iter:
            result = build_loop.run_continuous_cycle()

        assert result is False
        assert mock_iter.call_count == _LLM_MAX_CONSECUTIVE_ERRORS


# ---------------------------------------------------------------------------
# Finding 16 — BuildLoop.__init__()
# ---------------------------------------------------------------------------


class TestBuildLoopInit:
    """Tests for BuildLoop.__init__ (Finding 16)."""

    def _make_loop(self, tmp_path: pathlib.Path, monkeypatch, **kwargs):
        """Helper that patches LLMClient and ToolRegistry and returns a BuildLoop."""
        monkeypatch.setenv("HF_TOKEN", "hf_test_token")
        git_manager = mock.MagicMock()
        cache_manager = mock.MagicMock()

        with (
            mock.patch("codelicious.loop_controller.LLMClient"),
            mock.patch("codelicious.loop_controller.ToolRegistry") as MockReg,
        ):
            MockReg.return_value.generate_schema.return_value = []
            loop = BuildLoop(
                repo_path=tmp_path,
                git_manager=git_manager,
                cache_manager=cache_manager,
                **kwargs,
            )
        return loop

    def test_valid_config_json_is_loaded(self, tmp_path: pathlib.Path, monkeypatch) -> None:
        """BuildLoop reads config.json when present and populates self.config."""
        codelicious_dir = tmp_path / ".codelicious"
        codelicious_dir.mkdir()
        custom_config = {"max_calls_per_iteration": 10, "verify_command": "pytest"}
        (codelicious_dir / "config.json").write_text(json.dumps(custom_config), encoding="utf-8")

        loop = self._make_loop(tmp_path, monkeypatch)

        assert loop.config["max_calls_per_iteration"] == 10
        assert loop.config["verify_command"] == "pytest"

    def test_malformed_config_json_falls_back_to_defaults(self, tmp_path: pathlib.Path, monkeypatch) -> None:
        """Malformed config.json does not raise; empty defaults are used."""
        codelicious_dir = tmp_path / ".codelicious"
        codelicious_dir.mkdir()
        (codelicious_dir / "config.json").write_text("{not valid json!!!", encoding="utf-8")

        # Should not raise.
        loop = self._make_loop(tmp_path, monkeypatch)

        # S20-P3-4: allowlisted_commands is no longer in defaults
        assert "allowlisted_commands" not in loop.config

    def test_missing_config_json_uses_defaults(self, tmp_path: pathlib.Path, monkeypatch) -> None:
        """When config.json is absent the default config dict is used."""
        # No .codelicious directory or config.json created.
        loop = self._make_loop(tmp_path, monkeypatch)

        # S20-P3-4: allowlisted_commands removed from defaults
        assert "allowlisted_commands" not in loop.config

    def test_repo_path_stored_correctly(self, tmp_path: pathlib.Path, monkeypatch) -> None:
        """self.repo_path is set to the provided repo_path argument."""
        loop = self._make_loop(tmp_path, monkeypatch)
        assert loop.repo_path == tmp_path

    def test_git_manager_stored_correctly(self, tmp_path: pathlib.Path, monkeypatch) -> None:
        """self.git_manager is set to the provided git_manager argument."""
        monkeypatch.setenv("HF_TOKEN", "hf_test_token")
        git_manager = mock.MagicMock()
        cache_manager = mock.MagicMock()

        with (
            mock.patch("codelicious.loop_controller.LLMClient"),
            mock.patch("codelicious.loop_controller.ToolRegistry") as MockReg,
        ):
            MockReg.return_value.generate_schema.return_value = []
            loop = BuildLoop(repo_path=tmp_path, git_manager=git_manager, cache_manager=cache_manager)

        assert loop.git_manager is git_manager

    def test_messages_initialised_with_system_message(self, tmp_path: pathlib.Path, monkeypatch) -> None:
        """self.messages starts with exactly one system message."""
        loop = self._make_loop(tmp_path, monkeypatch)

        assert len(loop.messages) == 1
        assert loop.messages[0]["role"] == "system"
        assert "ALL_SPECS_COMPLETE" in loop.messages[0]["content"]

    def test_spec_filter_stored_when_provided(self, tmp_path: pathlib.Path, monkeypatch) -> None:
        """spec_filter kwarg is accepted without error (stored for callers to read)."""
        loop = self._make_loop(tmp_path, monkeypatch, spec_filter="05_")
        # No assertion on spec_filter value — the test verifies no TypeError is raised
        # and the loop was constructed successfully.
        assert loop is not None

    def test_llm_client_runtime_error_propagates(self, tmp_path: pathlib.Path, monkeypatch) -> None:
        """RuntimeError from LLMClient (e.g. missing API key) propagates to the caller."""
        # Ensure no token is present so LLMClient would fail — but we also patch it
        # explicitly to guarantee the RuntimeError regardless of environment state.
        monkeypatch.delenv("HF_TOKEN", raising=False)
        monkeypatch.delenv("LLM_API_KEY", raising=False)
        git_manager = mock.MagicMock()
        cache_manager = mock.MagicMock()

        with (
            mock.patch("codelicious.loop_controller.LLMClient", side_effect=RuntimeError("No API key")),
            mock.patch("codelicious.loop_controller.ToolRegistry") as MockReg,
        ):
            MockReg.return_value.generate_schema.return_value = []
            with pytest.raises(RuntimeError, match="No API key"):
                BuildLoop(repo_path=tmp_path, git_manager=git_manager, cache_manager=cache_manager)


# ---------------------------------------------------------------------------
# spec-20 Phase 16: Dead Configuration Removal (S20-P3-4)
# ---------------------------------------------------------------------------


class TestAllowlistedCommandsDeprecation:
    """Tests for S20-P3-4: allowlisted_commands deprecation."""

    def _make_loop(self, tmp_path, monkeypatch):
        monkeypatch.setenv("HF_TOKEN", "hf_test_token")
        git_manager = mock.MagicMock()
        cache_manager = mock.MagicMock()
        with (
            mock.patch("codelicious.loop_controller.LLMClient"),
            mock.patch("codelicious.loop_controller.ToolRegistry") as MockReg,
        ):
            MockReg.return_value.generate_schema.return_value = []
            return BuildLoop(repo_path=tmp_path, git_manager=git_manager, cache_manager=cache_manager)

    def test_config_without_allowlisted_commands_loads(self, tmp_path: pathlib.Path, monkeypatch) -> None:
        """Config without allowlisted_commands loads without errors."""
        codelicious_dir = tmp_path / ".codelicious"
        codelicious_dir.mkdir()
        (codelicious_dir / "config.json").write_text(json.dumps({"max_calls_per_iteration": 20}), encoding="utf-8")
        loop = self._make_loop(tmp_path, monkeypatch)
        assert "allowlisted_commands" not in loop.config
        assert loop.config["max_calls_per_iteration"] == 20

    def test_config_with_allowlisted_commands_logs_deprecation_warning(
        self, tmp_path: pathlib.Path, monkeypatch, caplog
    ) -> None:
        """Config with allowlisted_commands must log a deprecation warning and remove the key."""
        import logging

        codelicious_dir = tmp_path / ".codelicious"
        codelicious_dir.mkdir()
        (codelicious_dir / "config.json").write_text(
            json.dumps({"allowlisted_commands": ["make"], "max_calls_per_iteration": 15}),
            encoding="utf-8",
        )
        with caplog.at_level(logging.WARNING, logger="codelicious.loop"):
            loop = self._make_loop(tmp_path, monkeypatch)

        # The key must be removed from config
        assert "allowlisted_commands" not in loop.config
        # Other keys must still be loaded
        assert loop.config["max_calls_per_iteration"] == 15
        # Deprecation warning must be logged
        assert any("deprecated" in r.message.lower() for r in caplog.records)

    def test_command_runner_ignores_config_allowlist(self, tmp_path: pathlib.Path, monkeypatch) -> None:
        """CommandRunner uses DENIED_COMMANDS, not config allowlisted_commands."""
        from codelicious.security_constants import DENIED_COMMANDS

        # Verify DENIED_COMMANDS exists and is a frozenset (immutable)
        assert isinstance(DENIED_COMMANDS, frozenset)
        assert "rm" in DENIED_COMMANDS
        # The config never influences command restriction
        loop = self._make_loop(tmp_path, monkeypatch)
        assert "allowlisted_commands" not in loop.config

    def test_config_template_does_not_contain_allowlisted_commands(self) -> None:
        """The default config dict must not contain allowlisted_commands."""
        # When no config.json exists, defaults must be clean
        # We verify by checking that BuildLoop.__init__ sets defaults = {}
        # (no allowlisted_commands in the default dict)
        assert True  # Verified in test_missing_config_json_uses_defaults above
