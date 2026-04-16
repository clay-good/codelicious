"""Tests for HuggingFace engine chunk execution interface (spec-27 Phase 7.2).

Tests execute_chunk, verify_chunk, and fix_chunk on HuggingFaceEngine
with all HTTP/LLM calls mocked.
"""

from __future__ import annotations

import json
import pathlib
import urllib.error
from dataclasses import dataclass
from unittest import mock

import pytest

from codelicious.engines.base import ChunkResult, EngineContext
from codelicious.engines.huggingface_engine import HuggingFaceEngine, _is_transient
from codelicious.errors import LLMRateLimitError


@dataclass
class FakeChunk:
    id: str = "spec-1-chunk-01"
    title: str = "Add feature"
    description: str = "Implement the feature"
    validation: str = "tests pass"


class TestHFExecuteChunk:
    """HuggingFaceEngine.execute_chunk runs the agentic tool loop."""

    def test_chunk_complete_signal(self, tmp_path: pathlib.Path) -> None:
        """When the LLM responds with CHUNK_COMPLETE, success=True."""
        engine = HuggingFaceEngine()
        chunk = FakeChunk()
        context = EngineContext(spec_content="# Spec", deadline=0.0)

        mock_llm = mock.MagicMock()
        # LLM returns a text response with CHUNK_COMPLETE
        mock_llm.chat_completion.return_value = {
            "choices": [{"message": {"role": "assistant", "content": "All done. CHUNK_COMPLETE"}}]
        }
        mock_llm.parse_tool_calls.return_value = []
        mock_llm.parse_content.return_value = "All done. CHUNK_COMPLETE"
        mock_llm.planner_model = "test"
        mock_llm.coder_model = "test"
        mock_llm.endpoint_url = "https://test"

        mock_registry = mock.MagicMock()
        mock_registry.generate_schema.return_value = []
        mock_config = {}
        diff_mock = mock.MagicMock(returncode=0, stdout="src/a.py\n")

        with mock.patch("codelicious.llm_client.LLMClient", return_value=mock_llm):
            with mock.patch("codelicious.tools.registry.ToolRegistry", return_value=mock_registry):
                with mock.patch("codelicious.config.load_project_config", return_value=mock_config):
                    with mock.patch("subprocess.run", return_value=diff_mock):
                        result = engine.execute_chunk(chunk, tmp_path, context)

        assert isinstance(result, ChunkResult)
        assert result.success is True

    def test_iteration_limit_returns_incomplete(self, tmp_path: pathlib.Path) -> None:
        """When max iterations exhausted without CHUNK_COMPLETE, success=False."""
        engine = HuggingFaceEngine()
        chunk = FakeChunk()
        context = EngineContext(spec_content="# Spec", deadline=0.0)

        mock_llm = mock.MagicMock()
        # Always returns non-complete text
        mock_llm.chat_completion.return_value = {
            "choices": [{"message": {"role": "assistant", "content": "Still working..."}}]
        }
        mock_llm.parse_tool_calls.return_value = []
        mock_llm.parse_content.return_value = "Still working..."
        mock_llm.planner_model = "test"
        mock_llm.coder_model = "test"
        mock_llm.endpoint_url = "https://test"

        mock_registry = mock.MagicMock()
        mock_registry.generate_schema.return_value = []
        diff_mock = mock.MagicMock(returncode=0, stdout="")

        with mock.patch("codelicious.llm_client.LLMClient", return_value=mock_llm):
            with mock.patch("codelicious.tools.registry.ToolRegistry", return_value=mock_registry):
                with mock.patch("codelicious.config.load_project_config", return_value={}):
                    with mock.patch("subprocess.run", return_value=diff_mock):
                        result = engine.execute_chunk(chunk, tmp_path, context)

        assert result.success is False
        assert "incomplete" in result.message.lower()


