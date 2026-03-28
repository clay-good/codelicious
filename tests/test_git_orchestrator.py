"""
Tests for git_orchestrator.py - Git staging and commit safety.
"""

import json
import subprocess
from pathlib import Path
from unittest import mock

import pytest

from codelicious.git.git_orchestrator import GitManager, SENSITIVE_PATTERNS


@pytest.fixture
def git_repo(tmp_path: Path) -> Path:
    """Create a temporary git repository for testing."""
    # Initialize a git repo
    subprocess.run(["git", "init"], cwd=tmp_path, capture_output=True, check=True)
    subprocess.run(
        ["git", "config", "user.email", "test@example.com"],
        cwd=tmp_path,
        capture_output=True,
        check=True,
    )
    subprocess.run(
        ["git", "config", "user.name", "Test User"],
        cwd=tmp_path,
        capture_output=True,
        check=True,
    )
    # Disable GPG signing so tests work without a tty
    subprocess.run(
        ["git", "config", "commit.gpgsign", "false"],
        cwd=tmp_path,
        capture_output=True,
        check=True,
    )
    # Create an initial commit so we have a valid git state
    readme = tmp_path / "README.md"
    readme.write_text("# Test Repo\n", encoding="utf-8")
    subprocess.run(["git", "add", "README.md"], cwd=tmp_path, capture_output=True, check=True)
    subprocess.run(
        ["git", "commit", "-m", "Initial commit"],
        cwd=tmp_path,
        capture_output=True,
        check=True,
    )
    return tmp_path


class TestSensitiveFileDetection:
    """Tests for sensitive file pattern detection."""

    def test_env_file_is_sensitive(self, git_repo: Path):
        """Test that .env files are detected as sensitive."""
        manager = GitManager(git_repo)
        assert manager._is_sensitive_file(".env") is True
        assert manager._is_sensitive_file(".env.production") is True
        assert manager._is_sensitive_file("config/.env.local") is True

    def test_key_files_are_sensitive(self, git_repo: Path):
        """Test that key/pem files are detected as sensitive."""
        manager = GitManager(git_repo)
        assert manager._is_sensitive_file("server.key") is True
        assert manager._is_sensitive_file("server.pem") is True
        assert manager._is_sensitive_file("id_rsa") is True
        assert manager._is_sensitive_file("id_ed25519") is True

    def test_secret_files_are_sensitive(self, git_repo: Path):
        """Test that files with 'secret' in the name are detected."""
        manager = GitManager(git_repo)
        assert manager._is_sensitive_file("secrets.json") is True
        assert manager._is_sensitive_file("client_secret.json") is True

    def test_normal_files_are_not_sensitive(self, git_repo: Path):
        """Test that normal source files are not flagged as sensitive."""
        manager = GitManager(git_repo)
        assert manager._is_sensitive_file("main.py") is False
        assert manager._is_sensitive_file("src/app.js") is False
        assert manager._is_sensitive_file("README.md") is False
        assert manager._is_sensitive_file("test_environment.py") is False  # 'env' but not '.env'


class TestExplicitFileStaging:
    """Tests for explicit file list staging functionality."""

    def test_explicit_file_staging_only_stages_specified_files(self, git_repo: Path):
        """Test that only specified files are staged when files_to_stage is provided.

        Uses GitManager._run_cmd and commit_verified_changes instead of raw subprocess
        so the test exercises the actual GitManager API.
        """
        # Create multiple files
        src_dir = git_repo / "src"
        src_dir.mkdir()
        main_py = src_dir / "main.py"
        main_py.write_text("print('hello')\n", encoding="utf-8")

        env_file = git_repo / ".env"
        env_file.write_text("SECRET=abc123\n", encoding="utf-8")

        manager = GitManager(git_repo)

        # Stage only main.py via the GitManager API
        manager._run_cmd(["git", "add", "src/main.py"])

        # Inspect staged files via GitManager._run_cmd
        staged_output = manager._run_cmd(["git", "diff", "--cached", "--name-only"])
        staged_files = staged_output.splitlines()

        assert "src/main.py" in staged_files
        assert ".env" not in staged_files

    def test_commit_verified_changes_stages_only_explicit_files(self, git_repo: Path):
        """commit_verified_changes with files_to_stage only commits the listed files.

        Creates both main.py and .env, commits with an explicit file list containing
        only main.py, then inspects the resulting git commit to verify .env is absent.
        """
        src_dir = git_repo / "src"
        src_dir.mkdir()
        main_py = src_dir / "main.py"
        main_py.write_text("print('hello')\n", encoding="utf-8")

        env_file = git_repo / ".env"
        env_file.write_text("SECRET=abc123\n", encoding="utf-8")

        manager = GitManager(git_repo)
        # commit_verified_changes with an explicit list must not stage .env
        manager.commit_verified_changes("Add main.py only", files_to_stage=["src/main.py"])

        # Inspect the most recent commit's changed files via GitManager._run_cmd
        committed_files = manager._run_cmd(["git", "show", "--name-only", "--format="])
        assert "src/main.py" in committed_files
        assert ".env" not in committed_files

    def test_git_add_dot_stages_all_files(self, git_repo: Path):
        """Test that git add . (via _run_cmd) stages all untracked files."""
        # Create files
        src_dir = git_repo / "src"
        src_dir.mkdir()
        main_py = src_dir / "main.py"
        main_py.write_text("print('hello')\n", encoding="utf-8")

        other_file = git_repo / "other.txt"
        other_file.write_text("other content\n", encoding="utf-8")

        manager = GitManager(git_repo)
        # Use GitManager._run_cmd instead of raw subprocess
        manager._run_cmd(["git", "add", "."])

        # Inspect staged files via _run_cmd
        staged_output = manager._run_cmd(["git", "diff", "--cached", "--name-only"])
        staged_files = staged_output.splitlines()

        assert "src/main.py" in staged_files
        assert "other.txt" in staged_files


