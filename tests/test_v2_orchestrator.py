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
        git.get_pr_diff_loc.return_value = 0
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

    def test_future_deadline_runs_all_chunks(self, tmp_path: pathlib.Path) -> None:
        """A deadline well in the future does not interrupt chunk execution (spec v29 Step 10)."""
        import time

        spec = self._make_spec(tmp_path, "# Feature\n\n## Phase 1\n\n- [ ] Task A\n- [ ] Task B\n")
        engine = self._mock_engine(success=True)
        git = self._mock_git()

        orch = V2Orchestrator(tmp_path, git, engine)
        orch.run(specs=[spec], deadline=time.monotonic() + 3600, push_pr=False)

        assert engine.execute_chunk.call_count == 2

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


class TestV2OrchestratorPrSplitCaps:
    """spec 28 Phase 2.2/2.3: PR splits when commit cap OR LOC cap is reached."""

    def _make_spec(self, tmp_path: pathlib.Path, content: str) -> pathlib.Path:
        spec_dir = tmp_path / "docs" / "specs"
        spec_dir.mkdir(parents=True, exist_ok=True)
        spec = spec_dir / "01_feature.md"
        spec.write_text(content, encoding="utf-8")
        return spec

    def _mock_engine(self) -> mock.MagicMock:
        engine = mock.MagicMock()
        engine.name = "mock-engine"
        engine.execute_chunk.return_value = ChunkResult(
            success=True, files_modified=[pathlib.Path("src/a.py")], message="done"
        )
        engine.verify_chunk.return_value = ChunkResult(success=True, message="passed")
        engine.fix_chunk.return_value = ChunkResult(success=True, message="fixed")
        return engine

    def _mock_git(self) -> mock.MagicMock:
        git = mock.MagicMock()
        git.assert_safe_branch = mock.MagicMock()
        git.push_to_origin.return_value = mock.MagicMock(success=True, error_type=None, message="")
        git.commit_chunk.return_value = mock.MagicMock(success=True, sha="abc1234", message="ok")
        git.get_pr_commit_count.return_value = 0
        git.get_pr_diff_loc.return_value = 0
        git.ensure_draft_pr_exists.return_value = 42
        git.revert_chunk_changes.return_value = True
        git.create_continuation_branch.return_value = "codelicious/spec-01-part-2"
        git.repo_path = pathlib.Path("/tmp/repo")
        return git

    def test_loc_cap_triggers_split(self, tmp_path: pathlib.Path) -> None:
        """When diff LOC reaches the cap, a continuation PR is opened."""
        spec = self._make_spec(tmp_path, "# Feature\n\n## Phase 1\n\n- [ ] Task A\n- [ ] Task B\n")
        engine = self._mock_engine()
        git = self._mock_git()
        # PR creation is deferred until after the first chunk pushes, so cap
        # checks only run starting at chunk 2. A single 500-LOC reading on
        # chunk 2 triggers the split.
        git.get_pr_diff_loc.return_value = 500

        orch = V2Orchestrator(tmp_path, git, engine, max_commits_per_pr=100, max_loc_per_pr=400)
        orch.run(specs=[spec], push_pr=True)

        git.create_continuation_branch.assert_called_once()
        # ensure_draft_pr_exists called once for initial PR + once for continuation
        assert git.ensure_draft_pr_exists.call_count >= 2

    def test_commit_cap_triggers_split(self, tmp_path: pathlib.Path) -> None:
        """When commit count reaches the cap, a continuation PR is opened."""
        spec = self._make_spec(tmp_path, "# Feature\n\n## Phase 1\n\n- [ ] Task A\n- [ ] Task B\n")
        engine = self._mock_engine()
        git = self._mock_git()
        git.get_pr_commit_count.return_value = 8

        orch = V2Orchestrator(tmp_path, git, engine, max_commits_per_pr=8, max_loc_per_pr=0)
        orch.run(specs=[spec], push_pr=True)

        git.create_continuation_branch.assert_called_once()

    def test_both_caps_zero_disables_splitting(self, tmp_path: pathlib.Path) -> None:
        """Caps set to 0 disable splitting even with large diffs."""
        spec = self._make_spec(tmp_path, "# Feature\n\n## Phase 1\n\n- [ ] Task A\n- [ ] Task B\n")
        engine = self._mock_engine()
        git = self._mock_git()
        git.get_pr_diff_loc.return_value = 999_999
        git.get_pr_commit_count.return_value = 999_999

        orch = V2Orchestrator(tmp_path, git, engine, max_commits_per_pr=0, max_loc_per_pr=0)
        orch.run(specs=[spec], push_pr=True)

        git.create_continuation_branch.assert_not_called()
        # get_pr_diff_loc / get_pr_commit_count must not even be polled when caps are 0
        git.get_pr_diff_loc.assert_not_called()
        git.get_pr_commit_count.assert_not_called()

    def test_commit_cap_takes_precedence_over_loc_cap(self, tmp_path: pathlib.Path) -> None:
        """When both caps would trigger, commit cap fires first (only one split per chunk)."""
        spec = self._make_spec(tmp_path, "# Feature\n\n## Phase 1\n\n- [ ] Task A\n- [ ] Task B\n")
        engine = self._mock_engine()
        git = self._mock_git()
        git.get_pr_commit_count.return_value = 8
        git.get_pr_diff_loc.return_value = 500

        orch = V2Orchestrator(tmp_path, git, engine, max_commits_per_pr=8, max_loc_per_pr=400)
        orch.run(specs=[spec], push_pr=True)

        # Exactly one split (not two — commit cap short-circuits LOC check)
        git.create_continuation_branch.assert_called_once()
        # LOC check should not have been polled on the chunk that split via commits
        assert git.get_pr_diff_loc.call_count == 0


