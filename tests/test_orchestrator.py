"""Tests for the Orchestrator build loop, finding triage, and fix prompt."""

from __future__ import annotations

import json
import logging
import pathlib
import subprocess
import threading
from unittest import mock

import pytest

from codelicious.orchestrator import (
    Finding,
    Orchestrator,
    OrchestratorResult,
    _abort_merge,
    _collect_review_findings,
    _commit_worktree_changes,
    _create_worktree,
    _merge_worktree_branch,
    _render_fix_prompt,
    _triage_findings,
)


# ---------------------------------------------------------------------------
# Finding triage
# ---------------------------------------------------------------------------


class TestTriageFindings:
    """Tests for severity-based sorting and deduplication."""

    def test_sorts_by_severity(self):
        findings = [
            Finding(role="qa", severity="P3", file="a.py", line=1, title="minor", description="", fix=""),
            Finding(role="sec", severity="P1", file="b.py", line=2, title="critical", description="", fix=""),
            Finding(role="perf", severity="P2", file="c.py", line=3, title="medium", description="", fix=""),
        ]
        result = _triage_findings(findings)
        assert [f.severity for f in result] == ["P1", "P2", "P3"]

    def test_deduplicates_by_file_line(self):
        findings = [
            Finding(role="qa", severity="P2", file="a.py", line=10, title="first", description="", fix=""),
            Finding(role="sec", severity="P1", file="a.py", line=10, title="second", description="", fix=""),
        ]
        result = _triage_findings(findings)
        # P1 sorts first, so the P1 finding wins the dedup
        assert len(result) == 1
        assert result[0].severity == "P1"

    def test_empty_list(self):
        assert _triage_findings([]) == []


# ---------------------------------------------------------------------------
# Review findings collection
# ---------------------------------------------------------------------------


class TestCollectReviewFindings:
    """Tests for parsing JSON review files."""

    def test_reads_valid_json(self, tmp_path: pathlib.Path):
        review_file = tmp_path / ".codelicious" / "review_security.json"
        review_file.parent.mkdir(parents=True)
        review_file.write_text(
            json.dumps(
                [
                    {
                        "severity": "P1",
                        "file": "x.py",
                        "line": 5,
                        "title": "issue",
                        "description": "desc",
                        "fix": "fix",
                    },
                ]
            )
        )
        findings = _collect_review_findings(tmp_path, "security")
        assert len(findings) == 1
        assert findings[0].severity == "P1"
        assert findings[0].role == "security"

    def test_missing_file_returns_empty(self, tmp_path: pathlib.Path):
        assert _collect_review_findings(tmp_path, "nonexistent") == []

    def test_malformed_json_returns_empty(self, tmp_path: pathlib.Path):
        review_file = tmp_path / ".codelicious" / "review_qa.json"
        review_file.parent.mkdir(parents=True)
        review_file.write_text("not json")
        assert _collect_review_findings(tmp_path, "qa") == []

    def test_non_array_json_returns_empty(self, tmp_path: pathlib.Path):
        review_file = tmp_path / ".codelicious" / "review_qa.json"
        review_file.parent.mkdir(parents=True)
        review_file.write_text(json.dumps({"not": "an array"}))
        assert _collect_review_findings(tmp_path, "qa") == []


# ---------------------------------------------------------------------------
# Fix prompt rendering
# ---------------------------------------------------------------------------


class TestRenderFixPrompt:
    """Tests for the fix prompt template."""

    def test_includes_no_git_warning(self):
        prompt = _render_fix_prompt("myproject", [])
        assert "Do NOT run git" in prompt
        assert "git add" in prompt and "git commit" in prompt

    def test_includes_findings(self):
        findings = [
            Finding(role="sec", severity="P1", file="a.py", line=10, title="XSS", description="bad", fix="escape"),
        ]
        prompt = _render_fix_prompt("myproject", findings)
        assert "XSS" in prompt
        assert "a.py:10" in prompt
        assert "P1" in prompt

    def test_no_findings(self):
        prompt = _render_fix_prompt("myproject", [])
        assert "No findings to fix" in prompt


# ---------------------------------------------------------------------------
# Orchestrator build loop
# ---------------------------------------------------------------------------


