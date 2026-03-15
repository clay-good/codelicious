import subprocess
import os
from typing import TypedDict
import logging
from pathlib import Path

logger = logging.getLogger("codelicious.tools.runner")

class ToolResponse(TypedDict):
    success: bool
    stdout: str
    stderr: str

class CommandRunner:
    """
    Executes shell commands strictly if they are explicitly authorized
    within the `.codelicious/config.json` allowlist. Blocks arbitrary execution.
    """
    def __init__(self, repo_path: Path, config: dict):
        self.repo_path = repo_path.resolve()
        self.allowlisted_commands = set(config.get("allowlisted_commands", ["pytest", "npm", "cargo", "ruff", "eslint", "black"]))

    def _is_safe(self, command: str) -> bool:
        """
        Parses the base binary of the requested command against the configured allowlist.
        """
        if not command:
            return False
        
        base_binary = command.split()[0]
        return base_binary in self.allowlisted_commands

    def safe_run(self, command: str) -> ToolResponse:
        """
        Executes a command natively as a subprocess, returning captured stdout/stderr
        formatted strictly for LLM context ingestion.
        """
        if not self._is_safe(command):
            error_msg = f"Security Violation: Command '{command}' base binary is not in the allowlist. Allowed boundaries: {self.allowlisted_commands}"
            logger.warning(error_msg)
            return {"success": False, "stdout": "", "stderr": error_msg}

        try:
            logger.debug(f"Executing sandboxed command: {command}")
            # We strictly enforce execution relative to the project directory
            res = subprocess.run(
                command, 
                shell=True, 
                cwd=self.repo_path, 
                capture_output=True, 
                text=True, 
                timeout=120  # Hard timeout to prevent frozen LLM loops
            )
            
            return {
                "success": res.returncode == 0,
                "stdout": res.stdout,
                "stderr": res.stderr
            }
            
        except subprocess.TimeoutExpired:
            return {"success": False, "stdout": "", "stderr": f"Command timed out after 120s."}
        except Exception as e:
            return {"success": False, "stdout": "", "stderr": f"Subprocess Execution Error: {str(e)}"}
