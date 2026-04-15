"""Tests for the verifier module."""

from __future__ import annotations

import os
import pathlib
import subprocess
import sys
from unittest.mock import patch

import pytest

from codelicious.verifier import (
    CheckResult,
    VerificationResult,
    _escape_markdown_cell,
    _validate_command_args,
    check_coverage,
    check_custom_command,
    check_security,
    check_syntax,
    check_tests,
    verify,
    write_build_summary,
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
    (tmp_path / "commented.py").write_text("# eval(user_input) is dangerous\nx = 1\n", encoding="utf-8")
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
    assert {c.name for c in result.checks} == {"syntax", "tests", "security"}


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
    (tests_dir / "test_ok.py").write_text("def test_simple():\n    assert 1 + 1 == 2\n", encoding="utf-8")
    passing = subprocess.CompletedProcess(
        args=[],
        returncode=0,
        stdout="1 passed\n",
        stderr="",
    )
    with patch("codelicious.verifier.subprocess.run", return_value=passing):
        result = check_tests(tmp_path)
    assert result.passed is True
    assert "passed" in result.message.lower()


# -- check_tests: tests fail -----------------------------------------------


def test_check_tests_failing(tmp_path: pathlib.Path) -> None:
    tests_dir = tmp_path / "tests"
    tests_dir.mkdir()
    (tests_dir / "test_fail.py").write_text("def test_bad():\n    assert False\n", encoding="utf-8")
    failing = subprocess.CompletedProcess(
        args=[],
        returncode=1,
        stdout="1 failed\n",
        stderr="",
    )
    with patch("codelicious.verifier.subprocess.run", return_value=failing):
        result = check_tests(tmp_path)
    assert result.passed is False
    assert "failed" in result.message.lower()


# -- check_tests: timeout --------------------------------------------------


def test_check_tests_timeout(tmp_path: pathlib.Path) -> None:
    tests_dir = tmp_path / "tests"
    tests_dir.mkdir()
    (tests_dir / "test_slow.py").write_text("import time\ndef test_slow():\n    time.sleep(30)\n", encoding="utf-8")
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


@pytest.mark.skipif(sys.platform == "win32", reason="os.chmod permission bits not honoured on Windows")
def test_security_check_logs_unreadable_file(
    tmp_path: pathlib.Path,
    caplog: pytest.LogCaptureFixture,
) -> None:
    import logging

    bad_file = tmp_path / "unreadable.py"
    bad_file.write_text("x = 1\n", encoding="utf-8")
    os.chmod(bad_file, 0o000)
    try:
        with caplog.at_level(logging.WARNING, logger="codelicious.verifier"):
            result = check_security(tmp_path)
    finally:
        os.chmod(bad_file, 0o644)

    assert result.passed is True
    assert any("unreadable" in r.message.lower() or "permission" in r.message.lower() for r in caplog.records)


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
    from codelicious.verifier import _truncate

    short = "short text"
    assert _truncate(short) == short
    long = "x" * 20000
    truncated = _truncate(long)
    assert len(truncated) < len(long)
    assert "[truncated]" in truncated


# -- Phase 8: Verifier Completeness ----------------------------------------


def test_check_syntax_detects_syntax_error_via_compile(tmp_path: pathlib.Path) -> None:
    """check_syntax detects syntax errors using in-process compile()."""
    (tmp_path / "bad.py").write_text("def f(\n", encoding="utf-8")
    result = check_syntax(tmp_path)
    assert result.passed is False
    assert "bad.py" in result.message or "bad.py" in (result.details or "")


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
        '"""\nDo not use eval(user_input) in production code.\nos.system("cmd") is dangerous.\n"""\nx = 1\n'
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
    from codelicious.verifier import detect_languages

    (tmp_path / "package.json").write_text("{invalid json", encoding="utf-8")
    result = detect_languages(tmp_path)
    assert isinstance(result, set)


def test_check_lint_eslint_not_found(tmp_path: pathlib.Path) -> None:
    """check_lint for typescript returns skipped when eslint is not found."""
    from codelicious.verifier import check_lint

    with patch("subprocess.run", side_effect=FileNotFoundError("eslint not found")):
        result = check_lint(tmp_path, "typescript", tool_available=True)
    assert result.passed is True
    assert "not found" in result.message.lower() or "skipped" in result.message.lower()


def test_check_lint_timeout(tmp_path: pathlib.Path) -> None:
    """check_lint returns passed=False when linter times out."""
    from codelicious.verifier import check_lint

    with patch("subprocess.run", side_effect=subprocess.TimeoutExpired("ruff", 60)):
        result = check_lint(tmp_path, "python", tool_available=True)
    assert result.passed is False
    assert "timed out" in result.message.lower()


def test_check_coverage_not_found(tmp_path: pathlib.Path) -> None:
    """check_coverage returns skipped when pytest is not found."""
    from codelicious.verifier import check_coverage

    tests_dir = tmp_path / "tests"
    tests_dir.mkdir()
    with patch("subprocess.run", side_effect=FileNotFoundError("pytest")):
        result = check_coverage(tmp_path, language="python", threshold=80, tool_available=True)
    assert result.passed is True
    assert "skipped" in result.message.lower()


def test_check_coverage_timeout(tmp_path: pathlib.Path) -> None:
    """check_coverage returns passed=False when it times out."""
    from codelicious.verifier import check_coverage

    tests_dir = tmp_path / "tests"
    tests_dir.mkdir()
    with patch("subprocess.run", side_effect=subprocess.TimeoutExpired("pytest", 180)):
        result = check_coverage(tmp_path, language="python", threshold=80, tool_available=True)
    assert result.passed is False
    assert "timed out" in result.message.lower()


def test_check_pip_audit_not_found(tmp_path: pathlib.Path) -> None:
    """check_pip_audit returns skipped when pip-audit is not found."""
    from codelicious.verifier import check_pip_audit

    with patch("subprocess.run", side_effect=FileNotFoundError("pip-audit")):
        result = check_pip_audit(tmp_path, tool_available=True)
    assert result.passed is True
    assert "skipped" in result.message.lower()


def test_check_pip_audit_timeout(tmp_path: pathlib.Path) -> None:
    """check_pip_audit returns passed=False when it times out."""
    from codelicious.verifier import check_pip_audit

    with patch("subprocess.run", side_effect=subprocess.TimeoutExpired("pip-audit", 120)):
        result = check_pip_audit(tmp_path, tool_available=True)
    assert result.passed is False
    assert "timed out" in result.message.lower()


def test_check_playwright_not_found(tmp_path: pathlib.Path) -> None:
    """check_playwright returns skipped when npx is not found."""
    from codelicious.verifier import check_playwright

    (tmp_path / "e2e").mkdir()
    with patch("subprocess.run", side_effect=FileNotFoundError("npx")):
        result = check_playwright(tmp_path, tool_available=True, is_final_attempt=True)
    assert result.passed is True
    assert "skipped" in result.message.lower()


def test_check_playwright_timeout(tmp_path: pathlib.Path) -> None:
    """check_playwright returns passed=False when it times out."""
    from codelicious.verifier import check_playwright

    (tmp_path / "e2e").mkdir()
    with patch("subprocess.run", side_effect=subprocess.TimeoutExpired("npx", 300)):
        result = check_playwright(tmp_path, tool_available=True, is_final_attempt=True)
    assert result.passed is False
    assert "timed out" in result.message.lower()


def test_check_syntax_aggregate_timeout(tmp_path: pathlib.Path) -> None:
    """When aggregate timeout is exceeded, check_syntax reports the timeout error."""
    (tmp_path / "a.py").write_text("x = 1\n", encoding="utf-8")
    (tmp_path / "b.py").write_text("y = 2\n", encoding="utf-8")
    # Use an aggregate timeout of 0 so it triggers immediately after the first file
    result = check_syntax(tmp_path, aggregate_timeout=0)
    assert result.passed is False
    assert "timeout" in result.message.lower() or "timeout" in (result.details or "").lower()


def test_verify_with_tools_and_languages(tmp_path: pathlib.Path) -> None:
    """verify() with tools and languages dict includes lint and pip-audit checks."""
    from codelicious.verifier import verify

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
    """Safe commands like ruff check are allowed."""
    # Note: python3 is blocked by the interpreter denylist (spec-08 Phase 3)
    # to prevent arbitrary code execution via python3 -c.
    # Use direct tool invocations like ruff instead.
    result = check_custom_command(tmp_path, "ruff check .")
    # The command may fail due to ruff not being installed, but it should not
    # be rejected by the safety checks
    assert "potentially destructive" not in result.message
    assert "shell metacharacters" not in result.message


# -- spec-v8 Phase 4: Multiline string delimiter tracking bug fix (Issue 17) --


def test_security_scan_mixed_triple_quotes(tmp_path: pathlib.Path) -> None:
    """Code with triple-single inside triple-double is handled correctly."""
    # Triple-single quotes inside a triple-double string should not close the string
    # We use concatenation to avoid escaping issues in the test itself
    code = '"""\nThis is a docstring with triple-single \'\'\' inside it.\nMore docstring content.\n"""\nx = 1\n'
    (tmp_path / "mixed_quotes.py").write_text(code, encoding="utf-8")
    result = check_security(tmp_path)
    assert result.passed is True


def test_security_scan_eval_in_docstring_no_false_positive(
    tmp_path: pathlib.Path,
) -> None:
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


# -- spec-16 Phase 9: Verifier Command Injection and Secret Detection ------


def test_custom_command_rejects_newline_in_command(tmp_path: pathlib.Path) -> None:
    """Commands with newline characters are rejected (P2-8)."""
    result = check_custom_command(tmp_path, "echo hello\nrm -rf /")
    assert result.passed is False
    assert "newline" in result.message.lower()


def test_custom_command_rejects_carriage_return_in_command(tmp_path: pathlib.Path) -> None:
    """Commands with carriage return are rejected (P2-8)."""
    result = check_custom_command(tmp_path, "echo hello\rmalicious")
    assert result.passed is False
    assert "newline" in result.message.lower()


def test_google_api_key_detected(tmp_path: pathlib.Path) -> None:
    """Google API keys (AIza...) are detected as secrets (P2-9)."""
    (tmp_path / "secrets.py").write_text(
        "API_KEY = 'AIzaSyDaGmWKa4JsXZ-HjGw7ISLn_3namBGewQe'\n",
        encoding="utf-8",
    )
    result = check_security(tmp_path)
    assert result.passed is False
    assert "secret" in result.details.lower()


def test_stripe_secret_key_detected(tmp_path: pathlib.Path) -> None:
    """Stripe secret keys (sk_live_...) are detected as secrets (P2-9).

    Note: We use 51iveXXX instead of sk_live_ to avoid GitHub secret scanning
    while still testing the regex pattern. The test file is written dynamically.
    """
    # Construct the key dynamically to avoid GitHub secret scanning in this file
    sk_prefix = "sk_" + "live_"
    key_suffix = "XXXXXXXXXXXXXXXXXXXXXXXXXX"
    (tmp_path / "payment.py").write_text(
        f"STRIPE_KEY = '{sk_prefix}{key_suffix}'\n",
        encoding="utf-8",
    )
    result = check_security(tmp_path)
    assert result.passed is False
    assert "secret" in result.details.lower()


def test_stripe_publishable_key_detected(tmp_path: pathlib.Path) -> None:
    """Stripe publishable keys (pk_live_...) are detected as secrets (P2-9).

    Note: We construct the key dynamically to avoid GitHub secret scanning.
    """
    # Construct the key dynamically to avoid GitHub secret scanning in this file
    pk_prefix = "pk_" + "live_"
    key_suffix = "XXXXXXXXXXXXXXXXXXXXXXXXXX"
    (tmp_path / "payment.py").write_text(
        f"STRIPE_PK = '{pk_prefix}{key_suffix}'\n",
        encoding="utf-8",
    )
    result = check_security(tmp_path)
    assert result.passed is False
    assert "secret" in result.details.lower()


def test_jwt_token_detected(tmp_path: pathlib.Path) -> None:
    """JWT tokens (eyJ...) are detected as secrets (P2-9)."""
    # A realistic JWT structure: header.payload.signature
    (tmp_path / "auth.py").write_text(
        "TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N'\n",
        encoding="utf-8",
    )
    result = check_security(tmp_path)
    assert result.passed is False
    assert "secret" in result.details.lower()


def test_password_base64_detected(tmp_path: pathlib.Path) -> None:
    """Password/secret/token with base64 value is detected (P2-9)."""
    (tmp_path / "config.py").write_text(
        "password = 'SGVsbG9Xb3JsZEVuY29kZWRQYXNzd29yZA=='\n",
        encoding="utf-8",
    )
    result = check_security(tmp_path)
    assert result.passed is False
    assert "secret" in result.details.lower()


def test_legitimate_base64_not_flagged_without_context(tmp_path: pathlib.Path) -> None:
    """Base64 strings without password/secret/token context are not flagged."""
    # A base64 string that is NOT preceded by password/secret/token keyword
    (tmp_path / "data.py").write_text(
        "encoded_data = 'SGVsbG9Xb3JsZEVuY29kZWREYXRh'\n",
        encoding="utf-8",
    )
    result = check_security(tmp_path)
    # This should pass because it's not preceded by password/secret/token
    # and doesn't match other secret patterns
    assert result.passed is True


# ---------------------------------------------------------------------------
# Finding 83: check_syntax — OSError triggers subprocess fallback
# ---------------------------------------------------------------------------


def test_check_syntax_oserror_triggers_subprocess_fallback(tmp_path: pathlib.Path) -> None:
    """When Path.read_text raises OSError, check_syntax falls back to subprocess py_compile.

    The fallback subprocess call is mocked to succeed (returncode=0), so the
    overall check should still pass.
    """
    import subprocess as _sp
    import sys

    (tmp_path / "maybe_unreadable.py").write_text("x = 1\n", encoding="utf-8")

    mock_result = _sp.CompletedProcess(
        args=[sys.executable, "-m", "py_compile", str(tmp_path / "maybe_unreadable.py")],
        returncode=0,
        stdout="",
        stderr="",
    )

    with patch("codelicious.verifier.pathlib.Path.read_text", side_effect=OSError("permission denied")):
        with patch("subprocess.run", return_value=mock_result) as mock_run:
            result = check_syntax(tmp_path)

    # subprocess.run should have been called as the fallback
    assert mock_run.call_count >= 1
    # Because the mock subprocess returns success, the overall check passes
    assert result.passed is True


def test_check_syntax_oserror_subprocess_reports_error(tmp_path: pathlib.Path) -> None:
    """When Path.read_text raises OSError and subprocess reports a syntax error,
    check_syntax returns passed=False.
    """
    import subprocess as _sp
    import sys

    (tmp_path / "broken.py").write_text("def f(\n", encoding="utf-8")

    mock_result = _sp.CompletedProcess(
        args=[sys.executable, "-m", "py_compile", str(tmp_path / "broken.py")],
        returncode=1,
        stdout="",
        stderr="broken.py:1: SyntaxError: unexpected EOF",
    )

    with patch("codelicious.verifier.pathlib.Path.read_text", side_effect=OSError("permission denied")):
        with patch("subprocess.run", return_value=mock_result):
            result = check_syntax(tmp_path)

    assert result.passed is False
    assert "broken.py" in (result.details or "")


# ---------------------------------------------------------------------------
# Finding 84: _strip_string_literals()
# ---------------------------------------------------------------------------


def test_strip_string_literals_raw_string_eval() -> None:
    """r\"eval(test)\" — after stripping, eval( must not appear in output."""
    from codelicious.verifier import _strip_string_literals

    line = 'x = r"eval(test)"'
    stripped = _strip_string_literals(line)
    assert "eval(" not in stripped


def test_strip_string_literals_triple_quoted_shell_true() -> None:
    """Triple-quoted string containing shell=True is stripped."""
    from codelicious.verifier import _strip_string_literals

    line = '"""subprocess.run(cmd, shell=True)"""'
    stripped = _strip_string_literals(line)
    assert "shell=True" not in stripped


def test_strip_string_literals_preserves_code_outside_strings() -> None:
    """Code outside string literals is preserved intact."""
    from codelicious.verifier import _strip_string_literals

    line = "x = 1 + 2  # no string here"
    stripped = _strip_string_literals(line)
    # Non-string tokens and comment remain
    assert "x" in stripped
    assert "1" in stripped


# ---------------------------------------------------------------------------
# Finding 54: check_lint() — lint violations path (non-zero exit)
# ---------------------------------------------------------------------------


def test_check_lint_violations_python(tmp_path: pathlib.Path) -> None:
    """check_lint returns passed=False when ruff exits with non-zero (Finding 54)."""
    from codelicious.verifier import check_lint

    mock_result = subprocess.CompletedProcess(
        args=["ruff", "check", "."],
        returncode=1,
        stdout="src/foo.py:10:1: E501 Line too long\n",
        stderr="",
    )
    with patch("subprocess.run", return_value=mock_result):
        result = check_lint(tmp_path, "python", tool_available=True)

    assert result.passed is False
    assert result.name == "lint"
    assert "violations" in result.message.lower() or "exit 1" in result.message
    assert "E501" in result.details


def test_check_lint_violations_typescript(tmp_path: pathlib.Path) -> None:
    """check_lint returns passed=False when eslint exits with non-zero (Finding 54)."""
    from codelicious.verifier import check_lint

    mock_result = subprocess.CompletedProcess(
        args=["eslint", "."],
        returncode=1,
        stdout="src/index.ts: 3:1  error  'x' is not defined  no-undef\n",
        stderr="",
    )
    with patch("subprocess.run", return_value=mock_result):
        result = check_lint(tmp_path, "typescript", tool_available=True)

    assert result.passed is False
    assert result.name == "lint"
    assert "no-undef" in result.details


def test_check_lint_passes_on_zero_exit(tmp_path: pathlib.Path) -> None:
    """check_lint returns passed=True when the linter exits 0 (Finding 54 complement)."""
    from codelicious.verifier import check_lint

    mock_result = subprocess.CompletedProcess(
        args=["ruff", "check", "."],
        returncode=0,
        stdout="All checks passed.\n",
        stderr="",
    )
    with patch("subprocess.run", return_value=mock_result):
        result = check_lint(tmp_path, "python", tool_available=True)

    assert result.passed is True
    assert result.name == "lint"
    assert "passed" in result.message.lower()


# ---------------------------------------------------------------------------
# Finding 55: check_coverage() — coverage % extraction regex
# ---------------------------------------------------------------------------


def test_check_coverage_passes_with_pct_extraction(tmp_path: pathlib.Path) -> None:
    """check_coverage extracts percentage from TOTAL line and passes when >= threshold (Finding 55)."""
    from codelicious.verifier import check_coverage

    tests_dir = tmp_path / "tests"
    tests_dir.mkdir()

    # Realistic pytest-cov output: TOTAL <stmts> <miss> <cover>%
    cov_output = (
        "Name          Stmts   Miss  Cover\n"
        "-----------------------------------\n"
        "src/foo.py       10      0   100%\n"
        "-----------------------------------\n"
        "TOTAL            10      0   100%\n"
        "\n"
        "1 passed in 0.12s\n"
    )
    mock_result = subprocess.CompletedProcess(
        args=["pytest"],
        returncode=0,
        stdout=cov_output,
        stderr="",
    )
    with patch("subprocess.run", return_value=mock_result):
        result = check_coverage(tmp_path, language="python", threshold=80, tool_available=True)

    assert result.passed is True
    assert result.name == "coverage"
    assert "100%" in result.message
    assert "80%" in result.message


def test_check_coverage_fails_with_pct_extraction(tmp_path: pathlib.Path) -> None:
    """check_coverage extracts percentage from TOTAL line and fails when below threshold (Finding 55)."""
    from codelicious.verifier import check_coverage

    tests_dir = tmp_path / "tests"
    tests_dir.mkdir()

    # 50% coverage — below an 80% threshold
    cov_output = (
        "Name          Stmts   Miss  Cover\n"
        "-----------------------------------\n"
        "src/foo.py      100     50    50%\n"
        "-----------------------------------\n"
        "TOTAL           100     50    50%\n"
        "\n"
        "1 passed in 0.15s\n"
    )
    mock_result = subprocess.CompletedProcess(
        args=["pytest"],
        returncode=1,
        stdout=cov_output,
        stderr="",
    )
    with patch("subprocess.run", return_value=mock_result):
        result = check_coverage(tmp_path, language="python", threshold=80, tool_available=True)

    assert result.passed is False
    assert result.name == "coverage"
    assert "50%" in result.message
    assert "80%" in result.message


def test_check_coverage_fails_without_pct_in_output(tmp_path: pathlib.Path) -> None:
    """check_coverage returns generic failure message when TOTAL line is absent (Finding 55)."""
    from codelicious.verifier import check_coverage

    tests_dir = tmp_path / "tests"
    tests_dir.mkdir()

    mock_result = subprocess.CompletedProcess(
        args=["pytest"],
        returncode=1,
        stdout="some output without a TOTAL line\n",
        stderr="",
    )
    with patch("subprocess.run", return_value=mock_result):
        result = check_coverage(tmp_path, language="python", threshold=80, tool_available=True)

    assert result.passed is False
    assert result.name == "coverage"
    # Generic fallback message when no pct extracted
    assert "threshold" in result.message.lower()


# ---------------------------------------------------------------------------
# Finding 56: check_pip_audit() — success and vulnerability-found paths
# ---------------------------------------------------------------------------


def test_check_pip_audit_no_cves(tmp_path: pathlib.Path) -> None:
    """check_pip_audit returns passed=True with 'No known CVEs' when exit 0 (Finding 56)."""
    from codelicious.verifier import check_pip_audit

    mock_result = subprocess.CompletedProcess(
        args=["pip-audit", "--format=json", "-q"],
        returncode=0,
        stdout="[]\n",
        stderr="",
    )
    with patch("subprocess.run", return_value=mock_result):
        result = check_pip_audit(tmp_path, tool_available=True)

    assert result.passed is True
    assert result.name == "pip_audit"
    assert "no known cves" in result.message.lower()


def test_check_pip_audit_vulnerabilities_found(tmp_path: pathlib.Path) -> None:
    """check_pip_audit returns passed=False with vulnerability message when exit 1 (Finding 56)."""
    from codelicious.verifier import check_pip_audit

    vuln_json = (
        '[{"name": "requests", "version": "2.25.0", "vulns": [{"id": "PYSEC-2023-74", "fix_versions": ["2.31.0"]}]}]\n'
    )
    mock_result = subprocess.CompletedProcess(
        args=["pip-audit", "--format=json", "-q"],
        returncode=1,
        stdout=vuln_json,
        stderr="",
    )
    with patch("subprocess.run", return_value=mock_result):
        result = check_pip_audit(tmp_path, tool_available=True)

    assert result.passed is False
    assert result.name == "pip_audit"
    assert "vulnerabilities" in result.message.lower() or "exit 1" in result.message
    assert "PYSEC-2023-74" in result.details


# ---------------------------------------------------------------------------
# Finding 52: probe_tools() coverage
# ---------------------------------------------------------------------------


def test_probe_tools_returns_dict_keyed_by_all_tool_names(tmp_path: pathlib.Path) -> None:
    """probe_tools() returns a dict whose keys include every tool in _TOOL_NAMES."""
    from codelicious.verifier import _TOOL_NAMES, probe_tools

    # Clear the lru_cache so our patched shutil.which is used
    probe_tools.cache_clear()
    try:
        with patch("shutil.which", return_value="/usr/bin/ruff"):
            result = probe_tools(tmp_path)
    finally:
        probe_tools.cache_clear()

    assert isinstance(result, dict)
    for tool in _TOOL_NAMES:
        assert tool in result, f"Expected tool {tool!r} to be a key in probe_tools result"
    # All values should be True since shutil.which returns a non-None string
    assert all(result[tool] is True for tool in _TOOL_NAMES)


def test_probe_tools_marks_missing_tools_false(tmp_path: pathlib.Path) -> None:
    """probe_tools() marks tools as False when shutil.which returns None."""
    from codelicious.verifier import probe_tools

    probe_tools.cache_clear()
    try:
        with patch("shutil.which", return_value=None):
            result = probe_tools(tmp_path)
    finally:
        probe_tools.cache_clear()

    assert all(result[tool] is False for tool in result)


# ---------------------------------------------------------------------------
# Finding 53: detect_languages() branch coverage
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "indicator_file,expected_language",
    [
        ("setup.py", "python"),
        ("tsconfig.json", "typescript"),
        ("Cargo.toml", "rust"),
        ("go.mod", "go"),
    ],
)
def test_detect_languages_indicator_file(
    tmp_path: pathlib.Path,
    indicator_file: str,
    expected_language: str,
) -> None:
    """detect_languages() detects the correct language from each indicator file."""
    from codelicious.verifier import detect_languages

    (tmp_path / indicator_file).write_text("", encoding="utf-8")
    result = detect_languages(tmp_path)
    assert isinstance(result, set)
    assert expected_language in result, (
        f"Expected {expected_language!r} in detected languages for indicator {indicator_file!r}, got {result!r}"
    )


