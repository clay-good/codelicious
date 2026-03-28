import os
import json
import sqlite3
import urllib.request
import urllib.error
import logging
import math
import heapq
from pathlib import Path
from typing import List, Dict, Any

logger = logging.getLogger("codelicious.rag")

# Maximum number of results to return from semantic_search to prevent memory exhaustion
MAX_TOP_K = 20


class RagEngine:
    """
    Zero-dependency RAG Engine. Uses standard sqlite3 to store chunks and vectors.
    Uses Hugging Face Serverless Inference API to generate 384-dimensional embeddings.
    """

    def __init__(self, repo_path: Path):
        self.repo_path = repo_path
        self.db_path = self.repo_path / ".codelicious" / "db.sqlite3"
        self.api_key = os.environ.get("LLM_API_KEY", "")
        # Very fast, lightweight embedding model API endpoint on Huggingface
        self.embed_endpoint = "https://router.huggingface.co/hf-inference/models/BAAI/bge-small-en-v1.5"

        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _init_db(self):
        """Initializes the SQLite schema. We manually store the vector array as a JSON string to avoid compilation dependencies."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS file_chunks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    file_path TEXT NOT NULL,
                    chunk_text TEXT NOT NULL,
                    vector_json TEXT NOT NULL,
                    vector_norm REAL NOT NULL DEFAULT 0.0
                )
            """)
            # Index on file_path for efficient DELETE operations during re-ingestion
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_file_chunks_path ON file_chunks(file_path)")
            # Add vector_norm column to existing tables that were created without it
            try:
                cursor.execute("ALTER TABLE file_chunks ADD COLUMN vector_norm REAL NOT NULL DEFAULT 0.0")
            except sqlite3.OperationalError:
                # Column already exists — ignore
                pass
            conn.commit()

    def _get_embedding(self, text: str) -> List[float]:
        """Calls the HF serverless API to get a single chunk embedding synchronously."""
        results = self._get_embeddings_batch([text])
        return results[0] if results else []

    def _get_embeddings_batch(self, texts: List[str]) -> List[List[float]]:
        """Calls the HF serverless API to get embeddings for multiple texts in one request.

        The HuggingFace inference API accepts a list under the 'inputs' key, so we
        send all chunks in a single HTTP request instead of one request per chunk.

        Returns a list of embedding vectors aligned with the input texts.
        On failure, returns an empty list.
        """
        if not texts:
            return []

        if not self.api_key:
            logger.warning("No LLM_API_KEY set. Cannot generate embeddings.")
            return []

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }

        req = urllib.request.Request(
            self.embed_endpoint,
            data=json.dumps({"inputs": texts}).encode("utf-8"),
            headers=headers,
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                vectors = json.loads(response.read().decode("utf-8"))
                # Single-text case: API may return a flat list [0.1, 0.2, ...]
                # Multi-text case: API returns a nested list [[0.1, ...], [0.2, ...]]
                if not vectors:
                    return []
                if isinstance(vectors[0], list):
                    # Already a list of embedding vectors
                    return vectors
                # Single embedding returned as a flat list — wrap it
                return [vectors]
        except Exception as e:
            logger.error("Failed to generate batch embeddings: %s", e)
            return []

    @staticmethod
    def _compute_norm(vec: List[float]) -> float:
        """Compute the L2 norm of a vector in a single pass."""
        return math.sqrt(math.fsum(v * v for v in vec))

    def _cosine_similarity(self, vec_a: List[float], vec_b: List[float]) -> float:
        """Native pure python cosine similarity calculation to circumvent numpy dependencies.

        Uses a single-pass approach: dot product, norm_a, and norm_b are all
        computed in one loop iteration to avoid three separate traversals.
        """
        if not vec_a or not vec_b or len(vec_a) != len(vec_b):
            return 0.0

        dot = 0.0
        sq_a = 0.0
        sq_b = 0.0
        for a, b in zip(vec_a, vec_b):
            dot += a * b
            sq_a += a * a
            sq_b += b * b

        if sq_a == 0.0 or sq_b == 0.0:
            return 0.0
        return dot / math.sqrt(sq_a * sq_b)

    def _cosine_similarity_with_norms(
        self,
        vec_a: List[float],
        norm_a: float,
        vec_b: List[float],
        norm_b: float,
    ) -> float:
        """Cosine similarity when both norms are pre-computed.

        Avoids re-computing norms on every call. Use this path during
        semantic_search where the query norm is computed once and chunk
        norms are stored in the DB at ingest time.
        """
        if not vec_a or not vec_b or len(vec_a) != len(vec_b):
            return 0.0
        if norm_a == 0.0 or norm_b == 0.0:
            return 0.0
        dot = math.fsum(a * b for a, b in zip(vec_a, vec_b))
        return dot / (norm_a * norm_b)

    def ingest_file(self, rel_path: str, content: str):
        """
        Takes raw file text, chunks it roughly, generates embeddings via API,
        and inserts the JSON stringified vectors into SQLite.

        All non-empty chunks are embedded in a single batched API request to
        avoid N+1 HTTP round-trips.
        """
        # Very crude chunking (roughly 500 characters)
        chunk_size = 500
        all_chunks = [content[i : i + chunk_size] for i in range(0, len(content), chunk_size)]

        # Filter empty chunks before sending to the API
        non_empty_chunks = [c for c in all_chunks if c.strip()]

        if not non_empty_chunks:
            return

        # Fetch all embeddings in a single HTTP request (batch API call)
        vectors = self._get_embeddings_batch(non_empty_chunks)

        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            # Delete old chunks for this file
            cursor.execute("DELETE FROM file_chunks WHERE file_path = ?", (rel_path,))

            for chunk, vector in zip(non_empty_chunks, vectors):
                if vector:
                    norm = self._compute_norm(vector)
                    cursor.execute(
                        "INSERT INTO file_chunks (file_path, chunk_text, vector_json, vector_norm) VALUES (?, ?, ?, ?)",
                        (rel_path, chunk, json.dumps(vector), norm),
                    )
            conn.commit()

    def semantic_search(self, query: str, top_k: int = 3) -> List[Dict[str, Any]]:
        """
        Embeds the query string, then pulls all sqlite chunk vectors from disk,
        running a brute-force native cosine similarity check.
        Returns the most relevant chunks text blocks.
        """
        # Cap top_k to prevent memory exhaustion from unbounded requests
        if top_k > MAX_TOP_K:
            logger.warning("top_k=%d exceeds maximum, capping to %d", top_k, MAX_TOP_K)
            top_k = MAX_TOP_K

        # Handle edge case of zero or negative top_k
        if top_k <= 0:
            return []

        query_vector = self._get_embedding(query)
        if not query_vector:
            return [{"error": "Failed to embed query. Check API key."}]

        # Pre-compute query norm once so it is not recomputed for every chunk
        query_norm = self._compute_norm(query_vector)

        # Use a min-heap of size top_k for O(n log k) performance
        # Store tuples of (score, file_path, chunk_text) - score first for heap ordering
        heap: List[tuple] = []

        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT file_path, chunk_text, vector_json, vector_norm FROM file_chunks")

            # Iterate over cursor directly instead of fetchall() to avoid loading all rows
            for row in cursor:
                file_path, chunk_text, vector_json, stored_norm = row
                try:
                    chunk_vector = json.loads(vector_json)
                    # Use pre-computed norms when available (stored_norm > 0),
                    # falling back to the full single-pass computation otherwise
                    # (e.g. rows ingested before the vector_norm column was added,
                    # or rows where stored_norm is NULL — Finding 82).
                    if stored_norm is not None and stored_norm > 0.0:
                        score = self._cosine_similarity_with_norms(query_vector, query_norm, chunk_vector, stored_norm)
                    else:
                        score = self._cosine_similarity(query_vector, chunk_vector)

                    if len(heap) < top_k:
                        heapq.heappush(heap, (score, file_path, chunk_text))
                    elif score > heap[0][0]:
                        heapq.heapreplace(heap, (score, file_path, chunk_text))
                except json.JSONDecodeError:
                    continue

        # Extract results from heap and sort by score descending
        results = [{"file_path": fp, "text": text, "score": score} for score, fp, text in heap]
        results.sort(key=lambda x: x["score"], reverse=True)
        return results
