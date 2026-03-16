"""Abstract base class for codelicious build engines."""

from __future__ import annotations

import abc
import pathlib
from dataclasses import dataclass


@dataclass
class BuildResult:
    """Result from a build engine run."""

    success: bool
    message: str = ""
    session_id: str = ""
    elapsed_s: float = 0.0


class BuildEngine(abc.ABC):
    """Abstract base for all codelicious build engines.

    Each engine implements the full build lifecycle:
    understand → build → verify → commit → push → PR.
    """

    @property
    @abc.abstractmethod
    def name(self) -> str:
        """Human-readable engine name."""

    @abc.abstractmethod
    def run_build_cycle(
        self,
        repo_path: pathlib.Path,
        git_manager: object,
        cache_manager: object,
        spec_filter: str | None = None,
        **kwargs,
    ) -> BuildResult:
        """Run the full build cycle.

        Parameters
        ----------
        repo_path:
            Path to the target repository.
        git_manager:
            GitManager instance for branch/commit/PR operations.
        cache_manager:
            CacheManager instance for state persistence.
        spec_filter:
            Optional: path to a specific spec to build.
        **kwargs:
            Engine-specific configuration (model, timeout, etc.)

        Returns
        -------
        BuildResult
            Outcome of the build cycle.
        """