def test_detect_languages_pyproject_toml(tmp_path: pathlib.Path) -> None:
    """detect_languages() detects python when pyproject.toml is present."""
    from codelicious.verifier import detect_languages

    (tmp_path / "pyproject.toml").write_text("[tool.pytest]\n", encoding="utf-8")
    result = detect_languages(tmp_path)
    assert "python" in result


def test_detect_languages_empty_dir_returns_empty_set(tmp_path: pathlib.Path) -> None:
    """detect_languages() returns an empty set for a directory with no indicators."""
    from codelicious.verifier import detect_languages

    result = detect_languages(tmp_path)
    assert result == set()


# ---------------------------------------------------------------------------
# Finding 57: write_build_summary() coverage
# ---------------------------------------------------------------------------


def test_write_build_summary_creates_file(tmp_path: pathlib.Path) -> None:
    """write_build_summary() creates .codelicious/build-summary.md."""
    from codelicious.verifier import write_build_summary

    path = write_build_summary(
        tmp_path,
        state_completed=["task1"],
        state_failed=["task2"],
        state_skipped=["task3"],
        last_verification=None,
    )

    assert path.exists(), "build-summary.md should be created"
    assert path.name == "build-summary.md"
    assert path.parent.name == ".codelicious"


def test_write_build_summary_contains_task_info(tmp_path: pathlib.Path) -> None:
    """write_build_summary() writes completed/failed/skipped counts to the file."""
    from codelicious.verifier import write_build_summary

    path = write_build_summary(
        tmp_path,
        state_completed=["task1", "task2"],
        state_failed=["task3"],
        state_skipped=[],
        last_verification=None,
    )

    content = path.read_text(encoding="utf-8")
    assert "2 completed" in content
    assert "1 failed" in content
    assert "0 skipped" in content


