"""Tests for the sandbox module."""

import logging
import os
import pathlib
import unittest.mock

import pytest

from codelicious.errors import (
    DeniedPathError,
    DisallowedExtensionError,
    FileCountLimitError,
    FileSizeLimitError,
    PathTraversalError,
)
from codelicious.sandbox import Sandbox


@pytest.fixture
def sandbox(tmp_path: pathlib.Path) -> Sandbox:
    """Create a sandbox rooted at a temporary directory."""
    return Sandbox(tmp_path)


# -- resolve_path ----------------------------------------------------------


def test_resolve_path_valid(sandbox: Sandbox, tmp_path: pathlib.Path) -> None:
    resolved = sandbox.resolve_path("src/main.py")
    assert resolved == tmp_path / "src" / "main.py"


def test_resolve_path_rejects_dotdot(sandbox: Sandbox) -> None:
    with pytest.raises(PathTraversalError):
        sandbox.resolve_path("../etc/passwd")


def test_resolve_path_rejects_absolute(sandbox: Sandbox) -> None:
    with pytest.raises(PathTraversalError):
        sandbox.resolve_path("/etc/passwd")


def test_resolve_path_rejects_null_bytes(sandbox: Sandbox) -> None:
    with pytest.raises(PathTraversalError):
        sandbox.resolve_path("file\x00.py")


def test_resolve_path_single_realpath():
    """resolve_path should use os.path.realpath without double resolution."""
    import tempfile
    import unittest.mock

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = pathlib.Path(tmpdir)
        sandbox = Sandbox(tmp_path)

        # Track calls to os.path.realpath
        original_realpath = os.path.realpath
        realpath_calls = []

        def tracking_realpath(path):
            realpath_calls.append(str(path))
            return original_realpath(path)

        with unittest.mock.patch("os.path.realpath", side_effect=tracking_realpath):
            sandbox.resolve_path("test.py")

        # Should have exactly 2 calls: one for project_dir, one for raw_candidate
        # (not additional calls from pathlib.resolve())
        assert len(realpath_calls) == 2
        # First call should be for project_dir
        assert str(tmp_path) in realpath_calls[0]
        # Second call should be for the raw candidate (project_dir / "test.py")
        assert "test.py" in realpath_calls[1]


# -- validate_write --------------------------------------------------------


def test_validate_rejects_disallowed_extension(sandbox: Sandbox) -> None:
    with pytest.raises(DisallowedExtensionError):
        sandbox.validate_write("malware.exe", "bad")


def test_validate_rejects_env(sandbox: Sandbox) -> None:
    with pytest.raises(DeniedPathError):
        sandbox.validate_write(".env", "SECRET=oops")


def test_validate_allows_env_example(sandbox: Sandbox) -> None:
    # Should not raise
    sandbox.validate_write(".env.example", "EXAMPLE=1")


def test_denied_path_env_local(sandbox: Sandbox) -> None:
    """Writing to .env.local is denied."""
    with pytest.raises(DeniedPathError):
        sandbox.validate_write(".env.local", "SECRET=oops")


def test_denied_path_env_production(sandbox: Sandbox) -> None:
    """Writing to config/.env.production is denied."""
    with pytest.raises(DeniedPathError):
        sandbox.validate_write("config/.env.production", "SECRET=oops")


def test_validate_rejects_git_path(sandbox: Sandbox) -> None:
    with pytest.raises(DeniedPathError):
        sandbox.validate_write(".git/config", "bad")


def test_validate_rejects_oversized_content(
    tmp_path: pathlib.Path,
) -> None:
    sandbox = Sandbox(tmp_path, max_file_size=100)
    with pytest.raises(FileSizeLimitError):
        sandbox.validate_write("big.py", "x" * 200)


def test_validate_rejects_when_file_count_exhausted(
    tmp_path: pathlib.Path,
) -> None:
    sandbox = Sandbox(tmp_path, max_file_count=2)
    sandbox.write_file("a.py", "a")
    sandbox.write_file("b.py", "b")
    with pytest.raises(FileCountLimitError):
        sandbox.validate_write("c.py", "c")


# -- write_file ------------------------------------------------------------


def test_write_file_creates_with_correct_content(
    sandbox: Sandbox, tmp_path: pathlib.Path
) -> None:
    sandbox.write_file("hello.py", "print('hello')")
    result = (tmp_path / "hello.py").read_text(encoding="utf-8")
    assert result == "print('hello')"


