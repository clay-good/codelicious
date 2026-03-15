"""Runs verification checks including syntax, tests, lint, and security scans."""

from __future__ import annotations

import json
import logging
import os
import pathlib
import re
import shlex
import shutil
import subprocess
import sys
from dataclasses import dataclass, field

logger = logging.getLogger("proxilion_build.verifier")

__all__ = [
    "CheckResult",
    "VerificationResult",
    "check_coverage",
    "check_custom_command",
    "check_lint",
    "check_pip_audit",
    "check_playwright",
    "check_security",
    "check_syntax",
    "check_tests",
    "detect_languages",
    "probe_tools",
    "verify",
    "write_build_summary",
]

# Timeout constants for subprocess calls
_SYNTAX_AGGREGATE_TIMEOUT_S: int = 300  # Max seconds for all syntax checks combined
_SYNTAX_PER_FILE_TIMEOUT_S: int = 30  # Max seconds per individual syntax check
_TEST_TIMEOUT_S: int = 120  # Max seconds for pytest subprocess
_LINT_TIMEOUT_S: int = 60  # Max seconds for lint subprocess
_CUSTOM_CMD_TIMEOUT_S: int = 120  # Max seconds for custom verify command
_PIP_AUDIT_TIMEOUT_S: int = 120  # Max seconds for pip-audit
_PLAYWRIGHT_TIMEOUT_S: int = 300  # Max seconds for Playwright tests

_MAX_OUTPUT: int = 10_000

# ---------------------------------------------------------------------------
# Tool probing
# ---------------------------------------------------------------------------

_TOOL_NAMES: tuple[str, ...] = (
    "ruff",
    "bandit",
    "pip-audit",
    "semgrep",
    "eslint",
    "tsc",
    "jest",
    "cargo",
    "go",
    "playwright",
)


def _truncate(text: str) -> str:
    if len(text) <= _MAX_OUTPUT:
        return text
    return text[:_MAX_OUTPUT] + "\n[truncated]"


@dataclass
class CheckResult:
    """Result of a single verification check."""

    name: str
    passed: bool
    message: str
    details: str = ""


@dataclass
class VerificationResult:
    """Aggregated result of all verification checks."""

    checks: list[CheckResult] = field(default_factory=list)

    @property
    def all_passed(self) -> bool:
        """Return True if every check passed."""
        return all(c.passed for c in self.checks)


def probe_tools(project_dir: pathlib.Path) -> dict[str, bool]:  # noqa: ARG001
    """Return a dict mapping tool name to True if available on PATH.

    project_dir is accepted for API consistency but is not used — tool
    availability is determined purely by PATH, not project-local installs.
    The result is not cached; callers may cache it themselves.
    """
    logger.debug("Probing tools: %s", _TOOL_NAMES)
    result = {tool: shutil.which(tool) is not None for tool in _TOOL_NAMES}
    available = [tool for tool, avail in result.items() if avail]
    logger.info("Tools available: %s", available if available else "none")
    return result


# ---------------------------------------------------------------------------
# Language detection
# ---------------------------------------------------------------------------

_REACT_KEYWORDS = frozenset({"react", "next", "gatsby", "remix", "vite"})


def detect_languages(project_dir: pathlib.Path) -> set[str]:
    """Deterministically detect which languages/platforms are present.

    Returns a subset of: {"python", "typescript", "javascript", "rust", "go", "web"}
    No LLM calls. Based on file presence and package.json keywords only.
    """
    langs: set[str] = set()

    if (project_dir / "pyproject.toml").is_file() or (project_dir / "setup.py").is_file():
        langs.add("python")

    pkg_json = project_dir / "package.json"
    if pkg_json.is_file():
        langs.add("javascript")
        try:
            data = json.loads(pkg_json.read_text(encoding="utf-8"))
            deps: dict[str, str] = {}
            deps.update(data.get("dependencies", {}))
            deps.update(data.get("devDependencies", {}))
            dep_names = {k.lower() for k in deps}
            if dep_names & _REACT_KEYWORDS:
                langs.add("web")
        except (json.JSONDecodeError, OSError):
            pass

    if (project_dir / "tsconfig.json").is_file():
        langs.add("typescript")

    if (project_dir / "Cargo.toml").is_file():
        langs.add("rust")

    if (project_dir / "go.mod").is_file():
        langs.add("go")

    logger.info("Languages detected: %s", langs if langs else "none")
    return langs


