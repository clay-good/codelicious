"""Runs verification checks including syntax, tests, lint, and security scans."""

from __future__ import annotations

import functools
import io
import json
import logging
import os
import pathlib
import re
import shlex
import shutil
import signal
import subprocess
import sys
import tokenize
from dataclasses import dataclass, field

from codelicious._env import parse_env_int
from codelicious.security_constants import BLOCKED_METACHARACTERS, DENIED_COMMANDS

logger = logging.getLogger("codelicious.verifier")

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
# Each is overridable via CODELICIOUS_TIMEOUT_<NAME> environment variable

_SYNTAX_AGGREGATE_TIMEOUT_S: int = parse_env_int("CODELICIOUS_TIMEOUT_SYNTAX", 300, min_val=1)
_SYNTAX_PER_FILE_TIMEOUT_S: int = parse_env_int("CODELICIOUS_TIMEOUT_SYNTAX_PER_FILE", 30, min_val=1)
_TEST_TIMEOUT_S: int = parse_env_int("CODELICIOUS_TIMEOUT_TEST", 120, min_val=1)
_LINT_TIMEOUT_S: int = parse_env_int("CODELICIOUS_TIMEOUT_LINT", 60, min_val=1)
_CUSTOM_CMD_TIMEOUT_S: int = parse_env_int("CODELICIOUS_TIMEOUT_CUSTOM_CMD", 120, min_val=1)
_PIP_AUDIT_TIMEOUT_S: int = parse_env_int("CODELICIOUS_TIMEOUT_AUDIT", 120, min_val=1)
_PLAYWRIGHT_TIMEOUT_S: int = parse_env_int("CODELICIOUS_TIMEOUT_PLAYWRIGHT", 300, min_val=1)

_MAX_OUTPUT: int = 10_000
_MAX_COMPILE_SIZE: int = 1_000_000  # 1 MB per file — DoS ceiling for compile() (Finding 47)

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


# Install guidance for tools (EM-4: actionable error messages)
_INSTALL_GUIDANCE: dict[str, str] = {
    "ruff": "pip install ruff (or pip install -e '.[dev]' for all dev tools)",
    "bandit": "pip install bandit (or pip install -e '.[dev]' for all dev tools)",
    "pip-audit": "pip install pip-audit (or pip install -e '.[dev]' for all dev tools)",
    "semgrep": "pip install semgrep",
    "eslint": "npm install -g eslint",
    "tsc": "npm install -g typescript",
    "jest": "npm install -g jest",
    "cargo": "Install Rust: https://rustup.rs/",
    "go": "Install Go: https://go.dev/dl/",
    "playwright": "pip install playwright && playwright install",
    "pytest": "pip install pytest (or pip install -e '.[dev]' for all dev tools)",
    "pytest-cov": "pip install pytest-cov (or pip install -e '.[dev]' for all dev tools)",
}


def _truncate(text: str) -> str:
    if len(text) <= _MAX_OUTPUT:
        return text
    return text[:_MAX_OUTPUT] + "\n[truncated]"


def _escape_markdown_cell(value: str) -> str:
    """Escape a string for safe inclusion in a Markdown table cell (S20-P3-7).

    Replaces pipe characters and strips newlines so the table structure is preserved.
    """
    return value.replace("|", "\\|").replace("\n", " ").replace("\r", " ")


def _find_py_files(project_dir: pathlib.Path) -> list[pathlib.Path]:
    """Walk the project tree once and return all .py files.

    Skips hidden directories and __pycache__. Used by check_syntax and
    check_security to avoid duplicate os.walk traversals (Finding 10).
    """
    py_files: list[pathlib.Path] = []
    for root, dirs, files in os.walk(str(project_dir)):
        # Prune hidden dirs, __pycache__, node_modules in-place to prevent
        # os.walk from descending into them (Finding 8).
        dirs[:] = [d for d in dirs if not d.startswith(".") and d not in ("__pycache__", "node_modules")]
        root_path = pathlib.Path(root)
        for f in files:
            if f.endswith(".py"):
                py_files.append(root_path / f)
    return py_files


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