def test_write_build_summary_with_verification_result(tmp_path: pathlib.Path) -> None:
    """write_build_summary() includes verification check rows when last_verification is provided."""
    from codelicious.verifier import CheckResult, VerificationResult, write_build_summary

    vr = VerificationResult(
        checks=[
            CheckResult(name="syntax", passed=True, message="All good"),
            CheckResult(name="tests", passed=False, message="2 failed"),
        ]
    )
    path = write_build_summary(
        tmp_path,
        state_completed=["task1"],
        state_failed=[],
        state_skipped=[],
        last_verification=vr,
    )

    content = path.read_text(encoding="utf-8")
    assert "syntax" in content
    assert "tests" in content
    assert "FAIL" in content


# ---------------------------------------------------------------------------
# Finding 58: verify() coverage_threshold > 0 branch
# ---------------------------------------------------------------------------


def test_verify_coverage_threshold_branch(tmp_path: pathlib.Path) -> None:
    """verify() includes coverage check when coverage_threshold > 0 and python is in languages."""
    import subprocess as _sp

    from codelicious.verifier import verify

    (tmp_path / "ok.py").write_text("x = 1\n", encoding="utf-8")

    # Simulate pytest --cov output with a passing TOTAL line
    cov_output = (
        "Name          Stmts   Miss  Cover\n"
        "-----------------------------------\n"
        "ok.py             1      0   100%\n"
        "-----------------------------------\n"
        "TOTAL             1      0   100%\n"
        "1 passed in 0.05s\n"
    )
    mock_result = _sp.CompletedProcess(args=[], returncode=0, stdout=cov_output, stderr="")

    with patch("subprocess.run", return_value=mock_result):
        with patch("codelicious.verifier._pytest_cov_available", return_value=True):
            result = verify(
                tmp_path,
                coverage_threshold=80,
                tools={"ruff": False, "pip-audit": False},
                languages={"python"},
            )

    check_names = {c.name for c in result.checks}
    assert "coverage" in check_names, (
        f"Expected 'coverage' check when coverage_threshold=80 and python in languages; got {check_names!r}"
    )


