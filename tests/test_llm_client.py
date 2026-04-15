"""Tests for LLM client error sanitization and API handling."""

import io
import json
import socket
import ssl
import urllib.error
from datetime import datetime
from unittest.mock import call, patch

import pytest

from codelicious.errors import ConfigurationError
from codelicious.llm_client import LLMClient, _validate_endpoint_url
from codelicious.logger import _REDACTED


class TestLLMClientErrorSanitization:
    """Tests that LLM API error bodies are sanitized in exceptions."""

    @pytest.fixture
    def client(self, monkeypatch):
        """Create an LLMClient with a mock API key."""
        monkeypatch.setenv("HF_TOKEN", "hf_test_token_12345")
        return LLMClient()

    def test_http_error_body_not_in_exception_message(self, client):
        """
        HTTPError bodies containing sensitive info must NOT appear in RuntimeError.

        The error body may contain account IDs, billing info, diagnostic tokens,
        or other sensitive data that should not propagate through exception chains.
        """
        sensitive_body = json.dumps(
            {
                "error": "rate_limit_exceeded",
                "account_id": "acct_12345",
                "billing_tier": "free",
                "diagnostic_token": "diag_abc123xyz",
            }
        )

        http_error = urllib.error.HTTPError(
            url="https://api.example.com/v1/chat",
            code=429,
            msg="Too Many Requests",
            hdrs={},
            fp=io.BytesIO(sensitive_body.encode("utf-8")),
        )

        with patch("urllib.request.urlopen") as mock_urlopen:
            mock_urlopen.side_effect = http_error

            with pytest.raises(RuntimeError) as exc_info:
                client.chat_completion([{"role": "user", "content": "test"}])

            error_message = str(exc_info.value)

            # Verify sensitive data is NOT in the exception message
            assert "acct_12345" not in error_message
            assert "billing_tier" not in error_message
            assert "diag_abc123xyz" not in error_message
            assert "rate_limit_exceeded" not in error_message

            # Verify the exception still contains useful info
            assert "HTTP 429" in error_message
            assert "LLM API Error" in error_message
            assert "see debug logs for details" in error_message

    def test_http_error_status_code_preserved(self, client):
        """The HTTP status code should still be present in the exception."""
        http_error = urllib.error.HTTPError(
            url="https://api.example.com/v1/chat",
            code=503,
            msg="Service Unavailable",
            hdrs={},
            fp=io.BytesIO(b'{"error": "server_overloaded"}'),
        )

        with patch("urllib.request.urlopen") as mock_urlopen:
            mock_urlopen.side_effect = http_error

            with pytest.raises(RuntimeError) as exc_info:
                client.chat_completion([{"role": "user", "content": "test"}])

            assert "HTTP 503" in str(exc_info.value)

    def test_http_error_model_name_preserved(self, client):
        """The model name should be present in the exception for debugging."""
        http_error = urllib.error.HTTPError(
            url="https://api.example.com/v1/chat",
            code=400,
            msg="Bad Request",
            hdrs={},
            fp=io.BytesIO(b'{"error": "invalid_request"}'),
        )

        with patch("urllib.request.urlopen") as mock_urlopen:
            mock_urlopen.side_effect = http_error

            with pytest.raises(RuntimeError) as exc_info:
                client.chat_completion([{"role": "user", "content": "test"}], role="planner")

            # The planner model name should be in the error
            assert client.planner_model in str(exc_info.value)

    def test_http_error_body_logged_at_debug_level(self, client, caplog):
        """Full error body should be logged at DEBUG level only."""
        import logging

        sensitive_body = '{"account_id": "secret_acct_999", "internal_trace": "xyz"}'
        http_error = urllib.error.HTTPError(
            url="https://api.example.com/v1/chat",
            code=500,
            msg="Internal Server Error",
            hdrs={},
            fp=io.BytesIO(sensitive_body.encode("utf-8")),
        )

        with patch("urllib.request.urlopen") as mock_urlopen:
            mock_urlopen.side_effect = http_error

            with caplog.at_level(logging.DEBUG, logger="codelicious.llm"), pytest.raises(RuntimeError):
                client.chat_completion([{"role": "user", "content": "test"}])

            # The full body should appear in debug logs
            assert "secret_acct_999" in caplog.text
            assert "status 500" in caplog.text

    def test_connection_error_handling(self, client):
        """Network errors exhaust retries then produce a clean LLM Connection Error message."""
        with patch("urllib.request.urlopen") as mock_urlopen, patch("time.sleep"):
            mock_urlopen.side_effect = urllib.error.URLError("Connection refused")

            with pytest.raises(RuntimeError) as exc_info:
                client.chat_completion([{"role": "user", "content": "test"}])

            assert "LLM Connection Error" in str(exc_info.value)


