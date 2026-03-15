"""Tests for the prompts module."""

from __future__ import annotations

import pathlib

from proxilion_build.prompts import (
    AGENT_BUILD,
    AGENT_REFLECT,
    PHASE_0_INIT,
    PHASE_0_TOOLS,
    PHASE_1_BUILD,
    PHASE_1_BUILD_STALL_INJECTION,
    PHASE_2_REFLECT,
    check_build_complete,
    clear_build_complete,
    extract_context,
    render,
)

# -- prompt constants are non-empty ------------------------------------------


def test_phase_0_init_non_empty() -> None:
    assert len(PHASE_0_INIT) > 100


def test_phase_1_build_non_empty() -> None:
    assert len(PHASE_1_BUILD) > 100


def test_phase_2_reflect_non_empty() -> None:
    assert len(PHASE_2_REFLECT) > 100


# -- PHASE_0_TOOLS contents --------------------------------------------------


def test_phase_0_tools_contains_read() -> None:
    assert "Read" in PHASE_0_TOOLS


def test_phase_0_tools_contains_write() -> None:
    assert "Write" in PHASE_0_TOOLS


def test_phase_0_tools_contains_glob() -> None:
    assert "Glob" in PHASE_0_TOOLS


def test_phase_0_tools_contains_grep() -> None:
    assert "Grep" in PHASE_0_TOOLS


def test_phase_0_tools_is_list_of_strings() -> None:
    assert isinstance(PHASE_0_TOOLS, list)
    assert all(isinstance(t, str) for t in PHASE_0_TOOLS)


def test_phase_0_tools_no_edit() -> None:
    """Phase 0 is read-only exploration; Edit should not be in the tool list."""
    assert "Edit" not in PHASE_0_TOOLS


# -- render() ----------------------------------------------------------------


def test_render_no_kwargs_returns_unchanged() -> None:
    template = "Hello {{name}}"
    assert render(template) == template


def test_render_substitutes_variables() -> None:
    template = "Hello {{name}}, welcome to {{place}}"
    result = render(template, name="Alice", place="Wonderland")
    assert result == "Hello Alice, welcome to Wonderland"


def test_render_leaves_unmatched_placeholders() -> None:
    template = "Hello {{name}}, {{unknown}}"
    result = render(template, name="Bob")
    assert result == "Hello Bob, {{unknown}}"


def test_render_empty_template() -> None:
    assert render("") == ""


# -- prompt content checks ---------------------------------------------------


def test_phase_0_mentions_state_md() -> None:
    assert "STATE.md" in PHASE_0_INIT


def test_phase_1_mentions_brownfield() -> None:
    assert "brownfield" in PHASE_1_BUILD.lower()


def test_phase_2_mentions_no_modify() -> None:
    assert "MUST NOT modify" in PHASE_2_REFLECT


def test_phase_0_is_read_only() -> None:
    assert "read files" in PHASE_0_INIT.lower() or "Read" in PHASE_0_INIT


def test_phase_1_mentions_implementation() -> None:
    assert "implement" in PHASE_1_BUILD.lower() or "build" in PHASE_1_BUILD.lower()


# -- template variable placeholders ------------------------------------------


def test_phase_0_has_project_name_placeholder() -> None:
    assert "{{project_name}}" in PHASE_0_INIT


def test_phase_1_has_iteration_placeholder() -> None:
    assert "{{iteration}}" in PHASE_1_BUILD


def test_phase_1_has_pending_count_placeholder() -> None:
    assert "{{pending_count}}" in PHASE_1_BUILD


def test_phase_2_has_pending_count_placeholder() -> None:
    assert "{{pending_count}}" in PHASE_2_REFLECT


def test_stall_injection_has_stall_count_placeholder() -> None:
    assert "{{stall_count}}" in PHASE_1_BUILD_STALL_INJECTION


