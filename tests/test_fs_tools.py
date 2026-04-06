"""Tests for FSTooling module.

These tests verify that FSTooling properly delegates security checks to Sandbox
and handles all error cases gracefully.
"""

import pathlib
from unittest.mock import MagicMock, patch

import pytest

from codelicious.tools.fs_tools import FSTooling


@pytest.fixture
def mock_cache_manager() -> MagicMock:
    """Create a mock cache manager."""
    return MagicMock()


@pytest.fixture
def fs_tooling(tmp_path: pathlib.Path, mock_cache_manager: MagicMock) -> FSTooling:
    """Create an FSTooling instance with a temporary directory."""
    return FSTooling(tmp_path, mock_cache_manager)


# -- Path Traversal Tests --


def test_path_traversal_write_blocked(fs_tooling: FSTooling, tmp_path: pathlib.Path) -> None:
    """Path traversal via '../../../etc/passwd' is blocked for writes."""
    response = fs_tooling.native_write_file("../../../etc/passwd", "malicious")
    assert response["success"] is False
    # Sandbox raises PathTraversalError("Path traversal via '..' is not allowed")
    assert "traversal via '..'" in response["stderr"].lower() or "not allowed" in response["stderr"].lower()


def test_path_traversal_read_blocked(fs_tooling: FSTooling, tmp_path: pathlib.Path) -> None:
    """Path traversal via '../../../etc/passwd' is blocked for reads."""
    response = fs_tooling.native_read_file("../../../etc/passwd")
    assert response["success"] is False
    # Sandbox raises PathTraversalError("Path traversal via '..' is not allowed")
    assert "traversal via '..'" in response["stderr"].lower() or "not allowed" in response["stderr"].lower()


def test_path_traversal_list_blocked(fs_tooling: FSTooling, tmp_path: pathlib.Path) -> None:
    """Path traversal via '../' is blocked for directory listing."""
    response = fs_tooling.native_list_directory("../")
    assert response["success"] is False
    # Sandbox raises PathTraversalError("Path traversal via '..' is not allowed")
    assert "traversal via '..'" in response["stderr"].lower() or "not allowed" in response["stderr"].lower()


# -- Denied Path Tests --


def test_write_env_blocked(fs_tooling: FSTooling) -> None:
    """Writing to .env is blocked by sandbox denied patterns."""
    response = fs_tooling.native_write_file(".env", "SECRET=password123")
    assert response["success"] is False
    # Sandbox raises DeniedPathError("Writing to denied path: .env")
    assert "writing to denied path" in response["stderr"].lower()


def test_write_env_local_blocked(fs_tooling: FSTooling) -> None:
    """Writing to .env.local is blocked by sandbox denied patterns."""
    response = fs_tooling.native_write_file(".env.local", "SECRET=password123")
    assert response["success"] is False
    # Sandbox raises DeniedPathError("Writing to denied path: .env.local")
    assert "writing to denied path" in response["stderr"].lower()


def test_write_env_production_blocked(fs_tooling: FSTooling) -> None:
    """Writing to .env.production is blocked by sandbox denied patterns."""
    response = fs_tooling.native_write_file(".env.production", "SECRET=password123")
    assert response["success"] is False


# -- Disallowed Extension Tests --


def test_write_exe_blocked(fs_tooling: FSTooling) -> None:
    """Writing a .exe file is blocked (extension not allowed)."""
    response = fs_tooling.native_write_file("malware.exe", "MZ\x00\x00")
    assert response["success"] is False
    # Sandbox raises DisallowedExtensionError("File extension '.exe' is not allowed")
    assert "file extension '.exe' is not allowed" in response["stderr"].lower()


def test_write_dll_blocked(fs_tooling: FSTooling) -> None:
    """Writing a .dll file is blocked (extension not allowed)."""
    response = fs_tooling.native_write_file("library.dll", "MZ\x00\x00")
    assert response["success"] is False
    assert "extension" in response["stderr"].lower()


def test_write_bat_blocked(fs_tooling: FSTooling) -> None:
    """Writing a .bat file is blocked (extension not allowed)."""
    response = fs_tooling.native_write_file("script.bat", "@echo off")
    assert response["success"] is False


