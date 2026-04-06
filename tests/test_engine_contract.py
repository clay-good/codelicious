"""Engine contract tests — verify both engines implement the BuildEngine ABC (spec-18 Phase 11)."""

from __future__ import annotations

from codelicious.engines.base import BuildEngine, BuildResult
from codelicious.engines.claude_engine import ClaudeCodeEngine
from codelicious.engines.huggingface_engine import HuggingFaceEngine


class TestEngineContract:
    """Both engines must implement the same BuildEngine interface."""

    def test_claude_engine_is_build_engine(self) -> None:
        engine = ClaudeCodeEngine()
        assert isinstance(engine, BuildEngine)

    def test_hf_engine_is_build_engine(self) -> None:
        engine = HuggingFaceEngine()
        assert isinstance(engine, BuildEngine)

    def test_claude_engine_has_name(self) -> None:
        engine = ClaudeCodeEngine()
        assert isinstance(engine.name, str)
        assert len(engine.name) > 0

    def test_hf_engine_has_name(self) -> None:
        engine = HuggingFaceEngine()
        assert isinstance(engine.name, str)
        assert len(engine.name) > 0

    def test_claude_engine_has_run_build_cycle(self) -> None:
        engine = ClaudeCodeEngine()
        assert hasattr(engine, "run_build_cycle")
        assert callable(engine.run_build_cycle)

    def test_hf_engine_has_run_build_cycle(self) -> None:
        engine = HuggingFaceEngine()
        assert hasattr(engine, "run_build_cycle")
        assert callable(engine.run_build_cycle)


class TestBuildResultContract:
    """BuildResult must expose required fields with correct types."""

    def test_build_result_has_required_fields(self) -> None:
        result = BuildResult(success=True, message="ok")
        assert hasattr(result, "success")
        assert hasattr(result, "message")
        assert hasattr(result, "elapsed_s")

    def test_build_result_success_is_bool(self) -> None:
        result = BuildResult(success=True)
        assert isinstance(result.success, bool)

    def test_build_result_message_is_str(self) -> None:
        result = BuildResult(success=False, message="failed")
        assert isinstance(result.message, str)

    def test_build_result_defaults(self) -> None:
        result = BuildResult(success=True)
        assert result.message == ""
        assert result.session_id == ""
        assert result.elapsed_s == 0.0
