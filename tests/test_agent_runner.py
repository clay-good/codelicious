"""Tests for agent_runner.py - subprocess management for Claude Code CLI.

These tests cover prompt sanitization (P1-11) and timeout behavior (P2-10).
"""

from __future__ import annotations

import pathlib
from unittest.mock import MagicMock, patch

import pytest

from codelicious.agent_runner import (
    FORBIDDEN_CLI_FLAGS,
    AgentResult,
    _MAX_PROMPT_LENGTH,
    _POLL_INTERVAL_S,
    _build_agent_command,
    _check_agent_errors,
    _enforce_timeout,
    _parse_agent_output,
    _process_stream_event,
    _sanitize_prompt,
    _validate_command_flags,
    run_agent,
)
from codelicious.errors import (
    AgentTimeout,
    ClaudeAuthError,
    ClaudeRateLimitError,
    CodeliciousError,
    PolicyViolationError,
)


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

    def test_enforce_timeout_calls_terminate_and_raises_when_elapsed_exceeds_timeout(self) -> None:
        """_enforce_timeout should call proc.terminate() and raise AgentTimeout when elapsed >= timeout."""
        mock_proc = MagicMock()
        mock_proc.pid = 42
        mock_proc.wait.return_value = 0  # immediate exit after terminate

        with pytest.raises(AgentTimeout) as exc_info:
            _enforce_timeout(mock_proc, elapsed=61.0, timeout=60.0)

        mock_proc.terminate.assert_called_once()
        assert exc_info.value.elapsed_s == 61.0
        assert "60" in str(exc_info.value)

    def test_enforce_timeout_raises_when_elapsed_equals_timeout(self) -> None:
        """_enforce_timeout should raise AgentTimeout when elapsed == timeout (boundary: >= check)."""
        mock_proc = MagicMock()
        mock_proc.pid = 42
        mock_proc.wait.return_value = 0

        with pytest.raises(AgentTimeout):
            _enforce_timeout(mock_proc, elapsed=60.0, timeout=60.0)

        mock_proc.terminate.assert_called_once()

    def test_enforce_timeout_does_not_raise_when_under_limit(self) -> None:
        """_enforce_timeout should be a no-op when elapsed < timeout."""
        mock_proc = MagicMock()
        mock_proc.pid = 42

        # Should not raise, not call terminate
        _enforce_timeout(mock_proc, elapsed=59.9, timeout=60.0)

        mock_proc.terminate.assert_not_called()

    def test_enforce_timeout_kills_when_terminate_times_out(self) -> None:
        """_enforce_timeout should call proc.kill() if proc.wait() times out after terminate."""
        import subprocess as _subprocess

        mock_proc = MagicMock()
        mock_proc.pid = 99
        # First wait (after terminate) times out; second wait (after kill) succeeds
        mock_proc.wait.side_effect = [_subprocess.TimeoutExpired(cmd="test", timeout=5), 0]

        with pytest.raises(AgentTimeout):
            _enforce_timeout(mock_proc, elapsed=100.0, timeout=10.0)

        mock_proc.terminate.assert_called_once()
        mock_proc.kill.assert_called_once()


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

        # Set up mock process that runs for a few poll iterations before exiting
        mock_proc = MagicMock()
        mock_proc.pid = 12345
        # Return None (still running) twice, then 0 (exited) to exercise the poll loop
        mock_proc.poll.side_effect = [None, None, 0]
        mock_proc.returncode = 0
        mock_proc.wait.return_value = 0
        mock_proc.stdout = iter([])
        mock_proc.stderr = iter([])
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


