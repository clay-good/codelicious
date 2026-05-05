from __future__ import annotations

import contextlib
import datetime
import json
import logging
import os
import sys
import threading
from enum import Enum
from pathlib import Path


class AuditFormatter(logging.Formatter):
    """Custom formatter that adds ANSI color codes only when output is a TTY.

    This avoids globally mutating logging level names, which would inject
    ANSI escape codes into file handlers, CI collectors, and third-party libraries.
    """

    COLORS = {
        logging.INFO: "\033[1;36m[AGENT INFO]\033[0m",
        logging.WARNING: "\033[1;33m[AGENT WARN]\033[0m",
        logging.ERROR: "\033[1;31m[AGENT ERROR]\033[0m",
    }

    PLAIN = {
        logging.INFO: "[AGENT INFO]",
        logging.WARNING: "[AGENT WARN]",
        logging.ERROR: "[AGENT ERROR]",
    }

    def __init__(self, fmt: str | None = None, datefmt: str | None = None, use_color: bool = False):
        super().__init__(fmt, datefmt)
        self.use_color = use_color

    def format(self, record: logging.LogRecord) -> str:
        # Save and restore levelname so downstream handlers are not corrupted (spec-22 Phase 6)
        orig_levelname = record.levelname
        if self.use_color and record.levelno in self.COLORS:
            record.levelname = self.COLORS[record.levelno]
        elif record.levelno in self.PLAIN:
            record.levelname = self.PLAIN[record.levelno]
        result = super().format(record)
        record.levelname = orig_levelname
        return result


console_logger = logging.getLogger("codelicious.audit")
console_logger.setLevel(logging.INFO)

if not console_logger.handlers:
    ch = logging.StreamHandler()
    # Use color only when stderr is a TTY
    formatter = AuditFormatter("%(levelname)s %(message)s", use_color=sys.stderr.isatty())
    ch.setFormatter(formatter)
    console_logger.addHandler(ch)


class SecurityEvent(str, Enum):
    """Security event categories for audit logging.

    These events are logged to both audit.log and security.log for
    easy review of security-relevant actions.
    """

    COMMAND_DENIED = "COMMAND_DENIED"
    METACHAR_BLOCKED = "METACHAR_BLOCKED"
    PATH_TRAVERSAL_BLOCKED = "PATH_TRAVERSAL_BLOCKED"
    EXTENSION_BLOCKED = "EXTENSION_BLOCKED"
    SELF_MODIFICATION_BLOCKED = "SELF_MODIFICATION_BLOCKED"
    FILE_SIZE_EXCEEDED = "FILE_SIZE_EXCEEDED"
    FILE_COUNT_EXCEEDED = "FILE_COUNT_EXCEEDED"
    SYMLINK_ESCAPE_BLOCKED = "SYMLINK_ESCAPE_BLOCKED"
    SECURITY_PATTERN_DETECTED = "SECURITY_PATTERN_DETECTED"
    DENIED_PATH_WRITE = "DENIED_PATH_WRITE"


