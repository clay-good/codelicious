"""Shared pytest fixtures for codelicious tests."""

from __future__ import annotations

import pathlib
from typing import Any

import pytest

# ---------------------------------------------------------------------------
# Base path for static fixture files
# ---------------------------------------------------------------------------

_FIXTURES_DIR = pathlib.Path(__file__).parent / "fixtures"


# ---------------------------------------------------------------------------
# Edge case fixtures (TF-1 through TF-4)
# ---------------------------------------------------------------------------

_EDGE_CASE_SPECS: list[tuple[str, str]] = [
    ("empty", ""),
    ("single_line", "# Minimal"),
    (
        "yaml_frontmatter",
        "---\nversion: 1.0\nstatus: Draft\n---\n\n# Spec with Frontmatter\n\n## Phase 1\n\nDo something.\n",
    ),
    (
        "code_blocks",
        "# Spec with Code\n\n```python\ndef hello():\n    return 'world'\n```\n\n## Phase 1\n\nImplement hello.\n",
    ),
    (
        "template_vars",
        "# Spec with Templates\n\nDeploy to {{environment}} using {{deploy_tool}}.\n\n## Phase 1\n\nSetup {{service_name}}.\n",
    ),
]


@pytest.fixture(params=[s[1] for s in _EDGE_CASE_SPECS], ids=[s[0] for s in _EDGE_CASE_SPECS])
def edge_case_spec_path(request: pytest.FixtureRequest, tmp_path: pathlib.Path) -> pathlib.Path:
    """Parameterized fixture yielding spec files with edge-case content (TF-1)."""
    spec = tmp_path / "edge_spec.md"
    spec.write_text(request.param, encoding="utf-8")
    return spec


_EDGE_CASE_PLANS: list[tuple[str, list[dict[str, Any]]]] = [
    ("zero_tasks", []),
    (
        "single_no_deps",
        [
            {
                "id": "task-solo",
                "title": "Solo task",
                "description": "A task with no dependencies.",
                "file_paths": ["src/solo.py"],
                "depends_on": [],
                "validation": "pytest",
                "status": "pending",
            }
        ],
    ),
    (
        "circular_deps",
        [
            {
                "id": "task-a",
                "title": "Task A",
                "description": "Depends on B.",
                "file_paths": ["src/a.py"],
                "depends_on": ["task-b"],
                "validation": "",
                "status": "pending",
            },
            {
                "id": "task-b",
                "title": "Task B",
                "description": "Depends on A.",
                "file_paths": ["src/b.py"],
                "depends_on": ["task-a"],
                "validation": "",
                "status": "pending",
            },
        ],
    ),
    (
        "empty_file_paths",
        [
            {
                "id": "task-empty",
                "title": "No files",
                "description": "Task with empty file_paths.",
                "file_paths": [],
                "depends_on": [],
                "validation": "",
                "status": "pending",
            }
        ],
    ),
    (
        "long_description",
        [
            {
                "id": "task-long",
                "title": "Verbose task",
                "description": "x" * 10_000,
                "file_paths": ["src/verbose.py"],
                "depends_on": [],
                "validation": "",
                "status": "pending",
            }
        ],
    ),
]


@pytest.fixture(params=[p[1] for p in _EDGE_CASE_PLANS], ids=[p[0] for p in _EDGE_CASE_PLANS])
def edge_case_plan(request: pytest.FixtureRequest) -> list[dict[str, Any]]:
    """Parameterized fixture yielding plans with edge-case structures (TF-2)."""
    return request.param


_EDGE_CASE_CODE_RESPONSES: list[tuple[str, str]] = [
    ("empty", ""),
    (
        "single_file",
        "FILE: src/hello.py\nprint('hello')\nEND FILE: src/hello.py\n",
    ),
    (
        "two_files",
        "FILE: src/a.py\nx = 1\nEND FILE: src/a.py\nFILE: src/b.py\ny = 2\nEND FILE: src/b.py\n",
    ),
    (
        "malformed_missing_end",
        "FILE: src/broken.py\nprint('no end marker')\n",
    ),
    (
        "null_bytes",
        "FILE: src/binary.py\ndata = b'\\x00\\x01\\x02'\nEND FILE: src/binary.py\n",
    ),
    (
        "unicode_filename",
        "FILE: src/r\u00e9sum\u00e9.py\n# Accented filename\nEND FILE: src/r\u00e9sum\u00e9.py\n",
    ),
]


@pytest.fixture(
    params=[r[1] for r in _EDGE_CASE_CODE_RESPONSES],
    ids=[r[0] for r in _EDGE_CASE_CODE_RESPONSES],
)
def edge_case_code_response(request: pytest.FixtureRequest) -> str:
    """Parameterized fixture yielding LLM code responses with edge cases (TF-3)."""
    return request.param


@pytest.fixture()
def unicode_filename_dir(tmp_path: pathlib.Path) -> pathlib.Path:
    """Create a temp directory with unicode-named files (TF-4)."""
    (tmp_path / "r\u00e9sum\u00e9.py").write_text("# accented\n", encoding="utf-8")
    (tmp_path / "datos.txt").write_text("# Spanish\n", encoding="utf-8")
    (tmp_path / "\u6d4b\u8bd5.py").write_text("# CJK\n", encoding="utf-8")
    return tmp_path


# ---------------------------------------------------------------------------
# Shared execution fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def temp_repo(tmp_path: pathlib.Path) -> pathlib.Path:
    """Create a minimal temporary repository with .codelicious/ directory."""
    (tmp_path / ".codelicious").mkdir()
    return tmp_path
