"""Tests for the agent_runner module."""

from __future__ import annotations

import pathlib
from unittest.mock import MagicMock, patch

import pytest

from proxilion_build.agent_runner import AgentResult, _process_stream_event, run_agent
from proxilion_build.errors import (
    ClaudeAuthError,
    ClaudeRateLimitError,
    ProxilionBuildError,
)

# -- AgentResult dataclass ---------------------------------------------------


def test_agent_result_defaults() -> None:
    r = AgentResult(success=True, returncode=0, output="ok", elapsed_s=1.5)
    assert r.success is True
    assert r.session_id == ""


# -- dry-run mode ------------------------------------------------------------


def test_dry_run_returns_immediately(tmp_path: pathlib.Path) -> None:
    cfg = MagicMock(dry_run=True)
    result = run_agent("hello", tmp_path, cfg)
    assert result.success is True
    assert result.output == "[dry run]"
    assert result.elapsed_s == 0.0


# -- missing claude binary ---------------------------------------------------


def test_missing_claude_binary_raises(tmp_path: pathlib.Path) -> None:
    cfg = MagicMock(dry_run=False)
    with patch("proxilion_build.agent_runner.shutil.which", return_value=None):
        with pytest.raises(ClaudeAuthError, match="claude CLI not found"):
            run_agent("hello", tmp_path, cfg)


# -- invalid project root ---------------------------------------------------


def test_invalid_project_root_raises() -> None:
    cfg = MagicMock(dry_run=False)
    with pytest.raises(ProxilionBuildError, match="not a directory"):
        run_agent("hello", pathlib.Path("/nonexistent/path"), cfg)


# -- command building --------------------------------------------------------


def test_command_includes_model_and_effort(tmp_path: pathlib.Path) -> None:
    cfg = MagicMock(dry_run=False, model="opus", effort="high", max_turns=5)

    captured_cmd: list[str] = []

    def fake_popen(cmd, **kwargs):
        captured_cmd.extend(cmd)
        proc = MagicMock()
        proc.stdout = iter([])
        proc.stderr = iter([])
        proc.poll.return_value = 0
        proc.wait.return_value = 0
        proc.returncode = 0
        return proc

    with patch("proxilion_build.agent_runner.shutil.which", return_value="/usr/bin/claude"):
        with patch("proxilion_build.agent_runner.subprocess.Popen", side_effect=fake_popen):
            run_agent("test prompt", tmp_path, cfg)

    assert "--model" in captured_cmd
    assert "opus" in captured_cmd
    assert "--effort" in captured_cmd
    assert "high" in captured_cmd
    assert "--max-turns" in captured_cmd
    assert "5" in captured_cmd


def test_command_omits_optional_flags_when_empty(tmp_path: pathlib.Path) -> None:
    cfg = MagicMock(dry_run=False, model="", effort="", max_turns=0)

    captured_cmd: list[str] = []

    def fake_popen(cmd, **kwargs):
        captured_cmd.extend(cmd)
        proc = MagicMock()
        proc.stdout = iter([])
        proc.stderr = iter([])
        proc.poll.return_value = 0
        proc.wait.return_value = 0
        proc.returncode = 0
        return proc

    with patch("proxilion_build.agent_runner.shutil.which", return_value="/usr/bin/claude"):
        with patch("proxilion_build.agent_runner.subprocess.Popen", side_effect=fake_popen):
            run_agent("test prompt", tmp_path, cfg)

    assert "--model" not in captured_cmd
    assert "--effort" not in captured_cmd
    assert "--max-turns" not in captured_cmd


# -- non-zero exit code ------------------------------------------------------


def test_nonzero_exit_raises(tmp_path: pathlib.Path) -> None:
    cfg = MagicMock(dry_run=False, model="", effort="", max_turns=0, agent_timeout_s=60)

    def fake_popen(cmd, **kwargs):
        proc = MagicMock()
        proc.stdout = iter([])
        proc.stderr = iter(["some error\n"])
        proc.poll.return_value = 1
        proc.wait.return_value = 1
        proc.returncode = 1
        return proc

    with patch("proxilion_build.agent_runner.shutil.which", return_value="/usr/bin/claude"):
        with patch("proxilion_build.agent_runner.subprocess.Popen", side_effect=fake_popen):
            with pytest.raises(ProxilionBuildError, match="exited with code 1"):
                run_agent("test", tmp_path, cfg)