class TestHFVerifyChunk:
    """HuggingFaceEngine.verify_chunk runs the verifier."""

    def test_all_pass(self, tmp_path: pathlib.Path) -> None:
        engine = HuggingFaceEngine()
        chunk = FakeChunk()

        mock_vresult = mock.MagicMock()
        mock_vresult.all_passed = True

        with mock.patch("codelicious.verifier.verify", return_value=mock_vresult):
            result = engine.verify_chunk(chunk, tmp_path)
        assert result.success is True

    def test_failure_reported(self, tmp_path: pathlib.Path) -> None:
        engine = HuggingFaceEngine()
        chunk = FakeChunk()

        mock_check = mock.MagicMock(passed=False, name="tests", message="1 failed")
        mock_vresult = mock.MagicMock(all_passed=False, checks=[mock_check])

        with mock.patch("codelicious.verifier.verify", return_value=mock_vresult):
            result = engine.verify_chunk(chunk, tmp_path)
        assert result.success is False


class TestHFFixChunk:
    """HuggingFaceEngine.fix_chunk re-runs execute_chunk with fix context."""

    def test_fix_delegates_to_execute(self, tmp_path: pathlib.Path) -> None:
        engine = HuggingFaceEngine()
        chunk = FakeChunk()

        fix_result = ChunkResult(success=True, files_modified=[], message="fixed")

        with mock.patch.object(engine, "execute_chunk", return_value=fix_result) as mock_exec:
            result = engine.fix_chunk(chunk, tmp_path, ["lint failed"])

        assert result.success is True
        assert result.retries_used == 1
        mock_exec.assert_called_once()


# ---------------------------------------------------------------------------
# _is_transient classification tests
# ---------------------------------------------------------------------------


class TestIsTransient:
    """Tests for the _is_transient helper function."""

    def test_is_transient_http_429(self) -> None:
        """HTTPError with code 429 is transient (rate limit)."""
        exc = urllib.error.HTTPError(url="https://example.com", code=429, msg="Too Many Requests", hdrs=None, fp=None)
        assert _is_transient(exc) is True

    def test_is_transient_http_500(self) -> None:
        """HTTPError with code 500 is transient (server error)."""
        exc = urllib.error.HTTPError(
            url="https://example.com", code=500, msg="Internal Server Error", hdrs=None, fp=None
        )
        assert _is_transient(exc) is True

    def test_is_transient_http_400(self) -> None:
        """HTTPError with code 400 is NOT transient (client error)."""
        exc = urllib.error.HTTPError(url="https://example.com", code=400, msg="Bad Request", hdrs=None, fp=None)
        assert _is_transient(exc) is False

    def test_is_transient_url_error(self) -> None:
        """URLError (network failure) is transient."""
        exc = urllib.error.URLError(reason="Connection refused")
        assert _is_transient(exc) is True

    def test_is_transient_timeout_error(self) -> None:
        """TimeoutError is transient."""
        exc = TimeoutError("timed out")
        assert _is_transient(exc) is True

    def test_is_transient_value_error(self) -> None:
        """ValueError is NOT transient."""
        exc = ValueError("bad value")
        assert _is_transient(exc) is False


# ---------------------------------------------------------------------------
# Rate-limit / transient error / fatal error retry behaviour
# ---------------------------------------------------------------------------


def _make_mock_llm(response: dict) -> mock.MagicMock:
    """Build a minimal LLMClient mock returning the given response."""
    llm = mock.MagicMock()
    llm.chat_completion.return_value = response
    llm.parse_tool_calls.return_value = []
    llm.parse_content.return_value = ""
    return llm


def _chunk_complete_response() -> dict:
    return {"choices": [{"message": {"role": "assistant", "content": "CHUNK_COMPLETE"}}]}


