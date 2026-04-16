import json
import logging
import time

from codelicious.context_manager import estimate_tokens
from codelicious.errors import LLMResponseFormatError, LLMResponseTooLargeError
from codelicious.llm_client import LLMClient
from codelicious.tools.registry import ToolRegistry

logger = logging.getLogger("codelicious.loop")

# Maximum token budget for message history to prevent OOM and API rejection
MAX_HISTORY_TOKENS = 80_000

# Maximum number of messages before auto-truncation safety net (spec-18 Phase 9: DP-3)
_MAX_HISTORY_MESSAGES = 200

# Maximum size for LLM JSON responses (5 MB) to prevent DoS via memory exhaustion
MAX_RESPONSE_BYTES = 5_000_000

# Maximum size for individual tool result content appended to message history (50 KB)
MAX_TOOL_RESULT_BYTES = 50_000

# Exponential backoff settings for LLM call retries (Finding 55)
_LLM_MAX_RETRIES: int = 3
_LLM_BACKOFF_BASE_S: float = 2.0  # seconds; doubles each retry (2, 4, 8)
# Consecutive LLM errors that trigger a hard abort of the agentic iteration
_LLM_MAX_CONSECUTIVE_ERRORS: int = _LLM_MAX_RETRIES


def parse_json_response(
    raw_response: str, *, require_dict: bool = True
) -> dict | list | str | int | float | bool | None:
    """Parse a JSON string with size and type validation.

    Args:
        raw_response: The raw JSON string to parse.
        require_dict: If True, raise LLMResponseFormatError if the parsed value is not a dict.

    Returns:
        The parsed JSON value.

    Raises:
        LLMResponseTooLargeError: If the response exceeds MAX_RESPONSE_BYTES.
        LLMResponseFormatError: If require_dict is True and the parsed value is not a dict.
        json.JSONDecodeError: If the response is not valid JSON.
    """
    if len(raw_response) > MAX_RESPONSE_BYTES:
        raise LLMResponseTooLargeError(f"LLM response too large: {len(raw_response)} bytes (max {MAX_RESPONSE_BYTES})")

    parsed = json.loads(raw_response)

    if require_dict and not isinstance(parsed, dict):
        raise LLMResponseFormatError(f"Expected dict from LLM, got {type(parsed).__name__}")

    return parsed


def truncate_history(messages: list[dict], max_tokens: int = MAX_HISTORY_TOKENS) -> list[dict]:
    """Truncate message history to stay within token budget.

    Keeps the system message (index 0) always. Removes oldest non-system
    messages until total is under max_tokens.

    Args:
        messages: List of message dicts with 'role' and 'content' keys.
        max_tokens: Maximum allowed token count for the history.

    Returns:
        Truncated message list (may be unchanged if already under budget).
    """
    if not messages:
        return messages

    def _estimate_message_tokens(msg: dict) -> int:
        """Estimate tokens in a single message."""
        content = msg.get("content", "")
        if content is None:
            content = ""
        # For tool calls, also count the function arguments
        tool_calls = msg.get("tool_calls", [])
        for tc in tool_calls:
            if isinstance(tc, dict) and "function" in tc:
                content += tc["function"].get("arguments", "")
        return estimate_tokens(str(content))

    # Pre-compute per-message token counts in a single pass (Finding 11)
    msg_tokens = [_estimate_message_tokens(m) for m in messages]
    total_tokens = sum(msg_tokens)

    if total_tokens <= max_tokens:
        return messages

    # Keep system message (index 0) always
    result = [messages[0]] if messages else []
    system_tokens = msg_tokens[0] if messages else 0
    budget_remaining = max_tokens - system_tokens

    # Collect non-system messages and count from the end (most recent)
    non_system = messages[1:]
    kept_messages = []
    kept_token_sum = 0

    # Work backwards from most recent to preserve recent context.
    # Use append() + reverse() instead of insert(0, ...) to avoid O(n^2) shifting.
    for i in range(len(non_system) - 1, -1, -1):
        tokens = msg_tokens[i + 1]  # +1 because msg_tokens includes system msg at index 0
        if budget_remaining >= tokens:
            kept_messages.append(non_system[i])
            budget_remaining -= tokens
            kept_token_sum += tokens

    # Restore chronological order (we iterated in reverse)
    kept_messages.reverse()

    messages_removed = len(non_system) - len(kept_messages)
    tokens_before = total_tokens
    tokens_after = system_tokens + kept_token_sum

    if messages_removed > 0:
        logger.warning(
            "Truncated %d messages from history (tokens: %d -> %d)",
            messages_removed,
            tokens_before,
            tokens_after,
        )

    return result + kept_messages