class TestLLMClientResponseParsing:
    """Tests for parsing LLM API responses."""

    @pytest.fixture
    def client(self, monkeypatch):
        """Create an LLMClient with a mock API key."""
        monkeypatch.setenv("HF_TOKEN", "hf_test_token")
        return LLMClient()

    def test_parse_tool_calls_with_tools(self, client):
        """parse_tool_calls should extract tool calls from response."""
        response = {
            "choices": [
                {
                    "message": {
                        "content": "",
                        "tool_calls": [{"id": "call_1", "function": {"name": "read_file", "arguments": "{}"}}],
                    }
                }
            ]
        }

        result = client.parse_tool_calls(response)
        assert len(result) == 1
        assert result[0]["id"] == "call_1"

    def test_parse_tool_calls_without_tools(self, client):
        """parse_tool_calls should return empty list when no tools."""
        response = {"choices": [{"message": {"content": "Hello!"}}]}

        result = client.parse_tool_calls(response)
        assert result == []

    def test_parse_tool_calls_malformed_response(self, client):
        """parse_tool_calls should handle malformed responses gracefully."""
        assert client.parse_tool_calls({}) == []
        assert client.parse_tool_calls({"choices": []}) == []
        assert client.parse_tool_calls({"choices": [{}]}) == []

    def test_parse_content_extracts_text(self, client):
        """parse_content should extract message content."""
        response = {"choices": [{"message": {"content": "Hello, world!"}}]}

        result = client.parse_content(response)
        assert result == "Hello, world!"

    def test_parse_content_empty_response(self, client):
        """parse_content should return empty string for missing content."""
        assert client.parse_content({}) == ""
        assert client.parse_content({"choices": []}) == ""
        assert client.parse_content({"choices": [{"message": {}}]}) == ""


class TestLLMClientInitialization:
    """Tests for LLMClient initialization."""

    def test_requires_api_key(self, monkeypatch):
        """LLMClient should raise when no API key is available."""
        monkeypatch.delenv("HF_TOKEN", raising=False)
        monkeypatch.delenv("LLM_API_KEY", raising=False)

        with pytest.raises(RuntimeError) as exc_info:
            LLMClient()

        assert "No HuggingFace API token found" in str(exc_info.value)

    def test_accepts_hf_token(self, monkeypatch):
        """LLMClient should accept HF_TOKEN env var."""
        monkeypatch.delenv("LLM_API_KEY", raising=False)
        monkeypatch.setenv("HF_TOKEN", "hf_test_token")
        client = LLMClient()
        assert client.api_key == "hf_test_token"

    def test_accepts_llm_api_key(self, monkeypatch):
        """LLMClient should accept LLM_API_KEY env var."""
        monkeypatch.delenv("HF_TOKEN", raising=False)
        monkeypatch.setenv("LLM_API_KEY", "my_api_key")
        client = LLMClient()
        assert client.api_key == "my_api_key"

    def test_custom_models(self, monkeypatch):
        """LLMClient should allow custom model configuration."""
        monkeypatch.setenv("HF_TOKEN", "hf_test")
        client = LLMClient(planner_model="custom-planner", coder_model="custom-coder")
        assert client.planner_model == "custom-planner"
        assert client.coder_model == "custom-coder"

    def test_custom_endpoint(self, monkeypatch):
        """LLMClient should allow custom HTTPS endpoint that resolves to a public IP."""
        monkeypatch.setenv("HF_TOKEN", "hf_test")
        # Mock DNS resolution to return a public IP for the custom endpoint
        public_addrinfo = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 0))]
        with patch("codelicious.llm_client.socket.getaddrinfo", return_value=public_addrinfo):
            client = LLMClient(endpoint_url="https://custom.api.com/v1/chat")
        assert client.endpoint_url == "https://custom.api.com/v1/chat"

    def test_llm_api_key_takes_priority_over_hf_token(self, monkeypatch):
        """LLM_API_KEY should take priority over HF_TOKEN when both are set."""
        monkeypatch.setenv("HF_TOKEN", "hf_should_not_be_used")
        monkeypatch.setenv("LLM_API_KEY", "llm_key_takes_priority")
        client = LLMClient()
        assert client.api_key == "llm_key_takes_priority"