class TestRateLimitRetry:
    """Rate-limit and transient error retry behaviour in execute_chunk."""

    def test_rate_limit_sleeps_and_retries(self, tmp_path: pathlib.Path) -> None:
        """LLMRateLimitError causes a sleep and a retry, eventually succeeding."""
        engine = HuggingFaceEngine()
        chunk = FakeChunk()
        context = EngineContext(spec_content="# Spec", deadline=0.0)

        rate_err = LLMRateLimitError("rate limited", retry_after_s=5.0)

        mock_llm = mock.MagicMock()
        # First call raises rate limit; second call returns completion
        mock_llm.chat_completion.side_effect = [rate_err, _chunk_complete_response()]
        mock_llm.parse_tool_calls.return_value = []
        mock_llm.parse_content.return_value = "CHUNK_COMPLETE"

        mock_registry = mock.MagicMock()
        mock_registry.generate_schema.return_value = []
        diff_mock = mock.MagicMock(returncode=0, stdout="")

        with mock.patch("codelicious.llm_client.LLMClient", return_value=mock_llm):
            with mock.patch("codelicious.tools.registry.ToolRegistry", return_value=mock_registry):
                with mock.patch("codelicious.config.load_project_config", return_value={}):
                    with mock.patch("subprocess.run", return_value=diff_mock):
                        with mock.patch("time.sleep") as mock_sleep:
                            result = engine.execute_chunk(chunk, tmp_path, context)

        assert result.success is True
        mock_sleep.assert_called_once_with(5.0)

    def test_transient_error_retries_with_backoff(self, tmp_path: pathlib.Path) -> None:
        """Transient errors (URLError) retry up to 5 times then abort with success=False."""
        engine = HuggingFaceEngine()
        chunk = FakeChunk()
        context = EngineContext(spec_content="# Spec", deadline=0.0)

        transient_err = urllib.error.URLError(reason="Connection refused")

        mock_llm = mock.MagicMock()
        # Always raises transient error so we exhaust retries
        mock_llm.chat_completion.side_effect = transient_err

        mock_registry = mock.MagicMock()
        mock_registry.generate_schema.return_value = []
        diff_mock = mock.MagicMock(returncode=0, stdout="")

        with mock.patch("codelicious.llm_client.LLMClient", return_value=mock_llm):
            with mock.patch("codelicious.tools.registry.ToolRegistry", return_value=mock_registry):
                with mock.patch("codelicious.config.load_project_config", return_value={}):
                    with mock.patch("subprocess.run", return_value=diff_mock):
                        with mock.patch("time.sleep"):
                            result = engine.execute_chunk(chunk, tmp_path, context)

        assert result.success is False

    def test_fatal_error_raises(self, tmp_path: pathlib.Path) -> None:
        """A non-transient exception (ValueError) propagates out of execute_chunk."""
        engine = HuggingFaceEngine()
        chunk = FakeChunk()
        context = EngineContext(spec_content="# Spec", deadline=0.0)

        mock_llm = mock.MagicMock()
        mock_llm.chat_completion.side_effect = ValueError("unexpected failure")

        mock_registry = mock.MagicMock()
        mock_registry.generate_schema.return_value = []
        diff_mock = mock.MagicMock(returncode=0, stdout="")

        with mock.patch("codelicious.llm_client.LLMClient", return_value=mock_llm):
            with mock.patch("codelicious.tools.registry.ToolRegistry", return_value=mock_registry):
                with mock.patch("codelicious.config.load_project_config", return_value={}):
                    with mock.patch("subprocess.run", return_value=diff_mock):
                        with pytest.raises(ValueError, match="unexpected failure"):
                            engine.execute_chunk(chunk, tmp_path, context)


# ---------------------------------------------------------------------------
# Empty response handling
# ---------------------------------------------------------------------------


class TestEmptyResponse:
    """Empty choices causes a 'continue' message to be appended."""

    def test_empty_response_prompts_continue(self, tmp_path: pathlib.Path) -> None:
        """When choices is empty, engine appends [Empty response] and continues."""
        engine = HuggingFaceEngine()
        chunk = FakeChunk()
        context = EngineContext(spec_content="# Spec", deadline=0.0)

        mock_llm = mock.MagicMock()

        call_count = 0

        def _side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return {"choices": []}  # empty choices
            return _chunk_complete_response()

        mock_llm.chat_completion.side_effect = _side_effect
        mock_llm.parse_tool_calls.return_value = []
        mock_llm.parse_content.return_value = "CHUNK_COMPLETE"

        mock_registry = mock.MagicMock()
        mock_registry.generate_schema.return_value = []
        diff_mock = mock.MagicMock(returncode=0, stdout="")

        with mock.patch("codelicious.llm_client.LLMClient", return_value=mock_llm):
            with mock.patch("codelicious.tools.registry.ToolRegistry", return_value=mock_registry):
                with mock.patch("codelicious.config.load_project_config", return_value={}):
                    with mock.patch("subprocess.run", return_value=diff_mock):
                        result = engine.execute_chunk(chunk, tmp_path, context)

        assert result.success is True
        # At least 2 calls: one empty, one successful
        assert mock_llm.chat_completion.call_count >= 2


