"""Provides structured logging and audit trail functionality."""

from __future__ import annotations

import logging
import re

__all__ = [
    "LOG_FORMAT",
    "VERBOSE_LOG_FORMAT",
    "SanitizingFilter",
    "sanitize_message",
]

# Patterns for API key redaction - various provider formats
_REDACT_PATTERNS: list[re.Pattern[str]] = [
    # OpenAI keys (sk-...) including project keys (sk-proj-...)
    re.compile(r"sk-[A-Za-z0-9\-_]{20,}"),
    # Generic public keys
    re.compile(r"pk-[A-Za-z0-9\-_]{20,}"),
    # GitHub Personal Access Tokens
    re.compile(r"ghp_[A-Za-z0-9]{20,}"),
    re.compile(r"gho_[A-Za-z0-9]{20,}"),
    re.compile(r"ghu_[A-Za-z0-9]{20,}"),
    re.compile(r"ghs_[A-Za-z0-9]{20,}"),
    re.compile(r"ghr_[A-Za-z0-9]{20,}"),
    # AWS Access Key IDs
    re.compile(r"AKIA[A-Z0-9]{16}"),
    re.compile(r"ABIA[A-Z0-9]{16}"),
    re.compile(r"ACCA[A-Z0-9]{16}"),
    re.compile(r"ASIA[A-Z0-9]{16}"),
    # AWS Secret Access Keys - require keyword context to avoid false positives
    # on git SHAs and file hashes (P2-13 fix: narrowed pattern)
    re.compile(
        r"(?:aws_secret_access_key|AWS_SECRET|secret_access_key)"
        r"\s*[=:]\s*[A-Za-z0-9+/]{40}",
        re.IGNORECASE,
    ),
    # AWS Session Tokens (FwoG prefix, long base64)
    re.compile(r"FwoG[A-Za-z0-9+/=]{100,}"),
    # Anthropic keys
    re.compile(r"sk-ant-[A-Za-z0-9\-]{20,}"),
    # JWT tokens (three base64 segments separated by dots)
    re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+"),
    # Database connection strings with passwords
    re.compile(
        r"(?:postgres|mysql|mongodb)://[^@\s]+@",
        re.IGNORECASE,
    ),
    # Generic bearer tokens
    re.compile(r"Bearer\s+[A-Za-z0-9._~+/=-]{20,}", re.IGNORECASE),
    # Azure credentials
    re.compile(
        r"(?i)(?:DefaultAzureCredential|azure[_-]?(?:api[_-]?)?key)"
        r"\s*[=:]\s*\S+",
    ),
    # GCP service account key fields
    re.compile(r'"private_key_id"\s*:\s*"[^"]+?"'),
    re.compile(r'"private_key"\s*:\s*"[^"]+?"'),
    # Hugging Face tokens
    re.compile(r"\bhf_[a-zA-Z0-9]{20,}\b"),
    # ===== P2-13 additions: expanded secret detection patterns =====
    # SSH private keys (RSA, DSA, EC, ED25519, etc.)
    re.compile(
        r"-----BEGIN\s+[A-Z\s]*PRIVATE\s+KEY-----"
        r"[\s\S]*?"
        r"-----END\s+[A-Z\s]*PRIVATE\s+KEY-----",
        re.MULTILINE,
    ),
    # GitHub webhook URLs (contain webhook secret tokens)
    re.compile(r"https://[^/\s]*/webhooks/[a-zA-Z0-9_/-]+"),
    # Slack webhook URLs
    re.compile(r"https://hooks\.slack\.com/services/[A-Z0-9/]+", re.IGNORECASE),
    # Discord webhook URLs
    re.compile(r"https://discord(?:app)?\.com/api/webhooks/[0-9]+/[A-Za-z0-9_-]+"),
    # Generic webhook URLs with tokens/secrets in path
    re.compile(r"https://[^/\s]+/webhook[s]?/[A-Za-z0-9_\-]{20,}"),
    # Authorization: Basic header with base64 credentials
    re.compile(r"Authorization:\s*Basic\s+[A-Za-z0-9+/=]{20,}", re.IGNORECASE),
    # NPM tokens (npm_ followed by 36 alphanumeric chars)
    re.compile(r"npm_[A-Za-z0-9]{30,}"),
    # PyPI tokens
    re.compile(r"pypi-[A-Za-z0-9_-]{100,}"),
    # Google API keys (AIza followed by 35 chars = 39 total)
    re.compile(r"AIza[0-9A-Za-z_-]{31,}"),
    # Stripe keys (secret and publishable)
    re.compile(r"sk_live_[0-9a-zA-Z]{24,}"),
    re.compile(r"pk_live_[0-9a-zA-Z]{24,}"),
    re.compile(r"sk_test_[0-9a-zA-Z]{24,}"),
    re.compile(r"pk_test_[0-9a-zA-Z]{24,}"),
    # Twilio credentials
    re.compile(r"SK[a-f0-9]{32}", re.IGNORECASE),
    # SendGrid API keys (SG. followed by two segments separated by .)
    re.compile(r"SG\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+"),
    # Mailchimp API keys
    re.compile(r"[a-f0-9]{32}-us[0-9]{1,2}"),
]