class TestLLMClientErrorBodySanitization:
    """Tests for P1-7: API error bodies are sanitized before logging."""

    @pytest.fixture
    def client(self, monkeypatch):
        """Create an LLMClient with a mock API key."""
        monkeypatch.setenv("HF_TOKEN", "hf_test_token_12345")
        return LLMClient()

    def test_error_body_api_key_redacted_in_logs(self, client, caplog):
        """API keys in error body should be redacted before logging."""
        import logging

        # Simulate an error response that echoes back the API key
        error_body = json.dumps(
            {
                "error": "invalid_api_key",
                "provided_key": "sk-proj-abc123def456xyz789",
                "message": "The API key sk-proj-abc123def456xyz789 is invalid",
            }
        )

        http_error = urllib.error.HTTPError(
            url="https://api.example.com/v1/chat",
            code=401,
            msg="Unauthorized",
            hdrs={},
            fp=io.BytesIO(error_body.encode("utf-8")),
        )

        with patch("urllib.request.urlopen") as mock_urlopen:
            mock_urlopen.side_effect = http_error

            with caplog.at_level(logging.DEBUG, logger="codelicious.llm"), pytest.raises(RuntimeError):
                client.chat_completion([{"role": "user", "content": "test"}])

            # The API key should be redacted in the log
            assert "sk-proj-abc123def456xyz789" not in caplog.text
            assert _REDACTED in caplog.text

    def test_error_body_hf_token_redacted_in_logs(self, client, caplog):
        """HuggingFace tokens in error body should be redacted."""
        import logging

        error_body = json.dumps({"error": "rate_limit", "token": "hf_abcdefghijklmnopqrstuvwxyz1234567890"})

        http_error = urllib.error.HTTPError(
            url="https://api.example.com/v1/chat",
            code=429,
            msg="Too Many Requests",
            hdrs={},
            fp=io.BytesIO(error_body.encode("utf-8")),
        )

        with patch("urllib.request.urlopen") as mock_urlopen:
            mock_urlopen.side_effect = http_error

            with caplog.at_level(logging.DEBUG, logger="codelicious.llm"), pytest.raises(RuntimeError):
                client.chat_completion([{"role": "user", "content": "test"}])

            # HF token should be redacted
            assert "hf_abcdefghijklmnopqrstuvwxyz1234567890" not in caplog.text

    def test_error_body_jwt_token_redacted_in_logs(self, client, caplog):
        """JWT tokens in error body should be redacted."""
        import logging

        jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
        error_body = json.dumps({"error": "invalid_token", "jwt": jwt})

        http_error = urllib.error.HTTPError(
            url="https://api.example.com/v1/chat",
            code=401,
            msg="Unauthorized",
            hdrs={},
            fp=io.BytesIO(error_body.encode("utf-8")),
        )

        with patch("urllib.request.urlopen") as mock_urlopen:
            mock_urlopen.side_effect = http_error

            with caplog.at_level(logging.DEBUG, logger="codelicious.llm"), pytest.raises(RuntimeError):
                client.chat_completion([{"role": "user", "content": "test"}])

            # JWT should be redacted
            assert jwt not in caplog.text

    def test_error_body_combined_secrets_redacted(self, client, caplog):
        """Multiple secret types in error body should all be redacted."""
        import logging

        error_body = (
            "Error details: API key sk-ant-somekey12345678901234 was rejected. "
            "Token hf_testtoken12345678901234 is invalid. "
            "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0In0.signature123"
        )

        http_error = urllib.error.HTTPError(
            url="https://api.example.com/v1/chat",
            code=400,
            msg="Bad Request",
            hdrs={},
            fp=io.BytesIO(error_body.encode("utf-8")),
        )

        with patch("urllib.request.urlopen") as mock_urlopen:
            mock_urlopen.side_effect = http_error

            with caplog.at_level(logging.DEBUG, logger="codelicious.llm"), pytest.raises(RuntimeError):
                client.chat_completion([{"role": "user", "content": "test"}])

            # All secrets should be redacted
            assert "sk-ant-somekey12345678901234" not in caplog.text
            assert "hf_testtoken12345678901234" not in caplog.text

    def test_error_body_non_sensitive_data_preserved(self, client, caplog):
        """Non-sensitive error details should still be visible in logs."""
        import logging

        error_body = json.dumps(
            {"error": "model_not_found", "model": "gpt-4-unknown", "status": "error", "request_id": "req-12345"}
        )

        http_error = urllib.error.HTTPError(
            url="https://api.example.com/v1/chat",
            code=404,
            msg="Not Found",
            hdrs={},
            fp=io.BytesIO(error_body.encode("utf-8")),
        )

        with patch("urllib.request.urlopen") as mock_urlopen:
            mock_urlopen.side_effect = http_error

            with caplog.at_level(logging.DEBUG, logger="codelicious.llm"), pytest.raises(RuntimeError):
                client.chat_completion([{"role": "user", "content": "test"}])

            # Non-sensitive data should be preserved
            assert "model_not_found" in caplog.text
            assert "gpt-4-unknown" in caplog.text
            assert "req-12345" in caplog.text


