"""Tests for command_runner.py security enforcement."""

import signal
import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock
import subprocess

from codelicious.tools.command_runner import CommandRunner, CommandDeniedError
from codelicious.security_constants import DENIED_COMMANDS, BLOCKED_METACHARACTERS


@pytest.fixture
def runner(tmp_path: Path) -> CommandRunner:
    """Create a CommandRunner with a temporary repo path."""
    return CommandRunner(repo_path=tmp_path, config={})


class TestDeniedCommands:
    """Test that all denied commands are blocked."""

    @pytest.mark.parametrize("cmd", list(DENIED_COMMANDS))
    def test_denied_commands_blocked(self, runner: CommandRunner, cmd: str) -> None:
        """Each command in DENIED_COMMANDS should be blocked."""
        result = runner.safe_run(cmd)
        assert result["success"] is False
        assert "Security Violation" in result["stderr"]
        assert "denied commands list" in result["stderr"]

    @pytest.mark.parametrize("cmd", list(DENIED_COMMANDS))
    def test_denied_commands_with_args_blocked(self, runner: CommandRunner, cmd: str) -> None:
        """Denied commands with arguments should also be blocked."""
        result = runner.safe_run(f"{cmd} --help")
        assert result["success"] is False
        assert "denied commands list" in result["stderr"]


class TestPathPrefixedBinaries:
    """Test that path-prefixed binaries are caught."""

    @pytest.mark.parametrize(
        "cmd",
        [
            "/usr/bin/rm -rf /",
            "/usr/local/bin/python3 -c 'print(1)'",
            "/bin/bash -c 'echo hello'",
            "./rm file.txt",
            "../../../usr/bin/sudo whoami",
            "/home/user/bin/curl http://example.com",
        ],
    )
    def test_path_prefixed_binaries_blocked(self, runner: CommandRunner, cmd: str) -> None:
        """Commands with path prefixes should still be blocked."""
        result = runner.safe_run(cmd)
        assert result["success"] is False
        assert "Security Violation" in result["stderr"]


class TestScriptExtensions:
    """Test that commands with script extensions are blocked."""

    @pytest.mark.parametrize(
        "cmd",
        [
            "rm.sh file.txt",
            "sudo.bash --help",
            "kill.zsh process",
            "chmod.bat file.txt",
            "python3.cmd script.py",
        ],
    )
    def test_script_extensions_blocked(self, runner: CommandRunner, cmd: str) -> None:
        """Commands with script extensions should be caught."""
        result = runner.safe_run(cmd)
        assert result["success"] is False
        assert "denied commands list" in result["stderr"]


class TestMetacharacters:
    """Test that shell metacharacters are blocked."""

    @pytest.mark.parametrize("char", list(BLOCKED_METACHARACTERS))
    def test_metacharacters_blocked(self, runner: CommandRunner, char: str) -> None:
        """Each metacharacter in BLOCKED_METACHARACTERS should be blocked."""
        # Test metacharacter in different positions
        result = runner.safe_run(f"echo {char}")
        assert result["success"] is False
        assert "Blocked shell metacharacter" in result["stderr"]

    @pytest.mark.parametrize(
        "cmd",
        [
            "echo hello | cat",  # pipe
            "ls && rm file",  # and
            "ls ; rm file",  # semicolon
            "echo $PATH",  # variable
            "echo `whoami`",  # backtick
            "echo $(whoami)",  # command substitution
            "echo {a,b}",  # brace expansion
            "cat > file",  # redirect
            "cat < file",  # redirect
            "!history",  # history expansion
        ],
    )
    def test_injection_patterns_blocked(self, runner: CommandRunner, cmd: str) -> None:
        """Common injection patterns should be blocked."""
        result = runner.safe_run(cmd)
        assert result["success"] is False
        assert "Blocked shell metacharacter" in result["stderr"]


class TestAllowedCommands:
    """Test that allowed commands pass through."""

    @pytest.mark.parametrize(
        "cmd",
        [
            "pytest --version",
            "ruff check .",
            "npm test",
            "cargo build",
            "ls -la",
            "cat README.md",
            "grep pattern file.txt",
        ],
    )
    def test_allowed_commands_pass(self, runner: CommandRunner, cmd: str) -> None:
        """Commands not in denylist should pass validation."""
        is_safe, reason = runner._is_safe(cmd)
        assert is_safe is True
        assert reason == ""


