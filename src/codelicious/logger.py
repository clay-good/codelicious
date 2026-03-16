"""Provides structured logging and audit trail functionality."""

from __future__ import annotations

import logging
import logging.handlers
import os
import pathlib
import re
import sys
import time
from typing import Any, Callable

__all__ = [
    "LOG_FORMAT",
    "SanitizingFilter",
    "TimingContext",
    "VERBOSE_LOG_FORMAT",
    "create_log_callback",
    "log_call_details",
    "sanitize_message",
    "setup_logging",
]

# Patterns for API key redaction - various provider formats
_REDACT_PATTERNS: list[re.Pattern[str]] = [
    # OpenAI keys (sk-...)
    re.compile(r"sk-[A-Za-z0-9]{20,}"),
    # Generic public keys
    re.compile(r"pk-[A-Za-z0-9]{20,}"),
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
    # AWS Secret Access Keys (40 char base64)
    re.compile(r"(?<![A-Za-z0-9+/])[A-Za-z0-9+/]{40}(?![A-Za-z0-9+/=])"),
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
VERBOSE_LOG_FORMAT: str = (
    "{asctime} [{levelname}] {name}.{funcName}:{lineno}: {message}"
)


def sanitize_message(message: str) -> str:
    """Redact strings that look like API keys or secrets."""
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
                record.args = tuple(
                    sanitize_message(str(a)) if isinstance(a, str) else a
                    for a in record.args
                )
        return True


def setup_logging(
    project_dir: pathlib.Path,
    verbose: bool = False,
) -> logging.Logger:
    """Configure and return the codelicious logger."""
    logger = logging.getLogger("codelicious")
    logger.setLevel(logging.DEBUG)

    # Remove any existing handlers to allow reconfiguration
    logger.handlers.clear()

    sanitizing_filter = SanitizingFilter()

    # Console handler (stderr)
    console_handler = logging.StreamHandler(sys.stderr)
    console_handler.setLevel(logging.DEBUG if verbose else logging.INFO)
    console_handler.setFormatter(logging.Formatter(LOG_FORMAT, style="{"))
    console_handler.addFilter(sanitizing_filter)
    logger.addHandler(console_handler)

    # File handler (.codelicious/codelicious.log) with rotation (10 MB, 1 backup)
    try:
        log_dir = project_dir / ".codelicious"
        log_dir.mkdir(mode=0o700, parents=True, exist_ok=True)

        log_file = log_dir / "codelicious.log"
        file_handler = logging.handlers.RotatingFileHandler(
            str(log_file),
            maxBytes=10 * 1024 * 1024,
            backupCount=1,
            encoding="utf-8",
        )
        file_handler.setLevel(logging.DEBUG)
        file_handler.setFormatter(logging.Formatter(VERBOSE_LOG_FORMAT, style="{"))
        file_handler.addFilter(sanitizing_filter)
        logger.addHandler(file_handler)

        # Set log file permissions
        os.chmod(str(log_file), 0o600)
    except OSError:
        # Read-only filesystem or permission denied — console-only logging
        sys.stderr.write("[WARNING] Cannot create log file; logging to console only.\n")

    return logger


def create_log_callback(
    logger: logging.Logger,
) -> Callable[[str, dict[str, Any]], None]:
    """Return a callback function that logs events at INFO level."""

    def callback(event_name: str, event_data: dict[str, Any]) -> None:
        sanitized_data = sanitize_message(str(event_data))
        logger.info("[%s] %s", event_name, sanitized_data)

    return callback


class TimingContext:
    """Context manager that logs entry and exit with elapsed time."""

    def __init__(self, logger: logging.Logger, operation_name: str) -> None:
        self.logger = logger
        self.operation_name = operation_name
        self.start_time: float = 0.0

    def __enter__(self) -> "TimingContext":
        self.start_time = time.perf_counter()
        self.logger.debug("%s: started", self.operation_name)
        return self

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc_val: BaseException | None,
        exc_tb: Any,
    ) -> None:
        elapsed = time.perf_counter() - self.start_time
        if exc_val is not None:
            self.logger.warning(
                "%s: failed after %.3fs: %s", self.operation_name, elapsed, exc_val
            )
        else:
            self.logger.debug("%s: completed in %.3fs", self.operation_name, elapsed)


def log_call_details(logger: logging.Logger, func_name: str, **kwargs: Any) -> None:
    """Log function entry with parameter details at DEBUG level."""
    params = ", ".join(f"{k}={v!r}" for k, v in kwargs.items())
    logger.debug("%s called with: %s", func_name, params)