class TestLLMClientNetworkRetry:
    """Tests for network-level error retry logic (URLError, socket.timeout, ssl.SSLError, etc.)."""

    @pytest.fixture
    def client(self, monkeypatch):
        """Create an LLMClient with a mock API key."""
        monkeypatch.setenv("HF_TOKEN", "hf_test_token_12345")
        return LLMClient()

    def test_url_error_retries_and_raises(self, client):
        """URLError should be retried up to _MAX_RETRIES times then raise RuntimeError."""
        with patch("urllib.request.urlopen") as mock_urlopen, patch("time.sleep") as mock_sleep:
            mock_urlopen.side_effect = urllib.error.URLError("Connection refused")

            with pytest.raises(RuntimeError) as exc_info:
                client.chat_completion([{"role": "user", "content": "test"}])

            # Should have attempted 1 + _MAX_RETRIES times total
            assert mock_urlopen.call_count == client._MAX_RETRIES + 1
            # Sleep should be called _MAX_RETRIES times (not on the final attempt)
            assert mock_sleep.call_count == client._MAX_RETRIES
            assert "LLM Connection Error" in str(exc_info.value)

    def test_socket_timeout_retries_and_raises(self, client):
        """socket.timeout should be retried with exponential backoff."""
        with patch("urllib.request.urlopen") as mock_urlopen, patch("time.sleep") as mock_sleep:
            mock_urlopen.side_effect = TimeoutError("timed out")

            with pytest.raises(RuntimeError) as exc_info:
                client.chat_completion([{"role": "user", "content": "test"}])

            assert mock_urlopen.call_count == client._MAX_RETRIES + 1
            assert mock_sleep.call_count == client._MAX_RETRIES
            assert "LLM Connection Error" in str(exc_info.value)

    def test_ssl_error_retries_and_raises(self, client):
        """ssl.SSLError should be retried with exponential backoff."""
        with patch("urllib.request.urlopen") as mock_urlopen, patch("time.sleep") as mock_sleep:
            mock_urlopen.side_effect = ssl.SSLError("SSL handshake failed")

            with pytest.raises(RuntimeError) as exc_info:
                client.chat_completion([{"role": "user", "content": "test"}])

            assert mock_urlopen.call_count == client._MAX_RETRIES + 1
            assert mock_sleep.call_count == client._MAX_RETRIES
            assert "LLM Connection Error" in str(exc_info.value)

    def test_connection_reset_error_retries_and_raises(self, client):
        """ConnectionResetError should be retried with exponential backoff."""
        with patch("urllib.request.urlopen") as mock_urlopen, patch("time.sleep") as mock_sleep:
            mock_urlopen.side_effect = ConnectionResetError("Connection reset by peer")

            with pytest.raises(RuntimeError) as exc_info:
                client.chat_completion([{"role": "user", "content": "test"}])

            assert mock_urlopen.call_count == client._MAX_RETRIES + 1
            assert mock_sleep.call_count == client._MAX_RETRIES
            assert "LLM Connection Error" in str(exc_info.value)

    def test_os_error_retries_and_raises(self, client):
        """OSError should be retried with exponential backoff."""
        with patch("urllib.request.urlopen") as mock_urlopen, patch("time.sleep") as mock_sleep:
            mock_urlopen.side_effect = OSError("Network unreachable")

            with pytest.raises(RuntimeError) as exc_info:
                client.chat_completion([{"role": "user", "content": "test"}])

            assert mock_urlopen.call_count == client._MAX_RETRIES + 1
            assert mock_sleep.call_count == client._MAX_RETRIES
            assert "LLM Connection Error" in str(exc_info.value)

    def test_network_error_exponential_backoff_intervals(self, client):
        """Sleep durations should follow exponential backoff: 1s, 2s, 4s."""
        with patch("urllib.request.urlopen") as mock_urlopen, patch("time.sleep") as mock_sleep:
            mock_urlopen.side_effect = urllib.error.URLError("timeout")

            with pytest.raises(RuntimeError):
                client.chat_completion([{"role": "user", "content": "test"}])

            expected_sleeps = [call(client._BACKOFF_BASE_S * (2**i)) for i in range(client._MAX_RETRIES)]
            assert mock_sleep.call_args_list == expected_sleeps

    def test_network_error_succeeds_on_retry(self, client):
        """A transient network error should succeed once the connection recovers."""
        success_response = {"choices": [{"message": {"content": "hello"}}]}

        with patch("urllib.request.urlopen") as mock_urlopen, patch("time.sleep"):
            # Fail on the first two attempts, succeed on the third
            fail_then_succeed = [
                urllib.error.URLError("temporary failure"),
                urllib.error.URLError("temporary failure"),
                io.StringIO(json.dumps(success_response)),
            ]

            def side_effect(*args, **kwargs):
                val = fail_then_succeed.pop(0)
                if isinstance(val, Exception):
                    raise val

                # Return a context manager whose read() gives the JSON bytes
                class _FakeResponse:
                    def __enter__(self_inner):
                        return self_inner

                    def __exit__(self_inner, *a):
                        return False

                    def read(self_inner, size=-1):
                        return json.dumps(success_response).encode("utf-8")

                return _FakeResponse()

            mock_urlopen.side_effect = side_effect

            result = client.chat_completion([{"role": "user", "content": "test"}])
            assert result == success_response
            assert mock_urlopen.call_count == 3

    def test_network_error_warning_logged(self, client, caplog):
        """A warning should be logged for each retried network error."""
        import logging

        with patch("urllib.request.urlopen") as mock_urlopen, patch("time.sleep"):
            mock_urlopen.side_effect = urllib.error.URLError("Connection refused")

            with caplog.at_level(logging.WARNING, logger="codelicious.llm"), pytest.raises(RuntimeError):
                client.chat_completion([{"role": "user", "content": "test"}])

            # A warning should appear for each retry attempt
            warning_records = [r for r in caplog.records if r.levelno == logging.WARNING]
            assert len(warning_records) == client._MAX_RETRIES
            assert all("Transient network error" in r.message for r in warning_records)


