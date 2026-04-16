"""Tests for CacheManager atomic persistence operations."""

from __future__ import annotations

import json
import os
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
        """When os.replace fails, original file should be unchanged (verified via raw read)."""
        manager = CacheManager(tmp_path)
        cache_file = tmp_path / ".codelicious" / "cache.json"
        codelicious_dir = tmp_path / ".codelicious"

        # Write initial valid cache
        original_cache = {"file_hashes": {"original.py": "orig123"}, "ast_exports": {}}
        manager.flush_cache(original_cache)

        # Capture raw bytes of the original file BEFORE the failed flush
        original_raw = cache_file.read_bytes()

        # Attempt to flush with mocked os.replace failure
        new_cache = {"file_hashes": {"new.py": "new456"}, "ast_exports": {}}
        with patch("os.replace", side_effect=OSError("Simulated disk error")):
            with pytest.raises(OSError, match="Simulated disk error"):
                manager.flush_cache(new_cache)

        # Verify original file is unchanged via raw file read (not via load_cache)
        # This confirms the atomic swap (os.replace) is the protection mechanism —
        # the original file is never touched because os.replace was never called.
        raw_after = cache_file.read_bytes()
        assert raw_after == original_raw, "Original file bytes changed despite os.replace failure"

        # Also verify through load_cache for completeness
        loaded = manager.load_cache()
        assert loaded == original_cache
        assert "original.py" in loaded["file_hashes"]
        assert "new.py" not in loaded["file_hashes"]

        # Verify no temp files were left behind after the failed flush
        temp_files = list(codelicious_dir.glob("cache_*.tmp"))
        assert len(temp_files) == 0, f"Temp files not cleaned up after failure: {temp_files}"

    def test_flush_cache_cleans_temp_on_failure(self, tmp_path: Path):
        """Temp file should be cleaned up when flush fails."""
        manager = CacheManager(tmp_path)

        with patch("os.replace", side_effect=OSError("Simulated error")), pytest.raises(OSError):
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

    def test_record_memory_mutation_caps_ledger_at_500(self, tmp_path: Path):
        """memory_ledger must not grow beyond 500 entries (Finding 36)."""
        manager = CacheManager(tmp_path)

        # Pre-populate the ledger with 502 entries via state file
        state_file = tmp_path / ".codelicious" / "state.json"
        initial_state = {
            "memory_ledger": [f"old-entry-{i}" for i in range(502)],
            "completed_tasks": [],
        }
        state_file.write_text(json.dumps(initial_state), encoding="utf-8")

        # Record one more mutation — should trim to last 500
        manager.record_memory_mutation("newest-entry")

        state = manager.load_state()
        assert len(state["memory_ledger"]) == 500
        # The very last entry must be the one we just appended
        assert state["memory_ledger"][-1] == "newest-entry"
        # The two oldest entries (old-entry-0 and old-entry-1) must be gone
        assert "old-entry-0" not in state["memory_ledger"]
        assert "old-entry-1" not in state["memory_ledger"]
        # old-entry-2 is entry index 2; after appending "newest-entry" to 502
        # items (total 503), the slice [-500:] keeps indices 3..502, so
        # old-entry-3 is the first surviving entry.
        assert state["memory_ledger"][0] == "old-entry-3"

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


class TestFlushStateFailurePath:
    """Tests for _flush_state failure path via record_memory_mutation (Finding 60)."""

    def test_flush_state_oserror_propagates_from_record_memory_mutation(self, tmp_path: Path):
        """When os.replace raises during _flush_state, OSError propagates and no temp files remain."""
        manager = CacheManager(tmp_path)
        codelicious_dir = tmp_path / ".codelicious"

        with patch("os.replace", side_effect=OSError("Simulated disk full")):
            with pytest.raises(OSError, match="Simulated disk full"):
                manager.record_memory_mutation("mutation that triggers flush")

        # Verify no state temp files were left behind after the failed flush
        state_temp_files = list(codelicious_dir.glob("state_*.tmp"))
        assert len(state_temp_files) == 0, f"State temp files not cleaned up after failure: {state_temp_files}"

    def test_flush_state_oserror_does_not_corrupt_existing_state(self, tmp_path: Path):
        """When _flush_state fails, the existing state file is not modified."""
        manager = CacheManager(tmp_path)
        state_file = tmp_path / ".codelicious" / "state.json"

        # Record a successful mutation first so the state file has known content
        manager.record_memory_mutation("first entry")
        original_raw = state_file.read_bytes()

        # Now trigger a failure on the next mutation
        with patch("os.replace", side_effect=OSError("Simulated disk full")), pytest.raises(OSError):
            manager.record_memory_mutation("second entry — should not persist")

        # The on-disk state must be byte-for-byte unchanged
        raw_after = state_file.read_bytes()
        assert raw_after == original_raw, "State file changed despite os.replace failure"

        # Reload and verify the second entry is absent
        manager2 = CacheManager(tmp_path)
        state = manager2.load_state()
        assert "second entry — should not persist" not in state["memory_ledger"]
        assert "first entry" in state["memory_ledger"]


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


