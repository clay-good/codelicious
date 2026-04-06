"""Tests for the RAG Engine module."""

from __future__ import annotations

import json
import logging
import sqlite3
from pathlib import Path
from unittest.mock import patch

import pytest

from codelicious.context.rag_engine import RagEngine, MAX_TOP_K


@pytest.fixture
def rag_engine(tmp_path: Path) -> RagEngine:
    """Create a RagEngine instance with a temporary database."""
    # Mock the API key to avoid network calls
    with patch.dict("os.environ", {"LLM_API_KEY": "test-key"}):
        engine = RagEngine(tmp_path)
    return engine


@pytest.fixture
def populated_rag_engine(rag_engine: RagEngine) -> RagEngine:
    """Create a RagEngine instance with pre-populated chunks."""
    # Directly insert test chunks into the database to avoid API calls
    with sqlite3.connect(rag_engine.db_path) as conn:
        cursor = conn.cursor()
        # Create 50 test chunks with dummy vectors
        for i in range(50):
            # Create a simple 384-dim vector (BGE-small dimension)
            vector = [0.1 * (i % 10)] * 384
            cursor.execute(
                "INSERT INTO file_chunks (file_path, chunk_text, vector_json) VALUES (?, ?, ?)",
                (f"file_{i}.py", f"Test chunk content {i}", json.dumps(vector)),
            )
        conn.commit()
    return rag_engine