# Pattern for alphanumeric strings adjacent to sensitive variable names
# Minimum 20 chars to reduce false positives on short variable references
_SENSITIVE_CONTEXT_PATTERN: re.Pattern[str] = re.compile(
    r"(?:api[_-]?key|secret[_-]?key|password|access[_-]?token|auth[_-]?token|bearer)"
    r"[\s:='\"]+"
    r"([A-Za-z0-9_\-\.]{20,})",
    re.IGNORECASE,
)

_REDACTED: str = "***REDACTED***"

LOG_FORMAT: str = "{asctime} [{levelname}] {name}.{funcName}: {message}"
VERBOSE_LOG_FORMAT: str = "{asctime} [{levelname}] {name}.{funcName}:{lineno}: {message}"

# Cheap pre-filter: substrings that must be present for any redaction pattern to match.
# If none of these appear in the message, skip all regex substitutions entirely.
_SECRET_INDICATOR_SUBSTRINGS: tuple[str, ...] = (
    "sk-",
    "pk-",
    "ghp_",
    "gho_",
    "ghu_",
    "ghs_",
    "ghr_",
    "hf_",
    "AKIA",
    "ABIA",
    "ACCA",
    "ASIA",
    "FwoG",
    "sk-ant-",
    "eyJ",
    "Bearer",
    "postgres://",
    "mysql://",
    "mongodb://",
    "redis://",
    "amqp://",
    "smtp://",
    "ftp://",
    "webhook",
    "hooks.slack",
    "BEGIN",
    "AIza",
    "sk_live_",
    "pk_live_",
    "sk_test_",
    "pk_test_",
    "npm_",
    "pypi-",
    "SG.",
    "api_key",
    "api-key",
    "secret_key",
    "secret-key",
    "password",
    "access_token",
    "auth_token",
    "bearer",
    "private_key",
    "aws_secret",
    "AWS_SECRET",
    "secret_access",
    "Authorization",
    "authorization",
)


def sanitize_message(message: str) -> str:
    """Redact strings that look like API keys or secrets.

    Uses a cheap substring pre-filter: if the message contains none of the
    known secret indicator substrings, the 30+ regex substitutions are skipped
    entirely. This avoids the overhead on the vast majority of log records
    that carry no secrets.

    Performance note (Finding 20): once a message passes the pre-filter all
    30+ compiled regexes run sequentially. The pre-filter eliminates >99% of
    messages in normal operation, so the sequential scan is only paid when a
    secret indicator is actually present. Mapping each indicator to a subset
    of regexes would reduce the work further but adds maintenance complexity;
    the current approach is acceptable given the pre-filter already bounds the
    common case.
    """
    # Fast path: skip all regex work if no secret indicator is present
    if not any(indicator in message for indicator in _SECRET_INDICATOR_SUBSTRINGS):
        return message

    result = message

    for pattern in _REDACT_PATTERNS:
        result = pattern.sub(_REDACTED, result)

    result = _SENSITIVE_CONTEXT_PATTERN.sub(
        lambda m: m.group(0).replace(m.group(1), _REDACTED),
        result,
    )

    return result


class SanitizingFilter(logging.Filter):
    """Logging filter that redacts sensitive data from log records."""

    def filter(self, record: logging.LogRecord) -> bool:
        if not isinstance(record.msg, str):
            record.msg = str(record.msg)
        record.msg = sanitize_message(record.msg)
        if record.args:
            if isinstance(record.args, dict):
                record.args = {
                    (sanitize_message(str(k)) if isinstance(k, str) else k): (
                        sanitize_message(str(v)) if isinstance(v, str) else v
                    )
                    for k, v in record.args.items()
                }
            elif isinstance(record.args, tuple):
                record.args = tuple(sanitize_message(str(a)) if isinstance(a, str) else a for a in record.args)

        # S20-P3-3: Format the message early and sanitize the combined result.
        # Python's logging formats msg % args AFTER filters run, so a secret
        # that only appears in the formatted combination would survive the
        # individual sanitization above.  By formatting here and replacing
        # msg/args, we ensure the final output is always redacted.
        try:
            formatted = record.getMessage()
            sanitized = sanitize_message(formatted)
            record.msg = sanitized
            record.args = None
        except Exception:  # nosec B110
            pass  # Individual sanitization above is still in place

        return True