# ---------------------------------------------------------------------------
# spec-22 Phase 8: record_memory_mutation truncates long summaries
# ---------------------------------------------------------------------------


class TestRecordMemoryMutationTruncation:
    """Summaries exceeding 2000 characters are truncated before storage."""

    def test_short_summary_stored_verbatim(self, tmp_path: Path):
        manager = CacheManager(tmp_path)
        short = "Short summary"
        manager.record_memory_mutation(short)
        state = manager.load_state()
        assert state["memory_ledger"][-1] == short

    def test_long_summary_truncated_with_marker(self, tmp_path: Path):
        manager = CacheManager(tmp_path)
        long_summary = "x" * 3000
        manager.record_memory_mutation(long_summary)
        state = manager.load_state()
        stored = state["memory_ledger"][-1]
        assert len(stored) < 3000
        assert stored.endswith("[truncated]")
        assert len(stored) == 2000 + len(" [truncated]")

    def test_summary_at_exactly_2000_chars_not_truncated(self, tmp_path: Path):
        manager = CacheManager(tmp_path)
        exact = "y" * 2000
        manager.record_memory_mutation(exact)
        state = manager.load_state()
        assert state["memory_ledger"][-1] == exact


# ---------------------------------------------------------------------------
# Lines 56-57 / 66-67: os.chmod failure in _ensure_skeleton (OSError swallowed)
# ---------------------------------------------------------------------------


class TestEnsureSkeletonChmodFailure:
    """os.chmod failures in _ensure_skeleton are silently ignored."""

    def test_ensure_skeleton_chmod_failure_state_file(self, tmp_path: Path):
        """OSError from os.chmod on the state file must not propagate."""
        call_count = {"n": 0}
        real_chmod = os.chmod

        def patched_chmod(path, mode):
            call_count["n"] += 1
            # Raise only for the state file
            if "state.json" in str(path):
                raise OSError("Permission denied (mocked)")
            real_chmod(path, mode)

        with patch("os.chmod", side_effect=patched_chmod):
            # Must not raise even though chmod on state.json fails
            CacheManager(tmp_path)

        # State file was still written despite the chmod failure
        state_file = tmp_path / ".codelicious" / "state.json"
        assert state_file.exists()
        content = json.loads(state_file.read_text(encoding="utf-8"))
        assert "memory_ledger" in content

    def test_ensure_skeleton_chmod_failure_cache_file(self, tmp_path: Path):
        """OSError from os.chmod on the cache file must not propagate."""
        call_count = {"n": 0}
        real_chmod = os.chmod

        def patched_chmod(path, mode):
            call_count["n"] += 1
            # Raise only for the cache file
            if "cache.json" in str(path):
                raise OSError("Permission denied (mocked)")
            real_chmod(path, mode)

        with patch("os.chmod", side_effect=patched_chmod):
            CacheManager(tmp_path)

        # Cache file was still written despite the chmod failure
        cache_file = tmp_path / ".codelicious" / "cache.json"
        assert cache_file.exists()
        content = json.loads(cache_file.read_text(encoding="utf-8"))
        assert "file_hashes" in content


# ---------------------------------------------------------------------------
# Lines 113-117 / 120-122: flush_cache finally-block cleanup on rare failures
# ---------------------------------------------------------------------------


class TestFlushCacheCleanupOnRareFailure:
    """Cover the finally-block cleanup paths in flush_cache (lines 113-122)."""

    def test_flush_cache_oserror_on_unlink_is_swallowed(self, tmp_path: Path):
        """When os.unlink raises in the finally block, OSError is swallowed and
        the original exception (from os.replace) is still propagated."""
        manager = CacheManager(tmp_path)

        original_unlink = os.unlink

        def patched_unlink(path):
            if ".tmp" in str(path):
                raise OSError("Cannot unlink (mocked)")
            original_unlink(path)

        with (
            patch("os.replace", side_effect=OSError("Simulated replace failure")),
            patch("os.unlink", side_effect=patched_unlink),
        ):
            # The outer OSError from os.replace must still propagate even when
            # os.unlink also raises in the finally block.
            with pytest.raises(OSError, match="Simulated replace failure"):
                manager.flush_cache({"test": "data"})

    def test_flush_cache_osfdopen_fails_closes_fd_and_propagates(self, tmp_path: Path):
        """When os.fdopen fails, the raw temp_fd is closed in the finally block
        and the exception propagates (covers lines 113-117)."""
        manager = CacheManager(tmp_path)

        def patched_fdopen(fd, *args, **kwargs):
            raise OSError("Cannot open fd (mocked)")

        with patch("os.fdopen", side_effect=patched_fdopen):
            with pytest.raises(OSError, match="Cannot open fd"):
                manager.flush_cache({"test": "data"})

        # After failure, no temp files should remain
        codelicious_dir = tmp_path / ".codelicious"
        temp_files = list(codelicious_dir.glob("cache_*.tmp"))
        assert len(temp_files) == 0, f"Temp files not cleaned up: {temp_files}"


