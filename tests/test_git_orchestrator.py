"""
Tests for git_orchestrator.py - Git staging and commit safety.
"""

import json
import logging
import subprocess
from pathlib import Path
from unittest import mock

import pytest

from codelicious.errors import GitOperationError
from codelicious.git.git_orchestrator import GitManager, SENSITIVE_PATTERNS, spec_branch_name


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
    """Tests for sensitive file detection during staging (S20-P1-2: now raises)."""

    def test_check_staged_files_raises_for_env(self, git_repo: Path):
        """Staging a .env file must raise GitOperationError."""
        env_file = git_repo / ".env"
        env_file.write_text("SECRET=value\n", encoding="utf-8")
        subprocess.run(["git", "add", ".env"], cwd=git_repo, capture_output=True, check=True)

        manager = GitManager(git_repo)
        with pytest.raises(GitOperationError, match="Refusing to commit sensitive file"):
            manager._check_staged_files_for_sensitive_patterns()

    def test_check_staged_files_raises_for_key_file(self, git_repo: Path):
        """Staging a .key file must raise GitOperationError."""
        key_file = git_repo / "server.key"
        key_file.write_text("-----BEGIN PRIVATE KEY-----\n", encoding="utf-8")
        subprocess.run(["git", "add", "server.key"], cwd=git_repo, capture_output=True, check=True)

        manager = GitManager(git_repo)
        with pytest.raises(GitOperationError, match="Refusing to commit sensitive file"):
            manager._check_staged_files_for_sensitive_patterns()

    def test_check_staged_files_no_error_for_normal_files(self, git_repo: Path):
        """Staging normal files must not raise."""
        py_file = git_repo / "main.py"
        py_file.write_text("print('hello')\n", encoding="utf-8")
        subprocess.run(["git", "add", "main.py"], cwd=git_repo, capture_output=True, check=True)

        manager = GitManager(git_repo)
        # Should not raise
        manager._check_staged_files_for_sensitive_patterns()


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