class TestOrchestratorRun:
    """Tests for the orchestrator's build→merge→review→fix loop."""

    @pytest.fixture
    def mock_git_manager(self):
        mgr = mock.MagicMock()
        mgr.commit_verified_changes.return_value = None
        mgr.push_to_origin.return_value = True
        mgr.ensure_draft_pr_exists.return_value = None
        return mgr

    @pytest.fixture
    def mock_config(self):
        class C:
            model = ""
            effort = ""
            max_turns = 0
            agent_timeout_s = 30
            dry_run = True

        return C()

    def test_all_specs_already_complete(self, tmp_path: pathlib.Path, mock_git_manager, mock_config):
        """When all specs are already complete, the loop exits immediately with no builds."""
        spec = tmp_path / "spec.md"
        spec.write_text("- [x] done\n- [x] also done\n")

        orch = Orchestrator(tmp_path, mock_git_manager, mock_config)

        # Mock _phase_review and _phase_fix to avoid running actual agents
        with mock.patch.object(orch, "_phase_review", return_value=[]):
            with mock.patch.object(orch, "_phase_fix", return_value=True):
                result = orch.run(specs=[spec], reviewers=[], max_build_cycles=5)

        assert result.success is True
        assert result.cycles_completed == 0

    def test_consecutive_failures_abort(self, tmp_path: pathlib.Path, mock_git_manager, mock_config):
        """3 consecutive build failures cause the loop to abort."""
        spec = tmp_path / "spec.md"
        spec.write_text("- [ ] never built\n")

        orch = Orchestrator(tmp_path, mock_git_manager, mock_config)

        # Mock _phase_build to always fail
        with mock.patch.object(orch, "_phase_build", return_value=[("branch", False)]):
            with mock.patch.object(orch, "_phase_review", return_value=[]):
                with mock.patch.object(orch, "_phase_fix", return_value=True):
                    with mock.patch(
                        "codelicious.prompts.scan_remaining_tasks_for_spec",
                        return_value=1,
                    ):
                        result = orch.run(specs=[spec], reviewers=[], max_build_cycles=10)

        assert result.success is False
        assert result.cycles_completed == 3  # aborted after 3

    def test_empty_specs_list(self, tmp_path: pathlib.Path, mock_git_manager, mock_config):
        """Empty specs list should complete immediately."""
        orch = Orchestrator(tmp_path, mock_git_manager, mock_config)

        with mock.patch.object(orch, "_phase_review", return_value=[]):
            with mock.patch.object(orch, "_phase_fix", return_value=True):
                result = orch.run(specs=[], reviewers=[], max_build_cycles=5)

        assert result.success is True
        assert result.cycles_completed == 0

    def test_build_without_build_complete_reports_failure(self, tmp_path: pathlib.Path, mock_git_manager, mock_config):
        """Agent exits cleanly but doesn't write BUILD_COMPLETE → build fails."""
        spec = tmp_path / "spec.md"
        spec.write_text("- [ ] not built\n")

        orch = Orchestrator(tmp_path, mock_git_manager, mock_config)

        # Mock _build_spec_in_worktree to simulate agent that exits ok but
        # never writes BUILD_COMPLETE (the old bug behavior).
        # Instead, test the actual logic by mocking _run_agent and worktree ops.
        mock_result = mock.MagicMock(success=True)  # process exited ok

        with mock.patch.object(orch, "_run_agent", return_value=mock_result):
            with mock.patch("codelicious.orchestrator._create_worktree", return_value=tmp_path / "wt"):
                with mock.patch("codelicious.orchestrator._remove_worktree"):
                    with mock.patch("codelicious.orchestrator._commit_worktree_changes", return_value=True):
                        # Create worktree dir but NO BUILD_COMPLETE file
                        wt = tmp_path / "wt"
                        wt.mkdir()
                        (wt / ".codelicious").mkdir()
                        # Copy spec into worktree
                        (wt / "spec.md").write_text("- [ ] not built\n")

                        branch, success = orch._build_spec_in_worktree(spec)

        # Agent exited ok, but no BUILD_COMPLETE → should be False
        assert success is False

    def test_spec_becomes_complete_after_build(self, tmp_path: pathlib.Path, mock_git_manager, mock_config):
        """Build loop exits when the spec becomes complete after a build cycle."""
        spec = tmp_path / "spec.md"
        spec.write_text("- [ ] build me\n")

        orch = Orchestrator(tmp_path, mock_git_manager, mock_config)

        def fake_build(specs, workers):
            # Simulate the agent checking off the task
            spec.write_text("- [x] build me\n")
            return [("codelicious/spec", True)]

        with mock.patch.object(orch, "_phase_build", side_effect=fake_build):
            with mock.patch.object(orch, "_phase_merge", return_value=1):
                with mock.patch.object(orch, "_phase_review", return_value=[]):
                    with mock.patch.object(orch, "_phase_fix", return_value=True):
                        result = orch.run(specs=[spec], reviewers=[], max_build_cycles=10)

        assert result.success is True
        # Build ran once, then the loop detected completion on the next iteration
        assert result.cycles_completed == 1
        # Verify push was called (mid-cycle + final = at least 2 calls)
        assert mock_git_manager.push_to_origin.call_count >= 2