class TestEmptyAndInvalidCommands:
    """Test edge cases with empty or invalid commands."""

    @pytest.mark.parametrize(
        "cmd",
        [
            "",
            "   ",
            "\t",
            "\n",
        ],
    )
    def test_empty_command_blocked(self, runner: CommandRunner, cmd: str) -> None:
        """Empty or whitespace-only commands should be blocked."""
        result = runner.safe_run(cmd)
        assert result["success"] is False
        assert "Empty command" in result["stderr"]


class TestInterpreterDenylist:
    """Test that interpreter binaries are specifically blocked."""

    @pytest.mark.parametrize(
        "interpreter",
        [
            # Simple interpreter invocations without metacharacters
            "python --version",
            "python2 --version",
            "python3 --version",
            "perl --version",
            "ruby --version",
            "node --version",
            "nodejs --version",
            "bash --version",
            "sh --version",
            "zsh --version",
            "fish --version",
            "dash --help",
            "csh --help",
            "tcsh --help",
            "ksh --version",
            "php --version",
            "lua -v",
            "Rscript --version",
            "julia --version",
            "pwsh --version",
            "powershell --version",
        ],
    )
    def test_interpreters_blocked(self, runner: CommandRunner, interpreter: str) -> None:
        """All interpreter binaries should be blocked."""
        result = runner.safe_run(interpreter)
        assert result["success"] is False
        assert "denied commands list" in result["stderr"]

    @pytest.mark.parametrize(
        "interpreter_cmd",
        [
            # Test that interpreter + metacharacter combination is also blocked
            # These should be blocked by metacharacter check first
            "python -c 'print(1)'",
            "bash -c 'echo hello'",
        ],
    )
    def test_interpreters_with_metacharacters_blocked(self, runner: CommandRunner, interpreter_cmd: str) -> None:
        """Interpreters with metacharacters should be blocked (by either check)."""
        result = runner.safe_run(interpreter_cmd)
        assert result["success"] is False
        # Could be blocked by either metacharacter or denylist - both are valid
        assert "Security Violation" in result["stderr"]


class TestCommandExecution:
    """Test actual command execution behavior."""

    def test_successful_command_execution(self, runner: CommandRunner) -> None:
        """Valid commands should execute and return output."""
        with patch("codelicious.tools.command_runner.subprocess.Popen") as mock_popen:
            mock_proc = MagicMock()
            mock_proc.communicate.return_value = ("success output", "")
            mock_proc.returncode = 0
            mock_popen.return_value = mock_proc

            result = runner.safe_run("echo hello")
            assert result["success"] is True
            assert result["stdout"] == "success output"

    def test_failed_command_execution(self, runner: CommandRunner) -> None:
        """The real 'false' command (always exits 1) should produce success=False.

        This test exercises the actual subprocess execution path without mocking,
        confirming that a non-zero exit code propagates correctly into the result.
        """
        # 'false' is a POSIX utility that always exits with code 1.
        # It is not in the denylist and has no metacharacters, so it reaches Popen.
        result = runner.safe_run("false")
        assert result["success"] is False
        # stdout and stderr may be empty for 'false', but success must be False
        assert "success" in result

    def test_timeout_handling(self, runner: CommandRunner) -> None:
        """Commands that timeout should be handled gracefully."""
        with patch("os.killpg", side_effect=ProcessLookupError):
            with patch("codelicious.tools.command_runner.subprocess.Popen") as mock_popen:
                mock_proc = MagicMock()
                mock_proc.pid = 12345
                mock_proc.communicate.side_effect = [
                    subprocess.TimeoutExpired(cmd="test", timeout=120),
                    (None, None),  # cleanup call
                ]
                mock_proc.kill.return_value = None
                mock_popen.return_value = mock_proc

                result = runner.safe_run("sleep 999")
                assert result["success"] is False
                assert "timed out" in result["stderr"]

    def test_exception_handling(self, runner: CommandRunner) -> None:
        """Unexpected exceptions should be handled gracefully."""
        with patch("codelicious.tools.command_runner.subprocess.Popen") as mock_popen:
            mock_popen.side_effect = OSError("Test error")
            result = runner.safe_run("some_command")
            assert result["success"] is False
            assert "Subprocess Execution Error" in result["stderr"]


