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
    _check_agent_errors,
    _enforce_timeout,
    _parse_agent_output,
    _sanitize_prompt,
    run_agent,
)
from codelicious.errors import (
    AgentTimeout,
    ClaudeAuthError,
    ClaudeRateLimitError,
    CodeliciousError,
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


class TestAllowDangerousEnvVar:
    """Tests for Finding 38: CODELICIOUS_ALLOW_DANGEROUS must require exact string."""

    def test_exact_value_enables_flag(self, tmp_path: pathlib.Path) -> None:
        """Only 'I-UNDERSTAND-THE-RISKS' activates --dangerously-skip-permissions."""
        import types

        config = types.SimpleNamespace(
            allow_dangerous=False,
            model="",
            effort="",
            max_turns=0,
        )
        with patch.dict("os.environ", {"CODELICIOUS_ALLOW_DANGEROUS": "I-UNDERSTAND-THE-RISKS"}):
            from codelicious.agent_runner import _build_agent_command

            cmd = _build_agent_command("test", tmp_path, config, "claude")
        assert "--dangerously-skip-permissions" in cmd

    def test_truthy_string_one_does_not_enable_flag(self, tmp_path: pathlib.Path) -> None:
        """'1' must not activate --dangerously-skip-permissions (Finding 38 fix)."""
        import types

        config = types.SimpleNamespace(
            allow_dangerous=False,
            model="",
            effort="",
            max_turns=0,
        )
        with patch.dict("os.environ", {"CODELICIOUS_ALLOW_DANGEROUS": "1"}):
            from codelicious.agent_runner import _build_agent_command

            cmd = _build_agent_command("test", tmp_path, config, "claude")
        assert "--dangerously-skip-permissions" not in cmd

    def test_truthy_string_true_does_not_enable_flag(self, tmp_path: pathlib.Path) -> None:
        """'true' must not activate --dangerously-skip-permissions (Finding 38 fix)."""
        import types

        config = types.SimpleNamespace(
            allow_dangerous=False,
            model="",
            effort="",
            max_turns=0,
        )
        with patch.dict("os.environ", {"CODELICIOUS_ALLOW_DANGEROUS": "true"}):
            from codelicious.agent_runner import _build_agent_command

            cmd = _build_agent_command("test", tmp_path, config, "claude")
        assert "--dangerously-skip-permissions" not in cmd

    def test_truthy_string_yes_does_not_enable_flag(self, tmp_path: pathlib.Path) -> None:
        """'yes' must not activate --dangerously-skip-permissions (Finding 38 fix)."""
        import types

        config = types.SimpleNamespace(
            allow_dangerous=False,
            model="",
            effort="",
            max_turns=0,
        )
        with patch.dict("os.environ", {"CODELICIOUS_ALLOW_DANGEROUS": "yes"}):
            from codelicious.agent_runner import _build_agent_command

            cmd = _build_agent_command("test", tmp_path, config, "claude")
        assert "--dangerously-skip-permissions" not in cmd

    def test_empty_env_var_does_not_enable_flag(self, tmp_path: pathlib.Path) -> None:
        """An absent or empty env var must not activate the flag."""
        import types

        config = types.SimpleNamespace(
            allow_dangerous=False,
            model="",
            effort="",
            max_turns=0,
        )
        env_without_var = {k: v for k, v in __import__("os").environ.items() if k != "CODELICIOUS_ALLOW_DANGEROUS"}
        with patch.dict("os.environ", env_without_var, clear=True):
            from codelicious.agent_runner import _build_agent_command

            cmd = _build_agent_command("test", tmp_path, config, "claude")
        assert "--dangerously-skip-permissions" not in cmd

    def test_exact_value_logs_security_warning(self, tmp_path: pathlib.Path, caplog: pytest.LogCaptureFixture) -> None:
        """Activating via env var must emit a WARNING-level security message."""
        import types

        config = types.SimpleNamespace(
            allow_dangerous=False,
            model="",
            effort="",
            max_turns=0,
        )
        with patch.dict("os.environ", {"CODELICIOUS_ALLOW_DANGEROUS": "I-UNDERSTAND-THE-RISKS"}):
            from codelicious.agent_runner import _build_agent_command

            with caplog.at_level("WARNING", logger="codelicious.agent_runner"):
                _build_agent_command("test", tmp_path, config, "claude")

        assert any("SECURITY WARNING" in r.message or "dangerously" in r.message.lower() for r in caplog.records)

    def test_config_allow_dangerous_true_does_not_log_env_warning(
        self, tmp_path: pathlib.Path, caplog: pytest.LogCaptureFixture
    ) -> None:
        """Warning is only emitted when env var activates the flag, not config flag."""
        import types

        config = types.SimpleNamespace(
            allow_dangerous=True,
            model="",
            effort="",
            max_turns=0,
        )
        env_without_var = {k: v for k, v in __import__("os").environ.items() if k != "CODELICIOUS_ALLOW_DANGEROUS"}
        with patch.dict("os.environ", env_without_var, clear=True):
            from codelicious.agent_runner import _build_agent_command

            with caplog.at_level("WARNING", logger="codelicious.agent_runner"):
                cmd = _build_agent_command("test", tmp_path, config, "claude")

        assert "--dangerously-skip-permissions" in cmd
        # The env-var-specific warning must NOT appear (it was the config that triggered it)
        assert not any("SECURITY WARNING" in r.message for r in caplog.records)


class TestCheckAgentErrors:
    """Unit tests for _check_agent_errors (Finding 46)."""

    def test_returncode_zero_does_not_raise(self) -> None:
        """Return code 0 should not raise any exception."""
        # Should complete without raising
        _check_agent_errors(0, ["some stdout\n"], ["some stderr\n"])

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
        assert exc_info.value is not None

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
        _check_agent_errors(0, [], ["auth failed somehow\n"])


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

    def test_valid_project_root_does_not_raise_validation_error(self, tmp_path: pathlib.Path) -> None:
        """An existing directory does not raise at the validation step (dry_run avoids subprocess)."""
        config = MagicMock()
        config.dry_run = True  # Use dry_run to short-circuit subprocess

        result = run_agent(prompt="hello", project_root=tmp_path, config=config)
        assert result.success is True
