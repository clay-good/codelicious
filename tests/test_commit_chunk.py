"""Tests for commit_chunk single-chunk commit workflow (spec-27 Phase 7.1)."""

from __future__ import annotations

from pathlib import Path
from unittest import mock

from codelicious.git.git_orchestrator import CommitResult, GitManager


class TestCommitChunk:
    """GitManager.commit_chunk stages specific files and returns CommitResult."""

    def _manager_with_git(self, tmp_path: Path) -> GitManager:
        (tmp_path / ".git").mkdir()
        return GitManager(tmp_path)

    def test_successful_commit(self, tmp_path: Path) -> None:
        manager = self._manager_with_git(tmp_path)

        def fake_run_cmd(args, **kw):
            if args[0:2] == ["git", "add"]:
                return ""
            if args[0:2] == ["git", "diff"]:
                return "src/a.py"
            if args[0:2] == ["git", "commit"]:
                return ""
            if args[0:2] == ["git", "rev-parse"]:
                return "abc1234"
            return ""

        with mock.patch.object(manager, "_run_cmd", side_effect=fake_run_cmd):
            with mock.patch.object(manager, "_check_staged_files_for_sensitive_patterns"):
                result = manager.commit_chunk("spec-1-chunk-01", "Add feature", ["src/a.py"])

        assert result.success is True
        assert result.sha == "abc1234"
        assert "[spec-1-chunk-01]" in result.message

    def test_nothing_staged(self, tmp_path: Path) -> None:
        manager = self._manager_with_git(tmp_path)

        def fake_run_cmd(args, **kw):
            if args[0:2] == ["git", "add"]:
                return ""
            if args[0:2] == ["git", "diff"]:
                return ""
            return ""

        with mock.patch.object(manager, "_run_cmd", side_effect=fake_run_cmd):
            with mock.patch.object(manager, "_check_staged_files_for_sensitive_patterns"):
                result = manager.commit_chunk("c1", "No changes", ["src/a.py"])

        assert result.success is True
        assert result.sha == ""

    def test_gpg_fallback(self, tmp_path: Path) -> None:
        manager = self._manager_with_git(tmp_path)

        def fake_run_cmd(args, **kw):
            if args[0:2] == ["git", "add"]:
                return ""
            if args[0:2] == ["git", "diff"]:
                return "file.py"
            if args[0:2] == ["git", "commit"]:
                if "--no-gpg-sign" in args:
                    return ""
                raise RuntimeError("gpg failed to sign the data")
            if args[0:2] == ["git", "rev-parse"]:
                return "def5678"
            return ""

        with mock.patch.object(manager, "_run_cmd", side_effect=fake_run_cmd):
            with mock.patch.object(manager, "_check_staged_files_for_sensitive_patterns"):
                result = manager.commit_chunk("c2", "Signed fail", ["file.py"])

        assert result.success is True
        assert result.sha == "def5678"

    def test_commit_failure_unstages(self, tmp_path: Path) -> None:
        manager = self._manager_with_git(tmp_path)
        reset_called = {"called": False}

        def fake_run_cmd(args, **kw):
            if args[0:2] == ["git", "add"]:
                return ""
            if args[0:2] == ["git", "diff"]:
                return "file.py"
            if args[0:2] == ["git", "commit"]:
                raise RuntimeError("lock file exists")
            if args[0:2] == ["git", "reset"]:
                reset_called["called"] = True
                return ""
            return ""

        with mock.patch.object(manager, "_run_cmd", side_effect=fake_run_cmd):
            with mock.patch.object(manager, "_check_staged_files_for_sensitive_patterns"):
                result = manager.commit_chunk("c3", "Fails", ["file.py"])

        assert result.success is False
        assert reset_called["called"]

    def test_no_git_repo(self, tmp_path: Path) -> None:
        manager = GitManager(tmp_path)
        result = manager.commit_chunk("c1", "title", ["f.py"])
        assert result.success is False

    def test_commit_result_dataclass(self) -> None:
        r = CommitResult(success=True, sha="abc", message="ok")
        assert r.success is True
        assert r.sha == "abc"
        assert r.message == "ok"

    def test_message_sanitized(self, tmp_path: Path) -> None:
        """Commit message should have null bytes stripped and be length-capped."""
        manager = self._manager_with_git(tmp_path)
        calls = []

        def fake_run_cmd(args, **kw):
            calls.append(list(args))
            if args[0:2] == ["git", "add"]:
                return ""
            if args[0:2] == ["git", "diff"]:
                return "f.py"
            if args[0:2] == ["git", "commit"]:
                return ""
            if args[0:2] == ["git", "rev-parse"]:
                return "aaa"
            return ""

        with mock.patch.object(manager, "_run_cmd", side_effect=fake_run_cmd):
            with mock.patch.object(manager, "_check_staged_files_for_sensitive_patterns"):
                manager.commit_chunk("c1", "title\x00with\x00nulls", ["f.py"])

        commit_calls = [c for c in calls if c[0:2] == ["git", "commit"]]
        assert commit_calls
        msg = commit_calls[0][2]  # -m flag value
        assert "\x00" not in msg
