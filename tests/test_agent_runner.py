"""Tests for agent_runner.py - subprocess management for Claude Code CLI.

These tests cover prompt sanitization (P1-11) and timeout behavior (P2-10).
"""

from __future__ import annotations

import pathlib
from unittest.mock import MagicMock, patch

import pytest

from codelicious.agent_runner import (
    AgentResult,
    _MAX_PROMPT_LENGTH,
    _POLL_INTERVAL_S,
    _sanitize_prompt,
    run_agent,
)
from codelicious.errors import ClaudeAuthError


class TestPromptSanitization:
    """Tests for _sanitize_prompt function (P1-11 fix)."""

    def test_prompt_null_bytes_stripped(self) -> None:
        """Null bytes in prompt should be stripped."""
        prompt = "Hello\x00World\x00Test"
        sanitized = _sanitize_prompt(prompt)
        assert "\x00" not in sanitized
        assert sanitized == "HelloWorldTest"

    def test_prompt_length_capped(self) -> None:
        """Prompts exceeding max length should be truncated."""
        long_prompt = "x" * (_MAX_PROMPT_LENGTH + 5000)
        sanitized = _sanitize_prompt(long_prompt)
        assert len(sanitized) == _MAX_PROMPT_LENGTH
        assert sanitized == "x" * _MAX_PROMPT_LENGTH

    def test_prompt_length_capped_logs_warning(self, caplog: pytest.LogCaptureFixture) -> None:
        """Prompt truncation should log a warning."""
        long_prompt = "x" * (_MAX_PROMPT_LENGTH + 100)
        with caplog.at_level("WARNING"):
            _sanitize_prompt(long_prompt)
        assert "truncated" in caplog.text.lower()

    def test_prompt_starting_with_dash_prefixed(self) -> None:
        """Prompts starting with dash should be prefixed with '-- '."""
        prompt = "--flag value"
        sanitized = _sanitize_prompt(prompt)
        assert sanitized == "-- --flag value"

    def test_prompt_starting_with_dash_after_whitespace_prefixed(self) -> None:
        """Prompts with leading whitespace then dash should be prefixed."""
        prompt = "  -p somevalue"
        sanitized = _sanitize_prompt(prompt)
        assert sanitized == "--   -p somevalue"

    def test_normal_prompt_passed_unchanged(self) -> None:
        """Regular prompts should not be modified."""
        prompt = "Build a REST API for user management"
        sanitized = _sanitize_prompt(prompt)
        assert sanitized == prompt

    def test_prompt_at_max_length_accepted(self) -> None:
        """Prompts exactly at max length should be accepted without truncation."""
        prompt = "x" * _MAX_PROMPT_LENGTH
        sanitized = _sanitize_prompt(prompt)
        assert len(sanitized) == _MAX_PROMPT_LENGTH
        assert sanitized == prompt

    def test_empty_prompt_handled(self) -> None:
        """Empty prompts should be handled gracefully."""
        sanitized = _sanitize_prompt("")
        assert sanitized == ""

    def test_prompt_with_only_null_bytes(self) -> None:
        """Prompts containing only null bytes become empty."""
        prompt = "\x00\x00\x00"
        sanitized = _sanitize_prompt(prompt)
        assert sanitized == ""

    def test_prompt_with_newlines_preserved(self) -> None:
        """Newlines in prompt should be preserved (they're valid in prompts)."""
        prompt = "Line 1\nLine 2\nLine 3"
        sanitized = _sanitize_prompt(prompt)
        assert sanitized == prompt


class TestTimeoutBehavior:
    """Tests for timeout enforcement (P2-10 fix)."""

    def test_poll_interval_is_100ms(self) -> None:
        """Polling interval should be 0.1s (100ms) for precise timeout.

        The key fix for P2-10 is reducing the polling interval from 1.0s to 0.1s.
        This ensures timeout overrun is at most 100ms instead of up to 1 second.
        """
        assert _POLL_INTERVAL_S == 0.1, "Polling interval should be 0.1s for precise timeout"

    def test_poll_interval_bounds_max_overrun(self) -> None:
        """Maximum timeout overrun is bounded by poll interval.

        With a 0.1s poll interval, the worst case timeout overrun is 0.1s plus
        thread scheduling overhead. This is a significant improvement over the
        original 1.0s interval which could overrun by up to 1 second.
        """
        # The math: if timeout=10s and we check every 0.1s, worst case is
        # we check at 9.95s (under), then next check at 10.05s (over).
        # So overrun is at most poll_interval.
        max_overrun = _POLL_INTERVAL_S
        assert max_overrun <= 0.1, "Max overrun should be at most 100ms"


class TestDryRunMode:
    """Tests for dry-run mode."""

    def test_dry_run_returns_success_without_subprocess(self) -> None:
        """Dry-run mode should return success without invoking subprocess."""
        config = MagicMock()
        config.dry_run = True

        result = run_agent(
            prompt="Test prompt",
            project_root=pathlib.Path("."),
            config=config,
        )

        assert isinstance(result, AgentResult)
        assert result.success is True
        assert result.output == "[dry run]"


class TestClaudeBinaryDiscovery:
    """Tests for claude binary discovery."""

    @patch("codelicious.agent_runner.shutil.which")
    def test_missing_claude_binary_raises_auth_error(self, mock_which: MagicMock) -> None:
        """Missing claude binary should raise ClaudeAuthError with helpful message."""
        mock_which.return_value = None

        config = MagicMock()
        config.dry_run = False

        with pytest.raises(ClaudeAuthError) as exc_info:
            run_agent(
                prompt="Test prompt",
                project_root=pathlib.Path("."),
                config=config,
            )

        assert "claude CLI not found" in str(exc_info.value)


class TestIntegration:
    """Integration tests for the full agent runner flow."""

    @patch("codelicious.agent_runner.shutil.which")
    @patch("codelicious.agent_runner.subprocess.Popen")
    def test_sanitized_prompt_passed_to_subprocess(
        self,
        mock_popen: MagicMock,
        mock_which: MagicMock,
    ) -> None:
        """Verify sanitized prompt is used in subprocess command."""
        mock_which.return_value = "/usr/bin/claude"

        # Set up mock process that exits quickly
        mock_proc = MagicMock()
        mock_proc.pid = 12345
        mock_proc.poll.return_value = 0
        mock_proc.returncode = 0
        mock_proc.wait.return_value = 0
        mock_proc.stdout.__iter__ = MagicMock(return_value=iter([]))
        mock_proc.stderr.__iter__ = MagicMock(return_value=iter([]))
        mock_popen.return_value = mock_proc

        config = MagicMock()
        config.dry_run = False
        config.model = ""
        config.effort = ""
        config.max_turns = 0
        config.agent_timeout_s = 60

        # Prompt starting with dash should be prefixed
        prompt = "--dangerous-flag"
        run_agent(
            prompt=prompt,
            project_root=pathlib.Path("."),
            config=config,
        )

        # Check that Popen was called with the prefixed prompt
        call_args = mock_popen.call_args
        cmd = call_args[0][0]  # First positional arg is the command list

        # Find the prompt in the command (after -p)
        p_index = cmd.index("-p")
        actual_prompt = cmd[p_index + 1]
        assert actual_prompt == "-- --dangerous-flag"
