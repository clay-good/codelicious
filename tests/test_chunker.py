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

    def test_too_many_chunks_truncated_with_warning(
        self, tmp_path: pathlib.Path, caplog: pytest.LogCaptureFixture
    ) -> None:
        """LLM producing > _MAX_CHUNKS_PER_SPEC is truncated to the cap with a WARNING (spec v29 Step 7)."""
        from codelicious.chunker import _MAX_CHUNKS_PER_SPEC, chunk_spec_with_llm

        spec = self._write_spec(tmp_path, "# Spec\n\nMassive.\n")
        items = ",".join(
            f'{{"title": "T{i}", "description": "d", "files": [], "depends_on_indices": [], "validation": ""}}'
            for i in range(_MAX_CHUNKS_PER_SPEC + 1)
        )
        llm = self._mock_llm(f"[{items}]")

        with caplog.at_level("WARNING", logger="codelicious.chunker"):
            chunks = chunk_spec_with_llm(spec, tmp_path, llm)
        assert len(chunks) == _MAX_CHUNKS_PER_SPEC
        assert any("truncating" in r.message.lower() for r in caplog.records)

    def test_non_array_json_falls_back(self, tmp_path: pathlib.Path) -> None:
        """JSON object (not array) at top level falls back to deterministic."""
        spec = self._write_spec(tmp_path, "# Spec\n\n## P1\n\n- [ ] Single task\n")
        llm = self._mock_llm('{"title": "wrong shape"}')

        from codelicious.chunker import chunk_spec_with_llm

        chunks = chunk_spec_with_llm(spec, tmp_path, llm)
        assert len(chunks) == 1
        assert "Single task" in chunks[0].title

    def test_short_spec_uses_single_window(self, tmp_path: pathlib.Path) -> None:
        """Short specs make exactly one LLM call (spec v29 Step 7)."""
        spec = self._write_spec(tmp_path, "# Short\n\n## P1\n\n- [ ] X\n")
        llm = self._mock_llm(
            '[{"title": "X", "description": "d", "files": [], "depends_on_indices": [], "validation": ""}]'
        )

        from codelicious.chunker import chunk_spec_with_llm

        chunk_spec_with_llm(spec, tmp_path, llm)
        assert llm.chat_completion.call_count == 1

    def test_oversized_spec_makes_multiple_windowed_calls(
        self, tmp_path: pathlib.Path, caplog: pytest.LogCaptureFixture
    ) -> None:
        """A spec well over _LLM_WINDOW_SIZE drives multiple LLM calls (spec v29 Step 7)."""
        from codelicious.chunker import _LLM_WINDOW_SIZE, chunk_spec_with_llm

        big = "x " * (_LLM_WINDOW_SIZE * 3)
        spec = self._write_spec(tmp_path, big)
        llm = self._mock_llm(
            '[{"title": "T", "description": "d", "files": [], "depends_on_indices": [], "validation": ""}]'
        )

        with caplog.at_level("WARNING", logger="codelicious.chunker"):
            chunks = chunk_spec_with_llm(spec, tmp_path, llm)
        assert llm.chat_completion.call_count >= 2
        # Title is the same across windows; dedup keeps a single chunk.
        assert len(chunks) == 1
        assert any("splitting into" in r.message for r in caplog.records)

    def test_split_spec_helper_caps_window_count(self) -> None:
        """``_split_spec_for_llm`` never produces more than _LLM_MAX_WINDOWS windows."""
        from codelicious.chunker import _LLM_MAX_WINDOWS, _LLM_WINDOW_SIZE, _split_spec_for_llm

        huge = "y " * (_LLM_WINDOW_SIZE * 50)
        windows = _split_spec_for_llm(huge)
        assert len(windows) == _LLM_MAX_WINDOWS

    def test_self_referential_dep_dropped(self, tmp_path: pathlib.Path) -> None:
        """A chunk depending on itself is silently dropped (i != idx guard)."""
        spec = self._write_spec(tmp_path, "# Spec\n\nWork.\n")
        llm = self._mock_llm(
            '[{"title": "Solo", "description": "d", "files": [], "depends_on_indices": [0], "validation": ""}]'
        )

        from codelicious.chunker import chunk_spec_with_llm

        chunks = chunk_spec_with_llm(spec, tmp_path, llm)
        assert len(chunks) == 1
        assert chunks[0].depends_on == []


# ─────────────────────────────────────────────────────────────────────────
# spec v30 Step 6: token-budget-aware chunk sizing
# ─────────────────────────────────────────────────────────────────────────


class TestTokenBudget:
    def _wc(self, files: list[str], chunk_id: str = "spec-1-chunk-01") -> WorkChunk:
        from codelicious.chunker import WorkChunk

        return WorkChunk(
            id=chunk_id,
            spec_path=pathlib.Path("docs/specs/01.md"),
            title="t",
            description="d",
            depends_on=[],
            estimated_files=files,
            validation="",
        )

    def test_under_budget_unchanged(self, tmp_path: pathlib.Path) -> None:
        from codelicious.chunker import enforce_token_budget

        wc = self._wc([])
        out = enforce_token_budget([wc], tmp_path, engines=["claude"])
        assert out == [wc]

    def test_over_budget_chunk_is_split(self, tmp_path: pathlib.Path) -> None:
        from codelicious.chunker import enforce_token_budget

        # 4 files, each 30k chars → 120k chars / 4 = 30k tokens. HF budget 24k.
        files = []
        for i in range(4):
            p = tmp_path / f"big_{i}.py"
            p.write_text("x" * 30_000)
            files.append(p.name)
        wc = self._wc(files)
        out = enforce_token_budget([wc], tmp_path, engines=["huggingface"])
        # Splits at least once → two or more chunks; second one depends on first.
        assert len(out) >= 2
        assert out[0].id == wc.id
        assert wc.id in out[1].depends_on

    def test_recursive_split_caps_at_depth(self, tmp_path: pathlib.Path, caplog: pytest.LogCaptureFixture) -> None:
        """Even a runaway chunk produces at most 2**depth+1 sub-chunks."""
        from codelicious.chunker import _MAX_CHUNK_SPLIT_DEPTH, enforce_token_budget

        # One enormous file dominates the budget; can't split below 1 file.
        big = tmp_path / "huge.py"
        big.write_text("y" * 200_000)
        wc = self._wc([big.name])
        with caplog.at_level("WARNING", logger="codelicious.chunker"):
            out = enforce_token_budget([wc], tmp_path, engines=["huggingface"])
        # Single-file chunk can't subdivide further; original is dispatched anyway.
        assert len(out) == 1
        assert any("dispatch anyway" in r.message for r in caplog.records)
        assert _MAX_CHUNK_SPLIT_DEPTH == 3

    def test_split_preserves_total_file_coverage(self, tmp_path: pathlib.Path) -> None:
        from codelicious.chunker import enforce_token_budget

        files = []
        for i in range(4):
            p = tmp_path / f"file_{i}.py"
            p.write_text("z" * 30_000)
            files.append(p.name)
        wc = self._wc(files)
        out = enforce_token_budget([wc], tmp_path, engines=["huggingface"])
        covered: list[str] = []
        for c in out:
            covered.extend(c.estimated_files)
        assert sorted(covered) == sorted(files)
