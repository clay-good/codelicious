"""Tests for the verifier module."""

from __future__ import annotations

import pathlib
import subprocess
from unittest.mock import patch

import pytest

from proxilion_build.verifier import (
    CheckResult,
    VerificationResult,
    check_custom_command,
    check_security,
    check_syntax,
    check_tests,
    verify,
)

# -- check_syntax: valid files ---------------------------------------------


def test_check_syntax_valid(tmp_path: pathlib.Path) -> None:
    (tmp_path / "good.py").write_text("x = 1\n", encoding="utf-8")
    result = check_syntax(tmp_path)
    assert result.passed is True
    assert result.name == "syntax"


# -- check_syntax: syntax error -------------------------------------------


def test_check_syntax_error(tmp_path: pathlib.Path) -> None:
    (tmp_path / "bad.py").write_text("def f(\n", encoding="utf-8")
    result = check_syntax(tmp_path)
    assert result.passed is False
    assert "syntax" in result.name.lower()


# -- check_syntax: no files -----------------------------------------------


def test_check_syntax_no_files(tmp_path: pathlib.Path) -> None:
    result = check_syntax(tmp_path)
    assert result.passed is True
    assert "No Python files" in result.message


# -- check_security: finds dangerous patterns ------------------------------


def test_check_security_finds_eval(tmp_path: pathlib.Path) -> None:
    (tmp_path / "danger.py").write_text("result = eval(user_input)\n", encoding="utf-8")
    result = check_security(tmp_path)
    assert result.passed is False
    assert "eval(" in result.details


def test_check_security_finds_exec(tmp_path: pathlib.Path) -> None:
    (tmp_path / "danger.py").write_text("exec(code)\n", encoding="utf-8")
    result = check_security(tmp_path)
    assert result.passed is False
    assert "exec(" in result.details


def test_check_security_finds_hardcoded_secret(
    tmp_path: pathlib.Path,
) -> None:
    (tmp_path / "secrets.py").write_text("api_key = 'sk-abcdefghij0123456789'\n", encoding="utf-8")
    result = check_security(tmp_path)
    assert result.passed is False
    assert "secret" in result.details.lower() or "sk-" in result.details


# -- check_security: clean files ------------------------------------------


def test_check_security_passes_clean(tmp_path: pathlib.Path) -> None:
    (tmp_path / "clean.py").write_text("def add(a, b):\n    return a + b\n", encoding="utf-8")
    result = check_security(tmp_path)
    assert result.passed is True


# -- check_security: skips comments ----------------------------------------


def test_check_security_skips_comments(tmp_path: pathlib.Path) -> None:
    (tmp_path / "commented.py").write_text(
        "# eval(user_input) is dangerous\nx = 1\n", encoding="utf-8"
    )
    result = check_security(tmp_path)
    assert result.passed is True


# -- check_tests: no tests dir --------------------------------------------


def test_check_tests_no_dir(tmp_path: pathlib.Path) -> None:
    result = check_tests(tmp_path)
    assert result.passed is True
    assert "No tests" in result.message


# -- check_custom_command: simple command ----------------------------------


def test_check_custom_command_echo(tmp_path: pathlib.Path) -> None:
    result = check_custom_command(tmp_path, "echo ok")
    assert result.passed is True
    assert result.name == "custom"


# -- check_custom_command: failure -----------------------------------------


def test_check_custom_command_failure(tmp_path: pathlib.Path) -> None:
    result = check_custom_command(tmp_path, "false")
    assert result.passed is False


# -- check_custom_command: None --------------------------------------------


def test_check_custom_command_none(tmp_path: pathlib.Path) -> None:
    result = check_custom_command(tmp_path, None)
    assert result.passed is True
    assert "No custom command" in result.message


# -- check_custom_command: empty string ------------------------------------


def test_check_custom_command_empty(tmp_path: pathlib.Path) -> None:
    result = check_custom_command(tmp_path, "")
    assert result.passed is True


# -- verify: returns correct structure -------------------------------------


def test_verify_structure(tmp_path: pathlib.Path) -> None:
    (tmp_path / "ok.py").write_text("x = 1\n", encoding="utf-8")
    result = verify(tmp_path)
    assert isinstance(result, VerificationResult)
    assert len(result.checks) >= 3
    check_names = {c.name for c in result.checks}
    assert "syntax" in check_names
    assert "tests" in check_names
    assert "security" in check_names


def test_verify_with_custom_command(tmp_path: pathlib.Path) -> None:
    (tmp_path / "ok.py").write_text("x = 1\n", encoding="utf-8")
    result = verify(tmp_path, verify_command="echo ok")
    check_names = {c.name for c in result.checks}
    assert "custom" in check_names