# ---------------------------------------------------------------------------
# Finding 47: check_syntax — file size ceiling for compile() DoS prevention
# ---------------------------------------------------------------------------


def test_check_syntax_skips_oversized_file(tmp_path: pathlib.Path) -> None:
    """Files larger than _MAX_COMPILE_SIZE are not compiled; an error is recorded (Finding 47)."""
    from codelicious.verifier import _MAX_COMPILE_SIZE

    large_file = tmp_path / "huge.py"
    # Write a file that is 1 byte over the limit.  Use a comment so it would be
    # syntactically valid if compiled — that way any failure is due to the size
    # guard, not an actual syntax error.
    large_file.write_bytes(b"# " + b"x" * (_MAX_COMPILE_SIZE - 1))

    result = check_syntax(tmp_path)

    assert result.passed is False
    assert result.details is not None
    assert "huge.py" in result.details
    assert "too large" in result.details


def test_check_syntax_compiles_file_at_exact_limit(tmp_path: pathlib.Path) -> None:
    """A file whose byte length equals _MAX_COMPILE_SIZE is still compiled (Finding 47 boundary)."""
    from codelicious.verifier import _MAX_COMPILE_SIZE

    boundary_file = tmp_path / "boundary.py"
    # The content must be valid Python.  Use a comment padded to exactly the limit.
    content = "# " + "x" * (_MAX_COMPILE_SIZE - 2)
    assert len(content) == _MAX_COMPILE_SIZE
    boundary_file.write_text(content, encoding="utf-8")

    result = check_syntax(tmp_path)

    assert result.passed is True