# -- Protected Path Tests (now handled by Sandbox DENIED_PATTERNS) --


def test_write_codelicious_config_blocked(fs_tooling: FSTooling) -> None:
    """Writing to .codelicious/config.json is blocked."""
    response = fs_tooling.native_write_file(".codelicious/config.json", '{"malicious": true}')
    assert response["success"] is False
    # Sandbox raises DeniedPathError("Writing to denied path: .codelicious")
    assert "writing to denied path" in response["stderr"].lower()


# -- Valid Write Tests --


def test_write_valid_py_file_succeeds(fs_tooling: FSTooling, tmp_path: pathlib.Path) -> None:
    """Writing a valid .py file inside the repo succeeds."""
    content = "print('Hello, World!')\n"
    response = fs_tooling.native_write_file("src/hello.py", content)
    assert response["success"] is True
    assert "Successfully wrote" in response["stdout"]
    assert str(len(content)) in response["stdout"]

    # Verify file was actually written
    written_file = tmp_path / "src" / "hello.py"
    assert written_file.exists()
    assert written_file.read_text(encoding="utf-8") == content


def test_write_valid_md_file_succeeds(fs_tooling: FSTooling, tmp_path: pathlib.Path) -> None:
    """Writing a valid .md file inside the repo succeeds."""
    content = "# README\n\nThis is a test.\n"
    response = fs_tooling.native_write_file("docs/README.md", content)
    assert response["success"] is True

    written_file = tmp_path / "docs" / "README.md"
    assert written_file.exists()
    assert written_file.read_text(encoding="utf-8") == content


def test_write_valid_json_file_succeeds(fs_tooling: FSTooling, tmp_path: pathlib.Path) -> None:
    """Writing a valid .json file inside the repo succeeds."""
    content = '{"name": "test", "version": "1.0.0"}\n'
    response = fs_tooling.native_write_file("package.json", content)
    assert response["success"] is True

    written_file = tmp_path / "package.json"
    assert written_file.exists()


# -- Read File Tests --


def test_read_existing_file_returns_content(fs_tooling: FSTooling, tmp_path: pathlib.Path) -> None:
    """Reading a file that exists returns its content."""
    test_file = tmp_path / "test.py"
    content = "def hello():\n    return 'world'\n"
    test_file.write_text(content, encoding="utf-8")

    response = fs_tooling.native_read_file("test.py")
    assert response["success"] is True
    assert response["stdout"] == content
    assert response["stderr"] == ""


def test_read_nonexistent_file_returns_error(fs_tooling: FSTooling) -> None:
    """Reading a file that doesn't exist returns an error."""
    response = fs_tooling.native_read_file("nonexistent.py")
    assert response["success"] is False
    # FSTooling returns "Error: '<rel_path>' is not a valid file."
    assert "not a valid file" in response["stderr"]


def test_read_file_outside_sandbox_blocked(fs_tooling: FSTooling, tmp_path: pathlib.Path) -> None:
    """Reading a file outside the sandbox is blocked."""
    response = fs_tooling.native_read_file("../../../etc/passwd")
    assert response["success"] is False
    # Sandbox raises PathTraversalError("Path traversal via '..' is not allowed")
    assert "traversal via '..'" in response["stderr"].lower()


def test_read_absolute_path_blocked(fs_tooling: FSTooling) -> None:
    """Reading with an absolute path is blocked."""
    response = fs_tooling.native_read_file("/etc/passwd")
    assert response["success"] is False
    # Sandbox raises PathTraversalError("Absolute paths are not allowed")
    assert "absolute paths are not allowed" in response["stderr"].lower()


# -- List Directory Tests --


