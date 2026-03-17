"""Tests for CacheManager atomic persistence operations."""

import json
from pathlib import Path
from unittest.mock import patch

import pytest

from codelicious.context.cache_engine import CacheManager


class TestFlushCache:
    """Tests for flush_cache atomic write functionality."""

    def test_flush_cache_persists_data(self, tmp_path: Path):
        """Flush cache, create new CacheManager, load, assert data matches."""
        # Create first manager and flush some data
        manager1 = CacheManager(tmp_path)
        test_cache = {
            "file_hashes": {"src/main.py": "abc123", "tests/test_main.py": "def456"},
            "ast_exports": {"Calculator": {"methods": ["add", "subtract"]}},
        }
        manager1.flush_cache(test_cache)

        # Create a new manager instance (simulating process restart)
        manager2 = CacheManager(tmp_path)
        loaded_cache = manager2.load_cache()

        # Verify the data persisted correctly
        assert loaded_cache == test_cache
        assert loaded_cache["file_hashes"]["src/main.py"] == "abc123"
        assert "Calculator" in loaded_cache["ast_exports"]

    def test_flush_cache_overwrites_existing(self, tmp_path: Path):
        """Flush should completely replace existing cache."""
        manager = CacheManager(tmp_path)

        # Write initial data
        initial_cache = {"file_hashes": {"old.py": "old_hash"}, "ast_exports": {}}
        manager.flush_cache(initial_cache)

        # Overwrite with new data
        new_cache = {"file_hashes": {"new.py": "new_hash"}, "ast_exports": {"New": {}}}
        manager.flush_cache(new_cache)

        # Verify new data replaced old
        loaded = manager.load_cache()
        assert "old.py" not in loaded["file_hashes"]
        assert loaded["file_hashes"]["new.py"] == "new_hash"
        assert "New" in loaded["ast_exports"]

    def test_flush_cache_atomic_on_failure(self, tmp_path: Path):
        """When os.replace fails, original file should be unchanged."""
        manager = CacheManager(tmp_path)

        # Write initial valid cache
        original_cache = {"file_hashes": {"original.py": "orig123"}, "ast_exports": {}}
        manager.flush_cache(original_cache)

        # Attempt to flush with mocked os.replace failure
        new_cache = {"file_hashes": {"new.py": "new456"}, "ast_exports": {}}
        with patch("os.replace", side_effect=OSError("Simulated disk error")):
            with pytest.raises(OSError, match="Simulated disk error"):
                manager.flush_cache(new_cache)

        # Verify original file is unchanged
        loaded = manager.load_cache()
        assert loaded == original_cache
        assert "original.py" in loaded["file_hashes"]
        assert "new.py" not in loaded["file_hashes"]

    def test_flush_cache_cleans_temp_on_failure(self, tmp_path: Path):
        """Temp file should be cleaned up when flush fails."""
        manager = CacheManager(tmp_path)

        with patch("os.replace", side_effect=OSError("Simulated error")):
            with pytest.raises(OSError):
                manager.flush_cache({"test": "data"})

        # Verify no temp files left behind
        codelicious_dir = tmp_path / ".codelicious"
        temp_files = list(codelicious_dir.glob("cache_*.tmp"))
        assert len(temp_files) == 0, f"Temp files not cleaned up: {temp_files}"

    def test_flush_cache_creates_valid_json(self, tmp_path: Path):
        """Flushed cache should be valid JSON that can be parsed directly."""
        manager = CacheManager(tmp_path)
        test_cache = {
            "file_hashes": {"test.py": "hash123"},
            "ast_exports": {},
            "unicode": "héllo wörld 你好",
        }
        manager.flush_cache(test_cache)

        # Read the raw file and parse it directly
        cache_file = tmp_path / ".codelicious" / "cache.json"
        raw_content = cache_file.read_text(encoding="utf-8")
        parsed = json.loads(raw_content)

        assert parsed == test_cache
        assert parsed["unicode"] == "héllo wörld 你好"