class TestSensitiveFileWarnings:
    """Tests for sensitive file warning during staging."""

    def test_check_staged_files_returns_warnings_for_env(self, git_repo: Path):
        """Test that staging a .env file returns warnings."""
        # Create and stage a .env file
        env_file = git_repo / ".env"
        env_file.write_text("SECRET=value\n", encoding="utf-8")
        subprocess.run(["git", "add", ".env"], cwd=git_repo, capture_output=True, check=True)

        manager = GitManager(git_repo)
        warnings = manager._check_staged_files_for_sensitive_patterns()

        assert ".env" in warnings

    def test_check_staged_files_returns_warnings_for_key_file(self, git_repo: Path):
        """Test that staging a .key file returns warnings."""
        key_file = git_repo / "server.key"
        key_file.write_text("-----BEGIN PRIVATE KEY-----\n", encoding="utf-8")
        subprocess.run(["git", "add", "server.key"], cwd=git_repo, capture_output=True, check=True)

        manager = GitManager(git_repo)
        warnings = manager._check_staged_files_for_sensitive_patterns()

        assert "server.key" in warnings

    def test_check_staged_files_no_warnings_for_normal_files(self, git_repo: Path):
        """Test that staging normal files returns no warnings."""
        py_file = git_repo / "main.py"
        py_file.write_text("print('hello')\n", encoding="utf-8")
        subprocess.run(["git", "add", "main.py"], cwd=git_repo, capture_output=True, check=True)

        manager = GitManager(git_repo)
        warnings = manager._check_staged_files_for_sensitive_patterns()

        assert len(warnings) == 0


class TestGitManagerBasics:
    """Basic tests for GitManager functionality."""

    def test_has_git_returns_true_for_git_repo(self, git_repo: Path):
        """Test that _has_git returns True for a valid git repo."""
        manager = GitManager(git_repo)
        assert manager._has_git() is True

    def test_has_git_returns_false_for_non_git_dir(self, tmp_path: Path):
        """Test that _has_git returns False for a non-git directory."""
        manager = GitManager(tmp_path)
        assert manager._has_git() is False

    def test_current_branch_returns_branch_name(self, git_repo: Path):
        """Test that current_branch returns the correct branch name."""
        # Ensure a deterministic branch name regardless of git config defaults
        subprocess.run(
            ["git", "checkout", "-b", "main"],
            cwd=git_repo,
            capture_output=True,
        )
        manager = GitManager(git_repo)
        branch = manager.current_branch
        assert branch == "main"

    def test_current_branch_returns_unknown_for_non_git(self, tmp_path: Path):
        """Test that current_branch returns 'unknown' for non-git directory."""
        manager = GitManager(tmp_path)
        assert manager.current_branch == "unknown"


class TestSensitivePatterns:
    """Tests for the SENSITIVE_PATTERNS constant."""

    def test_sensitive_patterns_contains_expected_entries(self):
        """Test that SENSITIVE_PATTERNS contains all expected entries."""
        expected = {".env", ".pem", ".key", "secret", "credential", "token", "id_rsa", "id_ed25519"}
        assert expected.issubset(SENSITIVE_PATTERNS)

    def test_sensitive_patterns_is_frozenset(self):
        """Test that SENSITIVE_PATTERNS is immutable."""
        assert isinstance(SENSITIVE_PATTERNS, frozenset)


# ---------------------------------------------------------------------------
# Finding 42: SENSITIVE_PATTERNS — extended pattern coverage
# ---------------------------------------------------------------------------


class TestSensitivePatternsExtended:
    """Tests for the additional SENSITIVE_PATTERNS entries added in Finding 42."""

    @pytest.mark.parametrize(
        "pattern",
        [
            ".npmrc",
            ".pypirc",
            ".netrc",
            "kubeconfig",
            "service-account",
            "aws-credentials",
            "docker-config",
        ],
    )
    def test_new_pattern_is_present_in_constant(self, pattern: str) -> None:
        """Each newly added pattern must exist in SENSITIVE_PATTERNS."""
        assert pattern in SENSITIVE_PATTERNS, f"Missing pattern: {pattern!r}"

    def test_npmrc_file_is_sensitive(self, tmp_path: Path) -> None:
        """.npmrc files carry registry tokens and must be blocked."""
        manager = GitManager(tmp_path)
        assert manager._is_sensitive_file(".npmrc") is True
        assert manager._is_sensitive_file("project/.npmrc") is True

    def test_pypirc_file_is_sensitive(self, tmp_path: Path) -> None:
        """.pypirc files carry PyPI upload credentials and must be blocked."""
        manager = GitManager(tmp_path)
        assert manager._is_sensitive_file(".pypirc") is True

    def test_netrc_file_is_sensitive(self, tmp_path: Path) -> None:
        """.netrc files carry FTP/HTTP passwords and must be blocked."""
        manager = GitManager(tmp_path)
        assert manager._is_sensitive_file(".netrc") is True
        assert manager._is_sensitive_file("~/.netrc") is True

    def test_kubeconfig_file_is_sensitive(self, tmp_path: Path) -> None:
        """kubeconfig files carry cluster access credentials and must be blocked."""
        manager = GitManager(tmp_path)
        assert manager._is_sensitive_file("kubeconfig") is True
        assert manager._is_sensitive_file("~/.kube/kubeconfig") is True

    def test_service_account_file_is_sensitive(self, tmp_path: Path) -> None:
        """service-account JSON files carry GCP/k8s credentials and must be blocked."""
        manager = GitManager(tmp_path)
        assert manager._is_sensitive_file("service-account.json") is True
        assert manager._is_sensitive_file("my-service-account-key.json") is True

    def test_aws_credentials_file_is_sensitive(self, tmp_path: Path) -> None:
        """aws-credentials files carry AWS access keys and must be blocked."""
        manager = GitManager(tmp_path)
        assert manager._is_sensitive_file("aws-credentials") is True
        assert manager._is_sensitive_file(".aws/aws-credentials") is True

    def test_docker_config_file_is_sensitive(self, tmp_path: Path) -> None:
        """docker-config files carry registry auth tokens and must be blocked."""
        manager = GitManager(tmp_path)
        assert manager._is_sensitive_file("docker-config.json") is True
        assert manager._is_sensitive_file(".docker/docker-config") is True

    def test_normal_files_still_not_sensitive(self, tmp_path: Path) -> None:
        """Adding new patterns must not cause false positives on ordinary files."""
        manager = GitManager(tmp_path)
        assert manager._is_sensitive_file("package.json") is False
        assert manager._is_sensitive_file("setup.py") is False
        assert manager._is_sensitive_file("Dockerfile") is False
        assert manager._is_sensitive_file("requirements.txt") is False