class BuildLoop:
    """
    The probabilistic 90% engine loop driving LLM generated JSON requests safely
    into the 10% deterministic sandbox, managing Git PR commits upon verifiable success.
    """

    def __init__(self, repo_path, git_manager, cache_manager, spec_filter=None):
        self.repo_path = repo_path
        self.git_manager = git_manager
        self.cache_manager = cache_manager

        # Load configs
        from codelicious.config import load_project_config

        self.config = load_project_config(self.repo_path)

        # Initialize Sandboxed Tooling Hub
        self.tool_registry = ToolRegistry(
            repo_path=self.repo_path,
            config=self.config,
            cache_manager=self.cache_manager,
        )

        # Generate tool schema once — it is static for the lifetime of this
        # BuildLoop instance and does not need to be regenerated per iteration.
        self._tool_schema = self.tool_registry.generate_schema()

        # Initialize HuggingFace HTTP Driver
        self.llm = LLMClient()

        # Initialize Context Window Memory
        system_prompt = (
            "You are Codelicious, an autonomous Outcome-as-a-Service CLI. You operate under a 90% probabilistic model, meaning "
            "YOU are responsible for finding work, planning, and executing. Python is just your sandboxed constraint overlay.\n\n"
            "PHASE 1 (SPEC FINDER): Use the `list_directory` tool to deeply scan the repository root. Find any `*.md` files "
            "(especially in `docs/` or `specs/`) that define your objective.\n\n"
            "PHASE 2 (EXECUTION): Use `read_file` to read the found specifications. Then, aggressively use `write_file` to modify "
            "the codebase to achieve the spec requirements. Run verification tools (like `pytest` or `eslint`) using `run_command`.\n\n"
            "When every single requirement is met and tests pass, reply with the explicit text: 'ALL_SPECS_COMPLETE' so the core "
            "can trigger the GitHub PR transition."
        )
        self.messages = [{"role": "system", "content": system_prompt}]

    def _execute_agentic_iteration(self) -> bool:
        """
        Executes a singular probabilistic dialogue cycle with the LLM, passing tool definitions
        and capturing JSON payloads for the deterministic ToolRegistry execution.
        """
        # Safety net: auto-truncate if message count exceeds limit (spec-18 Phase 9: DP-3)
        if len(self.messages) > _MAX_HISTORY_MESSAGES:
            logger.warning("Message history exceeded %d messages, auto-truncating", _MAX_HISTORY_MESSAGES)
            self.messages = truncate_history(self.messages, MAX_HISTORY_TOKENS)

        # Truncate message history to prevent OOM and API rejection from large payloads
        self.messages = truncate_history(self.messages, MAX_HISTORY_TOKENS)

        logger.info("Pinging HuggingFace LLM inference endpoint...")
        # Use coder model — it handles both planning and code writing via tool calls.
        # Wrap in exponential-backoff retry to handle transient API errors (Finding 55).
        response = None
        last_llm_error: Exception | None = None
        for _attempt in range(_LLM_MAX_RETRIES):
            try:
                response = self.llm.chat_completion(self.messages, tools=self._tool_schema, role="coder")
                last_llm_error = None
                break
            except Exception as llm_exc:
                last_llm_error = llm_exc
                wait_s = _LLM_BACKOFF_BASE_S * (2**_attempt)
                logger.warning(
                    "LLM call failed (attempt %d/%d): %s — retrying in %.1fs",
                    _attempt + 1,
                    _LLM_MAX_RETRIES,
                    llm_exc,
                    wait_s,
                )
                time.sleep(wait_s)

        if last_llm_error is not None:
            # All retries exhausted — surface the error so the caller can decide
            logger.error("LLM call failed after %d attempts: %s", _LLM_MAX_RETRIES, last_llm_error)
            raise last_llm_error

        choices = response.get("choices") or []
        if not choices or not isinstance(choices[0], dict):
            raise RuntimeError("Malformed LLM response: missing or empty choices")
        message_obj = choices[0].get("message")
        if not isinstance(message_obj, dict) or "role" not in message_obj:
            raise RuntimeError("Malformed LLM response: invalid message object")
        self.messages.append(message_obj)

        # Handle explicitly requested Tool Calls (e.g. read_file, run_command)
        tool_calls = self.llm.parse_tool_calls(response)

        if not tool_calls:
            # Reached a conversational breakpoint (or done). We check if it explicitly declared "DONE".
            content = self.llm.parse_content(response)
            if "ALL_SPECS_COMPLETE" in content:
                logger.info("Agent signaled completion criteria met.")
                return True
            else:
                # Prompt the LLM to continue its work stream
                self.messages.append(
                    {
                        "role": "user",
                        "content": "Please continue exploring or implementing using your toolset until you can declare ALL_SPECS_COMPLETE.",
                    }
                )
                return False

        # Deterministic Interception: Execute the requested tools
        for tool_call in tool_calls:
            try:
                raw_args = tool_call["function"]["arguments"]
                args = parse_json_response(raw_args, require_dict=True)
                name = tool_call["function"]["name"]

                # Execute mapped function in python
                tool_result = self.tool_registry.dispatch(name, args)

                # Append the raw return payload to context, capping at MAX_TOOL_RESULT_BYTES
                # to prevent a single large tool response from exhausting context (Finding 53).
                tool_content = json.dumps(tool_result)
                if len(tool_content) > MAX_TOOL_RESULT_BYTES:
                    tool_content = tool_content[:MAX_TOOL_RESULT_BYTES] + "...<truncated>"
                    logger.warning(
                        "Tool result for '%s' truncated to %d bytes (original: %d bytes)",
                        name,
                        MAX_TOOL_RESULT_BYTES,
                        len(json.dumps(tool_result)),
                    )
                self.messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_call.get("id", ""),
                        "name": name,
                        "content": tool_content,
                    }
                )
            except Exception as e:
                # Log only tool name, not full arguments which may contain secrets (Finding 40)
                tool_name = tool_call.get("function", {}).get("name", "unknown")
                logger.error("Failed to process tool call %s: %s", tool_name, type(e).__name__)
                self.messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_call.get("id", ""),
                        "name": tool_call.get("function", {}).get("name", "unknown"),
                        "content": json.dumps(
                            {
                                "success": False,
                                "stderr": f"Tool Execution Pipeline Error: {e}",
                            }
                        ),
                    }
                )

        return False

    def run_continuous_cycle(self) -> bool:
        """
        The main control flow. Repeatedly loops Agent Inference -> Sandboxed Tool Result
        until the model signals completion.
        """
        logger.info("Initializing Continuous Agentic Loop.")

        # In a generic loop, we run until completion or a max failure threshold limit
        max_iterations = 50
        completed = False
        consecutive_errors = 0

        for iteration in range(max_iterations):
            logger.info("--- Iteration %d/%d ---", iteration + 1, max_iterations)
            self.tool_registry.reset_call_count()

            try:
                completed = self._execute_agentic_iteration()
                consecutive_errors = 0  # Reset on success
            except Exception as iter_exc:
                consecutive_errors += 1
                logger.error(
                    "Agentic iteration %d failed: %s (consecutive errors: %d/%d)",
                    iteration + 1,
                    iter_exc,
                    consecutive_errors,
                    _LLM_MAX_CONSECUTIVE_ERRORS,
                )
                if consecutive_errors >= _LLM_MAX_CONSECUTIVE_ERRORS:
                    logger.error(
                        "Aborting loop after %d consecutive LLM errors.",
                        consecutive_errors,
                    )
                    return False
                continue

            if completed:
                # Ensure final changes are committed deterministically
                self.git_manager.commit_verified_changes(commit_message="Auto-Implementation: All specs complete.")
                break

        # Close tool registry to release file handles (Finding 1: AuditLogger leak)
        self.tool_registry.close()

        if not completed:
            logger.error("Build cycle exhausted maximum iteration patience threshold.")
            return False

        return True