# ---------------------------------------------------------------------------
# Finding 48: check_security — opening line before triple-quote is scanned
# ---------------------------------------------------------------------------


def test_check_security_detects_eval_before_triple_quote_opening(tmp_path: pathlib.Path) -> None:
    """A dangerous call on the same line as a triple-quote opening is detected (Finding 48).

    When a line has code before the first triple-quote delimiter, that portion
    must be scanned even though the rest of the line opens a multiline string.
    """
    # The dangerous call appears *before* the opening triple-quote on the same line.
    code = 'result = eval(x); msg = """start of\nmultiline string\n"""\n'
    (tmp_path / "tricky.py").write_text(code, encoding="utf-8")

    result = check_security(tmp_path)

    assert result.passed is False
    assert "eval(" in result.details


def test_check_security_no_false_positive_at_triple_quote_opening(tmp_path: pathlib.Path) -> None:
    """A clean assignment before a triple-quote opening is not flagged (Finding 48 complement)."""
    code = 'x = 1; msg = """start of\nmultiline string\n"""\n'
    (tmp_path / "clean_multiline.py").write_text(code, encoding="utf-8")

    result = check_security(tmp_path)

    assert result.passed is True


# ---------------------------------------------------------------------------
# Finding 59: probe_tools() — all tools absent when shutil.which returns None
# ---------------------------------------------------------------------------


def test_probe_tools_all_tools_absent_when_which_returns_none(tmp_path: pathlib.Path) -> None:
    """probe_tools() returns a dict keyed by every _TOOL_NAMES entry, all False, when
    shutil.which returns None for every tool (Finding 59)."""
    from codelicious.verifier import _TOOL_NAMES, probe_tools

    probe_tools.cache_clear()
    try:
        with patch("shutil.which", return_value=None):
            result = probe_tools(tmp_path)
    finally:
        probe_tools.cache_clear()

    assert isinstance(result, dict)
    for tool in _TOOL_NAMES:
        assert tool in result, f"Expected key {tool!r} in probe_tools() result, got {sorted(result)!r}"
        assert result[tool] is False, f"Expected probe_tools()[{tool!r}] to be False, got {result[tool]!r}"