class TestDangerousFlagNeverPresent:
    """Tests for S20-P1-3: --dangerously-skip-permissions is permanently removed."""

    def test_flag_not_in_command_default_config(self, tmp_path: pathlib.Path) -> None:
        """Default config must never include --dangerously-skip-permissions."""
        import types

        from codelicious.agent_runner import _build_agent_command

        config = types.SimpleNamespace(model="", effort="", max_turns=0)
        cmd = _build_agent_command("test", tmp_path, config, "claude")
        assert "--dangerously-skip-permissions" not in cmd

    def test_flag_not_in_command_even_with_allow_dangerous(self, tmp_path: pathlib.Path) -> None:
        """Even config.allow_dangerous=True must NOT add the flag (S20-P1-3)."""
        import types

        from codelicious.agent_runner import _build_agent_command

        config = types.SimpleNamespace(allow_dangerous=True, model="", effort="", max_turns=0)
        cmd = _build_agent_command("test", tmp_path, config, "claude")
        assert "--dangerously-skip-permissions" not in cmd

    def test_flag_not_in_command_even_with_env_var(self, tmp_path: pathlib.Path) -> None:
        """Even CODELICIOUS_ALLOW_DANGEROUS env var must NOT add the flag (S20-P1-3)."""
        import types

        from codelicious.agent_runner import _build_agent_command

        config = types.SimpleNamespace(model="", effort="", max_turns=0)
        with patch.dict("os.environ", {"CODELICIOUS_ALLOW_DANGEROUS": "I-UNDERSTAND-THE-RISKS"}):
            cmd = _build_agent_command("test", tmp_path, config, "claude")
        assert "--dangerously-skip-permissions" not in cmd


class TestCheckAgentErrors:
    """Unit tests for _check_agent_errors (Finding 46)."""

    def test_returncode_zero_does_not_raise(self) -> None:
        """Return code 0 should not raise any exception."""
        # Should complete without raising and return None
        assert _check_agent_errors(0, ["some stdout\n"], ["some stderr\n"]) is None

    def test_auth_in_stderr_raises_claude_auth_error(self) -> None:
        """'auth' in stderr should raise ClaudeAuthError."""
        with pytest.raises(ClaudeAuthError) as exc_info:
            _check_agent_errors(1, [], ["Authentication failed\n"])
        assert "authentication" in str(exc_info.value).lower()

    def test_auth_case_insensitive_in_stderr(self) -> None:
        """'AUTH' (uppercase) in stderr should also raise ClaudeAuthError."""
        with pytest.raises(ClaudeAuthError):
            _check_agent_errors(1, [], ["AUTH token invalid\n"])

    def test_rate_limit_in_combined_output_raises_rate_limit_error(self) -> None:
        """'rate limit' appearing in either stdout or stderr should raise ClaudeRateLimitError."""
        with pytest.raises(ClaudeRateLimitError):
            _check_agent_errors(1, ["rate limit exceeded\n"], [])

    def test_rate_limit_in_stderr_raises_rate_limit_error(self) -> None:
        """'rate limit' in stderr should raise ClaudeRateLimitError."""
        with pytest.raises(ClaudeRateLimitError):
            _check_agent_errors(1, [], ["You have hit your rate limit.\n"])

    def test_rate_limit_error_has_retry_after(self) -> None:
        """ClaudeRateLimitError should carry a retry_after_s attribute."""
        with pytest.raises(ClaudeRateLimitError) as exc_info:
            _check_agent_errors(1, [], ["rate limit\n"])
        assert exc_info.value.retry_after_s > 0

    def test_generic_non_zero_exit_raises_codelicious_error(self) -> None:
        """A non-zero exit code with no specific keyword should raise CodeliciousError."""
        with pytest.raises(CodeliciousError) as exc_info:
            _check_agent_errors(2, [], ["some unrecognized error\n"])
        # Should not be the more specific subtypes
        assert not isinstance(exc_info.value, ClaudeAuthError)
        assert not isinstance(exc_info.value, ClaudeRateLimitError)
        assert "2" in str(exc_info.value)  # exit code appears in message

    def test_exit_code_in_error_message(self) -> None:
        """The error message for generic failure should mention the exit code."""
        with pytest.raises(CodeliciousError) as exc_info:
            _check_agent_errors(127, [], ["command not found\n"])
        assert "127" in str(exc_info.value)