class TestTimestampFormat:
    """Tests that ISO-8601 UTC timestamps used across the project are well-formed."""

    def test_utc_timestamp_is_valid_iso_with_utc_offset(self) -> None:
        """datetime.now(timezone.utc).isoformat() must be parseable and carry a UTC offset.

        The project uses this pattern in event emitters and audit logging.
        A weak assertion like ``assert 'T' in ts`` misses malformed or naive timestamps.
        """
        from datetime import timezone

        ts = datetime.now(timezone.utc).isoformat()

        # Must be parseable as a valid ISO-8601 datetime — raises ValueError if not.
        parsed = datetime.fromisoformat(ts)

        # The parsed datetime must carry UTC timezone info (offset == 0).
        assert parsed.tzinfo is not None, "timestamp must be timezone-aware"
        assert parsed.utcoffset().total_seconds() == 0, "timestamp must have zero UTC offset"

        # The serialised string must contain the UTC offset marker.
        assert ts.endswith("+00:00"), f"expected '+00:00' suffix, got: {ts!r}"


# ---------------------------------------------------------------------------
# spec-18 Phase 10: LLM API call timing instrumentation
# ---------------------------------------------------------------------------


class TestLLMTimingInstrumentation:
    """Tests for LLM API call timing log entries (spec-18 Phase 10)."""

    @pytest.fixture
    def client(self, monkeypatch):
        monkeypatch.setenv("LLM_API_KEY", "hf_test_key_123")
        return LLMClient()

    def test_llm_timing_logged(self, client, caplog):
        """Successful LLM call logs INFO entry with 'completed in'."""
        import logging

        fake_response = json.dumps({"choices": [{"message": {"role": "assistant", "content": "ok"}}]}).encode()

        mock_resp = io.BytesIO(fake_response)
        mock_resp.status = 200
        mock_resp.__enter__ = lambda s: s
        mock_resp.__exit__ = lambda s, *a: None
        mock_resp.headers = {"Content-Type": "application/json"}

        with patch("urllib.request.urlopen", return_value=mock_resp):
            with caplog.at_level(logging.INFO, logger="codelicious.llm"):
                client.chat_completion([{"role": "user", "content": "test"}])

        assert any("completed in" in r.message.lower() for r in caplog.records)


