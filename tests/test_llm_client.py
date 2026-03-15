"""Tests for the LLM client module."""

from __future__ import annotations

import json
import subprocess
from unittest.mock import MagicMock, patch

import pytest

from proxilion_build.errors import (
    APIKeyMissingError,
    LLMAuthenticationError,
    LLMClientError,
    LLMProviderError,
    LLMRateLimitError,
    LLMResponseError,
    LLMTimeoutError,
)
from proxilion_build.llm_client import _mask_key, call_llm

# -- _mask_key -------------------------------------------------------------


def test_mask_key_normal() -> None:
    assert _mask_key("sk-abcdefghij1234") == "...1234"


def test_mask_key_short() -> None:
    assert _mask_key("ab") == "****"


def test_mask_key_exactly_four() -> None:
    assert _mask_key("abcd") == "...abcd"


def test_mask_key_empty() -> None:
    assert _mask_key("") == "****"


# -- provider validation ---------------------------------------------------


def test_unsupported_provider_raises() -> None:
    with pytest.raises(LLMProviderError, match="Unsupported provider"):
        call_llm("sys", "user", "unknown", "model", "key")


def test_empty_key_raises() -> None:
    with pytest.raises(APIKeyMissingError):
        call_llm("sys", "user", "anthropic", "model", "")


# -- helpers for mocking ---------------------------------------------------


def _mock_response(status: int, body: dict | bytes) -> MagicMock:
    """Create a mock HTTP response.

    Simulates chunked reads: first call returns the full body, subsequent
    calls return b"" to signal EOF (matching the new chunked-read loop).
    """
    resp = MagicMock()
    resp.status = status
    if isinstance(body, dict):
        raw = json.dumps(body).encode("utf-8")
    else:
        raw = body
    resp.read = MagicMock(side_effect=[raw, b""])
    return resp


def _mock_connection(response: MagicMock) -> MagicMock:
    """Create a mock HTTPSConnection."""
    conn = MagicMock()
    conn.getresponse.return_value = response
    return conn


# -- successful Anthropic parsing ------------------------------------------


@patch("proxilion_build.llm_client.http.client.HTTPSConnection")
def test_anthropic_success(mock_conn_cls: MagicMock) -> None:
    response_body = {
        "content": [{"type": "text", "text": "Hello from Claude"}],
    }
    resp = _mock_response(200, response_body)
    conn = _mock_connection(resp)
    mock_conn_cls.return_value = conn

    result = call_llm("system", "user", "anthropic", "claude-3", "sk-key123")
    assert result == "Hello from Claude"
    conn.request.assert_called_once()
    call_args = conn.request.call_args
    assert call_args[0][0] == "POST"
    assert call_args[0][1] == "/v1/messages"


# -- successful OpenAI parsing --------------------------------------------


@patch("proxilion_build.llm_client.http.client.HTTPSConnection")
def test_openai_success(mock_conn_cls: MagicMock) -> None:
    response_body = {
        "choices": [{"message": {"content": "Hello from GPT"}}],
    }
    resp = _mock_response(200, response_body)
    conn = _mock_connection(resp)
    mock_conn_cls.return_value = conn

    result = call_llm("system", "user", "openai", "gpt-4o", "sk-key123")
    assert result == "Hello from GPT"
    conn.request.assert_called_once()
    call_args = conn.request.call_args
    assert call_args[0][1] == "/v1/chat/completions"


# -- authentication error --------------------------------------------------


@patch("proxilion_build.llm_client.http.client.HTTPSConnection")
def test_401_raises_auth_error(mock_conn_cls: MagicMock) -> None:
    resp = _mock_response(401, {"error": {"message": "invalid key"}})
    conn = _mock_connection(resp)
    mock_conn_cls.return_value = conn

    with pytest.raises(LLMAuthenticationError, match="HTTP 401"):
        call_llm("sys", "user", "anthropic", "model", "bad-key")


# -- rate limiting with retries --------------------------------------------


@patch("proxilion_build.llm_client.time.sleep")
@patch("proxilion_build.llm_client.http.client.HTTPSConnection")
def test_429_triggers_retries(mock_conn_cls: MagicMock, mock_sleep: MagicMock) -> None:
    rate_resp = _mock_response(429, {"error": {"message": "rate limited"}})
    ok_resp = _mock_response(200, {"content": [{"type": "text", "text": "ok"}]})

    conn = MagicMock()
    conn.getresponse.side_effect = [rate_resp, ok_resp]
    mock_conn_cls.return_value = conn

    result = call_llm("sys", "user", "anthropic", "model", "key123")
    assert result == "ok"
    mock_sleep.assert_called_once_with(1.0)