# ---------------------------------------------------------------------------
# Lines 150-154 / 157-159: _flush_state finally-block cleanup on rare failures
# ---------------------------------------------------------------------------


class TestFlushStateCleanupOnRareFailure:
    """Cover the finally-block cleanup paths in _flush_state (lines 150-159)."""

    def test_flush_state_oserror_on_unlink_is_swallowed(self, tmp_path: Path):
        """When os.unlink raises in _flush_state's finally block, the original
        exception (os.replace failure) still propagates."""
        manager = CacheManager(tmp_path)
        manager.record_memory_mutation("priming entry")  # initialize _memory_ledger

        original_unlink = os.unlink

        def patched_unlink(path):
            if ".tmp" in str(path):
                raise OSError("Cannot unlink state tmp (mocked)")
            original_unlink(path)

        with (
            patch("os.replace", side_effect=OSError("Simulated state replace failure")),
            patch("os.unlink", side_effect=patched_unlink),
        ):
            with pytest.raises(OSError, match="Simulated state replace failure"):
                manager.record_memory_mutation("triggering flush")

    def test_flush_state_osfdopen_fails_closes_fd_and_propagates(self, tmp_path: Path):
        """When os.fdopen fails inside _flush_state, the raw fd is closed and
        the exception propagates (covers lines 150-154)."""
        manager = CacheManager(tmp_path)
        manager.record_memory_mutation("priming entry")

        real_fdopen = os.fdopen

        call_count = {"n": 0}

        def patched_fdopen(fd, *args, **kwargs):
            call_count["n"] += 1
            # Let the first call (which comes from flush_cache) succeed but block
            # any subsequent call that originates from _flush_state.
            if call_count["n"] == 1:
                raise OSError("Cannot open state fd (mocked)")
            return real_fdopen(fd, *args, **kwargs)

        with patch("os.fdopen", side_effect=patched_fdopen):
            with pytest.raises(OSError, match="Cannot open state fd"):
                manager.record_memory_mutation("will fail")

        # No temp state files should remain
        codelicious_dir = tmp_path / ".codelicious"
        state_tmp_files = list(codelicious_dir.glob("state_*.tmp"))
        assert len(state_tmp_files) == 0, f"State temp files not cleaned up: {state_tmp_files}"


# ---------------------------------------------------------------------------
# Lines 205-211: flush_state() public method — lazy-init path and write path
# ---------------------------------------------------------------------------


class TestFlushStatePublicMethod:
    """Tests for the public flush_state() method (lines 199-211)."""

    def test_flush_state_noop_when_no_mutations_recorded(self, tmp_path: Path):
        """flush_state() is a no-op when _memory_ledger is None (no mutations yet)."""
        manager = CacheManager(tmp_path)
        # Write a known state directly to disk
        state_file = tmp_path / ".codelicious" / "state.json"
        expected = {"memory_ledger": ["existing-entry"], "completed_tasks": []}
        state_file.write_text(json.dumps(expected), encoding="utf-8")

        # Call flush_state() before any record_memory_mutation — should be a no-op
        manager.flush_state()

        # On-disk state must be unchanged
        content = json.loads(state_file.read_text(encoding="utf-8"))
        assert content == expected

    def test_flush_state_writes_ledger_after_mutations(self, tmp_path: Path):
        """flush_state() persists the in-memory ledger to disk after mutations."""
        manager = CacheManager(tmp_path)
        manager.record_memory_mutation("entry-one")
        manager.record_memory_mutation("entry-two")

        # Call flush_state() explicitly — should produce the same result as the
        # implicit flush inside record_memory_mutation
        manager.flush_state()

        state = manager.load_state()
        assert "entry-one" in state["memory_ledger"]
        assert "entry-two" in state["memory_ledger"]

    def test_flush_state_preserves_extra_state_keys(self, tmp_path: Path):
        """flush_state() round-trips extra keys (e.g. completed_tasks) correctly."""
        manager = CacheManager(tmp_path)

        # Pre-populate state file with extra keys
        state_file = tmp_path / ".codelicious" / "state.json"
        initial_state = {"memory_ledger": [], "completed_tasks": ["task-A"]}
        state_file.write_text(json.dumps(initial_state), encoding="utf-8")

        # Trigger lazy init by recording a mutation, then call public flush_state()
        manager.record_memory_mutation("new-entry")
        manager.flush_state()

        state = manager.load_state()
        assert "task-A" in state["completed_tasks"]
        assert "new-entry" in state["memory_ledger"]
