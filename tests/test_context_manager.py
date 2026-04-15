"""Tests for the context window manager module."""

from __future__ import annotations

from dataclasses import dataclass, field

import pytest

from codelicious.context_manager import (
    ContextBudget,
    build_fix_prompt,
    build_task_prompt,
    estimate_tokens,
)
from codelicious.errors import ContextBudgetError


@dataclass
class FakeTask:
    """Minimal task stand-in for testing."""

    title: str = "Test Task"
    description: str = "Do something."
    file_paths: list[str] = field(default_factory=lambda: ["main.py"])


# -- estimate_tokens -------------------------------------------------------


def test_estimate_tokens_empty() -> None:
    assert estimate_tokens("") == 0


def test_estimate_tokens_short() -> None:
    result = estimate_tokens("hello world")
    assert result > 0
    # Fixed ratio: chars / 3.5 * 1.1 (Finding 21 — unified formula)
    assert result == int(len("hello world") / 3.5 * 1.1)


def test_estimate_tokens_reasonable() -> None:
    text = "a" * 400
    tokens = estimate_tokens(text)
    # Fixed ratio: int(400 / 3.5 * 1.1) = 125 (Finding 21 — unified formula)
    assert 110 <= tokens <= 135


# -- ContextBudget ---------------------------------------------------------


def test_available_tokens_default() -> None:
    b = ContextBudget()
    assert b.available_tokens == 100_000 - 4096 - 0


def test_available_tokens_with_system() -> None:
    b = ContextBudget(max_tokens=50_000, response_reservation=2000, system_prompt_tokens=1000)
    assert b.available_tokens == 50_000 - 2000 - 1000


# -- build_task_prompt -----------------------------------------------------


def test_build_task_prompt_small_context() -> None:
    task = FakeTask()
    budget = ContextBudget(max_tokens=100_000)
    sys_prompt = "You are a coder."

    sys_out, user_out = build_task_prompt(
        task=task,
        system_prompt=sys_prompt,
        existing_file_contents={"main.py": "print('hi')"},
        completed_tasks=[],
        project_file_tree=["main.py", "README.md"],
        budget=budget,
    )

    assert sys_out == sys_prompt
    assert "Test Task" in user_out
    assert "Do something." in user_out
    assert "print('hi')" in user_out
    assert "main.py" in user_out


def test_build_task_prompt_includes_completed_tasks() -> None:
    task = FakeTask()
    completed = [FakeTask(title=f"Task {i}", description=f"Did thing {i}") for i in range(5)]
    budget = ContextBudget(max_tokens=100_000)

    _, user_out = build_task_prompt(
        task=task,
        system_prompt="sys",
        existing_file_contents={},
        completed_tasks=completed,
        project_file_tree=[],
        budget=budget,
    )

    # Recent 3 should have full descriptions
    assert "Did thing 4" in user_out
    assert "Did thing 3" in user_out
    assert "Did thing 2" in user_out
    # Older should appear as titles only
    assert "Task 0" in user_out
    assert "Task 1" in user_out


def test_task_description_truncated_at_exact_overhead_boundary() -> None:
    """When available_tokens equals exactly the header+footer overhead, description gets 0 tokens.

    This exercises the edge case where truncate_to_tokens(task_desc, 0) is called,
    producing an empty-string prefix plus the truncation marker.
    """
    task = FakeTask(title="Test Task", description="some content", file_paths=["main.py"])

    # Compute the exact overhead: estimate_tokens(task_header + task_footer)
    task_header = f"## Current Task: {task.title}\n\n"
    task_footer = f"\n\nFiles to modify: {', '.join(task.file_paths)}\n"
    overhead_tokens = estimate_tokens(task_header + task_footer)

    # Set the budget so that available_tokens == overhead_tokens exactly,
    # leaving 0 tokens for the description.
    budget = ContextBudget(max_tokens=overhead_tokens, response_reservation=0, system_prompt_tokens=0)
    assert budget.available_tokens == overhead_tokens

    _, user_out = build_task_prompt(
        task=task,
        system_prompt="",
        existing_file_contents={},
        completed_tasks=[],
        project_file_tree=[],
        budget=budget,
    )

    # The description must be cut to zero chars, leaving only the truncation marker
    assert "[truncated]" in user_out
    # Task title must still appear in the header
    assert "Test Task" in user_out
    # The original description content must be absent
    assert "some content" not in user_out