class TestPhaseBuildConcurrentCounter:
    """Tests that _phase_build's completed_count is updated correctly under concurrency."""

    @pytest.fixture
    def orch(self, tmp_path: pathlib.Path):
        git_manager = mock.MagicMock()
        git_manager.push_to_origin.return_value = True

        class C:
            model = ""
            effort = ""
            max_turns = 0
            agent_timeout_s = 30
            dry_run = True

        return Orchestrator(tmp_path, git_manager, C())

    def test_all_successes_counted(self, tmp_path: pathlib.Path, orch: Orchestrator):
        """All successful futures must be counted exactly once each."""
        specs = [tmp_path / f"spec_{i}.md" for i in range(8)]
        for s in specs:
            s.write_text("")

        # Mock _build_spec_in_worktree to return (branch, True) after a brief pause
        # so futures resolve with genuine overlap.
        barrier = threading.Barrier(len(specs))

        def fake_build(spec: pathlib.Path):
            barrier.wait(timeout=5)
            return (f"codelicious/build-{spec.stem}", True)

        with mock.patch.object(orch, "_build_spec_in_worktree", side_effect=fake_build):
            results = orch._phase_build(specs, max_workers=len(specs))

        assert len(results) == len(specs)
        assert all(ok for _, ok in results)

    def test_exception_futures_counted(self, tmp_path: pathlib.Path, orch: Orchestrator):
        """Futures that raise must be counted, not silently dropped."""
        specs = [tmp_path / f"spec_{i}.md" for i in range(4)]
        for s in specs:
            s.write_text("")

        barrier = threading.Barrier(len(specs))

        def fake_build_raises(spec: pathlib.Path):
            barrier.wait(timeout=5)
            raise RuntimeError("worker exploded")

        with mock.patch.object(orch, "_build_spec_in_worktree", side_effect=fake_build_raises):
            results = orch._phase_build(specs, max_workers=len(specs))

        # All specs should still produce a result entry (failed)
        assert len(results) == len(specs)
        assert all(not ok for _, ok in results)

    def test_mixed_success_and_failure_counted(self, tmp_path: pathlib.Path, orch: Orchestrator):
        """A mix of successes and exceptions must all be counted exactly once."""
        specs = [tmp_path / f"spec_{i}.md" for i in range(6)]
        for s in specs:
            s.write_text("")

        barrier = threading.Barrier(len(specs))

        def fake_build_mixed(spec: pathlib.Path):
            barrier.wait(timeout=5)
            idx = int(spec.stem.rsplit("_", 1)[-1])
            if idx % 2 == 0:
                raise RuntimeError("even spec fails")
            return (f"codelicious/build-{spec.stem}", True)

        with mock.patch.object(orch, "_build_spec_in_worktree", side_effect=fake_build_mixed):
            results = orch._phase_build(specs, max_workers=len(specs))

        assert len(results) == len(specs)
        successes = [ok for _, ok in results if ok]
        failures = [ok for _, ok in results if not ok]
        assert len(successes) == 3
        assert len(failures) == 3


# ---------------------------------------------------------------------------
# Finding 7 — _commit_worktree_changes
# ---------------------------------------------------------------------------


