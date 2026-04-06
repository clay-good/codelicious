"""Per-session build log directory and structured event management.

Each ``codelicious run`` in agent mode creates one BuildSession that
writes meta.json, output.log, session.jsonl, and summary.json to a
timestamped directory under ``~/.codelicious/builds/``.
"""

from __future__ import annotations

import json
import logging
import os
import pathlib
import shutil
import threading
import time
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger("codelicious.build_logger")

__all__ = ["BuildSession", "cleanup_old_builds"]


def cleanup_old_builds(builds_dir: pathlib.Path, retention_days: int = 30) -> int:
    """Remove build session directories older than retention_days.

    Returns count of directories removed.

    Args:
        builds_dir: Project-level directory containing session directories
                    (e.g., ~/.codelicious/builds/project_name)
        retention_days: Default retention period (can be overridden by env var)

    Returns:
        Number of directories removed
    """
    # Check for environment variable override
    env_retention = os.environ.get("CODELICIOUS_BUILD_RETENTION_DAYS")
    if env_retention:
        try:
            env_days = int(env_retention)
            if env_days > 0:
                retention_days = env_days
        except ValueError:
            logger.warning(
                "Invalid CODELICIOUS_BUILD_RETENTION_DAYS=%s (not an integer), using default %d",
                env_retention,
                retention_days,
            )

    if not builds_dir.exists():
        return 0

    removed_count = 0
    cutoff_timestamp = time.time() - (retention_days * 86400)  # 86400 = seconds per day

    # Define onerror callback once outside the loop (spec-22 Phase 5)
    def _rmtree_onerror(func, path, exc_info):
        logger.warning("Failed to remove %s: %s", path, exc_info[1])

    # Iterate through session directories in the project directory
    for session_dir in builds_dir.iterdir():
        if not session_dir.is_dir():
            continue
        # Skip symlinks and verify path containment to prevent directory traversal (Finding 44)
        if session_dir.is_symlink():
            logger.warning("Skipping symlink in builds dir: %s", session_dir.name)
            continue
        if not session_dir.resolve().is_relative_to(builds_dir.resolve()):
            logger.warning("Skipping directory that escapes builds dir: %s", session_dir.name)
            continue

        # Parse timestamp from directory name (format: YYYYMMDDTHHMMSSZ)
        session_id = session_dir.name
        try:
            # Parse the timestamp from the session_id format
            # Expected format: "20260314T123045Z" (YYYYMMDDTHHMMSSZ)
            if not session_id.endswith("Z"):
                logger.debug("Skipping directory with non-timestamp name: %s", session_id)
                continue

            # Parse the timestamp
            dt = datetime.strptime(session_id, "%Y%m%dT%H%M%SZ")
            dt = dt.replace(tzinfo=timezone.utc)
            dir_timestamp = dt.timestamp()

            if dir_timestamp < cutoff_timestamp:
                # Directory is older than retention period
                try:
                    shutil.rmtree(session_dir, onerror=_rmtree_onerror)
                    removed_count += 1
                    logger.debug("Removed old build directory: %s", session_dir)
                except Exception as exc:
                    logger.warning("Failed to remove build directory %s: %s", session_dir, exc)
        except (ValueError, OSError) as exc:
            # Parsing failed - skip this directory (do not delete unknown directories)
            logger.debug("Skipping directory with unparseable name %s: %s", session_id, exc)
            continue

    if removed_count > 0:
        logger.info(
            "Cleaned up %d build directories older than %dd",
            removed_count,
            retention_days,
        )

    return removed_count