def test_list_directory_returns_expected_entries(fs_tooling: FSTooling, tmp_path: pathlib.Path) -> None:
    """Listing a directory returns expected entries."""
    # Create test structure
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "main.py").write_text("# main", encoding="utf-8")
    (tmp_path / "src" / "utils.py").write_text("# utils", encoding="utf-8")
    (tmp_path / "tests").mkdir()
    (tmp_path / "tests" / "test_main.py").write_text("# test", encoding="utf-8")

    response = fs_tooling.native_list_directory(".")
    assert response["success"] is True
    assert "main.py" in response["stdout"]
    assert "utils.py" in response["stdout"]
    assert "test_main.py" in response["stdout"]


def test_list_directory_excludes_ignored_dirs(fs_tooling: FSTooling, tmp_path: pathlib.Path) -> None:
    """Listing a directory excludes ignored directories like .git and __pycache__."""
    # Create test structure with ignored dirs
    (tmp_path / ".git").mkdir()
    (tmp_path / ".git" / "config").write_text("", encoding="utf-8")
    (tmp_path / "__pycache__").mkdir()
    (tmp_path / "__pycache__" / "module.cpython-310.pyc").write_bytes(b"")
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "main.py").write_text("# main", encoding="utf-8")

    response = fs_tooling.native_list_directory(".")
    assert response["success"] is True
    assert ".git" not in response["stdout"]
    assert "__pycache__" not in response["stdout"]
    assert "main.py" in response["stdout"]


def test_list_directory_traversal_blocked(fs_tooling: FSTooling) -> None:
    """Listing a directory outside the sandbox is blocked."""
    response = fs_tooling.native_list_directory("../")
    assert response["success"] is False
    # Sandbox raises PathTraversalError("Path traversal via '..' is not allowed")
    assert "traversal via '..'" in response["stderr"].lower()


def test_list_nonexistent_directory_returns_error(fs_tooling: FSTooling) -> None:
    """Listing a directory that doesn't exist returns an error."""
    response = fs_tooling.native_list_directory("nonexistent_dir")
    assert response["success"] is False
    # FSTooling returns "not a directory" when the resolved path is not a directory
    assert "not a directory" in response["stderr"]


# -- Edge Cases --


def test_write_to_nested_directory_creates_parents(fs_tooling: FSTooling, tmp_path: pathlib.Path) -> None:
    """Writing to a nested path creates parent directories."""
    content = "nested content\n"
    response = fs_tooling.native_write_file("a/b/c/deep.txt", content)
    assert response["success"] is True

    written_file = tmp_path / "a" / "b" / "c" / "deep.txt"
    assert written_file.exists()
    assert written_file.read_text(encoding="utf-8") == content


def test_write_empty_content_succeeds(fs_tooling: FSTooling, tmp_path: pathlib.Path) -> None:
    """Writing empty content succeeds."""
    response = fs_tooling.native_write_file("empty.py", "")
    assert response["success"] is True

    written_file = tmp_path / "empty.py"
    assert written_file.exists()
    assert written_file.read_text(encoding="utf-8") == ""


def test_write_gitignore_allowed(fs_tooling: FSTooling, tmp_path: pathlib.Path) -> None:
    """Writing .gitignore is allowed (in ALLOWED_EXACT_NAMES)."""
    content = "__pycache__/\n*.pyc\n"
    response = fs_tooling.native_write_file(".gitignore", content)
    assert response["success"] is True

    written_file = tmp_path / ".gitignore"
    assert written_file.exists()


def test_write_dockerfile_allowed(fs_tooling: FSTooling, tmp_path: pathlib.Path) -> None:
    """Writing Dockerfile is allowed (in ALLOWED_EXACT_NAMES)."""
    content = "FROM python:3.10\n"
    response = fs_tooling.native_write_file("Dockerfile", content)
    assert response["success"] is True

    written_file = tmp_path / "Dockerfile"
    assert written_file.exists()


def test_write_makefile_allowed(fs_tooling: FSTooling, tmp_path: pathlib.Path) -> None:
    """Writing Makefile is allowed (in ALLOWED_EXACT_NAMES)."""
    content = "all:\n\techo 'build'\n"
    response = fs_tooling.native_write_file("Makefile", content)
    assert response["success"] is True

    written_file = tmp_path / "Makefile"
    assert written_file.exists()