class TestCommitWorktreeChanges:
    """Tests for _commit_worktree_changes error paths."""

    def test_staging_timeout_returns_false(self, tmp_path: pathlib.Path):
        """A timeout while staging all files returns False."""
        with mock.patch(
            "codelicious.orchestrator.subprocess.run",
            side_effect=subprocess.TimeoutExpired(cmd="git add", timeout=120),
        ):
            result = _commit_worktree_changes(tmp_path, "spec.md")
        assert result is False

    def test_diff_check_timeout_returns_false(self, tmp_path: pathlib.Path):
        """A timeout on the diff --cached check returns False."""
        add_ok = mock.MagicMock(returncode=0)

        def _fake_run(cmd, **kwargs):
            if "add" in cmd:
                return add_ok
            # diff --cached
            raise subprocess.TimeoutExpired(cmd=cmd, timeout=120)

        with mock.patch("codelicious.orchestrator.subprocess.run", side_effect=_fake_run):
            result = _commit_worktree_changes(tmp_path, "spec.md")
        assert result is False

    def test_clean_worktree_returns_false(self, tmp_path: pathlib.Path):
        """When diff --cached exits 0 (nothing staged), returns False without committing."""
        add_ok = mock.MagicMock(returncode=0)
        diff_clean = mock.MagicMock(returncode=0)  # 0 = no staged changes

        def _fake_run(cmd, **kwargs):
            if "add" in cmd:
                return add_ok
            return diff_clean

        with mock.patch("codelicious.orchestrator.subprocess.run", side_effect=_fake_run):
            result = _commit_worktree_changes(tmp_path, "spec.md")
        assert result is False

    def test_gpg_failure_falls_back_to_no_gpg_sign(self, tmp_path: pathlib.Path):
        """A GPG-related commit failure triggers a --no-gpg-sign retry."""
        add_ok = mock.MagicMock(returncode=0)
        diff_dirty = mock.MagicMock(returncode=1)  # 1 = staged changes exist
        gpg_fail = mock.MagicMock(returncode=1, stderr="error: gpg failed to sign the data")
        unsigned_ok = mock.MagicMock(returncode=0)

        calls = iter([add_ok, diff_dirty, gpg_fail, unsigned_ok])

        with mock.patch("codelicious.orchestrator.subprocess.run", side_effect=lambda *a, **kw: next(calls)):
            result = _commit_worktree_changes(tmp_path, "spec.md")
        assert result is True

    def test_unsigned_commit_timeout_returns_false(self, tmp_path: pathlib.Path):
        """Timeout on the --no-gpg-sign fallback commit returns False."""
        add_ok = mock.MagicMock(returncode=0)
        diff_dirty = mock.MagicMock(returncode=1)
        gpg_fail = mock.MagicMock(returncode=1, stderr="gpg signing failed: secret key not available")

        def _fake_run(cmd, **kwargs):
            if "add" in cmd:
                return add_ok
            if "diff" in cmd:
                return diff_dirty
            if "--no-gpg-sign" in cmd:
                raise subprocess.TimeoutExpired(cmd=cmd, timeout=120)
            # First commit attempt (no --no-gpg-sign yet)
            return gpg_fail

        with mock.patch("codelicious.orchestrator.subprocess.run", side_effect=_fake_run):
            result = _commit_worktree_changes(tmp_path, "spec.md")
        assert result is False


# ---------------------------------------------------------------------------
# Finding 8 — data-loss guard: commit fails after successful build
# ---------------------------------------------------------------------------


class TestDataLossGuard:
    """When commit fails after a successful build the worktree must be preserved."""

    @pytest.fixture
    def orch(self, tmp_path: pathlib.Path):
        git_manager = mock.MagicMock()

        class C:
            model = ""
            effort = ""
            max_turns = 0
            agent_timeout_s = 30
            dry_run = True

        return Orchestrator(tmp_path, git_manager, C())

    def test_commit_failure_after_success_returns_false(self, tmp_path: pathlib.Path, orch: Orchestrator):
        """If _commit_worktree_changes returns False after a successful build, success is False."""
        spec = tmp_path / "spec.md"
        spec.write_text("- [ ] a task\n")

        worktree = tmp_path / "wt"
        worktree.mkdir()
        (worktree / ".codelicious").mkdir()
        (worktree / "spec.md").write_text("- [x] a task\n")
        # Write BUILD_COMPLETE so agent_done is True
        (worktree / ".codelicious" / "BUILD_COMPLETE").write_text("DONE")

        mock_result = mock.MagicMock(success=True)

        remove_worktree = mock.MagicMock()

        with mock.patch.object(orch, "_run_agent", return_value=mock_result):
            with mock.patch("codelicious.orchestrator._create_worktree", return_value=worktree):
                with mock.patch("codelicious.orchestrator._remove_worktree", remove_worktree):
                    with mock.patch("codelicious.orchestrator._commit_worktree_changes", return_value=False):
                        _, success = orch._build_spec_in_worktree(spec)

        assert success is False
        # Worktree must be preserved (not removed) to prevent data loss
        remove_worktree.assert_not_called()


# ---------------------------------------------------------------------------
# Finding 9 — _create_worktree
# ---------------------------------------------------------------------------