# -- exhausted retries -----------------------------------------------------


@patch("proxilion_build.llm_client.time.sleep")
@patch("proxilion_build.llm_client.http.client.HTTPSConnection")
def test_exhausted_retries_raise(mock_conn_cls: MagicMock, mock_sleep: MagicMock) -> None:
    raw = json.dumps({"error": {"message": "rate limited"}}).encode("utf-8")
    # max_retries=2 → 3 total attempts, each needs (data, EOF) = 6 side_effect entries
    rate_resp = MagicMock()
    rate_resp.status = 429
    rate_resp.read = MagicMock(side_effect=[raw, b"", raw, b"", raw, b""])
    conn = MagicMock()
    conn.getresponse.return_value = rate_resp
    mock_conn_cls.return_value = conn

    with pytest.raises(LLMRateLimitError):
        call_llm("sys", "user", "anthropic", "model", "key123", max_retries=2)

    assert mock_sleep.call_count == 2


# -- oversized response ----------------------------------------------------


@patch("proxilion_build.llm_client.http.client.HTTPSConnection")
def test_oversized_response_raises(mock_conn_cls: MagicMock) -> None:
    resp = MagicMock()
    resp.status = 200
    # Each chunk is 101 bytes; the chunked read accumulates 101 bytes which
    # exceeds max_response_bytes=100 and raises on the first chunk.
    resp.read = MagicMock(return_value=b"x" * 101)
    conn = _mock_connection(resp)
    conn.getresponse.return_value = resp
    mock_conn_cls.return_value = conn

    with pytest.raises(LLMResponseError, match="exceeds maximum size"):
        call_llm(
            "sys",
            "user",
            "anthropic",
            "model",
            "key123",
            max_response_bytes=100,
        )


# -- API key never in exceptions -------------------------------------------


@patch("proxilion_build.llm_client.http.client.HTTPSConnection")
def test_api_key_not_in_exception(mock_conn_cls: MagicMock) -> None:
    resp = _mock_response(401, {"error": {"message": "bad"}})
    conn = _mock_connection(resp)
    mock_conn_cls.return_value = conn

    secret = "sk-supersecretkey12345678"
    with pytest.raises(LLMAuthenticationError) as exc_info:
        call_llm("sys", "user", "anthropic", "model", secret)

    assert secret not in str(exc_info.value)
    assert secret not in repr(exc_info.value)


# -- 500 server error retries ---------------------------------------------


@patch("proxilion_build.llm_client.time.sleep")
@patch("proxilion_build.llm_client.http.client.HTTPSConnection")
def test_500_triggers_retry(mock_conn_cls: MagicMock, mock_sleep: MagicMock) -> None:
    err_resp = _mock_response(500, {"error": {"message": "internal"}})
    ok_resp = _mock_response(200, {"choices": [{"message": {"content": "recovered"}}]})

    conn = MagicMock()
    conn.getresponse.side_effect = [err_resp, ok_resp]
    mock_conn_cls.return_value = conn

    result = call_llm("sys", "user", "openai", "gpt-4o", "key123")
    assert result == "recovered"


# -- timeout retries -------------------------------------------------------


@patch("proxilion_build.llm_client.time.sleep")
@patch("proxilion_build.llm_client.http.client.HTTPSConnection")
def test_timeout_triggers_retry(mock_conn_cls: MagicMock, mock_sleep: MagicMock) -> None:
    ok_resp = _mock_response(200, {"content": [{"type": "text", "text": "ok"}]})
    conn = MagicMock()
    conn.getresponse.side_effect = [TimeoutError("timeout"), ok_resp]
    mock_conn_cls.return_value = conn

    result = call_llm("sys", "user", "anthropic", "model", "key123")
    assert result == "ok"


@patch("proxilion_build.llm_client.time.sleep")
@patch("proxilion_build.llm_client.http.client.HTTPSConnection")
def test_timeout_exhausted_raises(mock_conn_cls: MagicMock, mock_sleep: MagicMock) -> None:
    conn = MagicMock()
    conn.getresponse.side_effect = TimeoutError("timeout")
    mock_conn_cls.return_value = conn

    with pytest.raises(LLMTimeoutError):
        call_llm("sys", "user", "anthropic", "model", "key123", max_retries=1)


# -- OSError retries -------------------------------------------------------


