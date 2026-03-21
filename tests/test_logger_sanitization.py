"""Tests for logger secret sanitization patterns (P2-13).

These tests verify that the sanitize_message function correctly redacts
sensitive data including SSH keys, webhook URLs, and various secret formats.
"""

from codelicious.logger import sanitize_message


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
