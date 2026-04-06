"""Tests for the BuildEngine abstract base class and BuildResult dataclass.

Covers:
- BuildEngine cannot be directly instantiated (abstract class enforcement)
- Concrete subclasses must implement all abstract members
- BuildResult field creation and default values
"""

from __future__ import annotations

import pathlib

import pytest

from codelicious.engines.base import BuildEngine, BuildResult


# ---------------------------------------------------------------------------
# BuildResult tests
# ---------------------------------------------------------------------------


class TestBuildResult:
    """Tests for the BuildResult dataclass."""

    def test_build_result_creation(self) -> None:
        """BuildResult stores all provided field values correctly."""
        result = BuildResult(
            success=True,
            message="All specs complete.",
            session_id="abc-123",
            elapsed_s=42.5,
        )

        assert result.success is True
        assert result.message == "All specs complete."
        assert result.session_id == "abc-123"
        assert result.elapsed_s == 42.5

    def test_build_result_defaults(self) -> None:
        """BuildResult has correct default field values when only success is provided."""
        result = BuildResult(success=False)

        assert result.success is False
        assert result.message == ""
        assert result.session_id == ""
        assert result.elapsed_s == 0.0

    def test_build_result_success_true(self) -> None:
        """BuildResult with success=True is truthy for the success field."""
        result = BuildResult(success=True)
        assert result.success is True

    def test_build_result_success_false(self) -> None:
        """BuildResult with success=False reflects a failed build."""
        result = BuildResult(success=False, message="Exhausted iteration limit.")
        assert result.success is False
        assert result.message == "Exhausted iteration limit."


# ---------------------------------------------------------------------------
# BuildEngine abstract class enforcement tests
# ---------------------------------------------------------------------------


class TestBuildEngineAbstract:
    """Tests for the BuildEngine abstract base class."""

    def test_base_engine_cannot_be_instantiated(self) -> None:
        """Directly instantiating BuildEngine raises TypeError (it is abstract)."""
        with pytest.raises(TypeError):
            BuildEngine()  # type: ignore[abstract]

    def test_subclass_must_implement_all_abstract(self) -> None:
        """A subclass that omits run_build_cycle cannot be instantiated."""

        class PartialEngine(BuildEngine):
            """Implements name but not run_build_cycle."""

            @property
            def name(self) -> str:
                return "Partial"

            # Intentionally omits run_build_cycle

        with pytest.raises(TypeError):
            PartialEngine()  # type: ignore[abstract]

    def test_subclass_missing_name_property_cannot_be_instantiated(self) -> None:
        """A subclass that omits the name property cannot be instantiated."""

        class NoNameEngine(BuildEngine):
            """Implements run_build_cycle but not name."""

            def run_build_cycle(self, repo_path, git_manager, cache_manager, spec_filter=None, **kwargs):
                return BuildResult(success=True)

            # Intentionally omits name property

        with pytest.raises(TypeError):
            NoNameEngine()  # type: ignore[abstract]

    def test_subclass_with_all_methods_works(self) -> None:
        """A complete concrete subclass can be instantiated and used without errors."""

        class ConcreteEngine(BuildEngine):
            """Fully concrete implementation of BuildEngine."""

            @property
            def name(self) -> str:
                return "Concrete Engine"

            def run_build_cycle(
                self,
                repo_path: pathlib.Path,
                git_manager: object,
                cache_manager: object,
                spec_filter: str | None = None,
                **kwargs,
            ) -> BuildResult:
                return BuildResult(success=True, message="Done", elapsed_s=1.0)

        engine = ConcreteEngine()
        assert engine.name == "Concrete Engine"

        result = engine.run_build_cycle(
            repo_path=pathlib.Path("/tmp"),
            git_manager=object(),
            cache_manager=object(),
        )
        assert isinstance(result, BuildResult)
        assert result.success is True
        assert result.message == "Done"
        assert result.elapsed_s == 1.0

    def test_subclass_name_property_is_accessible(self) -> None:
        """The name property on a concrete subclass returns the expected string."""

        class NamedEngine(BuildEngine):
            @property
            def name(self) -> str:
                return "My Engine"

            def run_build_cycle(self, repo_path, git_manager, cache_manager, spec_filter=None, **kwargs):
                return BuildResult(success=False)

        engine = NamedEngine()
        assert engine.name == "My Engine"
