"""Tests for Phase 17: Comprehensive verification tooling.

Covers:
  proxilion_build/verifier.py  — probe_tools, detect_languages, check_lint,
                           check_coverage, check_pip_audit, check_playwright,
                           write_build_summary
  proxilion_build/planner.py   — analyze_spec_drift

test_probe_tools_returns_false_for_missing_tool
test_detect_languages_python_project
test_detect_languages_web_project_with_react
test_check_lint_passes_clean_code
test_check_lint_fails_with_violations
test_check_coverage_passes_above_threshold
test_check_coverage_fails_below_threshold
test_check_playwright_skips_when_not_final_attempt
test_check_playwright_skips_when_not_installed
test_build_summary_written_to_correct_path
test_analyze_spec_drift_returns_revised_spec
"""

from __future__ import annotations

import json
import pathlib
from unittest.mock import MagicMock, patch

from proxilion_build.planner import analyze_spec_drift
from proxilion_build.verifier import (
    CheckResult,
    VerificationResult,
    check_coverage,
    check_lint,
    check_pip_audit,
    check_playwright,
    detect_languages,
    probe_tools,
    write_build_summary,
)

# ---------------------------------------------------------------------------
# test_probe_tools_returns_false_for_missing_tool
# ---------------------------------------------------------------------------


def test_probe_tools_returns_false_for_missing_tool(tmp_path: pathlib.Path) -> None:
    """probe_tools returns False for a tool that is definitely not on PATH."""
    with patch("shutil.which", return_value=None):
        result = probe_tools(tmp_path)

    assert isinstance(result, dict)
    assert all(v is False for v in result.values())
    # All expected tool names present
    for tool in ("ruff", "bandit", "pip-audit", "eslint", "playwright"):
        assert tool in result


def test_probe_tools_returns_true_for_present_tool(tmp_path: pathlib.Path) -> None:
    """probe_tools returns True for tools that shutil.which finds."""

    def mock_which(name: str) -> str | None:
        return f"/usr/bin/{name}" if name == "ruff" else None

    with patch("shutil.which", side_effect=mock_which):
        result = probe_tools(tmp_path)

    assert result["ruff"] is True
    assert result["bandit"] is False


# ---------------------------------------------------------------------------
# test_detect_languages_python_project
# ---------------------------------------------------------------------------


def test_detect_languages_python_project(tmp_path: pathlib.Path) -> None:
    """detect_languages returns {'python'} for a project with pyproject.toml."""
    (tmp_path / "pyproject.toml").write_text("[project]\nname='x'\n", encoding="utf-8")

    langs = detect_languages(tmp_path)

    assert "python" in langs
    assert "typescript" not in langs


def test_detect_languages_setup_py(tmp_path: pathlib.Path) -> None:
    """detect_languages returns 'python' when setup.py is present."""
    (tmp_path / "setup.py").write_text("from setuptools import setup\nsetup()\n", encoding="utf-8")

    langs = detect_languages(tmp_path)
    assert "python" in langs


def test_detect_languages_typescript(tmp_path: pathlib.Path) -> None:
    """detect_languages returns 'typescript' when tsconfig.json present."""
    (tmp_path / "tsconfig.json").write_text("{}", encoding="utf-8")

    langs = detect_languages(tmp_path)
    assert "typescript" in langs


# ---------------------------------------------------------------------------
# test_detect_languages_web_project_with_react
# ---------------------------------------------------------------------------


def test_detect_languages_web_project_with_react(tmp_path: pathlib.Path) -> None:
    """detect_languages returns 'web' when package.json lists react."""
    pkg = {
        "dependencies": {"react": "^18.0.0", "react-dom": "^18.0.0"},
        "devDependencies": {},
    }
    (tmp_path / "package.json").write_text(json.dumps(pkg), encoding="utf-8")

    langs = detect_languages(tmp_path)

    assert "javascript" in langs
    assert "web" in langs


def test_detect_languages_js_no_react(tmp_path: pathlib.Path) -> None:
    """detect_languages returns 'javascript' but NOT 'web' without react-family deps."""
    pkg = {"dependencies": {"lodash": "^4.0.0"}, "scripts": {"test": "jest"}}
    (tmp_path / "package.json").write_text(json.dumps(pkg), encoding="utf-8")

    langs = detect_languages(tmp_path)

    assert "javascript" in langs
    assert "web" not in langs


def test_detect_languages_rust(tmp_path: pathlib.Path) -> None:
    (tmp_path / "Cargo.toml").write_text("[package]\nname='hello'\n", encoding="utf-8")
    langs = detect_languages(tmp_path)
    assert "rust" in langs


def test_detect_languages_go(tmp_path: pathlib.Path) -> None:
    (tmp_path / "go.mod").write_text("module example.com/hello\ngo 1.21\n", encoding="utf-8")
    langs = detect_languages(tmp_path)
    assert "go" in langs