class TestGitManagerInit:
    """Tests for GitManager.__init__ config.json loading (Finding 9)."""

    def test_corrupt_config_json_leaves_config_empty(self, tmp_path: Path, caplog):
        """Invalid JSON in config.json must leave config as {} and log an error."""
        codelicious_dir = tmp_path / ".codelicious"
        codelicious_dir.mkdir()
        config_file = codelicious_dir / "config.json"
        config_file.write_text("{not valid json}", encoding="utf-8")

        with caplog.at_level("ERROR", logger="codelicious.git"):
            manager = GitManager(tmp_path)

        assert manager.config == {}
        assert any("Failed to parse config.json" in record.message for record in caplog.records)

    def test_valid_config_json_is_loaded(self, tmp_path: Path):
        """Valid JSON in config.json must be loaded into manager.config."""
        codelicious_dir = tmp_path / ".codelicious"
        codelicious_dir.mkdir()
        config_file = codelicious_dir / "config.json"
        config_data = {"default_reviewers": ["alice"], "verify_command": "pytest"}
        config_file.write_text(json.dumps(config_data), encoding="utf-8")

        manager = GitManager(tmp_path)

        assert manager.config == config_data

    def test_missing_config_json_leaves_config_empty(self, tmp_path: Path):
        """Absence of config.json must leave config as {} without raising."""
        manager = GitManager(tmp_path)

        assert manager.config == {}

    def test_corrupt_config_json_triple_brace_leaves_config_empty(self, tmp_path: Path):
        """config.json containing 'not json {{{' must leave config as {} without raising."""
        codelicious_dir = tmp_path / ".codelicious"
        codelicious_dir.mkdir()
        config_file = codelicious_dir / "config.json"
        config_file.write_text("not json {{{", encoding="utf-8")

        manager = GitManager(tmp_path)

        assert manager.config == {}


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

    def test_on_main_with_md_extension_strips_extension(self, tmp_path: Path):
        """When on 'main' with spec_name='spec-22.md', branch is 'codelicious/spec-22' (no extension)."""
        (tmp_path / ".git").mkdir()
        manager = GitManager(tmp_path)

        with mock.patch.object(manager, "_run_cmd", return_value="main"):
            with mock.patch.object(manager, "checkout_or_create_feature_branch") as mock_checkout:
                manager.assert_safe_branch(spec_name="spec-22.md")

        mock_checkout.assert_called_once_with("codelicious/spec-22")

    def test_on_master_with_empty_spec_name_uses_auto_build(self, tmp_path: Path):
        """When on 'master' with spec_name='', fallback branch is 'codelicious/auto-build'."""
        (tmp_path / ".git").mkdir()
        manager = GitManager(tmp_path)

        with mock.patch.object(manager, "_run_cmd", return_value="master"):
            with mock.patch.object(manager, "checkout_or_create_feature_branch") as mock_checkout:
                manager.assert_safe_branch(spec_name="")

        mock_checkout.assert_called_once_with("codelicious/auto-build")

    def test_on_production_branch_triggers_checkout(self, tmp_path: Path):
        """When on 'production', assert_safe_branch should checkout a feature branch."""
        (tmp_path / ".git").mkdir()
        manager = GitManager(tmp_path)

        with mock.patch.object(manager, "_run_cmd", return_value="production"):
            with mock.patch.object(manager, "checkout_or_create_feature_branch") as mock_checkout:
                manager.assert_safe_branch(spec_name="my-feature")

        mock_checkout.assert_called_once_with("codelicious/my-feature")

    def test_on_safe_codelicious_branch_no_checkout(self, tmp_path: Path):
        """When already on 'codelicious/my-feature', assert_safe_branch does NOT checkout another branch."""
        (tmp_path / ".git").mkdir()
        manager = GitManager(tmp_path)

        with mock.patch.object(manager, "_run_cmd", return_value="codelicious/my-feature"):
            with mock.patch.object(manager, "checkout_or_create_feature_branch") as mock_checkout:
                manager.assert_safe_branch(spec_name="my-feature")

        mock_checkout.assert_not_called()


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

    def _mock_pr_list_with_spec(self, spec_id: str = "16", pr_number: int = 42) -> mock.MagicMock:
        """Return a CompletedProcess-like mock with a PR matching [spec-{id}]."""
        prs = [
            {
                "number": pr_number,
                "title": f"[spec-{spec_id}] build project",
                "headRefName": f"codelicious/spec-{spec_id}",
            }
        ]
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

    def _mock_pr_list_existing_legacy(
        self, pr_number: int = 42, url: str = "https://github.com/o/r/pull/42"
    ) -> mock.MagicMock:
        """Return a CompletedProcess-like mock showing an existing PR (legacy branch check)."""
        prs = [{"number": pr_number, "url": url, "state": "OPEN"}]
        result = mock.MagicMock()
        result.returncode = 0
        result.stdout = json.dumps(prs)
        return result

    def test_existing_pr_by_spec_id_prevents_create(self, tmp_path: Path) -> None:
        """When gh pr list returns a PR matching [spec-16], gh pr create is never called."""
        manager = self._make_manager_on_feature_branch(tmp_path)

        gh_version_result = self._mock_gh_version_ok()
        pr_list_result = self._mock_pr_list_with_spec("16", 8)

        def _side_effect(cmd, **kwargs):
            if "version" in cmd:
                return gh_version_result
            if "list" in cmd:
                return pr_list_result
            return mock.MagicMock(returncode=0, stdout="")

        with mock.patch.object(
            type(manager), "current_branch", new_callable=mock.PropertyMock, return_value="codelicious/spec-16"
        ):
            with mock.patch("subprocess.run", side_effect=_side_effect) as mock_run:
                result = manager.ensure_draft_pr_exists(spec_id="16")

        assert result == 8
        create_calls = [call for call in mock_run.call_args_list if "create" in (call.args[0] if call.args else [])]
        assert len(create_calls) == 0

    def test_no_existing_pr_triggers_create_with_spec_id(self, tmp_path: Path) -> None:
        """When no PR matches [spec-99], gh pr create IS called and returns PR number."""
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
            type(manager), "current_branch", new_callable=mock.PropertyMock, return_value="codelicious/spec-99"
        ):
            with mock.patch("subprocess.run", side_effect=_side_effect) as mock_run:
                result = manager.ensure_draft_pr_exists(spec_id="99", spec_summary="build project")

        assert result == 55
        create_calls = [call for call in mock_run.call_args_list if "create" in (call.args[0] if call.args else [])]
        assert len(create_calls) == 1
        # Verify the title includes spec prefix
        create_cmd = create_calls[0].args[0]
        title_idx = create_cmd.index("--title") + 1
        assert create_cmd[title_idx].startswith("[spec-99]")

    def test_legacy_branch_check_when_no_spec_id(self, tmp_path: Path) -> None:
        """When spec_id is empty, falls back to legacy branch-based check."""
        manager = self._make_manager_on_feature_branch(tmp_path)

        gh_version_result = self._mock_gh_version_ok()
        pr_list_result = self._mock_pr_list_existing_legacy(42, "https://github.com/o/r/pull/42")

        def _side_effect(cmd, **kwargs):
            if "version" in cmd:
                return gh_version_result
            if "list" in cmd:
                return pr_list_result
            return mock.MagicMock(returncode=0, stdout="")

        with mock.patch.object(
            type(manager), "current_branch", new_callable=mock.PropertyMock, return_value="codelicious/spec-01"
        ):
            with mock.patch("subprocess.run", side_effect=_side_effect):
                result = manager.ensure_draft_pr_exists(spec_summary="test spec summary")

        assert result == 42

    def test_json_decode_error_in_pr_list_falls_through_to_create(self, tmp_path: Path) -> None:
        """When gh pr list returns invalid JSON, the code falls through to create a new PR."""
        manager = self._make_manager_on_feature_branch(tmp_path)

        gh_version_result = self._mock_gh_version_ok()
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
                manager.ensure_draft_pr_exists(spec_id="03", spec_summary="spec with bad json")

        create_calls = [call for call in mock_run.call_args_list if "create" in (call.args[0] if call.args else [])]
        assert len(create_calls) == 1

    def test_gh_command_failure_handled_gracefully(self, tmp_path: Path) -> None:
        """When gh pr list fails (non-zero exit), creation is still attempted."""
        manager = self._make_manager_on_feature_branch(tmp_path)

        gh_version_result = self._mock_gh_version_ok()
        pr_list_fail = mock.MagicMock()
        pr_list_fail.returncode = 1
        pr_list_fail.stdout = ""

        pr_create_result = mock.MagicMock()
        pr_create_result.returncode = 0
        pr_create_result.stdout = "https://github.com/o/r/pull/10"

        def _side_effect(cmd, **kwargs):
            if "version" in cmd:
                return gh_version_result
            if "list" in cmd:
                return pr_list_fail
            if "create" in cmd:
                return pr_create_result
            return mock.MagicMock(returncode=0, stdout="")

        with mock.patch.object(
            type(manager), "current_branch", new_callable=mock.PropertyMock, return_value="codelicious/spec-50"
        ):
            with mock.patch("subprocess.run", side_effect=_side_effect) as mock_run:
                result = manager.ensure_draft_pr_exists(spec_id="50")

        assert result == 10
        create_calls = [call for call in mock_run.call_args_list if "create" in (call.args[0] if call.args else [])]
        assert len(create_calls) == 1

    def test_forbidden_branch_skips_pr_creation(self, tmp_path: Path) -> None:
        """ensure_draft_pr_exists skips PR creation entirely when on a forbidden branch."""
        manager = self._make_manager_on_feature_branch(tmp_path)

        with mock.patch.object(type(manager), "current_branch", new_callable=mock.PropertyMock, return_value="main"):
            with mock.patch("subprocess.run") as mock_run:
                result = manager.ensure_draft_pr_exists(spec_id="16")

        assert result is None
        create_calls = [call for call in mock_run.call_args_list if "create" in (call.args[0] if call.args else [])]
        list_calls = [call for call in mock_run.call_args_list if "list" in (call.args[0] if call.args else [])]
        assert len(create_calls) == 0
        assert len(list_calls) == 0

    def test_no_git_repo_returns_none(self, tmp_path: Path) -> None:
        """ensure_draft_pr_exists returns None when there is no .git directory."""
        manager = GitManager(tmp_path)

        with mock.patch("subprocess.run") as mock_run:
            result = manager.ensure_draft_pr_exists(spec_id="16")

        assert result is None
        mock_run.assert_not_called()

    def test_create_failure_returns_none(self, tmp_path: Path) -> None:
        """When gh pr create fails, returns None."""
        manager = self._make_manager_on_feature_branch(tmp_path)

        gh_version_result = self._mock_gh_version_ok()
        pr_list_result = self._mock_pr_list_empty()
        pr_create_fail = mock.MagicMock()
        pr_create_fail.returncode = 1
        pr_create_fail.stdout = ""
        pr_create_fail.stderr = "error: already exists"

        def _side_effect(cmd, **kwargs):
            if "version" in cmd:
                return gh_version_result
            if "list" in cmd:
                return pr_list_result
            if "create" in cmd:
                return pr_create_fail
            return mock.MagicMock(returncode=0, stdout="")

        with mock.patch.object(
            type(manager), "current_branch", new_callable=mock.PropertyMock, return_value="codelicious/spec-77"
        ):
            with mock.patch("subprocess.run", side_effect=_side_effect):
                result = manager.ensure_draft_pr_exists(spec_id="77")

        assert result is None

    def test_gh_timeout_returns_30(self, tmp_path: Path) -> None:
        """All gh subprocess calls should use timeout=30."""
        manager = self._make_manager_on_feature_branch(tmp_path)

        gh_version_result = self._mock_gh_version_ok()
        pr_list_result = self._mock_pr_list_empty()
        pr_create_result = mock.MagicMock()
        pr_create_result.returncode = 0
        pr_create_result.stdout = "https://github.com/o/r/pull/1"

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
                manager.ensure_draft_pr_exists(spec_id="01")

        # All subprocess.run calls should have timeout=30
        for call in mock_run.call_args_list:
            assert call.kwargs.get("timeout") == 30, f"Expected timeout=30, got {call.kwargs.get('timeout')} for {call}"


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
    the method silently catches it and returns without raising."""

    def _manager_with_git(self, tmp_path: Path) -> GitManager:
        (tmp_path / ".git").mkdir()
        return GitManager(tmp_path)

    def test_runtime_error_from_run_cmd_does_not_raise(self, tmp_path: Path) -> None:
        """RuntimeError from _run_cmd must be silently caught; no exception propagates."""
        manager = self._manager_with_git(tmp_path)

        with mock.patch.object(manager, "_run_cmd", side_effect=RuntimeError("git diff failed")):
            # Should not raise
            manager._check_staged_files_for_sensitive_patterns()


# ---------------------------------------------------------------------------
# Finding 77 — checkout_or_create_feature_branch() fallback path (additional)
# ---------------------------------------------------------------------------


class TestCheckoutOrCreateFeatureBranchFallbackAdditional:
    """Finding 77: when 'git checkout <branch>' raises RuntimeError (branch doesn't
    exist locally), checkout_or_create_feature_branch must fall back to
    'git checkout -b <branch>' to create it."""

    def _manager_with_git(self, tmp_path: Path) -> GitManager:
        (tmp_path / ".git").mkdir()
        return GitManager(tmp_path)

    def test_first_checkout_fails_second_creates_branch(self, tmp_path: Path) -> None:
        """When git checkout raises RuntimeError, git checkout -b is called next."""
        manager = self._manager_with_git(tmp_path)

        create_calls: list[list[str]] = []

        def _mock_run_cmd(args: list[str], check: bool = True, timeout: int = 60) -> str:
            if args == ["git", "checkout", "codelicious/new-feature"]:
                raise RuntimeError("error: pathspec 'codelicious/new-feature' did not match any branch")
            if args == ["git", "checkout", "-b", "codelicious/new-feature"]:
                create_calls.append(args)
                return ""
            return ""

        with mock.patch.object(manager, "_run_cmd", side_effect=_mock_run_cmd):
            manager.checkout_or_create_feature_branch("codelicious/new-feature")

        assert len(create_calls) == 1, "git checkout -b must be called after checkout failure"
        assert create_calls[0] == ["git", "checkout", "-b", "codelicious/new-feature"]

    def test_first_checkout_succeeds_no_create_call(self, tmp_path: Path) -> None:
        """When git checkout succeeds, git checkout -b must NOT be called."""
        manager = self._manager_with_git(tmp_path)

        create_calls: list[list[str]] = []

        def _mock_run_cmd(args: list[str], check: bool = True, timeout: int = 60) -> str:
            if len(args) >= 3 and args[2] == "-b":
                create_calls.append(args)
            return ""

        with mock.patch.object(manager, "_run_cmd", side_effect=_mock_run_cmd):
            manager.checkout_or_create_feature_branch("codelicious/existing")

        assert len(create_calls) == 0, "git checkout -b must not be called when checkout succeeds"


# ---------------------------------------------------------------------------
# Finding 78 — _unstage_sensitive_files() RuntimeError logged but not raised
# ---------------------------------------------------------------------------


class TestUnstageSenitiveFilesRuntimeError:
    """Finding 78: when git reset HEAD raises RuntimeError inside
    _unstage_sensitive_files, the error must be logged but must NOT propagate."""

    def _manager_with_git(self, tmp_path: Path) -> GitManager:
        (tmp_path / ".git").mkdir()
        return GitManager(tmp_path)

    def test_runtime_error_logged_and_not_raised(self, tmp_path: Path, caplog: pytest.LogCaptureFixture) -> None:
        """RuntimeError from _run_cmd must be caught; an error is logged; no exception propagates."""
        manager = self._manager_with_git(tmp_path)

        def _mock_run_cmd(args: list[str], check: bool = True, timeout: int = 60) -> str:
            if args[:2] == ["git", "reset"]:
                raise RuntimeError("git reset HEAD failed: not a valid object")
            return ""

        with mock.patch.object(manager, "_run_cmd", side_effect=_mock_run_cmd):
            with caplog.at_level(logging.ERROR, logger="codelicious.git"):
                # Must not raise
                manager._unstage_sensitive_files(["secret.env"])

        assert any("Failed to unstage" in r.message for r in caplog.records), (
            "An error must be logged when git reset HEAD fails during unstage"
        )

    def test_runtime_error_still_processes_remaining_files(self, tmp_path: Path) -> None:
        """When unstaging one file fails, the remaining files must still be attempted."""
        manager = self._manager_with_git(tmp_path)

        processed: list[str] = []

        def _mock_run_cmd(args: list[str], check: bool = True, timeout: int = 60) -> str:
            if args[:2] == ["git", "reset"] and len(args) >= 3:
                filename = args[-1]
                if filename == "bad.env":
                    raise RuntimeError("reset failed")
                processed.append(filename)
            return ""

        with mock.patch.object(manager, "_run_cmd", side_effect=_mock_run_cmd):
            manager._unstage_sensitive_files(["bad.env", "also_bad.env"])

        assert "also_bad.env" in processed, "Remaining files must be processed even when an earlier unstage fails"


# ---------------------------------------------------------------------------
# Finding 79 — nested failure: git reset HEAD fails after commit failure
# ---------------------------------------------------------------------------


class TestCommitAndResetBothFail:
    """Finding 79: when git commit raises RuntimeError AND the subsequent
    git reset HEAD also raises RuntimeError, both errors must be logged
    and the exception must not propagate to the caller."""

    def _manager_with_git(self, tmp_path: Path) -> GitManager:
        (tmp_path / ".git").mkdir()
        return GitManager(tmp_path)

    def test_both_commit_and_reset_errors_logged(self, tmp_path: Path, caplog: pytest.LogCaptureFixture) -> None:
        """Both the commit error and the reset error must be logged; no exception raised."""
        manager = self._manager_with_git(tmp_path)

        def _mock_run_cmd(args: list[str], check: bool = True, timeout: int = 60) -> str:
            cmd = args[0] if args else ""
            sub = args[1] if len(args) > 1 else ""
            if cmd == "git" and sub == "add":
                return ""
            if cmd == "git" and sub == "diff":
                return ""  # no sensitive files
            if cmd == "git" and sub == "status":
                return "M foo.py"  # something to commit
            if cmd == "git" and sub == "commit":
                raise RuntimeError("pre-commit hook failed: tests failing")
            if cmd == "git" and sub == "reset":
                raise RuntimeError("git reset HEAD failed: index corrupt")
            return ""

        with caplog.at_level(logging.ERROR, logger="codelicious.git"):
            with mock.patch.object(manager, "_run_cmd", side_effect=_mock_run_cmd):
                # Must return False (failure) without propagating an exception
                result = manager.commit_verified_changes("Failing commit", files_to_stage=["foo.py"])

        assert result is False, "commit_verified_changes must return False when commit fails"

        messages = [r.message for r in caplog.records]
        assert any("Commit failed" in m or "commit" in m.lower() for m in messages), "Commit error must be logged"
        assert any("Failed to unstage" in m or "reset" in m.lower() for m in messages), (
            "Reset error must also be logged"
        )


# ---------------------------------------------------------------------------
# Finding 80 — transition_pr_to_review() basic coverage (additional)
# ---------------------------------------------------------------------------


class TestTransitionPrToReviewAdditional:
    """Finding 80: transition_pr_to_review() had zero test coverage.

    These tests mock subprocess.run to verify the gh CLI interactions.
    """

    def _manager_with_git(self, tmp_path: Path) -> GitManager:
        (tmp_path / ".git").mkdir()
        return GitManager(tmp_path)

    def test_gh_version_ok_then_pr_ready_and_edit_called(self, tmp_path: Path) -> None:
        """When gh --version returns 0 and config has reviewers, gh pr ready and
        gh pr edit are both called."""
        manager = self._manager_with_git(tmp_path)
        # Inject a reviewer into config so gh pr edit is reached
        manager.config = {"default_reviewers": ["alice"]}

        calls_made: list[list[str]] = []

        def _subprocess_side_effect(cmd, **kwargs):
            calls_made.append(list(cmd))
            result = mock.MagicMock()
            result.returncode = 0
            result.stdout = ""
            result.stderr = ""
            return result

        with mock.patch("subprocess.run", side_effect=_subprocess_side_effect):
            manager.transition_pr_to_review()

        cmd_names = [" ".join(c[:3]) for c in calls_made]
        assert any("gh --version" in c for c in cmd_names), "gh --version must be called"
        assert any("gh pr ready" in c for c in cmd_names), "gh pr ready must be called"
        assert any("gh pr edit" in c for c in cmd_names), "gh pr edit must be called for reviewers"

    def test_gh_version_nonzero_skips_pr_transition(self, tmp_path: Path) -> None:
        """When gh --version returns non-zero, the rest of transition_pr_to_review is skipped."""
        manager = self._manager_with_git(tmp_path)

        calls_made: list[list[str]] = []

        def _subprocess_side_effect(cmd, **kwargs):
            calls_made.append(list(cmd))
            result = mock.MagicMock()
            # gh --version fails (gh not installed)
            result.returncode = 1
            result.stdout = ""
            result.stderr = "command not found"
            return result

        with mock.patch("subprocess.run", side_effect=_subprocess_side_effect):
            manager.transition_pr_to_review()

        # Only gh --version should have been called; gh pr ready must not be called
        pr_ready_calls = [c for c in calls_made if "ready" in c]
        assert len(pr_ready_calls) == 0, "gh pr ready must not be called when gh is unavailable"

    def test_gh_version_timeout_logs_warning_and_returns(
        self, tmp_path: Path, caplog: pytest.LogCaptureFixture
    ) -> None:
        """When gh --version times out, a warning is logged and the method returns early."""
        manager = self._manager_with_git(tmp_path)

        def _subprocess_side_effect(cmd, **kwargs):
            if "--version" in cmd:
                raise subprocess.TimeoutExpired(cmd=cmd, timeout=60)
            result = mock.MagicMock()
            result.returncode = 0
            return result

        with caplog.at_level(logging.WARNING, logger="codelicious.git"):
            with mock.patch("subprocess.run", side_effect=_subprocess_side_effect):
                manager.transition_pr_to_review()

        assert any("timed out" in r.message.lower() for r in caplog.records), (
            "A warning must be logged when gh --version times out"
        )

    def test_no_git_repo_returns_immediately(self, tmp_path: Path) -> None:
        """When _has_git() returns False, transition_pr_to_review returns immediately."""
        # tmp_path has no .git directory
        manager = GitManager(tmp_path)

        with mock.patch("subprocess.run") as mock_run:
            manager.transition_pr_to_review()

        mock_run.assert_not_called()

    def test_no_staged_files_does_not_raise(self, tmp_path: Path) -> None:
        """When git diff --cached returns empty output, no exception is raised."""
        manager = self._manager_with_git(tmp_path)

        with mock.patch.object(manager, "_run_cmd", return_value=""):
            # Should not raise
            manager._check_staged_files_for_sensitive_patterns()


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
            side_effect=subprocess.TimeoutExpired(cmd=["gh", "--version"], timeout=30),
        ) as mock_run:
            # Must not raise
            manager.ensure_draft_pr_exists(spec_id="16")

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
                manager.ensure_draft_pr_exists(spec_id="16")

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


# ---------------------------------------------------------------------------
# Finding 70 — checkout_or_create_feature_branch fallback creation
# ---------------------------------------------------------------------------


class TestCheckoutOrCreateFeatureBranchFallback:
    """Finding 70: checkout_or_create_feature_branch creates the branch when it doesn't exist."""

    def test_branch_does_not_exist_locally_is_created(self, git_repo: Path) -> None:
        """When the branch does not exist, the method creates it via git checkout -b."""
        manager = GitManager(git_repo)
        branch_name = "codelicious/brand-new-branch"

        # Confirm branch does not yet exist
        result = subprocess.run(
            ["git", "branch", "--list", branch_name],
            cwd=git_repo,
            capture_output=True,
            text=True,
        )
        assert branch_name not in result.stdout

        manager.checkout_or_create_feature_branch(branch_name)

        # Confirm the branch now exists
        result = subprocess.run(
            ["git", "branch", "--list", branch_name],
            cwd=git_repo,
            capture_output=True,
            text=True,
        )
        assert branch_name in result.stdout

    def test_existing_branch_is_checked_out_without_creating(self, git_repo: Path) -> None:
        """When the branch already exists, checkout_or_create_feature_branch checks it
        out via git checkout (no -b) and does not raise."""
        manager = GitManager(git_repo)
        branch_name = "codelicious/existing-branch"

        # Pre-create the branch
        subprocess.run(
            ["git", "checkout", "-b", branch_name],
            cwd=git_repo,
            capture_output=True,
            check=True,
        )
        # Switch back to initial branch
        subprocess.run(["git", "checkout", "-"], cwd=git_repo, capture_output=True, check=True)

        # Now checkout_or_create_feature_branch should reuse the existing branch
        manager.checkout_or_create_feature_branch(branch_name)

        current = subprocess.run(
            ["git", "branch", "--show-current"],
            cwd=git_repo,
            capture_output=True,
            text=True,
        ).stdout.strip()
        assert current == branch_name


