"""Tests for the context window manager module."""

from __future__ import annotations

from dataclasses import dataclass, field

import pytest

from codelicious.context_manager import (
    ContextBudget,
    build_fix_prompt,
    build_task_prompt,
    estimate_tokens,
    truncate_to_tokens,
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
    assert result == int(len("hello world") / 4 * 1.1)


def test_estimate_tokens_reasonable() -> None:
    text = "a" * 400
    tokens = estimate_tokens(text)
    # Should be roughly 100 tokens * 1.1 = 110
    assert 100 <= tokens <= 120


# -- ContextBudget ---------------------------------------------------------


def test_available_tokens_default() -> None:
    b = ContextBudget()
    assert b.available_tokens == 100_000 - 4096 - 0


def test_available_tokens_with_system() -> None:
    b = ContextBudget(max_tokens=50_000, response_reservation=2000, system_prompt_tokens=1000)
    assert b.available_tokens == 50_000 - 2000 - 1000


# -- truncate_to_tokens ----------------------------------------------------


def test_truncate_under_limit() -> None:
    text = "short text"
    assert truncate_to_tokens(text, 1000) == text


def test_truncate_over_limit() -> None:
    text = "x" * 1000
    result = truncate_to_tokens(text, 10)
    # max_chars = 10 * 4 = 40
    assert len(result) < len(text)
    assert result.endswith("[truncated]")


def test_truncate_exact_limit() -> None:
    text = "a" * 40  # 10 tokens * 4 chars
    result = truncate_to_tokens(text, 10)
    assert result == text  # exactly at limit, no truncation


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
    assert total <= budget.max_tokens


# -- Phase 7: Context Manager Precision ------------------------------------


def test_estimate_tokens_code_vs_prose() -> None:
    """Code (high punctuation ratio) should estimate more tokens than prose."""
    # Pure alphanumeric prose: ratio = 0 → prose path
    prose = "the quick brown fox jumps over the lazy dog today again"
    # Code-like text: lots of {}, (), =, ., ; etc. → ratio > 30%
    code = "{()[];=><+/-}!@#$%^&*" * 10 + "abc" * 3
    prose_tokens = estimate_tokens(prose)
    # Ensure prose_tokens is used in the assertion
    assert prose_tokens >= 0
    # Code uses chars/3.5 divisor, prose uses chars/4; code token count should be higher
    # per character — verify code estimate > prose estimate for same length
    same_len_prose = "a" * len(code)
    same_len_code_tokens = estimate_tokens(code)
    same_len_prose_tokens = estimate_tokens(same_len_prose)
    assert same_len_code_tokens > same_len_prose_tokens


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


def test_budget_with_zero_completed_tasks() -> None:
    """build_task_prompt succeeds when there are no completed tasks."""
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
    assert isinstance(user, str)
    assert len(user) > 0


def test_budget_with_empty_file_tree() -> None:
    """build_task_prompt with an empty project_file_tree list succeeds."""
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
    assert isinstance(user, str)


def test_estimate_tokens_single_character() -> None:
    """estimate_tokens of a single character returns a non-negative integer."""
    result = estimate_tokens("a")
    assert isinstance(result, int)
    assert result >= 0
