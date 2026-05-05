"""Tests for Claude engine chunk execution interface (spec-27 Phase 7.2).

Tests execute_chunk, verify_chunk, and fix_chunk on ClaudeCodeEngine
with all subprocess calls mocked.
"""

from __future__ import annotations

import pathlib
from dataclasses import dataclass
from unittest import mock

from codelicious.engines.base import ChunkResult, EngineContext
from codelicious.engines.claude_engine import ClaudeCodeEngine


@dataclass
class FakeChunk:
    id: str = "spec-1-chunk-01"
    title: str = "Add feature"
    description: str = "Implement the feature"
    validation: str = "tests pass"


class TestClaudeExecuteChunk:
    """ClaudeCodeEngine.execute_chunk delegates to run_agent."""

    def test_successful_execution(self, tmp_path: pathlib.Path) -> None:
        engine = ClaudeCodeEngine()
        chunk = FakeChunk()
        context = EngineContext(spec_content="# Spec\n- [ ] task", deadline=0.0)

        agent_result = mock.MagicMock(success=True, elapsed_s=5.0, session_id="sess-1")

        # Mock run_agent and git diff for file collection
        diff_mock = mock.MagicMock(returncode=0, stdout="src/a.py\n")

        with mock.patch("codelicious.agent_runner.run_agent", return_value=agent_result):
            with mock.patch("subprocess.run", return_value=diff_mock):
                result = engine.execute_chunk(chunk, tmp_path, context)

        assert isinstance(result, ChunkResult)
        assert result.success is True
        assert any("a.py" in str(f) for f in result.files_modified)

    def test_agent_timeout(self, tmp_path: pathlib.Path) -> None:
        from codelicious.errors import AgentTimeout

        engine = ClaudeCodeEngine()
        chunk = FakeChunk()
        context = EngineContext(spec_content="# Spec", deadline=0.0)

        with mock.patch("codelicious.agent_runner.run_agent", side_effect=AgentTimeout("timeout")):
            result = engine.execute_chunk(chunk, tmp_path, context)

        assert result.success is False
        assert "timed out" in result.message.lower()

    def test_auth_error(self, tmp_path: pathlib.Path) -> None:
        from codelicious.errors import ClaudeAuthError

        engine = ClaudeCodeEngine()
        chunk = FakeChunk()
        context = EngineContext()

        with mock.patch("codelicious.agent_runner.run_agent", side_effect=ClaudeAuthError("no auth")):
            result = engine.execute_chunk(chunk, tmp_path, context)

        assert result.success is False

    def test_rate_limit(self, tmp_path: pathlib.Path) -> None:
        from codelicious.errors import ClaudeRateLimitError

        engine = ClaudeCodeEngine()
        chunk = FakeChunk()
        context = EngineContext()

        with mock.patch(
            "codelicious.agent_runner.run_agent",
            side_effect=ClaudeRateLimitError("429", retry_after_s=30),
        ):
            result = engine.execute_chunk(chunk, tmp_path, context)

        assert result.success is False
        assert "rate" in result.message.lower()


class TestClaudeVerifyChunk:
    """ClaudeCodeEngine.verify_chunk runs the verifier."""

    def test_all_checks_pass(self, tmp_path: pathlib.Path) -> None:
        engine = ClaudeCodeEngine()
        chunk = FakeChunk()

        mock_vresult = mock.MagicMock()
        mock_vresult.all_passed = True

        with mock.patch("codelicious.verifier.verify", return_value=mock_vresult):
            result = engine.verify_chunk(chunk, tmp_path)

        assert result.success is True

    def test_check_failure_reported(self, tmp_path: pathlib.Path) -> None:
        engine = ClaudeCodeEngine()
        chunk = FakeChunk()

        mock_check = mock.MagicMock()
        mock_check.passed = False
        mock_check.name = "lint"
        mock_check.message = "unused import"
        mock_vresult = mock.MagicMock()
        mock_vresult.all_passed = False
        mock_vresult.checks = [mock_check]

        with mock.patch("codelicious.verifier.verify", return_value=mock_vresult):
            result = engine.verify_chunk(chunk, tmp_path)

        assert result.success is False
        assert "lint" in result.message


class TestClaudeFixChunk:
    """ClaudeCodeEngine.fix_chunk spawns an agent to fix failures."""

    def test_fix_agent_succeeds(self, tmp_path: pathlib.Path) -> None:
        engine = ClaudeCodeEngine()
        chunk = FakeChunk()

        agent_result = mock.MagicMock(success=True, elapsed_s=3.0)
        diff_mock = mock.MagicMock(returncode=0, stdout="src/fixed.py\n")

        with mock.patch("codelicious.agent_runner.run_agent", return_value=agent_result):
            with mock.patch("subprocess.run", return_value=diff_mock):
                result = engine.fix_chunk(chunk, tmp_path, ["lint: unused import"])

        assert result.success is True
        assert result.retries_used == 1

    def test_fix_agent_fails(self, tmp_path: pathlib.Path) -> None:
        engine = ClaudeCodeEngine()
        chunk = FakeChunk()

        with mock.patch("codelicious.agent_runner.run_agent", side_effect=RuntimeError("agent crashed")):
            result = engine.fix_chunk(chunk, tmp_path, ["test failure"])

        assert result.success is False
        assert result.retries_used == 1