@patch("proxilion_build.llm_client.time.sleep")
@patch("proxilion_build.llm_client.http.client.HTTPSConnection")
def test_oserror_triggers_retry(mock_conn_cls: MagicMock, mock_sleep: MagicMock) -> None:
    import errno

    ok_resp = _mock_response(200, {"content": [{"type": "text", "text": "ok"}]})
    conn = MagicMock()
    # Use a transient error that should trigger retry
    transient_error = OSError("connection reset")
    transient_error.errno = errno.ECONNRESET
    conn.getresponse.side_effect = [transient_error, ok_resp]
    mock_conn_cls.return_value = conn

    result = call_llm("sys", "user", "anthropic", "model", "key123")
    assert result == "ok"


@patch("proxilion_build.llm_client.http.client.HTTPSConnection")
def test_permanent_oserror_raises_immediately(mock_conn_cls: MagicMock) -> None:
    conn = MagicMock()
    # Use a non-retriable error (PermissionError is a subtype of OSError)
    permanent_error = PermissionError("permission denied")
    conn.getresponse.side_effect = permanent_error
    mock_conn_cls.return_value = conn

    with pytest.raises(LLMClientError, match="Non-retriable connection error"):
        call_llm("sys", "user", "anthropic", "model", "key123")


# -- unexpected HTTP status ------------------------------------------------


@patch("proxilion_build.llm_client.http.client.HTTPSConnection")
def test_unexpected_status_raises(mock_conn_cls: MagicMock) -> None:
    resp = _mock_response(418, {"error": {"message": "teapot"}})
    conn = _mock_connection(resp)
    mock_conn_cls.return_value = conn

    with pytest.raises(LLMResponseError, match="Unexpected response"):
        call_llm("sys", "user", "anthropic", "model", "key123")


# -- malformed response structure ------------------------------------------


@patch("proxilion_build.llm_client.http.client.HTTPSConnection")
def test_bad_response_structure_raises(mock_conn_cls: MagicMock) -> None:
    resp = _mock_response(200, {"unexpected": "structure"})
    conn = _mock_connection(resp)
    mock_conn_cls.return_value = conn

    with pytest.raises(LLMResponseError, match="missing 'content' key"):
        call_llm("sys", "user", "anthropic", "model", "key123")


# -- connection creation failure -------------------------------------------


@patch("proxilion_build.llm_client.http.client.HTTPSConnection")
def test_connection_failure_raises(mock_conn_cls: MagicMock) -> None:
    mock_conn_cls.side_effect = Exception("cannot connect")

    with pytest.raises(LLMClientError, match="Failed to create connection"):
        call_llm("sys", "user", "anthropic", "model", "key123")


# -- invalid JSON response ------------------------------------------------


@patch("proxilion_build.llm_client.http.client.HTTPSConnection")
def test_invalid_json_response_raises(mock_conn_cls: MagicMock) -> None:
    resp = MagicMock()
    resp.status = 200
    # side_effect: one data chunk then EOF — prevents the chunked loop from
    # over-reading and hitting the size limit instead of the JSON parse error.
    resp.read = MagicMock(side_effect=[b"not json at all", b""])
    conn = _mock_connection(resp)
    conn.getresponse.return_value = resp
    mock_conn_cls.return_value = conn

    with pytest.raises(LLMResponseError, match="Failed to parse response JSON"):
        call_llm("sys", "user", "anthropic", "model", "key123")


# -- error message extraction: string error --------------------------------


@patch("proxilion_build.llm_client.http.client.HTTPSConnection")
def test_error_message_string_error(mock_conn_cls: MagicMock) -> None:
    resp = _mock_response(418, {"error": "simple string error"})
    conn = _mock_connection(resp)
    mock_conn_cls.return_value = conn

    with pytest.raises(LLMResponseError, match="simple string error"):
        call_llm("sys", "user", "anthropic", "model", "key123")


# -- HTTP 403 raises auth error -------------------------------------------


@patch("proxilion_build.llm_client.http.client.HTTPSConnection")
def test_403_raises_auth_error(mock_conn_cls: MagicMock) -> None:
    resp = _mock_response(403, {"error": {"message": "forbidden"}})
    conn = _mock_connection(resp)
    mock_conn_cls.return_value = conn

    with pytest.raises(LLMAuthenticationError, match="HTTP 403"):
        call_llm("sys", "user", "anthropic", "model", "key123")


# ---------------------------------------------------------------------------
# Phase 3 additions: explicit response validation, prompt validation, encoding
# ---------------------------------------------------------------------------


@patch("proxilion_build.llm_client.http.client.HTTPSConnection")
def test_response_missing_content_key_raises(mock_conn_cls: MagicMock) -> None:
    """Anthropic response with no 'content' key raises descriptive error."""
    resp = _mock_response(200, {"id": "msg_abc"})
    conn = _mock_connection(resp)
    mock_conn_cls.return_value = conn

    with pytest.raises(LLMResponseError, match="missing 'content' key"):
        call_llm("sys", "user", "anthropic", "model", "key123")