class TestCommitWithExplicitFiles:
    """Integration tests for commit_verified_changes with explicit file lists."""

    def test_commit_with_explicit_files_excludes_env(self, git_repo: Path):
        """
        Test that committing with explicit file list excludes .env file.

        This test creates a .env file and a main.py file, then uses
        files_to_stage to only stage main.py. Verifies .env is NOT in the commit.
        """
        # Create files
        src_dir = git_repo / "src"
        src_dir.mkdir()
        main_py = src_dir / "main.py"
        main_py.write_text("print('hello world')\n", encoding="utf-8")

        env_file = git_repo / ".env"
        env_file.write_text("API_KEY=secret123\n", encoding="utf-8")

        # Create a GitManager and manually test staging behavior
        # (We can't easily call commit_verified_changes without mocking push)
        manager = GitManager(git_repo)

        # Simulate explicit staging (what commit_verified_changes does)
        for filepath in ["src/main.py"]:
            manager._run_cmd(["git", "add", filepath])

        # Commit
        manager._run_cmd(["git", "commit", "-m", "Add main.py"])

        # Check the committed files
        result = subprocess.run(
            ["git", "show", "--stat", "--format="],
            cwd=git_repo,
            capture_output=True,
            text=True,
        )

        # Verify .env is NOT in the commit
        assert ".env" not in result.stdout
        assert "main.py" in result.stdout


# ---------------------------------------------------------------------------
# Finding 20: _is_sensitive_file — additional pattern coverage
# ---------------------------------------------------------------------------


class TestIsSensitiveFilePatterns:
    """Unit tests for _is_sensitive_file covering each sensitive pattern."""

    def test_api_token_json_is_sensitive(self, tmp_path: Path):
        """Files with 'token' in the name are sensitive."""
        manager = GitManager(tmp_path)
        assert manager._is_sensitive_file("api_token.json") is True

    def test_db_password_txt_is_sensitive(self, tmp_path: Path):
        """Files with 'password' in the name are sensitive."""
        manager = GitManager(tmp_path)
        assert manager._is_sensitive_file("db_password.txt") is True

    def test_credential_file_is_sensitive(self, tmp_path: Path):
        """Files with 'credential' in the name are sensitive."""
        manager = GitManager(tmp_path)
        assert manager._is_sensitive_file("credentials.json") is True

    def test_private_key_file_is_sensitive(self, tmp_path: Path):
        """Files with 'private' in the name are sensitive."""
        manager = GitManager(tmp_path)
        assert manager._is_sensitive_file("private_key.pem") is True

    def test_models_py_is_not_sensitive(self, tmp_path: Path):
        """models.py is a common safe source file — not sensitive."""
        manager = GitManager(tmp_path)
        assert manager._is_sensitive_file("models.py") is False

    def test_readme_md_is_not_sensitive(self, tmp_path: Path):
        """README.md should not be flagged as sensitive."""
        manager = GitManager(tmp_path)
        assert manager._is_sensitive_file("README.md") is False

    def test_case_insensitive_matching(self, tmp_path: Path):
        """Pattern matching is case-insensitive."""
        manager = GitManager(tmp_path)
        # .ENV should match the same as .env
        assert manager._is_sensitive_file(".ENV") is True
        assert manager._is_sensitive_file("API_TOKEN.JSON") is True


# ---------------------------------------------------------------------------
# Finding 21: assert_safe_branch — branch safety enforcement
# ---------------------------------------------------------------------------


