"""Tests for chunker.py — spec decomposition into commit-sized work chunks (spec-27 Phase 2.1)."""

from __future__ import annotations

import pathlib
from unittest import mock

import pytest

from codelicious.chunker import WorkChunk, _extract_file_hints, _spec_id_from_path, chunk_spec

# ---------------------------------------------------------------------------
# _spec_id_from_path
# ---------------------------------------------------------------------------


class TestSpecIdFromPath:
    def test_numbered_spec(self) -> None:
        assert _spec_id_from_path(pathlib.Path("27_codelicious_v2_rewrite.md")) == "27"

    def test_no_number_spec(self) -> None:
        assert _spec_id_from_path(pathlib.Path("ROADMAP.md")) == "ROADMAP"

    def test_deeply_nested(self) -> None:
        assert _spec_id_from_path(pathlib.Path("docs/specs/03_feature.md")) == "03"


# ---------------------------------------------------------------------------
# _extract_file_hints
# ---------------------------------------------------------------------------


class TestExtractFileHints:
    def test_backtick_paths(self) -> None:
        text = "Modify `src/foo.py` and `tests/test_foo.py` for this."
        hints = _extract_file_hints(text)
        assert "src/foo.py" in hints
        assert "tests/test_foo.py" in hints

    def test_file_colon_pattern(self) -> None:
        text = "File: src/bar.py"
        hints = _extract_file_hints(text)
        assert "src/bar.py" in hints

    def test_no_duplicates(self) -> None:
        text = "`src/a.py` and also `src/a.py` again"
        hints = _extract_file_hints(text)
        assert hints.count("src/a.py") == 1

    def test_no_matches(self) -> None:
        text = "Just some plain text with no file paths."
        assert _extract_file_hints(text) == []


# ---------------------------------------------------------------------------
# WorkChunk dataclass
# ---------------------------------------------------------------------------


class TestWorkChunk:
    def test_frozen(self) -> None:
        wc = WorkChunk(
            id="spec-1-chunk-01",
            spec_path=pathlib.Path("spec.md"),
            title="Add feature",
            description="desc",
            depends_on=[],
            estimated_files=["src/a.py"],
            validation="",
        )
        with pytest.raises(AttributeError):
            wc.id = "changed"  # type: ignore[misc]

    def test_hash_by_id(self) -> None:
        a = WorkChunk(
            id="x",
            spec_path=pathlib.Path("a.md"),
            title="",
            description="",
            depends_on=[],
            estimated_files=[],
            validation="",
        )
        b = WorkChunk(
            id="x",
            spec_path=pathlib.Path("b.md"),
            title="diff",
            description="",
            depends_on=[],
            estimated_files=[],
            validation="",
        )
        assert a == b
        assert hash(a) == hash(b)

    def test_different_ids_not_equal(self) -> None:
        a = WorkChunk(
            id="x",
            spec_path=pathlib.Path("a.md"),
            title="",
            description="",
            depends_on=[],
            estimated_files=[],
            validation="",
        )
        b = WorkChunk(
            id="y",
            spec_path=pathlib.Path("a.md"),
            title="",
            description="",
            depends_on=[],
            estimated_files=[],
            validation="",
        )
        assert a != b


# ---------------------------------------------------------------------------
# chunk_spec — checkbox-based chunking
# ---------------------------------------------------------------------------