# ---------------------------------------------------------------------------
# Finding 21 — _check_agent_errors error-type dispatch
# ---------------------------------------------------------------------------


class TestCheckAgentErrorsF21:
    """Finding 21: precise error-type dispatch in _check_agent_errors.

    Covers the three dispatch branches with the exact textual patterns
    described in the finding: 'auth failed', 'rate limit', and a generic
    non-zero exit for which neither auth nor rate-limit patterns appear.
    """

    def test_auth_failed_in_stderr_raises_claude_auth_error(self) -> None:
        """'auth failed' in stderr (contains 'auth') triggers ClaudeAuthError."""
        with pytest.raises(ClaudeAuthError) as exc_info:
            _check_agent_errors(1, [], ["auth failed\n"])
        assert "authentication" in str(exc_info.value).lower()

    def test_auth_failed_message_mentions_authentication(self) -> None:
        """ClaudeAuthError message should mention authentication."""
        with pytest.raises(ClaudeAuthError) as exc_info:
            _check_agent_errors(1, [], ["auth failed\n"])
        assert "authentication" in str(exc_info.value).lower()

    def test_rate_limit_phrase_raises_rate_limit_error(self) -> None:
        """'rate limit' in stderr raises ClaudeRateLimitError."""
        with pytest.raises(ClaudeRateLimitError):
            _check_agent_errors(1, [], ["rate limit hit\n"])

    def test_rate_limit_error_retry_after_is_60(self) -> None:
        """ClaudeRateLimitError.retry_after_s must be exactly 60 seconds."""
        with pytest.raises(ClaudeRateLimitError) as exc_info:
            _check_agent_errors(1, [], ["rate limit exceeded\n"])
        assert exc_info.value.retry_after_s == 60.0

    def test_rate_limit_not_in_auth_branch(self) -> None:
        """'rate limit' must not trigger ClaudeAuthError — it goes to rate-limit branch."""
        with pytest.raises(ClaudeRateLimitError):
            _check_agent_errors(1, [], ["rate limit exceeded\n"])

    def test_generic_error_raises_codelicious_error_not_subtype(self) -> None:
        """Generic non-zero exit raises CodeliciousError but not auth or rate-limit subtype."""
        with pytest.raises(CodeliciousError) as exc_info:
            _check_agent_errors(1, [], ["some generic failure\n"])
        assert not isinstance(exc_info.value, ClaudeAuthError)
        assert not isinstance(exc_info.value, ClaudeRateLimitError)

    def test_generic_error_exit_code_in_message(self) -> None:
        """Generic CodeliciousError message must include the exit code."""
        with pytest.raises(CodeliciousError) as exc_info:
            _check_agent_errors(3, [], ["unknown problem\n"])
        assert "3" in str(exc_info.value)

    def test_returncode_zero_never_raises(self) -> None:
        """Returncode 0 must return cleanly even if stderr contains 'auth'."""
        # auth in stderr is irrelevant when returncode is 0
        assert _check_agent_errors(0, [], ["auth failed somehow\n"]) is None