# ---------------------------------------------------------------------------
# Lint check
# ---------------------------------------------------------------------------


def check_lint(
    project_dir: pathlib.Path,
    language: str,
    tool_available: bool,
    timeout: int = _LINT_TIMEOUT_S,
) -> CheckResult:
    """Run the appropriate linter for the given language.

    Skips gracefully if the tool is unavailable.
    """
    logger.info("Lint check: language=%s, tool_available=%s", language, tool_available)
    if not tool_available:
        return CheckResult(
            name="lint",
            passed=True,
            message=f"Lint skipped: linter not available for {language}",
        )

    if language == "python":
        cmd = ["ruff", "check", "."]
    elif language in ("typescript", "javascript"):
        cmd = ["eslint", "."]
    else:
        return CheckResult(
            name="lint",
            passed=True,
            message=f"Lint skipped: no linter configured for {language}",
        )

    logger.debug("Lint command: %s", cmd)

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=str(project_dir),
        )
    except FileNotFoundError:
        return CheckResult(
            name="lint",
            passed=True,
            message=f"Lint skipped: {cmd[0]} not found",
        )
    except subprocess.TimeoutExpired:
        return CheckResult(
            name="lint",
            passed=False,
            message=f"Lint timed out after {timeout}s",
        )

    output = _truncate(result.stdout + "\n" + result.stderr)

    if result.returncode == 0:
        return CheckResult(name="lint", passed=True, message="Lint passed", details=output)

    return CheckResult(
        name="lint",
        passed=False,
        message=f"Lint violations found (exit {result.returncode})",
        details=output,
    )


# ---------------------------------------------------------------------------
# Coverage check
# ---------------------------------------------------------------------------


def check_coverage(
    project_dir: pathlib.Path,
    language: str,
    threshold: int,
    tool_available: bool,
) -> CheckResult:
    """Run coverage check for Python projects.

    Only Python is supported; other languages are skipped.
    Skips if pytest-cov is not available.
    """
    if language != "python":
        return CheckResult(
            name="coverage",
            passed=True,
            message=f"Coverage skipped: not supported for {language}",
        )

    if not tool_available:
        return CheckResult(
            name="coverage",
            passed=True,
            message="Coverage skipped: coverage tool not available",
        )

    tests_dir = project_dir / "tests"
    if not tests_dir.is_dir():
        return CheckResult(
            name="coverage",
            passed=True,
            message="Coverage skipped: no tests directory",
        )

    try:
        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "pytest",
                str(tests_dir),
                f"--cov={project_dir}",
                "--cov-report=term-missing",
                f"--cov-fail-under={threshold}",
                "-q",
                "--tb=no",
            ],
            capture_output=True,
            text=True,
            timeout=180,
            cwd=str(project_dir),
        )
    except FileNotFoundError:
        return CheckResult(
            name="coverage",
            passed=True,
            message="Coverage skipped: pytest not installed",
        )
    except subprocess.TimeoutExpired:
        return CheckResult(
            name="coverage",
            passed=False,
            message="Coverage check timed out after 180s",
        )

    output = _truncate(result.stdout + "\n" + result.stderr)

    # Extract coverage percentage from output
    pct: int | None = None
    for line in (result.stdout + result.stderr).splitlines():
        m = re.search(r"TOTAL\s+\d+\s+\d+\s+(\d+)%", line)
        if m:
            pct = int(m.group(1))
            break

    if result.returncode == 0:
        msg = "Coverage passed"
        if pct is not None:
            msg = f"Coverage {pct}% meets threshold {threshold}%"
        return CheckResult(name="coverage", passed=True, message=msg, details=output)

    msg = f"Coverage below threshold ({threshold}%)"
    if pct is not None:
        msg = f"Coverage {pct}% is below threshold {threshold}%"
    return CheckResult(name="coverage", passed=False, message=msg, details=output)


# ---------------------------------------------------------------------------
# pip-audit check
# ---------------------------------------------------------------------------


