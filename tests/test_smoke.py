"""End-to-end smoke tests for the proxilion-build pipeline."""

from __future__ import annotations

import json
import pathlib
import py_compile
import subprocess
import sys
import tempfile
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from proxilion_build.loop_controller import LoopConfig, run_loop
from proxilion_build.parser import parse_spec

# -- Canned LLM responses --

_CANNED_PLAN: list[dict[str, Any]] = [
    {
        "id": "task_001",
        "title": "Create calculator module",
        "description": "Create calculator.py with add, subtract, multiply, divide functions.",
        "file_paths": ["calculator.py"],
        "depends_on": [],
        "validation": "File exists and all functions are defined",
        "status": "pending",
    },
    {
        "id": "task_002",
        "title": "Create calculator tests",
        "description": "Create test_calculator.py with pytest tests for all calculator functions.",
        "file_paths": ["test_calculator.py"],
        "depends_on": ["task_001"],
        "validation": "Tests pass when run with pytest",
        "status": "pending",
    },
]

_CANNED_CALCULATOR_PY = '''\
"""Calculator module with basic arithmetic operations."""


def add(a: float, b: float) -> float:
    """Return the sum of a and b."""
    return a + b


def subtract(a: float, b: float) -> float:
    """Return the difference of a and b."""
    return a - b


def multiply(a: float, b: float) -> float:
    """Return the product of a and b."""
    return a * b


def divide(a: float, b: float) -> float:
    """Return the quotient of a and b.

    Raises:
        ValueError: If b is zero.
    """
    if b == 0:
        raise ValueError("Cannot divide by zero")
    return a / b
'''

_CANNED_TEST_CALCULATOR_PY = '''\
"""Pytest tests for the calculator module."""

import pytest

from calculator import add, subtract, multiply, divide


class TestAdd:
    def test_add_positive_numbers(self):
        assert add(2, 3) == 5

    def test_add_negative_numbers(self):
        assert add(-1, -1) == -2

    def test_add_mixed_numbers(self):
        assert add(-1, 1) == 0


class TestSubtract:
    def test_subtract_positive_numbers(self):
        assert subtract(5, 3) == 2

    def test_subtract_negative_numbers(self):
        assert subtract(-1, -1) == 0

    def test_subtract_mixed_numbers(self):
        assert subtract(1, -1) == 2


class TestMultiply:
    def test_multiply_positive_numbers(self):
        assert multiply(2, 3) == 6

    def test_multiply_by_zero(self):
        assert multiply(5, 0) == 0

    def test_multiply_negative_numbers(self):
        assert multiply(-2, -3) == 6


class TestDivide:
    def test_divide_positive_numbers(self):
        assert divide(6, 2) == 3

    def test_divide_negative_numbers(self):
        assert divide(-6, -2) == 3

    def test_divide_by_zero_raises_value_error(self):
        with pytest.raises(ValueError, match="Cannot divide by zero"):
            divide(1, 0)
'''


def _make_code_response(files: dict[str, str]) -> str:
    """Build a strict-format LLM response from path->content pairs."""
    parts: list[str] = []
    for path, content in files.items():
        parts.append(f"--- FILE: {path} ---\n{content}\n--- END FILE ---")
    return "\n".join(parts)


class TestEndToEndSmoke:
    """End-to-end smoke tests using canned LLM responses."""

    def test_full_pipeline_with_canned_responses(self) -> None:
        """Test the full pipeline: parse spec, mock LLM, run loop, verify output."""
        # Use the fixture spec file
        spec_path = pathlib.Path(__file__).parent / "fixtures" / "smoke_spec.md"

        # Verify we can parse the spec
        sections = parse_spec(spec_path)
        assert len(sections) > 0, "Spec should have sections"

        with tempfile.TemporaryDirectory() as tmp_dir:
            project_dir = pathlib.Path(tmp_dir)

            # Create a mock LLM that returns canned responses
            call_count = 0

            def mock_llm(system_prompt: str, user_prompt: str) -> str:
                nonlocal call_count
                call_count += 1

                # First call: intent classifier
                if call_count == 1:
                    return "ALLOW"

                # Second call: planning
                if call_count == 2:
                    return json.dumps(_CANNED_PLAN)

                # Third call: execute task_001 (calculator.py)
                if call_count == 3:
                    return _make_code_response({"calculator.py": _CANNED_CALCULATOR_PY})

                # Fourth call: execute task_002 (test_calculator.py)
                if call_count == 4:
                    return _make_code_response({"test_calculator.py": _CANNED_TEST_CALCULATOR_PY})

                # Any additional calls (fixes, etc.)
                return _make_code_response({})

            # Mock verify to always pass
            with patch("proxilion_build.loop_controller.verify") as mock_verify:
                mock_verify.return_value = MagicMock(all_passed=True)

                config = LoopConfig(max_patience=3)
                state = run_loop(spec_path, project_dir, mock_llm, config)

            # Assert both tasks completed
            assert "task_001" in state.completed, "task_001 should be completed"
            assert "task_002" in state.completed, "task_002 should be completed"
            assert len(state.failed) == 0, "No tasks should have failed"

            # Assert both files exist
            calculator_path = project_dir / "calculator.py"
            test_calculator_path = project_dir / "test_calculator.py"

            assert calculator_path.is_file(), "calculator.py should exist"
            assert test_calculator_path.is_file(), "test_calculator.py should exist"

            # Assert calculator.py compiles cleanly
            try:
                py_compile.compile(str(calculator_path), doraise=True)
            except py_compile.PyCompileError as e:
                pytest.fail(f"calculator.py has syntax errors: {e}")

            # Assert test_calculator.py compiles cleanly
            try:
                py_compile.compile(str(test_calculator_path), doraise=True)
            except py_compile.PyCompileError as e:
                pytest.fail(f"test_calculator.py has syntax errors: {e}")

            # Assert tests pass when run with pytest
            result = subprocess.run(
                [sys.executable, "-m", "pytest", str(test_calculator_path), "-v"],
                cwd=str(project_dir),
                capture_output=True,
                text=True,
            )
            assert result.returncode == 0, (
                f"pytest should pass.\nstdout: {result.stdout}\nstderr: {result.stderr}"
            )