class TestParseAgentOutput:
    """Unit tests for _parse_agent_output (Finding 46)."""

    def test_success_returns_agent_result(self) -> None:
        """Successful output (returncode=0) returns an AgentResult with success=True."""
        result = _parse_agent_output(["hello\n"], [], 0)
        assert isinstance(result, AgentResult)
        assert result.success is True

    def test_session_id_extracted_from_init_event(self) -> None:
        """Session ID is extracted from a stream-json system/init event."""
        import json

        init_event = json.dumps(
            {
                "type": "system",
                "subtype": "init",
                "session_id": "sess-abc123",
            }
        )
        result = _parse_agent_output([init_event + "\n"], [], 0)
        assert result.session_id == "sess-abc123"

    def test_session_id_empty_when_no_init_event(self) -> None:
        """Session ID is empty string when no system/init event is present."""
        result = _parse_agent_output(["plain text output\n"], [], 0)
        assert result.session_id == ""

    def test_non_zero_returncode_raises(self) -> None:
        """Non-zero returncode causes _check_agent_errors to raise."""
        with pytest.raises(CodeliciousError):
            _parse_agent_output([], ["error\n"], 1)

    def test_output_captured_in_result(self) -> None:
        """All stdout lines are joined into the result output field."""
        result = _parse_agent_output(["line1\n", "line2\n"], [], 0)
        assert "line1" in result.output
        assert "line2" in result.output

    def test_elapsed_s_defaults_to_zero(self) -> None:
        """elapsed_s is initialized to 0.0 — caller is expected to set it."""
        result = _parse_agent_output([], [], 0)
        assert result.elapsed_s == 0.0

    def test_invalid_json_lines_are_skipped(self) -> None:
        """Lines that are not valid JSON do not prevent session ID extraction."""
        import json

        init_event = json.dumps({"type": "system", "subtype": "init", "session_id": "sess-xyz"})
        lines = ["not json at all\n", init_event + "\n", "also not json\n"]
        result = _parse_agent_output(lines, [], 0)
        assert result.session_id == "sess-xyz"


# ---------------------------------------------------------------------------
# Finding 72 — _parse_agent_output session extraction
# ---------------------------------------------------------------------------


class TestParseAgentOutputSessionExtraction:
    """Finding 72: session_id extraction paths in _parse_agent_output."""

    def test_session_id_extracted_from_system_init_event(self) -> None:
        """Passing a stream-json system/init event causes the session_id to be set."""
        import json

        init_event = json.dumps(
            {
                "type": "system",
                "subtype": "init",
                "session_id": "ses-f72-abc",
            }
        )
        result = _parse_agent_output([init_event + "\n"], [], 0)
        assert result.session_id == "ses-f72-abc"

    def test_empty_stdout_returns_success_with_empty_session_id(self) -> None:
        """Empty stdout produces a successful AgentResult with an empty session_id."""
        result = _parse_agent_output([], [], 0)
        assert result.success is True
        assert result.session_id == ""

    def test_non_init_system_event_does_not_populate_session_id(self) -> None:
        """A 'system' event whose subtype is not 'init' must not set session_id."""
        import json

        other_event = json.dumps({"type": "system", "subtype": "other", "session_id": "should-not-appear"})
        result = _parse_agent_output([other_event + "\n"], [], 0)
        assert result.session_id == ""

    def test_session_id_from_first_init_event_wins(self) -> None:
        """When multiple init events appear, the first one's session_id is used."""
        import json

        first = json.dumps({"type": "system", "subtype": "init", "session_id": "first-id"})
        second = json.dumps({"type": "system", "subtype": "init", "session_id": "second-id"})
        result = _parse_agent_output([first + "\n", second + "\n"], [], 0)
        assert result.session_id == "first-id"


# ---------------------------------------------------------------------------
# Finding 73 — run_agent project_root validation
# ---------------------------------------------------------------------------


class TestRunAgentProjectRootValidation:
    """Finding 73: run_agent raises CodeliciousError for non-existent project_root."""

    def test_nonexistent_project_root_raises_codelicious_error(self, tmp_path: pathlib.Path) -> None:
        """Calling run_agent with a path that does not exist raises CodeliciousError."""
        nonexistent = tmp_path / "no_such_dir"
        config = MagicMock()
        config.dry_run = False

        with pytest.raises(CodeliciousError, match="does not exist or is not a directory"):
            run_agent(prompt="test", project_root=nonexistent, config=config)

    def test_file_path_as_project_root_raises_codelicious_error(self, tmp_path: pathlib.Path) -> None:
        """Passing a file path (not a directory) as project_root raises CodeliciousError."""
        a_file = tmp_path / "somefile.txt"
        a_file.write_text("content", encoding="utf-8")
        config = MagicMock()
        config.dry_run = False

        with pytest.raises(CodeliciousError, match="does not exist or is not a directory"):
            run_agent(prompt="test", project_root=a_file, config=config)

    def test_regular_file_as_project_root_raises_codelicious_error(self, tmp_path: pathlib.Path) -> None:
        """Passing a regular file (not a directory) as project_root raises CodeliciousError."""
        myfile = tmp_path / "myfile.txt"
        myfile.write_text("content", encoding="utf-8")
        config = MagicMock()
        config.dry_run = False

        with pytest.raises(CodeliciousError):
            run_agent(prompt="test", project_root=myfile, config=config)

    def test_valid_project_root_does_not_raise_validation_error(self, tmp_path: pathlib.Path) -> None:
        """An existing directory does not raise at the validation step (dry_run avoids subprocess)."""
        config = MagicMock()
        config.dry_run = True  # Use dry_run to short-circuit subprocess

        result = run_agent(prompt="hello", project_root=tmp_path, config=config)
        assert result.success is True


