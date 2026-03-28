"""Tests for engines/__init__.py select_engine and HuggingFaceEngine.

Finding 81: select_engine error paths not tested.
Finding 82: HuggingFaceEngine run_build_cycle had 0% coverage.
"""

from __future__ import annotations

import json
import pathlib
from unittest import mock

import pytest

from codelicious.engines import select_engine
from codelicious.engines.base import BuildResult
from codelicious.engines.huggingface_engine import HuggingFaceEngine


# ===========================================================================
# Finding 81: select_engine error paths
# ===========================================================================


class TestSelectEngineErrors:
    """Tests for RuntimeError paths in select_engine."""

    def test_claude_engine_not_available_raises_runtime_error(self) -> None:
        """When --engine claude but claude binary missing, RuntimeError is raised."""
        with mock.patch("shutil.which", return_value=None):
            with pytest.raises(RuntimeError, match="Claude Code CLI not found"):
                select_engine("claude")

    def test_huggingface_engine_no_tokens_raises_runtime_error(self) -> None:
        """When --engine huggingface but no HF_TOKEN/LLM_API_KEY, RuntimeError is raised."""
        with mock.patch.dict("os.environ", {}, clear=True):
            # Ensure neither token variable is set
            with mock.patch("os.environ.get", return_value=None):
                with pytest.raises(RuntimeError, match="HuggingFace token not found"):
                    select_engine("huggingface")

    def test_auto_engine_no_claude_no_tokens_raises_runtime_error(self) -> None:
        """When auto mode and neither claude nor HF tokens are available, RuntimeError is raised."""
        with mock.patch("shutil.which", return_value=None):
            with mock.patch("os.environ.get", return_value=None):
                with pytest.raises(RuntimeError, match="No build engine available"):
                    select_engine("auto")

    def test_claude_engine_available_returns_claude_engine(self) -> None:
        """When claude binary is on PATH, ClaudeCodeEngine is returned."""
        from codelicious.engines.claude_engine import ClaudeCodeEngine

        with mock.patch("shutil.which", return_value="/usr/local/bin/claude"):
            engine = select_engine("claude")
        assert isinstance(engine, ClaudeCodeEngine)

    def test_huggingface_engine_with_hf_token_returns_hf_engine(self) -> None:
        """When HF_TOKEN is set, HuggingFaceEngine is returned."""
        with mock.patch("shutil.which", return_value=None):
            with mock.patch.dict("os.environ", {"HF_TOKEN": "hf_test_token_abc123"}):
                engine = select_engine("huggingface")
        assert isinstance(engine, HuggingFaceEngine)

    def test_auto_mode_prefers_claude_over_huggingface(self) -> None:
        """In auto mode, Claude is preferred when both are available."""
        from codelicious.engines.claude_engine import ClaudeCodeEngine

        with mock.patch("shutil.which", return_value="/usr/bin/claude"):
            with mock.patch.dict("os.environ", {"HF_TOKEN": "hf_token"}):
                engine = select_engine("auto")
        assert isinstance(engine, ClaudeCodeEngine)

    def test_auto_mode_falls_back_to_huggingface_when_no_claude(self) -> None:
        """In auto mode, HuggingFace is used when Claude is not available."""
        with mock.patch("shutil.which", return_value=None):
            with mock.patch.dict("os.environ", {"LLM_API_KEY": "some_key"}):
                engine = select_engine("auto")
        assert isinstance(engine, HuggingFaceEngine)


# ===========================================================================
# Finding 82: HuggingFaceEngine run_build_cycle
# ===========================================================================


@pytest.fixture
def mock_git_manager() -> mock.MagicMock:
    """Mock GitManager that records calls."""
    mgr = mock.MagicMock()
    mgr.commit_verified_changes.return_value = None
    mgr.push_to_origin.return_value = True
    return mgr


@pytest.fixture
def mock_cache_manager(tmp_path: pathlib.Path) -> mock.MagicMock:
    """Mock CacheManager."""
    return mock.MagicMock()


