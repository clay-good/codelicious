"""Abstract base class and shared dataclasses for codelicious build engines.

Spec-27 Phase 3.1 defines the chunk-level interface:

* ``execute_chunk`` — implement one work chunk
* ``verify_chunk``  — lint/test/security check a completed chunk
* ``fix_chunk``     — attempt to fix verification failures
"""

from __future__ import annotations

import abc
import dataclasses
import pathlib

# ---------------------------------------------------------------------------
# spec-27 Phase 3.1: Chunk-level dataclasses
# ---------------------------------------------------------------------------


@dataclasses.dataclass(frozen=True)
class ChunkResult:
    """Result of executing a single work chunk via an engine.

    Returned by ``execute_chunk()`` and ``fix_chunk()``.
    """

    success: bool
    files_modified: list[pathlib.Path] = dataclasses.field(default_factory=list)
    message: str = ""
    retries_used: int = 0


@dataclasses.dataclass(frozen=True)
class EngineContext:
    """Contextual information provided to the engine for chunk execution.

    Contains everything the engine needs to understand what to build
    without re-discovering the spec or repo layout itself.
    """

    spec_path: pathlib.Path = dataclasses.field(default_factory=lambda: pathlib.Path())
    spec_content: str = ""
    repo_file_tree: list[str] = dataclasses.field(default_factory=list)
    previous_chunks: list[str] = dataclasses.field(default_factory=list)
    deadline: float = 0.0  # monotonic clock deadline
    model: str = ""  # LLM model override (e.g. from --model flag)


# ---------------------------------------------------------------------------
# Engine base class
# ---------------------------------------------------------------------------


class BuildEngine(abc.ABC):
    """Abstract base for all codelicious build engines.

    **Chunk-level interface** (spec-27 Phase 3.1):

    * ``execute_chunk`` — implement one work chunk
    * ``verify_chunk``  — lint/test/security check a completed chunk
    * ``fix_chunk``     — attempt to fix verification failures
    """

    @property
    @abc.abstractmethod
    def name(self) -> str:
        """Human-readable engine name."""

    # ------------------------------------------------------------------
    # Chunk-level interface (spec-27 Phase 3.1)
    # ------------------------------------------------------------------

    @abc.abstractmethod
    def execute_chunk(
        self,
        chunk: object,  # chunker.WorkChunk (use object to avoid circular import)
        repo_path: pathlib.Path,
        context: EngineContext,
    ) -> ChunkResult:
        """Execute a single work chunk.

        The engine receives a focused prompt describing exactly what to
        build.  It should modify files in ``repo_path``, run tests, and
        return the list of files it changed.
        """

    @abc.abstractmethod
    def verify_chunk(
        self,
        chunk: object,
        repo_path: pathlib.Path,
    ) -> ChunkResult:
        """Verify a completed chunk passes lint, test, and security checks.

        Returns a ``ChunkResult`` where ``success=True`` means all checks
        passed.  On failure, ``message`` contains the failure details that
        can be fed to ``fix_chunk``.
        """

    @abc.abstractmethod
    def fix_chunk(
        self,
        chunk: object,
        repo_path: pathlib.Path,
        failures: list[str],
    ) -> ChunkResult:
        """Attempt to fix verification failures for a chunk.

        ``failures`` contains error messages from a previous
        ``verify_chunk`` call.  The engine should try to resolve them
        and return the updated file list.
        """
