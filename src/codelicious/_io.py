"""Shared I/O utilities for codelicious."""

from __future__ import annotations

import errno
import os
import pathlib
import shutil
import tempfile

__all__ = ["atomic_write_text", "read_text_safe"]


def atomic_write_text(
    target: pathlib.Path,
    content: str,
    mode: int = 0o644,
    encoding: str = "utf-8",
    *,
    project_root: pathlib.Path | None = None,
) -> None:
    """Write content to target atomically using tempfile + os.replace.

    - Writes to a temp file in the same directory as target
    - Calls fsync before replacing
    - Falls back to shutil.move on cross-filesystem errors (errno.EXDEV)
    - Cleans up temp file on any exception
    - Sets file permissions to mode after successful write

    When *project_root* is provided, the resolved target path must be
    within the resolved project root and must not be a symlink (S20-P2-10).
    """
    from codelicious.errors import SandboxViolationError

    target = pathlib.Path(target)

    # Path validation when project_root is specified (S20-P2-10)
    if project_root is not None:
        resolved_target = target.resolve()
        resolved_root = pathlib.Path(project_root).resolve()
        if not str(resolved_target).startswith(str(resolved_root) + os.sep) and resolved_target != resolved_root:
            raise SandboxViolationError(f"Write target outside project: {resolved_target}")
        if target.exists() and target.is_symlink():
            raise SandboxViolationError(f"Write target is symlink: {target}")

    parent = target.parent
    parent.mkdir(parents=True, exist_ok=True)

    fd, tmp_path = tempfile.mkstemp(dir=str(parent), suffix=".tmp")
    fd_owned = False  # Track whether os.fdopen has taken ownership of fd
    try:
        with os.fdopen(fd, "w", encoding=encoding) as f:
            fd_owned = True  # fd is now owned by the file object
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
        # Close fd if os.fdopen never claimed it (RC-2: prevent fd leak)
        if not fd_owned:
            try:
                os.close(fd)
            except OSError:
                pass
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise


def read_text_safe(path: pathlib.Path, label: str | None = None) -> str:
    """Read a text file, raising FileReadError on binary content.

    Wraps ``Path.read_text(encoding='utf-8')`` and catches
    ``UnicodeDecodeError``, converting it to a ``FileReadError`` with
    a human-readable message that includes the filename.

    *label* is used in the error message; defaults to ``path.name``.
    """
    from codelicious.errors import FileReadError

    display = label or path.name
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        raise FileReadError(
            f"Cannot read '{display}' as text (likely a binary file). Only UTF-8 text files are supported.",
            path=str(path),
        )
