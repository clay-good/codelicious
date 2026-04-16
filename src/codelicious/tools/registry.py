from __future__ import annotations

import concurrent.futures
import logging
from collections.abc import Callable
from typing import Any

from codelicious.context.cache_engine import CacheManager
from codelicious.context.rag_engine import RagEngine
from codelicious.tools.audit_logger import AuditLogger
from codelicious.tools.command_runner import CommandRunner
from codelicious.tools.fs_tools import FSTooling

logger = logging.getLogger("codelicious.tools.registry")

# Default maximum number of tool calls allowed per iteration (Finding 44).
# Can be overridden via the ``max_calls_per_iteration`` config key.
_DEFAULT_MAX_CALLS_PER_ITERATION: int = 50


class ToolCallLimitError(Exception):
    """Raised when the per-iteration tool call limit is exceeded."""


class ToolRegistry:
    """Central hub routing LLM JSON payloads to the corresponding native python deterministic tools.

    Thread-safety note (Finding 30): ``dispatch()`` increments ``_call_count``
    without a lock.  ToolRegistry.dispatch() is intentionally NOT thread-safe
    and must only be called from a single thread per instance.  Adding a lock
    here would introduce unnecessary overhead for the standard single-threaded
    agent loop.  Callers that need concurrent dispatch must create one
    ToolRegistry instance per thread.
    """

    def __init__(self, repo_path, config: dict, cache_manager: CacheManager):
        self.fs_tools = FSTooling(repo_path, cache_manager)
        self.command_runner = CommandRunner(repo_path, config)
        self.audit = AuditLogger(repo_path)
        self.rag = RagEngine(repo_path)

        # Per-iteration call counter with configurable maximum (Finding 44)
        self._call_count: int = 0
        self._max_calls_per_iteration: int = int(
            config.get("max_calls_per_iteration", _DEFAULT_MAX_CALLS_PER_ITERATION)
        )

        # Mapping Tool Name -> Function execution
        self.registry: dict[str, Callable] = {
            "read_file": self.fs_tools.native_read_file,
            "write_file": self.fs_tools.native_write_file,
            "list_directory": self.fs_tools.native_list_directory,
            "run_command": self.command_runner.safe_run,
            "semantic_search": self.rag.semantic_search,
        }

    def close(self) -> None:
        """Release resources held by sub-components (e.g. AuditLogger file handles)."""
        self.audit.close()

    def reset_call_count(self) -> None:
        """Reset the per-iteration tool call counter.

        Must be called between agent iterations to allow the next iteration
        a fresh quota of tool calls.
        """
        self._call_count = 0
        logger.debug("Tool call counter reset (max=%d).", self._max_calls_per_iteration)

    def _validate_tool_params(self, tool_name: str, kwargs: dict) -> None:
        """Pre-validate tool kwargs against schema before dispatch (spec-18 Phase 9: DP-1)."""
        schema = self._get_tool_schema(tool_name)
        if schema is None:
            return  # Unknown tool — dispatch() handles this separately

        params_schema = schema.get("function", {}).get("parameters", {})
        required = params_schema.get("required", [])
        for param in required:
            if param not in kwargs:
                from codelicious.errors import ToolValidationError

                raise ToolValidationError(f"Tool '{tool_name}' missing required parameter: {param}")

        known = set(params_schema.get("properties", {}).keys())
        if known:
            unknown = set(kwargs.keys()) - known
            if unknown:
                logger.warning("Tool '%s' received unknown parameters: %s", tool_name, unknown)

    def _get_tool_schema(self, tool_name: str) -> dict | None:
        """Look up the schema for a single tool by name."""
        for tool in self.generate_schema():
            if tool.get("function", {}).get("name") == tool_name:
                return tool
        return None

    def dispatch(self, tool_name: str, kwargs: dict) -> dict[str, Any]:
        """
        Safely invokes a tool based on the LLMs JSON output request.

        Raises ToolCallLimitError if the per-iteration call limit is exceeded
        (Finding 44: rate limiting on tool dispatch).
        """

        # [RATE LIMIT] Enforce per-iteration call cap before any work (Finding 44)
        self._call_count += 1
        if self._call_count > self._max_calls_per_iteration:
            error_msg = (
                f"Tool call limit reached: {self._max_calls_per_iteration} calls per iteration. "
                "Call reset_call_count() to begin a new iteration."
            )
            logger.error(error_msg)
            self.audit.log_sandbox_violation(error_msg)
            raise ToolCallLimitError(error_msg)

        # [AUDIT TRAIL] 1: Log Intent
        self.audit.log_tool_intent(tool_name, kwargs)

        # [PARAM VALIDATION] Pre-validate required params before dispatch (spec-18 Phase 9: DP-1)
        self._validate_tool_params(tool_name, kwargs)

        if tool_name not in self.registry:
            error_msg = f"Tool '{tool_name}' does not exist in registry."
            response = {"success": False, "stdout": "", "stderr": error_msg}
            self.audit.log_tool_outcome(tool_name, response)
            return response

        try:
            func = self.registry[tool_name]
            # Per-tool timeout prevents hanging tool calls (spec-18 Phase 6: TE-2)
            _TOOL_TIMEOUT_S = 60
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                future = pool.submit(func, **kwargs)
                try:
                    response = future.result(timeout=_TOOL_TIMEOUT_S)
                except concurrent.futures.TimeoutError as exc:
                    from codelicious.errors import ToolTimeoutError

                    raise ToolTimeoutError(f"Tool '{tool_name}' timed out after {_TOOL_TIMEOUT_S}s") from exc

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
            self.audit.log_sandbox_violation(f"Fatal error within tool '{tool_name}' execution: {e}")
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
                    "description": (
                        "Read the text content of a file. Use this to understand existing code "
                        'before making changes. Example: read_file({"rel_path": "src/main.py"})'
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "rel_path": {
                                "type": "string",
                                "description": "Relative path to the file, e.g. 'src/main.py' or 'tests/test_app.py'.",
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
                    "description": (
                        "Create or overwrite a file with the given content. The write is atomic "
                        "(safe against partial writes). Always provide the COMPLETE file content. "
                        'Example: write_file({"rel_path": "src/utils.py", "content": "def helper():\\n    return 42\\n"})'
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "rel_path": {
                                "type": "string",
                                "description": "Relative path for the file, e.g. 'src/utils.py'.",
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
                    "description": (
                        "List files and subdirectories at the given path. Use this to explore "
                        'the project structure. Example: list_directory({"rel_path": "src"})'
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "rel_path": {
                                "type": "string",
                                "description": "Relative directory path. Use '.' for the project root.",
                            }
                        },
                    },
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "run_command",
                    "description": (
                        "Run a shell command such as tests or linters. Do NOT run git or gh commands. "
                        'Examples: run_command({"command": "pytest tests/"}) or '
                        'run_command({"command": "ruff check src/"})'
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "command": {
                                "type": "string",
                                "description": "The shell command to execute, e.g. 'pytest', 'ruff check src/'.",
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
                    "description": (
                        "Search the codebase by meaning to find relevant files and functions. "
                        "Use this instead of guessing file paths. "
                        'Example: semantic_search({"query": "authentication middleware"})'
                    ),
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "query": {
                                "type": "string",
                                "description": "Natural language query, e.g. 'user authentication flow' or 'database connection setup'.",
                            }
                        },
                        "required": ["query"],
                    },
                },
            },
        ]
