"""HuggingFace Inference API build engine.

This is the original codelicious engine, refactored into the engine interface.
Uses HuggingFace-hosted models (DeepSeek-V3 planner, Qwen3-235B coder) via
the OpenAI-compatible HTTP API.
"""

from __future__ import annotations

import json
import logging
import pathlib
import time

from codelicious.engines.base import BuildEngine, BuildResult

logger = logging.getLogger("codelicious.engines.huggingface")


class HuggingFaceEngine(BuildEngine):
    """Build engine using HuggingFace Inference API with tool dispatch."""

    @property
    def name(self) -> str:
        return "HuggingFace Inference"

    def run_build_cycle(
        self,
        repo_path: pathlib.Path,
        git_manager: object,
        cache_manager: object,
        spec_filter: str | None = None,
        **kwargs,
    ) -> BuildResult:
        """Run the HuggingFace tool-dispatch agentic loop.

        This is the original BuildLoop logic, refactored into the engine
        interface without changing behavior.
        """
        from codelicious.tools.registry import ToolRegistry
        from codelicious.llm_client import LLMClient

        start = time.monotonic()
        repo_path = pathlib.Path(repo_path).resolve()
        max_iterations = kwargs.get("max_iterations", 50)

        # Load config
        config_path = repo_path / ".codelicious" / "config.json"
        config = {"allowlisted_commands": ["pytest", "npm", "ruff", "black"]}
        if config_path.exists():
            try:
                config = json.loads(config_path.read_text())
            except json.JSONDecodeError:
                pass

        # Initialize components
        tool_registry = ToolRegistry(
            repo_path=repo_path,
            config=config,
            cache_manager=cache_manager,
        )
        llm = LLMClient()

        # System prompt
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
        messages = [{"role": "system", "content": system_prompt}]

        logger.info("LLM Planner: %s | Coder: %s", llm.planner_model, llm.coder_model)
        logger.info("LLM Endpoint: %s", llm.endpoint_url)
        logger.info("Initializing Continuous Agentic Loop.")

        completed = False

        for iteration in range(max_iterations):
            logger.info("--- Iteration %d/%d ---", iteration + 1, max_iterations)
            logger.info("Pinging HuggingFace LLM inference endpoint...")

            try:
                response = llm.chat_completion(
                    messages,
                    tools=tool_registry.generate_schema(),
                    role="coder",
                )
            except Exception as e:
                logger.error("LLM call failed: %s", e)
                # Simple retry: add error context and continue
                messages.append(
                    {
                        "role": "user",
                        "content": f"The previous LLM call failed with: {e}. Please continue your work.",
                    }
                )
                continue

            message_obj = response["choices"][0]["message"]
            messages.append(message_obj)

            # Handle tool calls
            tool_calls = llm.parse_tool_calls(response)

            if not tool_calls:
                content = llm.parse_content(response)
                if "ALL_SPECS_COMPLETE" in content:
                    logger.info("Agent signaled completion criteria met.")
                    completed = True
                    break
                else:
                    messages.append(
                        {
                            "role": "user",
                            "content": "Please continue exploring or implementing using your toolset until you can declare ALL_SPECS_COMPLETE.",
                        }
                    )
                    continue

            # Execute tool calls
            for tool_call in tool_calls:
                try:
                    args = json.loads(tool_call["function"]["arguments"])
                    name = tool_call["function"]["name"]
                    tool_result = tool_registry.dispatch(name, args)
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": tool_call["id"],
                            "name": name,
                            "content": json.dumps(tool_result),
                        }
                    )
                except Exception as e:
                    logger.error("Tool call failed: %s: %s", tool_call, e)
                    messages.append(
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

        if completed:
            try:
                git_manager.commit_verified_changes(
                    commit_message="Auto-Implementation: All specs complete."
                )
            except Exception as e:
                logger.error("Git commit failed: %s", e)

        elapsed = time.monotonic() - start
        return BuildResult(
            success=completed,
            message="All specs complete."
            if completed
            else "Exhausted iteration limit.",
            elapsed_s=elapsed,
        )