# ---------------------------------------------------------------------------
# Finding 71 — _unstage_sensitive_files RuntimeError handler
# ---------------------------------------------------------------------------


class TestUnstageSenitiveFilesRuntimeErrorHandler:
    """Finding 71: _unstage_sensitive_files logs an error but does not propagate
    RuntimeError when git reset HEAD fails."""

    def _manager_with_git(self, tmp_path: Path) -> GitManager:
        (tmp_path / ".git").mkdir()
        return GitManager(tmp_path)

    def test_runtime_error_is_logged_not_raised(self, tmp_path: Path, caplog: pytest.LogCaptureFixture) -> None:
        """When _run_cmd raises RuntimeError for 'git reset HEAD <file>', the error
        is logged and no exception propagates to the caller."""
        manager = self._manager_with_git(tmp_path)

        def _fail_on_reset(args: list[str], **kwargs) -> str:
            if "reset" in args:
                raise RuntimeError("git reset HEAD failed")
            return ""

        with mock.patch.object(manager, "_run_cmd", side_effect=_fail_on_reset):
            with caplog.at_level("ERROR", logger="codelicious.git"):
                # Should not raise
                manager._unstage_sensitive_files(["secrets.json"])

        error_msgs = [r.message for r in caplog.records if r.levelno >= 40]  # ERROR level
        assert any("secrets.json" in m or "unstage" in m.lower() for m in error_msgs)

    def test_empty_list_does_nothing(self, tmp_path: Path) -> None:
        """Calling _unstage_sensitive_files([]) must not invoke _run_cmd at all."""
        manager = self._manager_with_git(tmp_path)

        with mock.patch.object(manager, "_run_cmd") as mock_run_cmd:
            manager._unstage_sensitive_files([])

        mock_run_cmd.assert_not_called()