def test_verify_all_passed(tmp_path: pathlib.Path) -> None:
    (tmp_path / "clean.py").write_text("def f():\n    return 1\n", encoding="utf-8")
    result = verify(tmp_path)
    assert result.all_passed is True


# -- timeout handling ------------------------------------------------------


def test_check_custom_command_timeout(tmp_path: pathlib.Path) -> None:
    # Use a very short timeout with a sleep command
    result = check_custom_command(tmp_path, "sleep 10", timeout=1)
    assert result.passed is False
    assert "timed out" in result.message.lower()


# -- VerificationResult.all_passed -----------------------------------------


def test_verification_result_all_passed_false() -> None:
    vr = VerificationResult(
        checks=[
            CheckResult(name="a", passed=True, message="ok"),
            CheckResult(name="b", passed=False, message="fail"),
        ]
    )
    assert vr.all_passed is False


def test_verification_result_all_passed_true() -> None:
    vr = VerificationResult(
        checks=[
            CheckResult(name="a", passed=True, message="ok"),
            CheckResult(name="b", passed=True, message="ok"),
        ]
    )
    assert vr.all_passed is True


# -- check_tests: tests pass -----------------------------------------------


def test_check_tests_passing(tmp_path: pathlib.Path) -> None:
    tests_dir = tmp_path / "tests"
    tests_dir.mkdir()
    (tests_dir / "test_ok.py").write_text(
        "def test_simple():\n    assert 1 + 1 == 2\n", encoding="utf-8"
    )
    result = check_tests(tmp_path)
    assert result.passed is True
    assert "passed" in result.message.lower()


# -- check_tests: tests fail -----------------------------------------------


def test_check_tests_failing(tmp_path: pathlib.Path) -> None:
    tests_dir = tmp_path / "tests"
    tests_dir.mkdir()
    (tests_dir / "test_fail.py").write_text(
        "def test_bad():\n    assert False\n", encoding="utf-8"
    )
    result = check_tests(tmp_path)
    assert result.passed is False
    assert "failed" in result.message.lower()


# -- check_tests: timeout --------------------------------------------------


def test_check_tests_timeout(tmp_path: pathlib.Path) -> None:
    tests_dir = tmp_path / "tests"
    tests_dir.mkdir()
    (tests_dir / "test_slow.py").write_text(
        "import time\ndef test_slow():\n    time.sleep(30)\n", encoding="utf-8"
    )
    result = check_tests(tmp_path, timeout=1)
    assert result.passed is False
    assert "timed out" in result.message.lower()


# -- check_syntax: skips hidden dirs and __pycache__ -----------------------


def test_check_syntax_skips_hidden_dirs(tmp_path: pathlib.Path) -> None:
    hidden = tmp_path / ".hidden"
    hidden.mkdir()
    (hidden / "bad.py").write_text("def f(\n", encoding="utf-8")
    (tmp_path / "good.py").write_text("x = 1\n", encoding="utf-8")
    result = check_syntax(tmp_path)
    assert result.passed is True


# -- check_security: finds os.system and __import__ ------------------------


def test_check_security_finds_os_system(tmp_path: pathlib.Path) -> None:
    (tmp_path / "danger.py").write_text("os.system('rm -rf /')\n", encoding="utf-8")
    result = check_security(tmp_path)
    assert result.passed is False
    assert "os.system(" in result.details


def test_check_security_finds_dunder_import(tmp_path: pathlib.Path) -> None:
    (tmp_path / "danger.py").write_text("__import__('os').system('ls')\n", encoding="utf-8")
    result = check_security(tmp_path)
    assert result.passed is False
    assert "__import__(" in result.details


def test_check_security_finds_shell_true(tmp_path: pathlib.Path) -> None:
    (tmp_path / "danger.py").write_text("subprocess.run('cmd', shell=True)\n", encoding="utf-8")
    result = check_security(tmp_path)
    assert result.passed is False
    assert "shell=True" in result.details


# -- check_security: no python files --------------------------------------


def test_check_security_no_files(tmp_path: pathlib.Path) -> None:
    result = check_security(tmp_path)
    assert result.passed is True


# -- Phase 2: unreadable file is logged and skipped -----------------------


def test_security_check_logs_unreadable_file(
    tmp_path: pathlib.Path,
    caplog: pytest.LogCaptureFixture,
) -> None:
    import logging

    bad_file = tmp_path / "unreadable.py"
    bad_file.write_text("x = 1\n", encoding="utf-8")

    with patch("pathlib.Path.read_text", side_effect=OSError("permission denied")):
        with caplog.at_level(logging.WARNING, logger="proxilion_build.verifier"):
            result = check_security(tmp_path)

    assert result.passed is True
    assert any(
        "unreadable" in r.message.lower() or "permission" in r.message.lower()
        for r in caplog.records
    )