class TestIdempotentResume:
    """spec v30 Step 2: persistent chunk-status ledger drives skip-on-resume."""

    def _make_spec(self, tmp_path: pathlib.Path, content: str) -> pathlib.Path:
        spec_dir = tmp_path / "docs" / "specs"
        spec_dir.mkdir(parents=True, exist_ok=True)
        spec = spec_dir / "01_feature.md"
        spec.write_text(content, encoding="utf-8")
        return spec

    def _mock_engine(self):
        engine = mock.MagicMock()
        engine.name = "mock-engine"
        engine.execute_chunk.return_value = ChunkResult(
            success=True, files_modified=[pathlib.Path("src/a.py")], message="done"
        )
        engine.verify_chunk.return_value = ChunkResult(success=True, message="passed")
        engine.fix_chunk.return_value = ChunkResult(success=True, message="fixed")
        return engine

    def _mock_git(self):
        git = mock.MagicMock()
        git.assert_safe_branch = mock.MagicMock()
        git.push_to_origin.return_value = mock.MagicMock(success=True, error_type=None, message="")
        git.commit_chunk.return_value = mock.MagicMock(success=True, sha="abc1234", message="ok")
        git.get_pr_commit_count.return_value = 0
        git.get_pr_diff_loc.return_value = 0
        git.ensure_draft_pr_exists.return_value = 42
        git.revert_chunk_changes.return_value = True
        git.repo_path = pathlib.Path("/tmp/repo")
        return git

    def test_merged_chunk_skipped(self, tmp_path: pathlib.Path) -> None:
        """A chunk previously marked 'merged' in the ledger is not re-executed."""
        import json

        spec = self._make_spec(tmp_path, "# Feature\n\n## Phase 1\n\n- [ ] Task A\n- [ ] Task B\n")
        engine = self._mock_engine()
        git = self._mock_git()
        orch = V2Orchestrator(tmp_path, git, engine)
        ledger_path = orch._ledger_path(spec)
        ledger_path.parent.mkdir(parents=True, exist_ok=True)
        ledger_path.write_text(
            json.dumps(
                {
                    "chunks": {
                        "spec-01-chunk-01": {
                            "status": "merged",
                            "title": "Task A",
                            "updated_at": "2026-05-04T00:00:00Z",
                        }
                    }
                }
            )
        )

        orch.run(specs=[spec], push_pr=False)
        # Only chunk 02 should have been executed.
        assert engine.execute_chunk.call_count == 1

    def test_full_ledger_executes_no_chunks(self, tmp_path: pathlib.Path) -> None:
        import json

        spec = self._make_spec(tmp_path, "# Feature\n\n## Phase 1\n\n- [ ] Task A\n")
        engine = self._mock_engine()
        git = self._mock_git()
        orch = V2Orchestrator(tmp_path, git, engine)
        ledger_path = orch._ledger_path(spec)
        ledger_path.parent.mkdir(parents=True, exist_ok=True)
        ledger_path.write_text(
            json.dumps(
                {
                    "chunks": {
                        "spec-01-chunk-01": {"status": "merged", "title": "Task A"},
                    }
                }
            )
        )

        orch.run(specs=[spec], push_pr=False)
        engine.execute_chunk.assert_not_called()

    def test_no_resume_ignores_ledger(self, tmp_path: pathlib.Path) -> None:
        import json

        spec = self._make_spec(tmp_path, "# Feature\n\n## Phase 1\n\n- [ ] Task A\n")
        engine = self._mock_engine()
        git = self._mock_git()
        orch = V2Orchestrator(tmp_path, git, engine, no_resume=True)
        ledger_path = orch._ledger_path(spec)
        ledger_path.parent.mkdir(parents=True, exist_ok=True)
        ledger_path.write_text(
            json.dumps(
                {
                    "chunks": {
                        "spec-01-chunk-01": {"status": "merged", "title": "Task A"},
                    }
                }
            )
        )

        orch.run(specs=[spec], push_pr=False)
        engine.execute_chunk.assert_called_once()

    def test_successful_run_writes_merged_status(self, tmp_path: pathlib.Path) -> None:
        import json

        spec = self._make_spec(tmp_path, "# Feature\n\n## Phase 1\n\n- [ ] Task A\n")
        engine = self._mock_engine()
        git = self._mock_git()
        orch = V2Orchestrator(tmp_path, git, engine)

        orch.run(specs=[spec], push_pr=False)
        ledger = json.loads(orch._ledger_path(spec).read_text())
        merged = [entry for entry in ledger["chunks"].values() if entry["status"] == "merged"]
        assert len(merged) == 1