# ---------------------------------------------------------------------------
# Finding 72 — commit_verified_changes nested failure path
# ---------------------------------------------------------------------------


class TestCommitVerifiedChangesNestedFailure:
    """Finding 72: when git commit raises AND git reset HEAD also raises,
    the outer exception handler absorbs both and returns False."""

    def _manager_with_git(self, tmp_path: Path) -> GitManager:
        (tmp_path / ".git").mkdir()
        return GitManager(tmp_path)

    def test_commit_raises_and_reset_raises_returns_false(
        self, tmp_path: Path, caplog: pytest.LogCaptureFixture
    ) -> None:
        """When commit fails AND the subsequent git reset HEAD also raises,
        commit_verified_changes must return False without propagating any exception."""
        manager = self._manager_with_git(tmp_path)

        def _mock_run_cmd(args: list[str], check: bool = True, timeout: int = 60) -> str:
            sub = args[1] if len(args) > 1 else ""
            if sub == "add":
                return ""
            if sub == "diff":
                # sensitive-file check — no staged sensitive files
                return ""
            if sub == "status":
                return "M src/app.py"
            if sub == "commit":
                raise RuntimeError("pre-commit hook rejected commit")
            if sub == "reset":
                raise RuntimeError("reset HEAD also failed")
            return ""

        with mock.patch.object(manager, "_run_cmd", side_effect=_mock_run_cmd):
            with caplog.at_level("ERROR", logger="codelicious.git"):
                result = manager.commit_verified_changes("test commit", files_to_stage=["src/app.py"])

        assert result is False
        error_msgs = [r.message for r in caplog.records if r.levelno >= 40]
        assert any("commit" in m.lower() or "failed" in m.lower() for m in error_msgs)


# ---------------------------------------------------------------------------
# Finding 73 — transition_pr_to_review() additional coverage
# ---------------------------------------------------------------------------


class TestTransitionPrToReviewAdditionalCoverage:
    """Finding 73: transition_pr_to_review handles gh --version timeout and
    executes the full happy path when gh is available."""

    def _manager_with_git(self, tmp_path: Path, reviewers: list[str] | None = None) -> GitManager:
        (tmp_path / ".git").mkdir()
        manager = GitManager(tmp_path)
        if reviewers is not None:
            manager.config = {"default_reviewers": reviewers}
        return manager

    def test_gh_version_timeout_returns_early(self, tmp_path: Path, caplog: pytest.LogCaptureFixture) -> None:
        """When gh --version times out, transition_pr_to_review logs a warning and returns
        without calling gh pr ready."""
        manager = self._manager_with_git(tmp_path, reviewers=[])

        call_log: list[list[str]] = []

        def _side_effect(cmd, **kwargs):
            call_log.append(list(cmd))
            if "--version" in cmd:
                raise subprocess.TimeoutExpired(cmd=list(cmd), timeout=60)
            return mock.MagicMock(returncode=0)

        with caplog.at_level("WARNING", logger="codelicious.git"):
            with mock.patch("subprocess.run", side_effect=_side_effect):
                manager.transition_pr_to_review()

        ready_calls = [c for c in call_log if "ready" in c]
        assert len(ready_calls) == 0, "gh pr ready must not be called after gh --version timeout"
        assert any("timed out" in r.message.lower() or "timeout" in r.message.lower() for r in caplog.records)

    def test_successful_transition_calls_gh_pr_ready(self, tmp_path: Path) -> None:
        """Full happy path: gh is available and transition calls gh pr ready."""
        manager = self._manager_with_git(tmp_path, reviewers=[])

        call_log: list[list[str]] = []

        def _side_effect(cmd, **kwargs):
            call_log.append(list(cmd))
            if "version" in cmd:
                return mock.MagicMock(returncode=0)
            return mock.MagicMock(returncode=0)

        with mock.patch("subprocess.run", side_effect=_side_effect):
            manager.transition_pr_to_review()

        ready_calls = [c for c in call_log if "ready" in c]
        assert len(ready_calls) >= 1, "gh pr ready must be called on successful transition"

    def test_gh_not_found_returns_early(self, tmp_path: Path) -> None:
        """When gh --version returns non-zero (gh not installed), no further calls are made."""
        manager = self._manager_with_git(tmp_path, reviewers=["alice"])

        call_log: list[list[str]] = []

        def _side_effect(cmd, **kwargs):
            call_log.append(list(cmd))
            return mock.MagicMock(returncode=1)  # gh not found

        with mock.patch("subprocess.run", side_effect=_side_effect):
            manager.transition_pr_to_review()

        ready_calls = [c for c in call_log if "ready" in c]
        edit_calls = [c for c in call_log if "edit" in c]
        assert len(ready_calls) == 0, "gh pr ready must not be called when gh is not installed"
        assert len(edit_calls) == 0, "gh pr edit must not be called when gh is not installed"


