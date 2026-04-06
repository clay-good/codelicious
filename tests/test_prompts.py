"""Tests for prompt utilities: scan_remaining_tasks_for_spec, render, check_build_complete."""

from __future__ import annotations

import pathlib
import unittest.mock

import pytest

from codelicious.prompts import (
    AGENT_BUILD_SPEC,
    check_build_complete,
    clear_build_complete,
    extract_context,
    render,
    scan_remaining_tasks,
    scan_remaining_tasks_for_spec,
)


# ---------------------------------------------------------------------------
# scan_remaining_tasks_for_spec
# ---------------------------------------------------------------------------


class TestScanRemainingTasksForSpec:
    """Tests for per-spec completion tracking."""

    def test_counts_unchecked_items(self, tmp_path: pathlib.Path):
        spec = tmp_path / "spec.md"
        spec.write_text("- [ ] task 1\n- [ ] task 2\n- [x] done\n")
        assert scan_remaining_tasks_for_spec(spec) == 2

    def test_all_checked_returns_zero(self, tmp_path: pathlib.Path):
        spec = tmp_path / "spec.md"
        spec.write_text("- [x] done 1\n- [X] done 2\n")
        assert scan_remaining_tasks_for_spec(spec) == 0

    def test_prose_spec_no_checkboxes_returns_one(self, tmp_path: pathlib.Path):
        spec = tmp_path / "spec.md"
        spec.write_text("# My Spec\n\nBuild something great.\n")
        assert scan_remaining_tasks_for_spec(spec) == 1

    def test_missing_file_returns_zero(self, tmp_path: pathlib.Path):
        spec = tmp_path / "nonexistent.md"
        assert scan_remaining_tasks_for_spec(spec) == 0

    def test_empty_file_returns_one(self, tmp_path: pathlib.Path):
        """Empty file has no checkboxes, treated as prose spec."""
        spec = tmp_path / "spec.md"
        spec.write_text("")
        assert scan_remaining_tasks_for_spec(spec) == 1

    def test_mixed_checkboxes(self, tmp_path: pathlib.Path):
        spec = tmp_path / "spec.md"
        spec.write_text("# Phase 1\n- [x] setup\n- [ ] implement\n- [ ] test\n# Phase 2\n- [ ] deploy\n")
        assert scan_remaining_tasks_for_spec(spec) == 3

    def test_indented_checkboxes(self, tmp_path: pathlib.Path):
        spec = tmp_path / "spec.md"
        spec.write_text("  - [ ] indented task\n    - [ ] deeply indented\n")
        assert scan_remaining_tasks_for_spec(spec) == 2


# ---------------------------------------------------------------------------
# scan_remaining_tasks (global)
# ---------------------------------------------------------------------------


class TestScanRemainingTasks:
    """Tests for global spec scanning."""

    def test_counts_across_multiple_specs(self, tmp_path: pathlib.Path):
        (tmp_path / "spec.md").write_text("- [ ] a\n- [x] b\n")
        docs = tmp_path / "docs"
        docs.mkdir()
        (docs / "spec-v2.md").write_text("- [ ] c\n- [ ] d\n")
        assert scan_remaining_tasks(tmp_path) == 3

    @pytest.mark.parametrize(
        "filename",
        [
            "README.md",
            "CHANGELOG.md",
            "CONTRIBUTING.md",
            "CODE_OF_CONDUCT.md",
            "LICENSE.md",
            "CLAUDE.md",
            "MEMORY.md",
        ],
    )
    def test_excludes_spec_exclude_names(self, tmp_path: pathlib.Path, filename: str):
        (tmp_path / filename).write_text("- [ ] should be ignored\n")
        assert scan_remaining_tasks(tmp_path) == 0

    def test_returns_zero_when_all_complete(self, tmp_path: pathlib.Path):
        (tmp_path / "spec.md").write_text("- [x] done\n")
        assert scan_remaining_tasks(tmp_path) == 0


# ---------------------------------------------------------------------------
# render
# ---------------------------------------------------------------------------