# ---------------------------------------------------------------------------
# Finding 60: detect_languages() — web branch via package.json with react dep
# ---------------------------------------------------------------------------


def test_detect_languages_package_json_react_dep_adds_web(tmp_path: pathlib.Path) -> None:
    """detect_languages() adds 'web' when package.json has react in dependencies (Finding 60)."""
    import json as _json

    from codelicious.verifier import detect_languages

    pkg = {"dependencies": {"react": "18.0.0"}}
    (tmp_path / "package.json").write_text(_json.dumps(pkg), encoding="utf-8")
    result = detect_languages(tmp_path)
    assert "web" in result, f"Expected 'web' in languages for react dep, got {result!r}"
    assert "javascript" in result, f"Expected 'javascript' in languages for package.json, got {result!r}"


def test_detect_languages_setup_py_only_adds_python(tmp_path: pathlib.Path) -> None:
    """detect_languages() detects python when only setup.py is present (no pyproject.toml) (Finding 60)."""
    from codelicious.verifier import detect_languages

    (tmp_path / "setup.py").write_text("from setuptools import setup\nsetup()\n", encoding="utf-8")
    result = detect_languages(tmp_path)
    assert "python" in result, f"Expected 'python' in languages for setup.py, got {result!r}"


def test_detect_languages_tsconfig_json_adds_typescript(tmp_path: pathlib.Path) -> None:
    """detect_languages() detects typescript when tsconfig.json is present (Finding 60)."""
    from codelicious.verifier import detect_languages

    (tmp_path / "tsconfig.json").write_text('{"compilerOptions": {}}', encoding="utf-8")
    result = detect_languages(tmp_path)
    assert "typescript" in result, f"Expected 'typescript' in languages for tsconfig.json, got {result!r}"


def test_detect_languages_cargo_toml_adds_rust(tmp_path: pathlib.Path) -> None:
    """detect_languages() detects rust when Cargo.toml is present (Finding 60)."""
    from codelicious.verifier import detect_languages

    (tmp_path / "Cargo.toml").write_text('[package]\nname = "mylib"\nversion = "0.1.0"\n', encoding="utf-8")
    result = detect_languages(tmp_path)
    assert "rust" in result, f"Expected 'rust' in languages for Cargo.toml, got {result!r}"


def test_detect_languages_go_mod_adds_go(tmp_path: pathlib.Path) -> None:
    """detect_languages() detects go when go.mod is present (Finding 60)."""
    from codelicious.verifier import detect_languages

    (tmp_path / "go.mod").write_text("module example.com/mymod\n\ngo 1.21\n", encoding="utf-8")
    result = detect_languages(tmp_path)
    assert "go" in result, f"Expected 'go' in languages for go.mod, got {result!r}"


# ---------------------------------------------------------------------------
# Finding 61: check_lint() — lint violations path (non-zero exit)
# ---------------------------------------------------------------------------


def test_check_lint_nonzero_exit_returns_failed(tmp_path: pathlib.Path) -> None:
    """check_lint returns passed=False when the linter exits with a non-zero code (Finding 61)."""
    from codelicious.verifier import check_lint

    mock_result = subprocess.CompletedProcess(
        args=["ruff", "check", "."],
        returncode=1,
        stdout="src/app.py:5:1: E302 Expected 2 blank lines\n",
        stderr="",
    )
    with patch("subprocess.run", return_value=mock_result):
        result = check_lint(tmp_path, "python", tool_available=True)

    assert result.passed is False
    assert result.name == "lint"
    assert "E302" in result.details


# ---------------------------------------------------------------------------
# Finding 62: check_coverage() — coverage % extraction regex (pass and fail)
# ---------------------------------------------------------------------------


def test_check_coverage_regex_pass_at_threshold(tmp_path: pathlib.Path) -> None:
    """check_coverage parses TOTAL line 'TOTAL 100 50 50%' and passes when threshold <= 50 (Finding 62)."""
    from codelicious.verifier import check_coverage

    (tmp_path / "tests").mkdir()

    cov_output = (
        "Name          Stmts   Miss  Cover\n"
        "-----------------------------------\n"
        "TOTAL           100     50    50%\n"
        "1 passed in 0.10s\n"
    )
    mock_result = subprocess.CompletedProcess(args=["pytest"], returncode=0, stdout=cov_output, stderr="")
    with patch("subprocess.run", return_value=mock_result):
        result = check_coverage(tmp_path, language="python", threshold=50, tool_available=True)

    assert result.passed is True
    assert result.name == "coverage"
    assert "50%" in result.message


def test_check_coverage_regex_fail_below_threshold(tmp_path: pathlib.Path) -> None:
    """check_coverage parses TOTAL line 'TOTAL 100 50 50%' and fails when threshold is 80 (Finding 62)."""
    from codelicious.verifier import check_coverage

    (tmp_path / "tests").mkdir()

    cov_output = (
        "Name          Stmts   Miss  Cover\n"
        "-----------------------------------\n"
        "TOTAL           100     50    50%\n"
        "1 passed in 0.10s\n"
    )
    mock_result = subprocess.CompletedProcess(args=["pytest"], returncode=1, stdout=cov_output, stderr="")
    with patch("subprocess.run", return_value=mock_result):
        result = check_coverage(tmp_path, language="python", threshold=80, tool_available=True)

    assert result.passed is False
    assert result.name == "coverage"
    assert "50%" in result.message
    assert "80%" in result.message


# ---------------------------------------------------------------------------
# Finding 63: check_pip_audit() — success (returncode 0) and CVE (returncode 1)
# ---------------------------------------------------------------------------


def test_check_pip_audit_returncode_zero_passes(tmp_path: pathlib.Path) -> None:
    """check_pip_audit returns passed=True when pip-audit exits 0 (no CVEs) (Finding 63)."""
    from codelicious.verifier import check_pip_audit

    mock_result = subprocess.CompletedProcess(
        args=["pip-audit", "--format=json", "-q"],
        returncode=0,
        stdout="[]\n",
        stderr="",
    )
    with patch("subprocess.run", return_value=mock_result):
        result = check_pip_audit(tmp_path, tool_available=True)

    assert result.passed is True
    assert result.name == "pip_audit"
    assert "no known cves" in result.message.lower()