@patch("proxilion_build.llm_client.http.client.HTTPSConnection")
def test_response_empty_content_list_raises(mock_conn_cls: MagicMock) -> None:
    """Anthropic response with empty 'content' list raises descriptive error."""
    resp = _mock_response(200, {"content": []})
    conn = _mock_connection(resp)
    mock_conn_cls.return_value = conn

    with pytest.raises(LLMResponseError, match="'content' list is empty"):
        call_llm("sys", "user", "anthropic", "model", "key123")


@patch("proxilion_build.llm_client.http.client.HTTPSConnection")
def test_response_missing_text_key_raises(mock_conn_cls: MagicMock) -> None:
    """Anthropic response with content block missing 'text' raises descriptive error."""
    resp = _mock_response(200, {"content": [{"type": "tool_use", "id": "tu_1"}]})
    conn = _mock_connection(resp)
    mock_conn_cls.return_value = conn

    with pytest.raises(LLMResponseError, match="missing 'text' key"):
        call_llm("sys", "user", "anthropic", "model", "key123")


@patch("proxilion_build.llm_client.http.client.HTTPSConnection")
def test_openai_response_missing_choices_raises(mock_conn_cls: MagicMock) -> None:
    """OpenAI response with no 'choices' key raises descriptive error."""
    resp = _mock_response(200, {"id": "chatcmpl-abc"})
    conn = _mock_connection(resp)
    mock_conn_cls.return_value = conn

    with pytest.raises(LLMResponseError, match="missing 'choices' key"):
        call_llm("sys", "user", "openai", "gpt-4o", "key123")


@patch("proxilion_build.llm_client.http.client.HTTPSConnection")
def test_non_utf8_response_fallback(mock_conn_cls: MagicMock) -> None:
    """Non-UTF-8 response bytes are decoded via latin-1 fallback."""
    # Build a valid JSON body encoded as latin-1 with a non-UTF-8 byte (0xe9 = é in latin-1)
    body_str = '{"content": [{"type": "text", "text": "caf\xe9"}]}'
    raw_latin1 = body_str.encode("latin-1")

    resp = MagicMock()
    resp.status = 200
    resp.read = MagicMock(side_effect=[raw_latin1, b""])
    conn = _mock_connection(resp)
    mock_conn_cls.return_value = conn

    result = call_llm("sys", "user", "anthropic", "model", "key123")
    assert "caf" in result


def test_empty_system_prompt_raises() -> None:
    """Empty system_prompt raises ValueError before any network call."""
    with pytest.raises(ValueError, match="system_prompt must be a non-empty string"):
        call_llm("", "user", "anthropic", "model", "key123")


def test_empty_user_prompt_raises() -> None:
    """Empty user_prompt raises ValueError before any network call."""
    with pytest.raises(ValueError, match="user_prompt must be a non-empty string"):
        call_llm("system", "", "anthropic", "model", "key123")


# -- Phase 13: LLM Client Boundary Conditions ------------------------------


def _make_mock_response(body: bytes, status: int = 200) -> MagicMock:
    """Build a mock HTTP response that returns a valid Anthropic JSON payload."""
    mock_resp = MagicMock()
    mock_resp.status = status
    # Read chunks then empty bytes to signal EOF
    mock_resp.read.side_effect = [body, b""]
    return mock_resp


def test_response_exactly_at_size_limit_accepted() -> None:
    """Response exactly at max_response_bytes is accepted."""
    limit = 100
    # Build a valid JSON response that fits within limit
    content = json.dumps(
        {
            "content": [{"type": "text", "text": "ok"}],
            "stop_reason": "end_turn",
        }
    )
    body = content.encode("utf-8")
    assert len(body) <= limit, "Test body unexpectedly large"

    mock_resp = _make_mock_response(body)
    mock_conn = MagicMock()
    mock_conn.getresponse.return_value = mock_resp

    with patch("http.client.HTTPSConnection", return_value=mock_conn):
        result = call_llm(
            "sys",
            "user",
            "anthropic",
            "claude-3",
            "sk-key",
            max_response_bytes=limit,
        )
    assert result == "ok"


def test_response_one_over_size_limit_rejected() -> None:
    """Response one byte over max_response_bytes raises LLMClientError."""
    from proxilion_build.errors import LLMClientError

    limit = 50
    # Force a body that exceeds the limit
    body = b"x" * (limit + 1)

    mock_resp = MagicMock()
    mock_resp.status = 200
    # Return chunks that exceed the limit
    mock_resp.read.side_effect = [body, b""]
    mock_conn = MagicMock()
    mock_conn.getresponse.return_value = mock_resp

    with patch("http.client.HTTPSConnection", return_value=mock_conn):
        with pytest.raises(LLMClientError, match="Response exceeds maximum size"):
            call_llm(
                "sys",
                "user",
                "anthropic",
                "claude-3",
                "sk-key",
                max_response_bytes=limit,
                max_retries=0,
            )


