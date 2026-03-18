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
                    vector_json TEXT NOT NULL
                )
            """)
            # Index on file_path for efficient DELETE operations during re-ingestion
            cursor.execute("CREATE INDEX IF NOT EXISTS idx_file_chunks_path ON file_chunks(file_path)")
            conn.commit()

    def _get_embedding(self, text: str) -> List[float]:
        """Calls the HF serverless API to get a chunk embedding synchronously."""
        if not self.api_key:
            logger.warning("No LLM_API_KEY set. Cannot generate embeddings.")
            return []

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }

        req = urllib.request.Request(
            self.embed_endpoint,
            data=json.dumps({"inputs": text}).encode("utf-8"),
            headers=headers,
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=10) as response:
                vectors = json.loads(response.read().decode("utf-8"))
                # The pipeline usually returns a nested format e.g [ [0.1, 0.2...] ] or [0.1, 0.2]
                if vectors and isinstance(vectors[0], list):
                    return vectors[0]
                return vectors
        except Exception as e:
            logger.error("Failed to generate embedding: %s", e)
            return []

    def _cosine_similarity(self, vec_a: List[float], vec_b: List[float]) -> float:
        """Native pure python cosine similarity calculation to circumvent numpy dependencies."""
        if not vec_a or not vec_b or len(vec_a) != len(vec_b):
            return 0.0

        dot_product = sum(a * b for a, b in zip(vec_a, vec_b))
        norm_a = math.sqrt(sum(a * a for a in vec_a))
        norm_b = math.sqrt(sum(b * b for b in vec_b))

        if norm_a == 0 or norm_b == 0:
            return 0.0
        return dot_product / (norm_a * norm_b)

    def ingest_file(self, rel_path: str, content: str):
        """
        Takes raw file text, chunks it roughly, generates embeddings via API,
        and inserts the JSON stringified vectors into SQLite.
        """
        # Very crude chunking (roughly 500 characters)
        chunk_size = 500
        chunks = [content[i : i + chunk_size] for i in range(0, len(content), chunk_size)]

        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            # Delete old chunks for this file
            cursor.execute("DELETE FROM file_chunks WHERE file_path = ?", (rel_path,))

            for chunk in chunks:
                if not chunk.strip():
                    continue
                vector = self._get_embedding(chunk)
                if vector:
                    cursor.execute(
                        "INSERT INTO file_chunks (file_path, chunk_text, vector_json) VALUES (?, ?, ?)",
                        (rel_path, chunk, json.dumps(vector)),
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

        # Use a min-heap of size top_k for O(n log k) performance
        # Store tuples of (score, file_path, chunk_text) - score first for heap ordering
        heap: List[tuple] = []

        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT file_path, chunk_text, vector_json FROM file_chunks")

            # Iterate over cursor directly instead of fetchall() to avoid loading all rows
            for row in cursor:
                file_path, chunk_text, vector_json = row
                try:
                    chunk_vector = json.loads(vector_json)
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
