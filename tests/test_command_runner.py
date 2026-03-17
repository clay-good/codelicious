"""Tests for command_runner.py security enforcement."""

import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock
import subprocess

from codelicious.tools.command_runner import CommandRunner
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
            "go test ./...",
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
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(
                returncode=0,
                stdout="success output",
                stderr="",
            )
            result = runner.safe_run("echo hello")
            assert result["success"] is True
            assert result["stdout"] == "success output"

    def test_failed_command_execution(self, runner: CommandRunner) -> None:
        """Failed commands should return appropriate error."""
        with patch("subprocess.run") as mock_run:
            mock_run.return_value = MagicMock(
                returncode=1,
                stdout="",
                stderr="error output",
            )
            result = runner.safe_run("false")  # 'false' command returns 1
            assert result["success"] is False
            assert result["stderr"] == "error output"

    def test_timeout_handling(self, runner: CommandRunner) -> None:
        """Commands that timeout should be handled gracefully."""
        with patch("subprocess.run") as mock_run:
            mock_run.side_effect = subprocess.TimeoutExpired(cmd="test", timeout=120)
            result = runner.safe_run("sleep 999")
            assert result["success"] is False
            assert "timed out" in result["stderr"]

    def test_exception_handling(self, runner: CommandRunner) -> None:
        """Unexpected exceptions should be handled gracefully."""
        with patch("subprocess.run") as mock_run:
            mock_run.side_effect = OSError("Test error")
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