def test_auth_error_in_stderr(tmp_path: pathlib.Path) -> None:
    cfg = MagicMock(dry_run=False, model="", effort="", max_turns=0, agent_timeout_s=60)

    def fake_popen(cmd, **kwargs):
        proc = MagicMock()
        proc.stdout = iter([])
        proc.stderr = iter(["Authentication failed\n"])
        proc.poll.return_value = 1
        proc.wait.return_value = 1
        proc.returncode = 1
        return proc

    with patch("proxilion_build.agent_runner.shutil.which", return_value="/usr/bin/claude"):
        with patch("proxilion_build.agent_runner.subprocess.Popen", side_effect=fake_popen):
            with pytest.raises(ClaudeAuthError, match="authentication failed"):
                run_agent("test", tmp_path, cfg)


# -- _process_stream_event ---------------------------------------------------


def test_process_system_init_event() -> None:
    event = {"type": "system", "subtype": "init", "session_id": "abc-123"}
    sid, display = _process_stream_event(event)
    assert sid == "abc-123"
    assert display == ""


def test_process_assistant_text_event() -> None:
    event = {
        "type": "assistant",
        "message": {
            "content": [
                {"type": "text", "text": "Hello world"},
            ]
        },
    }
    sid, display = _process_stream_event(event)
    assert sid == ""
    assert display == "Hello world"


def test_process_assistant_tool_use_event() -> None:
    event = {
        "type": "assistant",
        "message": {
            "content": [
                {"type": "tool_use", "name": "Read"},
            ]
        },
    }
    sid, display = _process_stream_event(event)
    assert "[tool_use: Read]" in display


def test_process_unknown_event_type() -> None:
    event = {"type": "result"}
    sid, display = _process_stream_event(event)
    assert sid == ""
    assert display == ""


# -- resume_session_id -------------------------------------------------------


def test_dry_run_with_resume_session_id(tmp_path: pathlib.Path) -> None:
    cfg = MagicMock(dry_run=True)
    result = run_agent("hello", tmp_path, cfg, resume_session_id="sess-123")
    assert result.success is True


def test_resume_session_id_adds_flag(tmp_path: pathlib.Path) -> None:
    cfg = MagicMock(dry_run=False, model="", effort="", max_turns=0)

    captured_cmd: list[str] = []

    def fake_popen(cmd, **kwargs):
        captured_cmd.extend(cmd)
        proc = MagicMock()
        proc.stdout = iter([])
        proc.stderr = iter([])
        proc.poll.return_value = 0
        proc.wait.return_value = 0
        proc.returncode = 0
        return proc

    with patch("proxilion_build.agent_runner.shutil.which", return_value="/usr/bin/claude"):
        with patch("proxilion_build.agent_runner.subprocess.Popen", side_effect=fake_popen):
            run_agent("test", tmp_path, cfg, resume_session_id="sess-abc")

    assert "--resume" in captured_cmd
    idx = captured_cmd.index("--resume")
    assert captured_cmd[idx + 1] == "sess-abc"


def test_no_resume_flag_when_empty(tmp_path: pathlib.Path) -> None:
    cfg = MagicMock(dry_run=False, model="", effort="", max_turns=0)

    captured_cmd: list[str] = []

    def fake_popen(cmd, **kwargs):
        captured_cmd.extend(cmd)
        proc = MagicMock()
        proc.stdout = iter([])
        proc.stderr = iter([])
        proc.poll.return_value = 0
        proc.wait.return_value = 0
        proc.returncode = 0
        return proc

    with patch("proxilion_build.agent_runner.shutil.which", return_value="/usr/bin/claude"):
        with patch("proxilion_build.agent_runner.subprocess.Popen", side_effect=fake_popen):
            run_agent("test", tmp_path, cfg, resume_session_id="")

    assert "--resume" not in captured_cmd


# -- periodic stderr summary logging -----------------------------------------


