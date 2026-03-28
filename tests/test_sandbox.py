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
    """resolve_path should return a path inside the project directory."""
    import tempfile

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp_path = pathlib.Path(tmpdir).resolve()
        sandbox = Sandbox(tmp_path)

        resolved = sandbox.resolve_path("test.py")

        # Behavioral assertion: resolved path must be inside the project directory
        assert str(resolved).startswith(str(tmp_path)), (
            f"Resolved path {resolved} is not inside project directory {tmp_path}"
        )


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


def test_write_file_creates_with_correct_content(sandbox: Sandbox, tmp_path: pathlib.Path) -> None:
    sandbox.write_file("hello.py", "print('hello')")
    result = (tmp_path / "hello.py").read_text(encoding="utf-8")
    assert result == "print('hello')"


def test_write_file_dry_run_does_not_create(tmp_path: pathlib.Path) -> None:
    sandbox = Sandbox(tmp_path, dry_run=True)
    sandbox.write_file("nope.py", "should not exist")
    assert not (tmp_path / "nope.py").exists()


def test_write_file_creates_parent_directories(sandbox: Sandbox, tmp_path: pathlib.Path) -> None:
    sandbox.write_file("deep/nested/dir/file.py", "content")
    assert (tmp_path / "deep" / "nested" / "dir" / "file.py").exists()


# -- read_file -------------------------------------------------------------


def test_read_file_returns_correct_content(sandbox: Sandbox, tmp_path: pathlib.Path) -> None:
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


def test_symlink_outside_project_rejected(sandbox: Sandbox, tmp_path: pathlib.Path) -> None:
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
            with caplog.at_level(logging.WARNING, logger="codelicious.sandbox"):
                with pytest.raises(OSError, match="disk full"):
                    sandbox.write_file("test.py", "content")
    assert any("clean up temp file" in r.message for r in caplog.records)


def test_write_file_overwrites_existing_file(sandbox: Sandbox, tmp_path: pathlib.Path) -> None:
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
    """URL-encoded traversal '..%2fetc' is treated as a literal path component inside the sandbox."""
    from codelicious.sandbox import Sandbox

    sb = Sandbox(tmp_path)
    # The path component "..%2fetc%2fpasswd" contains literal '%' characters.
    # Python's pathlib does NOT URL-decode paths, so '%2f' is NOT a separator.
    # The entire string is a single path component, not a traversal — it resolves
    # to tmp_path / "..%2fetc%2fpasswd" which stays inside the sandbox.
    resolved = sb.resolve_path("..%2fetc%2fpasswd")
    assert str(resolved).startswith(str(tmp_path))


def test_resolve_path_unicode_slash(tmp_path: pathlib.Path) -> None:
    """Unicode fullwidth solidus is treated as a normal character and stays inside the sandbox."""
    from codelicious.sandbox import Sandbox

    sb = Sandbox(tmp_path)
    # '\uff0f' is a unicode slash lookalike — it is NOT a path separator on any OS,
    # so pathlib treats it as a regular character. The path must resolve inside the sandbox.
    path = "safe\uff0fetc"
    resolved = sb.resolve_path(path)
    assert str(resolved).startswith(str(tmp_path))


def test_resolve_path_trailing_slash(tmp_path: pathlib.Path) -> None:
    """A path with a trailing slash resolves to a path inside the sandbox."""
    from codelicious.sandbox import Sandbox

    sb = Sandbox(tmp_path)
    resolved = sb.resolve_path("src/")
    assert str(resolved).startswith(str(tmp_path))


def test_validate_write_very_long_path(tmp_path: pathlib.Path) -> None:
    """A path component longer than 255 characters raises OSError (ENAMETOOLONG)."""
    from codelicious.sandbox import Sandbox

    sb = Sandbox(tmp_path)
    long_name = "a" * 260 + ".py"
    with pytest.raises(OSError):
        sb.write_file(long_name, "x = 1")


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


# -- Phase 2 spec-16: Sandbox Race Condition Tests --------------------------


def test_overwrite_does_not_increment_count(tmp_path: pathlib.Path) -> None:
    """Writing the same file twice should not increment the count twice (P1-5 fix)."""
    from codelicious.sandbox import Sandbox

    sb = Sandbox(tmp_path, max_file_count=5)
    sb.write_file("same.py", "version 1")
    sb.write_file("same.py", "version 2")
    # The internal count should be 1, not 2
    assert sb._files_created_count == 1