# ---------------------------------------------------------------------------
# Findings 8 and 68 — _process_stream_event unit tests
# ---------------------------------------------------------------------------


class TestProcessStreamEvent:
    """Findings 8 and 68: _process_stream_event correctly parses stream-json events."""

    def test_process_stream_event_assistant_text(self) -> None:
        """Assistant event with a text block returns the text as display and empty session_id."""
        event = {"type": "assistant", "message": {"content": [{"type": "text", "text": "Hello world"}]}}
        sid, display = _process_stream_event(event)
        assert sid == ""
        assert display == "Hello world"

    def test_process_stream_event_tool_use(self) -> None:
        """Assistant event with a tool_use block includes the tool name in display."""
        event = {"type": "assistant", "message": {"content": [{"type": "tool_use", "name": "read_file"}]}}
        sid, display = _process_stream_event(event)
        assert "[tool_use: read_file]" in display

    def test_process_stream_event_system_init(self) -> None:
        """System init event returns the session_id and empty display text."""
        event = {"type": "system", "subtype": "init", "session_id": "sess-abc-123"}
        sid, display = _process_stream_event(event)
        assert sid == "sess-abc-123"

    def test_process_stream_event_unknown_type(self) -> None:
        """Unknown event type returns empty strings for both session_id and display."""
        event = {"type": "unknown_event_xyz"}
        sid, display = _process_stream_event(event)
        assert sid == ""
        assert display == ""


# ---------------------------------------------------------------------------
# Finding 67 — _build_agent_command resume_session_id branch
# ---------------------------------------------------------------------------


class TestBuildAgentCommandResumeSession:
    """Finding 67: _build_agent_command includes --resume <id> when resume_session_id is set."""

    def test_resume_session_id_adds_resume_flag(self, tmp_path: pathlib.Path) -> None:
        """Passing resume_session_id='sess-123' must add '--resume' and 'sess-123' to command."""
        import types

        from codelicious.agent_runner import _build_agent_command

        config = types.SimpleNamespace(allow_dangerous=False, model="", effort="", max_turns=0)
        cmd = _build_agent_command("prompt text", tmp_path, config, "claude", resume_session_id="sess-123")

        assert "--resume" in cmd
        resume_index = cmd.index("--resume")
        assert cmd[resume_index + 1] == "sess-123"

    def test_no_resume_session_id_omits_resume_flag(self, tmp_path: pathlib.Path) -> None:
        """When resume_session_id is empty, '--resume' must not appear in the command."""
        import types

        from codelicious.agent_runner import _build_agent_command

        config = types.SimpleNamespace(allow_dangerous=False, model="", effort="", max_turns=0)
        cmd = _build_agent_command("prompt text", tmp_path, config, "claude")

        assert "--resume" not in cmd


# ---------------------------------------------------------------------------
# Finding 69 — run_agent finally block process cleanup
# ---------------------------------------------------------------------------


