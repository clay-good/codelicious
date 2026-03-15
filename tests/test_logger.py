"""Tests for the logging and audit trail module."""

from __future__ import annotations

import logging
import pathlib
import stat

from proxilion_build.logger import (
    SanitizingFilter,
    create_log_callback,
    sanitize_message,
    setup_logging,
)

# -- sanitize_message ------------------------------------------------------


def test_redacts_sk_key() -> None:
    msg = "Using key sk-abcdefghij0123456789extra"
    result = sanitize_message(msg)
    assert "sk-abcdefghij" not in result
    assert "***REDACTED***" in result


def test_redacts_pk_key() -> None:
    msg = "pk-abcdefghij0123456789extra"
    result = sanitize_message(msg)
    assert "pk-abcdefghij" not in result
    assert "***REDACTED***" in result


def test_redacts_ghp_token() -> None:
    msg = "token ghp_abcdefghij0123456789extra"
    result = sanitize_message(msg)
    assert "ghp_abcdefghij" not in result
    assert "***REDACTED***" in result


def test_redacts_akia_key() -> None:
    msg = "AKIAIOSFODNN7EXAMPLE1"
    result = sanitize_message(msg)
    assert "AKIAIOSFODNN7" not in result
    assert "***REDACTED***" in result


def test_redacts_long_string_near_sensitive_name() -> None:
    long_val = "a" * 50
    msg = f"api_key = {long_val}"
    result = sanitize_message(msg)
    assert long_val not in result
    assert "***REDACTED***" in result


def test_preserves_safe_message() -> None:
    msg = "Processing task 3 of 10"
    assert sanitize_message(msg) == msg


def test_redacts_secret_context() -> None:
    long_val = "B" * 45
    msg = f"password: {long_val}"
    result = sanitize_message(msg)
    assert long_val not in result


def test_sanitize_jwt_token() -> None:
    """JWT token is redacted."""
    jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyMTIzIn0.abcdefghijklmnop"
    msg = f"Authorization header: {jwt}"
    result = sanitize_message(msg)
    assert jwt not in result
    assert "***REDACTED***" in result


def test_sanitize_database_url() -> None:
    """postgres://user:pass@host is redacted."""
    db_url = "postgres://admin:secretpass123@db.example.com:5432/mydb"
    msg = f"Connecting to {db_url}"
    result = sanitize_message(msg)
    assert "postgres://admin:secretpass123@" not in result
    assert "***REDACTED***" in result


def test_sanitize_bearer_token() -> None:
    """Bearer abc123... is redacted."""
    bearer = "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    msg = f"Auth: {bearer}"
    result = sanitize_message(msg)
    assert bearer not in result
    assert "***REDACTED***" in result


def test_sanitize_short_token() -> None:
    """api_key= with 20+ char token is redacted; shorter are not (P3-6 fix)."""
    long_token = "longtokenvalue20charsXX"  # 22 chars — should be redacted
    msg_long = f"api_key={long_token}"
    result_long = sanitize_message(msg_long)
    assert long_token not in result_long
    assert "***REDACTED***" in result_long

    # 16-char tokens should NOT be redacted (reduced false positives)
    short_token = "short16chartoken"  # exactly 16 chars
    msg_short = f"api_key={short_token}"
    result_short = sanitize_message(msg_short)
    assert short_token in result_short  # NOT redacted — too short


# -- setup_logging ---------------------------------------------------------


def test_setup_creates_log_directory(tmp_path: pathlib.Path) -> None:
    setup_logging(tmp_path)
    log_dir = tmp_path / ".proxilion-build"
    assert log_dir.is_dir()


def test_setup_creates_log_file(tmp_path: pathlib.Path) -> None:
    setup_logging(tmp_path)
    log_file = tmp_path / ".proxilion-build" / "proxilion-build.log"
    assert log_file.is_file()


def test_log_directory_permissions(tmp_path: pathlib.Path) -> None:
    setup_logging(tmp_path)
    log_dir = tmp_path / ".proxilion-build"
    mode = stat.S_IMODE(log_dir.stat().st_mode)
    assert mode == 0o700


def test_log_file_permissions(tmp_path: pathlib.Path) -> None:
    setup_logging(tmp_path)
    log_file = tmp_path / ".proxilion-build" / "proxilion-build.log"
    mode = stat.S_IMODE(log_file.stat().st_mode)
    assert mode == 0o600


def test_returns_logger(tmp_path: pathlib.Path) -> None:
    logger = setup_logging(tmp_path)
    assert isinstance(logger, logging.Logger)
    assert logger.name == "proxilion_build"


def test_logger_writes_to_file(tmp_path: pathlib.Path) -> None:
    logger = setup_logging(tmp_path)
    logger.info("test message")
    # Flush handlers
    for handler in logger.handlers:
        handler.flush()
    log_file = tmp_path / ".proxilion-build" / "proxilion-build.log"
    content = log_file.read_text(encoding="utf-8")
    assert "test message" in content


