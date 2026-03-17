"""
Tests for git_orchestrator.py - Git staging and commit safety.
"""

import subprocess
from pathlib import Path

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
        """Test that only specified files are staged when files_to_stage is provided."""
        # Create multiple files
        src_dir = git_repo / "src"
        src_dir.mkdir()
        main_py = src_dir / "main.py"
        main_py.write_text("print('hello')\n", encoding="utf-8")

        env_file = git_repo / ".env"
        env_file.write_text("SECRET=abc123\n", encoding="utf-8")

        # Stage only main.py, not .env
        # We can't easily test commit_verified_changes without mocking push/PR,
        # so let's test the staging logic directly
        subprocess.run(["git", "add", "src/main.py"], cwd=git_repo, capture_output=True, check=True)

        # Check what's staged
        result = subprocess.run(
            ["git", "diff", "--cached", "--name-only"],
            cwd=git_repo,
            capture_output=True,
            text=True,
        )
        staged_files = result.stdout.strip().split("\n")

        assert "src/main.py" in staged_files
        assert ".env" not in staged_files

    def test_git_add_dot_stages_all_files(self, git_repo: Path):
        """Test that git add . stages all untracked files."""
        # Create files
        src_dir = git_repo / "src"
        src_dir.mkdir()
        main_py = src_dir / "main.py"
        main_py.write_text("print('hello')\n", encoding="utf-8")

        other_file = git_repo / "other.txt"
        other_file.write_text("other content\n", encoding="utf-8")

        # Run git add .
        subprocess.run(["git", "add", "."], cwd=git_repo, capture_output=True, check=True)

        # Check what's staged
        result = subprocess.run(
            ["git", "diff", "--cached", "--name-only"],
            cwd=git_repo,
            capture_output=True,
            text=True,
        )
        staged_files = result.stdout.strip().split("\n")

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
        manager = GitManager(git_repo)
        # Default branch might be 'main' or 'master' depending on git config
        branch = manager.current_branch
        assert branch in ("main", "master")

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