class BuildSession:
    """Manages a per-session log directory with structured output files."""

    def __init__(
        self,
        project_root: pathlib.Path,
        config: object,
        log_dir: pathlib.Path | None = None,
    ) -> None:
        project_name = project_root.resolve().name
        session_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

        if log_dir is None:
            log_dir = pathlib.Path.home() / ".codelicious" / "builds"

        # Clean up old build directories before starting new session
        # Wrapped in try/except so cleanup failure does not prevent the build
        builds_root = log_dir / project_name
        try:
            cleanup_old_builds(builds_root, retention_days=30)
        except Exception as exc:
            logger.warning("Build cleanup failed (non-fatal): %s", exc)

        self._session_dir = log_dir / project_name / session_id
        self._session_dir.mkdir(parents=True, exist_ok=True)
        os.chmod(str(self._session_dir), 0o700)

        self._start_time = time.monotonic()
        self._started_at = datetime.now(timezone.utc).isoformat()
        self._closed = False
        self._explicit_success: bool | None = None
        self._lock = threading.Lock()
        self.session_id = session_id
        self.session_dir = self._session_dir

        # Write meta.json — create with 0o600 atomically (P2-12 fix)
        meta = {
            "project": str(project_root.resolve()),
            "project_name": project_name,
            "session_id": session_id,
            "started_at": self._started_at,
            "config": {
                "model": getattr(config, "model", ""),
                "max_iterations": getattr(config, "max_iterations", 10),
                "agent_timeout_s": getattr(config, "agent_timeout_s", 1800),
                "reflect": getattr(config, "reflect", False),
                "dry_run": getattr(config, "dry_run", False),
                "effort": getattr(config, "effort", ""),
                "max_turns": getattr(config, "max_turns", 0),
            },
        }
        meta_path = self._session_dir / "meta.json"
        meta_content = json.dumps(meta, indent=2) + "\n"
        fd = os.open(str(meta_path), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                f.write(meta_content)
        except BaseException:
            # fd is owned by fdopen on success; on failure before fdopen
            # completes, the fd may already be closed — ignore EBADF
            try:
                os.close(fd)
            except OSError:
                pass
            raise
        try:
            os.chmod(str(meta_path), 0o600)
        except OSError as exc:
            logger.warning("Failed to set permissions on meta.json: %s", exc)

        # Store file paths only.  Actual file handles are deferred to
        # _open_handles(), which is called lazily on first use so that handles
        # are always created within a properly managed resource context
        # (Finding 25: BuildSession opens file handles before context manager).
        self._output_log_path = self._session_dir / "output.log"
        self._event_log_path = self._session_dir / "session.jsonl"
        self._output_log = None
        self._event_log = None

        logger.info("Build session created: %s/%s", project_name, session_id)
        logger.debug("Session directory: %s", self._session_dir)

    def _open_handles(self) -> None:
        """Open output.log and session.jsonl file handles (line-buffered).

        Called from __enter__ and lazily on first write so that callers
        that do not use the context manager still work correctly.  Idempotent:
        does nothing if the handles are already open.  If the second open()
        fails, the first handle is closed before re-raising (Finding 25).
        """
        if self._output_log is not None:
            return  # already open

        # Create with 0o600 atomically via os.open (P2-12 fix)
        fd = os.open(str(self._output_log_path), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        try:
            self._output_log = os.fdopen(fd, "w", encoding="utf-8", buffering=1)
        except BaseException:
            os.close(fd)
            raise
        try:
            os.chmod(str(self._output_log_path), 0o600)
        except OSError as exc:
            logger.warning("Failed to set permissions on output.log: %s", exc)

        try:
            fd2 = os.open(str(self._event_log_path), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            try:
                self._event_log = os.fdopen(fd2, "w", encoding="utf-8", buffering=1)
            except BaseException:
                os.close(fd2)
                raise
        except BaseException:
            self._output_log.close()
            self._output_log = None
            raise
        try:
            os.chmod(str(self._event_log_path), 0o600)
        except OSError as exc:
            logger.warning("Failed to set permissions on session.jsonl: %s", exc)

    @property
    def output_file(self) -> Any:
        """Public file handle for tee_to in run_agent()."""
        with self._lock:
            self._open_handles()
            return self._output_log

    def emit(self, event: str, **kwargs: Any) -> None:
        """Write one structured JSON event to session.jsonl."""
        logger.debug("Build event: %s %s", event, kwargs)
        with self._lock:
            if self._closed:
                # S20-P3-9: warn instead of silently dropping the event
                logger.warning("Event dropped: session closed, event_type=%s", event)
                return
            self._open_handles()
            entry = {
                "ts": datetime.now(timezone.utc).isoformat(),
                "event": event,
                **kwargs,
            }
            self._event_log.write(json.dumps(entry) + "\n")

    def write_phase_header(self, phase_name: str) -> None:
        """Write a separator line with timestamp to output.log."""
        with self._lock:
            if self._closed:
                logger.warning("Phase header dropped: session closed, phase=%s", phase_name)
                return
            self._open_handles()
            ts = datetime.now(timezone.utc).strftime("%H:%M:%SZ")
            separator = f"\n{'=' * 60}\n[{ts}] {phase_name}\n{'=' * 60}\n"
            self._output_log.write(separator)

    def set_result(self, success: bool) -> None:
        """Explicitly set the build result for __exit__ to use.

        Call this method before exiting the context manager to override
        the default exception-based success detection. This is useful when
        a build catches its own errors and returns BuildResult(success=False)
        without raising an exception.

        Args:
            success: Whether the build succeeded.
        """
        with self._lock:
            self._explicit_success = success

    def close(
        self,
        success: bool = False,
        tasks_done: int = 0,
        tasks_failed: int = 0,
        claude_session_id: str = "",
    ) -> None:
        """Write summary.json and close file handles. Idempotent."""
        with self._lock:
            if self._closed:
                return
            self._closed = True

            elapsed = round(time.monotonic() - self._start_time, 1)
            summary = {
                "success": success,
                "elapsed_s": elapsed,
                "tasks_done": tasks_done,
                "tasks_failed": tasks_failed,
                "finished_at": datetime.now(timezone.utc).isoformat(),
            }
            if claude_session_id:
                summary["claude_session_id"] = claude_session_id

            # Create with 0o600 atomically via os.open (P2-12 fix)
            summary_path = self._session_dir / "summary.json"
            summary_content = json.dumps(summary, indent=2) + "\n"
            fd = os.open(str(summary_path), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            try:
                with os.fdopen(fd, "w", encoding="utf-8") as f:
                    f.write(summary_content)
            except BaseException:
                try:
                    os.close(fd)
                except OSError:
                    pass
                raise
            try:
                os.chmod(str(summary_path), 0o600)
            except OSError as exc:
                logger.warning("Failed to set permissions on summary.json: %s", exc)

            if self._output_log is not None:
                self._output_log.close()
            if self._event_log is not None:
                self._event_log.close()

            logger.info(
                "Build session closed: success=%s, elapsed=%.1fs, tasks_done=%d, tasks_failed=%d",
                success,
                elapsed,
                tasks_done,
                tasks_failed,
            )

    def __del__(self) -> None:
        """Safety-net finalizer: close file handles if not already closed.

        This is called by the garbage collector and prevents file handle
        leaks when the context manager is not used or an exception bypasses
        __exit__. It is not guaranteed to be called (e.g. at interpreter
        shutdown), but covers the common case.
        """
        try:
            if not self._closed:
                self.close()
        except Exception:
            # __del__ must never raise — swallow any errors silently.
            pass

    def __enter__(self) -> "BuildSession":
        self._open_handles()
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> bool:
        with self._lock:
            explicit = self._explicit_success
        if explicit is not None:
            self.close(success=explicit)
        else:
            self.close(success=(exc_type is None))
        return False
