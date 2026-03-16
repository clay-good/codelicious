"""Enforces filesystem access control for safe file operations."""

from __future__ import annotations

import logging
import os
import pathlib
import shutil
import tempfile
import threading
from typing import Callable

from codelicious.errors import (
    DeniedPathError,
    DisallowedExtensionError,
    FileCountLimitError,
    FileSizeLimitError,
    PathTraversalError,
)

__all__ = ["Sandbox"]

logger = logging.getLogger("codelicious.sandbox")


class Sandbox:
    """Filesystem sandbox that validates and controls all file operations."""

    ALLOWED_EXTENSIONS: frozenset[str] = frozenset(
        {
            ".py",
            ".md",
            ".txt",
            ".json",
            ".yaml",
            ".yml",
            ".toml",
            ".cfg",
            ".ini",
            ".html",
            ".css",
            ".js",
            ".ts",
            ".jsx",
            ".tsx",
            ".sh",
            ".sql",
            ".go",
            ".rs",
            ".java",
            ".rb",
            ".php",
            ".c",
            ".h",
            ".cpp",
            ".hpp",
            ".r",
            ".swift",
            ".kt",
            ".dart",
            ".lock",
        }
    )

    ALLOWED_EXACT_NAMES: frozenset[str] = frozenset(
        {
            "Makefile",
            "Dockerfile",
            ".gitignore",
            ".env.example",
        }
    )

    DENIED_PATTERNS: frozenset[str] = frozenset(
        {
            ".git",
            ".env",
            "__pycache__",
            ".codelicious",
        }
    )

    def __init__(
        self,
        project_dir: pathlib.Path,
        *,
        dry_run: bool = False,
        max_file_size: int = 1_048_576,
        max_file_count: int = 200,
        log_fn: Callable[[str], None] | None = None,
    ) -> None:
        self.project_dir: pathlib.Path = project_dir.resolve()
        self.dry_run: bool = dry_run
        self.max_file_size: int = max_file_size
        self.max_file_count: int = max_file_count
        self.log_fn: Callable[[str], None] | None = log_fn
        self._files_created_count: int = 0
        self._lock: threading.Lock = threading.Lock()

    def _log(self, message: str) -> None:
        if self.log_fn is not None:
            self.log_fn(message)

    def resolve_path(self, relative_path: str) -> pathlib.Path:
        """Resolve a relative path safely within the project directory."""
        logger.debug("Resolving path: %s", relative_path)
        stripped = relative_path.strip()

        if "\x00" in stripped:
            raise PathTraversalError(
                "Null bytes are not allowed in paths", path=relative_path
            )

        # Check for path traversal using both POSIX and native path parsing
        # to handle cross-platform attacks (e.g., "..\" on Windows)
        posix_parts = pathlib.PurePosixPath(stripped).parts
        native_parts = pathlib.PurePath(stripped).parts
        if ".." in posix_parts or ".." in native_parts:
            raise PathTraversalError(
                "Path traversal via '..' is not allowed", path=relative_path
            )

        # Check for absolute paths using both formats
        is_posix_abs = pathlib.PurePosixPath(stripped).is_absolute()
        is_native_abs = pathlib.PurePath(stripped).is_absolute()
        if is_posix_abs or is_native_abs:
            raise PathTraversalError(
                "Absolute paths are not allowed", path=relative_path
            )

        raw_candidate = self.project_dir / stripped
        resolved_project = pathlib.Path(os.path.realpath(self.project_dir))
        resolved_candidate = pathlib.Path(os.path.realpath(raw_candidate))

        logger.debug("TOCTOU: pre-validation realpath=%s", resolved_candidate)

        if (
            not str(resolved_candidate).startswith(str(resolved_project) + os.sep)
            and resolved_candidate != resolved_project
        ):
            raise PathTraversalError(
                "Resolved path escapes the project directory",
                path=relative_path,
            )

        logger.debug("Resolved: %s -> %s", relative_path, resolved_candidate)
        return resolved_candidate

    def _check_denied(self, resolved_path: pathlib.Path) -> None:
        """Reject paths that match denied patterns."""
        logger.debug("Checking denied patterns for: %s", resolved_path)
        try:
            rel = resolved_path.relative_to(self.project_dir)
        except ValueError:
            raise PathTraversalError(
                "Path is outside the project directory",
                path=str(resolved_path),
            )

        # Check if the filename is in explicitly allowed names
        filename = resolved_path.name
        if filename in self.ALLOWED_EXACT_NAMES:
            return

        for part in rel.parts:
            for pattern in self.DENIED_PATTERNS:
                if pattern == ".env":
                    # Block .env and .env.* variants (e.g., .env.local, .env.production)
                    # but allow .env.example which is in ALLOWED_EXACT_NAMES (checked above)
                    if part == ".env" or part.startswith(".env."):
                        raise DeniedPathError(
                            f"Writing to denied path: {part}",
                            path=str(rel),
                        )
                else:
                    if part == pattern:
                        raise DeniedPathError(
                            f"Writing to denied path: {pattern}",
                            path=str(rel),
                        )

    def _check_extension(self, resolved_path: pathlib.Path) -> None:
        """Reject files with disallowed extensions."""
        logger.debug(
            "Checking extension: %s (suffix=%s)",
            resolved_path.name,
            resolved_path.suffix,
        )
        name = resolved_path.name

        if name in self.ALLOWED_EXACT_NAMES:
            return

        suffix = resolved_path.suffix
        if suffix in self.ALLOWED_EXTENSIONS:
            return

        raise DisallowedExtensionError(
            f"File extension '{suffix}' is not allowed",
            path=str(resolved_path.name),
        )

    def validate_write(self, relative_path: str, content: str) -> pathlib.Path:
        """Validate that a write operation is permitted."""
        logger.debug(
            "Validating write: path=%s, content_size=%d bytes",
            relative_path,
            len(content.encode("utf-8")),
        )
        resolved = self.resolve_path(relative_path)
        self._check_denied(resolved)
        self._check_extension(resolved)

        content_size = len(content.encode("utf-8"))
        if content_size > self.max_file_size:
            raise FileSizeLimitError(
                f"Content size {content_size} exceeds limit {self.max_file_size}",
                path=relative_path,
            )

        # Check file count limit with thread safety
        with self._lock:
            logger.debug(
                "File count: %d/%d", self._files_created_count, self.max_file_count
            )
            # Check if file already exists - don't count overwrites
            if (
                not resolved.exists()
                and self._files_created_count >= self.max_file_count
            ):
                raise FileCountLimitError(
                    f"File count limit {self.max_file_count} reached",
                    path=relative_path,
                )
            # Create parent directories inside the lock so count check
            # and directory creation are atomic
            parent = resolved.parent
            parent.mkdir(parents=True, exist_ok=True, mode=0o755)

        return resolved

    def write_file(self, relative_path: str, content: str) -> pathlib.Path:
        """Write a file atomically after validation."""
        logger.info("Writing file: %s", relative_path)
        resolved = self.validate_write(relative_path, content)

        if self.dry_run:
            self._log(f"[dry-run] Would write: {relative_path}")
            return resolved

        # Check if target resolves to a different location (symlink detection)
        # Use raw path (before realpath resolution) to detect symlinks
        raw_path = self.project_dir / relative_path.strip()
        real_target = pathlib.Path(os.path.realpath(str(raw_path)))
        if os.path.islink(str(raw_path)) or (
            os.path.exists(str(raw_path)) and real_target != raw_path
        ):
            raise PathTraversalError(
                "Target path resolves to a different location (possible symlink)",
                path=relative_path,
            )

        # Pre-mkdir realpath verification: check parent path before creation
        parent = resolved.parent
        expected_parent = pathlib.Path(os.path.realpath(str(parent)))
        resolved_project = pathlib.Path(os.path.realpath(self.project_dir))
        if (
            not str(expected_parent).startswith(str(resolved_project) + os.sep)
            and expected_parent != resolved_project
            and parent.exists()
        ):
            raise PathTraversalError(
                "Parent directory escapes project directory (pre-mkdir)",
                path=relative_path,
            )
        # Create parent directories and set permissions explicitly to handle umask
        parent.mkdir(parents=True, exist_ok=True, mode=0o755)
        # Walk created parents and enforce permissions
        try:
            rel_parent = parent.relative_to(self.project_dir)
            current = self.project_dir
            for part in rel_parent.parts:
                current = current / part
                try:
                    current.chmod(0o755)
                except OSError as chmod_exc:
                    logger.debug("Failed to chmod directory %s: %s", current, chmod_exc)
        except ValueError:
            pass

        # Post-mkdir verification: ensure parent directory is still within project_dir
        resolved_parent = pathlib.Path(os.path.realpath(str(parent)))
        resolved_project = pathlib.Path(os.path.realpath(self.project_dir))
        if (
            not str(resolved_parent).startswith(str(resolved_project) + os.sep)
            and resolved_parent != resolved_project
        ):
            raise PathTraversalError(
                "Parent directory escapes project directory after creation",
                path=relative_path,
            )

        tmp_name: str | None = None
        try:
            # Use context manager to ensure proper cleanup
            with tempfile.NamedTemporaryFile(
                mode="w",
                encoding="utf-8",
                dir=str(resolved.parent),
                delete=False,
                suffix=".tmp",
            ) as fd:
                tmp_name = fd.name
                fd.write(content)
                fd.flush()
                os.fsync(fd.fileno())

            # Now perform the atomic replace
            logger.debug("Atomic write: temp -> target")
            try:
                os.replace(tmp_name, str(resolved))
            except OSError as exc:
                import errno

                if exc.errno == errno.EXDEV:
                    # Cross-filesystem move: fall back to shutil.move
                    logger.warning(
                        "Cross-filesystem write detected for %s; using shutil.move fallback",
                        relative_path,
                    )
                    shutil.move(tmp_name, str(resolved))
                else:
                    raise
            tmp_name = None  # Successfully moved, don't clean up
        except BaseException:
            if tmp_name is not None:
                try:
                    os.unlink(tmp_name)
                except OSError as cleanup_exc:
                    logger.warning(
                        "Failed to clean up temp file %s: %s", tmp_name, cleanup_exc
                    )
            raise

        # Post-write verification: ensure file still within sandbox (TOCTOU mitigation)
        resolved_project = pathlib.Path(os.path.realpath(self.project_dir))
        final_resolved = pathlib.Path(os.path.realpath(resolved))
        if (
            not str(final_resolved).startswith(str(resolved_project) + os.sep)
            and final_resolved != resolved_project
        ):
            # Attempt to remove the escaped file
            try:
                os.unlink(str(resolved))
            except OSError:
                pass
            raise PathTraversalError(
                "Post-write verification failed: file escapes project directory",
                path=relative_path,
            )

        logger.debug("TOCTOU: post-write verification realpath=%s", final_resolved)
        logger.debug("Post-write verification passed: %s", relative_path)

        try:
            os.chmod(str(resolved), 0o644)
        except OSError as chmod_exc:
            logger.warning(
                "Failed to set permissions on %s: %s", relative_path, chmod_exc
            )

        with self._lock:
            self._files_created_count += 1
        self._log(f"Wrote: {relative_path}")
        logger.info(
            "File written successfully: %s (%d bytes)",
            relative_path,
            len(content.encode("utf-8")),
        )
        return resolved

    def read_file(self, relative_path: str) -> str:
        """Read a file within the project directory."""
        logger.debug("Reading file: %s", relative_path)
        resolved = self.resolve_path(relative_path)

        if not resolved.is_file():
            raise FileNotFoundError(f"File not found: {relative_path}")

        return resolved.read_text(encoding="utf-8")

    def list_files(self, relative_path: str = ".") -> list[str]:
        """List files in a directory, excluding denied patterns."""
        resolved = self.resolve_path(relative_path)
        result: list[str] = []

        if not resolved.is_dir():
            return result

        for root, dirs, files in os.walk(str(resolved)):
            root_path = pathlib.Path(root)

            # Filter out denied directories in-place to prevent descent
            dirs[:] = [d for d in dirs if d not in self.DENIED_PATTERNS]

            for filename in files:
                file_path = root_path / filename
                try:
                    rel = file_path.relative_to(self.project_dir)
                except ValueError:
                    continue

                # Skip files whose name exactly matches a denied pattern
                skip = False
                for part in rel.parts:
                    if part in self.DENIED_PATTERNS:
                        skip = True
                        break
                if not skip:
                    result.append(str(rel))

        result.sort()
        logger.debug("Listing files in: %s (%d found)", relative_path, len(result))
        return result

    def file_exists(self, relative_path: str) -> bool:
        """Check whether a file exists within the project directory."""
        try:
            resolved = self.resolve_path(relative_path)
        except PathTraversalError:
            return False
        return resolved.exists()
