"""Tests for logger secret sanitization patterns (P2-13).

These tests verify that the sanitize_message function correctly redacts
sensitive data including SSH keys, webhook URLs, and various secret formats.
"""

import logging
from unittest.mock import patch

import pytest

from codelicious.logger import SanitizingFilter, sanitize_message


class TestSSHKeyRedaction:
    """Tests for SSH private key redaction."""

    def test_rsa_private_key_redacted(self):
        """RSA private keys should be fully redacted."""
        message = """Config contains:
-----BEGIN RSA PRIVATE KEY-----
MIIEpQIBAAKCAQEA0Z3VS5JJcds3xfn/ygWyf8RPgHrYNVpZrBdpAVJmmqLsE8xF
hF1CqX3BS5J1xLqxYX5PnrOp2PELbOPVPODaKBEG0v4t/1pB1awFwxo4/BEXAMPLE
-----END RSA PRIVATE KEY-----
End of config"""

        result = sanitize_message(message)

        assert "MIIEpQIBAAKCAQEA" not in result
        assert "BEXAMPLE" not in result
        assert "***REDACTED***" in result
        # Context should be preserved
        assert "Config contains:" in result
        assert "End of config" in result

    def test_ec_private_key_redacted(self):
        """EC private keys should be redacted."""
        message = """-----BEGIN EC PRIVATE KEY-----
MHQCAQEEIBYu7ITHF8FOGUfNBFb8B1T9t1qP6bB1ExAmPlEcQ3stoAcGBSuBBAAK
-----END EC PRIVATE KEY-----"""

        result = sanitize_message(message)

        assert "MHQCAQEEIBYu7ITHF8FOGUfNBFb8B1T9t1qP6bB1ExAmPlEcQ3stoAcGBSuBBAAK" not in result
        assert "***REDACTED***" in result

    def test_openssh_private_key_redacted(self):
        """OpenSSH format private keys should be redacted."""
        message = """-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
QyNTUxOQAAACDV7GqA+EXAMPLE+DATA+HERE+abcdef123456789==
-----END OPENSSH PRIVATE KEY-----"""

        result = sanitize_message(message)

        assert "b3BlbnNzaC1rZXktdjE" not in result
        assert "***REDACTED***" in result


class TestWebhookURLRedaction:
    """Tests for webhook URL redaction."""

    def test_github_webhook_url_redacted(self):
        """GitHub webhook URLs should be redacted."""
        message = "Webhook: https://api.github.com/webhooks/12345/payload"

        result = sanitize_message(message)

        assert "12345/payload" not in result
        assert "***REDACTED***" in result

    def test_slack_webhook_url_redacted(self):
        """Slack webhook URLs should be redacted."""
        # Using test pattern that matches regex but uses placeholder values
        # Note: "EXAMPLE" prefix signals this is not a real secret
        message = (
            "Notification sent to https://hooks.slack.com/services/EXAMPLE0000/EXAMPLE0000/EXAMPLEEXAMPLEEXAMPLE00"
        )

        result = sanitize_message(message)

        assert "EXAMPLE0000/EXAMPLE0000/EXAMPLEEXAMPLEEXAMPLE00" not in result
        assert "***REDACTED***" in result

    def test_discord_webhook_url_redacted(self):
        """Discord webhook URLs should be redacted."""
        message = "Discord: https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnop-qrstuvwxyz123456"

        result = sanitize_message(message)

        assert "123456789012345678/abcdefghijklmnop" not in result
        assert "***REDACTED***" in result

    def test_generic_webhook_url_redacted(self):
        """Generic webhook URLs with long tokens should be redacted."""
        message = "Custom webhook: https://example.com/webhooks/abc123def456ghi789jkl012mno345"

        result = sanitize_message(message)

        assert "abc123def456ghi789jkl012mno345" not in result
        assert "***REDACTED***" in result