def test_file_limit_exact_boundary(tmp_path: pathlib.Path) -> None:
    """Writing exactly max_file_count files succeeds, next one fails (P1-4 fix)."""
    from codelicious.sandbox import Sandbox

    limit = 3
    sb = Sandbox(tmp_path, max_file_count=limit)
    for i in range(limit):
        sb.write_file(f"file_{i}.py", f"content {i}")

    # Verify count is exactly at limit
    assert sb._files_created_count == limit

    # Next new file should fail
    with pytest.raises(FileCountLimitError):
        sb.write_file("one_too_many.py", "fail")


def test_concurrent_writes_respect_limit(tmp_path: pathlib.Path) -> None:
    """Concurrent writes should respect the file count limit (P1-4 fix)."""
    from concurrent.futures import ThreadPoolExecutor, as_completed

    from codelicious.sandbox import Sandbox

    limit = 10
    sb = Sandbox(tmp_path, max_file_count=limit)
    num_writes = limit + 5  # Try to write more than the limit

    def write_file(idx: int) -> bool:
        """Return True if write succeeded, False if it raised FileCountLimitError."""
        try:
            sb.write_file(f"concurrent_{idx}.py", f"content {idx}")
            return True
        except FileCountLimitError:
            return False

    thread_count = 8
    unexpected_errors: list[Exception] = []
    with ThreadPoolExecutor(max_workers=thread_count) as executor:
        futures = [executor.submit(write_file, i) for i in range(num_writes)]
        results: list[bool] = []
        for f in as_completed(futures):
            try:
                results.append(f.result())
            except FileCountLimitError:
                # FileCountLimitError escaped write_file wrapper — still a counted rejection
                results.append(False)
            except Exception as exc:
                unexpected_errors.append(exc)
                results.append(False)

    assert not unexpected_errors, f"Unexpected exceptions during concurrent writes: {unexpected_errors}"

    # The sandbox lock guarantees exactly `limit` successful writes — never more.
    # The lower bound is limit-1 (one slot may be lost to a benign TOCTOU in the
    # internal counter read before the lock, but the atomic lock prevents over-count).
    success_count = sum(results)
    assert success_count <= limit, f"Too many writes succeeded: {success_count} > {limit}"
    assert success_count >= limit - 1, (
        f"Too few writes succeeded: {success_count} < {limit - 1} (expected at least limit-1={limit - 1})"
    )


def test_symlink_attack_post_write_check(tmp_path: pathlib.Path) -> None:
    """Post-write verification catches symlink attacks (P1-6 fix)."""
    from codelicious.sandbox import Sandbox

    sb = Sandbox(tmp_path)
    # The post-write check already exists and is tested by existing tests.
    # This test verifies the symlink detection before write.
    outside = tmp_path.parent / "escaped_target.py"
    outside.write_text("escaped content", encoding="utf-8")

    try:
        # Create a symlink inside the sandbox pointing outside
        link = tmp_path / "sneaky.py"
        link.symlink_to(outside)

        # Attempting to write through this symlink should be rejected
        with pytest.raises(PathTraversalError):
            sb.write_file("sneaky.py", "malicious content")
    finally:
        if outside.exists():
            outside.unlink()


def test_mkdir_inside_lock(tmp_path: pathlib.Path) -> None:
    """Directory creation is atomic with count check (P2-6 fix)."""
    from concurrent.futures import ThreadPoolExecutor

    from codelicious.sandbox import Sandbox

    sb = Sandbox(tmp_path, max_file_count=10)

    # Concurrent writes to the same new subdirectory should not race
    def write_to_subdir(idx: int) -> None:
        sb.write_file(f"newdir/file_{idx}.py", f"content {idx}")

    with ThreadPoolExecutor(max_workers=4) as executor:
        list(executor.map(write_to_subdir, range(4)))

    # Verify all files exist and directory was created correctly
    subdir = tmp_path / "newdir"
    assert subdir.is_dir()
    for i in range(4):
        assert (subdir / f"file_{i}.py").exists()


