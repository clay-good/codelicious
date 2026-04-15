"""Tests for gh/glab auth detection at startup (spec-27 Phase 7.2)."""

from __future__ import annotations

from pathlib import Path
from unittest import mock

import pytest

from codelicious.cli import PreFlightResult, _detect_platform, _run_auth_preflight


class TestDetectPlatform:
    """_detect_platform identifies GitHub vs GitLab from remote URL."""

    def test_github_ssh(self, tmp_path: Path) -> None:
        r = mock.MagicMock(returncode=0, stdout="git@github.com:user/repo.git\n")
        with mock.patch("subprocess.run", return_value=r):
            assert _detect_platform(tmp_path) == "github"

    def test_github_https(self, tmp_path: Path) -> None:
        r = mock.MagicMock(returncode=0, stdout="https://github.com/user/repo.git\n")
        with mock.patch("subprocess.run", return_value=r):
            assert _detect_platform(tmp_path) == "github"

    def test_gitlab_ssh(self, tmp_path: Path) -> None:
        r = mock.MagicMock(returncode=0, stdout="git@gitlab.com:user/repo.git\n")
        with mock.patch("subprocess.run", return_value=r):
            assert _detect_platform(tmp_path) == "gitlab"

    def test_gitlab_selfhosted(self, tmp_path: Path) -> None:
        r = mock.MagicMock(returncode=0, stdout="git@gitlab.company.com:group/repo.git\n")
        with mock.patch("subprocess.run", return_value=r):
            assert _detect_platform(tmp_path) == "gitlab"

    def test_bitbucket_is_unknown(self, tmp_path: Path) -> None:
        r = mock.MagicMock(returncode=0, stdout="git@bitbucket.org:user/repo.git\n")
        with mock.patch("subprocess.run", return_value=r):
            assert _detect_platform(tmp_path) == "unknown"

    def test_no_remote_is_unknown(self, tmp_path: Path) -> None:
        r = mock.MagicMock(returncode=1, stdout="")
        with mock.patch("subprocess.run", return_value=r):
            assert _detect_platform(tmp_path) == "unknown"

    def test_timeout_is_unknown(self, tmp_path: Path) -> None:
        import subprocess

        with mock.patch("subprocess.run", side_effect=subprocess.TimeoutExpired(cmd=[], timeout=10)):
            assert _detect_platform(tmp_path) == "unknown"