class TestRender:
    """Tests for prompt template rendering."""

    def test_substitutes_variables(self):
        result = render("Hello {{name}}!", name="world")
        assert result == "Hello world!"

    def test_no_kwargs_returns_unchanged(self):
        template = "Hello {{name}}!"
        assert render(template) == template

    def test_multiple_variables(self):
        result = render(
            "{{a}} and {{b}}",
            a="first",
            b="second",
        )
        assert result == "first and second"

    def test_unused_kwargs_ignored(self):
        result = render("Hello {{name}}!", name="world", extra="ignored")
        assert result == "Hello world!"

    def test_spec_filter_substitution(self):
        """The critical fix: spec_filter is actually substituted into the prompt."""
        result = render(
            AGENT_BUILD_SPEC,
            project_name="myproject",
            spec_filter="/path/to/spec.md",
        )
        assert "/path/to/spec.md" in result
        assert "{{spec_filter}}" not in result
        assert "{{project_name}}" not in result

    def test_partial_kwargs_leaves_unreplaced_tokens_verbatim(self):
        """render() with only some kwargs replaces provided tokens and leaves others intact."""
        template = "Hello {{name}}, your task is {{task}}!"
        result = render(template, name="Alice")
        assert "Alice" in result
        assert "{{task}}" in result
        assert "{{name}}" not in result


# ---------------------------------------------------------------------------
# check_build_complete / clear_build_complete
# ---------------------------------------------------------------------------


class TestBuildComplete:
    """Tests for BUILD_COMPLETE sentinel file handling."""

    def test_missing_file_returns_false(self, tmp_path: pathlib.Path):
        assert check_build_complete(tmp_path) is False

    def test_done_uppercase(self, tmp_path: pathlib.Path):
        sentinel = tmp_path / ".codelicious" / "BUILD_COMPLETE"
        sentinel.parent.mkdir(parents=True)
        sentinel.write_text("DONE")
        assert check_build_complete(tmp_path) is True

    def test_done_lowercase(self, tmp_path: pathlib.Path):
        sentinel = tmp_path / ".codelicious" / "BUILD_COMPLETE"
        sentinel.parent.mkdir(parents=True)
        sentinel.write_text("done")
        assert check_build_complete(tmp_path) is True

    def test_done_with_trailing_whitespace(self, tmp_path: pathlib.Path):
        sentinel = tmp_path / ".codelicious" / "BUILD_COMPLETE"
        sentinel.parent.mkdir(parents=True)
        sentinel.write_text("DONE\n  ")
        assert check_build_complete(tmp_path) is True

    def test_invalid_content_returns_false(self, tmp_path: pathlib.Path):
        sentinel = tmp_path / ".codelicious" / "BUILD_COMPLETE"
        sentinel.parent.mkdir(parents=True)
        sentinel.write_text("IN_PROGRESS")
        assert check_build_complete(tmp_path) is False

    def test_clear_removes_file(self, tmp_path: pathlib.Path):
        sentinel = tmp_path / ".codelicious" / "BUILD_COMPLETE"
        sentinel.parent.mkdir(parents=True)
        sentinel.write_text("DONE")
        clear_build_complete(tmp_path)
        assert not sentinel.exists()

    def test_clear_noop_when_missing(self, tmp_path: pathlib.Path):
        # Should not raise
        clear_build_complete(tmp_path)

    def test_oserror_on_read_returns_false(self, tmp_path: pathlib.Path):
        """check_build_complete returns False when read_text raises PermissionError (OSError path)."""
        sentinel = tmp_path / ".codelicious" / "BUILD_COMPLETE"
        sentinel.parent.mkdir(parents=True)
        sentinel.write_text("DONE")
        with unittest.mock.patch.object(
            pathlib.Path,
            "read_text",
            side_effect=PermissionError("permission denied"),
        ):
            assert check_build_complete(tmp_path) is False


# ---------------------------------------------------------------------------
# Finding 81 — extract_context() with STATE.md present
# ---------------------------------------------------------------------------