class TestAssertSafeBranch:
    """Tests for assert_safe_branch — ensure it switches away from main/master."""

    def test_on_main_branch_triggers_checkout(self, tmp_path: Path):
        """When on 'main', assert_safe_branch should call checkout_or_create_feature_branch."""
        # Create a minimal .git dir so _has_git() returns True
        (tmp_path / ".git").mkdir()
        manager = GitManager(tmp_path)

        with mock.patch.object(manager, "_run_cmd", return_value="main"):
            with mock.patch.object(manager, "checkout_or_create_feature_branch") as mock_checkout:
                manager.assert_safe_branch(spec_name="my-spec")

        mock_checkout.assert_called_once_with("codelicious/my-spec")

    def test_on_master_branch_triggers_checkout(self, tmp_path: Path):
        """When on 'master', assert_safe_branch should call checkout_or_create_feature_branch."""
        (tmp_path / ".git").mkdir()
        manager = GitManager(tmp_path)

        with mock.patch.object(manager, "_run_cmd", return_value="master"):
            with mock.patch.object(manager, "checkout_or_create_feature_branch") as mock_checkout:
                manager.assert_safe_branch(spec_name="spec-05")

        mock_checkout.assert_called_once_with("codelicious/spec-05")

    def test_on_safe_branch_no_checkout(self, tmp_path: Path):
        """When already on a safe feature branch, no checkout should occur."""
        (tmp_path / ".git").mkdir()
        manager = GitManager(tmp_path)

        with mock.patch.object(manager, "_run_cmd", return_value="codelicious/my-feature"):
            with mock.patch.object(manager, "checkout_or_create_feature_branch") as mock_checkout:
                manager.assert_safe_branch(spec_name="my-feature")

        mock_checkout.assert_not_called()

    def test_no_git_repo_logs_warning_and_returns(self, tmp_path: Path):
        """When .git does not exist, assert_safe_branch logs a warning and returns early."""
        # tmp_path has no .git directory
        manager = GitManager(tmp_path)

        with mock.patch.object(manager, "checkout_or_create_feature_branch") as mock_checkout:
            # Should not raise and should not try to checkout
            manager.assert_safe_branch(spec_name="whatever")

        mock_checkout.assert_not_called()

    def test_fallback_branch_name_when_no_spec_name(self, tmp_path: Path):
        """When spec_name is empty string, fallback branch is 'codelicious/auto-build'."""
        (tmp_path / ".git").mkdir()
        manager = GitManager(tmp_path)

        with mock.patch.object(manager, "_run_cmd", return_value="main"):
            with mock.patch.object(manager, "checkout_or_create_feature_branch") as mock_checkout:
                manager.assert_safe_branch(spec_name="")

        mock_checkout.assert_called_once_with("codelicious/auto-build")


# ---------------------------------------------------------------------------
# Finding 84: ensure_draft_pr_exists — duplicate-PR guard and JSON fallback
# ---------------------------------------------------------------------------


class TestEnsureDraftPrExists:
    """Tests for ensure_draft_pr_exists duplicate-PR guard and error handling."""

    def _make_manager_on_feature_branch(self, tmp_path: Path) -> GitManager:
        """Return a GitManager with a .git dir whose current branch is a safe feature branch."""
        (tmp_path / ".git").mkdir()
        manager = GitManager(tmp_path)
        return manager

    def _mock_gh_version_ok(self) -> mock.MagicMock:
        """Return a CompletedProcess-like mock indicating gh is installed."""
        result = mock.MagicMock()
        result.returncode = 0
        return result

    def _mock_pr_list_existing(
        self, pr_number: int = 42, url: str = "https://github.com/o/r/pull/42"
    ) -> mock.MagicMock:
        """Return a CompletedProcess-like mock showing an existing PR."""
        prs = [{"number": pr_number, "url": url, "state": "OPEN"}]
        result = mock.MagicMock()
        result.returncode = 0
        result.stdout = json.dumps(prs)
        return result

    def _mock_pr_list_empty(self) -> mock.MagicMock:
        """Return a CompletedProcess-like mock showing no existing PRs."""
        result = mock.MagicMock()
        result.returncode = 0
        result.stdout = "[]"
        return result

    def test_existing_pr_prevents_create_call(self, tmp_path: Path) -> None:
        """When gh pr list returns an existing PR, gh pr create is never called."""
        manager = self._make_manager_on_feature_branch(tmp_path)

        gh_version_result = self._mock_gh_version_ok()
        pr_list_result = self._mock_pr_list_existing()
        # gh pr create should never be reached — but set up a mock just in case
        pr_create_result = mock.MagicMock()
        pr_create_result.returncode = 0
        pr_create_result.stdout = "https://github.com/o/r/pull/99"

        def _side_effect(cmd, **kwargs):
            if "version" in cmd:
                return gh_version_result
            if "list" in cmd:
                return pr_list_result
            if "create" in cmd:
                return pr_create_result
            return mock.MagicMock(returncode=0, stdout="")

        with mock.patch.object(
            type(manager), "current_branch", new_callable=mock.PropertyMock, return_value="codelicious/spec-01"
        ):
            with mock.patch("subprocess.run", side_effect=_side_effect) as mock_run:
                manager.ensure_draft_pr_exists("test spec summary")

        # Verify gh pr create was never called
        create_calls = [call for call in mock_run.call_args_list if "create" in (call.args[0] if call.args else [])]
        assert len(create_calls) == 0, "gh pr create should not be called when PR already exists"

    def test_no_existing_pr_triggers_create(self, tmp_path: Path) -> None:
        """When gh pr list returns empty, gh pr create IS called."""
        manager = self._make_manager_on_feature_branch(tmp_path)

        gh_version_result = self._mock_gh_version_ok()
        pr_list_result = self._mock_pr_list_empty()
        pr_create_result = mock.MagicMock()
        pr_create_result.returncode = 0
        pr_create_result.stdout = "https://github.com/o/r/pull/55"

        def _side_effect(cmd, **kwargs):
            if "version" in cmd:
                return gh_version_result
            if "list" in cmd:
                return pr_list_result
            if "create" in cmd:
                return pr_create_result
            return mock.MagicMock(returncode=0, stdout="")

        with mock.patch.object(
            type(manager), "current_branch", new_callable=mock.PropertyMock, return_value="codelicious/spec-02"
        ):
            with mock.patch("subprocess.run", side_effect=_side_effect) as mock_run:
                manager.ensure_draft_pr_exists("new spec")

        create_calls = [call for call in mock_run.call_args_list if "create" in (call.args[0] if call.args else [])]
        assert len(create_calls) == 1, "gh pr create should be called exactly once when no PR exists"

    def test_json_decode_error_in_pr_list_falls_through_to_create(self, tmp_path: Path) -> None:
        """When gh pr list returns invalid JSON, the code falls through to create a new PR."""
        manager = self._make_manager_on_feature_branch(tmp_path)

        gh_version_result = self._mock_gh_version_ok()
        # Simulate a non-empty but invalid JSON response
        pr_list_bad_json = mock.MagicMock()
        pr_list_bad_json.returncode = 0
        pr_list_bad_json.stdout = "THIS IS NOT JSON"

        pr_create_result = mock.MagicMock()
        pr_create_result.returncode = 0
        pr_create_result.stdout = "https://github.com/o/r/pull/77"

        def _side_effect(cmd, **kwargs):
            if "version" in cmd:
                return gh_version_result
            if "list" in cmd:
                return pr_list_bad_json
            if "create" in cmd:
                return pr_create_result
            return mock.MagicMock(returncode=0, stdout="")

        with mock.patch.object(
            type(manager), "current_branch", new_callable=mock.PropertyMock, return_value="codelicious/spec-03"
        ):
            with mock.patch("subprocess.run", side_effect=_side_effect) as mock_run:
                # Should not raise even with bad JSON
                manager.ensure_draft_pr_exists("spec with bad json response")

        # A create call should have been made because the JSON guard fell through
        create_calls = [call for call in mock_run.call_args_list if "create" in (call.args[0] if call.args else [])]
        assert len(create_calls) == 1, "gh pr create should be attempted after JSONDecodeError fallback"

    def test_forbidden_branch_skips_pr_creation(self, tmp_path: Path) -> None:
        """ensure_draft_pr_exists skips PR creation entirely when on a forbidden branch."""
        manager = self._make_manager_on_feature_branch(tmp_path)

        with mock.patch.object(type(manager), "current_branch", new_callable=mock.PropertyMock, return_value="main"):
            with mock.patch("subprocess.run") as mock_run:
                manager.ensure_draft_pr_exists("should be skipped")

        # gh pr list and gh pr create should not be called (only gh --version might be)
        create_calls = [call for call in mock_run.call_args_list if "create" in (call.args[0] if call.args else [])]
        list_calls = [call for call in mock_run.call_args_list if "list" in (call.args[0] if call.args else [])]
        assert len(create_calls) == 0, "gh pr create should not be called from a forbidden branch"
        assert len(list_calls) == 0, "gh pr list should not be called from a forbidden branch"

    def test_no_git_repo_returns_early(self, tmp_path: Path) -> None:
        """ensure_draft_pr_exists returns immediately when there is no .git directory."""
        # tmp_path has no .git
        manager = GitManager(tmp_path)

        with mock.patch("subprocess.run") as mock_run:
            manager.ensure_draft_pr_exists("spec-summary")

        mock_run.assert_not_called()


