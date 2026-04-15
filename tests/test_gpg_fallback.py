"""Tests for GPG signing fallback — unsigned commit on GPG failure (spec-27 Phase 7.2)."""

from __future__ import annotations

import logging
from pathlib import Path
from unittest import mock

from codelicious.git.git_orchestrator import GitManager


class TestGPGFallbackInCommitVerifiedChanges:
    """commit_verified_changes retries with --no-gpg-sign on GPG failure."""

    def _manager_with_git(self, tmp_path: Path) -> GitManager:
        (tmp_path / ".git").mkdir()
        return GitManager(tmp_path)

    def test_gpg_failure_retries_unsigned(self, tmp_path: Path, caplog) -> None:
        manager = self._manager_with_git(tmp_path)
        call_log: list[list[str]] = []

        def fake(args, **kw):
            call_log.append(list(args))
            if args[0:2] == ["git", "add"]:
                return ""
            if args[0:2] == ["git", "diff"]:
                return ""
            if args[0:2] == ["git", "status"]:
                return "M file.py"
            if args[0:2] == ["git", "commit"]:
                if "--no-gpg-sign" in args:
                    return ""
                raise RuntimeError("gpg failed to sign the data")
            return ""

        with mock.patch.object(manager, "_run_cmd", side_effect=fake):
            with caplog.at_level(logging.WARNING):
                result = manager.commit_verified_changes("test commit")

        assert result is True
        assert "GPG signing unavailable" in caplog.text
        unsigned = [c for c in call_log if "commit" in c and "--no-gpg-sign" in c]
        assert len(unsigned) == 1

    def test_signing_failed_also_triggers_fallback(self, tmp_path: Path) -> None:
        manager = self._manager_with_git(tmp_path)

        def fake(args, **kw):
            if args[0:2] == ["git", "add"]:
                return ""
            if args[0:2] == ["git", "diff"]:
                return ""
            if args[0:2] == ["git", "status"]:
                return "M f.py"
            if args[0:2] == ["git", "commit"]:
                if "--no-gpg-sign" in args:
                    return ""
                raise RuntimeError("signing failed: No secret key")
            return ""

        with mock.patch.object(manager, "_run_cmd", side_effect=fake):
            assert manager.commit_verified_changes("test") is True

    def test_non_gpg_error_does_not_retry(self, tmp_path: Path) -> None:
        manager = self._manager_with_git(tmp_path)

        def fake(args, **kw):
            if args[0:2] == ["git", "add"]:
                return ""
            if args[0:2] == ["git", "diff"]:
                return ""
            if args[0:2] == ["git", "status"]:
                return "M f.py"
            if args[0:2] == ["git", "commit"]:
                raise RuntimeError("lock file exists")
            if args[0:2] == ["git", "reset"]:
                return ""
            return ""

        with mock.patch.object(manager, "_run_cmd", side_effect=fake):
            result = manager.commit_verified_changes("test")

        assert result is False


class TestGPGFallbackInCommitChunk:
    """commit_chunk also retries with --no-gpg-sign on GPG failure."""

    def test_commit_chunk_gpg_fallback(self, tmp_path: Path) -> None:
        (tmp_path / ".git").mkdir()
        manager = GitManager(tmp_path)

        def fake(args, **kw):
            if args[0:2] == ["git", "add"]:
                return ""
            if args[0:2] == ["git", "diff"]:
                return "f.py"
            if args[0:2] == ["git", "commit"]:
                if "--no-gpg-sign" in args:
                    return ""
                raise RuntimeError("gpg failed")
            if args[0:2] == ["git", "rev-parse"]:
                return "aaa111"
            return ""

        with mock.patch.object(manager, "_run_cmd", side_effect=fake):
            with mock.patch.object(manager, "_check_staged_files_for_sensitive_patterns"):
                result = manager.commit_chunk("c1", "title", ["f.py"])

        assert result.success is True
        assert result.sha == "aaa111"
