"""Tests for V2Orchestrator — chunk-based serial orchestration loop (spec-27 Phase 4)."""

from __future__ import annotations

import pathlib
from unittest import mock

from codelicious.engines.base import ChunkResult
from codelicious.orchestrator import V2Orchestrator
from codelicious.spec_discovery import mark_chunk_complete

# ---------------------------------------------------------------------------
# mark_chunk_complete
# ---------------------------------------------------------------------------


class TestMarkChunkComplete:
    """spec-27 Phase 4.2: mark_chunk_complete updates spec checkboxes."""

    def test_marks_matching_checkbox(self, tmp_path: pathlib.Path) -> None:
        spec = tmp_path / "spec.md"
        spec.write_text("# Spec\n\n- [ ] Add user model\n- [ ] Add auth\n", encoding="utf-8")

        result = mark_chunk_complete(spec, "Add user model")
        assert result is True

        content = spec.read_text(encoding="utf-8")
        assert "- [x] Add user model" in content
        assert "- [ ] Add auth" in content  # untouched

    def test_marks_first_unchecked_on_no_match(self, tmp_path: pathlib.Path) -> None:
        spec = tmp_path / "spec.md"
        spec.write_text("# Spec\n\n- [ ] Task A\n- [ ] Task B\n", encoding="utf-8")

        result = mark_chunk_complete(spec, "nonexistent title")
        assert result is True

        content = spec.read_text(encoding="utf-8")
        assert "- [x] Task A" in content  # first one marked
        assert "- [ ] Task B" in content

    def test_no_unchecked_returns_false(self, tmp_path: pathlib.Path) -> None:
        spec = tmp_path / "spec.md"
        spec.write_text("# Spec\n\n- [x] Done\n", encoding="utf-8")

        result = mark_chunk_complete(spec, "anything")
        assert result is False

    def test_nonexistent_file_returns_false(self, tmp_path: pathlib.Path) -> None:
        spec = tmp_path / "missing.md"
        result = mark_chunk_complete(spec, "anything")
        assert result is False

    def test_case_insensitive_match(self, tmp_path: pathlib.Path) -> None:
        spec = tmp_path / "spec.md"
        spec.write_text("# Spec\n\n- [ ] Add USER Model\n", encoding="utf-8")

        result = mark_chunk_complete(spec, "add user model")
        assert result is True
        assert "- [x] Add USER Model" in spec.read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# V2Orchestrator
# ---------------------------------------------------------------------------


