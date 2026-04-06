"""Tests for codelicious._io — atomic_write_text utility."""

from __future__ import annotations

import errno
import pathlib
import stat
from unittest.mock import patch

import pytest

from codelicious._io import atomic_write_text


# ---------------------------------------------------------------------------
# Basic write behaviour
# ---------------------------------------------------------------------------


def test_atomic_write_creates_file(tmp_path: pathlib.Path) -> None:
    """Write to a new file; verify the file exists and content matches."""
    target = tmp_path / "hello.txt"
    atomic_write_text(target, "hello world")

    assert target.is_file()
    assert target.read_text(encoding="utf-8") == "hello world"


def test_atomic_write_creates_parent_dirs(tmp_path: pathlib.Path) -> None:
    """Write to a deeply nested path whose parents don't yet exist."""
    target = tmp_path / "a" / "b" / "c" / "data.txt"
    atomic_write_text(target, "nested content")

    assert target.is_file()
    assert target.read_text(encoding="utf-8") == "nested content"


def test_atomic_write_overwrites_existing(tmp_path: pathlib.Path) -> None:
    """Writing to an existing file replaces its content atomically."""
    target = tmp_path / "existing.txt"
    target.write_text("old content", encoding="utf-8")

    atomic_write_text(target, "new content")

    assert target.read_text(encoding="utf-8") == "new content"


# ---------------------------------------------------------------------------
# Permissions
# ---------------------------------------------------------------------------


def test_atomic_write_sets_permissions(tmp_path: pathlib.Path) -> None:
    """Write with explicit mode=0o600; verify file has exactly 0o600 permissions."""
    target = tmp_path / "secret.txt"
    atomic_write_text(target, "private", mode=0o600)

    actual_mode = stat.S_IMODE(target.stat().st_mode)
    assert actual_mode == 0o600


def test_atomic_write_default_permissions(tmp_path: pathlib.Path) -> None:
    """Write without an explicit mode; verify permissions default to 0o644."""
    target = tmp_path / "public.txt"
    atomic_write_text(target, "public content")

    actual_mode = stat.S_IMODE(target.stat().st_mode)
    assert actual_mode == 0o644


# ---------------------------------------------------------------------------
# Cleanup on error
# ---------------------------------------------------------------------------


def test_atomic_write_cleans_up_on_error(tmp_path: pathlib.Path) -> None:
    """When os.replace raises a non-EXDEV OSError the temp file is cleaned up."""
    target = tmp_path / "target.txt"

    generic_error = OSError("generic failure")
    generic_error.errno = errno.EIO  # not EXDEV

    with patch("os.replace", side_effect=generic_error):
        with pytest.raises(OSError, match="generic failure"):
            atomic_write_text(target, "content")

    # No .tmp file should linger in the directory
    tmp_files = list(tmp_path.glob("*.tmp"))
    assert tmp_files == [], f"Temp files left behind: {tmp_files}"


# ---------------------------------------------------------------------------
# Cross-filesystem fallback
# ---------------------------------------------------------------------------


def test_atomic_write_cross_filesystem_fallback(tmp_path: pathlib.Path) -> None:
    """When os.replace raises EXDEV, shutil.move is used as a fallback."""
    target = tmp_path / "moved.txt"

    exdev_error = OSError("cross-device link")
    exdev_error.errno = errno.EXDEV

    # Patch os.chmod as well because shutil.move is mocked (file never appears
    # at target), so the subsequent os.chmod call would raise FileNotFoundError.
    with patch("os.replace", side_effect=exdev_error):
        with patch("shutil.move") as mock_move:
            with patch("os.chmod"):
                atomic_write_text(target, "content")

    # shutil.move must have been called exactly once
    assert mock_move.call_count == 1
    # The destination argument must be the target path as a string
    _, move_dst = mock_move.call_args[0]
    assert move_dst == str(target)


# ---------------------------------------------------------------------------
# Unicode / encoding
# ---------------------------------------------------------------------------


def test_atomic_write_encoding(tmp_path: pathlib.Path) -> None:
    """Write unicode content (non-ASCII) and read back with the same encoding."""
    target = tmp_path / "unicode.txt"
    content = "caf\u00e9 \u4e2d\u6587 \U0001f600"  # café 中文 😀

    atomic_write_text(target, content, encoding="utf-8")

    assert target.read_text(encoding="utf-8") == content


# ---------------------------------------------------------------------------
# spec-20 Phase 12: Atomic Write Path Validation (S20-P2-10)
# ---------------------------------------------------------------------------


class TestAtomicWritePathValidation:
    """Tests for S20-P2-10: project_root path validation in atomic_write_text."""

    def test_write_within_project_root_succeeds(self, tmp_path: pathlib.Path) -> None:
        """Writing to a path inside project_root must succeed."""
        target = tmp_path / "subdir" / "file.txt"
        atomic_write_text(target, "content", project_root=tmp_path)
        assert target.read_text(encoding="utf-8") == "content"

    def test_write_outside_project_root_raises(self, tmp_path: pathlib.Path) -> None:
        """Writing to a path outside project_root must raise SandboxViolationError."""
        from codelicious.errors import SandboxViolationError

        outside = tmp_path.parent / "outside_file.txt"
        with pytest.raises(SandboxViolationError, match="outside project"):
            atomic_write_text(outside, "evil", project_root=tmp_path)

    def test_write_with_symlink_target_raises(self, tmp_path: pathlib.Path) -> None:
        """Writing to a symlink target must raise SandboxViolationError."""
        from codelicious.errors import SandboxViolationError

        real_file = tmp_path / "real.txt"
        real_file.write_text("original", encoding="utf-8")
        link = tmp_path / "link.txt"
        link.symlink_to(real_file)

        with pytest.raises(SandboxViolationError, match="symlink"):
            atomic_write_text(link, "overwrite via symlink", project_root=tmp_path)

    def test_write_default_permissions_0644(self, tmp_path: pathlib.Path) -> None:
        """Default permissions must be 0o644."""
        target = tmp_path / "default.txt"
        atomic_write_text(target, "content", project_root=tmp_path)
        actual = stat.S_IMODE(target.stat().st_mode)
        assert actual == 0o644

    def test_write_sensitive_permissions_0600(self, tmp_path: pathlib.Path) -> None:
        """Sensitive files must be writable with mode=0o600."""
        target = tmp_path / "settings.json"
        atomic_write_text(target, '{"key": "val"}', mode=0o600, project_root=tmp_path)
        actual = stat.S_IMODE(target.stat().st_mode)
        assert actual == 0o600

    def test_write_without_project_root_allows_any_path(self, tmp_path: pathlib.Path) -> None:
        """Without project_root, any path must be accepted (backward compat)."""
        outside = tmp_path / "anywhere" / "file.txt"
        atomic_write_text(outside, "content")
        assert outside.read_text(encoding="utf-8") == "content"

    def test_write_creates_parent_directories(self, tmp_path: pathlib.Path) -> None:
        """Parent directories must be created even with project_root set."""
        target = tmp_path / "a" / "b" / "c" / "deep.txt"
        atomic_write_text(target, "deep", project_root=tmp_path)
        assert target.read_text(encoding="utf-8") == "deep"

    def test_write_atomic_replace_not_truncate(self, tmp_path: pathlib.Path) -> None:
        """Overwrite must use atomic replace (not truncate-in-place)."""
        target = tmp_path / "atomic.txt"
        target.write_text("old content that is longer", encoding="utf-8")
        atomic_write_text(target, "new", project_root=tmp_path)
        assert target.read_text(encoding="utf-8") == "new"