class TestChunkSpec:
    def _write_spec(self, tmp_path: pathlib.Path, content: str) -> pathlib.Path:
        spec = tmp_path / "docs" / "specs" / "01_feature.md"
        spec.parent.mkdir(parents=True, exist_ok=True)
        spec.write_text(content, encoding="utf-8")
        return spec

    def test_checkboxes_become_chunks(self, tmp_path: pathlib.Path) -> None:
        """Each - [ ] checkbox becomes one chunk."""
        spec = self._write_spec(
            tmp_path,
            (
                "# Feature\n\n"
                "## Phase 1\n\n"
                "- [ ] Add user model\n"
                "- [ ] Add auth middleware\n"
                "\n"
                "## Phase 2\n\n"
                "- [ ] Add login endpoint\n"
            ),
        )
        chunks = chunk_spec(spec, tmp_path)
        assert len(chunks) == 3
        assert "user model" in chunks[0].title.lower()
        assert "auth middleware" in chunks[1].title.lower()
        assert "login endpoint" in chunks[2].title.lower()

    def test_chunk_ids_are_sequential(self, tmp_path: pathlib.Path) -> None:
        spec = self._write_spec(tmp_path, ("# Spec\n\n## Phase 1\n\n- [ ] Task A\n- [ ] Task B\n"))
        chunks = chunk_spec(spec, tmp_path)
        assert chunks[0].id == "spec-01-chunk-01"
        assert chunks[1].id == "spec-01-chunk-02"

    def test_cross_section_dependencies(self, tmp_path: pathlib.Path) -> None:
        """First chunk of Phase 2 depends on last chunk of Phase 1."""
        spec = self._write_spec(
            tmp_path, ("# Spec\n\n## Phase 1\n\n- [ ] Task A\n- [ ] Task B\n\n## Phase 2\n\n- [ ] Task C\n")
        )
        chunks = chunk_spec(spec, tmp_path)
        assert len(chunks) == 3
        # Task C depends on Task B (last of Phase 1)
        assert chunks[2].depends_on == [chunks[1].id]

    def test_section_without_checkboxes_becomes_one_chunk(self, tmp_path: pathlib.Path) -> None:
        """A section with no checkboxes becomes a single chunk."""
        spec = self._write_spec(
            tmp_path,
            ("# Spec\n\n## Design Notes\n\nThis section has no checkboxes, just prose describing work to do.\n"),
        )
        chunks = chunk_spec(spec, tmp_path)
        assert len(chunks) == 1
        assert "Design Notes" in chunks[0].title

    def test_empty_spec_produces_no_chunks(self, tmp_path: pathlib.Path) -> None:
        """A spec with only a title and no body produces no chunks."""
        spec = self._write_spec(tmp_path, "# Empty Spec\n")
        chunks = chunk_spec(spec, tmp_path)
        assert len(chunks) == 0

    def test_spec_path_stored_in_chunk(self, tmp_path: pathlib.Path) -> None:
        spec = self._write_spec(tmp_path, ("# Spec\n\n## Phase 1\n\n- [ ] Do something\n"))
        chunks = chunk_spec(spec, tmp_path)
        assert chunks[0].spec_path == spec

    def test_description_includes_context(self, tmp_path: pathlib.Path) -> None:
        spec = self._write_spec(tmp_path, ("# Spec\n\n## Phase 1\n\n- [ ] Add `src/model.py` with User class\n"))
        chunks = chunk_spec(spec, tmp_path)
        assert "src/model.py" in chunks[0].description

    def test_file_hints_extracted(self, tmp_path: pathlib.Path) -> None:
        spec = self._write_spec(tmp_path, ("# Spec\n\n## Phase 1\n\n- [ ] Modify `src/handler.py` to add validation\n"))
        chunks = chunk_spec(spec, tmp_path)
        assert "src/handler.py" in chunks[0].estimated_files

    def test_exceeding_max_chunks_raises(self, tmp_path: pathlib.Path) -> None:
        """More than 100 checkboxes raises ValueError."""
        lines = ["# Spec\n\n## Phase 1\n\n"]
        for i in range(101):
            lines.append(f"- [ ] Task {i}\n")
        spec = self._write_spec(tmp_path, "".join(lines))
        with pytest.raises(ValueError, match="100-chunk limit"):
            chunk_spec(spec, tmp_path)

    def test_checked_boxes_are_ignored(self, tmp_path: pathlib.Path) -> None:
        """Already-checked [x] boxes do not produce chunks."""
        spec = self._write_spec(tmp_path, ("# Spec\n\n## Phase 1\n\n- [x] Already done\n- [ ] Still todo\n"))
        chunks = chunk_spec(spec, tmp_path)
        assert len(chunks) == 1
        assert "Still todo" in chunks[0].title


# ---------------------------------------------------------------------------
# chunk_spec_with_llm
# ---------------------------------------------------------------------------


