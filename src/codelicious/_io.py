"""Shared I/O utilities for codelicious."""

from __future__ import annotations

import errno
import os
import pathlib
import shutil
import tempfile

__all__ = ["atomic_write_text"]


def atomic_write_text(
    target: pathlib.Path,
    content: str,
    mode: int = 0o644,
    encoding: str = "utf-8",
) -> None:
    """Write content to target atomically using tempfile + os.replace.

    - Writes to a temp file in the same directory as target
    - Calls fsync before replacing
    - Falls back to shutil.move on cross-filesystem errors (errno.EXDEV)
    - Cleans up temp file on any exception
    - Sets file permissions to mode after successful write
    """
    target = pathlib.Path(target)
    parent = target.parent
    parent.mkdir(parents=True, exist_ok=True)

    fd, tmp_path = tempfile.mkstemp(dir=str(parent), suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding=encoding) as f:
            f.write(content)
            f.flush()
            os.fsync(f.fileno())
        try:
            os.replace(tmp_path, str(target))
        except OSError as e:
            if e.errno == errno.EXDEV:
                # Cross-filesystem; fall back to shutil.move
                shutil.move(tmp_path, str(target))
            else:
                raise
        os.chmod(str(target), mode)
    except Exception:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise
