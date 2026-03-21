"""Tests for LLM client error sanitization and API handling."""

import io
import json
import pytest
from unittest.mock import patch
import urllib.error

from codelicious.llm_client import LLMClient


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

            with caplog.at_level(logging.DEBUG, logger="codelicious.llm"):
                with pytest.raises(RuntimeError):
                    client.chat_completion([{"role": "user", "content": "test"}])

            # The full body should appear in debug logs
            assert "secret_acct_999" in caplog.text
            assert "status 500" in caplog.text

    def test_connection_error_handling(self, client):
        """Generic connection errors should also produce clean messages."""
        with patch("urllib.request.urlopen") as mock_urlopen:
            mock_urlopen.side_effect = ConnectionError("Connection refused")

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
        """LLMClient should allow custom endpoint configuration."""
        monkeypatch.setenv("HF_TOKEN", "hf_test")
        client = LLMClient(endpoint_url="https://custom.api.com/v1/chat")
        assert client.endpoint_url == "https://custom.api.com/v1/chat"


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

            with caplog.at_level(logging.DEBUG, logger="codelicious.llm"):
                with pytest.raises(RuntimeError):
                    client.chat_completion([{"role": "user", "content": "test"}])

            # The API key should be redacted in the log
            assert "sk-proj-abc123def456xyz789" not in caplog.text
            assert "***REDACTED***" in caplog.text

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

            with caplog.at_level(logging.DEBUG, logger="codelicious.llm"):
                with pytest.raises(RuntimeError):
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

            with caplog.at_level(logging.DEBUG, logger="codelicious.llm"):
                with pytest.raises(RuntimeError):
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

            with caplog.at_level(logging.DEBUG, logger="codelicious.llm"):
                with pytest.raises(RuntimeError):
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

            with caplog.at_level(logging.DEBUG, logger="codelicious.llm"):
                with pytest.raises(RuntimeError):
                    client.chat_completion([{"role": "user", "content": "test"}])

            # Non-sensitive data should be preserved
            assert "model_not_found" in caplog.text
            assert "gpt-4-unknown" in caplog.text
            assert "req-12345" in caplog.text
