"""End-to-end workflow test: spec → chunks → commits → PR (spec-27 Phase 7.2).

Uses a temp directory with mock engine and git manager to validate the
full V2Orchestrator pipeline without any real subprocess calls.
"""

from __future__ import annotations

import pathlib
from unittest import mock

from codelicious.engines.base import ChunkResult
from codelicious.orchestrator import V2Orchestrator


def _make_spec(tmp_path: pathlib.Path, content: str) -> pathlib.Path:
    spec_dir = tmp_path / "docs" / "specs"
    spec_dir.mkdir(parents=True, exist_ok=True)
    spec = spec_dir / "01_feature.md"
    spec.write_text(content, encoding="utf-8")
    return spec


def _mock_engine(success: bool = True) -> mock.MagicMock:
    engine = mock.MagicMock()
    engine.name = "mock-engine"
    engine.execute_chunk.return_value = ChunkResult(
        success=success,
        files_modified=[pathlib.Path("src/a.py")] if success else [],
        message="done" if success else "fail",
    )
    engine.verify_chunk.return_value = ChunkResult(success=True, message="passed")
    engine.fix_chunk.return_value = ChunkResult(success=True, message="fixed")
    return engine


def _mock_git() -> mock.MagicMock:
    git = mock.MagicMock()
    git.assert_safe_branch = mock.MagicMock()
    git.push_to_origin.return_value = mock.MagicMock(success=True, error_type=None, message="")
    git.commit_chunk.return_value = mock.MagicMock(success=True, sha="abc1234", message="ok")
    git.get_pr_commit_count.return_value = 0
    git.get_pr_diff_loc.return_value = 0
    git.ensure_draft_pr_exists.return_value = 42
    git.revert_chunk_changes.return_value = True
    git.transition_pr_to_review.return_value = None
    git.create_continuation_branch.return_value = "codelicious/spec-01-part-2"
    return git


class TestFullWorkflowE2E:
    """End-to-end: spec file → chunking → engine calls → commits → PR."""

    def test_single_spec_three_chunks(self, tmp_path: pathlib.Path) -> None:
        """A spec with 3 tasks produces 3 engine calls, 3 commits, 1 PR."""
        spec = _make_spec(
            tmp_path,
            (
                "# Feature Auth\n\n"
                "## Phase 1\n\n"
                "- [ ] Add User model\n"
                "- [ ] Add auth middleware\n"
                "- [ ] Add login endpoint\n"
            ),
        )
        engine = _mock_engine(success=True)
        git = _mock_git()

        orch = V2Orchestrator(tmp_path, git, engine, max_commits_per_pr=50)
        result = orch.run(specs=[spec], push_pr=True)

        assert result.success is True
        assert engine.execute_chunk.call_count == 3
        assert engine.verify_chunk.call_count == 3
        assert git.commit_chunk.call_count == 3
        git.transition_pr_to_review.assert_called_once()

    def test_checkboxes_marked_after_success(self, tmp_path: pathlib.Path) -> None:
        """After all chunks succeed, all checkboxes should be [x]."""
        spec = _make_spec(tmp_path, ("# Feature\n\n## Phase 1\n\n- [ ] Task A\n- [ ] Task B\n"))
        engine = _mock_engine(success=True)
        git = _mock_git()

        orch = V2Orchestrator(tmp_path, git, engine)
        orch.run(specs=[spec], push_pr=False)

        content = spec.read_text()
        assert content.count("- [x]") == 2
        assert content.count("- [ ]") == 0

    def test_failed_chunk_reverts_and_counts(self, tmp_path: pathlib.Path) -> None:
        """A failed chunk triggers revert and is counted as failure."""
        spec = _make_spec(tmp_path, "# F\n\n## P1\n\n- [ ] Task\n")
        engine = _mock_engine(success=False)
        git = _mock_git()

        orch = V2Orchestrator(tmp_path, git, engine)
        result = orch.run(specs=[spec], push_pr=False)

        assert result.success is False
        assert "1 failed" in result.message
        git.revert_chunk_changes.assert_called_once()
        git.commit_chunk.assert_not_called()

    def test_multiple_specs(self, tmp_path: pathlib.Path) -> None:
        """Multiple specs are processed sequentially."""
        spec_dir = tmp_path / "docs" / "specs"
        spec_dir.mkdir(parents=True)
        s1 = spec_dir / "01_auth.md"
        s1.write_text("# Auth\n\n## P1\n\n- [ ] Add auth\n")
        s2 = spec_dir / "02_api.md"
        s2.write_text("# API\n\n## P1\n\n- [ ] Add endpoint\n")

        engine = _mock_engine(success=True)
        git = _mock_git()

        orch = V2Orchestrator(tmp_path, git, engine)
        result = orch.run(specs=[s1, s2], push_pr=False)

        assert result.success is True
        assert engine.execute_chunk.call_count == 2
        assert "2/2 specs done" in result.message

    def test_pr_split_at_commit_cap(self, tmp_path: pathlib.Path) -> None:
        """When commit count exceeds cap, PR is split."""
        spec = _make_spec(tmp_path, ("# Feature\n\n## P1\n\n- [ ] A\n- [ ] B\n- [ ] C\n"))
        engine = _mock_engine(success=True)
        git = _mock_git()
        # Second call returns count at cap
        git.get_pr_commit_count.side_effect = [0, 2, 2]

        orch = V2Orchestrator(tmp_path, git, engine, max_commits_per_pr=2)
        result = orch.run(specs=[spec], push_pr=True)

        assert result.success is True
        # PR should have been split: transition + create continuation
        git.create_continuation_branch.assert_called()

    def test_verification_failure_triggers_fix_cycle(self, tmp_path: pathlib.Path) -> None:
        """When verify_chunk fails, fix_chunk is called, then re-verified."""
        spec = _make_spec(tmp_path, "# F\n\n## P1\n\n- [ ] Task\n")
        engine = _mock_engine(success=True)
        engine.verify_chunk.side_effect = [
            ChunkResult(success=False, message="lint: unused import"),
            ChunkResult(success=True, message="passed"),
        ]
        engine.fix_chunk.return_value = ChunkResult(
            success=True, files_modified=[pathlib.Path("src/a.py")], message="fixed"
        )
        git = _mock_git()

        orch = V2Orchestrator(tmp_path, git, engine)
        result = orch.run(specs=[spec], push_pr=False)

        assert result.success is True
        engine.fix_chunk.assert_called_once()
        assert engine.verify_chunk.call_count == 2

    def test_empty_spec_counted_as_complete(self, tmp_path: pathlib.Path) -> None:
        """A spec with no checkboxes and no work is counted as success."""
        spec = _make_spec(tmp_path, "# Empty\n")
        engine = _mock_engine()
        git = _mock_git()

        orch = V2Orchestrator(tmp_path, git, engine)
        result = orch.run(specs=[spec], push_pr=False)

        assert result.success is True
        engine.execute_chunk.assert_not_called()