# ---------------------------------------------------------------------------
# Tool dispatch in the main loop
# ---------------------------------------------------------------------------


class TestToolDispatch:
    """Tool calls in the agentic loop are dispatched through the registry."""

    def _make_tool_response(self, tool_name: str, args: dict) -> dict:
        return {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": "",
                        "tool_calls": [
                            {
                                "id": "call-001",
                                "type": "function",
                                "function": {"name": tool_name, "arguments": json.dumps(args)},
                            }
                        ],
                    }
                }
            ]
        }

    def test_tool_dispatch_executes(self, tmp_path: pathlib.Path) -> None:
        """Tool calls returned by the LLM are dispatched through ToolRegistry.dispatch."""
        engine = HuggingFaceEngine()
        chunk = FakeChunk()
        context = EngineContext(spec_content="# Spec", deadline=0.0)

        mock_llm = mock.MagicMock()
        tool_response = self._make_tool_response("read_file", {"path": "src/a.py"})
        complete_response = _chunk_complete_response()

        mock_llm.chat_completion.side_effect = [tool_response, complete_response]
        # First call has tool calls; second has none
        mock_llm.parse_tool_calls.side_effect = [
            [{"id": "call-001", "function": {"name": "read_file", "arguments": json.dumps({"path": "src/a.py"})}}],
            [],
        ]
        mock_llm.parse_content.return_value = "CHUNK_COMPLETE"

        mock_registry = mock.MagicMock()
        mock_registry.generate_schema.return_value = []
        mock_registry.dispatch.return_value = {"content": "file contents"}
        diff_mock = mock.MagicMock(returncode=0, stdout="")

        with mock.patch("codelicious.llm_client.LLMClient", return_value=mock_llm):
            with mock.patch("codelicious.tools.registry.ToolRegistry", return_value=mock_registry):
                with mock.patch("codelicious.config.load_project_config", return_value={}):
                    with mock.patch("subprocess.run", return_value=diff_mock):
                        result = engine.execute_chunk(chunk, tmp_path, context)

        mock_registry.dispatch.assert_called_once_with("read_file", {"path": "src/a.py"})
        assert result.success is True

    def test_tool_dispatch_error_returns_error_message(self, tmp_path: pathlib.Path) -> None:
        """When tool dispatch raises, an error tool result is appended and execution continues."""
        engine = HuggingFaceEngine()
        chunk = FakeChunk()
        context = EngineContext(spec_content="# Spec", deadline=0.0)

        mock_llm = mock.MagicMock()
        tool_response = self._make_tool_response("read_file", {"path": "no-such.py"})
        complete_response = _chunk_complete_response()

        mock_llm.chat_completion.side_effect = [tool_response, complete_response]
        mock_llm.parse_tool_calls.side_effect = [
            [{"id": "call-002", "function": {"name": "read_file", "arguments": json.dumps({"path": "no-such.py"})}}],
            [],
        ]
        mock_llm.parse_content.return_value = "CHUNK_COMPLETE"

        mock_registry = mock.MagicMock()
        mock_registry.generate_schema.return_value = []
        mock_registry.dispatch.side_effect = FileNotFoundError("no-such.py not found")
        diff_mock = mock.MagicMock(returncode=0, stdout="")

        with mock.patch("codelicious.llm_client.LLMClient", return_value=mock_llm):
            with mock.patch("codelicious.tools.registry.ToolRegistry", return_value=mock_registry):
                with mock.patch("codelicious.config.load_project_config", return_value={}):
                    with mock.patch("subprocess.run", return_value=diff_mock):
                        result = engine.execute_chunk(chunk, tmp_path, context)

        # Execution should not crash; the error is captured as a tool message
        assert result.success is True
        # Verify an error-shaped message was appended (dispatch was called)
        mock_registry.dispatch.assert_called_once()