def test_stderr_summary_logging(tmp_path: pathlib.Path) -> None:
    """Test that stderr summary is logged every 60 seconds."""
    cfg = MagicMock(dry_run=False, model="", effort="", max_turns=0, agent_timeout_s=180)

    # We will simulate time passing by controlling monotonic
    time_values = [
        0.0,  # start time
        0.0,  # _last_stderr_check init
        0.0,  # first iteration
        30.0,  # second iteration (< 60s, no summary)
        65.0,  # third iteration (>= 60s, trigger summary)
        65.0,  # update _last_stderr_check
        130.0,  # fourth iteration (>= 60s from last check, trigger again)
        130.0,  # update _last_stderr_check
    ]
    time_idx = [0]

    def fake_monotonic():
        idx = time_idx[0]
        if idx < len(time_values):
            val = time_values[idx]
            time_idx[0] += 1
            return val
        # After we run out of predefined values, just keep returning the last value
        return time_values[-1]

    # Track logger.info calls
    info_calls = []

    def fake_popen(cmd, **kwargs):
        proc = MagicMock()
        # stdout will emit a line on first read, then EOF
        proc.stdout = iter(["test line\n", "another line\n"])
        # stderr will accumulate lines in the background thread
        proc.stderr = iter(["stderr line 1\n", "stderr line 2\n", "stderr line 3\n"])
        proc.poll.side_effect = [None, None, 0]  # Running, running, then done
        proc.wait.return_value = 0
        proc.returncode = 0
        proc.pid = 12345
        return proc

    def fake_logger_info(msg: str, *args) -> None:
        info_calls.append((msg, args))

    with patch("proxilion_build.agent_runner.shutil.which", return_value="/usr/bin/claude"):
        with patch("proxilion_build.agent_runner.subprocess.Popen", side_effect=fake_popen):
            with patch("proxilion_build.agent_runner.time.monotonic", side_effect=fake_monotonic):
                with patch(
                    "proxilion_build.agent_runner.logger.info", side_effect=fake_logger_info
                ):
                    result = run_agent("test", tmp_path, cfg)

    assert result.success is True

    # Check that we got at least one stderr summary log
    stderr_summaries = [call for call in info_calls if "Agent stderr summary" in call[0]]

    # We should have at least one summary log
    assert len(stderr_summaries) >= 1

    # Verify the format: "Agent stderr summary: %d new lines. Last: %s"
    for msg, args in stderr_summaries:
        assert "Agent stderr summary:" in msg
        assert len(args) == 2
        assert isinstance(args[0], int)  # new_lines count
        assert isinstance(args[1], str)  # last line


# -- Phase 9: agent_runner.py test coverage expansion -----------------------


def test_session_id_extracted_from_init_event(tmp_path: pathlib.Path) -> None:
    """Test that session_id is extracted from system init event."""
    cfg = MagicMock(dry_run=False, model="", effort="", max_turns=0, agent_timeout_s=60)

    # Mock stdout to emit a valid stream-json init event
    init_event = '{"type": "system", "subtype": "init", "session_id": "sess-abc-123"}\n'

    def fake_popen(cmd, **kwargs):
        proc = MagicMock()
        proc.stdout = iter([init_event])
        proc.stderr = iter([])
        proc.poll.return_value = 0
        proc.wait.return_value = 0
        proc.returncode = 0
        proc.pid = 12345
        return proc

    with patch("proxilion_build.agent_runner.shutil.which", return_value="/usr/bin/claude"):
        with patch("proxilion_build.agent_runner.subprocess.Popen", side_effect=fake_popen):
            result = run_agent("test", tmp_path, cfg)

    assert result.success is True
    assert result.session_id == "sess-abc-123"


def test_dry_run_returns_immediately_without_subprocess(tmp_path: pathlib.Path) -> None:
    """Test that dry_run=True returns immediately without launching subprocess."""
    cfg = MagicMock(dry_run=True)

    # We should never call Popen in dry-run mode
    with patch("proxilion_build.agent_runner.subprocess.Popen") as mock_popen:
        result = run_agent("test prompt", tmp_path, cfg)

    # Verify no subprocess was launched
    mock_popen.assert_not_called()

    # Verify result
    assert result.success is True
    assert result.returncode == 0
    assert result.output == "[dry run]"
    assert result.elapsed_s == 0.0