class TestAPIKeyRedaction:
    """Tests for various API key formats."""

    def test_google_api_key_redacted(self):
        """Google API keys (AIza prefix) should be redacted."""
        message = "Using Google key: AIzaSyC1234567890AbCdEfGhIjKlMnOpQrStU"

        result = sanitize_message(message)

        assert "AIzaSyC1234567890AbCdEfGhIjKlMnOpQrStU" not in result
        assert "***REDACTED***" in result

    def test_stripe_secret_key_redacted(self):
        """Stripe secret keys should be redacted."""
        # Constructing test key programmatically to avoid GitHub push protection
        key = "sk_" + "live" + "_" + "a" * 24
        message = f"Payment with {key}"

        result = sanitize_message(message)

        assert key not in result

    def test_stripe_test_key_redacted(self):
        """Stripe test keys should be redacted."""
        # Constructing test key programmatically to avoid GitHub push protection
        key = "sk_" + "test" + "_" + "b" * 24
        message = f"Test mode: {key}"

        result = sanitize_message(message)

        assert key not in result

    def test_stripe_publishable_key_redacted(self):
        """Stripe publishable keys should be redacted."""
        # Constructing test key programmatically to avoid GitHub push protection
        key = "pk_" + "live" + "_" + "c" * 24
        message = f"Frontend key: {key}"

        result = sanitize_message(message)

        assert key not in result

    def test_npm_token_redacted(self):
        """NPM tokens should be redacted."""
        message = "NPM_TOKEN=npm_1234567890abcdefghijklmnopqrstuvwx"

        result = sanitize_message(message)

        assert "npm_1234567890abcdefghijklmnopqrstuvwx" not in result

    def test_pypi_token_redacted(self):
        """PyPI tokens should be redacted."""
        token = "pypi-" + "A" * 100
        message = f"PYPI_TOKEN={token}"

        result = sanitize_message(message)

        assert token not in result

    def test_sendgrid_api_key_redacted(self):
        """SendGrid API keys should be redacted."""
        message = "Email API: SG.abcdefghijklmnopqrstuv.ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abc"

        result = sanitize_message(message)

        assert "SG.abcdefghijklmnopqrstuv" not in result


class TestAuthorizationHeaderRedaction:
    """Tests for Authorization header redaction."""

    def test_basic_auth_header_redacted(self):
        """Authorization: Basic headers should be redacted."""
        message = "Headers: Authorization: Basic dXNlcm5hbWU6cGFzc3dvcmQxMjM0NTY3ODkw"

        result = sanitize_message(message)

        assert "dXNlcm5hbWU6cGFzc3dvcmQxMjM0NTY3ODkw" not in result
        assert "***REDACTED***" in result

    def test_bearer_token_redacted(self):
        """Bearer tokens should be redacted."""
        message = "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature"

        result = sanitize_message(message)

        assert "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" not in result


class TestAWSCredentialRedaction:
    """Tests for AWS credential redaction with context."""

    def test_aws_secret_with_context_redacted(self):
        """AWS secrets with keyword context should be redacted."""
        message = "aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"

        result = sanitize_message(message)

        assert "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" not in result

    def test_aws_secret_key_colon_format_redacted(self):
        """AWS secrets with colon separator should be redacted."""
        message = "secret_access_key: wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"

        result = sanitize_message(message)

        assert "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY" not in result

    def test_git_sha_not_redacted(self):
        """Git SHAs (40 hex chars) should NOT be redacted without AWS context."""
        git_sha = "abc123def456789012345678901234567890abcd"
        message = f"Commit: {git_sha}"

        result = sanitize_message(message)

        # Git SHA should be preserved (no AWS context)
        assert git_sha in result

    def test_file_hash_not_redacted(self):
        """File hashes should NOT be redacted without AWS context."""
        file_hash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4"
        message = f"SHA1: {file_hash}"

        result = sanitize_message(message)

        # File hash should be preserved
        assert file_hash in result


class TestCombinedSecretRedaction:
    """Tests for messages containing multiple secret types."""

    def test_multiple_secrets_all_redacted(self):
        """Messages with multiple secret types should have all redacted."""
        message = """Configuration:
API_KEY=sk-proj-abc123def456xyz789012345
WEBHOOK=https://hooks.slack.com/services/T00/B00/XXX
TOKEN=ghp_1234567890abcdefghij1234567890abcdef
"""

        result = sanitize_message(message)

        assert "sk-proj-abc123def456xyz789012345" not in result
        assert "T00/B00/XXX" not in result
        assert "ghp_1234567890abcdefghij1234567890abcdef" not in result
        # But the structure should be preserved
        assert "Configuration:" in result

    def test_ssh_key_and_api_key_combined(self):
        """SSH key + API key in same message should both be redacted."""
        message = """Credentials:
-----BEGIN RSA PRIVATE KEY-----
MIIEpQIBAAKCAQEAxxx
-----END RSA PRIVATE KEY-----
API_KEY: sk-ant-api12345678901234567890"""

        result = sanitize_message(message)

        assert "MIIEpQIBAAKCAQEAxxx" not in result
        assert "sk-ant-api12345678901234567890" not in result
        assert "Credentials:" in result


