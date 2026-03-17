"""Shared pytest fixtures for proxilion-build tests (spec-v6 Phase 3)."""

from __future__ import annotations

import pathlib

import pytest


@pytest.fixture()
def sample_spec_path(tmp_path: pathlib.Path) -> pathlib.Path:
    """Yield a temporary markdown spec file with a minimal valid structure."""
    spec = tmp_path / "spec.md"
    spec.write_text(
        "# Test Spec\n\n## Phase 1\n\nImplement feature A.\n\n## Phase 2\n\nAdd tests for feature A.\n",
        encoding="utf-8",
    )
    return spec


@pytest.fixture()
def canned_plan() -> list[dict]:
    """Return a list of Task-compatible dicts for plan/executor tests."""
    return [
        {
            "id": "task-1",
            "title": "Implement feature A",
            "description": "Write the main module.",
            "file_paths": ["src/main.py"],
            "depends_on": [],
            "validation": "python3 -m pytest tests/",
            "status": "pending",
        },
        {
            "id": "task-2",
            "title": "Add tests for feature A",
            "description": "Write unit tests for the main module.",
            "file_paths": ["tests/test_main.py"],
            "depends_on": ["task-1"],
            "validation": "python3 -m pytest tests/",
            "status": "pending",
        },
    ]


@pytest.fixture()
def canned_code_response() -> str:
    """Return a FILE/END FILE formatted LLM response for executor tests."""
    return 'FILE: src/main.py\ndef greet(name: str) -> str:\n    return f"Hello, {name}!"\nEND FILE: src/main.py\n'


@pytest.fixture()
def tmp_project_dir(tmp_path: pathlib.Path) -> pathlib.Path:
    """Create a minimal project directory with .proxilion-build/ and pyproject.toml."""
    state_dir = tmp_path / ".proxilion-build"
    state_dir.mkdir()
    (state_dir / "STATE.md").write_text(
        "# proxilion-build State\n\n## Tech Stack\nPython 3.10\n\n## Test Command\npython3 -m pytest tests/\n",
        encoding="utf-8",
    )
    (tmp_path / "pyproject.toml").write_text(
        "[project]\nname = 'test-project'\nversion = '0.1.0'\n\n[tool.ruff]\nline-length = 99\n",
        encoding="utf-8",
    )
    (tmp_path / "tests").mkdir()
    return tmp_path