class TestCreateWorktree:
    """Tests for _create_worktree error and fallback paths."""

    def test_branch_exists_uses_fallback(self, tmp_path: pathlib.Path):
        """When the first worktree add fails (branch exists), the fallback without -b succeeds."""
        fail = mock.MagicMock(returncode=1, stderr="already exists")
        success = mock.MagicMock(returncode=0)

        # Call order: optional stale-remove (skipped — dir doesn't exist yet),
        # first add (-b), fallback add (no -b)
        responses = iter([fail, success])

        with mock.patch("codelicious.orchestrator.subprocess.run", side_effect=lambda *a, **kw: next(responses)):
            result = _create_worktree(tmp_path, "codelicious/test-branch")
        # Should return the expected worktree path without raising
        assert result == tmp_path / ".codelicious" / "worktrees" / "codelicious/test-branch"

    def test_first_add_timeout_raises_runtime_error(self, tmp_path: pathlib.Path):
        """A timeout on the primary worktree add raises RuntimeError."""

        def _fake_run(cmd, **kwargs):
            if "add" in cmd and "-b" in cmd:
                raise subprocess.TimeoutExpired(cmd=cmd, timeout=120)
            return mock.MagicMock(returncode=0)

        with mock.patch("codelicious.orchestrator.subprocess.run", side_effect=_fake_run):
            with pytest.raises(RuntimeError, match="Timed out creating worktree"):
                _create_worktree(tmp_path, "codelicious/test-branch")


# ---------------------------------------------------------------------------
# Finding 10 — _abort_merge
# ---------------------------------------------------------------------------


class TestAbortMerge:
    """Tests for _abort_merge error and timeout paths."""

    def test_non_zero_abort_logs_critical(self, tmp_path: pathlib.Path, caplog):
        """When git merge --abort returns non-zero, a CRITICAL message is logged."""
        fail = mock.MagicMock(returncode=1, stderr="nothing to abort")

        with mock.patch("codelicious.orchestrator.subprocess.run", return_value=fail):
            with caplog.at_level("CRITICAL", logger="codelicious.orchestrator"):
                _abort_merge(tmp_path)

        assert any("abort failed" in r.message.lower() for r in caplog.records)

    def test_timeout_logs_critical_dirty_state(self, tmp_path: pathlib.Path, caplog):
        """A timeout on git merge --abort logs a CRITICAL warning about dirty state."""
        with mock.patch(
            "codelicious.orchestrator.subprocess.run",
            side_effect=subprocess.TimeoutExpired(cmd="git merge", timeout=30),
        ):
            with caplog.at_level("CRITICAL", logger="codelicious.orchestrator"):
                _abort_merge(tmp_path)

        assert any("dirty state" in r.message.lower() for r in caplog.records)


# ---------------------------------------------------------------------------
# Finding 11 — _merge_worktree_branch
# ---------------------------------------------------------------------------


class TestMergeWorktreeBranch:
    """Tests for _merge_worktree_branch success, conflict and timeout paths."""

    def test_successful_merge_returns_true(self, tmp_path: pathlib.Path):
        """A zero-returncode merge returns True."""
        ok = mock.MagicMock(returncode=0)
        with mock.patch("codelicious.orchestrator.subprocess.run", return_value=ok):
            result = _merge_worktree_branch(tmp_path, "codelicious/feat")
        assert result is True

    def test_merge_conflict_calls_abort_and_returns_false(self, tmp_path: pathlib.Path):
        """A non-zero merge result calls _abort_merge and returns False."""
        conflict = mock.MagicMock(returncode=1, stderr="CONFLICT")

        with mock.patch("codelicious.orchestrator.subprocess.run", return_value=conflict):
            with mock.patch("codelicious.orchestrator._abort_merge") as mock_abort:
                result = _merge_worktree_branch(tmp_path, "codelicious/feat")

        assert result is False
        mock_abort.assert_called_once_with(tmp_path)

    def test_timeout_calls_abort_and_returns_false(self, tmp_path: pathlib.Path):
        """A timeout on git merge calls _abort_merge and returns False."""
        with mock.patch(
            "codelicious.orchestrator.subprocess.run",
            side_effect=subprocess.TimeoutExpired(cmd="git merge", timeout=120),
        ):
            with mock.patch("codelicious.orchestrator._abort_merge") as mock_abort:
                result = _merge_worktree_branch(tmp_path, "codelicious/feat")

        assert result is False
        mock_abort.assert_called_once_with(tmp_path)


# ---------------------------------------------------------------------------
# Finding 12 — Orchestrator.run() loop edge cases
# ---------------------------------------------------------------------------