@functools.lru_cache(maxsize=1)
def probe_tools(project_dir: pathlib.Path) -> dict[str, bool]:
    """Return a dict mapping tool name to True if available on PATH.

    project_dir is accepted for API consistency but is not used — tool
    availability is determined purely by PATH, not project-local installs.
    The result is cached via @lru_cache for the lifetime of the process
    (Finding 27: the previous docstring incorrectly said "not cached").
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
            message=f"Lint skipped: linter not available for {language}. "
            f"Install with: {_INSTALL_GUIDANCE.get('ruff', 'see documentation')}",
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
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            cwd=str(project_dir),
            start_new_session=True,
        )
    except FileNotFoundError:
        return CheckResult(
            name="lint",
            passed=True,
            message=f"Lint skipped: {cmd[0]} not found. "
            f"Install with: {_INSTALL_GUIDANCE.get(cmd[0], 'see documentation')}",
        )
    except subprocess.TimeoutExpired as e:
        try:
            os.killpg(os.getpgid(e.pid), signal.SIGKILL)
        except (OSError, ProcessLookupError, AttributeError):
            pass
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
    timeout: int = 180,
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
            message=f"Coverage skipped: coverage tool not available. Install with: {_INSTALL_GUIDANCE['pytest-cov']}",
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
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            cwd=str(project_dir),
            start_new_session=True,
        )
    except FileNotFoundError:
        return CheckResult(
            name="coverage",
            passed=True,
            message=f"Coverage skipped: pytest not installed. Install with: {_INSTALL_GUIDANCE['pytest']}",
        )
    except subprocess.TimeoutExpired as e:
        try:
            os.killpg(os.getpgid(e.pid), signal.SIGKILL)
        except (OSError, ProcessLookupError, AttributeError):
            pass
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
            message=f"pip-audit skipped: not installed. Install with: {_INSTALL_GUIDANCE['pip-audit']}",
        )

    try:
        result = subprocess.run(
            ["pip-audit", "--format=json", "-q"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=_PIP_AUDIT_TIMEOUT_S,
            cwd=str(project_dir),
            start_new_session=True,
        )
    except FileNotFoundError:
        return CheckResult(
            name="pip_audit",
            passed=True,
            message=f"pip-audit skipped: not found. Install with: {_INSTALL_GUIDANCE['pip-audit']}",
        )
    except subprocess.TimeoutExpired as e:
        try:
            os.killpg(os.getpgid(e.pid), signal.SIGKILL)
        except (OSError, ProcessLookupError, AttributeError):
            pass
        return CheckResult(
            name="pip_audit",
            passed=False,
            message=f"pip-audit timed out after {_PIP_AUDIT_TIMEOUT_S}s",
        )

    output = _truncate(result.stdout + "\n" + result.stderr)

    if result.returncode == 0:
        return CheckResult(name="pip_audit", passed=True, message="No known CVEs found", details=output)

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
            message=f"Playwright skipped: not installed. Install with: {_INSTALL_GUIDANCE['playwright']}",
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
            [sys.executable, "-m", "playwright", "test", "e2e/", "--reporter=line"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=_PLAYWRIGHT_TIMEOUT_S,
            cwd=str(project_dir),
            start_new_session=True,
        )
    except FileNotFoundError:
        return CheckResult(
            name="playwright",
            passed=True,
            message=f"Playwright skipped: playwright not found. Install with: {_INSTALL_GUIDANCE['playwright']}",
        )
    except subprocess.TimeoutExpired as e:
        try:
            os.killpg(os.getpgid(e.pid), signal.SIGKILL)
        except (OSError, ProcessLookupError, AttributeError):
            pass
        return CheckResult(
            name="playwright",
            passed=False,
            message=f"Playwright timed out after {_PLAYWRIGHT_TIMEOUT_S}s",
        )

    output = _truncate(result.stdout + "\n" + result.stderr)

    if result.returncode == 0:
        return CheckResult(
            name="playwright",
            passed=True,
            message="Playwright tests passed",
            details=output,
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
        re.compile(r"\byaml\.load\s*\((?!.*SafeLoader)"),
    ),
    ("marshal deserialization", re.compile(r"\bmarshal\.loads?\s*\(")),
]

_SECRET_PATTERNS: list[re.Pattern[str]] = [
    # OpenAI-style API keys
    re.compile(r"""['"]sk-[A-Za-z0-9]{10,}['"]"""),
    re.compile(r"""['"]pk-[A-Za-z0-9]{10,}['"]"""),
    # GitHub personal access tokens
    re.compile(r"""['"]ghp_[A-Za-z0-9]{10,}['"]"""),
    # AWS access key IDs
    re.compile(r"""['"]AKIA[A-Z0-9]{10,}['"]"""),
    # Generic password/secret/api_key assignments
    re.compile(
        r"""(?:password|secret|api_key)\s*=\s*['"][^'"]{4,}['"]""",
        re.IGNORECASE,
    ),
    # P2-9: Google API keys (AIza prefix)
    re.compile(r"""['"]AIza[0-9A-Za-z_-]{35}['"]"""),
    # P2-9: Stripe secret keys (sk_live_)
    re.compile(r"""['"]sk_live_[0-9a-zA-Z]{24,}['"]"""),
    # P2-9: Stripe publishable keys (pk_live_)
    re.compile(r"""['"]pk_live_[0-9a-zA-Z]{24,}['"]"""),
    # P2-9: JWT tokens (three base64url segments)
    re.compile(r"""['"]eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+['"]"""),
    # P2-9: Password/secret/token followed by base64-like value
    re.compile(
        r"""(?:password|secret|token)\s*[=:]\s*['"][A-Za-z0-9+/]{20,}={0,2}['"]""",
        re.IGNORECASE,
    ),
]