def _make_llm_response(content: str = "ALL_SPECS_COMPLETE", tool_calls=None) -> dict:
    """Build a minimal LLM response dict matching LLMClient's expected format."""
    message: dict = {"role": "assistant", "content": content}
    if tool_calls is not None:
        message["tool_calls"] = tool_calls
    return {"choices": [{"message": message}]}


@mock.patch.dict("os.environ", {"HF_TOKEN": "hf_test_token_abc123"})
class TestHuggingFaceEngineSuccess:
    """Tests for the success path of HuggingFaceEngine.run_build_cycle."""

    def test_all_specs_complete_signal_sets_success_true(
        self, tmp_path: pathlib.Path, mock_git_manager, mock_cache_manager
    ) -> None:
        """When LLM returns ALL_SPECS_COMPLETE, BuildResult.success is True."""
        engine = HuggingFaceEngine()
        response = _make_llm_response("ALL_SPECS_COMPLETE")

        with mock.patch("codelicious.llm_client.LLMClient.chat_completion", return_value=response):
            with mock.patch("codelicious.llm_client.LLMClient.parse_tool_calls", return_value=[]):
                with mock.patch("codelicious.llm_client.LLMClient.parse_content", return_value="ALL_SPECS_COMPLETE"):
                    result = engine.run_build_cycle(
                        repo_path=tmp_path,
                        git_manager=mock_git_manager,
                        cache_manager=mock_cache_manager,
                        max_iterations=5,
                    )

        assert isinstance(result, BuildResult)
        assert result.success is True
        assert "All specs complete" in result.message

    def test_all_specs_complete_triggers_git_commit(
        self, tmp_path: pathlib.Path, mock_git_manager, mock_cache_manager
    ) -> None:
        """On success, commit_verified_changes and push_to_origin are called."""
        engine = HuggingFaceEngine()
        response = _make_llm_response("ALL_SPECS_COMPLETE")

        with mock.patch("codelicious.llm_client.LLMClient.chat_completion", return_value=response):
            with mock.patch("codelicious.llm_client.LLMClient.parse_tool_calls", return_value=[]):
                with mock.patch("codelicious.llm_client.LLMClient.parse_content", return_value="ALL_SPECS_COMPLETE"):
                    engine.run_build_cycle(
                        repo_path=tmp_path,
                        git_manager=mock_git_manager,
                        cache_manager=mock_cache_manager,
                        max_iterations=5,
                    )

        mock_git_manager.commit_verified_changes.assert_called_once()
        mock_git_manager.push_to_origin.assert_called_once()

    def test_iteration_exhausted_returns_failure(
        self, tmp_path: pathlib.Path, mock_git_manager, mock_cache_manager
    ) -> None:
        """When iterations are exhausted without ALL_SPECS_COMPLETE, success is False."""
        engine = HuggingFaceEngine()
        # LLM always returns a non-completion message
        response = _make_llm_response("Still working...")

        with mock.patch("codelicious.llm_client.LLMClient.chat_completion", return_value=response):
            with mock.patch("codelicious.llm_client.LLMClient.parse_tool_calls", return_value=[]):
                with mock.patch("codelicious.llm_client.LLMClient.parse_content", return_value="Still working..."):
                    result = engine.run_build_cycle(
                        repo_path=tmp_path,
                        git_manager=mock_git_manager,
                        cache_manager=mock_cache_manager,
                        max_iterations=2,  # Very low cap
                    )

        assert result.success is False
        assert "Exhausted" in result.message