# -- check_custom_command: command not found --------------------------------


def test_check_custom_command_not_found(tmp_path: pathlib.Path) -> None:
    result = check_custom_command(tmp_path, "nonexistent_command_xyz")
    assert result.passed is False
    assert "not found" in result.message.lower()


# -- check_custom_command: invalid shell syntax ----------------------------


def test_check_custom_command_invalid_syntax(tmp_path: pathlib.Path) -> None:
    result = check_custom_command(tmp_path, "echo 'unterminated")
    assert result.passed is False
    assert "Invalid command" in result.message


# -- _truncate: long output ------------------------------------------------


def test_truncate_long_output(tmp_path: pathlib.Path) -> None:
    (tmp_path / "tests").mkdir()
    from proxilion_build.verifier import _truncate

    short = "short text"
    assert _truncate(short) == short
    long = "x" * 20000
    truncated = _truncate(long)
    assert len(truncated) < len(long)
    assert "[truncated]" in truncated


# -- Phase 8: Verifier Completeness ----------------------------------------


def test_check_syntax_missing_python_handled(tmp_path: pathlib.Path) -> None:
    """check_syntax returns passed=False with a clear message when python3 is absent."""
    (tmp_path / "ok.py").write_text("x = 1\n", encoding="utf-8")
    with patch("subprocess.run", side_effect=FileNotFoundError("python3 not found")):
        result = check_syntax(tmp_path)
    assert result.passed is False
    assert "Python interpreter not found" in result.message


def test_check_security_skips_indented_comments(tmp_path: pathlib.Path) -> None:
    """Indented comment lines (with leading whitespace before #) must be skipped."""
    (tmp_path / "safe.py").write_text(
        "def f():\n    # eval(user_input) -- never do this\n    return 1\n",
        encoding="utf-8",
    )
    result = check_security(tmp_path)
    assert result.passed is True


def test_check_security_skips_multiline_strings(tmp_path: pathlib.Path) -> None:
    """Dangerous patterns inside triple-quoted strings must not be flagged."""
    docstring_content = (
        '"""\nDo not use eval(user_input) in production code.\n'
        'os.system("cmd") is dangerous.\n"""\nx = 1\n'
    )
    (tmp_path / "docs.py").write_text(docstring_content, encoding="utf-8")
    result = check_security(tmp_path)
    assert result.passed is True


def test_check_tests_pytest_not_installed(tmp_path: pathlib.Path) -> None:
    """When a tests/ dir exists but pytest is not found, return passed=False."""
    tests_dir = tmp_path / "tests"
    tests_dir.mkdir()
    (tests_dir / "test_stub.py").write_text("def test_x(): pass\n", encoding="utf-8")
    with patch("subprocess.run", side_effect=FileNotFoundError("pytest not found")):
        result = check_tests(tmp_path)
    assert result.passed is False
    assert "pytest not installed" in result.message


def test_custom_command_rejects_destructive(tmp_path: pathlib.Path) -> None:
    """Dangerous commands (rm, sudo, chmod, chown, mkfs) are rejected without execution."""
    destructive_cmds = (
        "rm -rf /",
        "sudo apt-get remove python3",
        "chmod 777 /etc",
        "chown root /",
        "mkfs /dev/sda",
    )
    for cmd in destructive_cmds:
        result = check_custom_command(tmp_path, cmd)
        assert result.passed is False, f"Expected rejection for: {cmd}"
        assert "potentially destructive" in result.message


# -- Phase 15: Security Scanner Adversarial Tests --------------------------


def test_eval_in_string_literal_not_flagged(tmp_path: pathlib.Path) -> None:
    """eval() inside a multiline triple-quoted string is not flagged."""
    (tmp_path / "docs.py").write_text(
        '"""\nNever call eval(user_input) in production.\n"""\nx = 1\n',
        encoding="utf-8",
    )
    result = check_security(tmp_path)
    assert result.passed is True


def test_eval_in_function_name_not_detected(tmp_path: pathlib.Path) -> None:
    """'evaluate(' is not flagged by the eval pattern."""
    (tmp_path / "safe.py").write_text(
        "def evaluate(x):\n    return x * 2\n",
        encoding="utf-8",
    )
    result = check_security(tmp_path)
    assert result.passed is True