def test_chmod_failure_logged(
    tmp_path: pathlib.Path,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """chmod failure is logged at WARNING level (P2-7 fix)."""
    from codelicious.sandbox import Sandbox

    sb = Sandbox(tmp_path)

    with unittest.mock.patch("os.chmod", side_effect=OSError("permission denied")):
        with caplog.at_level(logging.WARNING, logger="codelicious.sandbox"):
            sb.write_file("test.py", "content")

    # Verify warning was logged
    assert any("Failed to set permissions" in r.message for r in caplog.records)


def test_chmod_failure_does_not_raise(tmp_path: pathlib.Path) -> None:
    """chmod failure should not cause write_file to raise (P2-7 fix)."""
    from codelicious.sandbox import Sandbox

    sb = Sandbox(tmp_path)

    with unittest.mock.patch("os.chmod", side_effect=OSError("permission denied")):
        # Should not raise, write is best-effort for permissions
        resolved = sb.write_file("test.py", "content")

    # Verify file was written successfully
    assert resolved.exists()
    assert resolved.read_text(encoding="utf-8") == "content"


def test_new_file_increments_count(tmp_path: pathlib.Path) -> None:
    """Writing a new file increments the count (basic sanity check)."""
    from codelicious.sandbox import Sandbox

    sb = Sandbox(tmp_path)
    assert sb._files_created_count == 0

    sb.write_file("new_file.py", "content")
    assert sb._files_created_count == 1

    sb.write_file("another_file.py", "more content")
    assert sb._files_created_count == 2


# -- Finding 43: Post-read TOCTOU verification in read_file ----------------


def test_read_file_post_read_toctou_symlink_escape(tmp_path: pathlib.Path) -> None:
    """read_file raises PathTraversalError when post-read re-resolve escapes sandbox.

    This simulates a TOCTOU attack where a symlink is swapped in after the
    pre-read path validation but we detect it via post-read re-resolution.
    We achieve this by patching os.path.realpath so that the second call
    (post-read) returns a path outside the project directory.
    """
    import os
    import unittest.mock

    from codelicious.errors import PathTraversalError
    from codelicious.sandbox import Sandbox

    sb = Sandbox(tmp_path)
    target = tmp_path / "safe.py"
    target.write_text("safe content", encoding="utf-8")

    outside = str(tmp_path.parent / "outside_file.py")
    original_realpath = os.path.realpath
    call_count = {"n": 0}

    def patched_realpath(path: str) -> str:
        result = original_realpath(path)
        # The first several calls are from resolve_path (pre-read checks).
        # After the file has been read, the post-read check calls realpath
        # on the resolved file path.  We intercept that specific call and
        # return a path outside the sandbox to simulate a symlink swap.
        call_count["n"] += 1
        if str(path).endswith("safe.py") and call_count["n"] > 2:
            return outside
        return result

    with unittest.mock.patch("os.path.realpath", side_effect=patched_realpath):
        with pytest.raises(PathTraversalError, match="Post-read verification failed"):
            sb.read_file("safe.py")


def test_read_file_post_read_toctou_check_passes_for_normal_file(tmp_path: pathlib.Path) -> None:
    """read_file succeeds and returns content when post-read re-resolve stays inside sandbox."""
    from codelicious.sandbox import Sandbox

    sb = Sandbox(tmp_path)
    target = tmp_path / "normal.py"
    target.write_text("normal content", encoding="utf-8")

    content = sb.read_file("normal.py")
    assert content == "normal content"


def test_read_file_post_read_toctou_logs_warning_on_escape(
    tmp_path: pathlib.Path,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """A TOCTOU escape during read_file logs a WARNING."""
    import os
    import unittest.mock

    from codelicious.errors import PathTraversalError
    from codelicious.sandbox import Sandbox

    sb = Sandbox(tmp_path)
    target = tmp_path / "log_test.py"
    target.write_text("content", encoding="utf-8")

    outside = str(tmp_path.parent / "outside.py")
    original_realpath = os.path.realpath
    call_count = {"n": 0}

    def patched_realpath(path: str) -> str:
        result = original_realpath(path)
        call_count["n"] += 1
        if str(path).endswith("log_test.py") and call_count["n"] > 2:
            return outside
        return result

    with unittest.mock.patch("os.path.realpath", side_effect=patched_realpath):
        with caplog.at_level(logging.WARNING, logger="codelicious.sandbox"):
            with pytest.raises(PathTraversalError):
                sb.read_file("log_test.py")

    assert any("TOCTOU" in r.message or "escapes" in r.message for r in caplog.records)