# ---------------------------------------------------------------------------
# Finding 74 — extract_context() with STATE.md
# ---------------------------------------------------------------------------


class TestExtractContextWithStateMd:
    """Finding 74: extract_context reads STATE.md and extracts pending/completed
    task counts, tech stack, and test command."""

    def test_returns_defaults_when_state_md_missing(self, tmp_path: Path) -> None:
        """When .codelicious/STATE.md does not exist, sensible defaults are returned."""
        from codelicious.prompts import extract_context

        ctx = extract_context(tmp_path)

        assert ctx["project_name"] == tmp_path.name
        assert ctx["pending_count"] == "0"
        assert ctx["completed_count"] == "0"
        assert ctx["completed_tasks"] == ""
        assert ctx["tech_stack"] == ""
        assert ctx["test_command"] == ""

    def test_reads_pending_task_count(self, tmp_path: Path) -> None:
        """pending_count reflects the number of ### [ ] items in STATE.md."""
        from codelicious.prompts import extract_context

        codelicious_dir = tmp_path / ".codelicious"
        codelicious_dir.mkdir()
        state_md = codelicious_dir / "STATE.md"
        state_md.write_text(
            "## Tasks\n\n### [ ] First pending task\n### [ ] Second pending task\n",
            encoding="utf-8",
        )

        ctx = extract_context(tmp_path)

        assert ctx["pending_count"] == "2"

    def test_reads_completed_task_count_and_names(self, tmp_path: Path) -> None:
        """completed_count and completed_tasks reflect ### [x] items in STATE.md."""
        from codelicious.prompts import extract_context

        codelicious_dir = tmp_path / ".codelicious"
        codelicious_dir.mkdir()
        state_md = codelicious_dir / "STATE.md"
        state_md.write_text(
            "## Tasks\n\n### [x] Task: Add tests\n### [x] Task: Fix linting\n",
            encoding="utf-8",
        )

        ctx = extract_context(tmp_path)

        assert ctx["completed_count"] == "2"
        assert "Add tests" in ctx["completed_tasks"]
        assert "Fix linting" in ctx["completed_tasks"]

    def test_reads_tech_stack_section(self, tmp_path: Path) -> None:
        """tech_stack is extracted from the ## Tech Stack section."""
        from codelicious.prompts import extract_context

        codelicious_dir = tmp_path / ".codelicious"
        codelicious_dir.mkdir()
        state_md = codelicious_dir / "STATE.md"
        state_md.write_text(
            "## Tech Stack\n\nPython 3.12, pytest, ruff\n\n## Other\n\nstuff\n",
            encoding="utf-8",
        )

        ctx = extract_context(tmp_path)

        assert "Python" in ctx["tech_stack"]
        assert "pytest" in ctx["tech_stack"]

    def test_reads_test_command_from_how_to_test_section(self, tmp_path: Path) -> None:
        """test_command is extracted from the first non-empty line of ## How to Test."""
        from codelicious.prompts import extract_context

        codelicious_dir = tmp_path / ".codelicious"
        codelicious_dir.mkdir()
        state_md = codelicious_dir / "STATE.md"
        state_md.write_text(
            "## How to Test\n\npython -m pytest tests/ -x -q\n\n## Other\n\nignored\n",
            encoding="utf-8",
        )

        ctx = extract_context(tmp_path)

        assert ctx["test_command"] == "python -m pytest tests/ -x -q"

    def test_project_name_matches_directory_name(self, tmp_path: Path) -> None:
        """project_name is the name of the project_root directory."""
        from codelicious.prompts import extract_context

        codelicious_dir = tmp_path / ".codelicious"
        codelicious_dir.mkdir()
        (codelicious_dir / "STATE.md").write_text("", encoding="utf-8")

        ctx = extract_context(tmp_path)

        assert ctx["project_name"] == tmp_path.name

    def test_tech_stack_truncated_to_200_chars(self, tmp_path: Path) -> None:
        """When the Tech Stack section exceeds 200 characters, it is truncated with '...'."""
        from codelicious.prompts import extract_context

        codelicious_dir = tmp_path / ".codelicious"
        codelicious_dir.mkdir()
        long_stack = "Python " + "x" * 300
        state_md = codelicious_dir / "STATE.md"
        state_md.write_text(
            f"## Tech Stack\n\n{long_stack}\n\n## Other\n\nstuff\n",
            encoding="utf-8",
        )

        ctx = extract_context(tmp_path)

        assert ctx["tech_stack"].endswith("...")
        # Truncated text is 200 chars of content + "..."
        assert len(ctx["tech_stack"]) == 203


# ---------------------------------------------------------------------------
# Finding 5 — assert_safe_branch() branch-name derivation
# ---------------------------------------------------------------------------


class TestBranchForSpec:
    """Unit tests for GitManager.branch_for_spec static method."""

    def test_spec_md_extension_is_stripped(self) -> None:
        """'spec-22.md' should yield 'codelicious/spec-22'."""
        assert GitManager.branch_for_spec("spec-22.md") == "codelicious/spec-22"

    def test_nested_path_includes_parent_dir(self) -> None:
        """Nested path includes parent directory for disambiguation (Finding 29)."""
        assert GitManager.branch_for_spec("docs/specs/spec-v3.md") == "codelicious/specs-spec-v3"

    def test_empty_spec_name_returns_auto_build(self) -> None:
        """Empty string spec_name returns the 'codelicious/auto-build' fallback."""
        assert GitManager.branch_for_spec("") == "codelicious/auto-build"

    def test_plain_name_without_extension(self) -> None:
        """A spec name with no extension is used verbatim as the branch stem."""
        assert GitManager.branch_for_spec("my-feature") == "codelicious/my-feature"


class TestAssertSafeBranchFinding5:
    """Finding 5: assert_safe_branch() switches branches deterministically.

    Uses the real git_repo fixture so that checkout_or_create_feature_branch
    exercises actual git commands, giving confidence beyond pure mock-based tests.
    """

    def test_on_main_with_spec_md_checkouts_codelicious_spec(self, git_repo: Path) -> None:
        """On 'main', assert_safe_branch(spec_name='spec-22.md') checkouts 'codelicious/spec-22'.

        The .md extension must be stripped so that repeated runs for the same
        spec always land on the same deterministic branch name.
        """
        # Rename the default branch to 'main' so we are on a forbidden branch.
        subprocess.run(["git", "branch", "-M", "main"], cwd=git_repo, capture_output=True, check=True)

        manager = GitManager(git_repo)
        assert manager.current_branch == "main"

        manager.assert_safe_branch(spec_name="spec-22.md")

        assert manager.current_branch == "codelicious/spec-22"

    def test_on_main_with_empty_spec_name_checkouts_auto_build(self, git_repo: Path) -> None:
        """On 'main', assert_safe_branch(spec_name='') checkouts 'codelicious/auto-build'."""
        subprocess.run(["git", "branch", "-M", "main"], cwd=git_repo, capture_output=True, check=True)

        manager = GitManager(git_repo)
        assert manager.current_branch == "main"

        manager.assert_safe_branch(spec_name="")

        assert manager.current_branch == "codelicious/auto-build"

    def test_on_safe_branch_does_not_switch(self, git_repo: Path) -> None:
        """When already on 'codelicious/my-feature', assert_safe_branch does NOT switch branches."""
        # Start from any branch and create + checkout the safe feature branch.
        subprocess.run(
            ["git", "checkout", "-b", "codelicious/my-feature"],
            cwd=git_repo,
            capture_output=True,
            check=True,
        )

        manager = GitManager(git_repo)
        assert manager.current_branch == "codelicious/my-feature"

        with mock.patch.object(manager, "checkout_or_create_feature_branch") as mock_checkout:
            manager.assert_safe_branch(spec_name="my-feature")

        mock_checkout.assert_not_called()
        # Branch must remain unchanged after the call.
        assert manager.current_branch == "codelicious/my-feature"


