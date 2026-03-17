"""Tests for FSTooling module.

These tests verify that FSTooling properly delegates security checks to Sandbox
and handles all error cases gracefully.
"""

import pathlib
from unittest.mock import MagicMock

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
    assert "traversal" in response["stderr"].lower() or ".." in response["stderr"]


def test_path_traversal_read_blocked(fs_tooling: FSTooling, tmp_path: pathlib.Path) -> None:
    """Path traversal via '../../../etc/passwd' is blocked for reads."""
    response = fs_tooling.native_read_file("../../../etc/passwd")
    assert response["success"] is False
    assert "traversal" in response["stderr"].lower() or ".." in response["stderr"]


def test_path_traversal_list_blocked(fs_tooling: FSTooling, tmp_path: pathlib.Path) -> None:
    """Path traversal via '../' is blocked for directory listing."""
    response = fs_tooling.native_list_directory("../")
    assert response["success"] is False
    assert "traversal" in response["stderr"].lower() or ".." in response["stderr"]


# -- Denied Path Tests --


def test_write_env_blocked(fs_tooling: FSTooling) -> None:
    """Writing to .env is blocked by sandbox denied patterns."""
    response = fs_tooling.native_write_file(".env", "SECRET=password123")
    assert response["success"] is False
    assert "denied" in response["stderr"].lower() or ".env" in response["stderr"]


def test_write_env_local_blocked(fs_tooling: FSTooling) -> None:
    """Writing to .env.local is blocked by sandbox denied patterns."""
    response = fs_tooling.native_write_file(".env.local", "SECRET=password123")
    assert response["success"] is False
    assert "denied" in response["stderr"].lower() or ".env" in response["stderr"]


def test_write_env_production_blocked(fs_tooling: FSTooling) -> None:
    """Writing to .env.production is blocked by sandbox denied patterns."""
    response = fs_tooling.native_write_file(".env.production", "SECRET=password123")
    assert response["success"] is False


# -- Disallowed Extension Tests --


def test_write_exe_blocked(fs_tooling: FSTooling) -> None:
    """Writing a .exe file is blocked (extension not allowed)."""
    response = fs_tooling.native_write_file("malware.exe", "MZ\x00\x00")
    assert response["success"] is False
    assert "extension" in response["stderr"].lower() or ".exe" in response["stderr"]


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
    assert "denied" in response["stderr"].lower() or ".codelicious" in response["stderr"]


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
    assert "not a valid file" in response["stderr"] or "not found" in response["stderr"].lower()


def test_read_file_outside_sandbox_blocked(fs_tooling: FSTooling, tmp_path: pathlib.Path) -> None:
    """Reading a file outside the sandbox is blocked."""
    response = fs_tooling.native_read_file("../../../etc/passwd")
    assert response["success"] is False
    assert "traversal" in response["stderr"].lower() or ".." in response["stderr"]


def test_read_absolute_path_blocked(fs_tooling: FSTooling) -> None:
    """Reading with an absolute path is blocked."""
    response = fs_tooling.native_read_file("/etc/passwd")
    assert response["success"] is False
    assert "absolute" in response["stderr"].lower() or "traversal" in response["stderr"].lower()


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
    assert "traversal" in response["stderr"].lower() or ".." in response["stderr"]


def test_list_nonexistent_directory_returns_error(fs_tooling: FSTooling) -> None:
    """Listing a directory that doesn't exist returns an error."""
    response = fs_tooling.native_list_directory("nonexistent_dir")
    assert response["success"] is False
    assert "not a directory" in response["stderr"] or "not found" in response["stderr"].lower()


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
    assert "null" in response["stderr"].lower() or "traversal" in response["stderr"].lower()