# ---------------------------------------------------------------------------
# Reflection step
# ---------------------------------------------------------------------------


class TestReflectionStep:
    """Reflection step runs when completed=True and time remains."""

    def test_reflection_runs_when_completed(self, tmp_path: pathlib.Path) -> None:
        """When chunk completes, a reflection call is made to the LLM."""
        engine = HuggingFaceEngine()
        chunk = FakeChunk()
        # Use a far-future deadline so reflection is triggered
        context = EngineContext(spec_content="# Spec", deadline=9_999_999_999.0)

        mock_llm = mock.MagicMock()
        # First call: main loop completes; second call: reflection
        mock_llm.chat_completion.side_effect = [
            _chunk_complete_response(),
            {"choices": [{"message": {"role": "assistant", "content": "All good. CHUNK_COMPLETE"}}]},
        ]
        mock_llm.parse_tool_calls.return_value = []
        mock_llm.parse_content.return_value = "CHUNK_COMPLETE"

        mock_registry = mock.MagicMock()
        mock_registry.generate_schema.return_value = []
        diff_mock = mock.MagicMock(returncode=0, stdout="")

        with mock.patch("codelicious.llm_client.LLMClient", return_value=mock_llm):
            with mock.patch("codelicious.tools.registry.ToolRegistry", return_value=mock_registry):
                with mock.patch("codelicious.config.load_project_config", return_value={}):
                    with mock.patch("subprocess.run", return_value=diff_mock):
                        result = engine.execute_chunk(chunk, tmp_path, context)

        assert result.success is True
        # Main call + reflection call
        assert mock_llm.chat_completion.call_count >= 2

    def test_reflection_tool_calls_dispatched(self, tmp_path: pathlib.Path) -> None:
        """Tool calls returned during reflection are executed through the registry."""
        engine = HuggingFaceEngine()
        chunk = FakeChunk()
        context = EngineContext(spec_content="# Spec", deadline=9_999_999_999.0)

        reflect_tool_call = {
            "id": "reflect-001",
            "function": {"name": "read_file", "arguments": json.dumps({"path": "src/x.py"})},
        }
        reflect_response = {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": "",
                        "tool_calls": [reflect_tool_call],
                    }
                }
            ]
        }

        mock_llm = mock.MagicMock()
        mock_llm.chat_completion.side_effect = [_chunk_complete_response(), reflect_response]
        # Main loop: no tool calls; reflection: one tool call
        mock_llm.parse_tool_calls.side_effect = [[], [reflect_tool_call]]
        mock_llm.parse_content.return_value = "CHUNK_COMPLETE"

        mock_registry = mock.MagicMock()
        mock_registry.generate_schema.return_value = []
        mock_registry.dispatch.return_value = {"content": "data"}
        diff_mock = mock.MagicMock(returncode=0, stdout="")

        with mock.patch("codelicious.llm_client.LLMClient", return_value=mock_llm):
            with mock.patch("codelicious.tools.registry.ToolRegistry", return_value=mock_registry):
                with mock.patch("codelicious.config.load_project_config", return_value={}):
                    with mock.patch("subprocess.run", return_value=diff_mock):
                        result = engine.execute_chunk(chunk, tmp_path, context)

        assert result.success is True
        mock_registry.dispatch.assert_called_once_with("read_file", {"path": "src/x.py"})


# ---------------------------------------------------------------------------
# diff / subprocess exception
# ---------------------------------------------------------------------------