def test_max_retries_zero_means_one_attempt() -> None:
    """max_retries=0 results in exactly one HTTP request."""
    from proxilion_build.errors import LLMClientError

    mock_conn = MagicMock()
    mock_resp = MagicMock()
    mock_resp.status = 500
    mock_resp.read.return_value = b'{"error": {"message": "oops"}}'
    mock_conn.getresponse.return_value = mock_resp

    with patch("http.client.HTTPSConnection", return_value=mock_conn):
        with pytest.raises(LLMClientError):
            call_llm(
                "sys",
                "user",
                "anthropic",
                "claude-3",
                "sk-key",
                max_retries=0,
            )
    # getresponse called exactly once (1 attempt, 0 retries)
    assert mock_conn.getresponse.call_count == 1


def test_timeout_exactly_one_second() -> None:
    """timeout=1 is passed through to HTTPSConnection without error."""
    content = json.dumps(
        {
            "content": [{"type": "text", "text": "hi"}],
            "stop_reason": "end_turn",
        }
    ).encode("utf-8")
    mock_resp = _make_mock_response(content)
    mock_conn = MagicMock()
    mock_conn.getresponse.return_value = mock_resp

    with patch("http.client.HTTPSConnection", return_value=mock_conn) as mock_cls:
        result = call_llm(
            "sys",
            "user",
            "anthropic",
            "claude-3",
            "sk-key",
            timeout=1,
        )
    assert result == "hi"
    # Confirm timeout was passed
    call_kwargs = mock_cls.call_args
    assert call_kwargs[1].get("timeout") == 1 or call_kwargs[0][1] == 1


# -- Phase 16: LLM Client Coverage Improvement Tests ----------------------


def test_parse_response_openai_missing_choices() -> None:
    """OpenAI response missing 'choices' raises LLMResponseError."""
    from proxilion_build.llm_client import _parse_response

    with pytest.raises(LLMResponseError, match="missing 'choices'"):
        _parse_response({}, "openai")


def test_parse_response_openai_choices_not_list() -> None:
    """OpenAI response with choices not a list raises LLMResponseError."""
    from proxilion_build.llm_client import _parse_response

    with pytest.raises(LLMResponseError, match="not a list"):
        _parse_response({"choices": "wrong"}, "openai")


def test_parse_response_openai_empty_choices() -> None:
    """OpenAI response with empty choices list raises LLMResponseError."""
    from proxilion_build.llm_client import _parse_response

    with pytest.raises(LLMResponseError, match="empty"):
        _parse_response({"choices": []}, "openai")


def test_parse_response_openai_choice_not_dict() -> None:
    """OpenAI response choice not a dict raises LLMResponseError."""
    from proxilion_build.llm_client import _parse_response

    with pytest.raises(LLMResponseError, match="not a dict"):
        _parse_response({"choices": ["not_dict"]}, "openai")


def test_parse_response_openai_message_not_dict() -> None:
    """OpenAI response message not a dict raises LLMResponseError."""
    from proxilion_build.llm_client import _parse_response

    with pytest.raises(LLMResponseError, match="not a dict"):
        _parse_response({"choices": [{"message": "string"}]}, "openai")


def test_parse_response_openai_message_missing_content() -> None:
    """OpenAI response message missing 'content' raises LLMResponseError."""
    from proxilion_build.llm_client import _parse_response

    with pytest.raises(LLMResponseError, match="missing 'content'"):
        _parse_response({"choices": [{"message": {"role": "assistant"}}]}, "openai")


def test_parse_response_openai_success() -> None:
    """OpenAI response with valid structure returns the message content."""
    from proxilion_build.llm_client import _parse_response

    data = {"choices": [{"message": {"content": "hello world"}}]}
    assert _parse_response(data, "openai") == "hello world"


def test_create_policy_guarded_llm_disabled() -> None:
    """create_policy_guarded_llm returns the original callable when disabled."""
    from unittest.mock import MagicMock

    from proxilion_build.llm_client import create_policy_guarded_llm

    def llm_fn(s, u):
        return "response"

    config = MagicMock()
    config.enabled = False
    result = create_policy_guarded_llm(llm_fn, config)
    assert result is llm_fn