def check_pip_audit(
    project_dir: pathlib.Path,
    tool_available: bool,
) -> CheckResult:
    """Run pip-audit to detect known CVEs in Python dependencies.

    Skips gracefully if pip-audit is not installed.
    """
    if not tool_available:
        return CheckResult(
            name="pip_audit",
            passed=True,
            message="pip-audit skipped: not installed",
        )

    try:
        result = subprocess.run(
            ["pip-audit", "--format=json", "-q"],
            capture_output=True,
            text=True,
            timeout=_PIP_AUDIT_TIMEOUT_S,
            cwd=str(project_dir),
        )
    except FileNotFoundError:
        return CheckResult(
            name="pip_audit",
            passed=True,
            message="pip-audit skipped: not found",
        )
    except subprocess.TimeoutExpired:
        return CheckResult(
            name="pip_audit",
            passed=False,
            message=f"pip-audit timed out after {_PIP_AUDIT_TIMEOUT_S}s",
        )

    output = _truncate(result.stdout + "\n" + result.stderr)

    if result.returncode == 0:
        return CheckResult(
            name="pip_audit", passed=True, message="No known CVEs found", details=output
        )

    return CheckResult(
        name="pip_audit",
        passed=False,
        message=f"pip-audit found vulnerabilities (exit {result.returncode})",
        details=output,
    )


# ---------------------------------------------------------------------------
# Playwright check
# ---------------------------------------------------------------------------


def check_playwright(
    project_dir: pathlib.Path,
    tool_available: bool,
    is_final_attempt: bool,
) -> CheckResult:
    """Run Playwright e2e tests.

    Only runs on the final attempt (is_final_attempt=True) to avoid
    spending time on e2e before the code stabilises.
    Skips gracefully if playwright is not installed.
    """
    if not is_final_attempt:
        return CheckResult(
            name="playwright",
            passed=True,
            message="Playwright skipped: not the final attempt",
        )

    if not tool_available:
        return CheckResult(
            name="playwright",
            passed=True,
            message="Playwright skipped: not installed",
        )

    e2e_dir = project_dir / "e2e"
    if not e2e_dir.is_dir():
        return CheckResult(
            name="playwright",
            passed=True,
            message="Playwright skipped: no e2e/ directory",
        )

    try:
        result = subprocess.run(
            ["npx", "playwright", "test", "e2e/", "--reporter=line"],
            capture_output=True,
            text=True,
            timeout=_PLAYWRIGHT_TIMEOUT_S,
            cwd=str(project_dir),
        )
    except FileNotFoundError:
        return CheckResult(
            name="playwright",
            passed=True,
            message="Playwright skipped: npx not found",
        )
    except subprocess.TimeoutExpired:
        return CheckResult(
            name="playwright",
            passed=False,
            message=f"Playwright timed out after {_PLAYWRIGHT_TIMEOUT_S}s",
        )

    output = _truncate(result.stdout + "\n" + result.stderr)

    if result.returncode == 0:
        return CheckResult(
            name="playwright", passed=True, message="Playwright tests passed", details=output
        )

    return CheckResult(
        name="playwright",
        passed=False,
        message=f"Playwright tests failed (exit {result.returncode})",
        details=output,
    )


_SECURITY_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("eval(", re.compile(r"\beval\s*\(")),
    ("exec(", re.compile(r"\bexec\s*\(")),
    ("os.system(", re.compile(r"\bos\.system\s*\(")),
    ("shell=True", re.compile(r"\bshell\s*=\s*True\b")),
    ("__import__(", re.compile(r"\b__import__\s*\(")),
    ("pickle deserialization", re.compile(r"\bpickle\.loads?\s*\(")),
    (
        "yaml.load without SafeLoader",
        re.compile(r"\byaml\.load\s*\((?!.*Loader)"),
    ),
    ("marshal deserialization", re.compile(r"\bmarshal\.loads?\s*\(")),
]

_SECRET_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"""['"]sk-[A-Za-z0-9]{10,}['"]"""),
    re.compile(r"""['"]pk-[A-Za-z0-9]{10,}['"]"""),
    re.compile(r"""['"]ghp_[A-Za-z0-9]{10,}['"]"""),
    re.compile(r"""['"]AKIA[A-Z0-9]{10,}['"]"""),
    re.compile(
        r"""(?:password|secret|api_key)\s*=\s*['"][^'"]{4,}['"]""",
        re.IGNORECASE,
    ),
]


