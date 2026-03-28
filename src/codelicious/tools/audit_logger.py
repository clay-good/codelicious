import json
import logging
import datetime
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
        # Override the levelname with our custom format
        if self.use_color and record.levelno in self.COLORS:
            record.levelname = self.COLORS[record.levelno]
        elif record.levelno in self.PLAIN:
            record.levelname = self.PLAIN[record.levelno]
        return super().format(record)


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

    def set_iteration(self, iteration: int) -> None:
        """Set the current iteration number for security event logging."""
        self._current_iteration = iteration

    def set_current_tool(self, tool_name: str) -> None:
        """Set the current tool name for security event logging."""
        self._current_tool = tool_name

    def _write_to_file(self, level: str, tag: str, message: str):
        timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
        try:
            with self._write_lock:
                with open(self.log_file, "a", encoding="utf-8") as f:
                    f.write(f"[{timestamp}] [{level}] [{tag}] {message}\n")
        except Exception as e:
            # Fallback if logging fails, at least print to stdout
            print(f"FATAL: Audit log write failed: {e}")

    def _write_to_security_log(self, event: SecurityEvent, message: str) -> None:
        """Write a security event to both audit.log and security.log.

        Security log format:
        2026-03-15T15:06:23Z [SECURITY] EVENT_NAME: message (iteration N, tool: tool_name)
        """
        timestamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        context = f"iteration {self._current_iteration}, tool: {self._current_tool or 'unknown'}"
        full_message = f"{message} ({context})"
        log_line = f"{timestamp} [SECURITY] {event.value}: {full_message}\n"

        # Write to both logs under a single lock to keep entries atomic
        try:
            with self._write_lock:
                with open(self.log_file, "a", encoding="utf-8") as f:
                    f.write(log_line)
                with open(self.security_log_file, "a", encoding="utf-8") as f:
                    f.write(log_line)
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
        # Allow overriding iteration and tool for specific events
        old_iteration = self._current_iteration
        old_tool = self._current_tool
        if iteration is not None:
            self._current_iteration = iteration
        if tool is not None:
            self._current_tool = tool

        self._write_to_security_log(event, message)

        # Restore original values
        self._current_iteration = old_iteration
        self._current_tool = old_tool

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