def check_syntax(
    project_dir: pathlib.Path,
    aggregate_timeout: int = _SYNTAX_AGGREGATE_TIMEOUT_S,
    py_files: list[pathlib.Path] | None = None,
) -> CheckResult:
    """Check Python syntax of all .py files in the project."""
    import time

    if py_files is None:
        py_files = _find_py_files(project_dir)

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
            msg = f"Aggregate timeout: syntax check exceeded {aggregate_timeout}s after checking {i} files"
            errors.append(msg)
            break

        # Use the built-in compile() in-process instead of spawning a subprocess
        # per file. Fall back to subprocess only if the file cannot be read.
        try:
            source = py_file.read_text(encoding="utf-8")
        except OSError as exc:
            # Cannot read the file — fall back to subprocess check
            logger.debug("Cannot read %s (%s); falling back to subprocess syntax check", py_file.name, exc)
            elapsed_agg = time.monotonic() - aggregate_start
            remaining_agg = aggregate_timeout - elapsed_agg
            file_timeout = min(_SYNTAX_PER_FILE_TIMEOUT_S, remaining_agg) if remaining_agg > 0 else 0.1
            try:
                result = subprocess.run(
                    [sys.executable, "-m", "py_compile", str(py_file)],
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    errors="replace",
                    timeout=file_timeout,
                    cwd=str(project_dir),
                    start_new_session=True,
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
            except subprocess.TimeoutExpired as e:
                try:
                    os.killpg(os.getpgid(e.pid), signal.SIGKILL)
                except (OSError, ProcessLookupError):
                    pass
                errors.append(f"{py_file.name}: compilation timed out")
            continue

        # Guard against agent-writable files that could cause a DoS via
        # compile() on extremely large inputs (Finding 47).
        if len(source) > _MAX_COMPILE_SIZE:
            errors.append(f"{py_file.name}: file too large for syntax check ({len(source)} bytes)")
            continue

        try:
            compile(source, str(py_file), "exec")
        except SyntaxError as exc:
            errors.append(f"{py_file.name}:{exc.lineno}: {exc.msg}")

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
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            cwd=str(project_dir),
            start_new_session=True,
        )
    except FileNotFoundError:
        return CheckResult(
            name="tests",
            passed=False,
            message=f"pytest not installed; cannot run tests. Install with: {_INSTALL_GUIDANCE['pytest']}",
        )
    except subprocess.TimeoutExpired as e:
        try:
            os.killpg(os.getpgid(e.pid), signal.SIGKILL)
        except (OSError, ProcessLookupError, AttributeError):
            pass
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

    Handles escaped quotes, raw strings, bytes literals (b"..."), and
    f-strings. Returns line with string contents replaced by empty string
    placeholders. For f-strings, expressions inside ``{...}`` are preserved
    while static portions are stripped.

    This helps the security scanner avoid false positives from patterns
    inside string literals (EC-3).
    """
    result: list[str] = []
    i = 0
    while i < len(line):
        # Consume string prefix characters (r, b, u, f in any case/order)
        prefix_start = i
        prefix_lower = ""
        while i < len(line) and line[i].lower() in "rbuf" and len(prefix_lower) < 3:
            prefix_lower += line[i].lower()
            i += 1

        # Check if prefix is followed by a quote character
        if prefix_lower and i < len(line) and line[i] in "\"'":
            is_raw = "r" in prefix_lower
            is_fstring = "f" in prefix_lower
            quote_char = line[i]

            # Check for triple-quote
            if line[i : i + 3] in ('"""', "'''"):
                delim = line[i : i + 3]
                i += 3
                if is_fstring:
                    # Preserve f-string expressions inside {}, strip static parts
                    result.append('""')
                    _strip_fstring_content(line, i, result, delim=delim)
                    end = line.find(delim, i)
                    i = (end + 3) if end != -1 else len(line)
                else:
                    end = line.find(delim, i)
                    i = (end + 3) if end != -1 else len(line)
                    result.append('""')
                continue

            # Single-quoted string
            i += 1  # skip opening quote
            if is_fstring:
                # Preserve f-string expressions inside {}, strip static parts
                result.append('"')
                while i < len(line) and line[i] != quote_char:
                    if not is_raw and line[i] == "\\":
                        i += 2
                        continue
                    if line[i] == "{" and i + 1 < len(line) and line[i + 1] != "{":
                        # Real expression — find matching }
                        depth = 1
                        i += 1
                        result.append("{")
                        while i < len(line) and depth > 0:
                            if line[i] == "{":
                                depth += 1
                            elif line[i] == "}":
                                depth -= 1
                                if depth == 0:
                                    result.append("}")
                                    i += 1
                                    break
                            result.append(line[i])
                            i += 1
                        continue
                    i += 1
                if i < len(line):
                    i += 1  # skip closing quote
                result.append('"')
            elif is_raw:
                # Raw: no escape processing
                while i < len(line) and line[i] != quote_char:
                    i += 1
                if i < len(line):
                    i += 1
                result.append('""')
            else:
                # Regular or bytes literal: process escapes
                while i < len(line):
                    if line[i] == "\\":
                        i += 2
                        continue
                    if line[i] == quote_char:
                        i += 1
                        break
                    i += 1
                result.append('""')
            continue

        # No quote followed the prefix chars — they're just identifiers
        if prefix_lower:
            i = prefix_start  # rewind; fall through to normal char handling

        # Check for triple-quoted string (no prefix)
        if line[i : i + 3] in ('"""', "'''"):
            delim = line[i : i + 3]
            i += 3
            end = line.find(delim, i)
            i = (end + 3) if end != -1 else len(line)
            result.append('""')
            continue
        # Check for single-quoted string (no prefix)
        if line[i] in "\"'":
            quote_char = line[i]
            i += 1
            while i < len(line):
                if line[i] == "\\":
                    i += 2
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


