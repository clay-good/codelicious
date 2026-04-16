"""Tests for PR size management — commit caps and PR splitting (spec-27 Phase 7.1)."""

from __future__ import annotations

import pathlib
from unittest import mock

from codelicious.git.git_orchestrator import GitManager


class TestGetPrCommitCount:
    """GitManager.get_pr_commit_count returns commit count for a PR."""

    def _manager_with_git(self, tmp_path: pathlib.Path) -> GitManager:
        (tmp_path / ".git").mkdir()
        return GitManager(tmp_path)

    def test_gh_returns_count(self, tmp_path: pathlib.Path) -> None:
        manager = self._manager_with_git(tmp_path)
        gh_result = mock.MagicMock(returncode=0, stdout="12\n")
        with mock.patch("subprocess.run", return_value=gh_result):
            assert manager.get_pr_commit_count(42) == 12

    def test_gh_failure_uses_git_log(self, tmp_path: pathlib.Path) -> None:
        manager = self._manager_with_git(tmp_path)
        gh_fail = mock.MagicMock(returncode=1, stdout="")
        with mock.patch(
            "subprocess.run", side_effect=lambda cmd, **kw: gh_fail if cmd[0] == "gh" else mock.MagicMock(returncode=0)
        ):
            with mock.patch.object(manager, "_run_cmd") as mock_cmd:
                mock_cmd.side_effect = ["feature-branch", "abc123", "a\nb\nc"]
                assert manager.get_pr_commit_count(42) == 3

    def test_all_fail_returns_zero(self, tmp_path: pathlib.Path) -> None:
        manager = self._manager_with_git(tmp_path)
        with mock.patch("subprocess.run", side_effect=OSError("nope")):
            with mock.patch.object(manager, "_run_cmd", side_effect=RuntimeError("nope")):
                assert manager.get_pr_commit_count(42) == 0


class TestCreateContinuationBranch:
    """GitManager.create_continuation_branch for PR splits."""

    def test_creates_new_branch(self, tmp_path: pathlib.Path) -> None:
        (tmp_path / ".git").mkdir()
        manager = GitManager(tmp_path)
        with mock.patch.object(manager, "_run_cmd", return_value="") as mock_cmd:
            name = manager.create_continuation_branch("27", 2)
        assert name == "codelicious/spec-27-part-2"
        mock_cmd.assert_any_call(["git", "checkout", "-b", "codelicious/spec-27-part-2"])

    def test_existing_branch_checked_out(self, tmp_path: pathlib.Path) -> None:
        (tmp_path / ".git").mkdir()
        manager = GitManager(tmp_path)

        def side_effect(args, **kw):
            if "-b" in args:
                raise RuntimeError("branch already exists")
            return ""

        with mock.patch.object(manager, "_run_cmd", side_effect=side_effect):
            name = manager.create_continuation_branch("27", 3)
        assert name == "codelicious/spec-27-part-3"


class TestRevertChunkChanges:
    """GitManager.revert_chunk_changes discards uncommitted work."""

    def test_reverts_tracked_and_untracked(self, tmp_path: pathlib.Path) -> None:
        (tmp_path / ".git").mkdir()
        manager = GitManager(tmp_path)
        calls = []
        with mock.patch.object(manager, "_run_cmd", side_effect=lambda args, **kw: calls.append(args) or ""):
            assert manager.revert_chunk_changes() is True
        cmds = [c[1] for c in calls if len(c) > 1]
        assert "reset" in cmds
        assert "checkout" in cmds
        assert "clean" in cmds

    def test_no_git_returns_false(self, tmp_path: pathlib.Path) -> None:
        manager = GitManager(tmp_path)
        assert manager.revert_chunk_changes() is False