def test_check_pip_audit_returncode_one_fails(tmp_path: pathlib.Path) -> None:
    """check_pip_audit returns passed=False when pip-audit exits 1 (CVEs found) (Finding 63)."""
    from codelicious.verifier import check_pip_audit

    vuln_output = '[{"name": "urllib3", "version": "1.26.4", "vulns": [{"id": "CVE-2021-33503"}]}]\n'
    mock_result = subprocess.CompletedProcess(
        args=["pip-audit", "--format=json", "-q"],
        returncode=1,
        stdout=vuln_output,
        stderr="",
    )
    with patch("subprocess.run", return_value=mock_result):
        result = check_pip_audit(tmp_path, tool_available=True)

    assert result.passed is False
    assert result.name == "pip_audit"
    assert "CVE-2021-33503" in result.details


# ---------------------------------------------------------------------------
# Finding 64: write_build_summary() — file creation and verification table
# ---------------------------------------------------------------------------


def test_write_build_summary_file_exists_with_task_counts(tmp_path: pathlib.Path) -> None:
    """write_build_summary() creates .codelicious/build-summary.md with correct task counts (Finding 64)."""
    from codelicious.verifier import write_build_summary

    path = write_build_summary(
        tmp_path,
        state_completed=["task1"],
        state_failed=["task2"],
        state_skipped=["task3"],
        last_verification=None,
    )

    assert path.exists(), "build-summary.md must be created"
    assert path.name == "build-summary.md"
    content = path.read_text(encoding="utf-8")
    assert "1 completed" in content
    assert "1 failed" in content
    assert "1 skipped" in content


def test_write_build_summary_with_verification_renders_table(tmp_path: pathlib.Path) -> None:
    """write_build_summary() renders a markdown table when last_verification is given (Finding 64)."""
    from codelicious.verifier import CheckResult, VerificationResult, write_build_summary

    vr = VerificationResult(
        checks=[
            CheckResult(name="syntax", passed=True, message="OK"),
            CheckResult(name="tests", passed=False, message="3 failed"),
        ]
    )
    path = write_build_summary(
        tmp_path,
        state_completed=["task1"],
        state_failed=[],
        state_skipped=[],
        last_verification=vr,
    )

    content = path.read_text(encoding="utf-8")
    assert "| Check | Result | Message |" in content
    assert "syntax" in content
    assert "tests" in content
    assert "FAIL" in content
    assert "pass" in content


# ---------------------------------------------------------------------------
# Finding 65: verify() — coverage_threshold > 0 runs the coverage check
# ---------------------------------------------------------------------------


def test_verify_coverage_check_present_when_threshold_nonzero(tmp_path: pathlib.Path) -> None:
    """verify() includes a 'coverage' check when coverage_threshold > 0 and python in languages (Finding 65)."""
    import subprocess as _sp

    from codelicious.verifier import verify

    (tmp_path / "ok.py").write_text("x = 1\n", encoding="utf-8")

    cov_output = "TOTAL   1   0   100%\n1 passed in 0.01s\n"
    mock_result = _sp.CompletedProcess(args=[], returncode=0, stdout=cov_output, stderr="")

    with patch("subprocess.run", return_value=mock_result):
        with patch("codelicious.verifier._pytest_cov_available", return_value=True):
            result = verify(
                tmp_path,
                coverage_threshold=80,
                tools={"ruff": True, "pip-audit": False},
                languages={"python"},
            )

    check_names = {c.name for c in result.checks}
    assert "coverage" in check_names, f"Expected 'coverage' in checks when coverage_threshold=80, got {check_names!r}"


# ---------------------------------------------------------------------------
# spec-20 Phase 7: Verify Command Denylist Argument Checking (S20-P2-3)
# ---------------------------------------------------------------------------


class TestCommandArgDenylist:
    """Tests for S20-P2-3: _validate_command_args checks all arguments."""

    def test_denylist_rejects_python_as_argument(self, tmp_path: pathlib.Path) -> None:
        """'python3' as an argument must be rejected (denied command in args)."""
        err = _validate_command_args(["make", "python3"], tmp_path)
        assert err is not None
        assert "denied command" in err.lower()

    def test_denylist_rejects_bash_script_argument(self, tmp_path: pathlib.Path) -> None:
        """A .sh script from outside the repo must be rejected."""
        err = _validate_command_args(["make", "-f", "/tmp/evil.sh"], tmp_path)
        assert err is not None
        assert "external script" in err.lower() or "denied" in err.lower()

    def test_denylist_allows_safe_arguments(self, tmp_path: pathlib.Path) -> None:
        """Normal arguments like '--verbose' and file paths within repo must pass."""
        err = _validate_command_args(["pytest", "--verbose", "-x", "tests/"], tmp_path)
        assert err is None

    def test_denylist_rejects_denied_command_in_path(self, tmp_path: pathlib.Path) -> None:
        """'/usr/bin/rm' as an argument must be rejected (basename matches denylist)."""
        err = _validate_command_args(["xargs", "/usr/bin/rm"], tmp_path)
        assert err is not None
        assert "denied command" in err.lower()

    def test_denylist_allows_repo_internal_scripts(self, tmp_path: pathlib.Path) -> None:
        """A .py script inside the repo must be allowed."""
        script = tmp_path / "scripts" / "build.py"
        script.parent.mkdir(parents=True, exist_ok=True)
        script.write_text("print('ok')\n", encoding="utf-8")
        err = _validate_command_args(["make", str(script)], tmp_path)
        assert err is None

    def test_denylist_rejects_external_scripts(self, tmp_path: pathlib.Path) -> None:
        """A .py script outside the repo must be rejected."""
        external = tmp_path.parent / "evil_script.py"
        external.write_text("import os; os.system('rm -rf /')\n", encoding="utf-8")
        err = _validate_command_args(["make", str(external)], tmp_path)
        assert err is not None
        assert "external script" in err.lower()

    def test_denylist_checks_all_arguments_not_just_first(self, tmp_path: pathlib.Path) -> None:
        """The third argument 'bash' must be caught even though args[0] is safe."""
        err = _validate_command_args(["echo", "hello", "bash"], tmp_path)
        assert err is not None
        assert "denied command" in err.lower()

    def test_verify_command_with_safe_echo_target(self, tmp_path: pathlib.Path) -> None:
        """'echo test' with safe arguments must pass check_custom_command."""
        result = check_custom_command(tmp_path, "echo test")
        assert result.name == "custom"
        assert result.passed is True


# ---------------------------------------------------------------------------
# spec-20 Phase 10: Multiline String Tracker Replacement (S20-P2-8)
# ---------------------------------------------------------------------------


