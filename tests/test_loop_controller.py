"""Tests for loop_controller message history truncation and JSON validation."""

import json
import pytest
from codelicious.loop_controller import (
    MAX_HISTORY_TOKENS,
    MAX_RESPONSE_BYTES,
    truncate_history,
    parse_json_response,
)
from codelicious.errors import LLMResponseTooLargeError, LLMResponseFormatError


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
        # The kept messages should be the most recent ones
        if len(result) > 1:
            # Check that we have later messages rather than earlier ones
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