def test_verbose_sets_console_to_debug(tmp_path: pathlib.Path) -> None:
    logger = setup_logging(tmp_path, verbose=True)
    console_handlers = [
        h
        for h in logger.handlers
        if isinstance(h, logging.StreamHandler) and not isinstance(h, logging.FileHandler)
    ]
    assert len(console_handlers) == 1
    assert console_handlers[0].level == logging.DEBUG


def test_non_verbose_sets_console_to_info(tmp_path: pathlib.Path) -> None:
    logger = setup_logging(tmp_path, verbose=False)
    console_handlers = [
        h
        for h in logger.handlers
        if isinstance(h, logging.StreamHandler) and not isinstance(h, logging.FileHandler)
    ]
    assert len(console_handlers) == 1
    assert console_handlers[0].level == logging.INFO


# -- SanitizingFilter ------------------------------------------------------


def test_filter_redacts_message(tmp_path: pathlib.Path) -> None:
    logger = setup_logging(tmp_path)
    logger.info("key is sk-abcdefghij0123456789extra")
    for handler in logger.handlers:
        handler.flush()
    log_file = tmp_path / ".proxilion-build" / "proxilion-build.log"
    content = log_file.read_text(encoding="utf-8")
    assert "sk-abcdefghij" not in content
    assert "***REDACTED***" in content


# -- create_log_callback ---------------------------------------------------


def test_callback_logs_event(tmp_path: pathlib.Path) -> None:
    logger = setup_logging(tmp_path)
    callback = create_log_callback(logger)
    callback("task_complete", {"task": "build"})
    for handler in logger.handlers:
        handler.flush()
    log_file = tmp_path / ".proxilion-build" / "proxilion-build.log"
    content = log_file.read_text(encoding="utf-8")
    assert "task_complete" in content
    assert "build" in content


def test_callback_sanitizes_data(tmp_path: pathlib.Path) -> None:
    logger = setup_logging(tmp_path)
    callback = create_log_callback(logger)
    callback("auth", {"key": "sk-abcdefghij0123456789extra"})
    for handler in logger.handlers:
        handler.flush()
    log_file = tmp_path / ".proxilion-build" / "proxilion-build.log"
    content = log_file.read_text(encoding="utf-8")
    assert "sk-abcdefghij" not in content


# -- Phase 11: Logger Reliability ------------------------------------------


def test_setup_logging_readonly_dir_falls_back_to_console(
    tmp_path: pathlib.Path,
) -> None:
    """When log directory cannot be created, logger returns with console handler only."""
    import logging
    from unittest.mock import patch

    with patch("pathlib.Path.mkdir", side_effect=OSError("read-only filesystem")):
        logger = setup_logging(tmp_path)

    # Must have at least one handler (the console handler)
    assert len(logger.handlers) >= 1
    # None of the handlers should be a file handler
    import logging.handlers as lh

    for handler in logger.handlers:
        assert not isinstance(handler, (logging.FileHandler, lh.RotatingFileHandler))


def test_sanitize_dict_keys() -> None:
    """Dict keys that look like secrets are also sanitized."""
    import logging

    # Create a plain record, then set args directly to avoid LogRecord.__init__
    # trying to format the message during construction (Python 3.14 behaviour).
    record = logging.LogRecord(
        name="proxilion_build",
        level=logging.INFO,
        pathname="",
        lineno=0,
        msg="test",
        args=None,
        exc_info=None,
    )
    record.args = {"sk-abcdefghij0123456789": "value"}
    f = SanitizingFilter()
    f.filter(record)
    assert isinstance(record.args, dict)
    for k in record.args:
        assert "sk-abcdefghij" not in str(k)


def test_sanitize_non_string_message(tmp_path: pathlib.Path) -> None:
    """Non-string log messages are converted to string before sanitization."""
    import logging

    record = logging.LogRecord(
        name="proxilion_build",
        level=logging.INFO,
        pathname="",
        lineno=0,
        msg=12345,
        args=None,
        exc_info=None,
    )
    f = SanitizingFilter()
    f.filter(record)
    assert isinstance(record.msg, str)
    assert record.msg == "12345"


def test_log_file_rotation_configured(tmp_path: pathlib.Path) -> None:
    """setup_logging uses RotatingFileHandler with 10 MB max size and 1 backup."""
    import logging.handlers as lh

    logger = setup_logging(tmp_path)
    rotating = [h for h in logger.handlers if isinstance(h, lh.RotatingFileHandler)]
    assert len(rotating) == 1
    assert rotating[0].maxBytes == 10 * 1024 * 1024
    assert rotating[0].backupCount == 1