def test_stall_injection_has_pending_count_placeholder() -> None:
    assert "{{pending_count}}" in PHASE_1_BUILD_STALL_INJECTION


# -- extract_context ---------------------------------------------------------


def test_extract_context_missing_state_md(tmp_path: pathlib.Path) -> None:
    ctx = extract_context(tmp_path)
    assert ctx["project_name"] == tmp_path.name
    assert ctx["pending_count"] == "0"
    assert ctx["completed_count"] == "0"
    assert ctx["tech_stack"] == ""
    assert ctx["test_command"] == ""


def test_extract_context_counts_tasks(tmp_path: pathlib.Path) -> None:
    state_dir = tmp_path / ".proxilion-build"
    state_dir.mkdir()
    state_md = state_dir / "STATE.md"
    state_md.write_text(
        "## Pending Tasks\n"
        "### [ ] Task: Build auth\n"
        "### [ ] Task: Build API\n"
        "### [ ] Task: Write tests\n"
        "\n"
        "## Completed Tasks\n"
        "### [x] Task: Setup project\n"
        "### [x] Task: Add config\n",
        encoding="utf-8",
    )
    ctx = extract_context(tmp_path, iteration=2, max_iterations=5)
    assert ctx["pending_count"] == "3"
    assert ctx["completed_count"] == "2"
    assert "Setup project" in ctx["completed_tasks"]
    assert "Add config" in ctx["completed_tasks"]
    assert ctx["iteration"] == "2"
    assert ctx["max_iterations"] == "5"


def test_extract_context_tech_stack(tmp_path: pathlib.Path) -> None:
    state_dir = tmp_path / ".proxilion-build"
    state_dir.mkdir()
    state_md = state_dir / "STATE.md"
    state_md.write_text(
        "## Tech Stack\n"
        "Python 3.12, FastAPI 0.104, pytest 8.0\n"
        "\n"
        "## How to Test\n"
        "python3 -m pytest tests/ -q\n"
        "\n"
        "## Pending Tasks\n",
        encoding="utf-8",
    )
    ctx = extract_context(tmp_path)
    assert "Python 3.12" in ctx["tech_stack"]
    assert ctx["test_command"] == "python3 -m pytest tests/ -q"


def test_extract_context_truncates_tech_stack(tmp_path: pathlib.Path) -> None:
    state_dir = tmp_path / ".proxilion-build"
    state_dir.mkdir()
    state_md = state_dir / "STATE.md"
    long_tech = "A" * 300
    state_md.write_text(
        f"## Tech Stack\n{long_tech}\n\n## Pending Tasks\n",
        encoding="utf-8",
    )
    ctx = extract_context(tmp_path)
    assert len(ctx["tech_stack"]) <= 204  # 200 + "..."


def test_extract_context_passes_through_failed_tasks(tmp_path: pathlib.Path) -> None:
    ctx = extract_context(tmp_path, failed_tasks="Task X failed")
    assert ctx["failed_tasks"] == "Task X failed"


def test_extract_context_passes_through_stall_count(tmp_path: pathlib.Path) -> None:
    ctx = extract_context(tmp_path, stall_count=3)
    assert ctx["stall_count"] == "3"


# -- render with full context ------------------------------------------------


def test_render_with_context_no_remaining_placeholders(tmp_path: pathlib.Path) -> None:
    state_dir = tmp_path / ".proxilion-build"
    state_dir.mkdir()
    state_md = state_dir / "STATE.md"
    state_md.write_text(
        "## Tech Stack\nPython 3.12\n\n"
        "## How to Test\npytest\n\n"
        "## Pending Tasks\n### [ ] Task: foo\n\n"
        "## Completed Tasks\n",
        encoding="utf-8",
    )
    ctx = extract_context(tmp_path, iteration=1, max_iterations=10)
    rendered = render(PHASE_1_BUILD, **ctx)
    assert "{{" not in rendered