def test_create_policy_guarded_llm_no_policybind() -> None:
    """create_policy_guarded_llm returns original callable if policybind not installed."""
    import builtins
    from unittest.mock import MagicMock

    from proxilion_build.llm_client import create_policy_guarded_llm

    original_import = builtins.__import__

    def mock_import(name, *args, **kwargs):
        if name == "policybind":
            raise ImportError("no module named policybind")
        return original_import(name, *args, **kwargs)

    def llm_fn(s, u):
        return "response"

    config = MagicMock()
    config.enabled = True

    with patch("builtins.__import__", side_effect=mock_import):
        result = create_policy_guarded_llm(llm_fn, config)
    assert result is llm_fn


def test_parse_response_anthropic_content_not_list() -> None:
    """Anthropic response with content not a list raises LLMResponseError."""
    from proxilion_build.llm_client import _parse_response

    with pytest.raises(LLMResponseError, match="not a list"):
        _parse_response({"content": "string"}, "anthropic")


def test_parse_response_anthropic_content_item_not_dict() -> None:
    """Anthropic response content[0] not a dict raises LLMResponseError."""
    from proxilion_build.llm_client import _parse_response

    with pytest.raises(LLMResponseError, match="not a dict"):
        _parse_response({"content": ["not_a_dict"]}, "anthropic")


def test_send_request_latin1_fallback() -> None:
    """_send_request falls back to latin-1 when response is not valid UTF-8."""
    import json as _json

    from proxilion_build.llm_client import _send_request

    # Build a JSON response encoded as latin-1 (identical to UTF-8 for ASCII)
    body = _json.dumps(
        {
            "content": [{"type": "text", "text": "ok"}],
        }
    ).encode("latin-1")

    mock_resp = MagicMock()
    mock_resp.status = 200
    # First read returns body, second read returns empty to signal EOF
    mock_resp.read.side_effect = [body, b""]
    mock_conn = MagicMock()
    mock_conn.getresponse.return_value = mock_resp

    with patch("http.client.HTTPSConnection", return_value=mock_conn):
        status, data = _send_request(
            "api.anthropic.com", "/v1/messages", {}, b"", timeout=10, max_response_bytes=1_000_000
        )
    assert status == 200


# ---------------------------------------------------------------------------
# Claude CLI provider tests
# ---------------------------------------------------------------------------


@patch("proxilion_build.llm_client.shutil.which", return_value=None)
def test_claude_provider_no_binary_raises(mock_which: MagicMock) -> None:
    """claude provider raises LLMClientError when the CLI is not on PATH."""
    with pytest.raises(LLMClientError, match="claude CLI not found"):
        call_llm("sys", "user", "claude", "sonnet", "")


@patch("proxilion_build.llm_client.subprocess.run")
@patch("proxilion_build.llm_client.shutil.which", return_value="/usr/bin/claude")
def test_claude_provider_success(mock_which: MagicMock, mock_run: MagicMock) -> None:
    """claude provider returns stdout from the CLI on success."""
    mock_run.return_value = MagicMock(
        returncode=0,
        stdout="Generated code here",
        stderr="",
    )
    result = call_llm("sys prompt", "user prompt", "claude", "sonnet", "")
    assert result == "Generated code here"

    # Verify the CLI was called with expected flags
    cmd = mock_run.call_args[0][0]
    assert cmd[0] == "/usr/bin/claude"
    assert "-p" in cmd
    assert "--output-format" in cmd
    assert "text" in cmd
    assert "--system-prompt" in cmd
    assert "sys prompt" in cmd
    assert "--model" in cmd
    assert "sonnet" in cmd
    assert "user prompt" in cmd


@patch("proxilion_build.llm_client.subprocess.run")
@patch("proxilion_build.llm_client.shutil.which", return_value="/usr/bin/claude")
def test_claude_provider_no_model_omits_flag(mock_which: MagicMock, mock_run: MagicMock) -> None:
    """claude provider omits --model when model is empty."""
    mock_run.return_value = MagicMock(returncode=0, stdout="output", stderr="")
    call_llm("sys", "user", "claude", "", "")
    cmd = mock_run.call_args[0][0]
    assert "--model" not in cmd


@patch("proxilion_build.llm_client.subprocess.run")
@patch("proxilion_build.llm_client.shutil.which", return_value="/usr/bin/claude")
def test_claude_provider_empty_output_raises(mock_which: MagicMock, mock_run: MagicMock) -> None:
    """claude provider raises LLMResponseError on empty output."""
    mock_run.return_value = MagicMock(returncode=0, stdout="  \n  ", stderr="")
    with pytest.raises(LLMResponseError, match="empty output"):
        call_llm("sys", "user", "claude", "sonnet", "")