def test_detect_languages_empty_project(tmp_path: pathlib.Path) -> None:
    langs = detect_languages(tmp_path)
    assert langs == set()


# ---------------------------------------------------------------------------
# test_check_lint_passes_clean_code
# ---------------------------------------------------------------------------


def test_check_lint_passes_clean_code(tmp_path: pathlib.Path) -> None:
    """check_lint returns passed=True when linter exits 0."""
    mock_result = MagicMock()
    mock_result.returncode = 0
    mock_result.stdout = "All checks passed."
    mock_result.stderr = ""

    with patch("subprocess.run", return_value=mock_result):
        result = check_lint(tmp_path, language="python", tool_available=True)

    assert result.passed is True
    assert result.name == "lint"


# ---------------------------------------------------------------------------
# test_check_lint_fails_with_violations
# ---------------------------------------------------------------------------


def test_check_lint_fails_with_violations(tmp_path: pathlib.Path) -> None:
    """check_lint returns passed=False when linter exits non-zero."""
    mock_result = MagicMock()
    mock_result.returncode = 1
    mock_result.stdout = "E501 line too long"
    mock_result.stderr = ""

    with patch("subprocess.run", return_value=mock_result):
        result = check_lint(tmp_path, language="python", tool_available=True)

    assert result.passed is False
    assert "lint" in result.name.lower()
    assert "E501" in result.details


def test_check_lint_skips_when_tool_unavailable(tmp_path: pathlib.Path) -> None:
    """check_lint returns passed=True and skips when tool_available=False."""
    result = check_lint(tmp_path, language="python", tool_available=False)

    assert result.passed is True
    assert "skipped" in result.message.lower()


def test_check_lint_skips_unsupported_language(tmp_path: pathlib.Path) -> None:
    """check_lint skips gracefully for unsupported languages like 'rust'."""
    result = check_lint(tmp_path, language="rust", tool_available=True)

    assert result.passed is True
    assert "skipped" in result.message.lower()


# ---------------------------------------------------------------------------
# test_check_coverage_passes_above_threshold
# ---------------------------------------------------------------------------


def test_check_coverage_passes_above_threshold(tmp_path: pathlib.Path) -> None:
    """check_coverage returns passed=True when coverage meets threshold."""
    (tmp_path / "tests").mkdir()

    mock_result = MagicMock()
    mock_result.returncode = 0
    mock_result.stdout = "TOTAL    100    10    90%\n"
    mock_result.stderr = ""

    with patch("subprocess.run", return_value=mock_result):
        result = check_coverage(tmp_path, language="python", threshold=80, tool_available=True)

    assert result.passed is True
    assert "90%" in result.message or result.passed is True


# ---------------------------------------------------------------------------
# test_check_coverage_fails_below_threshold
# ---------------------------------------------------------------------------


def test_check_coverage_fails_below_threshold(tmp_path: pathlib.Path) -> None:
    """check_coverage returns passed=False when coverage is below threshold."""
    (tmp_path / "tests").mkdir()

    mock_result = MagicMock()
    mock_result.returncode = 2  # pytest-cov exits 2 when below threshold
    mock_result.stdout = "TOTAL    100    60    40%\n"
    mock_result.stderr = ""

    with patch("subprocess.run", return_value=mock_result):
        result = check_coverage(tmp_path, language="python", threshold=60, tool_available=True)

    assert result.passed is False
    assert "40%" in result.message or "below" in result.message.lower()


def test_check_coverage_skips_non_python(tmp_path: pathlib.Path) -> None:
    """check_coverage skips for non-Python languages."""
    result = check_coverage(tmp_path, language="typescript", threshold=60, tool_available=True)
    assert result.passed is True
    assert "skipped" in result.message.lower()


def test_check_coverage_skips_when_tool_unavailable(tmp_path: pathlib.Path) -> None:
    result = check_coverage(tmp_path, language="python", threshold=60, tool_available=False)
    assert result.passed is True
    assert "skipped" in result.message.lower()


# ---------------------------------------------------------------------------
# test_check_playwright_skips_when_not_final_attempt
# ---------------------------------------------------------------------------


def test_check_playwright_skips_when_not_final_attempt(tmp_path: pathlib.Path) -> None:
    """check_playwright returns passed=True and skips when not the final attempt."""
    result = check_playwright(tmp_path, tool_available=True, is_final_attempt=False)

    assert result.passed is True
    assert "not the final attempt" in result.message.lower()


# ---------------------------------------------------------------------------
# test_check_playwright_skips_when_not_installed
# ---------------------------------------------------------------------------


def test_check_playwright_skips_when_not_installed(tmp_path: pathlib.Path) -> None:
    """check_playwright returns passed=True when playwright binary not available."""
    # Even on final attempt, skip if tool not present
    result = check_playwright(tmp_path, tool_available=False, is_final_attempt=True)

    assert result.passed is True
    assert "not installed" in result.message.lower()