class TestRunAgentFinallyCleanup:
    """Finding 69: run_agent finally block terminates a still-running process."""

    @patch("codelicious.agent_runner.shutil.which")
    @patch("codelicious.agent_runner.subprocess.Popen")
    def test_finally_terminates_running_process(
        self,
        mock_popen: MagicMock,
        mock_which: MagicMock,
        tmp_path: pathlib.Path,
    ) -> None:
        """When proc.poll() returns None in finally, proc.terminate() must be called."""
        import subprocess as _subprocess
        import types

        mock_which.return_value = "/usr/bin/claude"

        mock_proc = MagicMock()
        mock_proc.pid = 55555

        # poll() sequence:
        #   - First two calls from the main loop: None (running), then 0 (exited) — exits loop cleanly.
        #   - Call inside the finally block: None (still running) — triggers terminate path.
        mock_proc.poll.side_effect = [None, 0, None]
        mock_proc.returncode = 0

        # proc.wait inside finally: first call (after terminate) times out; second succeeds.
        mock_proc.wait.side_effect = [
            _subprocess.TimeoutExpired(cmd="claude", timeout=10),  # terminate wait times out
            0,  # kill wait succeeds
            0,  # final proc.wait after the loop
        ]

        mock_proc.stdout.__iter__ = MagicMock(return_value=iter([]))
        mock_proc.stderr.__iter__ = MagicMock(return_value=iter([]))
        mock_popen.return_value = mock_proc

        config = types.SimpleNamespace(
            dry_run=False,
            model="",
            effort="",
            max_turns=0,
            agent_timeout_s=60,
            allow_dangerous=False,
        )

        # run_agent should complete without raising (returncode=0 after process exit)
        result = run_agent(prompt="test", project_root=tmp_path, config=config)

        assert result.success is True
        mock_proc.terminate.assert_called()
        mock_proc.kill.assert_called()


# ---------------------------------------------------------------------------
# Finding 12 — run_agent() main event loop integration coverage
# ---------------------------------------------------------------------------