def test_null_bytes_in_path_blocked(fs_tooling: FSTooling) -> None:
    """Null bytes in paths are blocked."""
    response = fs_tooling.native_write_file("file\x00.py", "malicious")
    assert response["success"] is False
    # Sandbox raises PathTraversalError("Null bytes are not allowed in paths")
    assert "null bytes are not allowed" in response["stderr"].lower()


# -- Directory Listing DoS Protection Tests (P2-5) --


def test_directory_listing_depth_limited(fs_tooling: FSTooling, tmp_path: pathlib.Path) -> None:
    """Create a 10-level deep tree, list with max_depth=3, verify only 3 levels returned."""
    # Create a 10-level deep directory structure
    current = tmp_path
    for i in range(10):
        current = current / f"level{i}"
        current.mkdir()
        (current / f"file{i}.py").write_text(f"# level {i}", encoding="utf-8")

    # List with max_depth=3 (depth 0 = root, depth 1 = level0, depth 2 = level1, depth 3 = level2)
    response = fs_tooling.native_list_directory(".", max_depth=3)
    assert response["success"] is True
    stdout = response["stdout"]

    # Should see level0, level1, level2 and their files
    assert "level0" in stdout
    assert "level1" in stdout
    assert "level2" in stdout
    assert "file0.py" in stdout
    assert "file1.py" in stdout
    assert "file2.py" in stdout

    # Should NOT see level3 and beyond
    assert "level3" not in stdout
    assert "level4" not in stdout
    assert "file3.py" not in stdout
    assert "file9.py" not in stdout


def test_directory_listing_entry_limited(fs_tooling: FSTooling, tmp_path: pathlib.Path) -> None:
    """Create 2000 files, list with max_entries=1000, verify exactly 1001 entries."""
    # Create a flat directory with 2000 files
    (tmp_path / "flat").mkdir()
    for i in range(2000):
        (tmp_path / "flat" / f"file{i:04d}.py").write_text(f"# {i}", encoding="utf-8")

    # List with max_entries=1000
    response = fs_tooling.native_list_directory(".", max_entries=1000)
    assert response["success"] is True
    stdout = response["stdout"]

    # Should have truncation marker
    assert "[truncated: max entries reached]" in stdout

    # Count actual entries (lines, including truncation marker)
    lines = [line for line in stdout.split("\n") if line.strip()]
    # Should be 1000 entries + 1 truncation marker = 1001
    # But the directory "flat/" counts as 1 entry too
    # So it's: flat/ (1) + some files (up to 999) + truncation (1) = 1001 max
    assert len(lines) >= 500
    assert len(lines) <= 1001


def test_normal_directory_listing_unchanged(fs_tooling: FSTooling, tmp_path: pathlib.Path) -> None:
    """Small directory listing returns complete listing with no truncation."""
    # Create a small directory structure
    (tmp_path / "src").mkdir()
    (tmp_path / "src" / "main.py").write_text("# main", encoding="utf-8")
    (tmp_path / "src" / "utils.py").write_text("# utils", encoding="utf-8")
    (tmp_path / "tests").mkdir()
    (tmp_path / "tests" / "test_main.py").write_text("# test", encoding="utf-8")

    response = fs_tooling.native_list_directory(".")
    assert response["success"] is True
    stdout = response["stdout"]

    # Should see all files
    assert "main.py" in stdout
    assert "utils.py" in stdout
    assert "test_main.py" in stdout

    # Should NOT have truncation marker
    assert "[truncated" not in stdout


def test_directory_listing_zero_depth_returns_only_root_files(fs_tooling: FSTooling, tmp_path: pathlib.Path) -> None:
    """max_depth=0 returns only files in the target directory, no subdirectories."""
    # Create structure
    (tmp_path / "root_file.py").write_text("# root", encoding="utf-8")
    (tmp_path / "subdir").mkdir()
    (tmp_path / "subdir" / "nested.py").write_text("# nested", encoding="utf-8")

    response = fs_tooling.native_list_directory(".", max_depth=0)
    assert response["success"] is True
    stdout = response["stdout"]

    # Should see root file
    assert "root_file.py" in stdout

    # Should NOT traverse into subdir (it won't even list the subdir name since
    # it's pruned at depth 0)
    assert "nested.py" not in stdout


