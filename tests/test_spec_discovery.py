"""Tests for spec_discovery.py — spec file discovery and lifecycle (spec-27 Phase 7.1).

Covers:
- walk_for_specs with various repo layouts
- discover_incomplete_specs checkbox detection
- mark_chunk_complete checkbox updating
- Edge cases: nested specs dirs, excluded filenames, untracked files
"""

from __future__ import annotations

import pathlib

from codelicious.spec_discovery import (
    CHECKED_RE,
    SKIP_DIRS,
    SPEC_EXCLUDE_NAMES,
    UNCHECKED_RE,
    discover_incomplete_specs,
    mark_chunk_complete,
    walk_for_specs,
)


class TestWalkForSpecsLayouts:
    """walk_for_specs with various repo directory layouts."""

    def test_specs_in_docs_specs_dir(self, tmp_path: pathlib.Path) -> None:
        d = tmp_path / "docs" / "specs"
        d.mkdir(parents=True)
        (d / "01_auth.md").write_text("- [ ] task\n")
        (d / "02_api.md").write_text("- [ ] task\n")
        result = walk_for_specs(tmp_path)
        assert len(result) == 2

    def test_specs_in_nested_specs_dir(self, tmp_path: pathlib.Path) -> None:
        d = tmp_path / "project" / "specs"
        d.mkdir(parents=True)
        (d / "feature.md").write_text("- [ ] task\n")
        result = walk_for_specs(tmp_path)
        assert any("feature.md" in str(p) for p in result)

    def test_spec_at_root_matching_regex(self, tmp_path: pathlib.Path) -> None:
        (tmp_path / "spec.md").write_text("- [ ] task\n")
        (tmp_path / "spec-v2.md").write_text("- [ ] task\n")
        (tmp_path / "ROADMAP.md").write_text("- [ ] task\n")
        (tmp_path / "TODO.md").write_text("- [ ] task\n")
        result = walk_for_specs(tmp_path)
        names = {p.name for p in result}
        assert "spec.md" in names
        assert "spec-v2.md" in names
        assert "ROADMAP.md" in names
        assert "TODO.md" in names

    def test_non_spec_md_at_root_ignored(self, tmp_path: pathlib.Path) -> None:
        (tmp_path / "notes.md").write_text("random notes\n")
        (tmp_path / "design.md").write_text("design doc\n")
        result = walk_for_specs(tmp_path)
        names = {p.name for p in result}
        assert "notes.md" not in names
        assert "design.md" not in names

    def test_excluded_filenames_skipped(self, tmp_path: pathlib.Path) -> None:
        d = tmp_path / "docs" / "specs"
        d.mkdir(parents=True)
        for name in SPEC_EXCLUDE_NAMES:
            (d / name).write_text("# Excluded\n")
        (d / "real_spec.md").write_text("- [ ] task\n")
        result = walk_for_specs(tmp_path)
        names = {p.name.lower() for p in result}
        for excluded in SPEC_EXCLUDE_NAMES:
            assert excluded not in names

    def test_skip_dirs_not_traversed(self, tmp_path: pathlib.Path) -> None:
        for skip_dir in list(SKIP_DIRS)[:5]:
            d = tmp_path / skip_dir / "specs"
            d.mkdir(parents=True)
            (d / "spec.md").write_text("- [ ] hidden\n")
        result = walk_for_specs(tmp_path)
        assert len(result) == 0

    def test_empty_repo(self, tmp_path: pathlib.Path) -> None:
        result = walk_for_specs(tmp_path)
        assert result == []

    def test_results_sorted(self, tmp_path: pathlib.Path) -> None:
        d = tmp_path / "docs" / "specs"
        d.mkdir(parents=True)
        (d / "03_c.md").write_text("- [ ] c\n")
        (d / "01_a.md").write_text("- [ ] a\n")
        (d / "02_b.md").write_text("- [ ] b\n")
        result = walk_for_specs(tmp_path)
        assert result == sorted(result)


class TestDiscoverIncompleteSpecs:
    """discover_incomplete_specs checkbox-based classification."""

    def test_unchecked_is_incomplete(self, tmp_path: pathlib.Path) -> None:
        spec = tmp_path / "spec.md"
        spec.write_text("- [ ] todo\n- [x] done\n")
        assert spec in discover_incomplete_specs(tmp_path, all_specs=[spec])

    def test_all_checked_is_complete(self, tmp_path: pathlib.Path) -> None:
        spec = tmp_path / "spec.md"
        spec.write_text("- [x] done A\n- [X] done B\n")
        assert spec not in discover_incomplete_specs(tmp_path, all_specs=[spec])

    def test_no_checkboxes_is_incomplete(self, tmp_path: pathlib.Path) -> None:
        spec = tmp_path / "spec.md"
        spec.write_text("# Prose spec\nJust text.\n")
        assert spec in discover_incomplete_specs(tmp_path, all_specs=[spec])

    def test_unreadable_file_skipped(self, tmp_path: pathlib.Path) -> None:
        missing = tmp_path / "gone.md"
        good = tmp_path / "good.md"
        good.write_text("- [ ] task\n")
        result = discover_incomplete_specs(tmp_path, all_specs=[missing, good])
        assert good in result
        assert missing not in result

    def test_mixed_specs(self, tmp_path: pathlib.Path) -> None:
        complete = tmp_path / "done.md"
        complete.write_text("- [x] a\n- [x] b\n")
        incomplete = tmp_path / "todo.md"
        incomplete.write_text("- [ ] c\n")
        result = discover_incomplete_specs(tmp_path, all_specs=[complete, incomplete])
        assert incomplete in result
        assert complete not in result


class TestMarkChunkComplete:
    """mark_chunk_complete updates spec checkboxes."""

    def test_marks_matching_line(self, tmp_path: pathlib.Path) -> None:
        spec = tmp_path / "spec.md"
        spec.write_text("- [ ] Add user model\n- [ ] Add auth\n")
        assert mark_chunk_complete(spec, "Add user model") is True
        content = spec.read_text()
        assert "- [x] Add user model" in content
        assert "- [ ] Add auth" in content

    def test_fallback_to_first_unchecked(self, tmp_path: pathlib.Path) -> None:
        spec = tmp_path / "spec.md"
        spec.write_text("- [ ] A\n- [ ] B\n")
        assert mark_chunk_complete(spec, "nonexistent") is True
        assert "- [x] A" in spec.read_text()

    def test_no_unchecked_returns_false(self, tmp_path: pathlib.Path) -> None:
        spec = tmp_path / "spec.md"
        spec.write_text("- [x] done\n")
        assert mark_chunk_complete(spec, "anything") is False

    def test_missing_file_returns_false(self, tmp_path: pathlib.Path) -> None:
        assert mark_chunk_complete(tmp_path / "gone.md", "x") is False


class TestRegexPatterns:
    """UNCHECKED_RE and CHECKED_RE match expected patterns."""

    def test_unchecked_variations(self) -> None:
        assert UNCHECKED_RE.match("- [ ] task")
        assert UNCHECKED_RE.match("  - [ ] indented")
        assert UNCHECKED_RE.match("- [  ] extra space")
        assert not UNCHECKED_RE.match("- [x] checked")

    def test_checked_variations(self) -> None:
        assert CHECKED_RE.match("- [x] done")
        assert CHECKED_RE.match("- [X] done")
        assert not CHECKED_RE.match("- [ ] unchecked")