@mock.patch.dict("os.environ", {"HF_TOKEN": "hf_test_token_abc123"})
class TestHuggingFaceEngineErrorBackoff:
    """Tests for consecutive LLM error backoff in HuggingFaceEngine."""

    def test_consecutive_errors_abort_after_max_retries(
        self, tmp_path: pathlib.Path, mock_git_manager, mock_cache_manager
    ) -> None:
        """After max_retries consecutive LLM failures the loop breaks and returns failure."""
        engine = HuggingFaceEngine()

        with mock.patch(
            "codelicious.llm_client.LLMClient.chat_completion",
            side_effect=RuntimeError("LLM connection refused"),
        ):
            with mock.patch("time.sleep"):  # Skip real backoff sleeps
                result = engine.run_build_cycle(
                    repo_path=tmp_path,
                    git_manager=mock_git_manager,
                    cache_manager=mock_cache_manager,
                    max_iterations=20,
                )

        assert result.success is False

    def test_single_llm_error_continues_loop(
        self, tmp_path: pathlib.Path, mock_git_manager, mock_cache_manager
    ) -> None:
        """A single LLM error resets the counter and the loop continues."""
        engine = HuggingFaceEngine()
        call_count = 0

        def _flaky_llm(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise ConnectionError("Transient error")
            return _make_llm_response("ALL_SPECS_COMPLETE")

        with mock.patch("codelicious.llm_client.LLMClient.chat_completion", side_effect=_flaky_llm):
            with mock.patch("codelicious.llm_client.LLMClient.parse_tool_calls", return_value=[]):
                with mock.patch("codelicious.llm_client.LLMClient.parse_content", return_value="ALL_SPECS_COMPLETE"):
                    with mock.patch("time.sleep"):
                        result = engine.run_build_cycle(
                            repo_path=tmp_path,
                            git_manager=mock_git_manager,
                            cache_manager=mock_cache_manager,
                            max_iterations=10,
                        )

        assert result.success is True


@mock.patch.dict("os.environ", {"HF_TOKEN": "hf_test_token_abc123"})
class TestHuggingFaceEngineToolDispatch:
    """Tests for tool dispatch exception handling in HuggingFaceEngine."""

    def _make_tool_call(self, name: str = "read_file", args: dict | None = None) -> dict:
        """Build a minimal tool_call structure."""
        if args is None:
            args = {"rel_path": "README.md"}
        return {
            "id": "call_abc123",
            "function": {
                "name": name,
                "arguments": json.dumps(args),
            },
        }

    def test_tool_dispatch_exception_appends_error_message(
        self, tmp_path: pathlib.Path, mock_git_manager, mock_cache_manager
    ) -> None:
        """When tool dispatch raises, an error message is appended and the loop continues."""
        engine = HuggingFaceEngine()
        tool_call = self._make_tool_call()
        tool_response = _make_llm_response(content="")
        completion_response = _make_llm_response("ALL_SPECS_COMPLETE")

        call_count = 0

        def _side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return tool_response
            return completion_response

        with mock.patch(
            "codelicious.llm_client.LLMClient.chat_completion", side_effect=_side_effect
        ) as mock_completion:
            with mock.patch(
                "codelicious.llm_client.LLMClient.parse_tool_calls",
                side_effect=[
                    [tool_call],  # First response has a tool call
                    [],  # Second response has none (trigger content check)
                ],
            ):
                with mock.patch("codelicious.llm_client.LLMClient.parse_content", return_value="ALL_SPECS_COMPLETE"):
                    with mock.patch(
                        "codelicious.tools.registry.ToolRegistry.dispatch",
                        side_effect=RuntimeError("disk full"),
                    ):
                        result = engine.run_build_cycle(
                            repo_path=tmp_path,
                            git_manager=mock_git_manager,
                            cache_manager=mock_cache_manager,
                            max_iterations=10,
                        )

        # The loop should continue past the failed tool call and complete successfully
        assert isinstance(result, BuildResult)
        # Recovery confirmed: the engine completed after the error (ALL_SPECS_COMPLETE path)
        assert result.success is True, f"Expected success=True after error recovery, got: {result.success!r}"
        # chat_completion was called exactly twice: once for the tool-call response,
        # once for the completion response.
        assert mock_completion.call_count == 2, f"Expected 2 chat_completion calls, got {mock_completion.call_count}"

    def test_tool_dispatch_json_decode_error_handled(
        self, tmp_path: pathlib.Path, mock_git_manager, mock_cache_manager
    ) -> None:
        """A bad JSON arguments payload is caught and an error is appended."""
        engine = HuggingFaceEngine()
        bad_tool_call = {
            "id": "call_bad",
            "function": {
                "name": "read_file",
                "arguments": "NOT VALID JSON {{{",
            },
        }
        first_response = _make_llm_response(content="")
        completion_response = _make_llm_response("ALL_SPECS_COMPLETE")

        call_count = 0

        def _side_effect(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return first_response
            return completion_response

        with mock.patch(
            "codelicious.llm_client.LLMClient.chat_completion", side_effect=_side_effect
        ) as mock_completion:
            with mock.patch(
                "codelicious.llm_client.LLMClient.parse_tool_calls",
                side_effect=[[bad_tool_call], []],
            ):
                with mock.patch("codelicious.llm_client.LLMClient.parse_content", return_value="ALL_SPECS_COMPLETE"):
                    result = engine.run_build_cycle(
                        repo_path=tmp_path,
                        git_manager=mock_git_manager,
                        cache_manager=mock_cache_manager,
                        max_iterations=10,
                    )

        # JSON decode error was handled; loop recovered and reached ALL_SPECS_COMPLETE
        assert isinstance(result, BuildResult)
        assert result.success is True, f"Expected success=True after JSON error recovery, got: {result.success!r}"
        # chat_completion called twice: first iteration (bad JSON tool call) + second (completion)
        assert mock_completion.call_count == 2, f"Expected 2 chat_completion calls, got {mock_completion.call_count}"

    def test_spec_filter_included_in_system_prompt(
        self, tmp_path: pathlib.Path, mock_git_manager, mock_cache_manager
    ) -> None:
        """When spec_filter is provided it appears in the system prompt."""
        engine = HuggingFaceEngine()
        captured_messages: list = []

        def _capture(*args, **kwargs):
            # First positional arg is messages list
            if args:
                captured_messages.extend(args[0])
            return _make_llm_response("ALL_SPECS_COMPLETE")

        with mock.patch("codelicious.llm_client.LLMClient.chat_completion", side_effect=_capture):
            with mock.patch("codelicious.llm_client.LLMClient.parse_tool_calls", return_value=[]):
                with mock.patch("codelicious.llm_client.LLMClient.parse_content", return_value="ALL_SPECS_COMPLETE"):
                    engine.run_build_cycle(
                        repo_path=tmp_path,
                        git_manager=mock_git_manager,
                        cache_manager=mock_cache_manager,
                        spec_filter="docs/specs/spec-99.md",
                        max_iterations=2,
                    )

        system_msgs = [m for m in captured_messages if m.get("role") == "system"]
        assert system_msgs, "No system message was added"
        combined = " ".join(m.get("content", "") for m in system_msgs)
        assert "spec-99.md" in combined


# ===========================================================================
# Finding 30: history truncation before each chat_completion call
# ===========================================================================


@mock.patch.dict("os.environ", {"HF_TOKEN": "hf_test_token_abc123"})
class TestHuggingFaceEngineHistoryTruncation:
    """Finding 30: truncate_history must be called before every chat_completion."""

    def test_truncate_history_called_each_iteration(
        self, tmp_path: pathlib.Path, mock_git_manager, mock_cache_manager
    ) -> None:
        """truncate_history is invoked once per iteration before the LLM call."""
        engine = HuggingFaceEngine()

        with mock.patch(
            "codelicious.engines.huggingface_engine.truncate_history",
            wraps=lambda msgs, _max: msgs,  # passthrough so loop still works
        ) as mock_truncate:
            with mock.patch(
                "codelicious.llm_client.LLMClient.chat_completion",
                return_value=_make_llm_response("ALL_SPECS_COMPLETE"),
            ):
                with mock.patch("codelicious.llm_client.LLMClient.parse_tool_calls", return_value=[]):
                    with mock.patch(
                        "codelicious.llm_client.LLMClient.parse_content", return_value="ALL_SPECS_COMPLETE"
                    ):
                        engine.run_build_cycle(
                            repo_path=tmp_path,
                            git_manager=mock_git_manager,
                            cache_manager=mock_cache_manager,
                            max_iterations=5,
                        )

        # truncate_history must be called at least once (one successful iteration)
        assert mock_truncate.call_count >= 1

    def test_truncate_history_called_on_error_iteration(
        self, tmp_path: pathlib.Path, mock_git_manager, mock_cache_manager
    ) -> None:
        """truncate_history is still called on iterations that raise an LLM error."""
        engine = HuggingFaceEngine()
        call_count = 0

        def _flaky(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise ConnectionError("transient")
            return _make_llm_response("ALL_SPECS_COMPLETE")

        with mock.patch(
            "codelicious.engines.huggingface_engine.truncate_history",
            wraps=lambda msgs, _max: msgs,
        ) as mock_truncate:
            with mock.patch("codelicious.llm_client.LLMClient.chat_completion", side_effect=_flaky):
                with mock.patch("codelicious.llm_client.LLMClient.parse_tool_calls", return_value=[]):
                    with mock.patch(
                        "codelicious.llm_client.LLMClient.parse_content", return_value="ALL_SPECS_COMPLETE"
                    ):
                        with mock.patch("time.sleep"):
                            engine.run_build_cycle(
                                repo_path=tmp_path,
                                git_manager=mock_git_manager,
                                cache_manager=mock_cache_manager,
                                max_iterations=5,
                            )

        # Two iterations ran (one error + one success), so truncate called twice
        assert mock_truncate.call_count >= 2


# ===========================================================================
# Finding 40: generic error message exposed to LLM conversation
# ===========================================================================


@mock.patch.dict("os.environ", {"HF_TOKEN": "hf_test_token_abc123"})
class TestHuggingFaceEngineSafeErrorMessage:
    """Finding 40: LLM error details must not appear in the conversation history."""

    def test_llm_error_message_in_history_is_generic(
        self, tmp_path: pathlib.Path, mock_git_manager, mock_cache_manager
    ) -> None:
        """After an LLM failure the user-role message appended is the safe generic text."""
        engine = HuggingFaceEngine()
        call_count = 0
        sensitive_detail = "HTTP 401 Unauthorized: token=sk-secret-abc123"

        def _flaky(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise RuntimeError(sensitive_detail)
            return _make_llm_response("ALL_SPECS_COMPLETE")

        captured_messages: list[dict] = []

        original_truncate = __import__("codelicious.loop_controller", fromlist=["truncate_history"]).truncate_history

        def _capturing_truncate(msgs, max_tokens):
            captured_messages.clear()
            captured_messages.extend(msgs)
            return original_truncate(msgs, max_tokens)

        with mock.patch(
            "codelicious.engines.huggingface_engine.truncate_history",
            side_effect=_capturing_truncate,
        ):
            with mock.patch("codelicious.llm_client.LLMClient.chat_completion", side_effect=_flaky):
                with mock.patch("codelicious.llm_client.LLMClient.parse_tool_calls", return_value=[]):
                    with mock.patch(
                        "codelicious.llm_client.LLMClient.parse_content", return_value="ALL_SPECS_COMPLETE"
                    ):
                        with mock.patch("time.sleep"):
                            engine.run_build_cycle(
                                repo_path=tmp_path,
                                git_manager=mock_git_manager,
                                cache_manager=mock_cache_manager,
                                max_iterations=5,
                            )

        # Collect all user-role message contents that were passed to the LLM
        all_content = " ".join(m.get("content", "") or "" for m in captured_messages if m.get("role") == "user")
        assert sensitive_detail not in all_content, "Sensitive exception detail must not appear in conversation history"
        assert "The previous API call failed. Please continue your work." in all_content
