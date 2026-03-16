"""JSON-Lines progress event stream for external monitoring.

Writes machine-parseable events to ``.codelicious/progress.jsonl``
in the project directory. This is the integration point for external
tooling that wants to monitor build progress.
"""

from __future__ import annotations

import json
import logging
import os
import pathlib
import threading
from datetime import datetime, timezone
from typing import IO, Any

logger = logging.getLogger("codelicious.progress")

__all__ = ["ProgressReporter"]

_MAX_PROGRESS_BYTES: int = 10 * 1024 * 1024  # 10 MB rotation threshold


class ProgressReporter:
    """Appends JSON-Lines events to a progress file.

    When ``log_path`` is None (dry_run or explicitly disabled), all
    emit calls are no-ops.
    """

    def __init__(self, log_path: pathlib.Path | None) -> None:
        self._log_path = log_path
        self._handle: IO[str] | None = None
        self._lock = threading.Lock()
        self._closed = False

    def emit(self, event_type: str, **kwargs: Any) -> None:
        """Append one JSON event line to the progress file."""
        logger.debug("Progress event: %s %s", event_type, kwargs)
        if self._log_path is None:
            return

        with self._lock:
            # No-op if already closed
            if self._closed:
                return

            entry = {
                "ts": datetime.now(timezone.utc).isoformat(),
                "event": event_type,
                **kwargs,
            }
            line = json.dumps(entry) + "\n"

            if self._handle is None:
                self._log_path.parent.mkdir(parents=True, exist_ok=True)
                # Restrict directory permissions for build data
                os.chmod(str(self._log_path.parent), 0o700)
                # Rotate if file exceeds size limit
                try:
                    if self._log_path.exists():
                        size_bytes = self._log_path.stat().st_size
                        if size_bytes > _MAX_PROGRESS_BYTES:
                            backup = self._log_path.with_suffix(".jsonl.1")
                            os.replace(str(self._log_path), str(backup))
                            logger.info(
                                "Rotated progress.jsonl (%.1fMB)",
                                size_bytes / (1024 * 1024),
                            )
                except OSError as exc:
                    logger.warning("Could not check/rotate progress.jsonl: %s", exc)
                handle = open(self._log_path, "a", encoding="utf-8", buffering=1)
                try:
                    os.chmod(str(self._log_path), 0o600)
                except OSError:
                    handle.close()
                    raise
                self._handle = handle
            self._handle.write(line)
            self._handle.flush()

    def close(self) -> None:
        """Close the underlying file handle if open. Idempotent."""
        logger.debug("Progress reporter closed")
        with self._lock:
            if self._handle is not None:
                self._handle.flush()
                self._handle.close()
                self._handle = None
            self._closed = True

    def __enter__(self) -> "ProgressReporter":
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> bool:
        self.close()
        return False
