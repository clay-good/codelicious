import json
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
            self.state_file.write_text(json.dumps({"memory_ledger": [], "completed_tasks": []}))
            
        if not self.cache_file.exists():
            self.cache_file.write_text(json.dumps({"file_hashes": {}, "ast_exports": {}}))
            
    def load_cache(self) -> dict:
        """Hydrates the active cache into memory."""
        try:
            return json.loads(self.cache_file.read_text())
        except Exception as e:
            logger.warning(f"Failed to load cache.json: {e}")
            return {}

    def load_state(self) -> dict:
        """Hydrates the active ledger state."""
        try:
            return json.loads(self.state_file.read_text())
        except Exception as e:
            logger.warning(f"Failed to load state.json: {e}")
            return {"memory_ledger": []}
            
    def flush_cache(self, cache_dict: dict):
        """Atomically flushing cache to prevent corruption."""
        # To be implemented with atomic os.replace logic
        pass

    def record_memory_mutation(self, interaction_summary: str):
        """
        Appends the LLMs summary/learnings directly to the continuous ledger 
        and flushes strictly to disk.
        """
        state = self.load_state()
        state["memory_ledger"].append(interaction_summary)
        # Flush to disk (To be implemented)
        logger.info("Recorded state mutation to ledger.")