class TestNonSensitivePreservation:
    """Tests that non-sensitive data is preserved."""

    def test_regular_urls_preserved(self):
        """Regular URLs without secrets should be preserved."""
        message = "Visit https://example.com/docs/api for documentation"

        result = sanitize_message(message)

        assert "https://example.com/docs/api" in result

    def test_error_messages_preserved(self):
        """Error messages without secrets should be preserved."""
        message = "Error 404: Resource not found at /api/v1/users"

        result = sanitize_message(message)

        assert result == message

    def test_code_snippets_preserved(self):
        """Code snippets without secrets should be preserved."""
        message = "def hello(): return 'world'"

        result = sanitize_message(message)

        assert result == message

    def test_short_strings_preserved(self):
        """Short strings that look like partial keys should be preserved."""
        message = "Using key: abc123"

        result = sanitize_message(message)

        assert "abc123" in result


# ---------------------------------------------------------------------------
# Finding 16: parametrized coverage for each token family
# ---------------------------------------------------------------------------

# Each entry is (label, secret_value).  The test asserts that sanitize_message
# returns a string containing '***REDACTED***' and NOT containing the original.
_TOKEN_FAMILY_CASES = [
    # Anthropic key
    ("sk-ant", "sk-ant-api03-" + "A" * 20),
    # OpenAI / generic sk-xxx key
    ("sk-openai", "sk-" + "B" * 25),
    # Hugging Face token
    ("hf_xxx", "hf_" + "C" * 20),
    # GitHub PAT
    ("ghp_xxx", "ghp_" + "D" * 20),
    # AWS Access Key ID
    ("AKIA", "AKIA" + "E" * 16),
    # JWT (three base64url segments)
    (
        "jwt",
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
    ),
    # Postgres connection string with password
    ("postgres_dsn", "postgres://alice:s3cr3tpassword@db.example.com/mydb"),
    # Bearer token
    ("bearer", "Bearer " + "F" * 25),
    # Stripe sk_live_ key
    ("sk_live", "sk_live_" + "G" * 24),
]


@pytest.mark.parametrize("label,secret", _TOKEN_FAMILY_CASES, ids=[c[0] for c in _TOKEN_FAMILY_CASES])
def test_token_family_is_redacted(label: str, secret: str) -> None:
    """Each token family must be redacted and the original value must not appear."""
    message = f"config value: {secret} end"
    result = sanitize_message(message)
    assert "***REDACTED***" in result, f"[{label}] Expected REDACTED marker not found in: {result!r}"
    assert secret not in result, f"[{label}] Original secret still present in: {result!r}"


# ---------------------------------------------------------------------------
# Finding 17: SanitizingFilter.filter — record.args tuple and dict branches
# ---------------------------------------------------------------------------


class TestSanitizingFilterArgs:
    """Tests for the args path (tuple and dict forms) in SanitizingFilter.filter."""

    def _make_record(self, msg: str, args: object) -> logging.LogRecord:
        """Create a minimal LogRecord with the given msg and args."""
        record = logging.LogRecord(
            name="test",
            level=logging.INFO,
            pathname="test.py",
            lineno=1,
            msg=msg,
            args=None,
            exc_info=None,
        )
        # Set args after construction to avoid LogRecord.__init__
        # validation issues with dict args
        record.args = args
        return record

    def test_tuple_args_secret_is_redacted(self) -> None:
        """Secrets in tuple args are redacted in-place."""
        secret = "sk-ant-api03-" + "X" * 20
        record = self._make_record("key=%s", (secret,))
        f = SanitizingFilter()
        result = f.filter(record)

        assert result is True
        assert isinstance(record.args, tuple)
        assert record.args[0] == "***REDACTED***"

    def test_tuple_args_non_secret_is_preserved(self) -> None:
        """Non-secret tuple args are left unchanged."""
        record = self._make_record("count=%s", ("42",))
        f = SanitizingFilter()
        f.filter(record)

        assert record.args == ("42",)

    def test_dict_args_secret_value_is_redacted(self) -> None:
        """Secrets in dict args values are redacted in-place."""
        secret = "ghp_" + "Y" * 20
        record = self._make_record("%(key)s", {"key": secret})
        f = SanitizingFilter()
        f.filter(record)

        assert isinstance(record.args, dict)
        assert record.args["key"] == "***REDACTED***"

    def test_dict_args_non_secret_value_is_preserved(self) -> None:
        """Non-secret dict args values are left unchanged."""
        record = self._make_record("%(key)s", {"key": "hello"})
        f = SanitizingFilter()
        f.filter(record)

        assert record.args["key"] == "hello"

    def test_none_args_is_handled(self) -> None:
        """None args (no interpolation) is handled without error."""
        record = self._make_record("plain message", None)
        f = SanitizingFilter()
        result = f.filter(record)

        assert result is True
        assert record.args is None

    def test_msg_secret_is_redacted_regardless_of_args(self) -> None:
        """Secret baked into msg itself (no args) is still redacted."""
        secret = "hf_" + "Z" * 20
        record = self._make_record(f"token={secret}", None)
        f = SanitizingFilter()
        f.filter(record)

        assert "***REDACTED***" in record.msg
        assert secret not in record.msg