def _strip_fstring_content(line: str, start: int, result: list[str], *, delim: str) -> None:
    """Helper: walk an f-string triple-quote body and emit expressions to *result*.

    This is best-effort for the single-line security scanner use case — it does
    not attempt full Python parsing of nested f-string expressions.
    """
    i = start
    end = line.find(delim, i)
    stop = end if end != -1 else len(line)
    while i < stop:
        if line[i] == "{" and i + 1 < stop and line[i + 1] != "{":
            depth = 1
            i += 1
            result.append("{")
            while i < stop and depth > 0:
                if line[i] == "{":
                    depth += 1
                elif line[i] == "}":
                    depth -= 1
                    if depth == 0:
                        result.append("}")
                        i += 1
                        break
                result.append(line[i])
                i += 1
        else:
            i += 1


def _get_string_line_ranges(source: str) -> set[int]:
    """Return 1-based line numbers of *interior* lines of multiline strings (S20-P2-8).

    Only the interior lines of triple-quoted strings (not the opening/closing
    lines) are excluded from security scanning.  This ensures that code on the
    same line as a triple-quote delimiter (e.g. ``eval(x); msg = \\"\\"\\"...``)
    is still scanned, while lines wholly inside a docstring body are skipped.

    Single-line strings are never excluded — secret patterns intentionally scan
    string contents for hardcoded credentials.

    Uses Python's ``tokenize`` module for accurate boundary detection.
    Falls back to an empty set (no exclusions) on ``TokenError`` so that
    syntactically invalid files are still scanned conservatively.
    """
    string_lines: set[int] = set()
    try:
        tokens = tokenize.generate_tokens(io.StringIO(source).readline)
        for tok_type, tok_string, start, end, _tok_line in tokens:
            if tok_type == tokenize.STRING:
                # Only skip interior lines of multiline strings (spans > 1 line)
                # or single-line triple-quoted strings.
                is_multiline_span = start[0] != end[0]
                is_triple_quoted = tok_string.lstrip("brBRuUfF").startswith(('"""', "'''"))

                if is_multiline_span:
                    # Skip interior lines only (not the opening/closing lines
                    # which may have code before/after the delimiter).
                    for line_no in range(start[0] + 1, end[0]):
                        string_lines.add(line_no)
                elif is_triple_quoted:
                    # Single-line triple-quoted string: skip entirely
                    string_lines.add(start[0])
    except tokenize.TokenError:
        logger.debug("tokenize.TokenError: falling back to no string exclusions")
    return string_lines