def test_exec_in_variable_name_not_detected(tmp_path: pathlib.Path) -> None:
    """'executor = 1' is not flagged by the exec pattern."""
    (tmp_path / "safe.py").write_text(
        "executor = None\nexecution_count = 0\n",
        encoding="utf-8",
    )
    result = check_security(tmp_path)
    assert result.passed is True


def test_nested_dangerous_call(tmp_path: pathlib.Path) -> None:
    """getattr-based os.system bypass is not caught by simple pattern (known limitation)."""
    (tmp_path / "sneaky.py").write_text(
        "getattr(__import__('os'), 'system')('ls')\n",
        encoding="utf-8",
    )
    result = check_security(tmp_path)
    # The __import__( pattern should trigger a finding
    assert result.passed is False
    assert "__import__(" in result.details


# -- Phase 16: Coverage Improvement Tests ----------------------------------


def test_detect_languages_invalid_package_json(tmp_path: pathlib.Path) -> None:
    """detect_languages skips invalid package.json without crashing."""
    from proxilion_build.verifier import detect_languages

    (tmp_path / "package.json").write_text("{invalid json", encoding="utf-8")
    result = detect_languages(tmp_path)
    assert isinstance(result, set)


def test_check_lint_eslint_not_found(tmp_path: pathlib.Path) -> None:
    """check_lint for typescript returns skipped when eslint is not found."""
    from proxilion_build.verifier import check_lint

    with patch("subprocess.run", side_effect=FileNotFoundError("eslint not found")):
        result = check_lint(tmp_path, "typescript", tool_available=True)
    assert result.passed is True
    assert "not found" in result.message.lower() or "skipped" in result.message.lower()


def test_check_lint_timeout(tmp_path: pathlib.Path) -> None:
    """check_lint returns passed=False when linter times out."""
    from proxilion_build.verifier import check_lint

    with patch("subprocess.run", side_effect=subprocess.TimeoutExpired("ruff", 60)):
        result = check_lint(tmp_path, "python", tool_available=True)
    assert result.passed is False
    assert "timed out" in result.message.lower()


def test_check_coverage_not_found(tmp_path: pathlib.Path) -> None:
    """check_coverage returns skipped when pytest is not found."""
    from proxilion_build.verifier import check_coverage

    tests_dir = tmp_path / "tests"
    tests_dir.mkdir()
    with patch("subprocess.run", side_effect=FileNotFoundError("pytest")):
        result = check_coverage(tmp_path, language="python", threshold=80, tool_available=True)
    assert result.passed is True
    assert "skipped" in result.message.lower()


def test_check_coverage_timeout(tmp_path: pathlib.Path) -> None:
    """check_coverage returns passed=False when it times out."""
    from proxilion_build.verifier import check_coverage

    tests_dir = tmp_path / "tests"
    tests_dir.mkdir()
    with patch("subprocess.run", side_effect=subprocess.TimeoutExpired("pytest", 180)):
        result = check_coverage(tmp_path, language="python", threshold=80, tool_available=True)
    assert result.passed is False
    assert "timed out" in result.message.lower()


def test_check_pip_audit_not_found(tmp_path: pathlib.Path) -> None:
    """check_pip_audit returns skipped when pip-audit is not found."""
    from proxilion_build.verifier import check_pip_audit

    with patch("subprocess.run", side_effect=FileNotFoundError("pip-audit")):
        result = check_pip_audit(tmp_path, tool_available=True)
    assert result.passed is True
    assert "skipped" in result.message.lower()


def test_check_pip_audit_timeout(tmp_path: pathlib.Path) -> None:
    """check_pip_audit returns passed=False when it times out."""
    from proxilion_build.verifier import check_pip_audit

    with patch("subprocess.run", side_effect=subprocess.TimeoutExpired("pip-audit", 120)):
        result = check_pip_audit(tmp_path, tool_available=True)
    assert result.passed is False
    assert "timed out" in result.message.lower()


def test_check_playwright_not_found(tmp_path: pathlib.Path) -> None:
    """check_playwright returns skipped when npx is not found."""
    from proxilion_build.verifier import check_playwright

    (tmp_path / "e2e").mkdir()
    with patch("subprocess.run", side_effect=FileNotFoundError("npx")):
        result = check_playwright(tmp_path, tool_available=True, is_final_attempt=True)
    assert result.passed is True
    assert "skipped" in result.message.lower()


def test_check_playwright_timeout(tmp_path: pathlib.Path) -> None:
    """check_playwright returns passed=False when it times out."""
    from proxilion_build.verifier import check_playwright

    (tmp_path / "e2e").mkdir()
    with patch("subprocess.run", side_effect=subprocess.TimeoutExpired("npx", 300)):
        result = check_playwright(tmp_path, tool_available=True, is_final_attempt=True)
    assert result.passed is False
    assert "timed out" in result.message.lower()


