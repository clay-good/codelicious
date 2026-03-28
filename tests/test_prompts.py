"""Tests for prompt utilities: scan_remaining_tasks_for_spec, render, check_build_complete."""

from __future__ import annotations

import pathlib


from codelicious.prompts import (
    AGENT_BUILD_SPEC,
    check_build_complete,
    clear_build_complete,
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

    def test_excludes_readme(self, tmp_path: pathlib.Path):
        (tmp_path / "README.md").write_text("- [ ] should be ignored\n")
        assert scan_remaining_tasks(tmp_path) == 0

    def test_excludes_claude_md(self, tmp_path: pathlib.Path):
        (tmp_path / "CLAUDE.md").write_text("- [ ] should be ignored\n")
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