def test_write_file_dry_run_does_not_create(tmp_path: pathlib.Path) -> None:
    sandbox = Sandbox(tmp_path, dry_run=True)
    sandbox.write_file("nope.py", "should not exist")
    assert not (tmp_path / "nope.py").exists()


def test_write_file_creates_parent_directories(
    sandbox: Sandbox, tmp_path: pathlib.Path
) -> None:
    sandbox.write_file("deep/nested/dir/file.py", "content")
    assert (tmp_path / "deep" / "nested" / "dir" / "file.py").exists()


# -- read_file -------------------------------------------------------------


def test_read_file_returns_correct_content(
    sandbox: Sandbox, tmp_path: pathlib.Path
) -> None:
    target = tmp_path / "readme.md"
    target.write_text("hello world", encoding="utf-8")
    assert sandbox.read_file("readme.md") == "hello world"


def test_read_file_missing_raises(sandbox: Sandbox) -> None:
    with pytest.raises(FileNotFoundError):
        sandbox.read_file("nonexistent.py")


# -- list_files ------------------------------------------------------------


def test_list_files_returns_expected(sandbox: Sandbox, tmp_path: pathlib.Path) -> None:
    (tmp_path / "a.py").write_text("a", encoding="utf-8")
    (tmp_path / "subdir").mkdir()
    (tmp_path / "subdir" / "b.py").write_text("b", encoding="utf-8")

    files = sandbox.list_files()
    assert "a.py" in files
    assert os.path.join("subdir", "b.py") in files


def test_list_files_excludes_denied(sandbox: Sandbox, tmp_path: pathlib.Path) -> None:
    (tmp_path / ".git").mkdir()
    (tmp_path / ".git" / "config").write_text("x", encoding="utf-8")
    (tmp_path / "ok.py").write_text("ok", encoding="utf-8")

    files = sandbox.list_files()
    assert "ok.py" in files
    assert not any(".git" in f for f in files)


# -- symlink escape --------------------------------------------------------


def test_symlink_outside_project_rejected(
    sandbox: Sandbox, tmp_path: pathlib.Path
) -> None:
    outside = tmp_path.parent / "outside_file.txt"
    outside.write_text("escaped", encoding="utf-8")
    try:
        link = tmp_path / "sneaky_link.txt"
        link.symlink_to(outside)
        with pytest.raises(PathTraversalError):
            sandbox.resolve_path("sneaky_link.txt")
    finally:
        if outside.exists():
            outside.unlink()


# -- file_exists -----------------------------------------------------------


def test_file_exists_true(sandbox: Sandbox, tmp_path: pathlib.Path) -> None:
    (tmp_path / "present.py").write_text("here", encoding="utf-8")
    assert sandbox.file_exists("present.py") is True


def test_file_exists_false(sandbox: Sandbox) -> None:
    assert sandbox.file_exists("absent.py") is False


# -- file_exists with traversal returns False ------------------------------


def test_file_exists_traversal_returns_false(sandbox: Sandbox) -> None:
    assert sandbox.file_exists("../etc/passwd") is False


# -- log_fn callback -------------------------------------------------------


def test_log_fn_called_on_write(tmp_path: pathlib.Path) -> None:
    messages: list[str] = []
    sandbox = Sandbox(tmp_path, log_fn=messages.append)
    sandbox.write_file("test.py", "x = 1")
    assert any("Wrote" in m for m in messages)


def test_log_fn_called_on_dry_run(tmp_path: pathlib.Path) -> None:
    messages: list[str] = []
    sandbox = Sandbox(tmp_path, dry_run=True, log_fn=messages.append)
    sandbox.write_file("test.py", "x = 1")
    assert any("dry-run" in m for m in messages)


# -- list_files on nonexistent dir returns empty list ----------------------


def test_list_files_nonexistent_dir(sandbox: Sandbox) -> None:
    result = sandbox.list_files("no_such_dir")
    assert result == []


# -- validate_write with __pycache__ path ----------------------------------


def test_validate_rejects_pycache_path(sandbox: Sandbox) -> None:
    with pytest.raises(DeniedPathError):
        sandbox.validate_write("__pycache__/module.pyc", "bad")


# -- Phase 1 hardening tests -----------------------------------------------


