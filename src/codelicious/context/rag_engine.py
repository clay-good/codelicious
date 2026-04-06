import atexit
import os
import json
import socket
import sqlite3
import struct
import time
import urllib.request
import urllib.error
import logging
import math
import heapq
from pathlib import Path
from typing import List, Dict, Any

from codelicious.errors import SandboxViolationError
from codelicious.llm_client import _validate_endpoint_url

logger = logging.getLogger("codelicious.rag")

# Maximum number of results to return from semantic_search to prevent memory exhaustion
MAX_TOP_K = 20


class RagEngine:
    """
    Zero-dependency RAG Engine. Uses standard sqlite3 to store chunks and vectors.
    Uses Hugging Face Serverless Inference API to generate 384-dimensional embeddings.
    """

    # Embedding dimension for BAAI/bge-small-en-v1.5
    _EMBED_DIM = 384
    _BLOB_FMT = f"<{_EMBED_DIM}f"
    _BLOB_SIZE = struct.calcsize(f"<{_EMBED_DIM}f")

    # Retry settings for transient embedding API failures
    _EMBED_MAX_RETRIES = 3
    _EMBED_BACKOFF_BASE_S = 1.0

    def __init__(self, repo_path: Path):
        self.repo_path = Path(repo_path).resolve()
        self.db_path = self.repo_path / ".codelicious" / "db.sqlite3"
        self.api_key = os.environ.get("LLM_API_KEY", "")
        # Very fast, lightweight embedding model API endpoint on Huggingface
        self.embed_endpoint = "https://router.huggingface.co/hf-inference/models/BAAI/bge-small-en-v1.5"
        # Validate endpoint URL to prevent SSRF via environment overrides (Finding 41)
        _validate_endpoint_url(self.embed_endpoint)
        self._embed_timeout = int(os.environ.get("CODELICIOUS_EMBEDDING_TIMEOUT", "30"))

        self._closed = False

        # Validate database path is within the project directory (S20-P1-5)
        self._validate_db_path()

        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

        # Set restrictive permissions on the database file (S20-P1-5)
        if self.db_path.exists():
            os.chmod(str(self.db_path), 0o600)

        atexit.register(self.close)

    def close(self) -> None:
        """Flush SQLite WAL and release resources (spec-18 Phase 1: GS-3)."""
        if self._closed:
            return
        self._closed = True
        # Flush WAL to main database file so no data is lost on shutdown
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        except (sqlite3.Error, OSError) as exc:
            logger.warning("RagEngine.close() WAL flush failed: %s", exc)
        logger.debug("RagEngine closed")

    def __enter__(self) -> "RagEngine":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def _validate_db_path(self) -> None:
        """Validate the database path is within the project and not a symlink (S20-P1-5).

        Raises:
            SandboxViolationError: If the path escapes the project or is a symlink.
        """
        resolved_db = self.db_path.resolve()
        resolved_repo = self.repo_path.resolve()
        repo_prefix = str(resolved_repo) + os.sep
        if not str(resolved_db).startswith(repo_prefix):
            raise SandboxViolationError(f"Database path outside project: {resolved_db}")
        # Reject symlinks at the .codelicious/ directory or db file level
        codelicious_dir = self.repo_path / ".codelicious"
        if codelicious_dir.exists() and codelicious_dir.is_symlink():
            raise SandboxViolationError(f"Database directory is a symlink: {codelicious_dir}")
        if self.db_path.exists() and self.db_path.is_symlink():
            raise SandboxViolationError(f"Database file is a symlink: {self.db_path}")

    @staticmethod
    def _configure_connection(conn: sqlite3.Connection) -> None:
        """Apply WAL mode and busy timeout for concurrent access (spec-22 Phase 8)."""
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=5000")

    def _init_db(self):
        """Initializes the SQLite schema. We manually store the vector array as a JSON string to avoid compilation dependencies."""
        with sqlite3.connect(self.db_path) as conn:
            self._configure_connection(conn)
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
            # Add vector_blob column for binary-encoded vectors (Finding 2: 10-50x faster than JSON)
            try:
                cursor.execute("ALTER TABLE file_chunks ADD COLUMN vector_blob BLOB")
            except sqlite3.OperationalError:
                pass  # Column already exists
            conn.commit()

    @classmethod
    def _vec_to_blob(cls, vec: List[float]) -> bytes:
        """Encode a float vector as a compact binary blob."""
        return struct.pack(cls._BLOB_FMT, *vec)

    @classmethod
    def _blob_to_vec(cls, blob: bytes) -> List[float]:
        """Decode a binary blob back to a float vector."""
        return list(struct.unpack(cls._BLOB_FMT, blob))

    def _get_embedding(self, text: str) -> List[float]:
        """Calls the HF serverless API to get a single chunk embedding synchronously."""
        results = self._get_embeddings_batch([text])
        return results[0] if results else []

    def _get_embeddings_batch(self, texts: List[str]) -> List[List[float]]:
        """Calls the HF serverless API to get embeddings for multiple texts in one request.

        The HuggingFace inference API accepts a list under the 'inputs' key, so we
        send all chunks in a single HTTP request instead of one request per chunk.

        Returns a list of embedding vectors aligned with the input texts.
        On failure after retries, returns an empty list.
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

        req_data = json.dumps({"inputs": texts}).encode("utf-8")

        last_err: Exception | None = None
        for attempt in range(self._EMBED_MAX_RETRIES):
            req = urllib.request.Request(
                self.embed_endpoint,
                data=req_data,
                headers=headers,
                method="POST",
            )
            try:
                with urllib.request.urlopen(req, timeout=self._embed_timeout) as response:
                    # Cap response size to prevent memory exhaustion from a
                    # rogue or misconfigured embedding API (Finding 28).
                    _MAX_RESPONSE_BYTES = 5_000_000
                    data = response.read(_MAX_RESPONSE_BYTES)
                    if len(data) >= _MAX_RESPONSE_BYTES:
                        raise RuntimeError(f"Embedding API response too large (>= {_MAX_RESPONSE_BYTES} bytes)")
                    vectors = json.loads(data.decode("utf-8"))
                    if not vectors:
                        return []
                    if isinstance(vectors[0], list):
                        return vectors
                    return [vectors]
            except urllib.error.HTTPError as e:
                if e.code in (429, 502, 503, 504):
                    last_err = e
                    wait_s = self._EMBED_BACKOFF_BASE_S * (2**attempt)
                    logger.warning(
                        "Embedding API transient error %d (attempt %d/%d), retrying in %.1fs",
                        e.code,
                        attempt + 1,
                        self._EMBED_MAX_RETRIES,
                        wait_s,
                    )
                    time.sleep(wait_s)
                    continue
                logger.error("Failed to generate batch embeddings: %s", e)
                return []
            except (urllib.error.URLError, socket.timeout, OSError) as e:
                last_err = e
                wait_s = self._EMBED_BACKOFF_BASE_S * (2**attempt)
                logger.warning(
                    "Embedding API network error (attempt %d/%d): %s, retrying in %.1fs",
                    attempt + 1,
                    self._EMBED_MAX_RETRIES,
                    e,
                    wait_s,
                )
                time.sleep(wait_s)
                continue
            except Exception as e:
                logger.error("Failed to generate batch embeddings: %s", e)
                return []

        logger.error("Embedding API failed after %d attempts: %s", self._EMBED_MAX_RETRIES, last_err)
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
        # Skip empty files before chunking to avoid unnecessary API calls (spec-18 Phase 3)
        if not content or not content.strip():
            logger.debug("Skipping empty file: %s", rel_path)
            return

        # Very crude chunking (roughly 500 characters)
        chunk_size = 500
        all_chunks = [content[i : i + chunk_size] for i in range(0, len(content), chunk_size)]

        # Filter empty chunks before sending to the API
        non_empty_chunks = [c for c in all_chunks if c.strip()]

        if not non_empty_chunks:
            return

        # Fetch all embeddings in a single HTTP request (batch API call)
        vectors = self._get_embeddings_batch(non_empty_chunks)

        # Guard against empty embeddings — keep existing index rather than
        # deleting data we cannot replace (Finding 3: silent data loss).
        if not vectors:
            logger.warning("Embedding failed; keeping existing index for %s", rel_path)
            return

        # Warn if the API returned fewer vectors than input chunks (Finding 20)
        if len(vectors) < len(non_empty_chunks):
            logger.warning(
                "Partial embedding response for %s: got %d vectors for %d chunks",
                rel_path,
                len(vectors),
                len(non_empty_chunks),
            )

        with sqlite3.connect(self.db_path) as conn:
            self._configure_connection(conn)
            cursor = conn.cursor()
            # Delete old chunks for this file only after confirming new data exists
            cursor.execute("DELETE FROM file_chunks WHERE file_path = ?", (rel_path,))

            for chunk, vector in zip(non_empty_chunks, vectors):
                if vector:
                    norm = self._compute_norm(vector)
                    blob = self._vec_to_blob(vector) if len(vector) == self._EMBED_DIM else None
                    cursor.execute(
                        "INSERT INTO file_chunks (file_path, chunk_text, vector_json, vector_norm, vector_blob) VALUES (?, ?, ?, ?, ?)",
                        (rel_path, chunk, json.dumps(vector), norm, blob),
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

        # Cap query length to prevent excessive embedding API calls (spec-22 Phase 8)
        _MAX_QUERY_LEN = 2000
        if len(query) > _MAX_QUERY_LEN:
            query = query[:_MAX_QUERY_LEN]

        query_vector = self._get_embedding(query)
        if not query_vector:
            logger.warning("Semantic search failed: could not embed query (check API key)")
            return []

        # Pre-compute query norm once so it is not recomputed for every chunk
        query_norm = self._compute_norm(query_vector)

        # Use a min-heap of size top_k for O(n log k) performance
        # Store tuples of (score, file_path, chunk_text) - score first for heap ordering
        heap: List[tuple] = []

        with sqlite3.connect(self.db_path) as conn:
            self._configure_connection(conn)
            cursor = conn.cursor()
            cursor.execute("SELECT file_path, chunk_text, vector_json, vector_norm, vector_blob FROM file_chunks")

            # Iterate over cursor directly instead of fetchall() to avoid loading all rows
            for row in cursor:
                file_path, chunk_text, vector_json, stored_norm, vector_blob = row
                try:
                    # Prefer binary blob (10-50x faster) over JSON deserialization
                    if vector_blob is not None and len(vector_blob) == self._BLOB_SIZE:
                        chunk_vector = self._blob_to_vec(vector_blob)
                    else:
                        chunk_vector = json.loads(vector_json)

                    # Use pre-computed norms when available (stored_norm > 0),
                    # falling back to the full single-pass computation otherwise
                    if stored_norm is not None and stored_norm > 0.0:
                        score = self._cosine_similarity_with_norms(query_vector, query_norm, chunk_vector, stored_norm)
                    else:
                        score = self._cosine_similarity(query_vector, chunk_vector)

                    if len(heap) < top_k:
                        heapq.heappush(heap, (score, file_path, chunk_text))
                    elif score > heap[0][0]:
                        heapq.heapreplace(heap, (score, file_path, chunk_text))
                except (json.JSONDecodeError, struct.error):
                    continue

        # Extract results from heap and sort by score descending
        results = [{"file_path": fp, "text": text, "score": score} for score, fp, text in heap]
        results.sort(key=lambda x: x["score"], reverse=True)
        return results