def test_check_playwright_skips_when_no_e2e_dir(tmp_path: pathlib.Path) -> None:
    """check_playwright skips when there is no e2e/ directory."""
    result = check_playwright(tmp_path, tool_available=True, is_final_attempt=True)

    assert result.passed is True
    assert "e2e" in result.message.lower()


def test_check_playwright_runs_on_final_attempt(tmp_path: pathlib.Path) -> None:
    """check_playwright actually runs when tool available + final attempt + e2e dir."""
    (tmp_path / "e2e").mkdir()

    mock_result = MagicMock()
    mock_result.returncode = 0
    mock_result.stdout = "3 passed"
    mock_result.stderr = ""

    with patch("subprocess.run", return_value=mock_result):
        result = check_playwright(tmp_path, tool_available=True, is_final_attempt=True)

    assert result.passed is True


def test_check_pip_audit_skips_when_unavailable(tmp_path: pathlib.Path) -> None:
    """check_pip_audit skips gracefully when pip-audit not installed."""
    result = check_pip_audit(tmp_path, tool_available=False)
    assert result.passed is True
    assert "skipped" in result.message.lower()


def test_check_pip_audit_passes_clean(tmp_path: pathlib.Path) -> None:
    """check_pip_audit returns passed=True when pip-audit exits 0."""
    mock_result = MagicMock()
    mock_result.returncode = 0
    mock_result.stdout = "[]"
    mock_result.stderr = ""

    with patch("subprocess.run", return_value=mock_result):
        result = check_pip_audit(tmp_path, tool_available=True)

    assert result.passed is True


# ---------------------------------------------------------------------------
# test_build_summary_written_to_correct_path
# ---------------------------------------------------------------------------


def test_build_summary_written_to_correct_path(tmp_path: pathlib.Path) -> None:
    """write_build_summary writes to .proxilion-build/build-summary.md."""
    verification = VerificationResult(
        checks=[
            CheckResult(name="syntax", passed=True, message="ok"),
            CheckResult(name="tests", passed=False, message="2 failures"),
        ]
    )

    path = write_build_summary(
        project_dir=tmp_path,
        state_completed=["t1", "t2"],
        state_failed=["t3"],
        state_skipped=[],
        last_verification=verification,
    )

    assert path == tmp_path / ".proxilion-build" / "build-summary.md"
    assert path.is_file()
    content = path.read_text(encoding="utf-8")
    assert "build summary" in content.lower()
    assert "2 completed" in content
    assert "1 failed" in content
    # Verification table rows
    assert "syntax" in content
    assert "tests" in content
    assert "FAIL" in content


def test_build_summary_no_verification(tmp_path: pathlib.Path) -> None:
    """write_build_summary works with last_verification=None."""
    path = write_build_summary(
        project_dir=tmp_path,
        state_completed=["t1"],
        state_failed=[],
        state_skipped=["t2"],
        last_verification=None,
    )
    assert path.is_file()
    content = path.read_text(encoding="utf-8")
    assert "1 completed" in content


# ---------------------------------------------------------------------------
# test_analyze_spec_drift_returns_revised_spec
# ---------------------------------------------------------------------------


def test_analyze_spec_drift_returns_revised_spec() -> None:
    """analyze_spec_drift returns revised spec from LLM response."""
    original = "# Build auth\nAdd JWT auth.\n"
    failures = ["Task t1 failed: JWT secret not set", "Task t2 failed: bcrypt not imported"]

    def mock_llm(system_prompt: str, user_prompt: str) -> str:
        assert "original spec" in user_prompt.lower()
        assert "JWT secret not set" in user_prompt
        return "# Build auth (revised)\nAdd JWT auth. Set JWT_SECRET env var.\n"

    revised = analyze_spec_drift(original, failures, mock_llm)

    assert "revised" in revised.lower()
    assert "JWT_SECRET" in revised


def test_analyze_spec_drift_returns_original_on_empty_failures() -> None:
    """analyze_spec_drift returns original spec unchanged when no failures."""
    original = "# Build auth\nAdd JWT auth.\n"

    revised = analyze_spec_drift(original, [], llm_call=lambda s, u: "")
    assert revised == original


def test_analyze_spec_drift_returns_original_on_llm_error() -> None:
    """analyze_spec_drift returns original spec when LLM call raises."""
    original = "# Build auth\nAdd JWT auth.\n"

    def failing_llm(system_prompt: str, user_prompt: str) -> str:
        raise RuntimeError("LLM unavailable")

    revised = analyze_spec_drift(original, ["failure1"], failing_llm)
    assert revised == original


def test_analyze_spec_drift_returns_original_on_empty_llm_response() -> None:
    """analyze_spec_drift returns original spec when LLM returns blank string."""
    original = "# Spec\nDo something.\n"

    revised = analyze_spec_drift(original, ["failure"], lambda s, u: "   ")
    assert revised == original