class TestChunkSpecWithLlm:
    """spec-27: chunk_spec_with_llm uses LLM for complex spec decomposition."""

    def _write_spec(self, tmp_path: pathlib.Path, content: str) -> pathlib.Path:
        spec = tmp_path / "docs" / "specs" / "01_feature.md"
        spec.parent.mkdir(parents=True, exist_ok=True)
        spec.write_text(content, encoding="utf-8")
        return spec

    def _mock_llm(self, response_json: str) -> mock.MagicMock:
        llm = mock.MagicMock()
        llm.chat_completion.return_value = {"choices": [{"message": {"role": "assistant", "content": response_json}}]}
        return llm

    def test_valid_llm_response(self, tmp_path: pathlib.Path) -> None:
        """Valid JSON array from LLM produces WorkChunks."""
        spec = self._write_spec(tmp_path, "# Feature\n\nImplement auth.\n")
        llm = self._mock_llm(
            '[{"title": "Add User model", "description": "Create the model", '
            '"files": ["src/model.py"], "depends_on_indices": [], "validation": "tests pass"}]'
        )

        from codelicious.chunker import chunk_spec_with_llm

        chunks = chunk_spec_with_llm(spec, tmp_path, llm)
        assert len(chunks) == 1
        assert chunks[0].title == "Add User model"
        assert "src/model.py" in chunks[0].estimated_files

    def test_llm_returns_multiple_chunks_with_deps(self, tmp_path: pathlib.Path) -> None:
        spec = self._write_spec(tmp_path, "# Feature\n\nBuild auth system.\n")
        llm = self._mock_llm(
            "["
            '{"title": "Add model", "description": "Model", "files": [], "depends_on_indices": [], "validation": ""},'
            '{"title": "Add endpoint", "description": "API", "files": [], "depends_on_indices": [0], "validation": ""}'
            "]"
        )

        from codelicious.chunker import chunk_spec_with_llm

        chunks = chunk_spec_with_llm(spec, tmp_path, llm)
        assert len(chunks) == 2
        assert chunks[1].depends_on == ["spec-01-chunk-01"]

    def test_invalid_json_falls_back(self, tmp_path: pathlib.Path) -> None:
        """Invalid JSON from LLM falls back to deterministic chunk_spec."""
        spec = self._write_spec(tmp_path, "# Spec\n\n## P1\n\n- [ ] Task A\n")
        llm = self._mock_llm("not valid json at all")

        from codelicious.chunker import chunk_spec_with_llm

        chunks = chunk_spec_with_llm(spec, tmp_path, llm)
        # Falls back to chunk_spec which finds 1 checkbox
        assert len(chunks) == 1
        assert "Task A" in chunks[0].title

    def test_llm_error_falls_back(self, tmp_path: pathlib.Path) -> None:
        """LLM call exception falls back to deterministic."""
        spec = self._write_spec(tmp_path, "# Spec\n\n## P1\n\n- [ ] Task B\n")
        llm = mock.MagicMock()
        llm.chat_completion.side_effect = RuntimeError("API down")

        from codelicious.chunker import chunk_spec_with_llm

        chunks = chunk_spec_with_llm(spec, tmp_path, llm)
        assert len(chunks) == 1

    def test_path_traversal_in_files_stripped(self, tmp_path: pathlib.Path) -> None:
        """File paths with '..' or absolute paths are excluded."""
        spec = self._write_spec(tmp_path, "# Spec\n\nDo work.\n")
        llm = self._mock_llm(
            '[{"title": "Fix", "description": "Fix it", '
            '"files": ["src/ok.py", "../etc/passwd", "/root/bad.py"], '
            '"depends_on_indices": [], "validation": ""}]'
        )

        from codelicious.chunker import chunk_spec_with_llm

        chunks = chunk_spec_with_llm(spec, tmp_path, llm)
        assert "src/ok.py" in chunks[0].estimated_files
        assert "../etc/passwd" not in chunks[0].estimated_files
        assert "/root/bad.py" not in chunks[0].estimated_files

    def test_circular_deps_falls_back(self, tmp_path: pathlib.Path) -> None:
        """Circular dependencies trigger fallback."""
        spec = self._write_spec(tmp_path, "# Spec\n\n## P1\n\n- [ ] Task\n")
        llm = self._mock_llm(
            "["
            '{"title": "A", "description": "A", "files": [], "depends_on_indices": [1], "validation": ""},'
            '{"title": "B", "description": "B", "files": [], "depends_on_indices": [0], "validation": ""}'
            "]"
        )

        from codelicious.chunker import chunk_spec_with_llm

        chunks = chunk_spec_with_llm(spec, tmp_path, llm)
        # Falls back to deterministic — 1 checkbox
        assert len(chunks) == 1

    def test_markdown_code_fence_stripped(self, tmp_path: pathlib.Path) -> None:
        """JSON wrapped in ```json fences is still parsed."""
        spec = self._write_spec(tmp_path, "# Spec\n\nDo it.\n")
        llm = self._mock_llm(
            "```json\n"
            '[{"title": "Task", "description": "Do", "files": [], "depends_on_indices": [], "validation": ""}]\n'
            "```"
        )

        from codelicious.chunker import chunk_spec_with_llm

        chunks = chunk_spec_with_llm(spec, tmp_path, llm)
        assert len(chunks) == 1
        assert chunks[0].title == "Task"