@patch("proxilion_build.llm_client.subprocess.run")
@patch("proxilion_build.llm_client.shutil.which", return_value="/usr/bin/claude")
def test_claude_provider_nonzero_exit_raises(mock_which: MagicMock, mock_run: MagicMock) -> None:
    """claude provider raises LLMProviderError on non-zero exit."""
    mock_run.return_value = MagicMock(returncode=1, stdout="", stderr="something went wrong")
    with pytest.raises(LLMProviderError, match="exited with code 1"):
        call_llm("sys", "user", "claude", "sonnet", "", max_retries=0)


@patch("proxilion_build.llm_client.time.sleep")
@patch("proxilion_build.llm_client.subprocess.run")
@patch("proxilion_build.llm_client.shutil.which", return_value="/usr/bin/claude")
def test_claude_provider_timeout_retries(
    mock_which: MagicMock, mock_run: MagicMock, mock_sleep: MagicMock
) -> None:
    """claude provider retries on subprocess timeout."""
    mock_run.side_effect = [
        subprocess.TimeoutExpired(cmd="claude", timeout=30),
        MagicMock(returncode=0, stdout="recovered", stderr=""),
    ]
    result = call_llm("sys", "user", "claude", "sonnet", "", timeout=30)
    assert result == "recovered"
    mock_sleep.assert_called_once_with(1.0)


@patch("proxilion_build.llm_client.subprocess.run")
@patch("proxilion_build.llm_client.shutil.which", return_value="/usr/bin/claude")
def test_claude_provider_oserror_raises(mock_which: MagicMock, mock_run: MagicMock) -> None:
    """claude provider raises LLMClientError on OSError."""
    mock_run.side_effect = OSError("permission denied")
    with pytest.raises(LLMClientError, match="Failed to run claude CLI"):
        call_llm("sys", "user", "claude", "sonnet", "")


@patch("proxilion_build.llm_client.time.sleep")
@patch("proxilion_build.llm_client.subprocess.run")
@patch("proxilion_build.llm_client.shutil.which", return_value="/usr/bin/claude")
def test_claude_provider_retries_on_nonzero_exit(
    mock_which: MagicMock, mock_run: MagicMock, mock_sleep: MagicMock
) -> None:
    """claude provider retries on non-zero exit then succeeds."""
    mock_run.side_effect = [
        MagicMock(returncode=1, stdout="", stderr="transient error"),
        MagicMock(returncode=0, stdout="ok", stderr=""),
    ]
    result = call_llm("sys", "user", "claude", "sonnet", "")
    assert result == "ok"


@patch("proxilion_build.llm_client.subprocess.run")
@patch("proxilion_build.llm_client.shutil.which", return_value="/usr/bin/claude")
def test_claude_provider_fatal_not_found_no_retry(
    mock_which: MagicMock, mock_run: MagicMock
) -> None:
    """claude provider does not retry when stderr indicates 'not found'."""
    mock_run.return_value = MagicMock(returncode=1, stdout="", stderr="command not found")
    with pytest.raises(LLMProviderError, match="exited with code 1"):
        call_llm("sys", "user", "claude", "sonnet", "")
    assert mock_run.call_count == 1


def test_claude_provider_no_api_key_needed() -> None:
    """claude provider does not raise APIKeyMissingError with empty key."""
    with patch("proxilion_build.llm_client.shutil.which", return_value=None):
        # Should fail on "not found", not on "API key missing"
        with pytest.raises(LLMClientError, match="claude CLI not found"):
            call_llm("sys", "user", "claude", "sonnet", "")


# -- SSL context verification ------------------------------------------------


@patch("proxilion_build.llm_client.http.client.HTTPSConnection")
def test_send_request_uses_ssl_context(mock_conn_cls: MagicMock) -> None:
    """_send_request creates HTTPSConnection with an SSL context parameter."""
    import ssl

    from proxilion_build.llm_client import _send_request

    # Setup mock response
    mock_resp = MagicMock()
    mock_resp.status = 200
    mock_resp.read.side_effect = [b'{"ok": true}', b""]
    mock_conn = MagicMock()
    mock_conn.getresponse.return_value = mock_resp
    mock_conn_cls.return_value = mock_conn

    _send_request(
        "api.example.com",
        "/v1/test",
        {"Content-Type": "application/json"},
        b"{}",
        timeout=30,
        max_response_bytes=1_000_000,
    )

    # Verify HTTPSConnection was called with a context parameter
    mock_conn_cls.assert_called_once()
    call_kwargs = mock_conn_cls.call_args
    # Check that 'context' keyword arg was passed
    assert "context" in call_kwargs.kwargs, (
        "HTTPSConnection should be called with context parameter"
    )
    ctx = call_kwargs.kwargs["context"]
    assert isinstance(ctx, ssl.SSLContext), "context should be an ssl.SSLContext instance"