class TestExtractContext:
    """Finding 81: extract_context() with a real .codelicious/STATE.md file was untested.

    These tests create a tmp_path with a .codelicious/STATE.md containing known
    content and assert the expected fields are present in the returned dict.
    """

    def test_returns_dict_with_expected_keys(self, tmp_path: pathlib.Path) -> None:
        """extract_context returns a dict with all expected template-variable keys."""
        state_dir = tmp_path / ".codelicious"
        state_dir.mkdir()
        (state_dir / "STATE.md").write_text("## Tech Stack\nPython 3.10\n", encoding="utf-8")

        ctx = extract_context(tmp_path)

        expected_keys = {
            "project_name",
            "iteration",
            "max_iterations",
            "pending_count",
            "completed_count",
            "completed_tasks",
            "tech_stack",
            "test_command",
            "failed_tasks",
            "stall_count",
        }
        assert expected_keys.issubset(ctx.keys()), f"Missing keys: {expected_keys - set(ctx.keys())}"

    def test_project_name_matches_directory(self, tmp_path: pathlib.Path) -> None:
        """project_name in the returned dict matches the project root directory name."""
        state_dir = tmp_path / ".codelicious"
        state_dir.mkdir()
        (state_dir / "STATE.md").write_text("", encoding="utf-8")

        ctx = extract_context(tmp_path)

        assert ctx["project_name"] == tmp_path.name

    def test_tech_stack_extracted_from_state_md(self, tmp_path: pathlib.Path) -> None:
        """tech_stack field contains content from the '## Tech Stack' section."""
        state_dir = tmp_path / ".codelicious"
        state_dir.mkdir()
        content = "## Tech Stack\nPython 3.10, pytest, ruff\n\n## Other\nstuff\n"
        (state_dir / "STATE.md").write_text(content, encoding="utf-8")

        ctx = extract_context(tmp_path)

        assert "Python 3.10" in ctx["tech_stack"]

    def test_pending_count_counts_unchecked_tasks(self, tmp_path: pathlib.Path) -> None:
        """pending_count reflects the number of '### [ ]' items in STATE.md."""
        state_dir = tmp_path / ".codelicious"
        state_dir.mkdir()
        content = "### [ ] Task A\n### [ ] Task B\n### [x] Task: Done task\n"
        (state_dir / "STATE.md").write_text(content, encoding="utf-8")

        ctx = extract_context(tmp_path)

        assert ctx["pending_count"] == "2"

    def test_completed_count_counts_completed_tasks(self, tmp_path: pathlib.Path) -> None:
        """completed_count reflects the number of '### [x] Task:' items in STATE.md."""
        state_dir = tmp_path / ".codelicious"
        state_dir.mkdir()
        content = "### [x] Task: Build thing\n### [x] Task: Test thing\n### [ ] Task C\n"
        (state_dir / "STATE.md").write_text(content, encoding="utf-8")

        ctx = extract_context(tmp_path)

        assert ctx["completed_count"] == "2"

    def test_missing_state_md_returns_defaults(self, tmp_path: pathlib.Path) -> None:
        """When STATE.md does not exist, extract_context returns all-default values."""
        # No .codelicious/STATE.md created
        ctx = extract_context(tmp_path)

        assert ctx["pending_count"] == "0"
        assert ctx["completed_count"] == "0"
        assert ctx["tech_stack"] == ""
        assert ctx["test_command"] == ""

    def test_iteration_and_stall_count_passed_through(self, tmp_path: pathlib.Path) -> None:
        """iteration and stall_count arguments are reflected in the returned dict."""
        ctx = extract_context(tmp_path, iteration=3, stall_count=2)

        assert ctx["iteration"] == "3"
        assert ctx["stall_count"] == "2"

    def test_test_command_extracted_from_how_to_test_section(self, tmp_path: pathlib.Path) -> None:
        """test_command is the first non-empty line of the '## How to Test' section."""
        state_dir = tmp_path / ".codelicious"
        state_dir.mkdir()
        content = "## How to Test\npython -m pytest tests/ -x\n\n## Other\nstuff\n"
        (state_dir / "STATE.md").write_text(content, encoding="utf-8")

        ctx = extract_context(tmp_path)

        assert ctx["test_command"] == "python -m pytest tests/ -x"


# ---------------------------------------------------------------------------
# spec-21 Phase 16e: prompts.py — render substitution and prompt constants
# ---------------------------------------------------------------------------


class TestPromptsRenderAndConstants:
    """Tests for render() and prompt constant validation (spec-21 Phase 16e)."""

    def test_render_substitution(self) -> None:
        """render() must substitute {{key}} placeholders with values."""
        from codelicious.prompts import render

        template = "Hello {{name}}, welcome to {{project}}!"
        result = render(template, name="Alice", project="codelicious")
        assert result == "Hello Alice, welcome to codelicious!"

    def test_render_no_args_returns_unchanged(self) -> None:
        """render() with no kwargs must return the template unchanged."""
        from codelicious.prompts import render

        template = "No {{placeholders}} replaced."
        assert render(template) == template

    def test_all_prompt_constants_are_strings(self) -> None:
        """All uppercase module-level constants in prompts.py must be strings."""
        import codelicious.prompts as prompts_module

        for name in dir(prompts_module):
            if name.isupper() and not name.startswith("_"):
                val = getattr(prompts_module, name)
                if isinstance(val, str):
                    assert len(val) > 0, f"Prompt constant {name} is empty"

    def test_agent_build_spec_contains_template_vars(self) -> None:
        """AGENT_BUILD_SPEC must contain {{project_name}} and {{spec_filter}}."""
        from codelicious.prompts import AGENT_BUILD_SPEC

        assert "{{project_name}}" in AGENT_BUILD_SPEC
        assert "{{spec_filter}}" in AGENT_BUILD_SPEC
