"""Tests for the BuildEngine abstract base class and BuildResult dataclass.

Covers:
- BuildEngine cannot be directly instantiated (abstract class enforcement)
- Concrete subclasses must implement all abstract members
- BuildResult field creation and default values
- select_engine factory function
"""

from __future__ import annotations

import pathlib
from unittest import mock

import pytest

from codelicious.engines.base import BuildEngine, BuildResult, ChunkResult, EngineContext
from codelicious.engines.claude_engine import ClaudeCodeEngine
from codelicious.engines.huggingface_engine import HuggingFaceEngine

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

            def execute_chunk(self, chunk, repo_path, context):
                return ChunkResult(success=True, files_modified=[], message="done")

            def verify_chunk(self, chunk, repo_path):
                return ChunkResult(success=True, message="passed")

            def fix_chunk(self, chunk, repo_path, failures):
                return ChunkResult(success=True, message="fixed")

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

            def execute_chunk(self, chunk, repo_path, context):
                return ChunkResult(success=True)

            def verify_chunk(self, chunk, repo_path):
                return ChunkResult(success=True)

            def fix_chunk(self, chunk, repo_path, failures):
                return ChunkResult(success=True)

            def run_build_cycle(self, repo_path, git_manager, cache_manager, spec_filter=None, **kwargs):
                return BuildResult(success=False)

        engine = NamedEngine()
        assert engine.name == "My Engine"


# ---------------------------------------------------------------------------
# Engine contract tests — verify both concrete engines implement the ABC
# (merged from test_engine_contract.py, spec-18 Phase 11)
# ---------------------------------------------------------------------------


class TestEngineContract:
    """Both engines must implement the same BuildEngine interface."""

    def test_claude_engine_is_build_engine(self) -> None:
        """ClaudeCodeEngine must be an instance of BuildEngine."""
        engine = ClaudeCodeEngine()
        assert isinstance(engine, BuildEngine)

    def test_hf_engine_is_build_engine(self) -> None:
        """HuggingFaceEngine must be an instance of BuildEngine."""
        engine = HuggingFaceEngine()
        assert isinstance(engine, BuildEngine)

    def test_claude_engine_has_name(self) -> None:
        """ClaudeCodeEngine.name must be a non-empty string."""
        engine = ClaudeCodeEngine()
        assert isinstance(engine.name, str)
        assert len(engine.name) > 0

    def test_hf_engine_has_name(self) -> None:
        """HuggingFaceEngine.name must be a non-empty string."""
        engine = HuggingFaceEngine()
        assert isinstance(engine.name, str)
        assert len(engine.name) > 0

    def test_claude_engine_has_run_build_cycle(self) -> None:
        """ClaudeCodeEngine must expose a callable run_build_cycle method."""
        engine = ClaudeCodeEngine()
        assert hasattr(engine, "run_build_cycle")
        assert callable(engine.run_build_cycle)

    def test_hf_engine_has_run_build_cycle(self) -> None:
        """HuggingFaceEngine must expose a callable run_build_cycle method."""
        engine = HuggingFaceEngine()
        assert hasattr(engine, "run_build_cycle")
        assert callable(engine.run_build_cycle)


class TestBuildResultMessageType:
    """Targeted type-check for BuildResult.message (not covered by TestBuildResult)."""

    def test_build_result_message_is_str(self) -> None:
        """BuildResult.message must be an instance of str."""
        result = BuildResult(success=False, message="failed")
        assert isinstance(result.message, str)


# ---------------------------------------------------------------------------
# spec-27 Phase 3.1 — ChunkResult, EngineContext
# ---------------------------------------------------------------------------


class TestChunkResult:
    """spec-27 Phase 3.1: ChunkResult dataclass."""

    def test_defaults(self) -> None:
        r = ChunkResult(success=True)
        assert r.success is True
        assert r.files_modified == []
        assert r.message == ""
        assert r.retries_used == 0

    def test_with_files(self) -> None:
        r = ChunkResult(
            success=True,
            files_modified=[pathlib.Path("src/a.py"), pathlib.Path("src/b.py")],
            message="done",
            retries_used=2,
        )
        assert len(r.files_modified) == 2
        assert r.retries_used == 2

    def test_frozen(self) -> None:
        r = ChunkResult(success=True)
        with pytest.raises(AttributeError):
            r.success = False  # type: ignore[misc]


class TestEngineContext:
    """spec-27 Phase 3.1: EngineContext dataclass."""

    def test_defaults(self) -> None:
        ctx = EngineContext()
        assert ctx.spec_content == ""
        assert ctx.repo_file_tree == []
        assert ctx.previous_chunks == []
        assert ctx.deadline == 0.0

    def test_with_values(self) -> None:
        ctx = EngineContext(
            spec_path=pathlib.Path("spec.md"),
            spec_content="# Spec",
            repo_file_tree=["src/a.py", "src/b.py"],
            previous_chunks=["chunk-01: done"],
            deadline=12345.0,
        )
        assert ctx.spec_content == "# Spec"
        assert len(ctx.repo_file_tree) == 2
        assert ctx.deadline == 12345.0

    def test_frozen(self) -> None:
        ctx = EngineContext()
        with pytest.raises(AttributeError):
            ctx.deadline = 999.0  # type: ignore[misc]