def check_syntax(
    project_dir: pathlib.Path,
    aggregate_timeout: int = _SYNTAX_AGGREGATE_TIMEOUT_S,
) -> CheckResult:
    """Check Python syntax of all .py files in the project."""
    import time

    py_files: list[pathlib.Path] = []
    for root, _dirs, files in os.walk(str(project_dir)):
        root_path = pathlib.Path(root)
        # Skip hidden dirs and __pycache__
        if any(
            part.startswith(".") or part == "__pycache__"
            for part in root_path.relative_to(project_dir).parts
        ):
            continue
        for f in files:
            if f.endswith(".py"):
                py_files.append(root_path / f)

    if not py_files:
        return CheckResult(
            name="syntax",
            passed=True,
            message="No Python files found",
        )

    logger.info("Syntax check: scanning %d Python files", len(py_files))
    errors: list[str] = []
    aggregate_start = time.monotonic()
    for i, py_file in enumerate(py_files):
        logger.debug("Syntax check: file %d/%d: %s", i + 1, len(py_files), py_file.name)
        # Check aggregate timeout
        elapsed_agg = time.monotonic() - aggregate_start
        if elapsed_agg > aggregate_timeout:
            msg = (
                f"Aggregate timeout: syntax check exceeded "
                f"{aggregate_timeout}s after checking {i} files"
            )
            errors.append(msg)
            break
        # Clamp per-file timeout to remaining aggregate time
        remaining_agg = aggregate_timeout - elapsed_agg
        file_timeout = min(_SYNTAX_PER_FILE_TIMEOUT_S, remaining_agg) if remaining_agg > 0 else 0.1
        try:
            result = subprocess.run(
                [sys.executable, "-m", "py_compile", str(py_file)],
                capture_output=True,
                text=True,
                timeout=file_timeout,
                cwd=str(project_dir),
            )
            if result.returncode != 0:
                err = result.stderr.strip() or result.stdout.strip()
                errors.append(f"{py_file.name}: {err}")
        except FileNotFoundError:
            return CheckResult(
                name="syntax",
                passed=False,
                message="Python interpreter not found",
            )
        except subprocess.TimeoutExpired:
            errors.append(f"{py_file.name}: compilation timed out")

    logger.debug("Syntax check complete: %d errors found", len(errors))
    if errors:
        return CheckResult(
            name="syntax",
            passed=False,
            message=f"Syntax errors in {len(errors)} file(s)",
            details=_truncate("\n".join(errors)),
        )

    return CheckResult(
        name="syntax",
        passed=True,
        message=f"All {len(py_files)} file(s) passed syntax check",
    )


def check_tests(project_dir: pathlib.Path, timeout: int = _TEST_TIMEOUT_S) -> CheckResult:
    """Run pytest if a tests directory exists."""
    tests_dir = project_dir / "tests"
    if not tests_dir.is_dir():
        return CheckResult(
            name="tests",
            passed=True,
            message="No tests directory found",
        )

    logger.info("Running tests: timeout=%ds", timeout)
    cmd = [sys.executable, "-m", "pytest", str(tests_dir), "-v", "--tb=short"]
    logger.debug("Test command: %s", cmd)
    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=str(project_dir),
        )
    except FileNotFoundError:
        return CheckResult(
            name="tests",
            passed=False,
            message="pytest not installed; cannot run tests",
        )
    except subprocess.TimeoutExpired:
        return CheckResult(
            name="tests",
            passed=False,
            message="Tests timed out",
            details=f"Timeout after {timeout} seconds",
        )

    output = _truncate(result.stdout + "\n" + result.stderr)
    passed = result.returncode == 0
    logger.info("Tests %s (exit code %d)", "passed" if passed else "failed", result.returncode)

    if passed:
        return CheckResult(
            name="tests",
            passed=True,
            message="All tests passed",
            details=output,
        )

    return CheckResult(
        name="tests",
        passed=False,
        message="Tests failed",
        details=output,
    )