class TestOrchestratorRunLoop:
    """Tests for loop-abort logic and commit-failure tolerance in run()."""

    @pytest.fixture
    def mock_git_manager(self):
        mgr = mock.MagicMock()
        mgr.commit_verified_changes.return_value = None
        mgr.push_to_origin.return_value = True
        mgr.ensure_draft_pr_exists.return_value = None
        return mgr

    @pytest.fixture
    def mock_config(self):
        class C:
            model = ""
            effort = ""
            max_turns = 0
            agent_timeout_s = 30
            dry_run = True

        return C()

    def test_zero_progress_for_three_cycles_aborts(self, tmp_path: pathlib.Path, mock_git_manager, mock_config):
        """_phase_build returning all failures for 3 consecutive cycles aborts the loop."""
        spec = tmp_path / "spec.md"
        spec.write_text("- [ ] never built\n")

        orch = Orchestrator(tmp_path, mock_git_manager, mock_config)

        with mock.patch.object(orch, "_phase_build", return_value=[("codelicious/spec", False)]):
            with mock.patch.object(orch, "_phase_review", return_value=[]):
                with mock.patch.object(orch, "_phase_fix", return_value=True):
                    with mock.patch(
                        "codelicious.prompts.scan_remaining_tasks_for_spec",
                        return_value=1,
                    ):
                        result = orch.run(specs=[spec], reviewers=[], max_build_cycles=10)

        assert result.success is False
        assert result.cycles_completed == 3

    def test_commit_raises_does_not_crash_run(self, tmp_path: pathlib.Path, mock_git_manager, mock_config):
        """An exception from commit_verified_changes must not propagate out of run()."""
        spec = tmp_path / "spec.md"
        spec.write_text("- [x] already done\n")

        mock_git_manager.commit_verified_changes.side_effect = RuntimeError("disk full")

        orch = Orchestrator(tmp_path, mock_git_manager, mock_config)

        with mock.patch.object(orch, "_phase_review", return_value=[]):
            with mock.patch.object(orch, "_phase_fix", return_value=True):
                result = orch.run(specs=[spec], reviewers=[], max_build_cycles=5)

        # run() must still return a valid OrchestratorResult regardless of commit errors
        assert isinstance(result, OrchestratorResult)


# ---------------------------------------------------------------------------
# Finding 13 — spec-not-in-worktree fallback
# ---------------------------------------------------------------------------


class TestSpecNotInWorktreeFallback:
    """Tests for the fallback prompt when a spec path is outside the worktree."""

    @pytest.fixture
    def orch(self, tmp_path: pathlib.Path):
        git_manager = mock.MagicMock()

        class C:
            model = ""
            effort = ""
            max_turns = 0
            agent_timeout_s = 30
            dry_run = True

        return Orchestrator(tmp_path, git_manager, C())

    def test_spec_outside_repo_logs_warning_and_uses_fallback(self, tmp_path: pathlib.Path, orch: Orchestrator, caplog):
        """A spec path not under repo_path logs a warning and uses the filename as fallback."""
        # Create a spec outside the repo (different tmp directory)
        outside_dir = tmp_path / "outside"
        outside_dir.mkdir()
        spec = outside_dir / "myspec.md"
        spec.write_text("- [ ] build task\n")

        # Use a completely different repo_path so spec is definitely outside it
        other_repo = tmp_path / "repo"
        other_repo.mkdir()
        orch.repo_path = other_repo

        worktree = tmp_path / "wt"
        worktree.mkdir()
        (worktree / ".codelicious").mkdir()

        captured_prompts: list[str] = []

        def fake_run_agent(prompt, project_root, session_id=""):
            captured_prompts.append(prompt)
            return mock.MagicMock(success=False)

        with mock.patch.object(orch, "_run_agent", side_effect=fake_run_agent):
            with mock.patch("codelicious.orchestrator._create_worktree", return_value=worktree):
                with mock.patch("codelicious.orchestrator._remove_worktree"):
                    with mock.patch("codelicious.orchestrator._commit_worktree_changes", return_value=False):
                        with caplog.at_level("WARNING", logger="codelicious.orchestrator"):
                            orch._build_spec_in_worktree(spec)

        warning_messages = [r.message for r in caplog.records if r.levelname == "WARNING"]
        assert any("not under repo" in m for m in warning_messages)
        # The agent should have been called with the filename-based fallback path
        assert len(captured_prompts) == 1
        assert "myspec.md" in captured_prompts[0]

    def test_spec_missing_in_worktree_uses_fallback_prompt(self, tmp_path: pathlib.Path, orch: Orchestrator, caplog):
        """When the resolved spec path doesn't exist in the worktree, the agent gets a fallback prompt."""
        spec = tmp_path / "docs" / "spec_missing.md"
        spec.parent.mkdir(parents=True, exist_ok=True)
        spec.write_text("- [ ] build task\n")

        worktree = tmp_path / "wt"
        worktree.mkdir()
        (worktree / ".codelicious").mkdir()
        # Intentionally do NOT create worktree / "docs" / "spec_missing.md"

        captured_prompts: list[str] = []

        def fake_run_agent(prompt, project_root, session_id=""):
            captured_prompts.append(prompt)
            return mock.MagicMock(success=False)

        with mock.patch.object(orch, "_run_agent", side_effect=fake_run_agent):
            with mock.patch("codelicious.orchestrator._create_worktree", return_value=worktree):
                with mock.patch("codelicious.orchestrator._remove_worktree"):
                    with mock.patch("codelicious.orchestrator._commit_worktree_changes", return_value=False):
                        with caplog.at_level("WARNING", logger="codelicious.orchestrator"):
                            orch._build_spec_in_worktree(spec)

        warning_messages = [r.message for r in caplog.records if r.levelname == "WARNING"]
        assert any("not found in worktree" in m for m in warning_messages)
        assert len(captured_prompts) == 1
        assert "spec_missing.md" in captured_prompts[0]


