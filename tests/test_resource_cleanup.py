"""Tests for resource cleanup improvements (spec-19 Phase 3: RC-1, RC-2, RC-3)."""

from __future__ import annotations

import os
import pathlib
import tempfile
import unittest.mock

import pytest

from codelicious._io import atomic_write_text

# -- RC-2: _io.py atomic_write_text cleans up fd on fdopen failure ----------


class TestAtomicWriteFdCleanup:
    """Verify that fd is closed and temp file is unlinked when os.fdopen fails."""

    def test_fd_closed_when_fdopen_raises(self, tmp_path: pathlib.Path) -> None:
        """If os.fdopen raises, the raw fd must be closed (no leak)."""
        target = tmp_path / "output.txt"
        real_mkstemp = tempfile.mkstemp

        captured_fd: list[int] = []

        def tracking_mkstemp(**kwargs):
            fd, path = real_mkstemp(**kwargs)
            captured_fd.append(fd)
            return fd, path

        with unittest.mock.patch("codelicious._io.tempfile.mkstemp", side_effect=tracking_mkstemp):
            with unittest.mock.patch("codelicious._io.os.fdopen", side_effect=OSError("mock fdopen failure")):
                with pytest.raises(OSError, match="mock fdopen failure"):
                    atomic_write_text(target, "content")

        # The fd should have been closed in the cleanup path.
        # Trying to close it again should raise OSError (bad file descriptor).
        assert len(captured_fd) == 1
        with pytest.raises(OSError):
            os.close(captured_fd[0])

    def test_temp_file_unlinked_when_fdopen_raises(self, tmp_path: pathlib.Path) -> None:
        """If os.fdopen raises, the temp file must be unlinked."""
        target = tmp_path / "output.txt"
        captured_paths: list[str] = []

        real_mkstemp = tempfile.mkstemp

        def tracking_mkstemp(**kwargs):
            fd, path = real_mkstemp(**kwargs)
            captured_paths.append(path)
            return fd, path

        with unittest.mock.patch("codelicious._io.tempfile.mkstemp", side_effect=tracking_mkstemp):
            with unittest.mock.patch("codelicious._io.os.fdopen", side_effect=OSError("mock fdopen failure")):
                with pytest.raises(OSError):
                    atomic_write_text(target, "content")

        assert len(captured_paths) == 1
        assert not os.path.exists(captured_paths[0]), "Temp file should have been unlinked"


# -- RC-3: sandbox.py write_file tmp_name already initialized to None --------


class TestSandboxTmpNameInit:
    """Verify sandbox write_file handles NamedTemporaryFile failure gracefully."""

    def test_write_file_cleanup_when_tempfile_fails(self, tmp_path: pathlib.Path) -> None:
        """If NamedTemporaryFile itself raises, no NameError from tmp_name."""
        from codelicious.sandbox import Sandbox

        sb = Sandbox(tmp_path)
        (tmp_path / "test.py").write_text("# placeholder", encoding="utf-8")

        with (
            unittest.mock.patch(
                "codelicious.sandbox.tempfile.NamedTemporaryFile",
                side_effect=OSError("mock tempfile failure"),
            ),
            pytest.raises(OSError, match="mock tempfile failure"),
        ):
            sb.write_file("test.py", "new content")

    def test_write_file_succeeds_normally(self, tmp_path: pathlib.Path) -> None:
        """Baseline: write_file works end-to-end when no errors occur."""
        from codelicious.sandbox import Sandbox

        sb = Sandbox(tmp_path)
        resolved = sb.write_file("hello.py", "print('hello')")
        assert resolved.read_text(encoding="utf-8") == "print('hello')"