class TestChunkAbstractMethods:
    """spec-27 Phase 3.1: Abstract chunk methods are required."""

    def test_missing_execute_chunk_raises(self) -> None:
        """A subclass missing execute_chunk cannot be instantiated."""

        class NoChunkEngine(BuildEngine):
            @property
            def name(self):
                return "X"

            def verify_chunk(self, chunk, repo_path):
                return ChunkResult(success=True)

            def fix_chunk(self, chunk, repo_path, failures):
                return ChunkResult(success=True)

            def run_build_cycle(self, repo_path, git_manager, cache_manager, spec_filter=None, **kwargs):
                return BuildResult(success=True)

        with pytest.raises(TypeError):
            NoChunkEngine()  # type: ignore[abstract]

    def test_both_engines_have_chunk_methods(self) -> None:
        """Both ClaudeCodeEngine and HuggingFaceEngine implement chunk methods."""
        from codelicious.engines.claude_engine import ClaudeCodeEngine
        from codelicious.engines.huggingface_engine import HuggingFaceEngine

        for cls in (ClaudeCodeEngine, HuggingFaceEngine):
            assert hasattr(cls, "execute_chunk")
            assert hasattr(cls, "verify_chunk")
            assert hasattr(cls, "fix_chunk")


# ---------------------------------------------------------------------------
# select_engine factory function tests
# ---------------------------------------------------------------------------


class TestSelectEngine:
    """Tests for the select_engine factory function in engines/__init__.py."""

    def test_select_engine_claude_force_available(self) -> None:
        """When engine='claude' and claude is on PATH, returns ClaudeCodeEngine."""
        from codelicious.engines import select_engine

        with mock.patch("shutil.which", return_value="/usr/local/bin/claude"):
            engine = select_engine("claude")

        assert isinstance(engine, ClaudeCodeEngine)

    def test_select_engine_claude_force_unavailable(self) -> None:
        """When engine='claude' and claude is not on PATH, raises RuntimeError."""
        from codelicious.engines import select_engine

        with mock.patch("shutil.which", return_value=None):
            with pytest.raises(RuntimeError, match="Claude Code CLI not found"):
                select_engine("claude")

    def test_select_engine_huggingface_force_available(self) -> None:
        """When engine='huggingface' and HF_TOKEN is set, returns HuggingFaceEngine."""
        from codelicious.engines import select_engine

        with mock.patch.dict("os.environ", {"HF_TOKEN": "hf_test123"}, clear=False):
            engine = select_engine("huggingface")

        assert isinstance(engine, HuggingFaceEngine)

    def test_select_engine_huggingface_force_llm_api_key(self) -> None:
        """When engine='huggingface' and LLM_API_KEY is set, returns HuggingFaceEngine."""
        from codelicious.engines import select_engine

        env = {"LLM_API_KEY": "sk-test456"}
        with mock.patch.dict("os.environ", env, clear=False):
            # Also ensure HF_TOKEN is absent so only LLM_API_KEY is present
            with mock.patch("os.environ.get", side_effect=lambda k, d=None: env.get(k, d)):
                engine = select_engine("huggingface")

        assert isinstance(engine, HuggingFaceEngine)

    def test_select_engine_huggingface_force_unavailable(self) -> None:
        """When engine='huggingface' and no token env vars set, raises RuntimeError."""
        from codelicious.engines import select_engine

        with mock.patch.dict("os.environ", {}, clear=True):
            with pytest.raises(RuntimeError, match="HuggingFace token not found"):
                select_engine("huggingface")

    def test_select_engine_auto_prefers_claude(self) -> None:
        """When engine='auto' and claude is available, returns ClaudeCodeEngine."""
        from codelicious.engines import select_engine

        with mock.patch("shutil.which", return_value="/usr/local/bin/claude"):
            with mock.patch.dict("os.environ", {"HF_TOKEN": "hf_test"}, clear=False):
                engine = select_engine("auto")

        assert isinstance(engine, ClaudeCodeEngine)

    def test_select_engine_auto_falls_back_to_hf(self) -> None:
        """When engine='auto', claude unavailable, HF_TOKEN set, returns HuggingFaceEngine."""
        from codelicious.engines import select_engine

        with mock.patch("shutil.which", return_value=None):
            with mock.patch.dict("os.environ", {"HF_TOKEN": "hf_test"}, clear=True):
                engine = select_engine("auto")

        assert isinstance(engine, HuggingFaceEngine)

    def test_select_engine_auto_nothing_available(self) -> None:
        """When engine='auto' and neither claude nor HF tokens are available, raises RuntimeError."""
        from codelicious.engines import select_engine

        with mock.patch("shutil.which", return_value=None):
            with mock.patch.dict("os.environ", {}, clear=True):
                with pytest.raises(RuntimeError, match="No build engine available"):
                    select_engine("auto")