def _strip_string_literals(line: str) -> str:
    """Remove string literal contents from a line, preserving structure.

    Handles escaped quotes and raw strings. Returns line with string
    contents replaced by empty string placeholders. This helps the security
    scanner avoid false positives from patterns inside string literals.
    """
    result = []
    i = 0
    while i < len(line):
        # Check for raw string prefix (r", r', b", b', u", u', or combinations)
        if line[i] in "rRbBuU" and i + 1 < len(line) and line[i + 1] in "\"'":
            quote_char = line[i + 1]
            i += 2
            # Skip to closing quote (no escape processing for raw strings)
            while i < len(line) and line[i] != quote_char:
                i += 1
            if i < len(line):
                i += 1  # skip closing quote
            result.append('""')  # placeholder
            continue
        # Check for triple-quoted string (handles same-line open/close)
        if line[i : i + 3] in ('"""', "'''"):
            delim = line[i : i + 3]
            i += 3
            end = line.find(delim, i)
            if end != -1:
                i = end + 3
            else:
                i = len(line)  # unclosed triple-quote (multiline continues)
            result.append('""')
            continue
        # Check for single-quoted string
        if line[i] in "\"'":
            quote_char = line[i]
            i += 1
            while i < len(line):
                if line[i] == "\\":
                    i += 2  # skip escaped character
                    continue
                if line[i] == quote_char:
                    i += 1
                    break
                i += 1
            result.append('""')
            continue
        result.append(line[i])
        i += 1
    return "".join(result)


def check_security(project_dir: pathlib.Path) -> CheckResult:
    """Scan Python files for security concerns."""
    py_files: list[pathlib.Path] = []
    for root, _dirs, files in os.walk(str(project_dir)):
        root_path = pathlib.Path(root)
        if any(
            part.startswith(".") or part == "__pycache__"
            for part in root_path.relative_to(project_dir).parts
        ):
            continue
        for f in files:
            if f.endswith(".py"):
                py_files.append(root_path / f)

    logger.info("Security scan: scanning %d Python files", len(py_files))
    findings: list[str] = []

    for py_file in py_files:
        try:
            content = py_file.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as exc:
            logger.warning("Skipping unreadable file %s: %s", py_file, exc)
            continue

        rel_path = py_file.relative_to(project_dir)

        in_multiline_string = False
        multiline_delim: str = ""
        for line_no, line in enumerate(content.splitlines(), start=1):
            stripped = line.lstrip()

            # Track triple-quoted string boundaries; skip lines inside them.
            # A line can open and close a triple-quote on the same line —
            # handle by counting occurrences of the SAME delimiter type.
            if not in_multiline_string:
                for delim in ('"""', "'''"):
                    count = line.count(delim)
                    if count % 2 == 1:
                        # Odd number of delimiters → entering a multi-line string
                        in_multiline_string = True
                        multiline_delim = delim
                        logger.debug(
                            "Security scan: entering multiline string at line %d (delim=%s)",
                            line_no,
                            delim,
                        )
                        break
                # If still not in a multi-line string after the check, the
                # line may have even (balanced) triple-quotes — treat as normal.
                if in_multiline_string:
                    continue
            else:
                # We are inside a multi-line string; look for the closing delimiter
                count = line.count(multiline_delim)
                if count % 2 == 1:
                    in_multiline_string = False
                    logger.debug("Security scan: exiting multiline string at line %d", line_no)
                continue

            # Skip comment lines (including indented comments)
            if stripped.startswith("#"):
                continue

            # Strip trailing comments to reduce false positives
            # e.g., `x = 1  # don't use eval()` shouldn't trigger eval warning
            # Note: This is a simple heuristic and may not handle all edge cases
            # (e.g., '#' inside strings), but it reduces common false positives
            code_part = line
            if "#" in line and not stripped.startswith(('"', "'")):
                # Find first # that's not inside a string.
                # Handles escaped quotes (\") and basic raw strings.
                in_str = False
                str_char = None
                i = 0
                while i < len(line):
                    c = line[i]
                    if in_str:
                        # Skip escaped characters inside strings
                        if c == "\\" and i + 1 < len(line):
                            i += 2  # skip backslash + next char
                            continue
                        if c == str_char:
                            in_str = False
                    else:
                        if c in ('"', "'"):
                            # Check for raw string prefix (r" or r')
                            # by just entering string mode — the
                            # backslash handling above is sufficient.
                            in_str = True
                            str_char = c
                        elif c == "#":
                            code_part = line[:i]
                            break
                    i += 1

            # Strip string literal contents to avoid false positives from patterns
            # that appear inside strings (e.g., 'do not use eval(x)')
            scan_part = _strip_string_literals(code_part)
            for pattern_name, pattern in _SECURITY_PATTERNS:
                if pattern.search(scan_part):
                    findings.append(f"{rel_path}:{line_no}: {pattern_name}")

            # Check secrets on original code_part (secrets are INSIDE strings)
            for secret_pat in _SECRET_PATTERNS:
                if secret_pat.search(code_part):
                    findings.append(f"{rel_path}:{line_no}: possible hardcoded secret")

    logger.info("Security scan complete: %d findings", len(findings))
    if findings:
        return CheckResult(
            name="security",
            passed=False,
            message=f"Found {len(findings)} security concern(s)",
            details=_truncate("\n".join(findings)),
        )

    return CheckResult(
        name="security",
        passed=True,
        message="No security concerns found",
    )


