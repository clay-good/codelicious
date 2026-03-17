"""Manages prompt size budgeting and context window limits for LLM calls."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Protocol

from codelicious.errors import ContextBudgetError

__all__ = [
    "ContextBudget",
    "TaskLike",
    "build_fix_prompt",
    "build_task_prompt",
    "estimate_tokens",
    "truncate_to_tokens",
]

logger = logging.getLogger("codelicious.context_manager")


class TaskLike(Protocol):
    """Minimal interface expected from a Task object."""

    title: str
    description: str
    file_paths: list[str]


def estimate_tokens(text: str) -> int:
    """Estimate the number of tokens in a text string.

    Uses chars / 3.5 for code (> 30% non-alphanumeric) and chars / 4 for
    prose, both with a 10% safety margin. Code has shorter tokens on average
    due to punctuation, so overestimating is safer than underestimating.
    """
    if not text:
        return 0
    non_alnum = sum(1 for ch in text if not ch.isalnum() and not ch.isspace())
    ratio = non_alnum / len(text)
    if ratio > 0.30:
        tokens = int(len(text) / 3.5 * 1.1)
    else:
        tokens = int(len(text) / 4 * 1.1)
    if len(text) > 1000:
        logger.debug("Token estimate: %d chars -> %d tokens", len(text), tokens)
    return tokens


@dataclass
class ContextBudget:
    """Tracks token budget for LLM prompt construction."""

    max_tokens: int = 100_000
    response_reservation: int = 4096
    system_prompt_tokens: int = 0

    @property
    def available_tokens(self) -> int:
        """Return the number of tokens available for user prompt content.

        Returns 0 instead of a negative value if the system prompt and
        response reservation together exceed the context window.
        """
        raw = self.max_tokens - self.response_reservation - self.system_prompt_tokens
        return max(0, raw)


def _warn_if_extreme_truncation(tokens_included: int, total_content_tokens: int, context: str) -> None:
    """Log a warning if more than 50% of available content was truncated."""
    logger.debug(
        "Truncation check (%s): included=%d tokens, total_content=%d tokens, truncated=%.0f%%",
        context,
        tokens_included,
        total_content_tokens,
        (1 - tokens_included / total_content_tokens) * 100 if total_content_tokens > 0 else 0,
    )
    if total_content_tokens > 0 and tokens_included < total_content_tokens * 0.5:
        logger.warning(
            "%s: more than 50%% of content was truncated (used %d tokens, total content %d tokens)",
            context,
            tokens_included,
            total_content_tokens,
        )


def truncate_to_tokens(text: str, max_tokens: int) -> str:
    """Truncate text to approximately max_tokens.

    Cuts at the character boundary (max_tokens * 4) and appends
    a truncation marker if text was cut.
    """
    max_chars = max_tokens * 4
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + "\n[truncated]"


def build_task_prompt(
    task: Any,
    system_prompt: str,
    existing_file_contents: dict[str, str],
    completed_tasks: list[Any],
    project_file_tree: list[str],
    budget: ContextBudget,
) -> tuple[str, str]:
    """Build a (system_prompt, user_prompt) pair that fits within budget.

    Priority order:
    1. Current task description (always full).
    2. Existing file contents for files being modified.
    3. Most recent 3 completed task summaries (full description).
    4. Older completed task summaries (title only).
    5. Project file tree listing.
    """
    logger.debug(
        "Building task prompt: task=%s, budget=%d tokens",
        task.title,
        budget.available_tokens if hasattr(budget, "available_tokens") else "N/A",
    )
    budget.system_prompt_tokens = estimate_tokens(system_prompt)
    logger.debug("System prompt: %d tokens", budget.system_prompt_tokens)

    if budget.available_tokens == 0:
        raise ContextBudgetError("System prompt exceeds context window")

    parts: list[str] = []
    tokens_used = 0
    total_content_before_build = 0  # used for extreme-truncation warning

    # 1. Current task (always included; truncate description if too large)
    task_header = f"## Current Task: {task.title}\n\n"
    file_paths = task.file_paths if task.file_paths else []
    task_footer = f"\n\nFiles to modify: {', '.join(file_paths)}\n"
    task_desc = task.description
    # Estimate the full section
    full_task_section = task_header + task_desc + task_footer
    full_task_tokens = estimate_tokens(full_task_section)
    if full_task_tokens > budget.available_tokens:
        # Reserve space for header + footer; truncate description
        overhead_tokens = estimate_tokens(task_header + task_footer)
        remaining_for_desc = max(0, budget.available_tokens - overhead_tokens)
        task_desc = truncate_to_tokens(task_desc, remaining_for_desc)
        logger.warning(
            "Task description truncated to fit context window (%d tokens available)",
            budget.available_tokens,
        )
    task_section = task_header + task_desc + task_footer
    parts.append(task_section)
    tokens_used += estimate_tokens(task_section)
    total_content_before_build += estimate_tokens(task_header + task.description + task_footer)
    logger.debug("Priority 1: %d tokens used", tokens_used)

    # 2. Existing file contents (always included)
    for path, content in existing_file_contents.items():
        file_section = f"### Current contents of {path}:\n```\n{content}\n```\n"
        parts.append(file_section)
        tokens_used += estimate_tokens(file_section)
        total_content_before_build += estimate_tokens(file_section)
    logger.debug("Existing files included: %d", len(existing_file_contents))
    logger.debug("Priority 2: %d tokens used", tokens_used)

    # 3. Recent completed tasks (last 3, full description)
    recent = completed_tasks[-3:] if len(completed_tasks) > 3 else completed_tasks
    older = completed_tasks[:-3] if len(completed_tasks) > 3 else []

    for t in reversed(recent):
        summary = f"### Completed: {t.title}\n{t.description}\n"
        summary_tokens = estimate_tokens(summary)
        total_content_before_build += summary_tokens
        if tokens_used + summary_tokens > budget.available_tokens:
            remaining = budget.available_tokens - tokens_used
            truncated = truncate_to_tokens(summary, remaining)
            parts.append(truncated)
            tokens_used = budget.available_tokens
            break
        parts.append(summary)
        tokens_used += summary_tokens
    logger.debug("Priority 3: %d tokens used", tokens_used)

    # 4. Older completed tasks (title only)
    if tokens_used < budget.available_tokens and older:
        for t in reversed(older):
            line = f"- Completed: {t.title}\n"
            line_tokens = estimate_tokens(line)
            total_content_before_build += line_tokens
            if tokens_used + line_tokens > budget.available_tokens:
                break
            parts.append(line)
            tokens_used += line_tokens
        logger.debug("Priority 4: %d tokens used", tokens_used)

    # 5. Project file tree
    if tokens_used < budget.available_tokens and project_file_tree:
        tree_section = "### Project files:\n" + "\n".join(project_file_tree) + "\n"
        tree_tokens = estimate_tokens(tree_section)
        total_content_before_build += tree_tokens
        if tokens_used + tree_tokens > budget.available_tokens:
            remaining = budget.available_tokens - tokens_used
            tree_section = truncate_to_tokens(tree_section, remaining)
        parts.append(tree_section)
        logger.debug("Priority 5: %d tokens used", tokens_used)

    user_prompt = "\n".join(parts)
    _warn_if_extreme_truncation(tokens_used, total_content_before_build, "build_task_prompt")
    logger.info("Task prompt built: %d tokens used", tokens_used)
    return system_prompt, user_prompt


def build_fix_prompt(
    task: Any,
    error_output: str,
    previous_code: dict[str, str],
    system_prompt: str,
    budget: ContextBudget,
) -> tuple[str, str]:
    """Build a (system_prompt, user_prompt) for fix/retry attempts.

    Priority order:
    1. Task description.
    2. Error output (truncated to last 2000 tokens if too long).
    3. Previous code that failed.
    """
    logger.debug(
        "Building fix prompt: task=%s, error_size=%d chars",
        task.title,
        len(error_output),
    )
    budget.system_prompt_tokens = estimate_tokens(system_prompt)

    parts: list[str] = []
    tokens_used = 0
    total_content_before_build = 0

    # 1. Task description (always full)
    task_section = f"## Fix Task: {task.title}\n\n{task.description}\n\nFiles to modify: {', '.join(task.file_paths)}\n"
    parts.append(task_section)
    task_tokens = estimate_tokens(task_section)
    tokens_used += task_tokens
    total_content_before_build += task_tokens

    # 2. Error output (truncated to last 2000 tokens if too long)
    error_section_header = "### Error output:\n```\n"
    error_section_footer = "\n```\n"
    max_error_tokens = 2000
    truncated_error = truncate_to_tokens(error_output, max_error_tokens)
    error_section = error_section_header + truncated_error + error_section_footer
    error_tokens = estimate_tokens(error_section)
    total_content_before_build += error_tokens

    if tokens_used + error_tokens <= budget.available_tokens:
        parts.append(error_section)
        tokens_used += error_tokens
    else:
        remaining = budget.available_tokens - tokens_used
        error_section = truncate_to_tokens(error_section, remaining)
        parts.append(error_section)
        tokens_used = budget.available_tokens

    # 3. Previous code
    if tokens_used < budget.available_tokens:
        for path, code in previous_code.items():
            code_section = f"### Previous code ({path}):\n```\n{code}\n```\n"
            code_tokens = estimate_tokens(code_section)
            total_content_before_build += code_tokens
            if tokens_used + code_tokens > budget.available_tokens:
                remaining = budget.available_tokens - tokens_used
                code_section = truncate_to_tokens(code_section, remaining)
                parts.append(code_section)
                tokens_used = budget.available_tokens
                break
            parts.append(code_section)
            tokens_used += code_tokens

    user_prompt = "\n".join(parts)
    _warn_if_extreme_truncation(tokens_used, total_content_before_build, "build_fix_prompt")
    logger.info("Fix prompt built: %d tokens used", tokens_used)
    return system_prompt, user_prompt
