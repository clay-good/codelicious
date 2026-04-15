"""Enforces filesystem access control for safe file operations."""

from __future__ import annotations

import logging
import os
import pathlib
import shutil
import tempfile
import threading
from collections.abc import Callable

from codelicious._env import parse_env_csv
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
        # Cache resolved project path to avoid repeated os.path.realpath syscalls (Finding 18)
        self._resolved_project: pathlib.Path = pathlib.Path(os.path.realpath(self.project_dir))
        self.dry_run: bool = dry_run
        self.max_file_size: int = max_file_size
        self.max_file_count: int = max_file_count
        self.log_fn: Callable[[str], None] | None = log_fn
        self._files_created_count: int = 0
        self._written_paths: set[str] = set()
        self._lock: threading.Lock = threading.Lock()
        # Coarse-grained lock for the full write_file cycle (spec-15 Phase 9).
        # Serializes validate -> write -> replace to eliminate TOCTOU windows
        # under concurrent access. The inner _lock handles fine-grained counter ops.
        self._write_lock: threading.Lock = threading.Lock()

        # Merge extra extensions from CODELICIOUS_EXTRA_EXTENSIONS env var
        self._allowed_extensions: frozenset[str] = self._build_allowed_extensions()

    @staticmethod
    def _build_allowed_extensions() -> frozenset[str]:
        """Merge CODELICIOUS_EXTRA_EXTENSIONS into the base allowlist."""

        def _validate_extension(ext: str) -> bool:
            if not ext.startswith("."):
                return False
            return "/" not in ext and "\\" not in ext

        return parse_env_csv(
            "CODELICIOUS_EXTRA_EXTENSIONS",
            Sandbox.ALLOWED_EXTENSIONS,
            validator=_validate_extension,
        )

    def _log(self, message: str) -> None:
        if self.log_fn is not None:
            self.log_fn(message)

    def _is_contained(self, candidate: pathlib.Path) -> bool:
        """Check if candidate path is within the project directory (Finding 36).

        Uses Path.relative_to() instead of string startswith() to avoid false
        positives on case-insensitive or prefix-sharing filesystems.
        """
        try:
            candidate.relative_to(self._resolved_project)
            return True
        except ValueError:
            return False

    def resolve_path(self, relative_path: str) -> pathlib.Path:
        """Resolve a relative path safely within the project directory."""
        logger.debug("Resolving path: %s", relative_path)
        stripped = relative_path.strip()

        if "\x00" in stripped:
            raise PathTraversalError("Null bytes are not allowed in paths", path=relative_path)

        # Check for path traversal using both POSIX and native path parsing
        # to handle cross-platform attacks (e.g., "..\" on Windows)
        posix_parts = pathlib.PurePosixPath(stripped).parts
        native_parts = pathlib.PurePath(stripped).parts
        if ".." in posix_parts or ".." in native_parts:
            raise PathTraversalError("Path traversal via '..' is not allowed", path=relative_path)

        # Check for absolute paths using both formats
        is_posix_abs = pathlib.PurePosixPath(stripped).is_absolute()
        is_native_abs = pathlib.PurePath(stripped).is_absolute()
        if is_posix_abs or is_native_abs:
            raise PathTraversalError("Absolute paths are not allowed", path=relative_path)

        raw_candidate = self.project_dir / stripped
        resolved_candidate = pathlib.Path(os.path.realpath(raw_candidate))

        logger.debug("TOCTOU: pre-validation realpath=%s", resolved_candidate)

        if not self._is_contained(resolved_candidate):
            # Distinguish symlink-based escapes from direct path escapes (EM-1, EM-2)
            raw_str = str(raw_candidate)
            resolved_str = str(resolved_candidate)
            if os.path.islink(raw_str) or raw_str != resolved_str:
                raise PathTraversalError(
                    f"Symlink resolution: resolved path '{resolved_candidate}' "
                    f"escapes project root '{self._resolved_project}'",
                    path=relative_path,
                )
            raise PathTraversalError(
                f"Path traversal: resolved path '{resolved_candidate}' escapes project root '{self._resolved_project}'",
                path=relative_path,
            )

        logger.debug("Resolved: %s -> %s", relative_path, resolved_candidate)
        return resolved_candidate

    def _check_denied(self, resolved_path: pathlib.Path) -> None:
        """Reject paths that match denied patterns."""
        logger.debug("Checking denied patterns for: %s", resolved_path)
        try:
            rel = resolved_path.relative_to(self.project_dir)
        except ValueError as exc:
            raise PathTraversalError(
                f"Path traversal: '{resolved_path}' is outside project root '{self.project_dir}'",
                path=str(resolved_path),
            ) from exc

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
        if suffix in self._allowed_extensions:
            return

        raise DisallowedExtensionError(
            f"File extension '{suffix}' is not allowed",
            path=str(resolved_path.name),
        )

    def validate_write(self, relative_path: str, content: str) -> tuple[pathlib.Path, bool]:
        """Validate that a write operation is permitted.

        Returns:
            A tuple of (resolved_path, is_new_file) where is_new_file indicates
            whether this is a new file (True) or an overwrite (False).

        Note:
            For new files, this method increments the file count atomically
            inside the lock to prevent race conditions where multiple concurrent
            writes could all pass validation before any increment.
        """
        content_size = len(content.encode("utf-8"))
        logger.debug(
            "Validating write: path=%s, content_size=%d bytes",
            relative_path,
            content_size,
        )
        resolved = self.resolve_path(relative_path)
        self._check_denied(resolved)
        self._check_extension(resolved)
        if content_size > self.max_file_size:
            raise FileSizeLimitError(
                f"Content size {content_size} exceeds limit {self.max_file_size}",
                path=relative_path,
            )

        # Check file count limit with thread safety.
        # The lock protects the is_new check and _files_created_count
        # increment. We also track the path in _written_paths so that
        # a second write to the same path is always treated as an overwrite
        # regardless of filesystem state (mitigates TOCTOU between the
        # exists() check and the actual write — REV-P1-3).
        with self._lock:
            is_new = str(resolved) not in self._written_paths and not resolved.exists()
            logger.debug("File count: %d/%d (is_new=%s)", self._files_created_count, self.max_file_count, is_new)
            # Only check count limit for new files, not overwrites
            if is_new and self._files_created_count >= self.max_file_count:
                raise FileCountLimitError(
                    f"File count limit {self.max_file_count} reached",
                    path=relative_path,
                )
            # Reserve the slot atomically with the check to prevent concurrent races
            if is_new:
                self._files_created_count += 1
                self._written_paths.add(str(resolved))

        # Create parent directories outside the lock — mkdir with exist_ok=True
        # is safe to call concurrently and I/O should not block other threads.
        parent = resolved.parent
        parent.mkdir(parents=True, exist_ok=True, mode=0o755)
        # Post-mkdir symlink check: verify parent wasn't substituted (REV-P2-3)
        real_parent = pathlib.Path(os.path.realpath(str(parent)))
        if not self._is_contained(real_parent):
            raise PathTraversalError(
                f"Symlink resolution: parent '{parent}' resolves to '{real_parent}' "
                f"which escapes project root '{self._resolved_project}'",
                path=relative_path,
            )

        return resolved, is_new

    def write_file(self, relative_path: str, content: str) -> pathlib.Path:
        """Write a file atomically after validation.

        The full validate-write cycle is serialized under _write_lock to
        eliminate TOCTOU windows under concurrent access (spec-15 Phase 9).
        """
        with self._write_lock:
            return self._write_file_locked(relative_path, content)

    def _write_file_locked(self, relative_path: str, content: str) -> pathlib.Path:
        """Inner write implementation, called under _write_lock."""
        logger.info("Writing file: %s", relative_path)
        resolved, is_new = self.validate_write(relative_path, content)

        if self.dry_run:
            # For dry-run, decrement the count since we won't actually write
            if is_new:
                with self._lock:
                    self._files_created_count -= 1
                    self._written_paths.discard(str(resolved))
            self._log(f"[dry-run] Would write: {relative_path}")
            return resolved

        try:
            # Check if target resolves to a different location (symlink detection)
            # Use raw path (before realpath resolution) to detect symlinks
            raw_path = self.project_dir / relative_path.strip()
            real_target = pathlib.Path(os.path.realpath(str(raw_path)))
            if os.path.islink(str(raw_path)) or (os.path.exists(str(raw_path)) and real_target != resolved):
                raise PathTraversalError(
                    f"Symlink resolution: target '{raw_path}' resolves to '{real_target}' (expected '{resolved}')",
                    path=relative_path,
                )

            # Pre-mkdir realpath verification: check parent path before creation
            # Note: Parent directory was already created in validate_write inside the lock
            parent = resolved.parent
            expected_parent = pathlib.Path(os.path.realpath(str(parent)))
            if not self._is_contained(expected_parent) and parent.exists():
                raise PathTraversalError(
                    f"Path traversal: parent '{expected_parent}' escapes project root '{self._resolved_project}'",
                    path=relative_path,
                )

            # Walk created parents and enforce permissions (parent already created in validate_write)
            try:
                rel_parent = parent.relative_to(self.project_dir)
                current = self.project_dir
                for part in rel_parent.parts:
                    current = current / part
                    try:
                        current.chmod(0o755)
                    except OSError as chmod_exc:
                        logger.warning("Failed to chmod directory %s: %s", current, chmod_exc)
            except ValueError:
                pass

            # Post-mkdir verification: ensure parent directory is still within project_dir
            resolved_parent = pathlib.Path(os.path.realpath(str(parent)))
            if not self._is_contained(resolved_parent):
                raise PathTraversalError(
                    f"Symlink resolution: parent '{parent}' resolves to '{resolved_parent}' "
                    f"which escapes project root '{self._resolved_project}' after creation",
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
                        logger.warning("Failed to clean up temp file %s: %s", tmp_name, cleanup_exc)
                raise

            # Post-write verification: ensure file still within sandbox (TOCTOU mitigation)
            final_resolved = pathlib.Path(os.path.realpath(resolved))
            if not self._is_contained(final_resolved):
                # Attempt to remove the symlink at the expected path
                try:
                    os.unlink(str(resolved))
                except OSError:
                    pass
                # Also attempt to unlink the actual destination of the symlink so
                # that content written outside the sandbox is cleaned up (Finding 41)
                if final_resolved != resolved:
                    try:
                        os.unlink(str(final_resolved))
                        logger.warning(
                            "Removed escaped file at symlink destination: %s",
                            final_resolved,
                        )
                    except OSError as unlink_exc:
                        logger.error(
                            "Failed to remove escaped file at symlink destination %s: %s",
                            final_resolved,
                            unlink_exc,
                        )
                raise PathTraversalError(
                    f"Symlink resolution: post-write verification failed — '{resolved}' "
                    f"resolves to '{final_resolved}' which escapes project root "
                    f"'{self._resolved_project}'",
                    path=relative_path,
                )

            logger.debug("TOCTOU: post-write verification realpath=%s", final_resolved)
            logger.debug("Post-write verification passed: %s", relative_path)

            try:
                os.chmod(str(resolved), 0o644)
            except OSError as chmod_exc:
                logger.warning("Failed to set permissions on %s: %s", relative_path, chmod_exc)

        except BaseException:
            # If write fails for any reason, decrement the count for new files
            # to release the reserved slot and remove from written paths tracking
            if is_new:
                with self._lock:
                    self._files_created_count -= 1
                    self._written_paths.discard(str(resolved))
            raise

        self._log(f"Wrote: {relative_path}")
        logger.info(
            "File written successfully: %s (%d chars)",
            relative_path,
            len(content),
        )
        return resolved

    def read_file(self, relative_path: str) -> str:
        """Read a file within the project directory.

        A post-read TOCTOU check re-resolves the path after reading and discards
        the content if the file has since escaped the sandbox (e.g. via a symlink
        race).  This closes the window between the pre-read resolve_path check and
        the actual read that ``pathlib.Path.read_text`` performs.
        """
        logger.debug("Reading file: %s", relative_path)
        resolved = self.resolve_path(relative_path)

        if not resolved.is_file():
            raise FileNotFoundError(f"File not found: {relative_path}")

        from codelicious._io import read_text_safe

        content = read_text_safe(resolved, label=relative_path)

        # Post-read verification: re-resolve and confirm the path is still inside
        # the project directory.  A symlink could have been swapped in between the
        # pre-read check above and the read_text call, so we discard the content
        # and raise if the path has escaped.
        post_read_resolved = pathlib.Path(os.path.realpath(str(resolved)))
        if not self._is_contained(post_read_resolved):
            logger.warning(
                "Post-read TOCTOU violation: path %s resolved to %s which escapes project directory %s",
                relative_path,
                post_read_resolved,
                self._resolved_project,
            )
            raise PathTraversalError(
                f"Symlink resolution: post-read verification failed — '{resolved}' "
                f"resolves to '{post_read_resolved}' which escapes project root "
                f"'{self._resolved_project}'",
                path=relative_path,
            )

        logger.debug("TOCTOU: post-read verification passed for %s", relative_path)
        return content

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

                # Skip symlinks pointing outside the sandbox (Finding 35)
                if os.path.islink(str(file_path)):
                    real = pathlib.Path(os.path.realpath(str(file_path)))
                    if not self._is_contained(real):
                        continue

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
        except PathTraversalError as e:
            logger.warning("file_exists denied for security: %s", e)
            return False
        return resolved.exists()