def test_build_task_prompt_truncates_on_tight_budget() -> None:
    task = FakeTask(description="x" * 100)
    budget = ContextBudget(max_tokens=200, response_reservation=50)

    sys_out, user_out = build_task_prompt(
        task=task,
        system_prompt="s",
        existing_file_contents={},
        completed_tasks=[FakeTask(title="Big", description="y" * 10000)],
        project_file_tree=["a.py"] * 100,
        budget=budget,
    )

    # Should still contain the task
    assert "Test Task" in user_out
    # Should fit within budget (approximately)
    total = estimate_tokens(sys_out) + estimate_tokens(user_out)
    assert total <= budget.max_tokens


# -- build_fix_prompt ------------------------------------------------------


def test_build_fix_prompt_includes_error() -> None:
    task = FakeTask()
    budget = ContextBudget(max_tokens=100_000)

    _, user_out = build_fix_prompt(
        task=task,
        error_output="NameError: name 'foo' is not defined",
        previous_code={"main.py": "print(foo)"},
        system_prompt="Fix it.",
        budget=budget,
    )

    assert "NameError" in user_out
    assert "print(foo)" in user_out
    assert "Fix Task" in user_out


def test_build_fix_prompt_truncates_long_error() -> None:
    task = FakeTask()
    budget = ContextBudget(max_tokens=100_000)
    long_error = "E" * 50000

    _, user_out = build_fix_prompt(
        task=task,
        error_output=long_error,
        previous_code={},
        system_prompt="Fix.",
        budget=budget,
    )

    # Error should be truncated (max 2000 tokens ~ 8000 chars)
    assert "[truncated]" in user_out


def test_build_fix_prompt_fits_budget() -> None:
    task = FakeTask()
    budget = ContextBudget(max_tokens=500, response_reservation=100)

    sys_out, user_out = build_fix_prompt(
        task=task,
        error_output="error " * 1000,
        previous_code={"a.py": "code " * 1000},
        system_prompt="Fix.",
        budget=budget,
    )

    total = estimate_tokens(sys_out) + estimate_tokens(user_out)
    # Allow a 5-token rounding tolerance: estimate_tokens is an approximation,
    # and summing estimates of individual parts vs. the assembled string can
    # differ slightly due to integer truncation at each step.
    assert total <= budget.max_tokens + 5


# -- Phase 7: Context Manager Precision ------------------------------------


def test_estimate_tokens_code_vs_prose() -> None:
    """estimate_tokens uses a unified chars/3.5 ratio regardless of content type.

    The code-vs-prose distinction was removed in Finding 21 because the
    difference (at most ~12%) is within the 10% safety margin applied to both.
    Both text types now produce the same token estimate for the same length.
    """
    prose = "the quick brown fox jumps over the lazy dog today again"
    code = "{()[];=><+/-}!@#$%^&*" * 10 + "abc" * 3
    prose_tokens = estimate_tokens(prose)
    assert prose_tokens >= 0
    # Same-length strings produce the same estimate (unified formula)
    same_len_prose = "a" * len(code)
    same_len_code_tokens = estimate_tokens(code)
    same_len_prose_tokens = estimate_tokens(same_len_prose)
    assert same_len_code_tokens == same_len_prose_tokens


def test_negative_budget_returns_zero() -> None:
    """available_tokens must not go negative when system prompt is huge."""
    budget = ContextBudget(
        max_tokens=100,
        response_reservation=50,
        system_prompt_tokens=200,  # exceeds max_tokens
    )
    assert budget.available_tokens == 0