def test_render_phase_0_with_project_name() -> None:
    rendered = render(PHASE_0_INIT, project_name="my-project")
    assert "my-project" in rendered
    assert "{{project_name}}" not in rendered


# -- spec-v3: AGENT_BUILD and AGENT_REFLECT ---------------------------------


def test_agent_build_non_empty() -> None:
    assert len(AGENT_BUILD) > 100


def test_agent_reflect_non_empty() -> None:
    assert len(AGENT_REFLECT) > 100


def test_agent_build_has_project_name_placeholder() -> None:
    assert "{{project_name}}" in AGENT_BUILD


def test_agent_reflect_has_project_name_placeholder() -> None:
    assert "{{project_name}}" in AGENT_REFLECT


def test_agent_build_contains_safety_rules() -> None:
    assert "NEVER" in AGENT_BUILD
    assert "main" in AGENT_BUILD
    assert "force-push" in AGENT_BUILD


def test_agent_build_mentions_spec() -> None:
    assert "spec" in AGENT_BUILD.lower()


def test_agent_reflect_prohibits_source_modification() -> None:
    assert "Do NOT modify" in AGENT_REFLECT


def test_agent_build_mentions_build_complete() -> None:
    assert "BUILD_COMPLETE" in AGENT_BUILD


def test_agent_reflect_mentions_build_complete() -> None:
    assert "BUILD_COMPLETE" in AGENT_REFLECT


def test_agent_build_mentions_build_complete_sentinel() -> None:
    assert "BUILD_COMPLETE" in AGENT_BUILD


def test_agent_reflect_mentions_state_md() -> None:
    assert "STATE.md" in AGENT_REFLECT


def test_render_agent_build_with_project_name() -> None:
    rendered = render(
        AGENT_BUILD,
        project_name="my-app",
        branch_name="proxilion-build/test",
        base_branch="main",
        spec_content="test spec",
    )
    assert "my-app" in rendered
    assert "{{project_name}}" not in rendered


def test_render_agent_reflect_with_project_name() -> None:
    rendered = render(AGENT_REFLECT, project_name="my-app")
    assert "my-app" in rendered
    assert "{{project_name}}" not in rendered


# -- spec-v3: check_build_complete / clear_build_complete --------------------


def test_check_build_complete_missing_file(tmp_path: pathlib.Path) -> None:
    assert check_build_complete(tmp_path) is False


def test_check_build_complete_done(tmp_path: pathlib.Path) -> None:
    sentinel_dir = tmp_path / ".proxilion-build"
    sentinel_dir.mkdir()
    (sentinel_dir / "BUILD_COMPLETE").write_text("DONE", encoding="utf-8")
    assert check_build_complete(tmp_path) is True


def test_check_build_complete_done_with_whitespace(tmp_path: pathlib.Path) -> None:
    sentinel_dir = tmp_path / ".proxilion-build"
    sentinel_dir.mkdir()
    (sentinel_dir / "BUILD_COMPLETE").write_text("  DONE\n", encoding="utf-8")
    assert check_build_complete(tmp_path) is True


def test_check_build_complete_not_done(tmp_path: pathlib.Path) -> None:
    sentinel_dir = tmp_path / ".proxilion-build"
    sentinel_dir.mkdir()
    (sentinel_dir / "BUILD_COMPLETE").write_text("IN PROGRESS", encoding="utf-8")
    assert check_build_complete(tmp_path) is False


def test_clear_build_complete_removes_file(tmp_path: pathlib.Path) -> None:
    sentinel_dir = tmp_path / ".proxilion-build"
    sentinel_dir.mkdir()
    sentinel = sentinel_dir / "BUILD_COMPLETE"
    sentinel.write_text("DONE", encoding="utf-8")
    clear_build_complete(tmp_path)
    assert not sentinel.exists()


def test_clear_build_complete_noop_when_missing(tmp_path: pathlib.Path) -> None:
    # Should not raise
    clear_build_complete(tmp_path)