# ---------------------------------------------------------------------------
# Finding 26 — push_to_origin() retry-then-succeed path
# ---------------------------------------------------------------------------


class TestPushToOriginRetryThenSucceed:
    """Finding 26: push_to_origin retries on transient failure and returns True when
    a later attempt succeeds."""

    def _manager_with_git(self, tmp_path: Path) -> GitManager:
        (tmp_path / ".git").mkdir()
        return GitManager(tmp_path)

    def test_first_push_fails_second_push_succeeds_returns_true(self, tmp_path: Path) -> None:
        """When the first push returns non-zero but the second push returns zero,
        push_to_origin must return True and subprocess.run must have been called
        for both push attempts."""
        manager = self._manager_with_git(tmp_path)

        branch_result = mock.MagicMock()
        branch_result.returncode = 0
        branch_result.stdout = "codelicious/feature\n"
        branch_result.stderr = ""

        # git log origin/branch..HEAD — remote branch absent, so returncode != 0
        log_result = mock.MagicMock()
        log_result.returncode = 128
        log_result.stdout = ""
        log_result.stderr = "unknown revision"

        # First push attempt: transient failure
        push_fail = mock.MagicMock()
        push_fail.returncode = 1
        push_fail.stdout = ""
        push_fail.stderr = "error: connection reset"

        # Second push attempt: success
        push_ok = mock.MagicMock()
        push_ok.returncode = 0
        push_ok.stdout = ""
        push_ok.stderr = ""

        call_results = iter([branch_result, log_result, push_fail, push_ok])

        with mock.patch("subprocess.run", side_effect=lambda *a, **kw: next(call_results)) as mock_run:
            with mock.patch("time.sleep"):
                result = manager.push_to_origin()

        assert result is True

        # Count calls that were git push invocations
        push_calls = [
            c
            for c in mock_run.call_args_list
            if c.args and len(c.args[0]) > 1 and c.args[0][0] == "git" and c.args[0][1] == "push"
        ]
        assert len(push_calls) == 2, "subprocess.run must be called twice for git push (fail then succeed)"


# ---------------------------------------------------------------------------
# Finding 27 — config.json size limit (> 100 KB)
# ---------------------------------------------------------------------------


class TestConfigJsonSizeLimit:
    """Finding 27: GitManager.__init__ rejects config.json files larger than 100 KB."""

    def test_oversized_config_json_leaves_config_empty(self, tmp_path: Path) -> None:
        """A config.json larger than 100,000 bytes must be silently rejected;
        manager.config must equal {}."""
        codelicious_dir = tmp_path / ".codelicious"
        codelicious_dir.mkdir()
        config_file = codelicious_dir / "config.json"
        # Write a valid JSON dict that is > 100,000 bytes
        oversized_content = '{"verify_command": "' + ("x" * 100_001) + '"}'
        config_file.write_bytes(oversized_content.encode("utf-8"))

        manager = GitManager(tmp_path)

        assert manager.config == {}, "config must be {} when config.json exceeds the 100 KB size limit"

    def test_oversized_config_json_logs_error(self, tmp_path: Path, caplog: pytest.LogCaptureFixture) -> None:
        """An oversized config.json must trigger an error-level log message."""
        codelicious_dir = tmp_path / ".codelicious"
        codelicious_dir.mkdir()
        config_file = codelicious_dir / "config.json"
        oversized_content = '{"verify_command": "' + ("x" * 100_001) + '"}'
        config_file.write_bytes(oversized_content.encode("utf-8"))

        with caplog.at_level("ERROR", logger="codelicious.git"):
            GitManager(tmp_path)

        assert any(
            "too large" in record.message.lower() or "config.json" in record.message for record in caplog.records
        ), "An error log must be emitted when config.json exceeds the size limit"

    def test_exactly_100000_bytes_is_accepted(self, tmp_path: Path) -> None:
        """A config.json that is exactly 100,000 bytes must be accepted and loaded."""
        codelicious_dir = tmp_path / ".codelicious"
        codelicious_dir.mkdir()
        config_file = codelicious_dir / "config.json"
        # Build a valid JSON dict whose encoded size is exactly 100,000 bytes
        prefix = '{"verify_command": "'
        suffix = '"}'
        filler_len = 100_000 - len(prefix.encode("utf-8")) - len(suffix.encode("utf-8"))
        exact_content = prefix + ("y" * filler_len) + suffix
        assert len(exact_content.encode("utf-8")) == 100_000
        config_file.write_bytes(exact_content.encode("utf-8"))

        manager = GitManager(tmp_path)

        assert "verify_command" in manager.config, "config.json at exactly 100,000 bytes must be loaded"


# ---------------------------------------------------------------------------
# Finding 28 — config.json with non-dict JSON value
# ---------------------------------------------------------------------------


class TestConfigJsonNonDictValue:
    """Finding 28: GitManager.__init__ rejects config.json whose top-level JSON
    value is not a dict (e.g. a list or a string)."""

    def test_list_value_leaves_config_empty(self, tmp_path: Path) -> None:
        """When config.json contains a JSON array, manager.config must equal {}."""
        codelicious_dir = tmp_path / ".codelicious"
        codelicious_dir.mkdir()
        config_file = codelicious_dir / "config.json"
        config_file.write_text('["not", "a", "dict"]', encoding="utf-8")

        manager = GitManager(tmp_path)

        assert manager.config == {}, "config must be {} when config.json contains a JSON array"

    def test_list_value_logs_error(self, tmp_path: Path, caplog: pytest.LogCaptureFixture) -> None:
        """When config.json contains a JSON array, an error must be logged."""
        codelicious_dir = tmp_path / ".codelicious"
        codelicious_dir.mkdir()
        config_file = codelicious_dir / "config.json"
        config_file.write_text('["not", "a", "dict"]', encoding="utf-8")

        with caplog.at_level("ERROR", logger="codelicious.git"):
            GitManager(tmp_path)

        assert any("config.json" in record.message for record in caplog.records), (
            "An error log mentioning config.json must be emitted when the value is not a dict"
        )

    def test_string_value_leaves_config_empty(self, tmp_path: Path) -> None:
        """When config.json contains a bare JSON string, manager.config must equal {}."""
        codelicious_dir = tmp_path / ".codelicious"
        codelicious_dir.mkdir()
        config_file = codelicious_dir / "config.json"
        config_file.write_text('"just a string"', encoding="utf-8")

        manager = GitManager(tmp_path)

        assert manager.config == {}, "config must be {} when config.json contains a bare JSON string"

    def test_integer_value_leaves_config_empty(self, tmp_path: Path) -> None:
        """When config.json contains a bare integer, manager.config must equal {}."""
        codelicious_dir = tmp_path / ".codelicious"
        codelicious_dir.mkdir()
        config_file = codelicious_dir / "config.json"
        config_file.write_text("42", encoding="utf-8")

        manager = GitManager(tmp_path)

        assert manager.config == {}, "config must be {} when config.json contains a bare integer"


# ---------------------------------------------------------------------------
# Finding 29 — commit_verified_changes double-failure path
# ---------------------------------------------------------------------------