_DANGEROUS_COMMANDS = frozenset(
    {
        "rm",
        "sudo",
        "chmod",
        "chown",
        "mkfs",
        "dd",
        "kill",
        "reboot",
        "shutdown",
        "halt",
        "poweroff",
        "fdisk",
        "mount",
        "umount",
        "format",
    }
)

_SHELL_METACHARACTERS = frozenset({"|", "&", ";", "$", "`", "(", ")", "{", "}"})


def check_custom_command(
    project_dir: pathlib.Path,
    command: str | None,
    timeout: int = _CUSTOM_CMD_TIMEOUT_S,
) -> CheckResult:
    """Run a custom verification command."""
    if not command:
        return CheckResult(
            name="custom",
            passed=True,
            message="No custom command configured",
        )

    try:
        args = shlex.split(command)
    except ValueError as exc:
        return CheckResult(
            name="custom",
            passed=False,
            message=f"Invalid command: {exc}",
        )

    if args:
        # Extract basename to catch /bin/rm, ./rm, /usr/bin/sudo, etc.
        cmd_basename = os.path.basename(args[0])
        # Also strip common script extensions
        if cmd_basename.endswith((".sh", ".bash", ".zsh")):
            cmd_basename = cmd_basename.rsplit(".", 1)[0]

        logger.info("Custom command validation: cmd=%s, basename=%s", command, cmd_basename)
        logger.debug("Custom command args: %s", args)

        if cmd_basename in _DANGEROUS_COMMANDS:
            return CheckResult(
                name="custom",
                passed=False,
                message=f"Custom command rejected: '{cmd_basename}' is potentially destructive",
            )

        # Check for shell metacharacters in all arguments
        for arg in args:
            if any(ch in arg for ch in _SHELL_METACHARACTERS):
                return CheckResult(
                    name="custom",
                    passed=False,
                    message="Custom command rejected: shell metacharacters detected in argument",
                )
    else:
        logger.info("Custom command validation: cmd=%s, basename=empty", command)

    try:
        result = subprocess.run(
            args,
            capture_output=True,
            text=True,
            timeout=timeout,
            cwd=str(project_dir),
            shell=False,
        )
    except FileNotFoundError:
        return CheckResult(
            name="custom",
            passed=False,
            message=f"Command not found: {args[0]}",
        )
    except subprocess.TimeoutExpired:
        return CheckResult(
            name="custom",
            passed=False,
            message=f"Custom command timed out after {timeout}s",
        )

    output = _truncate(result.stdout + "\n" + result.stderr)

    if result.returncode == 0:
        return CheckResult(
            name="custom",
            passed=True,
            message="Custom command passed",
            details=output,
        )

    return CheckResult(
        name="custom",
        passed=False,
        message=f"Custom command failed (exit {result.returncode})",
        details=output,
    )


