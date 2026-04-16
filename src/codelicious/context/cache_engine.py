from __future__ import annotations

import json
import logging
import os
import tempfile
import threading
from pathlib import Path

logger = logging.getLogger("codelicious.cache")


class CacheManager:
    """
    Handles serialization and hydration of the local `.codelicious/cache.json`
    and `.codelicious/state.json` LEDGER to drastically reduce context tokens
    over sequential iterations and runs.
    """

    def __init__(self, repo_path: Path):
        self.repo_path = repo_path
        self.codelicious_dir = repo_path / ".codelicious"
        self.cache_file = self.codelicious_dir / "cache.json"
        self.state_file = self.codelicious_dir / "state.json"
        self.config_file = self.codelicious_dir / "config.json"

        # Lock that serialises the read-modify-write cycle in record_memory_mutation
        # so that concurrent threads cannot interleave their writes (Finding 31).
        self._mutation_lock = threading.Lock()

        # Lock that serialises concurrent flush_cache calls so that two threads
        # racing through load_cache → mutate → flush_cache cannot interleave their
        # atomic-replace operations and lose each other's data (Finding 54).
        self._cache_lock = threading.Lock()

        # Lock that serialises _flush_state to prevent concurrent writes (Finding 42)
        self._state_lock = threading.Lock()

        # In-memory ledger for record_memory_mutation (Finding 19).
        # Loaded lazily on first mutation call to avoid I/O in __init__.
        self._memory_ledger: list | None = None
        # Extra state keys (e.g. completed_tasks) preserved across flushes.
        self._cached_state_extra: dict = {}

        self._ensure_skeleton()

    def _ensure_skeleton(self):
        # Use exist_ok=True to prevent FileExistsError from concurrent init (Finding 19)
        self.codelicious_dir.mkdir(parents=True, exist_ok=True)

        if not self.state_file.exists():
            self.state_file.write_text(
                json.dumps({"memory_ledger": [], "completed_tasks": []}),
                encoding="utf-8",
            )
            try:
                os.chmod(str(self.state_file), 0o600)
            except OSError:
                pass

        if not self.cache_file.exists():
            self.cache_file.write_text(
                json.dumps({"file_hashes": {}, "ast_exports": {}}),
                encoding="utf-8",
            )
            try:
                os.chmod(str(self.cache_file), 0o600)
            except OSError:
                pass

    def load_cache(self) -> dict:
        """Hydrates the active cache into memory."""
        try:
            return json.loads(self.cache_file.read_text(encoding="utf-8"))
        except Exception as e:
            logger.warning("Failed to load cache.json: %s", e)
            return {}

    def load_state(self) -> dict:
        """Hydrates the active ledger state."""
        try:
            return json.loads(self.state_file.read_text(encoding="utf-8"))
        except Exception as e:
            logger.warning("Failed to load state.json: %s", e)
            return {"memory_ledger": []}

    def flush_cache(self, cache_dict: dict):
        """Atomically flush cache to disk to prevent corruption.

        Uses tempfile + os.replace pattern for atomic writes. The entire
        operation is serialised under ``_cache_lock`` so concurrent
        read-modify-flush callers cannot interleave (Finding 54).
        """
        with self._cache_lock:
            temp_fd = None
            temp_path = None
            try:
                # Create temp file in same directory for atomic replace
                temp_fd, temp_path = tempfile.mkstemp(
                    dir=self.codelicious_dir,
                    suffix=".tmp",
                    prefix="cache_",
                )
                with os.fdopen(temp_fd, "w", encoding="utf-8") as f:
                    temp_fd = None  # fd is now owned by the file object
                    json.dump(cache_dict, f, indent=2)
                os.replace(temp_path, self.cache_file)
                temp_path = None  # Successfully replaced, don't clean up
                logger.debug("Flushed cache to %s", self.cache_file)
            except Exception as e:
                logger.error("Failed to flush cache: %s", e)
                raise
            finally:
                # Clean up temp file on failure
                if temp_fd is not None:
                    try:
                        os.close(temp_fd)
                    except OSError:
                        pass
                if temp_path is not None:
                    try:
                        os.unlink(temp_path)
                    except OSError:
                        pass

    def _flush_state(self, state: dict):
        """Atomically flush state to disk to prevent corruption.

        Uses tempfile + os.replace pattern for atomic writes.  The entire
        operation is serialised under ``_state_lock`` so concurrent callers
        cannot interleave their writes (Finding 29).
        """
        with self._state_lock:
            temp_fd = None
            temp_path = None
            try:
                temp_fd, temp_path = tempfile.mkstemp(
                    dir=self.codelicious_dir,
                    suffix=".tmp",
                    prefix="state_",
                )
                with os.fdopen(temp_fd, "w", encoding="utf-8") as f:
                    temp_fd = None  # fd is now owned by the file object
                    json.dump(state, f, indent=2)
                os.replace(temp_path, self.state_file)
                temp_path = None  # Successfully replaced, don't clean up
                logger.debug("Flushed state to %s", self.state_file)
            except Exception as e:
                logger.error("Failed to flush state: %s", e)
                raise
            finally:
                if temp_fd is not None:
                    try:
                        os.close(temp_fd)
                    except OSError:
                        pass
                if temp_path is not None:
                    try:
                        os.unlink(temp_path)
                    except OSError:
                        pass

    def record_memory_mutation(self, interaction_summary: str):
        """Append a summary to the in-memory ledger and flush to disk.

        The key optimisation over the original implementation (Finding 19) is
        that the JSON file is loaded from disk only on the **first call**
        (lazy init). All subsequent calls update the in-memory list directly,
        skipping the disk read. A flush is still performed on every call so
        that data is durable; callers that want to defer writes may batch calls
        and then invoke ``flush_state()`` explicitly.

        The full modify-write cycle is serialised under ``_mutation_lock``
        so concurrent threads cannot interleave their writes (Finding 31).
        """
        # Enforce a maximum summary length to prevent unbounded ledger entries (spec-22 Phase 8)
        _MAX_SUMMARY_LEN = 2000
        if len(interaction_summary) > _MAX_SUMMARY_LEN:
            interaction_summary = interaction_summary[:_MAX_SUMMARY_LEN] + " [truncated]"

        with self._mutation_lock:
            # Lazy load from disk on first call only — subsequent calls skip
            # the full JSON read and operate on the in-memory list.
            if self._memory_ledger is None:
                full_state = self.load_state()
                self._memory_ledger = full_state.get("memory_ledger", [])
                # Cache the remaining state keys so they survive later flushes.
                self._cached_state_extra = {k: v for k, v in full_state.items() if k != "memory_ledger"}

            self._memory_ledger.append(interaction_summary)
            # Cap ledger to 500 most recent entries to bound memory usage
            if len(self._memory_ledger) > 500:
                self._memory_ledger = self._memory_ledger[-500:]

            state_to_write = dict(self._cached_state_extra)
            state_to_write["memory_ledger"] = self._memory_ledger
            self._flush_state(state_to_write)

        logger.info("Recorded state mutation to ledger.")

    def flush_state(self) -> None:
        """Flush the in-memory ledger to disk immediately.

        Safe to call from any thread at any time (e.g. at clean shutdown).
        A no-op if no mutations have been recorded yet (Finding 19).
        """
        with self._mutation_lock:
            if self._memory_ledger is None:
                return
            state_to_write = dict(self._cached_state_extra)
            state_to_write["memory_ledger"] = self._memory_ledger
            self._flush_state(state_to_write)
            logger.debug("Explicit flush_state(): ledger written to disk.")