# ---------------------------------------------------------------------------
# Finding 22 — push_to_origin()
# ---------------------------------------------------------------------------


class TestPushToOrigin:
    """Finding 22: push_to_origin() success, push-failure, and exception paths."""

    def _manager_with_git(self, tmp_path: Path) -> GitManager:
        """Return a GitManager whose _has_git() returns True."""
        (tmp_path / ".git").mkdir()
        return GitManager(tmp_path)

    def test_no_unpushed_commits_returns_true_without_push(self, tmp_path: Path) -> None:
        """When git log shows no unpushed commits, push_to_origin returns True immediately."""
        manager = self._manager_with_git(tmp_path)

        # _run_cmd is used to get the current branch; subprocess.run handles the log check
        branch_result = mock.MagicMock()
        branch_result.returncode = 0
        branch_result.stdout = "my-feature\n"
        branch_result.stderr = ""

        # git log origin/branch..HEAD returns empty stdout (nothing to push)
        log_result = mock.MagicMock()
        log_result.returncode = 0
        log_result.stdout = ""  # no unpushed commits
        log_result.stderr = ""

        call_results = iter([branch_result, log_result])

        with mock.patch("subprocess.run", side_effect=lambda *a, **kw: next(call_results)):
            result = manager.push_to_origin()

        assert result is True

    def test_push_failure_returns_false(self, tmp_path: Path) -> None:
        """When git push exits non-zero, push_to_origin returns False."""
        manager = self._manager_with_git(tmp_path)

        branch_result = mock.MagicMock()
        branch_result.returncode = 0
        branch_result.stdout = "my-feature\n"
        branch_result.stderr = ""

        # git log shows unpushed commits (non-zero returncode simulates remote branch absent)
        log_result = mock.MagicMock()
        log_result.returncode = 128  # remote branch doesn't exist yet
        log_result.stdout = ""
        log_result.stderr = "unknown revision"

        push_result = mock.MagicMock()
        push_result.returncode = 1  # push failed
        push_result.stdout = ""
        push_result.stderr = "error: failed to push some refs"

        call_results = iter([branch_result, log_result, push_result])

        with mock.patch("subprocess.run", side_effect=lambda *a, **kw: next(call_results)):
            result = manager.push_to_origin()

        assert result is False

    def test_exception_during_push_returns_false(self, tmp_path: Path) -> None:
        """When subprocess.run raises an unexpected exception, push_to_origin returns False."""
        manager = self._manager_with_git(tmp_path)

        with mock.patch("subprocess.run", side_effect=OSError("pipe broken")):
            result = manager.push_to_origin()

        assert result is False

    def test_no_git_repo_returns_false(self, tmp_path: Path) -> None:
        """push_to_origin returns False immediately when there is no .git directory."""
        manager = GitManager(tmp_path)  # no .git created

        with mock.patch("subprocess.run") as mock_run:
            result = manager.push_to_origin()

        assert result is False
        mock_run.assert_not_called()


