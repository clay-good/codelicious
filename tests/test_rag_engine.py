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

    def test_failed_embedding_returns_error(self, rag_engine: RagEngine):
        """Test that a failed embedding returns an error dict."""
        with patch.object(rag_engine, "_get_embedding", return_value=[]):
            results = rag_engine.semantic_search("test query", top_k=5)

        assert len(results) == 1
        assert "error" in results[0]

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

    def test_get_embedding_returns_empty_yields_error_dict(self, populated_rag_engine: RagEngine):
        """When _get_embedding returns [], semantic_search returns an error dict."""
        with patch.object(populated_rag_engine, "_get_embedding", return_value=[]):
            results = populated_rag_engine.semantic_search("test query", top_k=5)

        assert len(results) == 1
        assert "error" in results[0]
        assert results[0]["error"]  # non-empty error message