# ---------------------------------------------------------------------------
# spec-20 Phase 1: SSRF Prevention in LLM Endpoint URL Validation (S20-P1-1)
# ---------------------------------------------------------------------------


class TestEndpointURLValidation:
    """Tests for _validate_endpoint_url SSRF prevention (S20-P1-1)."""

    def test_rejects_http_scheme(self):
        """HTTP scheme must be rejected — only HTTPS is permitted."""
        with pytest.raises(ConfigurationError, match="Insecure LLM endpoint scheme"):
            _validate_endpoint_url("http://api.example.com/v1/chat")

    def test_rejects_ftp_scheme(self):
        """FTP scheme must be rejected."""
        with pytest.raises(ConfigurationError, match="Insecure LLM endpoint scheme"):
            _validate_endpoint_url("ftp://files.example.com/model")

    def test_rejects_file_scheme(self):
        """file:// scheme must be rejected."""
        with pytest.raises(ConfigurationError, match="Insecure LLM endpoint scheme"):
            _validate_endpoint_url("file:///etc/passwd")

    def test_rejects_localhost(self):
        """HTTPS to localhost must be rejected (loopback IP)."""
        loopback_addrinfo = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 0))]
        with patch("codelicious.llm_client.socket.getaddrinfo", return_value=loopback_addrinfo):
            with pytest.raises(ConfigurationError, match="loopback"):
                _validate_endpoint_url("https://localhost/v1/chat")

    @pytest.mark.parametrize("ip", ["10.0.0.1", "10.255.255.255"])
    def test_rejects_private_10_range(self, ip):
        """10.0.0.0/8 private range must be rejected."""
        addrinfo = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 0))]
        with patch("codelicious.llm_client.socket.getaddrinfo", return_value=addrinfo):
            with pytest.raises(ConfigurationError, match="private IP"):
                _validate_endpoint_url(f"https://{ip}/v1/chat")

    @pytest.mark.parametrize("ip", ["172.16.0.1", "172.31.255.255"])
    def test_rejects_private_172_range(self, ip):
        """172.16.0.0/12 private range must be rejected."""
        addrinfo = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 0))]
        with patch("codelicious.llm_client.socket.getaddrinfo", return_value=addrinfo):
            with pytest.raises(ConfigurationError, match="private IP"):
                _validate_endpoint_url(f"https://{ip}/v1/chat")

    @pytest.mark.parametrize("ip", ["192.168.0.1", "192.168.255.255"])
    def test_rejects_private_192_range(self, ip):
        """192.168.0.0/16 private range must be rejected."""
        addrinfo = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 0))]
        with patch("codelicious.llm_client.socket.getaddrinfo", return_value=addrinfo):
            with pytest.raises(ConfigurationError, match="private IP"):
                _validate_endpoint_url(f"https://{ip}/v1/chat")

    def test_accepts_valid_https_endpoint(self):
        """A valid HTTPS endpoint resolving to a public IP must be accepted."""
        public_addrinfo = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 0))]
        with patch("codelicious.llm_client.socket.getaddrinfo", return_value=public_addrinfo):
            _validate_endpoint_url("https://api.example.com/v1/chat")

    def test_accepts_allowlisted_endpoint(self):
        """Known-good HuggingFace Router URLs bypass DNS resolution checks."""
        # Should succeed without any DNS mock since it's allowlisted
        _validate_endpoint_url("https://router.huggingface.co/sambanova/v1/chat/completions")

    def test_rejects_link_local(self):
        """Link-local addresses (169.254.x.x) must be rejected."""
        addrinfo = [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("169.254.1.1", 0))]
        with patch("codelicious.llm_client.socket.getaddrinfo", return_value=addrinfo):
            with pytest.raises(ConfigurationError, match="link-local"):
                _validate_endpoint_url("https://169.254.1.1/v1/chat")