# ---------------------------------------------------------------------------
# Finding 23 — commit_verified_changes() critical paths
# ---------------------------------------------------------------------------


class TestCommitVerifiedChangesCriticalPaths:
    """Finding 23: commit_verified_changes staging, empty-status, and commit-failure paths."""

    def _manager_with_git(self, tmp_path: Path) -> GitManager:
        (tmp_path / ".git").mkdir()
        return GitManager(tmp_path)

    def test_explicit_files_to_stage_calls_git_add_for_each(self, tmp_path: Path) -> None:
        """When files_to_stage=['foo.py'] is passed, git add foo.py must be called."""
        manager = self._manager_with_git(tmp_path)

        add_calls: list[list[str]] = []

        def _mock_run_cmd(args: list[str], check: bool = True, timeout: int = 60) -> str:
            cmd = args[0] if args else ""
            sub = args[1] if len(args) > 1 else ""
            if cmd == "git" and sub == "add":
                add_calls.append(args)
                return ""
            if cmd == "git" and sub == "diff":
                # _check_staged_files_for_sensitive_patterns — no sensitive files
                return ""
            if cmd == "git" and sub == "status":
                # Return non-empty to signal something to commit
                return "M foo.py"
            if cmd == "git" and sub == "commit":
                return "1 file changed"
            return ""

        with mock.patch.object(manager, "_run_cmd", side_effect=_mock_run_cmd):
            manager.commit_verified_changes("Add foo.py", files_to_stage=["foo.py"])

        staged_files = [call[2] for call in add_calls]
        assert "foo.py" in staged_files

    def test_empty_git_status_skips_commit(self, tmp_path: Path) -> None:
        """When git status --porcelain returns empty, commit_verified_changes must not commit."""
        manager = self._manager_with_git(tmp_path)

        commit_called = False

        def _mock_run_cmd(args: list[str], check: bool = True, timeout: int = 60) -> str:
            nonlocal commit_called
            cmd = args[0] if args else ""
            sub = args[1] if len(args) > 1 else ""
            if cmd == "git" and sub == "add":
                return ""
            if cmd == "git" and sub == "diff":
                return ""
            if cmd == "git" and sub == "status":
                return ""  # empty — nothing to commit
            if cmd == "git" and sub == "commit":
                commit_called = True
                return ""
            return ""

        with mock.patch.object(manager, "_run_cmd", side_effect=_mock_run_cmd):
            manager.commit_verified_changes("Should not commit", files_to_stage=["foo.py"])

        assert not commit_called, "commit should not be called when git status is empty"

    def test_commit_failure_triggers_git_reset_head(self, tmp_path: Path) -> None:
        """When git commit raises RuntimeError, git reset HEAD must be called to unstage."""
        manager = self._manager_with_git(tmp_path)

        reset_calls: list[list[str]] = []

        def _mock_run_cmd(args: list[str], check: bool = True, timeout: int = 60) -> str:
            cmd = args[0] if args else ""
            sub = args[1] if len(args) > 1 else ""
            if cmd == "git" and sub == "add":
                return ""
            if cmd == "git" and sub == "diff":
                # _check_staged_files_for_sensitive_patterns — no sensitive files
                return ""
            if cmd == "git" and sub == "status":
                # Return non-empty so the commit branch is entered
                return "M foo.py"
            if cmd == "git" and sub == "commit":
                raise RuntimeError("pre-commit hook failed")
            if cmd == "git" and sub == "reset":
                reset_calls.append(args)
                return ""
            return ""

        with mock.patch.object(manager, "_run_cmd", side_effect=_mock_run_cmd):
            # commit_verified_changes swallows the re-raised RuntimeError via the outer
            # except Exception handler, so it should not propagate to the caller.
            manager.commit_verified_changes("Failing commit", files_to_stage=["foo.py"])

        assert any(len(call) >= 3 and call[2] == "HEAD" for call in reset_calls), (
            "git reset HEAD must be called when commit fails"
        )


# ---------------------------------------------------------------------------
# Finding 24 — malformed config.json handler
# ---------------------------------------------------------------------------


class TestMalformedConfigJson:
    """Finding 24: GitManager silently handles invalid JSON in .codelicious/config.json."""

    def test_invalid_json_config_results_in_empty_dict(self, tmp_path: Path) -> None:
        """When config.json contains invalid JSON, self.config must equal {} (not raise)."""
        codelicious_dir = tmp_path / ".codelicious"
        codelicious_dir.mkdir()
        config_file = codelicious_dir / "config.json"
        config_file.write_text("{not valid json", encoding="utf-8")

        manager = GitManager(tmp_path)

        assert manager.config == {}, "config must be an empty dict when JSON is malformed"

    def test_invalid_json_config_logs_error(self, tmp_path: Path, caplog: pytest.LogCaptureFixture) -> None:
        """When config.json contains invalid JSON, an error must be logged."""
        codelicious_dir = tmp_path / ".codelicious"
        codelicious_dir.mkdir()
        config_file = codelicious_dir / "config.json"
        config_file.write_text("<<<malformed>>>", encoding="utf-8")

        with caplog.at_level("ERROR", logger="codelicious.git"):
            GitManager(tmp_path)

        assert any("config.json" in record.message for record in caplog.records), (
            "An error log mentioning config.json must be emitted when parsing fails"
        )

    def test_valid_json_config_loaded_correctly(self, tmp_path: Path) -> None:
        """When config.json is valid JSON, it must be loaded into self.config."""
        codelicious_dir = tmp_path / ".codelicious"
        codelicious_dir.mkdir()
        config_file = codelicious_dir / "config.json"
        config_file.write_text('{"default_reviewers": ["alice", "bob"]}', encoding="utf-8")

        manager = GitManager(tmp_path)

        assert manager.config == {"default_reviewers": ["alice", "bob"]}

    def test_missing_config_json_results_in_empty_dict(self, tmp_path: Path) -> None:
        """When config.json does not exist, self.config must equal {} (no error)."""
        manager = GitManager(tmp_path)
        assert manager.config == {}


