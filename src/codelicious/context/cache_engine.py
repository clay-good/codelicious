import json
import os
import tempfile
from pathlib import Path
import logging

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

        self._ensure_skeleton()

    def _ensure_skeleton(self):
        if not self.codelicious_dir.exists():
            self.codelicious_dir.mkdir(parents=True)

        if not self.state_file.exists():
            self.state_file.write_text(
                json.dumps({"memory_ledger": [], "completed_tasks": []}),
                encoding="utf-8",
            )

        if not self.cache_file.exists():
            self.cache_file.write_text(
                json.dumps({"file_hashes": {}, "ast_exports": {}}),
                encoding="utf-8",
            )

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

        Uses tempfile + os.replace pattern for atomic writes.
        """
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

        Uses tempfile + os.replace pattern for atomic writes.
        """
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
        """
        Appends the LLMs summary/learnings directly to the continuous ledger
        and flushes strictly to disk.
        """
        state = self.load_state()
        state["memory_ledger"].append(interaction_summary)
        self._flush_state(state)
        logger.info("Recorded state mutation to ledger.")