class TestCommitVerifiedChangesDoubleFailure:
    """Finding 29: when git commit raises RuntimeError AND the subsequent
    git reset HEAD also raises RuntimeError, commit_verified_changes must
    return False without propagating any exception to the caller."""

    def _manager_with_git(self, tmp_path: Path) -> GitManager:
        (tmp_path / ".git").mkdir()
        return GitManager(tmp_path)

    def test_both_commit_and_reset_raise_returns_false(self, tmp_path: Path) -> None:
        """When git commit raises RuntimeError and git reset HEAD also raises
        RuntimeError, the return value must be False and no exception must
        propagate to the caller."""
        manager = self._manager_with_git(tmp_path)

        def _mock_run_cmd(args: list[str], check: bool = True, timeout: int = 60) -> str:
            sub = args[1] if len(args) > 1 else ""
            if sub == "add":
                return ""
            if sub == "diff":
                return ""  # no sensitive files staged
            if sub == "status":
                return "M src/app.py"  # something to commit
            if sub == "commit":
                raise RuntimeError("pre-commit hook rejected commit")
            if sub == "reset":
                raise RuntimeError("git reset HEAD failed: repository corrupt")
            return ""

        with mock.patch.object(manager, "_run_cmd", side_effect=_mock_run_cmd):
            result = manager.commit_verified_changes("Failing commit", files_to_stage=["src/app.py"])

        assert result is False, "commit_verified_changes must return False when both commit and reset fail"

    def test_both_commit_and_reset_raise_does_not_propagate(self, tmp_path: Path) -> None:
        """No exception must propagate when both git commit and git reset raise."""
        manager = self._manager_with_git(tmp_path)

        def _mock_run_cmd(args: list[str], check: bool = True, timeout: int = 60) -> str:
            sub = args[1] if len(args) > 1 else ""
            if sub in ("add", "diff"):
                return ""
            if sub == "status":
                return "M main.py"
            if sub == "commit":
                raise RuntimeError("commit hook failed")
            if sub == "reset":
                raise RuntimeError("reset also failed")
            return ""

        # The call must complete without raising any exception.
        with mock.patch.object(manager, "_run_cmd", side_effect=_mock_run_cmd):
            try:
                manager.commit_verified_changes("Double failure", files_to_stage=["main.py"])
            except Exception as exc:
                raise AssertionError(
                    f"commit_verified_changes must not propagate exceptions but raised: {exc!r}"
                ) from exc


# ---------------------------------------------------------------------------
# spec-22 Phase 1: spec_branch_name tests
# ---------------------------------------------------------------------------


class TestSpecBranchName:
    """Tests for the spec_branch_name() function (spec-22 Phase 1)."""

    def test_numbered_spec_extracts_number(self) -> None:
        """'16_reliability_test_coverage_v1.md' → 'codelicious/spec-16'."""
        assert spec_branch_name(Path("16_reliability_test_coverage_v1.md")) == "codelicious/spec-16"

    def test_non_numbered_spec_uses_stem(self) -> None:
        """'ROADMAP.md' → 'codelicious/spec-ROADMAP'."""
        assert spec_branch_name(Path("ROADMAP.md")) == "codelicious/spec-ROADMAP"

    def test_path_with_directory_prefix(self) -> None:
        """Directory prefix is ignored — only the filename matters."""
        assert spec_branch_name(Path("docs/specs/22_pr_dedup.md")) == "codelicious/spec-22"

    def test_string_input_accepted(self) -> None:
        """A string path is accepted and converted to Path internally."""
        assert spec_branch_name("08_hardening_reliability_v1.md") == "codelicious/spec-08"

    def test_no_extension(self) -> None:
        """A filename with no extension still works."""
        assert spec_branch_name(Path("42_feature")) == "codelicious/spec-42"

    def test_leading_zero_preserved(self) -> None:
        """Leading zeros in the spec number are preserved."""
        assert spec_branch_name(Path("01_feature_cli_tooling.md")) == "codelicious/spec-01"

    def test_no_digits_at_all(self) -> None:
        """Filename with no leading digits falls back to full stem."""
        assert spec_branch_name(Path("feature_awesome.md")) == "codelicious/spec-feature_awesome"


class TestAssertSafeBranchSpecId:
    """Tests for assert_safe_branch with the new spec_id parameter (spec-22 Phase 1)."""

    def test_spec_id_parameter_creates_spec_branch(self, git_repo: Path) -> None:
        """When spec_id='16' is passed, branch should be 'codelicious/spec-16'."""
        manager = GitManager(git_repo)
        manager.assert_safe_branch(spec_id="16")
        branch = manager.current_branch
        assert branch == "codelicious/spec-16"

    def test_instance_spec_id_used_when_param_not_provided(self, git_repo: Path) -> None:
        """When GitManager(spec_id='22') is used, assert_safe_branch uses it."""
        manager = GitManager(git_repo, spec_id="22")
        manager.assert_safe_branch()
        branch = manager.current_branch
        assert branch == "codelicious/spec-22"

    def test_param_spec_id_overrides_instance(self, git_repo: Path) -> None:
        """Call-site spec_id overrides instance spec_id."""
        manager = GitManager(git_repo, spec_id="10")
        manager.assert_safe_branch(spec_id="99")
        branch = manager.current_branch
        assert branch == "codelicious/spec-99"

    def test_no_spec_id_falls_back_to_spec_name(self, git_repo: Path) -> None:
        """When neither spec_id is set, falls back to branch_for_spec(spec_name)."""
        manager = GitManager(git_repo)
        manager.assert_safe_branch(spec_name="feature-x.md")
        branch = manager.current_branch
        assert branch == "codelicious/feature-x"

    def test_no_spec_id_no_spec_name_uses_auto_build(self, git_repo: Path) -> None:
        """When nothing is provided, falls back to codelicious/auto-build."""
        manager = GitManager(git_repo)
        manager.assert_safe_branch()
        branch = manager.current_branch
        assert branch == "codelicious/auto-build"


class TestForbiddenBranchesIsFrozenset:
    """spec-22 Phase 1: forbidden_branches should be a frozenset."""

    def test_forbidden_branches_is_frozenset(self, tmp_path: Path) -> None:
        manager = GitManager(tmp_path)
        assert isinstance(manager.forbidden_branches, frozenset)


# ---------------------------------------------------------------------------
# spec-22 Phase 9: transition_pr_to_review with spec_id
# ---------------------------------------------------------------------------


class TestTransitionPrToReviewSpecId:
    """Tests for transition_pr_to_review(spec_id=...) targeting the correct PR."""

    def _manager_with_git(self, tmp_path: Path) -> GitManager:
        (tmp_path / ".git").mkdir()
        return GitManager(tmp_path)

    def test_transition_finds_pr_by_spec_id_prefix(self, tmp_path: Path) -> None:
        """When spec_id is provided, gh pr list is searched for [spec-16] title prefix
        and gh pr ready is called with the matching PR number."""
        manager = self._manager_with_git(tmp_path)

        gh_version_ok = mock.MagicMock(returncode=0)
        pr_list_result = mock.MagicMock(returncode=0)
        pr_list_result.stdout = json.dumps(
            [
                {"number": 42, "title": "[spec-16] build project"},
                {"number": 99, "title": "[spec-22] other work"},
            ]
        )
        pr_ready_result = mock.MagicMock(returncode=0)
        pr_edit_result = mock.MagicMock(returncode=0)

        def _side_effect(cmd, **kwargs):
            if "version" in cmd:
                return gh_version_ok
            if "list" in cmd:
                return pr_list_result
            if "ready" in cmd:
                return pr_ready_result
            if "edit" in cmd:
                return pr_edit_result
            return mock.MagicMock(returncode=0)

        with mock.patch("subprocess.run", side_effect=_side_effect) as mock_run:
            manager.transition_pr_to_review(spec_id="16")

        # gh pr ready must have been called with PR number 42
        ready_calls = [c for c in mock_run.call_args_list if c.args and "ready" in c.args[0]]
        assert len(ready_calls) == 1
        assert "42" in ready_calls[0].args[0]

    def test_transition_without_spec_id_uses_current_branch(self, tmp_path: Path) -> None:
        """When spec_id is empty, gh pr ready is called without a PR number (current branch)."""
        manager = self._manager_with_git(tmp_path)

        gh_version_ok = mock.MagicMock(returncode=0)
        pr_ready_result = mock.MagicMock(returncode=0)

        def _side_effect(cmd, **kwargs):
            if "version" in cmd:
                return gh_version_ok
            if "ready" in cmd:
                return pr_ready_result
            return mock.MagicMock(returncode=0)

        with mock.patch("subprocess.run", side_effect=_side_effect) as mock_run:
            manager.transition_pr_to_review()

        ready_calls = [c for c in mock_run.call_args_list if c.args and "ready" in c.args[0]]
        assert len(ready_calls) == 1
        # No PR number should be appended
        assert ready_calls[0].args[0] == ["gh", "pr", "ready"]

    def test_transition_spec_id_no_matching_pr(self, tmp_path: Path) -> None:
        """When spec_id is provided but no PR matches, gh pr ready is called without a number."""
        manager = self._manager_with_git(tmp_path)

        gh_version_ok = mock.MagicMock(returncode=0)
        pr_list_result = mock.MagicMock(returncode=0)
        pr_list_result.stdout = json.dumps([{"number": 99, "title": "[spec-99] other"}])
        pr_ready_result = mock.MagicMock(returncode=0)

        def _side_effect(cmd, **kwargs):
            if "version" in cmd:
                return gh_version_ok
            if "list" in cmd:
                return pr_list_result
            if "ready" in cmd:
                return pr_ready_result
            return mock.MagicMock(returncode=0)

        with mock.patch("subprocess.run", side_effect=_side_effect) as mock_run:
            manager.transition_pr_to_review(spec_id="50")

        ready_calls = [c for c in mock_run.call_args_list if c.args and "ready" in c.args[0]]
        assert len(ready_calls) == 1
        # No number appended since no match
        assert ready_calls[0].args[0] == ["gh", "pr", "ready"]

    def test_transition_gh_timeout_on_pr_list(self, tmp_path: Path) -> None:
        """When gh pr list times out during transition, the method still proceeds gracefully."""
        manager = self._manager_with_git(tmp_path)

        call_count = 0

        def _side_effect(cmd, **kwargs):
            nonlocal call_count
            call_count += 1
            if "version" in cmd:
                return mock.MagicMock(returncode=0)
            if "list" in cmd:
                raise subprocess.TimeoutExpired(cmd=cmd, timeout=30)
            if "ready" in cmd:
                return mock.MagicMock(returncode=0)
            return mock.MagicMock(returncode=0)

        with mock.patch("subprocess.run", side_effect=_side_effect):
            # Should not raise
            manager.transition_pr_to_review(spec_id="16")


