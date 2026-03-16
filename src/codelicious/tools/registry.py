import logging
from typing import Any, Callable
from codelicious.tools.fs_tools import FSTooling
from codelicious.tools.command_runner import CommandRunner
from codelicious.tools.audit_logger import AuditLogger
from codelicious.context.cache_engine import CacheManager
from codelicious.context.rag_engine import RagEngine

logger = logging.getLogger("codelicious.tools.registry")


class ToolRegistry:
    """
    Central hub routing LLM JSON payloads to the corresponding native python deterministic tools.
    """

    def __init__(self, repo_path, config: dict, cache_manager: CacheManager):
        self.fs_tools = FSTooling(repo_path, cache_manager)
        self.command_runner = CommandRunner(repo_path, config)
        self.audit = AuditLogger(repo_path)
        self.rag = RagEngine(repo_path)

        # Mapping Tool Name -> Function execution
        self.registry: dict[str, Callable] = {
            "read_file": self.fs_tools.native_read_file,
            "write_file": self.fs_tools.native_write_file,
            "list_directory": self.fs_tools.native_list_directory,
            "run_command": self.command_runner.safe_run,
            "semantic_search": self.rag.semantic_search,
        }

    def dispatch(self, tool_name: str, kwargs: dict) -> dict[str, Any]:
        """
        Safely invokes a tool based on the LLMs JSON output request.
        """

        # [AUDIT TRAIL] 1: Log Intent
        self.audit.log_tool_intent(tool_name, kwargs)

        if tool_name not in self.registry:
            error_msg = f"Tool '{tool_name}' does not exist in registry."
            response = {"success": False, "stdout": "", "stderr": error_msg}
            self.audit.log_tool_outcome(tool_name, response)
            return response

        try:
            func = self.registry[tool_name]
            # Assumes kwargs matches the type hints defined exactly in the Prompts
            response = func(**kwargs)

            # [AUDIT TRAIL] 2: Log Result
            self.audit.log_tool_outcome(tool_name, response)
            return response

        except TypeError as e:
            resp = {
                "success": False,
                "stdout": "",
                "stderr": f"Invalid arguments applied to {tool_name}: {e}",
            }
            self.audit.log_tool_outcome(tool_name, resp)
            return resp
        except Exception as e:
            self.audit.log_sandbox_violation(
                f"Fatal error within tool '{tool_name}' execution: {e}"
            )
            return {
                "success": False,
                "stdout": "",
                "stderr": f"Internal Tool Fault: {e}",
            }

    def generate_schema(self) -> list[dict]:
        """
        Generates the standard OpenAI-compatible tool JSON Schema array.
        Informs the LLM exactly what tools it has and their required parameters.
        """
        return [
            {
                "type": "function",
                "function": {
                    "name": "read_file",
                    "description": "Reads the text content of a file within the sandbox.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "rel_path": {
                                "type": "string",
                                "description": "The relative path to the file to read.",
                            }
                        },
                        "required": ["rel_path"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "write_file",
                    "description": "Atomically writes content to a file. Used to generate or modify code.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "rel_path": {
                                "type": "string",
                                "description": "The relative path to write the file to.",
                            },
                            "content": {
                                "type": "string",
                                "description": "The full exact content to write to the file.",
                            },
                        },
                        "required": ["rel_path", "content"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "list_directory",
                    "description": "Lists the directory structure safely. Identifies specs and repos.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "rel_path": {
                                "type": "string",
                                "description": "The relative path of the directory. Defaults to '.' (root).",
                            }
                        },
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "run_command",
                    "description": "Executes an allowlisted terminal command (e.g., tests, linters).",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "command": {
                                "type": "string",
                                "description": "The shell command to run (must be configured in allowlist).",
                            }
                        },
                        "required": ["command"],
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "semantic_search",
                    "description": "Performs a vector database similarity search to instantly find relevant codebase context. Use this instead of guessing file paths.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {
                                "type": "string",
                                "description": "The natural language query describing the architecture or logic you need to locate (e.g., 'authentication middleware flow').",
                            }
                        },
                        "required": ["query"],
                    },
                },
            },
        ]