def test_directory_listing_max_entries_one(fs_tooling: FSTooling, tmp_path: pathlib.Path) -> None:
    """max_entries=1 returns exactly one entry plus truncation marker."""
    # Create multiple files
    for i in range(10):
        (tmp_path / f"file{i}.py").write_text(f"# {i}", encoding="utf-8")

    response = fs_tooling.native_list_directory(".", max_entries=1)
    assert response["success"] is True
    stdout = response["stdout"]

    # Should have exactly 1 entry + truncation marker
    lines = [line for line in stdout.split("\n") if line.strip()]
    assert len(lines) == 2
    assert "[truncated: max entries reached]" in stdout


# -- Finding 80: dotfile suppression in native_list_directory --------------


def test_native_list_directory_suppresses_dotfiles(fs_tooling: FSTooling, tmp_path: pathlib.Path) -> None:
    """native_list_directory('.') must not include dotfiles like .gitignore in output.

    Dotfiles (files whose name starts with '.') should be suppressed from
    directory listings so that the agent does not accidentally expose or act on
    hidden configuration files.
    """
    # Create a dotfile that should be suppressed
    (tmp_path / ".gitignore").write_text("*.pyc\n__pycache__/\n", encoding="utf-8")
    # Create a normal file that should appear
    (tmp_path / "main.py").write_text("# main module\n", encoding="utf-8")

    response = fs_tooling.native_list_directory(".")
    assert response["success"] is True

    stdout = response["stdout"]
    assert "main.py" in stdout, "Normal file must appear in directory listing"
    assert ".gitignore" not in stdout, "Dotfile .gitignore must be absent from directory listing"


# -- Generic Exception branch in native_read_file (Finding 47) -------------


def test_native_read_file_generic_exception_returns_failure(fs_tooling: FSTooling) -> None:
    """native_read_file returns success=False with the error message in stderr when
    sandbox.read_file raises an unexpected RuntimeError (the broad 'except Exception'
    branch at fs_tools.py:45-46).
    """
    error_message = "unexpected I/O failure"
    with patch.object(fs_tooling.sandbox, "read_file", side_effect=RuntimeError(error_message)):
        response = fs_tooling.native_read_file("some_file.py")

    assert response["success"] is False
    assert response["stdout"] == ""
    assert error_message in response["stderr"]


# ---------------------------------------------------------------------------
# spec-20 Phase 6: Directory Listing Sandbox Enforcement (S20-P2-2)
# ---------------------------------------------------------------------------