class TestClaudeExecuteChunkAdditional:
    """Additional coverage for execute_chunk edge cases."""

    def test_execute_chunk_with_previous_chunks(self, tmp_path: pathlib.Path) -> None:
        """Line 55: previous_work branch when context.previous_chunks is populated."""
        engine = ClaudeCodeEngine()
        chunk = FakeChunk()
        context = EngineContext(
            spec_content="# Spec",
            deadline=0.0,
            previous_chunks=["chunk-1 done", "chunk-2 done"],
        )

        agent_result = mock.MagicMock(success=True, elapsed_s=2.0, session_id="sess-2")
        diff_mock = mock.MagicMock(returncode=0, stdout="src/b.py\n")

        captured_prompt: list[str] = []

        def capturing_run_agent(prompt: str, **kwargs: object) -> object:
            captured_prompt.append(prompt)
            return agent_result

        with mock.patch("codelicious.agent_runner.run_agent", side_effect=capturing_run_agent):
            with mock.patch("subprocess.run", return_value=diff_mock):
                result = engine.execute_chunk(chunk, tmp_path, context)

        assert result.success is True
        assert len(captured_prompt) == 1
        assert "- chunk-1 done" in captured_prompt[0]
        assert "- chunk-2 done" in captured_prompt[0]
        # The "(none — this is the first chunk)" text must NOT appear
        assert "(none" not in captured_prompt[0]

    def test_execute_chunk_generic_exception(self, tmp_path: pathlib.Path) -> None:
        """Lines 103-105: general Exception handler returns success=False."""
        engine = ClaudeCodeEngine()
        chunk = FakeChunk()
        context = EngineContext(spec_content="# Spec", deadline=0.0)

        with mock.patch("codelicious.agent_runner.run_agent", side_effect=RuntimeError("unexpected boom")):
            result = engine.execute_chunk(chunk, tmp_path, context)

        assert result.success is False
        assert "unexpected boom" in result.message

    def test_execute_chunk_git_diff_exception(self, tmp_path: pathlib.Path) -> None:
        """Lines 139-141: subprocess.run raises after agent succeeds; returns success=True with empty files."""
        engine = ClaudeCodeEngine()
        chunk = FakeChunk()
        context = EngineContext(spec_content="# Spec", deadline=0.0)

        agent_result = mock.MagicMock(success=True, elapsed_s=1.0, session_id="sess-3")

        with mock.patch("codelicious.agent_runner.run_agent", return_value=agent_result):
            with mock.patch("subprocess.run", side_effect=OSError("git not found")):
                result = engine.execute_chunk(chunk, tmp_path, context)

        assert result.success is True
        assert result.files_modified == []


class TestClaudeVerifyChunkAdditional:
    """Additional coverage for verify_chunk exception paths."""

    def test_verify_chunk_import_error(self, tmp_path: pathlib.Path) -> None:
        """Lines 174-175: ImportError causes verify to be skipped, returns success=True."""
        engine = ClaudeCodeEngine()
        chunk = FakeChunk()

        with mock.patch("codelicious.verifier.verify", side_effect=ImportError("no module")):
            result = engine.verify_chunk(chunk, tmp_path)

        assert result.success is True
        assert "skipped" in result.message.lower() or "not available" in result.message.lower()

    def test_verify_chunk_generic_exception(self, tmp_path: pathlib.Path) -> None:
        """Lines 176-178: general Exception returns success=False."""
        engine = ClaudeCodeEngine()
        chunk = FakeChunk()

        with mock.patch("codelicious.verifier.verify", side_effect=RuntimeError("verifier exploded")):
            result = engine.verify_chunk(chunk, tmp_path)

        assert result.success is False
        assert "verifier exploded" in result.message


class TestClaudeFixChunkAdditional:
    """Additional coverage for fix_chunk git diff exception path."""

    def test_fix_chunk_git_diff_exception(self, tmp_path: pathlib.Path) -> None:
        """Lines 244-245: subprocess.run raises after fix agent succeeds; returns result with empty files."""
        engine = ClaudeCodeEngine()
        chunk = FakeChunk()

        agent_result = mock.MagicMock(success=True, elapsed_s=2.0)

        with mock.patch("codelicious.agent_runner.run_agent", return_value=agent_result):
            with mock.patch("subprocess.run", side_effect=OSError("git not found")):
                result = engine.fix_chunk(chunk, tmp_path, ["lint: unused import"])

        assert result.success is True
        assert result.files_modified == []
        assert result.retries_used == 1