class TestRunAgentMainEventLoop:
    """Finding 12: exercise the main event loop body in run_agent().

    The stdout_queue consumer path (lines that drive JSON parsing, tee_to
    writes, session-ID extraction, and the 50-line progress logger) was
    previously untouched by any test.  These tests feed real line data
    through the mocked Popen stdout iterator so that the drainer thread
    populates the queue and the loop body processes it.
    """

    @patch("codelicious.agent_runner.shutil.which")
    @patch("codelicious.agent_runner.subprocess.Popen")
    def test_json_event_processing_session_id_and_tee(
        self,
        mock_popen: MagicMock,
        mock_which: MagicMock,
        tmp_path: pathlib.Path,
    ) -> None:
        """JSON events are parsed: session_id extracted, display text written to tee_to.

        The stdout iterator yields a system/init event followed by an assistant
        text event.  After run_agent() returns the result session_id must equal
        the one in the init event and tee_to must contain the assistant text.
        """
        import io
        import json
        import types

        mock_which.return_value = "/usr/bin/claude"

        init_line = json.dumps({"type": "system", "subtype": "init", "session_id": "sess-test-123"}) + "\n"
        assistant_line = (
            json.dumps(
                {
                    "type": "assistant",
                    "message": {"content": [{"type": "text", "text": "Hello from agent"}]},
                }
            )
            + "\n"
        )

        mock_proc = MagicMock()
        mock_proc.pid = 12345
        mock_proc.poll.side_effect = [None, None, 0]
        mock_proc.returncode = 0
        mock_proc.wait.return_value = 0
        mock_proc.stdout.__iter__ = MagicMock(return_value=iter([init_line, assistant_line]))
        mock_proc.stderr.__iter__ = MagicMock(return_value=iter([]))
        mock_popen.return_value = mock_proc

        config = types.SimpleNamespace(
            dry_run=False,
            model="",
            effort="",
            max_turns=0,
            agent_timeout_s=60,
            allow_dangerous=False,
        )

        tee = io.StringIO()
        result = run_agent(
            prompt="test prompt",
            project_root=tmp_path,
            config=config,
            tee_to=tee,
        )

        assert result.session_id == "sess-test-123"
        tee_contents = tee.getvalue()
        assert "Hello from agent" in tee_contents

    @patch("codelicious.agent_runner.shutil.which")
    @patch("codelicious.agent_runner.subprocess.Popen")
    def test_plain_text_line_written_to_tee(
        self,
        mock_popen: MagicMock,
        mock_which: MagicMock,
        tmp_path: pathlib.Path,
    ) -> None:
        """Non-JSON stdout lines are forwarded verbatim to tee_to.

        When a line cannot be parsed as JSON the loop falls through to the
        except branch and writes the raw line to tee_to.
        """
        import io
        import types

        mock_which.return_value = "/usr/bin/claude"

        plain_lines = ["plain text output\n", "another plain line\n"]

        mock_proc = MagicMock()
        mock_proc.pid = 22222
        mock_proc.poll.side_effect = [None, None, 0]
        mock_proc.returncode = 0
        mock_proc.wait.return_value = 0
        mock_proc.stdout.__iter__ = MagicMock(return_value=iter(plain_lines))
        mock_proc.stderr.__iter__ = MagicMock(return_value=iter([]))
        mock_popen.return_value = mock_proc

        config = types.SimpleNamespace(
            dry_run=False,
            model="",
            effort="",
            max_turns=0,
            agent_timeout_s=60,
            allow_dangerous=False,
        )

        tee = io.StringIO()
        result = run_agent(
            prompt="test prompt",
            project_root=tmp_path,
            config=config,
            tee_to=tee,
        )

        assert result.success is True
        tee_contents = tee.getvalue()
        assert "plain text output" in tee_contents
        assert "another plain line" in tee_contents

    @patch("codelicious.agent_runner.shutil.which")
    @patch("codelicious.agent_runner.subprocess.Popen")
    def test_run_agent_handles_none_stderr(
        self,
        mock_popen: MagicMock,
        mock_which: MagicMock,
        tmp_path: pathlib.Path,
    ) -> None:
        """REV-P1-1: No AssertionError when proc.stderr is None."""
        import types

        mock_which.return_value = "/usr/bin/claude"

        mock_proc = MagicMock()
        mock_proc.stderr = None
        mock_proc.stdout.__iter__ = MagicMock(return_value=iter(["output line\n"]))
        mock_proc.pid = 12345
        mock_proc.poll.side_effect = [None, None, 0]
        mock_proc.wait.return_value = 0
        mock_proc.returncode = 0
        mock_popen.return_value = mock_proc

        config = types.SimpleNamespace(
            dry_run=False,
            model="",
            effort="",
            max_turns=0,
            agent_timeout_s=5,
            allow_dangerous=False,
        )

        # Should not raise AssertionError
        result = run_agent(
            prompt="test",
            project_root=tmp_path,
            config=config,
        )
        assert result is not None

    @patch("codelicious.agent_runner.shutil.which")
    @patch("codelicious.agent_runner.subprocess.Popen")
    def test_progress_logging_every_50_lines(
        self,
        mock_popen: MagicMock,
        mock_which: MagicMock,
        tmp_path: pathlib.Path,
        caplog: pytest.LogCaptureFixture,
    ) -> None:
        """51 stdout lines trigger the every-50-lines debug log and complete without error.

        The loop body increments output_lines and logs at DEBUG level when
        len(output_lines) % 50 == 0.  Feeding 51 lines exercises that branch
        once (at line 50) and confirms the loop handles the full batch.
        """
        import types

        mock_which.return_value = "/usr/bin/claude"

        lines = [f"line {i}\n" for i in range(51)]

        mock_proc = MagicMock()
        mock_proc.pid = 33333
        mock_proc.poll.side_effect = [None, None, 0]
        mock_proc.returncode = 0
        mock_proc.wait.return_value = 0
        mock_proc.stdout.__iter__ = MagicMock(return_value=iter(lines))
        mock_proc.stderr.__iter__ = MagicMock(return_value=iter([]))
        mock_popen.return_value = mock_proc

        config = types.SimpleNamespace(
            dry_run=False,
            model="",
            effort="",
            max_turns=0,
            agent_timeout_s=60,
            allow_dangerous=False,
        )

        with caplog.at_level("DEBUG", logger="codelicious.agent_runner"):
            result = run_agent(
                prompt="test prompt",
                project_root=tmp_path,
                config=config,
            )

        assert result.success is True
        # The 50th line triggers the progress log
        progress_records = [r for r in caplog.records if "lines processed" in r.message]
        assert len(progress_records) >= 1
        assert "50" in progress_records[0].message