class TestRunAuthPreflight:
    """_run_auth_preflight validates gh/glab authentication."""

    def test_skip_returns_immediately(self, tmp_path: Path) -> None:
        result = _run_auth_preflight(tmp_path, skip=True)
        assert result.skipped is True
        assert result.platform == "unknown"
        assert result.cli_tool == ""

    def test_github_authenticated(self, tmp_path: Path) -> None:
        auth_result = mock.MagicMock(returncode=0)
        auth_result.stdout = "  Logged in to github.com account testuser (keyring)\n"
        auth_result.stderr = ""

        with mock.patch("codelicious.cli._detect_platform", return_value="github"):
            with mock.patch("shutil.which", return_value="/usr/bin/gh"):
                with mock.patch("subprocess.run", return_value=auth_result):
                    result = _run_auth_preflight(tmp_path, skip=False)

        assert result.platform == "github"
        assert result.authenticated_user == "testuser"
        assert result.cli_tool == "gh"

    def test_github_not_installed_exits(self, tmp_path: Path) -> None:
        with mock.patch("codelicious.cli._detect_platform", return_value="github"):
            with mock.patch("shutil.which", return_value=None):
                with pytest.raises(SystemExit) as exc_info:
                    _run_auth_preflight(tmp_path, skip=False)
                assert exc_info.value.code == 1

    def test_gitlab_not_installed_exits(self, tmp_path: Path) -> None:
        with mock.patch("codelicious.cli._detect_platform", return_value="gitlab"):
            with mock.patch("shutil.which", return_value=None):
                with pytest.raises(SystemExit) as exc_info:
                    _run_auth_preflight(tmp_path, skip=False)
                assert exc_info.value.code == 1

    def test_github_not_authed_triggers_login(self, tmp_path: Path) -> None:
        not_authed = mock.MagicMock(returncode=1, stdout="", stderr="Not logged in")
        login_ok = mock.MagicMock(returncode=0)
        post_login = mock.MagicMock(returncode=0, stdout="Logged in to github.com account user2", stderr="")
        call_n = {"n": 0}

        def fake_run(args, **kw):
            call_n["n"] += 1
            if args[:3] == ["gh", "auth", "status"]:
                return not_authed if call_n["n"] <= 1 else post_login
            if args[:3] == ["gh", "auth", "login"]:
                return login_ok
            return mock.MagicMock(returncode=0)

        with mock.patch("codelicious.cli._detect_platform", return_value="github"):
            with mock.patch("shutil.which", return_value="/usr/bin/gh"):
                with mock.patch("subprocess.run", side_effect=fake_run):
                    result = _run_auth_preflight(tmp_path, skip=False)

        assert result.authenticated_user == "user2"

    def test_preflight_result_frozen(self) -> None:
        r = PreFlightResult(platform="github", authenticated_user="me", cli_tool="gh", skipped=False)
        with pytest.raises(AttributeError):
            r.platform = "gitlab"  # type: ignore[misc]

    # ------------------------------------------------------------------
    # GitLab auth paths
    # ------------------------------------------------------------------

    def test_gitlab_auth_status_timeout_returns_partial_result(self, tmp_path: Path) -> None:
        """When glab auth status times out, preflight continues without verification."""
        import subprocess

        with mock.patch("codelicious.cli._detect_platform", return_value="gitlab"):
            with mock.patch("shutil.which", return_value="/usr/bin/glab"):
                with mock.patch(
                    "subprocess.run",
                    side_effect=subprocess.TimeoutExpired(cmd=["glab", "auth", "status"], timeout=15),
                ):
                    result = _run_auth_preflight(tmp_path, skip=False)

        assert result.platform == "gitlab"
        assert result.cli_tool == "glab"
        assert result.authenticated_user == ""
        assert result.skipped is False

    def test_gitlab_authenticated_extracts_username(self, tmp_path: Path) -> None:
        """glab auth status output 'Logged in to gitlab.com as USERNAME' is parsed."""
        auth_result = mock.MagicMock(
            returncode=0,
            stdout="Logged in to gitlab.com as gitlabuser",
            stderr="",
        )

        with mock.patch("codelicious.cli._detect_platform", return_value="gitlab"):
            with mock.patch("shutil.which", return_value="/usr/bin/glab"):
                with mock.patch("subprocess.run", return_value=auth_result):
                    result = _run_auth_preflight(tmp_path, skip=False)

        assert result.platform == "gitlab"
        assert result.authenticated_user == "gitlabuser"
        assert result.cli_tool == "glab"

    def test_gitlab_not_authed_login_failure_exits(self, tmp_path: Path) -> None:
        """When glab auth login fails, exits with code 1."""
        not_authed = mock.MagicMock(returncode=1, stdout="", stderr="not authenticated")
        login_failed = mock.MagicMock(returncode=1)

        call_count = {"n": 0}

        def fake_run(args, **kw):
            call_count["n"] += 1
            if args[:3] == ["glab", "auth", "status"]:
                return not_authed
            if args[:3] == ["glab", "auth", "login"]:
                return login_failed
            return mock.MagicMock(returncode=0)

        with mock.patch("codelicious.cli._detect_platform", return_value="gitlab"):
            with mock.patch("shutil.which", return_value="/usr/bin/glab"):
                with mock.patch("subprocess.run", side_effect=fake_run):
                    with pytest.raises(SystemExit) as exc_info:
                        _run_auth_preflight(tmp_path, skip=False)

        assert exc_info.value.code == 1

    def test_gitlab_not_authed_triggers_login_and_recheck(self, tmp_path: Path) -> None:
        """When glab is not authed, login flow runs, then auth status is re-checked."""
        not_authed = mock.MagicMock(returncode=1, stdout="", stderr="not authenticated")
        login_ok = mock.MagicMock(returncode=0)
        post_login = mock.MagicMock(
            returncode=0,
            stdout="Logged in to gitlab.com as gluser",
            stderr="",
        )

        call_count = {"n": 0}

        def fake_run(args, **kw):
            call_count["n"] += 1
            if args[:3] == ["glab", "auth", "status"]:
                return not_authed if call_count["n"] <= 1 else post_login
            if args[:3] == ["glab", "auth", "login"]:
                return login_ok
            return mock.MagicMock(returncode=0)

        with mock.patch("codelicious.cli._detect_platform", return_value="gitlab"):
            with mock.patch("shutil.which", return_value="/usr/bin/glab"):
                with mock.patch("subprocess.run", side_effect=fake_run):
                    result = _run_auth_preflight(tmp_path, skip=False)

        assert result.platform == "gitlab"
        assert result.authenticated_user == "gluser"

    # ------------------------------------------------------------------
    # GitHub auth edge cases
    # ------------------------------------------------------------------

    def test_github_auth_status_timeout_returns_partial_result(self, tmp_path: Path) -> None:
        """When gh auth status times out, preflight continues without verification."""
        import subprocess

        with mock.patch("codelicious.cli._detect_platform", return_value="github"):
            with mock.patch("shutil.which", return_value="/usr/bin/gh"):
                with mock.patch(
                    "subprocess.run",
                    side_effect=subprocess.TimeoutExpired(cmd=["gh", "auth", "status"], timeout=15),
                ):
                    result = _run_auth_preflight(tmp_path, skip=False)

        assert result.platform == "github"
        assert result.cli_tool == "gh"
        assert result.authenticated_user == ""
        assert result.skipped is False

    def test_github_not_authed_login_failure_exits(self, tmp_path: Path) -> None:
        """When gh auth login returns non-zero, exits with code 1."""
        not_authed = mock.MagicMock(returncode=1, stdout="", stderr="not logged in")
        login_failed = mock.MagicMock(returncode=1)

        call_count = {"n": 0}

        def fake_run(args, **kw):
            call_count["n"] += 1
            if args[:3] == ["gh", "auth", "status"]:
                return not_authed
            if args[:3] == ["gh", "auth", "login"]:
                return login_failed
            return mock.MagicMock(returncode=0)

        with mock.patch("codelicious.cli._detect_platform", return_value="github"):
            with mock.patch("shutil.which", return_value="/usr/bin/gh"):
                with mock.patch("subprocess.run", side_effect=fake_run):
                    with pytest.raises(SystemExit) as exc_info:
                        _run_auth_preflight(tmp_path, skip=False)

        assert exc_info.value.code == 1

    def test_github_unknown_platform_uses_github_path(self, tmp_path: Path) -> None:
        """When platform is 'unknown', the GitHub (gh) code path is used as default."""
        auth_result = mock.MagicMock(
            returncode=0,
            stdout="Logged in to github.com account defaultuser (keyring)",
            stderr="",
        )

        with mock.patch("codelicious.cli._detect_platform", return_value="unknown"):
            with mock.patch("shutil.which", return_value="/usr/bin/gh"):
                with mock.patch("subprocess.run", return_value=auth_result):
                    result = _run_auth_preflight(tmp_path, skip=False)

        assert result.platform == "github"
        assert result.authenticated_user == "defaultuser"