class TestDiffException:
    """When the subprocess call for git diff raises, files_modified is empty."""

    def test_diff_exception_returns_empty_files(self, tmp_path: pathlib.Path) -> None:
        """If subprocess.run raises an exception, files_modified defaults to []."""
        engine = HuggingFaceEngine()
        chunk = FakeChunk()
        context = EngineContext(spec_content="# Spec", deadline=0.0)

        mock_llm = mock.MagicMock()
        mock_llm.chat_completion.return_value = _chunk_complete_response()
        mock_llm.parse_tool_calls.return_value = []
        mock_llm.parse_content.return_value = "CHUNK_COMPLETE"

        mock_registry = mock.MagicMock()
        mock_registry.generate_schema.return_value = []

        with mock.patch("codelicious.llm_client.LLMClient", return_value=mock_llm):
            with mock.patch("codelicious.tools.registry.ToolRegistry", return_value=mock_registry):
                with mock.patch("codelicious.config.load_project_config", return_value={}):
                    with mock.patch("subprocess.run", side_effect=OSError("git not found")):
                        result = engine.execute_chunk(chunk, tmp_path, context)

        assert result.success is True
        assert result.files_modified == []


# ---------------------------------------------------------------------------
# verify_chunk: ImportError treated as pass
# ---------------------------------------------------------------------------


class TestVerifyChunkImportError:
    """verify_chunk treats ImportError as a skipped (pass) result."""

    def test_verify_import_error_treated_as_pass(self, tmp_path: pathlib.Path) -> None:
        """When codelicious.verifier cannot be imported, verify_chunk returns success=True."""
        engine = HuggingFaceEngine()
        chunk = FakeChunk()

        with mock.patch("builtins.__import__", side_effect=ImportError("verifier not installed")):
            # We need to only raise ImportError for the verifier import inside verify_chunk.
            # Use a targeted approach: patch the module reference used inside verify_chunk.
            pass

        # Direct approach: make the import inside verify_chunk fail
        import sys

        original = sys.modules.pop("codelicious.verifier", None)
        try:
            # Force an ImportError when the verifier is imported inside verify_chunk
            sys.modules["codelicious.verifier"] = None  # type: ignore[assignment]
            result = engine.verify_chunk(chunk, tmp_path)
        finally:
            if original is not None:
                sys.modules["codelicious.verifier"] = original
            else:
                sys.modules.pop("codelicious.verifier", None)

        assert result.success is True
        assert "skipped" in result.message.lower() or "not available" in result.message.lower()


# ---------------------------------------------------------------------------
# run_build_cycle
# ---------------------------------------------------------------------------


class TestRunBuildCycle:
    """run_build_cycle delegates to V2Orchestrator or returns early when no specs."""

    def test_run_build_cycle_no_specs(self, tmp_path: pathlib.Path) -> None:
        """When discover_incomplete_specs returns [], run_build_cycle returns success=True."""
        from codelicious.engines.base import BuildResult

        engine = HuggingFaceEngine()

        with mock.patch("codelicious.spec_discovery.discover_incomplete_specs", return_value=[]):
            result = engine.run_build_cycle(
                repo_path=tmp_path,
                git_manager=mock.MagicMock(),
                cache_manager=mock.MagicMock(),
            )

        assert isinstance(result, BuildResult)
        assert result.success is True
        assert "No incomplete specs" in result.message

    def test_run_build_cycle_delegates_to_v2(self, tmp_path: pathlib.Path) -> None:
        """When specs are found, run_build_cycle instantiates V2Orchestrator and calls run()."""
        from codelicious.engines.base import BuildResult

        engine = HuggingFaceEngine()

        fake_spec = mock.MagicMock()
        fake_orch_result = mock.MagicMock()
        fake_orch_result.success = True
        fake_orch_result.message = "all done"
        fake_orch_result.elapsed_s = 1.5

        mock_orch_instance = mock.MagicMock()
        mock_orch_instance.run.return_value = fake_orch_result

        with mock.patch("codelicious.spec_discovery.discover_incomplete_specs", return_value=[fake_spec]):
            with mock.patch(
                "codelicious.orchestrator.V2Orchestrator", return_value=mock_orch_instance
            ) as mock_orch_cls:
                result = engine.run_build_cycle(
                    repo_path=tmp_path,
                    git_manager=mock.MagicMock(),
                    cache_manager=mock.MagicMock(),
                )

        assert isinstance(result, BuildResult)
        assert result.success is True
        assert result.message == "all done"
        mock_orch_cls.assert_called_once()
        mock_orch_instance.run.assert_called_once()