class TestEngineFallback:
    """spec v30 Step 5: Claude rate-limit fails over to the next engine in the list."""

    def _make_spec(self, tmp_path: pathlib.Path, content: str) -> pathlib.Path:
        spec_dir = tmp_path / "docs" / "specs"
        spec_dir.mkdir(parents=True, exist_ok=True)
        spec = spec_dir / "01_feature.md"
        spec.write_text(content, encoding="utf-8")
        return spec

    def _mock_git(self):
        git = mock.MagicMock()
        git.assert_safe_branch = mock.MagicMock()
        git.push_to_origin.return_value = mock.MagicMock(success=True, error_type=None, message="")
        git.commit_chunk.return_value = mock.MagicMock(success=True, sha="abc1234", message="ok")
        git.get_pr_commit_count.return_value = 0
        git.get_pr_diff_loc.return_value = 0
        git.ensure_draft_pr_exists.return_value = 42
        git.revert_chunk_changes.return_value = True
        git.repo_path = pathlib.Path("/tmp/repo")
        return git

    def _engine(self, name: str, *, success: bool = True, rate_limit: bool = False) -> mock.MagicMock:
        eng = mock.MagicMock()
        eng.name = name
        if rate_limit:
            eng.execute_chunk.return_value = ChunkResult(success=False, files_modified=[], message="Rate limited")
        else:
            eng.execute_chunk.return_value = ChunkResult(
                success=success,
                files_modified=[pathlib.Path("src/a.py")] if success else [],
                message="ok" if success else "err",
            )
        eng.verify_chunk.return_value = ChunkResult(success=True, message="passed")
        eng.fix_chunk.return_value = ChunkResult(success=True, message="fixed")
        return eng

    def test_primary_rate_limit_fails_over(self, tmp_path: pathlib.Path) -> None:
        spec = self._make_spec(tmp_path, "# Spec\n\n## P1\n\n- [ ] Task A\n")
        primary = self._engine("claude", rate_limit=True)
        secondary = self._engine("huggingface", success=True)
        git = self._mock_git()

        orch = V2Orchestrator(tmp_path, git, primary, engines=[primary, secondary])
        result = orch.run(specs=[spec], push_pr=False)

        assert primary.execute_chunk.call_count == 1
        assert secondary.execute_chunk.call_count == 1
        assert result.success is True

    def test_both_rate_limit_aborts(self, tmp_path: pathlib.Path) -> None:
        spec = self._make_spec(tmp_path, "# Spec\n\n## P1\n\n- [ ] Task A\n")
        primary = self._engine("claude", rate_limit=True)
        secondary = self._engine("huggingface", rate_limit=True)
        git = self._mock_git()

        orch = V2Orchestrator(tmp_path, git, primary, engines=[primary, secondary])
        result = orch.run(specs=[spec], push_pr=False)

        assert primary.execute_chunk.call_count == 1
        assert secondary.execute_chunk.call_count == 1
        assert result.success is False

    def test_no_engines_arg_keeps_legacy_single_engine_behavior(self, tmp_path: pathlib.Path) -> None:
        spec = self._make_spec(tmp_path, "# Spec\n\n## P1\n\n- [ ] Task A\n")
        eng = self._engine("claude", success=True)
        git = self._mock_git()

        orch = V2Orchestrator(tmp_path, git, eng)  # no engines kwarg
        orch.run(specs=[spec], push_pr=False)
        assert eng.execute_chunk.call_count == 1
