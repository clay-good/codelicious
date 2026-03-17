import subprocess
import shlex
from typing import TypedDict
import logging
from pathlib import Path

from codelicious.security_constants import BLOCKED_METACHARACTERS, DENIED_COMMANDS

logger = logging.getLogger("codelicious.tools.runner")


class ToolResponse(TypedDict):
    success: bool
    stdout: str
    stderr: str


class CommandRunner:
    """
    Executes shell commands using a denylist security model.

    Instead of only allowing a tiny set of commands (which cripples the agent),
    this blocks known-dangerous binaries and shell injection metacharacters,
    while using shell=False to prevent shell interpretation.

    The denylist is hardcoded — NOT configurable via config files — to prevent
    the LLM agent from escalating its own permissions.
    """

    def __init__(self, repo_path: Path, config: dict):
        self.repo_path = repo_path.resolve()

    def _is_safe(self, command: str) -> tuple[bool, str]:
        """
        Validates a command against the denylist and metacharacter filter.
        Returns (is_safe, reason) tuple.
        """
        if not command or not command.strip():
            return False, "Empty command"

        # Check for shell metacharacters (injection prevention)
        for char in BLOCKED_METACHARACTERS:
            if char in command:
                return (
                    False,
                    f"Blocked shell metacharacter '{char}' detected. Command chaining/injection is not allowed.",
                )

        # Extract base binary, resolving any path prefix (e.g. /bin/rm -> rm)
        parts = command.strip().split()
        base_binary = Path(parts[0]).name  # handles /usr/bin/rm -> rm

        # Strip common script extensions to catch rm.sh etc.
        for ext in (".sh", ".bash", ".zsh", ".bat", ".cmd"):
            if base_binary.endswith(ext):
                base_binary = base_binary[: -len(ext)]

        if base_binary in DENIED_COMMANDS:
            return False, f"Command '{base_binary}' is in the denied commands list."

        return True, ""

    def safe_run(self, command: str) -> ToolResponse:
        """
        Executes a command as a subprocess using shell=False, returning
        captured stdout/stderr formatted for LLM context ingestion.
        """
        is_safe, reason = self._is_safe(command)
        if not is_safe:
            error_msg = f"Security Violation: {reason}"
            logger.warning(error_msg)
            return {"success": False, "stdout": "", "stderr": error_msg}

        try:
            # Parse into argument list for shell=False execution
            args = shlex.split(command)
            logger.debug(f"Executing sandboxed command: {args}")

            res = subprocess.run(
                args,
                shell=False,  # CRITICAL: never use shell=True
                cwd=self.repo_path,
                capture_output=True,
                text=True,
                timeout=120,  # Hard timeout to prevent frozen LLM loops
            )

            return {
                "success": res.returncode == 0,
                "stdout": res.stdout,
                "stderr": res.stderr,
            }

        except subprocess.TimeoutExpired:
            return {
                "success": False,
                "stdout": "",
                "stderr": "Command timed out after 120s.",
            }
        except Exception as e:
            return {
                "success": False,
                "stdout": "",
                "stderr": f"Subprocess Execution Error: {str(e)}",
            }