class TestV2Orchestrator:
    """spec-27 Phase 4.1: V2Orchestrator chunk-based loop."""

    def _make_spec(self, tmp_path: pathlib.Path, content: str) -> pathlib.Path:
        spec_dir = tmp_path / "docs" / "specs"
        spec_dir.mkdir(parents=True, exist_ok=True)
        spec = spec_dir / "01_feature.md"
        spec.write_text(content, encoding="utf-8")
        return spec

    def _mock_engine(self, success: bool = True) -> mock.MagicMock:
        engine = mock.MagicMock()
        engine.name = "mock-engine"
        engine.execute_chunk.return_value = ChunkResult(
            success=success,
            files_modified=[pathlib.Path("src/a.py")] if success else [],
            message="done" if success else "failed",
        )
        engine.verify_chunk.return_value = ChunkResult(success=True, message="passed")
        engine.fix_chunk.return_value = ChunkResult(success=True, message="fixed")
        return engine

    def _mock_git(self) -> mock.MagicMock:
        git = mock.MagicMock()
        # assert_safe_branch must be set explicitly — MagicMock interprets assert_* as test assertions
        git.assert_safe_branch = mock.MagicMock()
        git.push_to_origin.return_value = mock.MagicMock(success=True, error_type=None, message="")
        git.commit_chunk.return_value = mock.MagicMock(success=True, sha="abc1234", message="ok")
        git.get_pr_commit_count.return_value = 0
        git.ensure_draft_pr_exists.return_value = 42
        git.revert_chunk_changes.return_value = True
        git.repo_path = pathlib.Path("/tmp/repo")
        return git

    def test_single_spec_single_chunk_success(self, tmp_path: pathlib.Path) -> None:
        """One spec with one checkbox produces one chunk, one commit."""
        spec = self._make_spec(tmp_path, "# Feature\n\n## Phase 1\n\n- [ ] Add model\n")
        engine = self._mock_engine(success=True)
        git = self._mock_git()

        orch = V2Orchestrator(tmp_path, git, engine)
        result = orch.run(specs=[spec], push_pr=False)

        assert result.success is True
        assert "1 chunks completed" in result.message
        engine.execute_chunk.assert_called_once()
        engine.verify_chunk.assert_called_once()

    def test_multi_chunk_spec(self, tmp_path: pathlib.Path) -> None:
        """A spec with 3 checkboxes produces 3 chunks, all committed."""
        spec = self._make_spec(
            tmp_path,
            "# Feature\n\n## Phase 1\n\n- [ ] Task A\n- [ ] Task B\n- [ ] Task C\n",
        )
        engine = self._mock_engine(success=True)
        git = self._mock_git()

        orch = V2Orchestrator(tmp_path, git, engine)
        result = orch.run(specs=[spec], push_pr=False)

        assert result.success is True
        assert engine.execute_chunk.call_count == 3
        assert git.commit_chunk.call_count == 3

    def test_failed_chunk_reverts(self, tmp_path: pathlib.Path) -> None:
        """A failed chunk triggers revert_chunk_changes."""
        spec = self._make_spec(tmp_path, "# Feature\n\n## Phase 1\n\n- [ ] Task A\n")
        engine = self._mock_engine(success=False)
        git = self._mock_git()

        orch = V2Orchestrator(tmp_path, git, engine)
        result = orch.run(specs=[spec], push_pr=False)

        assert result.success is False
        assert "1 failed" in result.message
        git.revert_chunk_changes.assert_called_once()
        git.commit_chunk.assert_not_called()

    def test_pr_created_when_push_pr_true(self, tmp_path: pathlib.Path) -> None:
        """With push_pr=True, ensure_draft_pr_exists is called."""
        spec = self._make_spec(tmp_path, "# Feature\n\n## Phase 1\n\n- [ ] Task A\n")
        engine = self._mock_engine(success=True)
        git = self._mock_git()

        orch = V2Orchestrator(tmp_path, git, engine)
        result = orch.run(specs=[spec], push_pr=True)

        assert result.success is True
        git.ensure_draft_pr_exists.assert_called()
        git.transition_pr_to_review.assert_called()

    def test_no_pr_when_push_pr_false(self, tmp_path: pathlib.Path) -> None:
        """With push_pr=False, no PR operations occur."""
        spec = self._make_spec(tmp_path, "# Feature\n\n## Phase 1\n\n- [ ] Task A\n")
        engine = self._mock_engine(success=True)
        git = self._mock_git()

        orch = V2Orchestrator(tmp_path, git, engine)
        result = orch.run(specs=[spec], push_pr=False)

        assert result.success is True
        git.ensure_draft_pr_exists.assert_not_called()

    def test_deadline_stops_execution(self, tmp_path: pathlib.Path) -> None:
        """When deadline has passed, execution stops before processing chunks."""
        import time

        spec = self._make_spec(tmp_path, "# Feature\n\n## Phase 1\n\n- [ ] Task A\n")
        engine = self._mock_engine(success=True)
        git = self._mock_git()

        # Set deadline to the past
        orch = V2Orchestrator(tmp_path, git, engine)
        orch.run(specs=[spec], deadline=time.monotonic() - 10, push_pr=False)

        # Chunks should not have been executed
        engine.execute_chunk.assert_not_called()

    def test_empty_spec_no_chunks(self, tmp_path: pathlib.Path) -> None:
        """A spec with no checkboxes and no body produces no chunks."""
        spec = self._make_spec(tmp_path, "# Empty Spec\n")
        engine = self._mock_engine(success=True)
        git = self._mock_git()

        orch = V2Orchestrator(tmp_path, git, engine)
        result = orch.run(specs=[spec], push_pr=False)

        assert result.success is True
        engine.execute_chunk.assert_not_called()

    def test_verification_failure_triggers_fix(self, tmp_path: pathlib.Path) -> None:
        """When verify_chunk fails, fix_chunk is called."""
        spec = self._make_spec(tmp_path, "# Feature\n\n## Phase 1\n\n- [ ] Task A\n")
        engine = self._mock_engine(success=True)
        engine.verify_chunk.side_effect = [
            ChunkResult(success=False, message="lint failed"),
            ChunkResult(success=True, message="passed"),
        ]
        engine.fix_chunk.return_value = ChunkResult(success=True, files_modified=[pathlib.Path("src/a.py")])
        git = self._mock_git()

        orch = V2Orchestrator(tmp_path, git, engine)
        result = orch.run(specs=[spec], push_pr=False)

        assert result.success is True
        engine.fix_chunk.assert_called_once()

    def test_checkbox_marked_on_success(self, tmp_path: pathlib.Path) -> None:
        """After a successful chunk, the checkbox is marked [x] in the spec."""
        spec = self._make_spec(tmp_path, "# Feature\n\n## Phase 1\n\n- [ ] Add model\n- [ ] Add auth\n")
        engine = self._mock_engine(success=True)
        git = self._mock_git()

        orch = V2Orchestrator(tmp_path, git, engine)
        orch.run(specs=[spec], push_pr=False)

        content = spec.read_text(encoding="utf-8")
        # Both checkboxes should be marked (2 chunks, 2 successes)
        assert content.count("- [x]") == 2
        assert content.count("- [ ]") == 0