def test_claude_not_found_raises_auth_error(tmp_path: pathlib.Path) -> None:
    """Test that missing claude binary raises ClaudeAuthError."""
    cfg = MagicMock(dry_run=False)

    with patch("proxilion_build.agent_runner.shutil.which", return_value=None):
        with pytest.raises(ClaudeAuthError, match="claude CLI not found"):
            run_agent("test", tmp_path, cfg)


def test_auth_error_detected_from_stderr(tmp_path: pathlib.Path) -> None:
    """Test that auth errors in stderr raise ClaudeAuthError."""
    cfg = MagicMock(dry_run=False, model="", effort="", max_turns=0, agent_timeout_s=60)

    def fake_popen(cmd, **kwargs):
        proc = MagicMock()
        proc.stdout = iter([])
        proc.stderr = iter(["Error: auth token invalid\n", "Please run claude login\n"])
        proc.poll.return_value = 1
        proc.wait.return_value = 1
        proc.returncode = 1
        proc.pid = 12345
        return proc

    with patch("proxilion_build.agent_runner.shutil.which", return_value="/usr/bin/claude"):
        with patch("proxilion_build.agent_runner.subprocess.Popen", side_effect=fake_popen):
            with pytest.raises(ClaudeAuthError, match="authentication failed"):
                run_agent("test", tmp_path, cfg)


def test_rate_limit_detected_from_stdout(tmp_path: pathlib.Path) -> None:
    """Test that rate limit messages in stdout raise ClaudeRateLimitError."""
    cfg = MagicMock(dry_run=False, model="", effort="", max_turns=0, agent_timeout_s=60)

    def fake_popen(cmd, **kwargs):
        proc = MagicMock()
        proc.stdout = iter(["Error: rate limit exceeded\n", "Try again later\n"])
        proc.stderr = iter([])
        proc.poll.return_value = 1
        proc.wait.return_value = 1
        proc.returncode = 1
        proc.pid = 12345
        return proc

    with patch("proxilion_build.agent_runner.shutil.which", return_value="/usr/bin/claude"):
        with patch("proxilion_build.agent_runner.subprocess.Popen", side_effect=fake_popen):
            with pytest.raises(ClaudeRateLimitError, match="rate limited"):
                run_agent("test", tmp_path, cfg)


def test_nonzero_exit_raises_generic_proxilion_error(tmp_path: pathlib.Path) -> None:
    """Test that non-zero exit with generic stderr raises ProxilionBuildError."""
    cfg = MagicMock(dry_run=False, model="", effort="", max_turns=0, agent_timeout_s=60)

    def fake_popen(cmd, **kwargs):
        proc = MagicMock()
        proc.stdout = iter([])
        proc.stderr = iter(["Some unexpected error occurred\n"])
        proc.poll.return_value = 1
        proc.wait.return_value = 1
        proc.returncode = 1
        proc.pid = 12345
        return proc

    with patch("proxilion_build.agent_runner.shutil.which", return_value="/usr/bin/claude"):
        with patch("proxilion_build.agent_runner.subprocess.Popen", side_effect=fake_popen):
            with pytest.raises(ProxilionBuildError, match="exited with code 1"):
                run_agent("test", tmp_path, cfg)


def test_process_stream_event_assistant_text() -> None:
    """Test that _process_stream_event extracts text from assistant events."""
    event = {
        "type": "assistant",
        "message": {
            "content": [
                {"type": "text", "text": "First part"},
                {"type": "text", "text": "Second part"},
            ]
        },
    }
    sid, display = _process_stream_event(event)
    assert sid == ""
    assert "First part" in display
    assert "Second part" in display


def test_process_stream_event_tool_use() -> None:
    """Test that _process_stream_event formats tool_use blocks."""
    event = {
        "type": "assistant",
        "message": {
            "content": [
                {"type": "tool_use", "name": "Read"},
                {"type": "tool_use", "name": "Write"},
            ]
        },
    }
    sid, display = _process_stream_event(event)
    assert sid == ""
    assert "[tool_use: Read]" in display
    assert "[tool_use: Write]" in display
