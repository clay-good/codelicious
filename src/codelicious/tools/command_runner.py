import logging
import os
import shlex
import signal
import subprocess
from pathlib import Path
from typing import TypedDict

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

        Uses shlex.split() for tokenization to ensure validation and execution
        use the same parsing logic (fixes P1-2).
        """
        if not command or not command.strip():
            return False, "Empty command"

        # Reject newline characters before any tokenization (fixes P1-2 newline injection)
        if "\n" in command or "\r" in command:
            return False, "Newline characters not allowed in commands"

        # Check for shell metacharacters (injection prevention)
        for char in BLOCKED_METACHARACTERS:
            if char in command:
                return (
                    False,
                    f"Blocked shell metacharacter '{char}' detected. Command chaining/injection is not allowed.",
                )

        # Use shlex.split() for tokenization - same as execution path (fixes P1-2)
        try:
            parts = shlex.split(command.strip())
        except ValueError as e:
            # Malformed shell quoting (unmatched quotes, etc.)
            return False, f"Malformed command quoting: {e}"

        if not parts:
            return False, "Empty command after parsing"

        base_binary = Path(parts[0]).name  # handles /usr/bin/rm -> rm

        # Strip common script extensions to catch rm.sh etc.
        for ext in (".sh", ".bash", ".zsh", ".bat", ".cmd"):
            if base_binary.endswith(ext):
                base_binary = base_binary[: -len(ext)]

        if base_binary in DENIED_COMMANDS:
            return False, f"Command '{base_binary}' is in the denied commands list."

        return True, ""

    def safe_run(self, command: str, timeout: int = 120) -> ToolResponse:
        """
        Executes a command as a subprocess using shell=False, returning
        captured stdout/stderr formatted for LLM context ingestion.

        Uses process groups to ensure all child processes are killed on timeout (fixes P2-3).
        """
        is_safe, reason = self._is_safe(command)
        if not is_safe:
            error_msg = f"Security Violation: {reason}"
            logger.warning(error_msg)
            return {"success": False, "stdout": "", "stderr": error_msg}

        try:
            # Parse into argument list for shell=False execution
            args = shlex.split(command)
            logger.debug("Executing sandboxed command: %s", args)

            # Use start_new_session=True to create a new process group (fixes P2-3)
            # This allows us to kill the entire process group on timeout
            proc = subprocess.Popen(
                args,
                shell=False,  # CRITICAL: never use shell=True
                cwd=self.repo_path,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                start_new_session=True,  # Create new process group for clean timeout
            )

            try:
                stdout, stderr = proc.communicate(timeout=timeout)
                return {
                    "success": proc.returncode == 0,
                    "stdout": stdout,
                    "stderr": stderr,
                }
            except subprocess.TimeoutExpired:
                # Kill the entire process group (fixes P2-3)
                try:
                    os.killpg(proc.pid, signal.SIGKILL)
                except (ProcessLookupError, OSError):
                    # Process already exited or no permission
                    pass
                # Also ensure the process itself is terminated
                try:
                    proc.kill()
                except (ProcessLookupError, OSError):
                    pass
                # Clean up any remaining output
                try:
                    proc.communicate(timeout=1)
                except (subprocess.TimeoutExpired, OSError):
                    pass
                return {
                    "success": False,
                    "stdout": "",
                    "stderr": f"Command timed out after {timeout}s.",
                }

        except ValueError as e:
            # shlex.split() failed - should not happen since _is_safe checks this
            return {
                "success": False,
                "stdout": "",
                "stderr": f"Security Violation: Malformed command quoting: {e}",
            }
        except Exception as e:
            # Kill the process and drain pipes so no handles are leaked
            # (Finding 26: subprocess pipes not closed on non-timeout error paths).
            try:
                proc.kill()
            except (ProcessLookupError, OSError, UnboundLocalError):
                pass
            try:
                proc.communicate(timeout=1)
            except (subprocess.TimeoutExpired, OSError, UnboundLocalError):
                pass
            return {
                "success": False,
                "stdout": "",
                "stderr": f"Subprocess Execution Error: {e!s}",
            }
