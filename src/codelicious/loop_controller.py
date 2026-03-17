import logging
import json
from codelicious.tools.registry import ToolRegistry
from codelicious.llm_client import LLMClient
from codelicious.context_manager import estimate_tokens

logger = logging.getLogger("codelicious.loop")

# Maximum token budget for message history to prevent OOM and API rejection
MAX_HISTORY_TOKENS = 80_000


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

    # Calculate total tokens
    total_tokens = sum(_estimate_message_tokens(m) for m in messages)

    if total_tokens <= max_tokens:
        return messages

    # Keep system message (index 0) always
    result = [messages[0]] if messages else []
    system_tokens = _estimate_message_tokens(messages[0]) if messages else 0
    budget_remaining = max_tokens - system_tokens

    # Collect non-system messages and count from the end (most recent)
    non_system = messages[1:]
    kept_messages = []

    # Work backwards from most recent to preserve recent context
    for msg in reversed(non_system):
        msg_tokens = _estimate_message_tokens(msg)
        if budget_remaining >= msg_tokens:
            kept_messages.insert(0, msg)
            budget_remaining -= msg_tokens

    messages_removed = len(non_system) - len(kept_messages)
    tokens_before = total_tokens
    tokens_after = system_tokens + sum(_estimate_message_tokens(m) for m in kept_messages)

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
        config_path = self.repo_path / ".codelicious" / "config.json"

        self.config = {"allowlisted_commands": ["pytest", "npm", "ruff", "black"]}
        if config_path.exists():
            try:
                self.config = json.loads(config_path.read_text())
            except json.JSONDecodeError:
                pass

        # Initialize Sandboxed Tooling Hub
        self.tool_registry = ToolRegistry(
            repo_path=self.repo_path,
            config=self.config,
            cache_manager=self.cache_manager,
        )

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
        # Truncate message history to prevent OOM and API rejection from large payloads
        self.messages = truncate_history(self.messages, MAX_HISTORY_TOKENS)

        logger.info("Pinging HuggingFace LLM inference endpoint...")
        # Use coder model — it handles both planning and code writing via tool calls
        response = self.llm.chat_completion(self.messages, tools=self.tool_registry.generate_schema(), role="coder")

        message_obj = response["choices"][0]["message"]
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
                args = json.loads(tool_call["function"]["arguments"])
                name = tool_call["function"]["name"]

                # Execute mapped function in python
                tool_result = self.tool_registry.dispatch(name, args)

                # Append the raw return payload to context
                self.messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_call["id"],
                        "name": name,
                        "content": json.dumps(tool_result),
                    }
                )
            except Exception as e:
                logger.error(f"Failed to process tool call {tool_call}: {e}")
                self.messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_call["id"],
                        "name": tool_call["function"]["name"],
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

        for iteration in range(max_iterations):
            logger.info(f"--- Iteration {iteration + 1}/{max_iterations} ---")

            completed = self._execute_agentic_iteration()

            if completed:
                # Ensure final changes are committed deterministically
                self.git_manager.commit_verified_changes(commit_message="Auto-Implementation: All specs complete.")
                break

        if not completed:
            logger.error("Build cycle exhausted maximum iteration patience threshold.")
            return False

        return True