# ---------------------------------------------------------------------------
# Finding 68 — _phase_build parallel error path
# ---------------------------------------------------------------------------


class TestPhaseBuildParallelErrorPath:
    """Tests that _phase_build catches exceptions from one worker while
    allowing the rest to succeed, and that the failed spec produces a
    (branch, False) result."""

    @pytest.fixture
    def orch(self, tmp_path: pathlib.Path) -> Orchestrator:
        git_manager = mock.MagicMock()
        git_manager.push_to_origin.return_value = True

        class C:
            model = ""
            effort = ""
            max_turns = 0
            agent_timeout_s = 30
            dry_run = True

        return Orchestrator(tmp_path, git_manager, C())

    def test_one_worker_raises_caught_logged_and_false_returned(
        self, tmp_path: pathlib.Path, orch: Orchestrator, caplog
    ):
        """When one future raises, the exception must be caught, an error
        logged, and (branch, False) returned for that spec while the other
        spec's success result is preserved."""
        spec_ok = tmp_path / "spec_ok.md"
        spec_fail = tmp_path / "spec_fail.md"
        spec_ok.write_text("")
        spec_fail.write_text("")

        barrier = threading.Barrier(2)

        def fake_build(spec: pathlib.Path) -> tuple[str, bool]:
            barrier.wait(timeout=5)
            if spec == spec_fail:
                raise RuntimeError("worker exploded")
            return (f"codelicious/build-{spec.stem}", True)

        with mock.patch.object(orch, "_build_spec_in_worktree", side_effect=fake_build):
            with caplog.at_level("ERROR", logger="codelicious.orchestrator"):
                results = orch._phase_build([spec_ok, spec_fail], max_workers=2)

        assert len(results) == 2
        # The failing spec must produce (branch, False)
        fail_results = [(b, ok) for b, ok in results if not ok]
        assert len(fail_results) == 1
        # The failing branch name is derived from spec.stem
        assert "spec_fail" in fail_results[0][0]
        # The success spec must still produce (branch, True)
        ok_results = [(b, ok) for b, ok in results if ok]
        assert len(ok_results) == 1
        # An error must have been logged for the exception
        error_msgs = [r.message for r in caplog.records if r.levelno >= logging.ERROR]
        assert any("worker exploded" in m or "spec_fail" in m for m in error_msgs)


# ---------------------------------------------------------------------------
# Finding 69 — _phase_merge
# ---------------------------------------------------------------------------


class TestPhaseMerge:
    """Tests for _phase_merge success, conflict, and all-failures paths."""

    @pytest.fixture
    def orch(self, tmp_path: pathlib.Path) -> Orchestrator:
        git_manager = mock.MagicMock()

        class C:
            model = ""
            effort = ""
            max_turns = 0
            agent_timeout_s = 30
            dry_run = True

        return Orchestrator(tmp_path, git_manager, C())

    def test_all_failures_returns_zero_merged(self, orch: Orchestrator):
        """When every build result is False, _phase_merge returns 0."""
        build_results = [("codelicious/spec-a", False), ("codelicious/spec-b", False)]
        result = orch._phase_merge(build_results)
        assert result == 0

    def test_successful_merge_deletes_branch(self, tmp_path: pathlib.Path, orch: Orchestrator):
        """A branch that merges successfully must have _delete_branch called on it."""
        build_results = [("codelicious/spec-ok", True)]

        with mock.patch("codelicious.orchestrator._merge_worktree_branch", return_value=True) as mock_merge:
            with mock.patch("codelicious.orchestrator._delete_branch") as mock_del:
                merged = orch._phase_merge(build_results)

        assert merged == 1
        mock_merge.assert_called_once_with(orch.repo_path, "codelicious/spec-ok")
        mock_del.assert_called_once_with(orch.repo_path, "codelicious/spec-ok")

    def test_merge_conflict_logs_warning_and_skips_delete(self, tmp_path: pathlib.Path, orch: Orchestrator, caplog):
        """A merge conflict must log a warning and not call _delete_branch."""
        build_results = [("codelicious/spec-conflict", True)]

        with mock.patch("codelicious.orchestrator._merge_worktree_branch", return_value=False):
            with mock.patch("codelicious.orchestrator._delete_branch") as mock_del:
                with caplog.at_level("WARNING", logger="codelicious.orchestrator"):
                    merged = orch._phase_merge(build_results)

        assert merged == 0
        mock_del.assert_not_called()
        warning_msgs = [r.message for r in caplog.records if r.levelname == "WARNING"]
        assert any("conflict" in m.lower() or "merge" in m.lower() for m in warning_msgs)