# ---------------------------------------------------------------------------
# Finding 74 — _run_cmd timeout and non-zero exit paths
# ---------------------------------------------------------------------------


class TestRunCmdTimeoutAndCheck:
    """Finding 74: _run_cmd raises GitOperationError on timeout and RuntimeError on non-zero exit."""

    def _manager_with_git(self, tmp_path: Path) -> GitManager:
        (tmp_path / ".git").mkdir()
        return GitManager(tmp_path)

    def test_timeout_expired_raises_git_operation_error(self, tmp_path: Path) -> None:
        """When subprocess.run raises TimeoutExpired, _run_cmd must raise GitOperationError."""
        from codelicious.errors import GitOperationError

        manager = self._manager_with_git(tmp_path)
        with mock.patch(
            "subprocess.run",
            side_effect=subprocess.TimeoutExpired(cmd=["git", "status"], timeout=60),
        ):
            with pytest.raises(GitOperationError, match="timed out"):
                manager._run_cmd(["git", "status"])

    def test_nonzero_exit_with_check_raises_runtime_error(self, tmp_path: Path) -> None:
        """When subprocess.run returns non-zero and check=True, _run_cmd must raise RuntimeError."""
        manager = self._manager_with_git(tmp_path)
        failing_result = mock.MagicMock()
        failing_result.returncode = 128
        failing_result.stdout = ""
        failing_result.stderr = "fatal: not a git repository"

        with mock.patch("subprocess.run", return_value=failing_result):
            with pytest.raises(RuntimeError, match="failed"):
                manager._run_cmd(["git", "status"], check=True)

    def test_nonzero_exit_with_check_false_returns_stdout(self, tmp_path: Path) -> None:
        """When check=False, a non-zero exit must not raise; stdout is returned."""
        manager = self._manager_with_git(tmp_path)
        result_mock = mock.MagicMock()
        result_mock.returncode = 1
        result_mock.stdout = "some output\n"
        result_mock.stderr = ""

        with mock.patch("subprocess.run", return_value=result_mock):
            output = manager._run_cmd(["git", "log"], check=False)

        assert output == "some output"

    def test_timeout_message_includes_command(self, tmp_path: Path) -> None:
        """The GitOperationError message must mention the timed-out command."""
        from codelicious.errors import GitOperationError

        manager = self._manager_with_git(tmp_path)
        with mock.patch(
            "subprocess.run",
            side_effect=subprocess.TimeoutExpired(cmd=["git", "push"], timeout=30),
        ):
            with pytest.raises(GitOperationError) as exc_info:
                manager._run_cmd(["git", "push"])

        assert "git" in str(exc_info.value).lower()


# ---------------------------------------------------------------------------
# Finding 75 — _check_staged_files_for_sensitive_patterns RuntimeError path
# ---------------------------------------------------------------------------


class TestCheckStagedFilesSilentRuntimeError:
    """Finding 75: when _run_cmd raises RuntimeError inside _check_staged_files_for_sensitive_patterns,
    the method silently catches it and returns an empty list."""

    def _manager_with_git(self, tmp_path: Path) -> GitManager:
        (tmp_path / ".git").mkdir()
        return GitManager(tmp_path)

    def test_runtime_error_from_run_cmd_returns_empty_list(self, tmp_path: Path) -> None:
        """RuntimeError from _run_cmd must be silently caught; empty list is returned."""
        manager = self._manager_with_git(tmp_path)

        with mock.patch.object(manager, "_run_cmd", side_effect=RuntimeError("git diff failed")):
            result = manager._check_staged_files_for_sensitive_patterns()

        assert result == [], "Should return empty list when _run_cmd raises RuntimeError"

    def test_no_staged_files_returns_empty_list(self, tmp_path: Path) -> None:
        """When git diff --cached returns empty output, the result is an empty list."""
        manager = self._manager_with_git(tmp_path)

        with mock.patch.object(manager, "_run_cmd", return_value=""):
            result = manager._check_staged_files_for_sensitive_patterns()

        assert result == []


# ---------------------------------------------------------------------------
# Finding 76 — ensure_draft_pr_exists timeout/error paths
# ---------------------------------------------------------------------------


class TestEnsureDraftPrExistsTimeoutPaths:
    """Finding 76: ensure_draft_pr_exists handles gh --version timeout and 'unknown' branch."""

    def _manager_with_git(self, tmp_path: Path) -> GitManager:
        (tmp_path / ".git").mkdir()
        return GitManager(tmp_path)

    def test_gh_version_timeout_skips_pr_creation(self, tmp_path: Path) -> None:
        """When gh --version times out, no PR is created and no exception is raised."""
        manager = self._manager_with_git(tmp_path)

        with mock.patch(
            "subprocess.run",
            side_effect=subprocess.TimeoutExpired(cmd=["gh", "--version"], timeout=60),
        ) as mock_run:
            # Must not raise
            manager.ensure_draft_pr_exists("some spec")

        # Only gh --version was attempted; gh pr create must never be called
        calls = mock_run.call_args_list
        create_calls = [c for c in calls if c.args and "create" in c.args[0]]
        assert len(create_calls) == 0

    def test_unknown_branch_skips_pr_creation(self, tmp_path: Path) -> None:
        """When current_branch returns 'unknown', PR creation is skipped."""
        manager = self._manager_with_git(tmp_path)

        gh_version_ok = mock.MagicMock()
        gh_version_ok.returncode = 0

        with mock.patch.object(type(manager), "current_branch", new_callable=mock.PropertyMock, return_value="unknown"):
            with mock.patch("subprocess.run", return_value=gh_version_ok) as mock_run:
                manager.ensure_draft_pr_exists("spec summary")

        # gh pr list and gh pr create must not be called
        calls = mock_run.call_args_list
        list_calls = [c for c in calls if c.args and "list" in c.args[0]]
        create_calls = [c for c in calls if c.args and "create" in c.args[0]]
        assert len(list_calls) == 0
        assert len(create_calls) == 0