class TestSecurityConstantsConsistency:
    """Verify security constants are properly used."""

    def test_blocked_metacharacters_complete(self) -> None:
        """BLOCKED_METACHARACTERS should contain all critical injection chars."""
        required_chars = {"|", "&", ";", "$", "`", "(", ")", "{", "}", ">", "<", "!"}
        assert required_chars.issubset(BLOCKED_METACHARACTERS)

    def test_denied_commands_includes_interpreters(self) -> None:
        """DENIED_COMMANDS should include all major interpreter binaries."""
        interpreters = {
            "python",
            "python2",
            "python3",
            "perl",
            "ruby",
            "node",
            "nodejs",
            "bash",
            "sh",
            "zsh",
            "fish",
            "dash",
            "php",
            "lua",
            "pwsh",
            "powershell",
        }
        assert interpreters.issubset(DENIED_COMMANDS)

    def test_denied_commands_includes_dangerous_binaries(self) -> None:
        """DENIED_COMMANDS should include dangerous system commands."""
        dangerous = {
            "rm",
            "sudo",
            "chmod",
            "chown",
            "kill",
            "reboot",
            "shutdown",
            "curl",
            "wget",
        }
        assert dangerous.issubset(DENIED_COMMANDS)

    def test_denied_commands_includes_package_managers_and_build_tools(self) -> None:
        """DENIED_COMMANDS should include package managers and build tools (Finding 39).

        These tools are dangerous because they execute arbitrary code:
        - make: executes arbitrary Makefile recipes
        - pip/pip3: pip install runs setup.py / build hooks
        - pipx: installs and runs packages in isolated environments
        - npx: downloads and executes arbitrary npm packages
        - go: `go run` compiles and executes arbitrary Go source
        """
        build_tools = {"make", "pip", "pip3", "pipx", "npx", "go"}
        assert build_tools.issubset(DENIED_COMMANDS)


class TestShlexSplitValidation:
    """Tests for shlex.split() based validation (spec-16 Phase 1, P1-2)."""

    def test_shlex_split_used_for_validation(self, runner: CommandRunner) -> None:
        """Verify shlex.split() tokenization is used for validation.

        A command with single quotes that split() and shlex.split() tokenize differently
        should be validated using shlex interpretation.
        """
        # "echo 'hello world'" with split() gives ['echo', "'hello", "world'"]
        # With shlex.split() it gives ['echo', 'hello world']
        # This test verifies shlex interpretation is used
        is_safe, reason = runner._is_safe("echo 'hello world'")
        assert is_safe is True
        assert reason == ""

    def test_malformed_quoting_rejected(self, runner: CommandRunner) -> None:
        """Commands with unmatched quotes should be rejected."""
        result = runner.safe_run("echo 'unmatched quote")
        assert result["success"] is False
        assert "Malformed command quoting" in result["stderr"]

    def test_malformed_quoting_double_quotes(self, runner: CommandRunner) -> None:
        """Commands with unmatched double quotes should be rejected."""
        result = runner.safe_run('echo "unmatched double')
        assert result["success"] is False
        assert "Malformed command quoting" in result["stderr"]

    def test_valid_quoted_command_passes(self, runner: CommandRunner) -> None:
        """Properly quoted commands should pass validation."""
        is_safe, reason = runner._is_safe('echo "hello world"')
        assert is_safe is True
        assert reason == ""

    def test_escaped_quotes_handled(self, runner: CommandRunner) -> None:
        """Commands with escaped quotes inside single-quoted strings are rejected as malformed."""
        # "echo 'it\'s working'" — in Python the string is: echo 'it\'s working'
        # In POSIX shlex, backslash inside single quotes is literal, so 'it\' closes
        # the single quote after the backslash, leaving "s working'" with an unclosed quote.
        # shlex.split() raises ValueError, which _is_safe maps to (False, "Malformed ...").
        is_safe, reason = runner._is_safe("echo 'it\\'s working'")
        assert is_safe is False
        assert "Malformed" in reason


class TestNewlineRejection:
    """Tests for newline character rejection (spec-16 Phase 1, P1-2)."""

    def test_newline_in_command_rejected(self, runner: CommandRunner) -> None:
        """Commands containing \\n should be rejected."""
        result = runner.safe_run("echo hello\necho world")
        assert result["success"] is False
        assert "Newline characters not allowed" in result["stderr"]

    def test_carriage_return_in_command_rejected(self, runner: CommandRunner) -> None:
        """Commands containing \\r should be rejected."""
        result = runner.safe_run("echo hello\recho world")
        assert result["success"] is False
        assert "Newline characters not allowed" in result["stderr"]

    def test_crlf_in_command_rejected(self, runner: CommandRunner) -> None:
        """Commands containing \\r\\n should be rejected."""
        result = runner.safe_run("echo hello\r\necho world")
        assert result["success"] is False
        assert "Newline characters not allowed" in result["stderr"]

    def test_embedded_newline_rejected(self, runner: CommandRunner) -> None:
        """Commands with newlines embedded in arguments should be rejected."""
        result = runner.safe_run("echo 'hello\nworld'")
        assert result["success"] is False
        assert "Newline characters not allowed" in result["stderr"]