class AuditLogger:
    """
    Guarantees that 100% of LLM actions, intents, and sandbox interceptions
    are verbosely printed and appended to .codelicious/audit.log.

    Security events are also logged to a dedicated .codelicious/security.log
    for easy review of security-relevant actions.
    """

    def __init__(self, repo_path: Path):
        self.log_file = repo_path / ".codelicious" / "audit.log"
        self.security_log_file = repo_path / ".codelicious" / "security.log"
        self.log_file.parent.mkdir(parents=True, exist_ok=True)
        # Touch files to ensure they exist initially
        if not self.log_file.exists():
            self.log_file.touch()
        if not self.security_log_file.exists():
            self.security_log_file.touch()
        # Track current iteration for security event logging
        self._current_iteration: int = 0
        self._current_tool: str = ""
        # Lock that serialises all file writes so concurrent threads cannot
        # interleave entries (Finding 51).
        self._write_lock = threading.Lock()
        # spec v30 Step 11: cross-process append guard. When two `codelicious`
        # processes share an audit dir (e.g. CODELICIOUS_AUDIT_DIR pointed at a
        # shared location) we need an OS-level lock so entries don't interleave
        # across rotation boundaries. We lock a dedicated file because
        # rotation may move the audit log itself.
        self._lock_path = self.log_file.parent / ".audit.lock"
        try:
            self._lock_fd = os.open(str(self._lock_path), os.O_CREAT | os.O_RDWR, 0o600)
        except OSError as exc:
            console_logger.warning("AuditLogger: cannot open audit lock %s: %s", self._lock_path, exc)
            self._lock_fd = None
        self._cross_process_lock_warned: bool = False
        # Keep file handles open for the lifetime of the instance to avoid the
        # overhead of open/close on every tool call (Finding 18).
        # buffering=1 enables line-buffered mode so entries are flushed after
        # each newline without needing explicit flushes.
        # Degrade gracefully if the log directory is read-only or the disk is
        # full — a partially-initialised AuditLogger that crashed mid-__init__
        # would take the whole orchestrator down. Write methods already swallow
        # exceptions, so None handles will surface as AttributeError → caught.
        try:
            self._audit_fh = open(self.log_file, "a", encoding="utf-8", buffering=1)  # noqa: SIM115
        except OSError as exc:
            console_logger.warning("AuditLogger: cannot open audit log %s: %s", self.log_file, exc)
            self._audit_fh = None
        try:
            self._security_fh = open(self.security_log_file, "a", encoding="utf-8", buffering=1)  # noqa: SIM115
        except OSError as exc:
            console_logger.warning("AuditLogger: cannot open security log %s: %s", self.security_log_file, exc)
            self._security_fh = None

    @contextlib.contextmanager
    def _cross_process_lock(self):
        """Acquire an exclusive OS lock on ``.audit.lock`` for the critical
        section (spec v30 Step 11).

        On Windows, ``fcntl`` is unavailable; falls back to ``msvcrt.locking``
        when present, otherwise logs a one-shot WARNING and proceeds with
        intra-process locking only.
        """
        if self._lock_fd is None:
            yield
            return

        try:
            import fcntl
            import time as _time

            # Non-blocking with bounded retry: if a peer process holds the lock
            # during a slow rotation, we don't want the orchestrator's main
            # loop to block indefinitely. After ~30 ms of contention give up
            # and proceed with intra-process locking only.
            acquired = False
            for _ in range(3):
                try:
                    fcntl.flock(self._lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    acquired = True
                    break
                except OSError:
                    _time.sleep(0.01)
            if not acquired:
                if not self._cross_process_lock_warned:
                    console_logger.warning(
                        "AuditLogger: could not acquire cross-process audit lock; proceeding without it"
                    )
                    self._cross_process_lock_warned = True
                yield
                return
            try:
                yield
            finally:
                try:
                    fcntl.flock(self._lock_fd, fcntl.LOCK_UN)
                except OSError:
                    pass
            return
        except ImportError:
            pass  # fall through to msvcrt branch

        try:
            import msvcrt

            msvcrt.locking(self._lock_fd, msvcrt.LK_LOCK, 1)
            try:
                yield
            finally:
                try:
                    # Rewind so the unlock targets the same byte we locked.
                    os.lseek(self._lock_fd, 0, os.SEEK_SET)
                    msvcrt.locking(self._lock_fd, msvcrt.LK_UNLCK, 1)
                except OSError:
                    pass
            return
        except ImportError:
            if not self._cross_process_lock_warned:
                console_logger.warning("AuditLogger: cross-process audit-log locking unavailable on this platform")
                self._cross_process_lock_warned = True
            yield

    def close(self) -> None:
        """Close the persistent file handles.

        Call this when the AuditLogger is no longer needed (e.g. at program
        exit). After calling close(), further log calls will raise an error.
        """
        try:
            if self._audit_fh is not None:
                self._audit_fh.close()
        except OSError:
            pass
        try:
            if self._security_fh is not None:
                self._security_fh.close()
        except OSError:
            pass
        try:
            if getattr(self, "_lock_fd", None) is not None:
                os.close(self._lock_fd)
                self._lock_fd = None
        except OSError:
            pass

    def __del__(self) -> None:
        """Best-effort cleanup of file handles on garbage collection."""
        self.close()

    def __enter__(self) -> AuditLogger:
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.close()

    def set_iteration(self, iteration: int) -> None:
        """Set the current iteration number for security event logging."""
        self._current_iteration = iteration

    def set_current_tool(self, tool_name: str) -> None:
        """Set the current tool name for security event logging."""
        self._current_tool = tool_name

    def _write_to_file(self, level: str, tag: str, message: str):
        timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
        try:
            # spec v30 Step 11: hold both intra- and inter-process locks so a
            # second codelicious process sharing the audit dir cannot interleave
            # bytes mid-line.
            with self._write_lock, self._cross_process_lock():
                self._audit_fh.write(f"[{timestamp}] [{level}] [{tag}] {message}\n")
                self._audit_fh.flush()
        except Exception as e:
            # Fallback if logging fails, at least print to stdout
            print(f"FATAL: Audit log write failed: {e}")

    def _write_to_security_log(
        self,
        event: SecurityEvent,
        message: str,
        *,
        iteration: int | None = None,
        tool: str | None = None,
    ) -> None:
        """Write a security event to both audit.log and security.log.

        Security log format:
        2026-03-15T15:06:23Z [SECURITY] EVENT_NAME: message (iteration N, tool: tool_name)

        Args:
            event: The security event type.
            message: Description of what happened.
            iteration: Override iteration number. Falls back to _current_iteration.
            tool: Override tool name. Falls back to _current_tool.
        """
        timestamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        iter_val = iteration if iteration is not None else self._current_iteration
        tool_val = tool if tool is not None else self._current_tool
        context = f"iteration {iter_val}, tool: {tool_val or 'unknown'}"
        full_message = f"{message} ({context})"
        log_line = f"{timestamp} [SECURITY] {event.value}: {full_message}\n"

        # spec v30 Step 11: dual-write under both intra- and inter-process locks.
        try:
            with self._write_lock, self._cross_process_lock():
                self._audit_fh.write(log_line)
                self._audit_fh.flush()
                self._security_fh.write(log_line)
                self._security_fh.flush()
        except Exception as e:
            print(f"FATAL: Security log write failed: {e}")

        # Also log to console with warning level for visibility
        console_logger.warning("[SECURITY] %s: %s", event.value, full_message)

    def log_security_event(
        self,
        event: SecurityEvent,
        message: str,
        *,
        iteration: int | None = None,
        tool: str | None = None,
    ) -> None:
        """Log a security event to audit.log and security.log.

        Args:
            event: The type of security event.
            message: Description of what happened.
            iteration: Override the current iteration number (optional).
            tool: Override the current tool name (optional).
        """
        # Pass iteration/tool as parameters to avoid thread-unsafe mutation
        # of shared instance state (Finding 17).
        self._write_to_security_log(event, message, iteration=iteration, tool=tool)

    def log_tool_intent(self, tool_name: str, kwargs: dict):
        """Called immediately when the LLM outputs a tool call JSON, before execution."""
        safe_kwargs = json.dumps(kwargs, default=str)
        msg = f"Intent: Executing '{tool_name}' with args: {safe_kwargs}"
        console_logger.info(msg)
        self._write_to_file("INFO", "TOOL_DISPATCH", msg)

    def log_tool_outcome(self, tool_name: str, response: dict):
        """Called immediately after native python execution, before returning to Qwen/DeepSeek context."""
        success = response.get("success", False)

        if success:
            stdout_preview = response.get("stdout", "")[:200].replace("\n", " ")
            msg = f"Success: '{tool_name}' returned -> {stdout_preview}..."
            console_logger.info(msg)
            self._write_to_file("INFO", "TOOL_SUCCESS", msg)
        else:
            err = response.get("stderr", "")
            msg = f"Failed: '{tool_name}' errored -> {err}"
            console_logger.error(msg)
            self._write_to_file("ERROR", "TOOL_FAILED", msg)

    def log_sandbox_violation(self, detail: str, event_type: SecurityEvent | None = None):
        """Log a sandbox violation as a security event.

        Args:
            detail: Description of the violation.
            event_type: Specific security event type. If None, uses a generic format.
        """
        if event_type is not None:
            self.log_security_event(event_type, detail)
        else:
            # Fallback for legacy code that doesn't specify event type
            msg = f"SANDBOX TRAP: {detail}"
            console_logger.warning(msg)
            self._write_to_file("WARN", "SECURITY_BOUNDARY", msg)