# ---------------------------------------------------------------------------
# Finding 77 — transition_pr_to_review()
# ---------------------------------------------------------------------------


class TestTransitionPrToReview:
    """Finding 77: transition_pr_to_review calls gh pr ready and gh pr edit for reviewers."""

    def _manager_with_git(self, tmp_path: Path, reviewers: list[str] | None = None) -> GitManager:
        """Return a GitManager with optional reviewers set in self.config."""
        (tmp_path / ".git").mkdir()
        manager = GitManager(tmp_path)
        if reviewers is not None:
            manager.config = {"default_reviewers": reviewers}
        return manager

    def test_reviewers_in_config_calls_gh_pr_ready_and_gh_pr_edit(self, tmp_path: Path) -> None:
        """With reviewers configured, both 'gh pr ready' and 'gh pr edit' must be called."""
        manager = self._manager_with_git(tmp_path, reviewers=["alice", "bob"])

        gh_version_ok = mock.MagicMock()
        gh_version_ok.returncode = 0
        gh_ready_result = mock.MagicMock()
        gh_ready_result.returncode = 0
        gh_edit_result = mock.MagicMock()
        gh_edit_result.returncode = 0

        call_log: list[list[str]] = []

        def _side_effect(cmd, **kwargs):
            call_log.append(list(cmd))
            if "version" in cmd:
                return gh_version_ok
            if "ready" in cmd:
                return gh_ready_result
            if "edit" in cmd:
                return gh_edit_result
            return mock.MagicMock(returncode=0)

        with mock.patch("subprocess.run", side_effect=_side_effect):
            manager.transition_pr_to_review()

        ready_calls = [c for c in call_log if "ready" in c]
        edit_calls = [c for c in call_log if "edit" in c]
        assert len(ready_calls) >= 1, "gh pr ready must be called"
        assert len(edit_calls) >= 1, "gh pr edit must be called to assign reviewers"

    def test_gh_pr_edit_contains_reviewer_args(self, tmp_path: Path) -> None:
        """gh pr edit must include --reviewer alice and --reviewer bob."""
        manager = self._manager_with_git(tmp_path, reviewers=["alice", "bob"])

        gh_version_ok = mock.MagicMock()
        gh_version_ok.returncode = 0

        edit_cmd: list[str] = []

        def _side_effect(cmd, **kwargs):
            if "version" in cmd:
                return gh_version_ok
            if "edit" in cmd:
                edit_cmd.extend(cmd)
            return mock.MagicMock(returncode=0)

        with mock.patch("subprocess.run", side_effect=_side_effect):
            manager.transition_pr_to_review()

        assert "--reviewer" in edit_cmd, "--reviewer flag must appear in gh pr edit call"
        assert "alice" in edit_cmd
        assert "bob" in edit_cmd

    def test_gh_pr_ready_timeout_logs_warning_and_continues(
        self, tmp_path: Path, caplog: pytest.LogCaptureFixture
    ) -> None:
        """When 'gh pr ready' times out, a warning is logged and execution continues."""
        manager = self._manager_with_git(tmp_path, reviewers=[])

        gh_version_ok = mock.MagicMock()
        gh_version_ok.returncode = 0

        def _side_effect(cmd, **kwargs):
            if "version" in cmd:
                return gh_version_ok
            if "ready" in cmd:
                raise subprocess.TimeoutExpired(cmd=list(cmd), timeout=60)
            return mock.MagicMock(returncode=0)

        with caplog.at_level("WARNING", logger="codelicious.git"):
            with mock.patch("subprocess.run", side_effect=_side_effect):
                # Must not raise even though gh pr ready timed out
                manager.transition_pr_to_review()

        assert any("timed out" in r.message.lower() or "timeout" in r.message.lower() for r in caplog.records)

    def test_no_reviewers_skips_gh_pr_edit(self, tmp_path: Path) -> None:
        """When default_reviewers is empty, gh pr edit must not be called."""
        manager = self._manager_with_git(tmp_path, reviewers=[])

        gh_version_ok = mock.MagicMock()
        gh_version_ok.returncode = 0

        call_log: list[list[str]] = []

        def _side_effect(cmd, **kwargs):
            call_log.append(list(cmd))
            if "version" in cmd:
                return gh_version_ok
            return mock.MagicMock(returncode=0)

        with mock.patch("subprocess.run", side_effect=_side_effect):
            manager.transition_pr_to_review()

        edit_calls = [c for c in call_log if "edit" in c]
        assert len(edit_calls) == 0, "gh pr edit must not be called when there are no reviewers"

    def test_no_git_repo_returns_early(self, tmp_path: Path) -> None:
        """transition_pr_to_review returns immediately when there is no .git directory."""
        manager = GitManager(tmp_path)  # no .git created

        with mock.patch("subprocess.run") as mock_run:
            manager.transition_pr_to_review()

        mock_run.assert_not_called()