def test_system_prompt_exceeds_window_raises() -> None:
    """build_task_prompt raises ContextBudgetError when available_tokens is 0."""
    task = FakeTask()
    # system prompt alone uses all tokens
    huge_system = "x" * 10_000
    budget = ContextBudget(max_tokens=10, response_reservation=0)
    # Force available_tokens to 0 by making system_prompt_tokens = max_tokens
    budget.system_prompt_tokens = budget.max_tokens

    with pytest.raises(ContextBudgetError, match="System prompt exceeds context window"):
        build_task_prompt(
            task=task,
            system_prompt=huge_system,
            existing_file_contents={},
            completed_tasks=[],
            project_file_tree=[],
            budget=budget,
        )


def test_task_description_truncated_when_too_large() -> None:
    """A task description larger than the budget is truncated with a [truncated] marker."""
    task = FakeTask(description="D" * 50_000)
    budget = ContextBudget(max_tokens=200, response_reservation=0)

    _, user_out = build_task_prompt(
        task=task,
        system_prompt="s",
        existing_file_contents={},
        completed_tasks=[],
        project_file_tree=[],
        budget=budget,
    )

    assert "[truncated]" in user_out
    # The task title must still be present
    assert "Test Task" in user_out


def test_extreme_truncation_logged(caplog: pytest.LogCaptureFixture) -> None:
    """A warning is logged when more than 50% of content is truncated."""
    import logging

    task = FakeTask(description="x" * 100)
    # Very tight budget so lots of content gets cut
    budget = ContextBudget(max_tokens=50, response_reservation=0)

    with caplog.at_level(logging.WARNING, logger="codelicious"):
        build_task_prompt(
            task=task,
            system_prompt="s",
            existing_file_contents={},
            completed_tasks=[FakeTask(title=f"T{i}", description="y" * 5000) for i in range(5)],
            project_file_tree=["file.py"] * 200,
            budget=budget,
        )

    # At least one warning about truncation should have been emitted
    warnings = [r for r in caplog.records if r.levelno == logging.WARNING]
    assert len(warnings) > 0


# -- Phase 13: Context Manager Boundary Conditions -------------------------


def test_budget_with_zero_completed_tasks_and_empty_file_tree() -> None:
    """build_task_prompt succeeds with no completed tasks and an empty file tree."""
    task = FakeTask()
    budget = ContextBudget(max_tokens=10_000)
    _sys, user = build_task_prompt(
        task=task,
        system_prompt="You are a coder.",
        existing_file_contents={},
        completed_tasks=[],
        project_file_tree=[],
        budget=budget,
    )
    assert len(user) > 0
    assert "## Current Task" in user
    assert task.title in user
    assert task.description in user


def test_estimate_tokens_single_character() -> None:
    """estimate_tokens of a single character returns 0 (rounds down to zero tokens)."""
    result = estimate_tokens("a")
    assert result == 0


# ---------------------------------------------------------------------------
# spec-22 Phase 7: File content respects token budget
# ---------------------------------------------------------------------------


def test_build_task_prompt_truncates_large_file_content() -> None:
    """When existing file contents would exceed the budget, they are truncated."""
    task = FakeTask(title="Build feature", description="Implement the feature")
    # Very tight budget — only enough for the task itself
    budget = ContextBudget(max_tokens=200, response_reservation=0)
    large_content = "x" * 10_000  # Way more than 100 tokens

    _, user_prompt = build_task_prompt(
        task=task,
        existing_file_contents={"src/big.py": large_content},
        completed_tasks=[],
        project_file_tree=[],
        system_prompt="system",
        budget=budget,
    )
    # The full 10k chars must NOT appear in the prompt
    assert large_content not in user_prompt
    # But the file path should still be referenced
    assert "big.py" in user_prompt