def check_security(project_dir: pathlib.Path, py_files: list[pathlib.Path] | None = None) -> CheckResult:
    """Scan Python files for security concerns."""
    if py_files is None:
        py_files = _find_py_files(project_dir)

    logger.info("Security scan: scanning %d Python files", len(py_files))
    findings: list[str] = []

    for py_file in py_files:
        try:
            content = py_file.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as exc:
            logger.warning("Skipping unreadable file %s: %s", py_file, exc)
            continue

        rel_path = py_file.relative_to(project_dir)

        # Use tokenize to accurately identify lines inside string literals (S20-P2-8).
        # This replaces the fragile line.count(delim) % 2 heuristic that failed on
        # even numbers of triple-quote pairs and mixed quote styles.
        string_lines = _get_string_line_ranges(content)

        for line_no, line in enumerate(content.splitlines(), start=1):
            stripped = line.lstrip()

            # Skip lines that are entirely inside string tokens (S20-P2-8)
            if line_no in string_lines:
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
            # Fast pre-check: skip the expensive char-by-char function for lines
            # with no string literals (~70% of code lines) (Finding 17)
            if '"' not in code_part and "'" not in code_part:
                scan_part = code_part
            else:
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


# Script extensions that require path validation when used as arguments (S20-P2-3)
_SCRIPT_EXTENSIONS: frozenset[str] = frozenset({".sh", ".bash", ".py", ".rb", ".pl"})