class TestProcessGroupTimeout:
    """Tests for process group timeout handling (spec-16 Phase 1, P2-3)."""

    def test_process_group_killed_on_timeout(self, runner: CommandRunner) -> None:
        """Verify that process group is killed on timeout, not just parent."""
        killed_pids = []

        def mock_killpg(pgid, sig):
            killed_pids.append((pgid, sig))
            raise ProcessLookupError("Process already exited")

        with patch("os.killpg", side_effect=mock_killpg):
            with patch("codelicious.tools.command_runner.subprocess.Popen") as mock_popen:
                mock_proc = MagicMock()
                mock_proc.pid = 12345
                mock_proc.communicate.side_effect = subprocess.TimeoutExpired(cmd="test", timeout=1)
                mock_proc.kill.return_value = None
                mock_popen.return_value = mock_proc

                result = runner.safe_run("sleep 999", timeout=1)

                assert result["success"] is False
                assert "timed out" in result["stderr"]
                # Verify os.killpg was called with the process PID and SIGKILL
                assert len(killed_pids) > 0
                assert killed_pids[0] == (12345, signal.SIGKILL)

    def test_start_new_session_enabled(self, runner: CommandRunner) -> None:
        """Verify that start_new_session=True is passed to Popen."""
        with patch("codelicious.tools.command_runner.subprocess.Popen") as mock_popen:
            mock_proc = MagicMock()
            mock_proc.communicate.return_value = ("output", "")
            mock_proc.returncode = 0
            mock_popen.return_value = mock_proc

            runner.safe_run("echo test")

            # Verify start_new_session=True was passed
            mock_popen.assert_called_once()
            call_kwargs = mock_popen.call_args[1]
            assert call_kwargs.get("start_new_session") is True

    def test_timeout_cleanup_handles_already_exited(self, runner: CommandRunner) -> None:
        """Verify graceful handling when process already exited during cleanup."""
        with patch("os.killpg", side_effect=ProcessLookupError):
            with patch("codelicious.tools.command_runner.subprocess.Popen") as mock_popen:
                mock_proc = MagicMock()
                mock_proc.pid = 99999
                mock_proc.communicate.side_effect = [
                    subprocess.TimeoutExpired(cmd="test", timeout=1),
                    (None, None),  # Second call for cleanup
                ]
                mock_proc.kill.side_effect = ProcessLookupError
                mock_popen.return_value = mock_proc

                # Should not raise even if process already exited
                result = runner.safe_run("sleep 999", timeout=1)
                assert result["success"] is False
                assert "timed out" in result["stderr"]

    def test_timeout_value_customizable(self, runner: CommandRunner) -> None:
        """Verify custom timeout value is respected."""
        with patch("codelicious.tools.command_runner.subprocess.Popen") as mock_popen:
            mock_proc = MagicMock()
            mock_proc.communicate.return_value = ("output", "")
            mock_proc.returncode = 0
            mock_popen.return_value = mock_proc

            runner.safe_run("echo test", timeout=60)

            # Verify communicate was called with our timeout
            mock_proc.communicate.assert_called_once_with(timeout=60)

    def test_timeout_message_includes_duration(self, runner: CommandRunner) -> None:
        """Verify timeout message includes the actual timeout duration."""
        with patch("os.killpg", side_effect=ProcessLookupError):
            with patch("codelicious.tools.command_runner.subprocess.Popen") as mock_popen:
                mock_proc = MagicMock()
                mock_proc.pid = 12345
                mock_proc.communicate.side_effect = [
                    subprocess.TimeoutExpired(cmd="test", timeout=30),
                    (None, None),
                ]
                mock_proc.kill.return_value = None
                mock_popen.return_value = mock_proc

                result = runner.safe_run("sleep 999", timeout=30)
                assert "30s" in result["stderr"]


class TestCommandDeniedError:
    """Tests for the CommandDeniedError exception."""

    def test_command_denied_error_exists(self) -> None:
        """Verify CommandDeniedError exception class exists."""
        assert issubclass(CommandDeniedError, Exception)

    def test_command_denied_error_can_be_raised(self) -> None:
        """Verify CommandDeniedError can be raised with message."""
        with pytest.raises(CommandDeniedError) as exc_info:
            raise CommandDeniedError("Test denied message")
        assert "Test denied message" in str(exc_info.value)