# ---------------------------------------------------------------------------
# spec-20 Phase 3: Remove --dangerously-skip-permissions (S20-P1-3)
# ---------------------------------------------------------------------------


class TestForbiddenCLIFlags:
    """Tests for S20-P1-3: FORBIDDEN_CLI_FLAGS and _validate_command_flags."""

    def test_command_does_not_contain_dangerously_skip_permissions(self, tmp_path: pathlib.Path) -> None:
        """_build_agent_command must never include --dangerously-skip-permissions."""
        import types

        config = types.SimpleNamespace(model="opus", effort="high", max_turns=10)
        cmd = _build_agent_command("test prompt", tmp_path, config, "/usr/bin/claude")
        assert "--dangerously-skip-permissions" not in cmd

    def test_forbidden_flag_validation_raises(self) -> None:
        """_validate_command_flags must raise PolicyViolationError on forbidden flag."""
        cmd = ["claude", "--print", "--dangerously-skip-permissions", "-p", "test"]
        with pytest.raises(PolicyViolationError, match="Forbidden CLI flag"):
            _validate_command_flags(cmd)

    def test_validate_command_flags_clean_passes(self) -> None:
        """_validate_command_flags must not raise for clean command."""
        cmd = ["claude", "--print", "--output-format", "stream-json", "-p", "test"]
        _validate_command_flags(cmd)  # Should not raise

    def test_forbidden_cli_flags_is_frozenset(self) -> None:
        """FORBIDDEN_CLI_FLAGS must be a frozenset for immutability."""
        assert isinstance(FORBIDDEN_CLI_FLAGS, frozenset)
        assert "--dangerously-skip-permissions" in FORBIDDEN_CLI_FLAGS

    def test_agent_subprocess_command_structure(self, tmp_path: pathlib.Path) -> None:
        """Built command must have expected structure: binary, --print, format, --verbose, -p."""
        import types

        config = types.SimpleNamespace(model="", effort="", max_turns=0)
        cmd = _build_agent_command("hello world", tmp_path, config, "/usr/bin/claude")
        assert cmd[0] == "/usr/bin/claude"
        assert "--print" in cmd
        assert "--output-format" in cmd
        assert "stream-json" in cmd
        assert "--verbose" in cmd
        assert "-p" in cmd
        idx = cmd.index("-p")
        assert cmd[idx + 1] == "hello world"

    def test_scaffolded_settings_has_permissions(self, tmp_path: pathlib.Path) -> None:
        """scaffold_claude_dir must write settings.json with allow/deny permissions."""
        import json

        from codelicious.scaffolder import scaffold_claude_dir

        scaffold_claude_dir(tmp_path)
        settings_path = tmp_path / ".claude" / "settings.json"
        assert settings_path.exists()
        data = json.loads(settings_path.read_text(encoding="utf-8"))
        assert "permissions" in data
        perms = data["permissions"]
        assert "allow" in perms
        assert "deny" in perms
        # Must include key safe operations
        assert any("Read" in entry for entry in perms["allow"])
        assert any("Edit" in entry for entry in perms["allow"])
        assert any("Bash(pytest" in entry for entry in perms["allow"])
        # Must deny dangerous operations
        assert any("force" in entry for entry in perms["deny"])