class TestRecordMemoryMutation:
    """Tests for record_memory_mutation persistence."""

    def test_record_memory_mutation_persists(self, tmp_path: Path):
        """Record mutation, create new CacheManager, load, assert entry exists."""
        manager1 = CacheManager(tmp_path)
        manager1.record_memory_mutation("Implemented calculator add function")
        manager1.record_memory_mutation("Added pytest test coverage")

        # Create new manager instance
        manager2 = CacheManager(tmp_path)
        state = manager2.load_state()

        assert len(state["memory_ledger"]) == 2
        assert "Implemented calculator add function" in state["memory_ledger"]
        assert "Added pytest test coverage" in state["memory_ledger"]

    def test_record_memory_mutation_preserves_order(self, tmp_path: Path):
        """Memory ledger should maintain insertion order."""
        manager = CacheManager(tmp_path)

        entries = [
            "First task completed",
            "Second task completed",
            "Third task completed",
        ]
        for entry in entries:
            manager.record_memory_mutation(entry)

        state = manager.load_state()
        assert state["memory_ledger"] == entries

    def test_record_memory_mutation_preserves_completed_tasks(self, tmp_path: Path):
        """Recording mutations should not affect completed_tasks."""
        manager = CacheManager(tmp_path)

        # Pre-populate completed_tasks via state file
        state_file = tmp_path / ".codelicious" / "state.json"
        initial_state = {
            "memory_ledger": [],
            "completed_tasks": ["task-1: Done", "task-2: Done"],
        }
        state_file.write_text(json.dumps(initial_state), encoding="utf-8")

        # Record a mutation
        manager.record_memory_mutation("New mutation")

        # Verify completed_tasks preserved
        state = manager.load_state()
        assert state["completed_tasks"] == ["task-1: Done", "task-2: Done"]
        assert "New mutation" in state["memory_ledger"]


class TestLoadCacheErrorHandling:
    """Tests for load_cache error handling."""

    def test_load_cache_returns_empty_on_invalid_json(self, tmp_path: Path):
        """Load should return empty dict on invalid JSON."""
        manager = CacheManager(tmp_path)

        # Corrupt the cache file
        cache_file = tmp_path / ".codelicious" / "cache.json"
        cache_file.write_text("not valid json {{{", encoding="utf-8")

        result = manager.load_cache()
        assert result == {}

    def test_load_state_returns_default_on_invalid_json(self, tmp_path: Path):
        """Load should return default state on invalid JSON."""
        manager = CacheManager(tmp_path)

        # Corrupt the state file
        state_file = tmp_path / ".codelicious" / "state.json"
        state_file.write_text("corrupted", encoding="utf-8")

        result = manager.load_state()
        assert result == {"memory_ledger": []}


class TestCacheManagerInitialization:
    """Tests for CacheManager initialization."""

    def test_creates_codelicious_directory(self, tmp_path: Path):
        """CacheManager should create .codelicious directory if missing."""
        CacheManager(tmp_path)
        assert (tmp_path / ".codelicious").is_dir()

    def test_creates_default_cache_file(self, tmp_path: Path):
        """CacheManager should create cache.json with default structure."""
        CacheManager(tmp_path)
        cache_file = tmp_path / ".codelicious" / "cache.json"
        assert cache_file.exists()

        content = json.loads(cache_file.read_text(encoding="utf-8"))
        assert "file_hashes" in content
        assert "ast_exports" in content

    def test_creates_default_state_file(self, tmp_path: Path):
        """CacheManager should create state.json with default structure."""
        CacheManager(tmp_path)
        state_file = tmp_path / ".codelicious" / "state.json"
        assert state_file.exists()

        content = json.loads(state_file.read_text(encoding="utf-8"))
        assert "memory_ledger" in content
        assert "completed_tasks" in content

    def test_preserves_existing_files(self, tmp_path: Path):
        """CacheManager should not overwrite existing files."""
        codelicious_dir = tmp_path / ".codelicious"
        codelicious_dir.mkdir(parents=True)

        # Create pre-existing cache with data
        cache_file = codelicious_dir / "cache.json"
        existing_data = {"file_hashes": {"existing.py": "exists"}, "ast_exports": {}}
        cache_file.write_text(json.dumps(existing_data), encoding="utf-8")

        # Initialize CacheManager
        manager = CacheManager(tmp_path)

        # Verify existing data preserved
        loaded = manager.load_cache()
        assert loaded["file_hashes"]["existing.py"] == "exists"