def verify(
    project_dir: pathlib.Path,
    timeout: int = 120,
    verify_command: str | None = None,
    coverage_threshold: int = 0,
    is_final_attempt: bool = False,
    tools: dict[str, bool] | None = None,
    languages: set[str] | None = None,
    test_timeout: int | None = None,
    lint_timeout: int | None = None,
) -> VerificationResult:
    """Run all verification checks and return aggregated results.

    Extended checks (lint, coverage, pip_audit, playwright) are only added when
    the caller passes detected languages and tool availability maps.  This keeps
    the existing call-sites unchanged while allowing the loop controller to opt in.
    """
    # Calculate expected check count for logging
    expected_check_count = 3  # syntax, tests, security (always run)
    if tools is not None and languages is not None:
        # Lint check
        for lang in ("python", "typescript", "javascript"):
            if lang in languages:
                expected_check_count += 1
                break
        # Coverage check
        if coverage_threshold > 0 and "python" in languages:
            expected_check_count += 1
        # pip-audit check
        if "python" in languages:
            expected_check_count += 1
        # Playwright check
        if "web" in languages:
            expected_check_count += 1
    if verify_command:
        expected_check_count += 1

    logger.info("Running verification: %d checks configured", expected_check_count)
    logger.debug("Languages detected: %s", languages)
    if tools is not None:
        available_tools = [tool for tool, avail in tools.items() if avail]
        logger.debug("Tools available: %s", available_tools)

    checks: list[CheckResult] = [
        check_syntax(project_dir),
        check_tests(
            project_dir,
            timeout=test_timeout if test_timeout is not None else _TEST_TIMEOUT_S,
        ),
        check_security(project_dir),
    ]

    if tools is not None and languages is not None:
        # Lint — run for the first detected language that has a linter
        for lang in ("python", "typescript", "javascript"):
            if lang in languages:
                linter = "ruff" if lang == "python" else "eslint"
                lint_available = tools.get(linter, False)
                checks.append(
                    check_lint(
                        project_dir,
                        lang,
                        tool_available=lint_available,
                        timeout=lint_timeout if lint_timeout is not None else _LINT_TIMEOUT_S,
                    )
                )
                break

        # Coverage — Python only, skipped when threshold is 0
        if coverage_threshold > 0 and "python" in languages:
            # coverage is provided by pytest-cov; probe via importlib
            cov_available = _pytest_cov_available()
            checks.append(
                check_coverage(
                    project_dir,
                    language="python",
                    threshold=coverage_threshold,
                    tool_available=cov_available,
                )
            )

        # pip-audit — Python projects only
        if "python" in languages:
            pip_audit_available = tools.get("pip-audit", False)
            checks.append(check_pip_audit(project_dir, tool_available=pip_audit_available))

        # Playwright — web projects only, final attempt only
        if "web" in languages:
            checks.append(
                check_playwright(
                    project_dir,
                    tool_available=tools.get("playwright", False),
                    is_final_attempt=is_final_attempt,
                )
            )

    if verify_command:
        checks.append(check_custom_command(project_dir, verify_command, timeout=timeout))

    # Log individual check results
    for check in checks:
        logger.debug(
            "Check %s: %s - %s",
            check.name,
            "PASS" if check.passed else "FAIL",
            check.message,
        )

    # Log summary
    passed_count = sum(1 for c in checks if c.passed)
    failed_count = len(checks) - passed_count
    logger.info("Verification complete: %d passed, %d failed", passed_count, failed_count)

    return VerificationResult(checks=checks)


def _pytest_cov_available() -> bool:
    """Return True if pytest-cov is importable."""
    try:
        import importlib.util

        return importlib.util.find_spec("pytest_cov") is not None
    except Exception:
        return False


# ---------------------------------------------------------------------------
# Build summary
# ---------------------------------------------------------------------------


def write_build_summary(
    project_dir: pathlib.Path,
    state_completed: list[str],
    state_failed: list[str],
    state_skipped: list[str],
    last_verification: VerificationResult | None,
) -> pathlib.Path:
    """Write a build summary to .proxilion-build/build-summary.md.

    Returns the path to the written file.
    The TypeScript queue worker reads this file and appends it to the PR description.
    """
    build_state_dir = project_dir / ".proxilion-build"
    build_state_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    summary_path = build_state_dir / "build-summary.md"

    lines: list[str] = ["## proxilion build summary", ""]

    total = len(state_completed) + len(state_failed) + len(state_skipped)
    lines.append(
        f"**Tasks:** {len(state_completed)} completed, {len(state_failed)} failed, "
        f"{len(state_skipped)} skipped ({total} total)"
    )
    lines.append("")

    if last_verification is not None:
        lines.append("### Verification results")
        lines.append("")
        lines.append("| Check | Result | Message |")
        lines.append("|---|---|---|")
        for check in last_verification.checks:
            status = "pass" if check.passed else "FAIL"
            lines.append(f"| {check.name} | {status} | {check.message} |")
        lines.append("")

    summary_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return summary_path