# ---------------------------------------------------------------------------
# Finding 85: setup_logging()
# ---------------------------------------------------------------------------


class TestSetupLogging:
    """Tests for setup_logging() (Finding 85)."""

    def test_verbose_true_sets_debug_handler(self, tmp_path) -> None:
        """setup_logging with verbose=True adds a DEBUG-level console handler."""
        from codelicious.logger import setup_logging

        result_logger = setup_logging(tmp_path, verbose=True)

        # At least one handler should have DEBUG level
        debug_handlers = [h for h in result_logger.handlers if h.level == logging.DEBUG]
        assert debug_handlers, "Expected at least one DEBUG-level handler when verbose=True"

    def test_verbose_false_sets_info_handler(self, tmp_path) -> None:
        """setup_logging with verbose=False adds an INFO-level console handler."""
        from codelicious.logger import setup_logging

        result_logger = setup_logging(tmp_path, verbose=False)

        # The console handler (StreamHandler to stderr) should be INFO level
        import sys

        stream_handlers = [
            h
            for h in result_logger.handlers
            if isinstance(h, logging.StreamHandler) and getattr(h, "stream", None) is sys.stderr
        ]
        assert stream_handlers, "Expected a StreamHandler writing to stderr"
        assert stream_handlers[0].level == logging.INFO

    def test_read_only_directory_does_not_raise(self, tmp_path) -> None:
        """setup_logging does not raise when the log directory cannot be created."""
        from codelicious.logger import setup_logging

        # Patch mkdir to raise OSError to simulate a read-only filesystem
        with patch("pathlib.Path.mkdir", side_effect=OSError("read-only filesystem")):
            # Should not raise — falls back to console-only logging
            result_logger = setup_logging(tmp_path / "readonly_project", verbose=False)

        assert result_logger is not None

    def test_returns_codelicious_logger(self, tmp_path) -> None:
        """setup_logging always returns the 'codelicious' logger."""
        from codelicious.logger import setup_logging

        result_logger = setup_logging(tmp_path)

        assert result_logger.name == "codelicious"


# ---------------------------------------------------------------------------
# Finding 86: create_log_callback()
# ---------------------------------------------------------------------------


class TestCreateLogCallback:
    """Tests for create_log_callback() (Finding 86)."""

    def test_callback_redacts_api_key_in_event_data(self, caplog) -> None:
        """Callback must not log the raw API key when event_data contains one."""
        from codelicious.logger import create_log_callback

        # Use a test logger that we can inspect
        test_logger = logging.getLogger("test_create_log_callback")
        test_logger.setLevel(logging.DEBUG)

        callback = create_log_callback(test_logger)

        # Construct event data containing a fake API key
        fake_key = "sk-ant-api03-" + "X" * 20
        event_data = {"api_key": fake_key, "model": "claude-opus-4"}

        with caplog.at_level(logging.INFO, logger="test_create_log_callback"):
            callback("llm_call", event_data)

        # The raw key must not appear in any logged message
        logged_text = " ".join(r.getMessage() for r in caplog.records)
        assert fake_key not in logged_text, f"Raw API key found in log output: {logged_text!r}"

    def test_callback_logs_event_name(self, caplog) -> None:
        """Callback logs the event name at INFO level."""
        from codelicious.logger import create_log_callback

        test_logger = logging.getLogger("test_callback_event_name")
        test_logger.setLevel(logging.DEBUG)
        callback = create_log_callback(test_logger)

        with caplog.at_level(logging.INFO, logger="test_callback_event_name"):
            callback("my_event", {"key": "value"})

        assert any("my_event" in r.getMessage() for r in caplog.records)

    def test_callback_handles_empty_event_data(self, caplog) -> None:
        """Callback does not raise when event_data is empty."""
        from codelicious.logger import create_log_callback

        test_logger = logging.getLogger("test_callback_empty")
        test_logger.setLevel(logging.DEBUG)
        callback = create_log_callback(test_logger)

        with caplog.at_level(logging.INFO, logger="test_callback_empty"):
            callback("empty_event", {})  # should not raise

        assert any("empty_event" in r.getMessage() for r in caplog.records)