class TestRagEngineInit:
    """Tests for RagEngine initialization."""

    def test_init_creates_db_directory(self, tmp_path: Path):
        """Test that RagEngine creates the .codelicious directory if it doesn't exist."""
        with patch.dict("os.environ", {"LLM_API_KEY": "test-key"}):
            RagEngine(tmp_path)

        assert (tmp_path / ".codelicious").exists()
        assert (tmp_path / ".codelicious" / "db.sqlite3").exists()

    def test_init_creates_file_chunks_table(self, rag_engine: RagEngine):
        """Test that the file_chunks table is created."""
        with sqlite3.connect(rag_engine.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='file_chunks'")
            result = cursor.fetchone()

        assert result is not None
        assert result[0] == "file_chunks"

    def test_init_creates_file_path_index(self, rag_engine: RagEngine):
        """Test that the index on file_path is created for efficient DELETE operations."""
        with sqlite3.connect(rag_engine.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_file_chunks_path'")
            result = cursor.fetchone()

        assert result is not None
        assert result[0] == "idx_file_chunks_path"


class TestSemanticSearchTopKCap:
    """Tests for the top_k capping behavior in semantic_search."""

    def test_top_k_under_limit_returns_all_matches(self, populated_rag_engine: RagEngine):
        """Test that top_k under the limit returns up to that many results."""
        # Mock _get_embedding to return a consistent vector
        with patch.object(populated_rag_engine, "_get_embedding", return_value=[0.1] * 384):
            results = populated_rag_engine.semantic_search("test query", top_k=5)

        assert len(results) == 5

    def test_top_k_exactly_at_limit(self, populated_rag_engine: RagEngine):
        """Test that top_k exactly at MAX_TOP_K works without warning."""
        with patch.object(populated_rag_engine, "_get_embedding", return_value=[0.1] * 384):
            results = populated_rag_engine.semantic_search("test query", top_k=MAX_TOP_K)

        assert len(results) == MAX_TOP_K

    def test_top_k_exceeds_max_caps_to_limit(self, populated_rag_engine: RagEngine):
        """Test that top_k exceeding MAX_TOP_K is capped to MAX_TOP_K."""
        with patch.object(populated_rag_engine, "_get_embedding", return_value=[0.1] * 384):
            results = populated_rag_engine.semantic_search("test query", top_k=100)

        assert len(results) == MAX_TOP_K

    def test_top_k_exceeds_max_logs_warning(self, populated_rag_engine: RagEngine, caplog: pytest.LogCaptureFixture):
        """Test that exceeding MAX_TOP_K logs a warning."""
        with patch.object(populated_rag_engine, "_get_embedding", return_value=[0.1] * 384):
            with caplog.at_level(logging.WARNING):
                populated_rag_engine.semantic_search("test query", top_k=100)

        assert any(
            "top_k=100 exceeds maximum" in record.message and f"capping to {MAX_TOP_K}" in record.message
            for record in caplog.records
        )

    def test_top_k_very_large_value_capped(self, populated_rag_engine: RagEngine):
        """Test that a very large top_k value (100000) is capped to MAX_TOP_K."""
        with patch.object(populated_rag_engine, "_get_embedding", return_value=[0.1] * 384):
            results = populated_rag_engine.semantic_search("test query", top_k=100000)

        assert len(results) <= MAX_TOP_K


class TestSemanticSearchOrdering:
    """Tests for result ordering in semantic_search."""

    def test_results_sorted_by_score_descending(self, rag_engine: RagEngine):
        """Test that results are sorted by score in descending order."""
        # Insert chunks with predictable similarity scores
        with sqlite3.connect(rag_engine.db_path) as conn:
            cursor = conn.cursor()
            # Create vectors that will have different cosine similarities
            for i in range(10):
                # Higher i = higher similarity to query vector [1.0, 0.0, ...]
                vector = [1.0 - (i * 0.1)] + [0.0] * 383
                cursor.execute(
                    "INSERT INTO file_chunks (file_path, chunk_text, vector_json) VALUES (?, ?, ?)",
                    (f"file_{i}.py", f"Chunk {i}", json.dumps(vector)),
                )
            conn.commit()

        # Query with vector [1.0, 0.0, ...] - highest similarity with first chunks
        with patch.object(rag_engine, "_get_embedding", return_value=[1.0] + [0.0] * 383):
            results = rag_engine.semantic_search("test", top_k=10)

        # Verify descending order
        scores = [r["score"] for r in results]
        assert scores == sorted(scores, reverse=True)


class TestSemanticSearchEdgeCases:
    """Tests for edge cases in semantic_search."""

    def test_empty_database_returns_empty_list(self, rag_engine: RagEngine):
        """Test that searching an empty database returns empty results."""
        with patch.object(rag_engine, "_get_embedding", return_value=[0.1] * 384):
            results = rag_engine.semantic_search("test query", top_k=5)

        assert results == []

    def test_top_k_zero_returns_empty_list(self, populated_rag_engine: RagEngine):
        """Test that top_k=0 returns an empty list."""
        with patch.object(populated_rag_engine, "_get_embedding", return_value=[0.1] * 384):
            results = populated_rag_engine.semantic_search("test query", top_k=0)

        assert results == []

    def test_top_k_negative_returns_empty_list(self, populated_rag_engine: RagEngine):
        """Test that top_k=-1 (negative value) returns an empty list."""
        with patch.object(populated_rag_engine, "_get_embedding", return_value=[0.1] * 384):
            results = populated_rag_engine.semantic_search("test query", top_k=-1)

        assert results == []

    def test_failed_embedding_returns_empty_list(self, rag_engine: RagEngine):
        """Test that a failed embedding returns an empty list (spec-18 Phase 3)."""
        with patch.object(rag_engine, "_get_embedding", return_value=[]):
            results = rag_engine.semantic_search("test query", top_k=5)

        assert results == []

    def test_invalid_json_vector_skipped(self, rag_engine: RagEngine):
        """Test that chunks with invalid JSON vectors are skipped."""
        # Insert a chunk with invalid JSON
        with sqlite3.connect(rag_engine.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO file_chunks (file_path, chunk_text, vector_json) VALUES (?, ?, ?)",
                ("bad_file.py", "Bad chunk", "not valid json"),
            )
            # Also insert a valid chunk
            cursor.execute(
                "INSERT INTO file_chunks (file_path, chunk_text, vector_json) VALUES (?, ?, ?)",
                ("good_file.py", "Good chunk", json.dumps([0.1] * 384)),
            )
            conn.commit()

        with patch.object(rag_engine, "_get_embedding", return_value=[0.1] * 384):
            results = rag_engine.semantic_search("test query", top_k=5)

        # Only the valid chunk should be returned
        assert len(results) == 1
        assert results[0]["file_path"] == "good_file.py"


class TestIngestFile:
    """Tests for ingest_file with mocked _get_embeddings_batch (Finding 61)."""

    def _count_chunks(self, rag_engine: RagEngine, file_path: str) -> int:
        """Return the number of stored chunks for a given file_path."""
        with sqlite3.connect(rag_engine.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM file_chunks WHERE file_path = ?", (file_path,))
            return cursor.fetchone()[0]

    def _fetch_chunks(self, rag_engine: RagEngine, file_path: str) -> list:
        """Return all rows for a given file_path."""
        with sqlite3.connect(rag_engine.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(
                "SELECT file_path, chunk_text, vector_json, vector_norm, vector_blob FROM file_chunks WHERE file_path = ?",
                (file_path,),
            )
            return cursor.fetchall()

    def test_ingest_file_inserts_chunks(self, rag_engine: RagEngine):
        """ingest_file inserts one row per non-empty chunk."""
        # Content is 1100 chars → 3 chunks of 500/500/100 characters
        content = "a" * 1100
        fake_vector = [0.1] * 384

        with patch.object(rag_engine, "_get_embeddings_batch", return_value=[fake_vector] * 3):
            rag_engine.ingest_file("src/main.py", content)

        assert self._count_chunks(rag_engine, "src/main.py") == 3

    def test_ingest_file_deletes_old_chunks_before_insert(self, rag_engine: RagEngine):
        """Re-ingesting a file replaces the old chunks, not appends."""
        fake_vector = [0.1] * 384

        # First ingest
        with patch.object(rag_engine, "_get_embeddings_batch", return_value=[fake_vector]):
            rag_engine.ingest_file("module.py", "first content — 499 characters max in one chunk")

        assert self._count_chunks(rag_engine, "module.py") == 1

        # Second ingest with different content → 2 chunks
        content = "b" * 1000
        with patch.object(rag_engine, "_get_embeddings_batch", return_value=[fake_vector, fake_vector]):
            rag_engine.ingest_file("module.py", content)

        # Old single chunk must be gone; exactly 2 new ones present
        assert self._count_chunks(rag_engine, "module.py") == 2

    def test_ingest_file_stores_vector_norm(self, rag_engine: RagEngine):
        """Each inserted row must have a positive vector_norm."""
        fake_vector = [1.0] * 384
        expected_norm = (384.0) ** 0.5  # sqrt(sum(1.0^2 * 384))

        with patch.object(rag_engine, "_get_embeddings_batch", return_value=[fake_vector]):
            rag_engine.ingest_file("norm_test.py", "content that fits in one chunk")

        rows = self._fetch_chunks(rag_engine, "norm_test.py")
        assert len(rows) == 1
        _, _, _, stored_norm, _ = rows[0]
        assert abs(stored_norm - expected_norm) < 1e-4, f"Expected norm ~{expected_norm}, got {stored_norm}"

    def test_ingest_file_stores_vector_blob(self, rag_engine: RagEngine):
        """Each inserted row must have a binary vector blob when the vector has the correct dimension."""
        fake_vector = [0.5] * 384

        with patch.object(rag_engine, "_get_embeddings_batch", return_value=[fake_vector]):
            rag_engine.ingest_file("blob_test.py", "single chunk content")

        rows = self._fetch_chunks(rag_engine, "blob_test.py")
        assert len(rows) == 1
        _, _, _, _, blob = rows[0]
        assert blob is not None, "vector_blob must not be NULL for a 384-dim vector"
        # Blob size: 384 floats × 4 bytes each
        assert len(blob) == 384 * 4, f"Expected {384 * 4} bytes, got {len(blob)}"

    def test_ingest_file_empty_embeddings_keeps_existing_data(self, rag_engine: RagEngine):
        """When _get_embeddings_batch returns [], existing chunks are NOT deleted (Finding 3)."""
        fake_vector = [0.1] * 384

        # Pre-populate with valid data
        with patch.object(rag_engine, "_get_embeddings_batch", return_value=[fake_vector]):
            rag_engine.ingest_file("protected.py", "existing content")

        assert self._count_chunks(rag_engine, "protected.py") == 1

        # Simulate embedding failure
        with patch.object(rag_engine, "_get_embeddings_batch", return_value=[]):
            rag_engine.ingest_file("protected.py", "updated content — embedding fails")

        # Existing chunk must still be present
        assert self._count_chunks(rag_engine, "protected.py") == 1

    def test_ingest_file_empty_content_skips_insert(self, rag_engine: RagEngine):
        """Whitespace-only content produces no chunks and nothing is inserted."""
        with patch.object(rag_engine, "_get_embeddings_batch") as mock_batch:
            rag_engine.ingest_file("empty.py", "   \n\n\t  ")
            # The batch API must not be called for empty/whitespace-only content
            mock_batch.assert_not_called()

        assert self._count_chunks(rag_engine, "empty.py") == 0

    def test_ingest_file_stores_vector_json(self, rag_engine: RagEngine):
        """Each inserted row must have the vector stored as valid JSON."""
        fake_vector = [0.25, 0.5, 0.75] + [0.0] * 381

        with patch.object(rag_engine, "_get_embeddings_batch", return_value=[fake_vector]):
            rag_engine.ingest_file("json_test.py", "content fits in one chunk")

        rows = self._fetch_chunks(rag_engine, "json_test.py")
        assert len(rows) == 1
        _, _, vector_json_str, _, _ = rows[0]
        parsed = json.loads(vector_json_str)
        assert parsed[:3] == [0.25, 0.5, 0.75], "vector_json must round-trip the stored vector"


class TestMaxTopKConstant:
    """Tests for the MAX_TOP_K constant."""

    def test_max_top_k_is_20(self):
        """Verify that MAX_TOP_K is set to 20 as per spec."""
        assert MAX_TOP_K == 20

    def test_max_top_k_is_positive_integer(self):
        """Verify that MAX_TOP_K is a positive integer."""
        assert isinstance(MAX_TOP_K, int)
        assert MAX_TOP_K > 0


# ---------------------------------------------------------------------------
# Finding 80: _get_embeddings_batch edge cases
# ---------------------------------------------------------------------------


class TestGetEmbeddingsBatch:
    """Tests for _get_embeddings_batch edge cases (Finding 80)."""

    def test_empty_list_returns_empty(self, rag_engine: RagEngine):
        """Calling _get_embeddings_batch with an empty list returns []."""
        result = rag_engine._get_embeddings_batch([])
        assert result == []

    def test_missing_api_key_returns_empty_and_warns(
        self,
        tmp_path: Path,
        caplog: pytest.LogCaptureFixture,
    ):
        """When LLM_API_KEY is not set, returns [] and logs a warning."""
        with patch.dict("os.environ", {}, clear=True):
            # Ensure LLM_API_KEY is absent
            import os

            os.environ.pop("LLM_API_KEY", None)
            engine = RagEngine(tmp_path / "no_key")

        with caplog.at_level(logging.WARNING, logger="codelicious.rag"):
            result = engine._get_embeddings_batch(["some text"])

        assert result == []
        assert any("LLM_API_KEY" in r.message or "api" in r.message.lower() for r in caplog.records)

    def test_urlopen_exception_returns_empty(self, rag_engine: RagEngine):
        """When urllib.request.urlopen raises, _get_embeddings_batch returns []."""
        import urllib.error

        with patch("urllib.request.urlopen", side_effect=urllib.error.URLError("connection refused")):
            result = rag_engine._get_embeddings_batch(["some text"])

        assert result == []


# ---------------------------------------------------------------------------
# Finding 81: semantic_search guard and fallback paths (additional)
# ---------------------------------------------------------------------------


class TestRagEngineClose:
    """Tests for RagEngine.close() (spec-18 Phase 1)."""

    def test_close_is_idempotent(self, tmp_path):
        """Calling close() twice should not raise."""
        engine = RagEngine(tmp_path)
        engine.close()
        engine.close()  # Should not raise
        assert engine._closed is True

    def test_close_sets_closed_flag(self, tmp_path):
        """close() sets the _closed flag."""
        engine = RagEngine(tmp_path)
        assert engine._closed is False
        engine.close()
        assert engine._closed is True

    def test_context_manager(self, tmp_path):
        """RagEngine can be used as a context manager."""
        with RagEngine(tmp_path) as engine:
            assert engine._closed is False
        assert engine._closed is True


class TestSemanticSearchGuards:
    """Additional guard tests for semantic_search (Finding 81)."""

    def test_top_k_zero_returns_empty_directly(self, populated_rag_engine: RagEngine):
        """top_k=0 returns [] before any embedding call is made."""
        # _get_embedding should NOT be called at all for top_k=0
        with patch.object(populated_rag_engine, "_get_embedding") as mock_embed:
            result = populated_rag_engine.semantic_search("test", top_k=0)

        assert result == []
        mock_embed.assert_not_called()

    def test_top_k_25_capped_to_max(self, populated_rag_engine: RagEngine):
        """top_k=25 is capped to MAX_TOP_K (20) and no more than 20 results returned."""
        with patch.object(populated_rag_engine, "_get_embedding", return_value=[0.1] * 384):
            results = populated_rag_engine.semantic_search("test query", top_k=25)

        assert len(results) <= MAX_TOP_K

    def test_get_embedding_returns_empty_yields_empty_list(self, populated_rag_engine: RagEngine):
        """When _get_embedding returns [], semantic_search returns [] (spec-18 Phase 3)."""
        with patch.object(populated_rag_engine, "_get_embedding", return_value=[]):
            results = populated_rag_engine.semantic_search("test query", top_k=5)

        assert results == []

    def test_semantic_search_logs_warning_on_embed_failure(self, populated_rag_engine: RagEngine, caplog):
        """When embedding fails, semantic_search logs a warning (spec-18 Phase 3)."""
        with patch.object(populated_rag_engine, "_get_embedding", return_value=[]):
            with caplog.at_level(logging.WARNING, logger="codelicious.rag"):
                results = populated_rag_engine.semantic_search("test query", top_k=5)

        assert results == []
        assert any("search failed" in r.message.lower() for r in caplog.records)

    def test_ingest_file_skips_truly_empty_file(self, rag_engine: RagEngine):
        """Empty string content is skipped before chunking (spec-18 Phase 3)."""
        with patch.object(rag_engine, "_get_embeddings_batch") as mock_batch:
            rag_engine.ingest_file("empty.txt", "")
            mock_batch.assert_not_called()


# ---------------------------------------------------------------------------
# Configurable embedding timeout (spec-18 Phase 6: TE-3)
# ---------------------------------------------------------------------------


class TestRagConfigurableTimeout:
    """Tests for configurable embedding timeout (spec-18 Phase 6: TE-3)."""

    def test_default_embed_timeout(self, tmp_path: Path):
        """Default embedding timeout is 30 seconds."""
        engine = RagEngine(tmp_path)
        assert engine._embed_timeout == 30
        engine.close()

    def test_custom_embed_timeout_from_env(self, tmp_path: Path):
        """CODELICIOUS_EMBEDDING_TIMEOUT env var overrides default."""
        with patch.dict("os.environ", {"CODELICIOUS_EMBEDDING_TIMEOUT": "45"}):
            engine = RagEngine(tmp_path)
        assert engine._embed_timeout == 45
        engine.close()


# ---------------------------------------------------------------------------
# spec-20 Phase 5: SQLite Database Permissions and Path Validation (S20-P1-5)
# ---------------------------------------------------------------------------


class TestDatabaseSecurity:
    """Tests for S20-P1-5: database path validation and permissions."""

    def test_database_permissions_are_0600(self, tmp_path: Path) -> None:
        """Database file must be created with 0o600 permissions (owner-only)."""
        import os

        with patch.dict("os.environ", {"LLM_API_KEY": "test-key"}):
            engine = RagEngine(tmp_path)
        mode = os.stat(engine.db_path).st_mode & 0o777
        assert mode == 0o600, f"Expected 0o600, got {oct(mode)}"
        engine.close()

    def test_database_path_within_repo(self, tmp_path: Path) -> None:
        """Database created within the project dir must succeed."""
        with patch.dict("os.environ", {"LLM_API_KEY": "test-key"}):
            engine = RagEngine(tmp_path)
        assert engine.db_path.exists()
        assert str(engine.db_path.resolve()).startswith(str(tmp_path.resolve()))
        engine.close()

    def test_database_path_outside_repo_raises(self, tmp_path: Path) -> None:
        """A db_path that resolves outside the repo must raise SandboxViolationError."""
        from codelicious.errors import SandboxViolationError

        # Create a symlink from .codelicious/db.sqlite3 pointing outside the repo
        codelicious_dir = tmp_path / ".codelicious"
        codelicious_dir.mkdir()
        outside = tmp_path.parent / "outside_db.sqlite3"
        outside.touch()
        db_link = codelicious_dir / "db.sqlite3"
        db_link.symlink_to(outside)

        with patch.dict("os.environ", {"LLM_API_KEY": "test-key"}):
            with pytest.raises(SandboxViolationError):
                RagEngine(tmp_path)

    def test_database_symlink_dir_rejected(self, tmp_path: Path) -> None:
        """A .codelicious/ directory that is a symlink must be rejected."""
        from codelicious.errors import SandboxViolationError

        # Create a real directory elsewhere and symlink .codelicious to it
        real_dir = tmp_path.parent / "evil_dir"
        real_dir.mkdir(exist_ok=True)
        codelicious_link = tmp_path / ".codelicious"
        codelicious_link.symlink_to(real_dir)

        with patch.dict("os.environ", {"LLM_API_KEY": "test-key"}):
            with pytest.raises(SandboxViolationError):
                RagEngine(tmp_path)

    def test_database_created_in_codelicious_dir(self, tmp_path: Path) -> None:
        """Database must be created under .codelicious/ directory."""
        with patch.dict("os.environ", {"LLM_API_KEY": "test-key"}):
            engine = RagEngine(tmp_path)
        assert engine.db_path.parent.name == ".codelicious"
        assert engine.db_path.name == "db.sqlite3"
        engine.close()

    def test_database_close_flushes_wal(self, tmp_path: Path) -> None:
        """close() must flush WAL checkpoint without error."""
        with patch.dict("os.environ", {"LLM_API_KEY": "test-key"}):
            engine = RagEngine(tmp_path)
        # Insert some data to create WAL entries
        with sqlite3.connect(engine.db_path) as conn:
            conn.execute(
                "INSERT INTO file_chunks (file_path, chunk_text, vector_json, vector_norm) VALUES (?, ?, ?, ?)",
                ("test.py", "content", "[]", 0.0),
            )
        # close() should flush WAL without error
        engine.close()
        assert engine._closed is True
        # Double close should be idempotent
        engine.close()