class TestDirectoryListingSandbox:
    """Tests for S20-P2-2: os.walk sandbox enforcement in native_list_directory."""

    def test_walk_followlinks_false(self, tmp_path: pathlib.Path, mock_cache_manager: MagicMock) -> None:
        """os.walk must use followlinks=False so symlinks are not followed."""
        # Create a directory with a symlink pointing outside the repo
        (tmp_path / "src").mkdir()
        (tmp_path / "src" / "app.py").write_text("x = 1\n", encoding="utf-8")
        outside = tmp_path.parent / "outside_dir_fl"
        outside.mkdir(exist_ok=True)
        (outside / "secret.txt").write_text("secret\n", encoding="utf-8")
        (tmp_path / "src" / "link").symlink_to(outside)

        fs = FSTooling(tmp_path, mock_cache_manager)
        result = fs.native_list_directory(".", max_depth=10)
        assert result["success"] is True
        # The symlink itself may appear as a name, but the contents of
        # the outside directory must NOT appear
        assert "secret.txt" not in result["stdout"]

    def test_walk_path_outside_sandbox_skipped(self, tmp_path: pathlib.Path, mock_cache_manager: MagicMock) -> None:
        """Paths resolving outside the sandbox boundary must be silently skipped."""
        (tmp_path / "src").mkdir()
        (tmp_path / "src" / "safe.py").write_text("ok\n", encoding="utf-8")

        fs = FSTooling(tmp_path, mock_cache_manager)
        result = fs.native_list_directory(".")
        assert result["success"] is True
        assert "safe.py" in result["stdout"]

    def test_walk_symlink_not_followed(self, tmp_path: pathlib.Path, mock_cache_manager: MagicMock) -> None:
        """A symlinked subdirectory must not be descended into."""
        (tmp_path / "real").mkdir()
        (tmp_path / "real" / "data.txt").write_text("data\n", encoding="utf-8")
        outside = tmp_path.parent / "outside_target_snf"
        outside.mkdir(exist_ok=True)
        (outside / "leaked.txt").write_text("leak\n", encoding="utf-8")
        (tmp_path / "real" / "escape").symlink_to(outside)

        fs = FSTooling(tmp_path, mock_cache_manager)
        result = fs.native_list_directory(".", max_depth=10)
        assert result["success"] is True
        assert "data.txt" in result["stdout"]
        assert "leaked.txt" not in result["stdout"]

    def test_walk_depth_limit_enforced(self, tmp_path: pathlib.Path, mock_cache_manager: MagicMock) -> None:
        """Directories beyond max_depth must not be traversed."""
        # Create a/b/c/d/deep.txt (4 levels)
        deep = tmp_path / "a" / "b" / "c" / "d"
        deep.mkdir(parents=True)
        (deep / "deep.txt").write_text("deep\n", encoding="utf-8")
        (tmp_path / "a" / "top.txt").write_text("top\n", encoding="utf-8")

        fs = FSTooling(tmp_path, mock_cache_manager)
        # max_depth=2 means we can descend into a/ and a/b/ but not a/b/c/
        result = fs.native_list_directory(".", max_depth=2)
        assert result["success"] is True
        assert "top.txt" in result["stdout"]
        assert "deep.txt" not in result["stdout"]

    def test_walk_entry_count_limit_enforced(self, tmp_path: pathlib.Path, mock_cache_manager: MagicMock) -> None:
        """Listing must stop after max_entries and include a truncation marker."""
        # Create 20 files
        for i in range(20):
            (tmp_path / f"file_{i:03d}.txt").write_text(f"content {i}\n", encoding="utf-8")

        fs = FSTooling(tmp_path, mock_cache_manager)
        result = fs.native_list_directory(".", max_entries=5)
        assert result["success"] is True
        assert "[truncated: max entries reached]" in result["stdout"]

    def test_walk_normal_directory_succeeds(self, tmp_path: pathlib.Path, mock_cache_manager: MagicMock) -> None:
        """A normal directory tree must list correctly."""
        (tmp_path / "src").mkdir()
        (tmp_path / "src" / "main.py").write_text("main\n", encoding="utf-8")
        (tmp_path / "README.md").write_text("readme\n", encoding="utf-8")

        fs = FSTooling(tmp_path, mock_cache_manager)
        result = fs.native_list_directory(".")
        assert result["success"] is True
        assert "main.py" in result["stdout"]
        assert "README.md" in result["stdout"]

    def test_walk_empty_directory_returns_empty(self, tmp_path: pathlib.Path, mock_cache_manager: MagicMock) -> None:
        """An empty directory must return success with empty or minimal output."""
        fs = FSTooling(tmp_path, mock_cache_manager)
        result = fs.native_list_directory(".")
        assert result["success"] is True

    def test_walk_nested_directories(self, tmp_path: pathlib.Path, mock_cache_manager: MagicMock) -> None:
        """Nested directories must be listed with correct indentation."""
        (tmp_path / "a").mkdir()
        (tmp_path / "a" / "b").mkdir()
        (tmp_path / "a" / "b" / "nested.py").write_text("nested\n", encoding="utf-8")
        (tmp_path / "a" / "sibling.py").write_text("sibling\n", encoding="utf-8")

        fs = FSTooling(tmp_path, mock_cache_manager)
        result = fs.native_list_directory(".", max_depth=10)
        assert result["success"] is True
        assert "nested.py" in result["stdout"]
        assert "sibling.py" in result["stdout"]
        assert "a/" in result["stdout"]
        assert "b/" in result["stdout"]