class TestTokenizeStringDetection:
    """Tests for S20-P2-8: tokenize-based multiline string boundary detection."""

    def test_scanner_skips_eval_inside_docstring(self, tmp_path: pathlib.Path) -> None:
        """eval() inside a triple-quoted docstring must NOT be flagged."""
        code = '"""\nThis docstring mentions eval(x) for documentation.\n"""\nx = 1\n'
        (tmp_path / "docstr.py").write_text(code, encoding="utf-8")
        result = check_security(tmp_path)
        assert result.passed is True

    def test_scanner_catches_eval_outside_docstring(self, tmp_path: pathlib.Path) -> None:
        """eval() outside any string must be flagged."""
        code = '"""Safe docstring."""\nresult = eval(user_input)\n'
        (tmp_path / "dangerous.py").write_text(code, encoding="utf-8")
        result = check_security(tmp_path)
        assert result.passed is False
        assert "eval(" in result.details

    def test_scanner_handles_double_triple_quotes_on_one_line(self, tmp_path: pathlib.Path) -> None:
        """Two sets of triple-double-quotes on one line (balanced) — the old heuristic would fail."""
        code = 'x = """hello""" + """world"""\ny = 1\n'
        (tmp_path / "balanced.py").write_text(code, encoding="utf-8")
        result = check_security(tmp_path)
        assert result.passed is True

    def test_scanner_handles_mixed_quote_styles(self, tmp_path: pathlib.Path) -> None:
        """Mixed triple-double and triple-single quotes must be handled correctly."""
        code = "a = '''single triple'''\nb = \"\"\"double triple\"\"\"\nc = 1\n"
        (tmp_path / "mixed.py").write_text(code, encoding="utf-8")
        result = check_security(tmp_path)
        assert result.passed is True

    def test_scanner_handles_f_string_with_eval(self, tmp_path: pathlib.Path) -> None:
        """f-string containing the text 'eval' should not be flagged (it's inside a string)."""
        code = 'msg = f"do not use eval({x})"\ny = 1\n'
        (tmp_path / "fstring.py").write_text(code, encoding="utf-8")
        result = check_security(tmp_path)
        # The _strip_string_literals function strips the string content,
        # so the eval text inside the f-string should not be flagged
        assert result.passed is True

    def test_scanner_fallback_on_invalid_syntax(self, tmp_path: pathlib.Path) -> None:
        """Syntactically invalid Python must still be scanned (tokenize falls back)."""
        code = "eval(x)\nthis is not valid python {{{\n"
        (tmp_path / "invalid.py").write_text(code, encoding="utf-8")
        result = check_security(tmp_path)
        # eval(x) on line 1 should still be caught even though tokenize fails
        assert result.passed is False
        assert "eval(" in result.details

    def test_scanner_multiline_string_spanning_many_lines(self, tmp_path: pathlib.Path) -> None:
        """A 10-line docstring with eval() mentions inside must not be flagged."""
        lines = ['"""'] + [f"Line {i}: eval(x) exec(y)" for i in range(10)] + ['"""', "z = 1", ""]
        code = "\n".join(lines)
        (tmp_path / "long_docstring.py").write_text(code, encoding="utf-8")
        result = check_security(tmp_path)
        assert result.passed is True

    def test_scanner_raw_string_with_dangerous_pattern(self, tmp_path: pathlib.Path) -> None:
        """A raw string r'...' containing eval text should not be flagged."""
        code = "pattern = r'eval\\(.*\\)'\nx = 1\n"
        (tmp_path / "raw.py").write_text(code, encoding="utf-8")
        result = check_security(tmp_path)
        assert result.passed is True


# ---------------------------------------------------------------------------
# spec-20 Phase 17: Build Summary and Coverage Fixes (S20-P3-7, S20-P3-8)
# ---------------------------------------------------------------------------


class TestBuildSummaryAndCoverage:
    """Tests for S20-P3-7 (pipe escaping) and S20-P3-8 (coverage timeout)."""

    def test_build_summary_escapes_pipe_in_title(self, tmp_path: pathlib.Path) -> None:
        """Pipe characters in check names must be escaped in the markdown table."""
        check = CheckResult(name="test|check", passed=True, message="ok")
        vresult = VerificationResult(checks=[check])
        path = write_build_summary(tmp_path, ["done"], [], [], vresult)
        content = path.read_text(encoding="utf-8")
        assert "test\\|check" in content
        assert "| test|check |" not in content

    def test_build_summary_escapes_pipe_in_error(self, tmp_path: pathlib.Path) -> None:
        """Pipe characters in check messages must be escaped."""
        check = CheckResult(name="lint", passed=False, message="error: x | y failed")
        vresult = VerificationResult(checks=[check])
        path = write_build_summary(tmp_path, [], ["lint"], [], vresult)
        content = path.read_text(encoding="utf-8")
        assert "x \\| y" in content

    def test_build_summary_handles_newline_in_cell(self, tmp_path: pathlib.Path) -> None:
        """Newlines in check messages must be replaced with spaces."""
        check = CheckResult(name="test", passed=False, message="line1\nline2\nline3")
        vresult = VerificationResult(checks=[check])
        path = write_build_summary(tmp_path, [], ["test"], [], vresult)
        content = path.read_text(encoding="utf-8")
        assert "line1 line2 line3" in content

    def test_escape_markdown_cell_helper(self) -> None:
        """_escape_markdown_cell replaces pipes and newlines."""
        assert _escape_markdown_cell("a|b") == "a\\|b"
        assert _escape_markdown_cell("a\nb") == "a b"
        assert _escape_markdown_cell("a|b\nc") == "a\\|b c"
        assert _escape_markdown_cell("clean") == "clean"

    def test_coverage_timeout_default_180(self, tmp_path: pathlib.Path) -> None:
        """check_coverage with no timeout arg must use 180s default."""
        import inspect

        sig = inspect.signature(check_coverage)
        default = sig.parameters["timeout"].default
        assert default == 180

    def test_coverage_timeout_used_in_subprocess(self, tmp_path: pathlib.Path) -> None:
        """Custom timeout must be passed to subprocess.run."""
        import subprocess as _sp

        (tmp_path / "tests").mkdir()

        mock_result = _sp.CompletedProcess(args=[], returncode=0, stdout="90%", stderr="")

        with patch("subprocess.run", return_value=mock_result) as mock_run:
            with patch("codelicious.verifier._pytest_cov_available", return_value=True):
                check_coverage(tmp_path, "python", 80, True, timeout=42)

        # Verify the timeout kwarg passed to subprocess.run
        assert mock_run.called
        call_kwargs = mock_run.call_args
        assert call_kwargs.kwargs.get("timeout") == 42 or call_kwargs[1].get("timeout") == 42