# ---------------------------------------------------------------------------
# Phase 10: Retry Logic Test Coverage
# ---------------------------------------------------------------------------


@patch("proxilion_build.llm_client.time.sleep")
@patch("proxilion_build.llm_client.http.client.HTTPSConnection")
def test_retry_on_429(mock_conn_cls: MagicMock, mock_sleep: MagicMock) -> None:
    """Test that 429 status triggers retry and succeeds on second attempt."""
    # First response: 429 rate limit
    rate_limit_resp = _mock_response(429, {"error": {"message": "rate limited"}})
    # Second response: 200 success
    success_resp = _mock_response(
        200, {"content": [{"type": "text", "text": "Success after retry"}]}
    )

    conn = MagicMock()
    conn.getresponse.side_effect = [rate_limit_resp, success_resp]
    mock_conn_cls.return_value = conn

    result = call_llm("system", "user", "anthropic", "claude-3", "sk-key123")

    assert result == "Success after retry"
    # Verify retry happened with correct backoff delay (first delay is 1.0s)
    mock_sleep.assert_called_once_with(1.0)
    # Verify two connection attempts (initial + 1 retry)
    assert conn.getresponse.call_count == 2


@patch("proxilion_build.llm_client.http.client.HTTPSConnection")
def test_no_retry_on_400(mock_conn_cls: MagicMock) -> None:
    """Test that 400 status raises immediately without retrying."""
    bad_request_resp = _mock_response(400, {"error": {"message": "bad request"}})
    conn = MagicMock()
    conn.getresponse.return_value = bad_request_resp
    mock_conn_cls.return_value = conn

    # 400 is not a retriable status code, should raise LLMResponseError immediately
    with pytest.raises(LLMResponseError, match="Unexpected response.*HTTP 400"):
        call_llm("system", "user", "anthropic", "claude-3", "sk-key123")

    # Verify only one attempt was made (no retries)
    assert conn.getresponse.call_count == 1


@patch("proxilion_build.llm_client.time.sleep")
@patch("proxilion_build.llm_client.http.client.HTTPSConnection")
def test_max_retries_exhausted(mock_conn_cls: MagicMock, mock_sleep: MagicMock) -> None:
    """Test that max_retries=2 results in exactly 3 attempts before raising."""
    # Return 500 on every attempt
    raw = json.dumps({"error": {"message": "internal server error"}}).encode("utf-8")
    server_error_resp = MagicMock()
    server_error_resp.status = 500
    # Each attempt needs (data, EOF) for chunked read = 6 total read calls for 3 attempts
    server_error_resp.read = MagicMock(side_effect=[raw, b"", raw, b"", raw, b""])

    conn = MagicMock()
    conn.getresponse.return_value = server_error_resp
    mock_conn_cls.return_value = conn

    # max_retries=2 means 1 initial attempt + 2 retries = 3 total attempts
    with pytest.raises(LLMProviderError, match="Server error.*HTTP 500"):
        call_llm("system", "user", "anthropic", "claude-3", "sk-key123", max_retries=2)

    # Verify exactly 3 attempts
    assert conn.getresponse.call_count == 3
    # Verify 2 backoff delays (after attempt 1 and attempt 2)
    assert mock_sleep.call_count == 2
    # Verify backoff schedule: first retry uses 1.0s, second retry uses 2.0s
    assert mock_sleep.call_args_list[0][0][0] == 1.0
    assert mock_sleep.call_args_list[1][0][0] == 2.0


@patch("proxilion_build.llm_client.http.client.HTTPSConnection")
def test_successful_response_parsing(mock_conn_cls: MagicMock) -> None:
    """Test that a valid 200 response is correctly parsed and returned."""
    response_body = {
        "id": "msg_abc123",
        "type": "message",
        "role": "assistant",
        "content": [{"type": "text", "text": "This is the extracted response content"}],
        "model": "claude-3-opus-20240229",
        "stop_reason": "end_turn",
    }
    success_resp = _mock_response(200, response_body)
    conn = _mock_connection(success_resp)
    mock_conn_cls.return_value = conn

    result = call_llm("system prompt", "user prompt", "anthropic", "claude-3", "sk-key123")

    assert result == "This is the extracted response content"
    # Verify only one attempt was needed
    assert conn.getresponse.call_count == 1
    # Verify the request was made with correct parameters
    conn.request.assert_called_once()
    call_args = conn.request.call_args
    assert call_args[0][0] == "POST"
    assert call_args[0][1] == "/v1/messages"