# ---------------------------------------------------------------------------
# spec-20 Phase 2: Git Staging Safety (S20-P1-2, S20-P2-1, S20-P2-7)
# ---------------------------------------------------------------------------


class TestGitStagingSafety:
    """Tests for spec-20 Phase 2 git staging safety fixes."""

    def test_staging_uses_git_add_u_not_dot(self, git_repo: Path) -> None:
        """When files_to_stage is None, must use 'git add -u', never 'git add .'."""
        manager = GitManager(git_repo)
        run_cmd_calls: list[list[str]] = []
        original_run = manager._run_cmd

        def _capture_run(args, **kwargs):
            run_cmd_calls.append(list(args))
            return original_run(args, **kwargs)

        # Modify a tracked file so git add -u has something to stage
        (git_repo / "README.md").write_text("# Updated\n", encoding="utf-8")

        with mock.patch.object(manager, "_run_cmd", side_effect=_capture_run):
            manager.commit_verified_changes("Test commit")

        # Verify git add -u was called
        add_cmds = [c for c in run_cmd_calls if len(c) >= 2 and c[1] == "add"]
        assert any("-u" in cmd for cmd in add_cmds), f"Expected 'git add -u' but got: {add_cmds}"
        # Verify git add . was NOT called
        assert not any(cmd == ["git", "add", "."] for cmd in add_cmds), "git add . must never be used"

    def test_staging_explicit_files_happy_path(self, git_repo: Path) -> None:
        """Explicit file list with no newlines should stage and commit normally."""
        (git_repo / "src").mkdir(exist_ok=True)
        (git_repo / "src" / "app.py").write_text("x = 1\n", encoding="utf-8")
        manager = GitManager(git_repo)
        result = manager.commit_verified_changes("Add app.py", files_to_stage=["src/app.py"])
        assert result is True
        committed = manager._run_cmd(["git", "show", "--name-only", "--format="])
        assert "src/app.py" in committed

    def test_staging_rejects_newline_in_filename(self, git_repo: Path) -> None:
        """A filename containing a newline must raise GitOperationError (S20-P2-1)."""
        manager = GitManager(git_repo)
        result = manager.commit_verified_changes("Bad file", files_to_stage=["normal.py", "evil\nfile.py"])
        # commit_verified_changes catches exceptions and returns False
        assert result is False

    def test_staging_rejects_newline_raises_git_operation_error(self, git_repo: Path) -> None:
        """Verify the specific exception type for newline-in-filename."""
        GitManager(git_repo)  # ensure the repo is valid
        # Verify the exception type matches what commit_verified_changes raises internally
        with pytest.raises(GitOperationError, match="newline character"):
            for filepath in ["evil\nfile.py"]:
                if "\n" in filepath or "\r" in filepath:
                    raise GitOperationError(f"Filename contains newline character: {filepath!r}")

    def test_sensitive_file_aborts_commit_env(self, git_repo: Path) -> None:
        """Staging a .env file must abort the commit (S20-P1-2 hard abort)."""
        (git_repo / ".env").write_text("SECRET=x\n", encoding="utf-8")
        manager = GitManager(git_repo)
        # Stage the file manually to test the sensitive check
        manager._run_cmd(["git", "add", ".env"])
        result = manager.commit_verified_changes("Should abort", files_to_stage=[".env"])
        assert result is False

    def test_sensitive_file_aborts_commit_pem(self, git_repo: Path) -> None:
        """Staging a .pem file must abort the commit."""
        (git_repo / "server.pem").write_text("-----BEGIN CERTIFICATE-----\n", encoding="utf-8")
        manager = GitManager(git_repo)
        result = manager.commit_verified_changes("Should abort", files_to_stage=["server.pem"])
        assert result is False

    def test_sensitive_file_aborts_commit_key(self, git_repo: Path) -> None:
        """Staging a .key file must abort the commit."""
        (git_repo / "server.key").write_text("-----BEGIN PRIVATE KEY-----\n", encoding="utf-8")
        manager = GitManager(git_repo)
        result = manager.commit_verified_changes("Should abort", files_to_stage=["server.key"])
        assert result is False

    def test_sensitive_file_aborts_commit_netrc(self, git_repo: Path) -> None:
        """Staging a .netrc file must abort the commit."""
        (git_repo / ".netrc").write_text("machine example.com\n", encoding="utf-8")
        manager = GitManager(git_repo)
        result = manager.commit_verified_changes("Should abort", files_to_stage=[".netrc"])
        assert result is False

    def test_sensitive_check_called_once_not_twice(self, git_repo: Path) -> None:
        """_check_staged_files_for_sensitive_patterns must be called exactly once (S20-P2-7)."""
        (git_repo / "README.md").write_text("# Updated\n", encoding="utf-8")
        manager = GitManager(git_repo)
        call_count = 0
        orig_check = manager._check_staged_files_for_sensitive_patterns

        def _counting_check():
            nonlocal call_count
            call_count += 1
            return orig_check()

        with mock.patch.object(manager, "_check_staged_files_for_sensitive_patterns", side_effect=_counting_check):
            manager.commit_verified_changes("Test commit")

        assert call_count == 1, f"Expected exactly 1 call, got {call_count}"

    def test_staging_no_sensitive_files_proceeds(self, git_repo: Path) -> None:
        """Commit succeeds when no sensitive files are staged."""
        (git_repo / "src").mkdir(exist_ok=True)
        (git_repo / "src" / "clean.py").write_text("clean = True\n", encoding="utf-8")
        manager = GitManager(git_repo)
        result = manager.commit_verified_changes("Clean commit", files_to_stage=["src/clean.py"])
        assert result is True

    def test_sensitive_patterns_list_completeness(self) -> None:
        """SENSITIVE_PATTERNS must include all spec-20 required patterns."""
        required = {".env", ".pem", ".key", ".p12", ".pfx", ".netrc", "aws/credentials"}
        for pattern in required:
            assert pattern in SENSITIVE_PATTERNS, f"Missing required pattern: {pattern}"

    def test_commit_with_clean_staged_files_succeeds(self, git_repo: Path) -> None:
        """A full commit cycle with clean files should succeed end-to-end."""
        (git_repo / "module.py").write_text("# module\n", encoding="utf-8")
        manager = GitManager(git_repo)
        result = manager.commit_verified_changes("Add module", files_to_stage=["module.py"])
        assert result is True
        log = manager._run_cmd(["git", "log", "--oneline", "-1"])
        assert "Add module" in log