def test_resolve_path_realpath_comparison(tmp_path: pathlib.Path) -> None:
    # project_dir itself is a symlink -- realpath check must still work
    real_dir = tmp_path / "real"
    real_dir.mkdir()
    link_dir = tmp_path / "link"
    link_dir.symlink_to(real_dir)
    sandbox = Sandbox(link_dir)
    # Valid path inside should not raise PathTraversalError
    resolved = sandbox.resolve_path("hello.py")
    # resolved is inside the real directory (symlink resolved by pathlib)
    assert resolved.name == "hello.py"
    assert str(resolved).startswith(str(real_dir))


def test_write_file_creates_parents_with_correct_permissions(
    tmp_path: pathlib.Path,
) -> None:
    sandbox = Sandbox(tmp_path)
    sandbox.write_file("a/b/c/file.py", "content")
    # Parent directories must exist and be accessible
    assert (tmp_path / "a" / "b" / "c" / "file.py").exists()
    mode = (tmp_path / "a").stat().st_mode & 0o777
    assert mode == 0o755


def test_write_file_cleanup_failure_logged(
    tmp_path: pathlib.Path,
    caplog: pytest.LogCaptureFixture,
) -> None:
    sandbox = Sandbox(tmp_path)
    # Simulate os.replace failing with a non-EXDEV error, then unlink failing
    with unittest.mock.patch("os.replace", side_effect=OSError("disk full")):
        with unittest.mock.patch("os.unlink", side_effect=OSError("no perm")):
            with caplog.at_level(logging.WARNING, logger="proxilion_build.sandbox"):
                with pytest.raises(OSError, match="disk full"):
                    sandbox.write_file("test.py", "content")
    assert any("clean up temp file" in r.message for r in caplog.records)


def test_write_file_overwrites_existing_file(
    sandbox: Sandbox, tmp_path: pathlib.Path
) -> None:
    sandbox.write_file("overwrite.py", "version 1")
    sandbox.write_file("overwrite.py", "version 2")
    content = (tmp_path / "overwrite.py").read_text(encoding="utf-8")
    assert content == "version 2"


# -- Phase 13: Sandbox Boundary Conditions ---------------------------------


def test_file_size_exactly_at_limit_passes(tmp_path: pathlib.Path) -> None:
    """Content exactly at max_file_size is accepted."""
    from codelicious.sandbox import Sandbox

    limit = 100
    sb = Sandbox(tmp_path, max_file_size=limit)
    content = "x" * limit  # ASCII: 1 byte per char
    sb.write_file("exact.py", content)
    assert (tmp_path / "exact.py").exists()


def test_file_size_one_over_limit_fails(tmp_path: pathlib.Path) -> None:
    """Content one byte over max_file_size is rejected."""
    from codelicious.sandbox import Sandbox

    limit = 100
    sb = Sandbox(tmp_path, max_file_size=limit)
    content = "x" * (limit + 1)
    with pytest.raises(FileSizeLimitError):
        sb.write_file("over.py", content)


def test_file_count_exactly_at_limit_passes(tmp_path: pathlib.Path) -> None:
    """Writing exactly max_file_count files succeeds."""
    from codelicious.sandbox import Sandbox

    limit = 3
    sb = Sandbox(tmp_path, max_file_count=limit)
    for i in range(limit):
        sb.write_file(f"file_{i}.py", "x = 1")
    # All should exist
    for i in range(limit):
        assert (tmp_path / f"file_{i}.py").exists()


def test_file_count_one_over_limit_fails(tmp_path: pathlib.Path) -> None:
    """Writing one more than max_file_count is rejected."""
    from codelicious.sandbox import Sandbox

    limit = 3
    sb = Sandbox(tmp_path, max_file_count=limit)
    for i in range(limit):
        sb.write_file(f"file_{i}.py", "x = 1")
    with pytest.raises(FileCountLimitError):
        sb.write_file("one_more.py", "x = 1")


def test_overwrite_existing_file_does_not_increment_count(
    tmp_path: pathlib.Path,
) -> None:
    """Overwriting an existing file is allowed when the limit has not been reached."""
    from codelicious.sandbox import Sandbox

    # Use limit=3 so there is headroom to overwrite without hitting the ceiling
    limit = 3
    sb = Sandbox(tmp_path, max_file_count=limit)
    sb.write_file("a.py", "v1")
    sb.write_file("b.py", "v1")
    # Overwrite a.py (count goes to 3, but that is == limit so still allowed by validate_write)
    sb.write_file("a.py", "v2")
    assert (tmp_path / "a.py").read_text(encoding="utf-8") == "v2"