def test_check_syntax_timeout(tmp_path: pathlib.Path) -> None:
    """When python compilation times out for a file, it is reported as an error."""
    (tmp_path / "slow.py").write_text("x = 1\n", encoding="utf-8")
    with patch("subprocess.run", side_effect=subprocess.TimeoutExpired("python3", 10)):
        result = check_syntax(tmp_path)
    assert result.passed is False
    assert "timed out" in result.details.lower()


def test_verify_with_tools_and_languages(tmp_path: pathlib.Path) -> None:
    """verify() with tools and languages dict includes lint and pip-audit checks."""
    from proxilion_build.verifier import verify

    (tmp_path / "ok.py").write_text("x = 1\n", encoding="utf-8")
    result = verify(
        tmp_path,
        tools={"ruff": False, "pip-audit": False},
        languages={"python"},
    )
    check_names = {c.name for c in result.checks}
    assert "lint" in check_names
    assert "pip_audit" in check_names


# -- spec-v8 Phase 2: Command injection vulnerability fixes -----------------


def test_custom_command_rejects_absolute_path_rm(tmp_path: pathlib.Path) -> None:
    """Commands using absolute paths to dangerous commands are rejected."""
    result = check_custom_command(tmp_path, "/bin/rm -rf /")
    assert result.passed is False
    assert "rm" in result.message
    assert "potentially destructive" in result.message


def test_custom_command_rejects_shell_metacharacters(tmp_path: pathlib.Path) -> None:
    """Commands containing shell metacharacters are rejected."""
    result = check_custom_command(tmp_path, "echo; rm -rf /")
    assert result.passed is False
    assert "shell metacharacters" in result.message


def test_custom_command_allows_safe_commands(tmp_path: pathlib.Path) -> None:
    """Safe commands like python3 -m pytest are allowed."""
    result = check_custom_command(tmp_path, "python3 -m pytest")
    # The command may fail due to pytest not finding tests, but it should not
    # be rejected by the safety checks
    assert "potentially destructive" not in result.message
    assert "shell metacharacters" not in result.message


# -- spec-v8 Phase 4: Multiline string delimiter tracking bug fix (Issue 17) --


def test_security_scan_mixed_triple_quotes(tmp_path: pathlib.Path) -> None:
    """Code with triple-single inside triple-double is handled correctly."""
    # Triple-single quotes inside a triple-double string should not close the string
    # We use concatenation to avoid escaping issues in the test itself
    code = (
        '"""\n'
        "This is a docstring with triple-single ''' inside it.\n"
        "More docstring content.\n"
        '"""\n'
        "x = 1\n"
    )
    (tmp_path / "mixed_quotes.py").write_text(code, encoding="utf-8")
    result = check_security(tmp_path)
    assert result.passed is True


def test_security_scan_eval_in_docstring_no_false_positive(tmp_path: pathlib.Path) -> None:
    """eval() inside a docstring is not flagged."""
    code = (
        "def safe_function():\n"
        '    """\n'
        "    Warning: Do not use eval(user_input) in production code.\n"
        "    This function safely processes data without eval.\n"
        '    """\n'
        "    return 42\n"
    )
    (tmp_path / "docstring_eval.py").write_text(code, encoding="utf-8")
    result = check_security(tmp_path)
    assert result.passed is True


# -- spec-v8 Phase 5: Aggregate timeout for syntax check (Issue 26) ----------


def test_syntax_check_aggregate_timeout(tmp_path: pathlib.Path) -> None:
    """With many files and a short aggregate timeout, verify it stops early."""
    import time

    # Create multiple Python files
    for i in range(10):
        (tmp_path / f"file_{i}.py").write_text(f"x_{i} = {i}\n", encoding="utf-8")

    # Patch time.monotonic to simulate time passing quickly
    call_count = 0
    original_monotonic = time.monotonic
    base_time = original_monotonic()

    def mock_monotonic() -> float:
        nonlocal call_count
        call_count += 1
        # Return base time + 1 second for each call, so after a few files we exceed timeout
        return base_time + call_count * 0.5  # 0.5s per call

    with patch("time.monotonic", side_effect=mock_monotonic):
        # Use a very short aggregate timeout (1 second) so it triggers quickly
        result = check_syntax(tmp_path, aggregate_timeout=1)

    assert result.passed is False
    assert "Aggregate timeout" in result.details
    # Verify not all files were checked (early termination)
    assert "after checking" in result.details