# ---------------------------------------------------------------------------
# Finding 70 — _phase_review parallel path
# ---------------------------------------------------------------------------


class TestPhaseReviewParallelPath:
    """Tests for _phase_review error handling in the parallel path."""

    @pytest.fixture
    def orch(self, tmp_path: pathlib.Path) -> Orchestrator:
        git_manager = mock.MagicMock()

        class C:
            model = ""
            effort = ""
            max_turns = 0
            agent_timeout_s = 30
            dry_run = True

        return Orchestrator(tmp_path, git_manager, C())

    def test_one_reviewer_raises_caught_remaining_findings_collected(
        self, tmp_path: pathlib.Path, orch: Orchestrator, caplog
    ):
        """When one reviewer future raises, the exception is caught, an error
        logged, and the findings from the remaining reviewer are still returned."""
        good_finding = Finding(
            role="qa",
            severity="P2",
            file="src/foo.py",
            line=10,
            title="missing test",
            description="untested path",
            fix="add test",
        )

        def fake_reviewer(role: str) -> list[Finding]:
            if role == "security":
                raise RuntimeError("security agent crashed")
            return [good_finding]

        with mock.patch.object(orch, "_run_reviewer", side_effect=fake_reviewer):
            with caplog.at_level("ERROR", logger="codelicious.orchestrator"):
                results = orch._phase_review(["security", "qa"], max_workers=2)

        # The QA finding must still be present
        assert any(f.role == "qa" for f in results)
        # An error must have been logged for the exception
        error_msgs = [r.message for r in caplog.records if r.levelno >= logging.ERROR]
        assert any("security" in m.lower() or "crashed" in m.lower() for m in error_msgs)


# ---------------------------------------------------------------------------
# Finding 71 — _phase_fix
# ---------------------------------------------------------------------------


class TestPhaseFix:
    """Tests for _phase_fix short-circuit and agent-failure paths."""

    @pytest.fixture
    def orch(self, tmp_path: pathlib.Path) -> Orchestrator:
        git_manager = mock.MagicMock()

        class C:
            model = ""
            effort = ""
            max_turns = 0
            agent_timeout_s = 30
            dry_run = True

        return Orchestrator(tmp_path, git_manager, C())

    def test_only_p3_findings_returns_true_without_calling_agent(self, orch: Orchestrator):
        """When all findings are P3, _phase_fix must return True immediately
        without invoking the fix agent."""
        p3_findings = [
            Finding(role="qa", severity="P3", file="a.py", line=1, title="minor", description="", fix=""),
            Finding(role="qa", severity="P3", file="b.py", line=2, title="also minor", description="", fix=""),
        ]

        with mock.patch.object(orch, "_run_agent") as mock_agent:
            result = orch._phase_fix(p3_findings)

        assert result is True
        mock_agent.assert_not_called()

    def test_p1_finding_agent_raises_returns_false(self, tmp_path: pathlib.Path, orch: Orchestrator):
        """When the fix agent raises an exception, _phase_fix must return False."""
        p1_finding = Finding(
            role="security",
            severity="P1",
            file="src/bar.py",
            line=42,
            title="critical issue",
            description="dangerous code",
            fix="remove it",
        )

        with mock.patch.object(orch, "_run_agent", side_effect=RuntimeError("agent timed out")):
            with mock.patch("codelicious.prompts.check_build_complete", return_value=False):
                with mock.patch("codelicious.prompts.clear_build_complete"):
                    result = orch._phase_fix([p1_finding])

        assert result is False