def _validate_command_args(args: list[str], repo_path: pathlib.Path) -> str | None:
    """Check all command arguments against the denylist (S20-P2-3).

    Returns an error message if a forbidden argument is found, or None if all args are safe.
    """
    resolved_repo = str(repo_path.resolve())
    for arg in args[1:]:
        basename = os.path.basename(arg)
        # Strip common script extensions for denylist comparison
        name_no_ext = basename
        for ext in _SCRIPT_EXTENSIONS:
            if basename.endswith(ext):
                name_no_ext = basename[: -len(ext)]
                break

        # Check if the argument basename matches a denied command
        if name_no_ext in DENIED_COMMANDS or basename in DENIED_COMMANDS:
            return f"Argument matches denied command: '{arg}'"

        # Check script files from outside the repo
        if "/" in arg or os.sep in arg:
            _, dot_ext = os.path.splitext(arg)
            if dot_ext in _SCRIPT_EXTENSIONS:
                try:
                    resolved_arg = str(pathlib.Path(arg).resolve())
                except (OSError, ValueError):
                    return f"Cannot resolve script argument path: '{arg}'"
                if not resolved_arg.startswith(resolved_repo + os.sep) and resolved_arg != resolved_repo:
                    return f"External script argument not allowed: '{arg}'"

    return None


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

    # P2-8: Check for newlines BEFORE shlex.split() since shlex treats them as whitespace
    if "\n" in command or "\r" in command:
        return CheckResult(
            name="custom",
            passed=False,
            message="Custom command rejected: newline in command",
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

        if cmd_basename in DENIED_COMMANDS:
            return CheckResult(
                name="custom",
                passed=False,
                message=f"Custom command rejected: '{cmd_basename}' is potentially destructive",
            )

        # Check for shell metacharacters in all arguments
        for arg in args:
            if any(ch in arg for ch in BLOCKED_METACHARACTERS):
                return CheckResult(
                    name="custom",
                    passed=False,
                    message="Custom command rejected: shell metacharacters detected in argument",
                )

        # Check all arguments against the denylist (S20-P2-3)
        arg_error = _validate_command_args(args, project_dir)
        if arg_error:
            return CheckResult(
                name="custom",
                passed=False,
                message=f"Custom command rejected: {arg_error}",
            )
    else:
        logger.info("Custom command validation: cmd=%s, basename=empty", command)

    try:
        result = subprocess.run(
            args,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            cwd=str(project_dir),
            shell=False,
            start_new_session=True,
        )
    except FileNotFoundError:
        return CheckResult(
            name="custom",
            passed=False,
            message=f"Command not found: {args[0]}. "
            f"Install with: {_INSTALL_GUIDANCE.get(args[0], 'check your PATH or install the tool')}",
        )
    except subprocess.TimeoutExpired as e:
        try:
            os.killpg(os.getpgid(e.pid), signal.SIGKILL)
        except (OSError, ProcessLookupError, AttributeError):
            pass
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

    # Walk the project tree once and share the result (Finding 10)
    py_files = _find_py_files(project_dir)

    checks: list[CheckResult] = [
        check_syntax(project_dir, py_files=py_files),
        check_tests(
            project_dir,
            timeout=test_timeout if test_timeout is not None else _TEST_TIMEOUT_S,
        ),
        check_security(project_dir, py_files=py_files),
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
    except (ImportError, ModuleNotFoundError, ValueError):
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
    """Write a build summary to .codelicious/build-summary.md.

    Returns the path to the written file.
    The TypeScript queue worker reads this file and appends it to the PR description.
    """
    build_state_dir = project_dir / ".codelicious"
    build_state_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    summary_path = build_state_dir / "build-summary.md"

    lines: list[str] = ["## codelicious build summary", ""]

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
            safe_name = _escape_markdown_cell(check.name)
            safe_msg = _escape_markdown_cell(check.message)
            lines.append(f"| {safe_name} | {status} | {safe_msg} |")
        lines.append("")

    summary_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    return summary_path