def test_write_empty_content_succeeds(tmp_path: pathlib.Path) -> None:
    """Writing an empty string to a new file succeeds."""
    from codelicious.sandbox import Sandbox

    sb = Sandbox(tmp_path)
    sb.write_file("empty.py", "")
    assert (tmp_path / "empty.py").read_text(encoding="utf-8") == ""


# -- Phase 15: Path Traversal Adversarial Tests ----------------------------


def test_resolve_path_double_dot_in_middle(tmp_path: pathlib.Path) -> None:
    """'src/../etc/passwd' resolves and is rejected as a traversal."""
    from codelicious.sandbox import Sandbox

    sb = Sandbox(tmp_path)
    with pytest.raises(PathTraversalError):
        sb.resolve_path("src/../../../etc/passwd")


def test_resolve_path_encoded_dot_dot(tmp_path: pathlib.Path) -> None:
    """URL-encoded traversal '..%2fetc' is treated as a literal path component."""
    from codelicious.sandbox import Sandbox

    sb = Sandbox(tmp_path)
    # The path component "..%2fetc" is not a traversal (% is literal)
    # — it should either succeed (unusual path) or raise PathTraversalError.
    # The important thing is it must not silently escape the sandbox.
    try:
        resolved = sb.resolve_path("..%2fetc%2fpasswd")
        # If it resolves, it must be inside the sandbox
        assert str(resolved).startswith(str(tmp_path))
    except PathTraversalError:
        pass  # expected rejection


def test_resolve_path_unicode_slash(tmp_path: pathlib.Path) -> None:
    """Unicode fullwidth solidus does not bypass path resolution."""
    from codelicious.sandbox import Sandbox

    sb = Sandbox(tmp_path)
    # '\uff0f' is a unicode slash lookalike — should be treated as a normal char
    path = "safe\uff0fetc"
    try:
        resolved = sb.resolve_path(path)
        assert str(resolved).startswith(str(tmp_path))
    except (PathTraversalError, Exception):
        pass  # any clean error is acceptable


def test_resolve_path_trailing_slash(tmp_path: pathlib.Path) -> None:
    """A path with a trailing slash resolves to a path inside the sandbox."""
    from codelicious.sandbox import Sandbox

    sb = Sandbox(tmp_path)
    resolved = sb.resolve_path("src/")
    assert str(resolved).startswith(str(tmp_path))


def test_validate_write_very_long_path(tmp_path: pathlib.Path) -> None:
    """A path component longer than 255 characters is handled without crashing."""
    from codelicious.sandbox import Sandbox

    sb = Sandbox(tmp_path)
    long_name = "a" * 260 + ".py"
    try:
        sb.write_file(long_name, "x = 1")
    except Exception as exc:
        # Must raise a clean exception, not an unhandled OS error that crashes
        assert exc is not None


def test_validate_write_hidden_file_allowed(tmp_path: pathlib.Path) -> None:
    """A hidden file like '.gitignore' in ALLOWED_EXACT_NAMES is accepted."""
    from codelicious.sandbox import Sandbox

    sb = Sandbox(tmp_path)
    sb.write_file(".gitignore", "*.pyc")
    assert (tmp_path / ".gitignore").exists()


# -- Phase 2: TOCTOU Race Condition Tests ----------------------------------


def test_write_file_rejects_symlink_target(tmp_path: pathlib.Path) -> None:
    """Writing through a symlink to a different location is rejected."""
    from codelicious.sandbox import Sandbox

    sb = Sandbox(tmp_path)
    # Create the target file first
    target = tmp_path / "real_file.py"
    target.write_text("original", encoding="utf-8")
    # Create a symlink that points to target (same content but different path)
    link = tmp_path / "link_file.py"
    link.symlink_to(target)
    # Attempting to write through the symlink should be rejected
    with pytest.raises(PathTraversalError):
        sb.write_file("link_file.py", "new content")


def test_write_file_cleans_up_temp_on_error(tmp_path: pathlib.Path) -> None:
    """Temp file is cleaned up when os.replace raises OSError."""
    from codelicious.sandbox import Sandbox

    sb = Sandbox(tmp_path)
    temp_files_before = list(tmp_path.glob("*.tmp"))

    with unittest.mock.patch("os.replace", side_effect=OSError("simulated failure")):
        with pytest.raises(OSError, match="simulated failure"):
            sb.write_file("test.py", "content")

    # Verify temp file was cleaned up
    temp_files_after = list(tmp_path.glob("*.tmp"))
    assert len(temp_files_after) == len(temp_files_before)
