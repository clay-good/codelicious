import json
import logging
import datetime
from pathlib import Path

# Provide a specifically colored console logger for visibility
logging.addLevelName(logging.INFO, "\033[1;36m[AGENT INFO]\033[1;0m")
logging.addLevelName(logging.WARNING, "\033[1;33m[AGENT WARN]\033[1;0m")
logging.addLevelName(logging.ERROR, "\033[1;31m[AGENT ERROR]\033[1;0m")

console_logger = logging.getLogger("codelicious.audit")
console_logger.setLevel(logging.INFO)

if not console_logger.handlers:
    ch = logging.StreamHandler()
    formatter = logging.Formatter('%(levelname)s %(message)s')
    ch.setFormatter(formatter)
    console_logger.addHandler(ch)

class AuditLogger:
    """
    Guarantees that 100% of LLM actions, intents, and sandbox interceptions 
    are verbosely printed and appended to .codelicious/audit.log.
    """
    def __init__(self, repo_path: Path):
        self.log_file = repo_path / ".codelicious" / "audit.log"
        self.log_file.parent.mkdir(parents=True, exist_ok=True)
        # Touch file to ensure it exists initially
        if not self.log_file.exists():
            self.log_file.touch()

    def _write_to_file(self, level: str, tag: str, message: str):
        timestamp = datetime.datetime.now(datetime.timezone.utc).isoformat()
        try:
            with open(self.log_file, "a", encoding="utf-8") as f:
                f.write(f"[{timestamp}] [{level}] [{tag}] {message}\n")
        except Exception as e:
            # Fallback if logging fails, at least print to stdout
            print(f"FATAL: Audit log write failed: {e}")

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
            stdout_preview = response.get('stdout', '')[:200].replace('\n', ' ')
            msg = f"Success: '{tool_name}' returned -> {stdout_preview}..."
            console_logger.info(msg)
            self._write_to_file("INFO", "TOOL_SUCCESS", msg)
        else:
            err = response.get('stderr', '')
            msg = f"Failed: '{tool_name}' errored -> {err}"
            console_logger.error(msg)
            self._write_to_file("ERROR", "TOOL_FAILED", msg)

    def log_sandbox_violation(self, detail: str):
        msg = f"SANDBOX TRAP: {detail}"
        console_logger.warning(msg)
        self._write_to_file("WARN", "SECURITY_BOUNDARY", msg)
