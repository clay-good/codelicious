"""Shared pytest fixtures for codelicious tests."""

from __future__ import annotations

import json
import pathlib
from typing import Any

import pytest

# ---------------------------------------------------------------------------
# Base path for static fixture files
# ---------------------------------------------------------------------------

_FIXTURES_DIR = pathlib.Path(__file__).parent / "fixtures"


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
    """Create a minimal project directory with .codelicious/ and pyproject.toml."""
    state_dir = tmp_path / ".codelicious"
    state_dir.mkdir()
    (state_dir / "STATE.md").write_text(
        "# codelicious Build State\n\n## Tech Stack\nPython 3.10\n\n## Test Command\npython3 -m pytest tests/\n",
        encoding="utf-8",
    )
    (tmp_path / "pyproject.toml").write_text(
        "[project]\nname = 'test-project'\nversion = '0.1.0'\n\n[tool.ruff]\nline-length = 99\n",
        encoding="utf-8",
    )
    (tmp_path / "tests").mkdir()
    return tmp_path


# ---------------------------------------------------------------------------
# Edge case fixtures (spec-19 Phase 6: TF-1 through TF-4)
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
# spec-20 Phase 19: Sample Dummy Data and Edge Case Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def empty_spec_path() -> pathlib.Path:
    """Path to an empty (0-byte) spec file."""
    return _FIXTURES_DIR / "empty_spec.md"


@pytest.fixture()
def frontmatter_only_spec_path() -> pathlib.Path:
    """Path to a spec with only YAML frontmatter (no body)."""
    return _FIXTURES_DIR / "frontmatter_only_spec.md"


@pytest.fixture()
def circular_deps_plan() -> list[dict[str, Any]]:
    """A plan with circular task dependencies (A→B→A)."""
    data = json.loads((_FIXTURES_DIR / "circular_deps.json").read_text(encoding="utf-8"))
    return data["tasks"]


@pytest.fixture()
def malformed_llm_response() -> dict[str, Any]:
    """An LLM response with missing required keys."""
    return json.loads((_FIXTURES_DIR / "malformed_llm_response.json").read_text(encoding="utf-8"))


@pytest.fixture()
def no_code_blocks_response() -> str:
    """An LLM response containing no code blocks."""
    return (_FIXTURES_DIR / "no_code_blocks_response.txt").read_text(encoding="utf-8")


@pytest.fixture()
def unicode_filename_response() -> str:
    """An LLM response with unicode characters in filenames."""
    return (_FIXTURES_DIR / "unicode_filename_response.txt").read_text(encoding="utf-8")


@pytest.fixture()
def private_ip_endpoints() -> list[str]:
    """List of invalid endpoint URLs (HTTP, private IPs, file://)."""
    return json.loads((_FIXTURES_DIR / "private_ip_endpoints.json").read_text(encoding="utf-8"))


@pytest.fixture()
def sensitive_filenames() -> list[str]:
    """List of filenames that should trigger the sensitive file check."""
    return json.loads((_FIXTURES_DIR / "sensitive_filenames.json").read_text(encoding="utf-8"))


@pytest.fixture()
def nested_backticks_response() -> str:
    """An LLM response with nested/mixed backtick sequences."""
    return (_FIXTURES_DIR / "nested_backticks_response.txt").read_text(encoding="utf-8")


@pytest.fixture()
def deprecated_config() -> dict[str, Any]:
    """A config.json containing the deprecated allowlisted_commands key."""
    return json.loads((_FIXTURES_DIR / "deprecated_config.json").read_text(encoding="utf-8"))


@pytest.fixture()
def pathological_backticks() -> str:
    """Programmatically generated 2MB+ of backtick-heavy content for ReDoS testing."""
    return "```" * 10000 + "\n" + "x\n" * 1000 + "```" * 10000
