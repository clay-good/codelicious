"""Writes a managed instruction block into a target project's CLAUDE.md.

The managed block sets brownfield safety rules, task tracking instructions,
and the git policy for the Claude Code agent before any phase runs.
"""

from __future__ import annotations

import json
import logging
import pathlib
import re

from codelicious._io import atomic_write_text

__all__ = ["scaffold", "scaffold_claude_dir"]

logger = logging.getLogger("codelicious.scaffolder")

_SENTINEL_START: str = "<!-- codelicious:start -->"
_SENTINEL_END: str = "<!-- codelicious:end -->"

_MANAGED_BLOCK: str = f"""{_SENTINEL_START}

# codelicious

This project is managed by codelicious. Read `.codelicious/STATE.md` for
the current task list and progress.

## Rules
- Read existing files before modifying them.
- Run `/verify-all` after changes to catch issues early.
- Update `.codelicious/STATE.md` as you complete tasks.
- When done, write "DONE" to `.codelicious/BUILD_COMPLETE`.

## How to Work
- Use the **builder** agent for parallel code implementation.
- Use the **tester** agent to run tests and fix failures.
- Use the **reviewer** agent for security and quality checks.
- Use `/run-tests`, `/lint-fix`, `/verify-all` skills for common workflows.
- Use TodoWrite to track sub-steps within complex tasks.

## Git & PR Policy
- The codelicious orchestrator owns all git operations: add, commit, push, branch creation.
- You MUST NOT run git or gh commands. The orchestrator handles them.
- NEVER push to main/master/develop/release branches directly.
- NEVER force-push or amend published commits.

{_SENTINEL_END}
"""


def scaffold(project_root: pathlib.Path, dry_run: bool = False) -> None:
    """Write or update the managed block in the target project's CLAUDE.md.

    Four cases:
    1. CLAUDE.md does not exist: create it with only the managed block.
    2. CLAUDE.md exists without the start sentinel: append the managed block.
    3. CLAUDE.md has the start+end sentinels: replace the managed block in-place.
    4. CLAUDE.md has the start sentinel but no end: append end and replace.

    When dry_run is True, logs the action and returns without writing.
    """
    claude_md = project_root / "CLAUDE.md"

    # Validate that the target path is within project_root
    resolved = claude_md.resolve()
    resolved_root = project_root.resolve()
    try:
        resolved.relative_to(resolved_root)
    except ValueError:
        raise ValueError(f"CLAUDE.md path {resolved} escapes project root {resolved_root}")

    # Try to read existing file first; use exception handling to avoid TOCTOU race
    existing: str | None = None
    try:
        existing = claude_md.read_text(encoding="utf-8")
    except FileNotFoundError:
        pass  # File doesn't exist, will create new

    if existing is not None:
        if _SENTINEL_START in existing:
            # Replace the existing managed block with the current version
            start_idx = existing.index(_SENTINEL_START)
            if _SENTINEL_END in existing:
                end_idx = existing.index(_SENTINEL_END) + len(_SENTINEL_END)
            else:
                end_idx = len(existing)

            before = existing[:start_idx]
            after = existing[end_idx:]
            updated = before + _MANAGED_BLOCK.strip() + after

            if updated.strip() == existing.strip():
                logger.debug("CLAUDE.md managed block is already up to date")
                return

            if dry_run:
                logger.info("[dry-run] Would update managed block in CLAUDE.md")
                return

            logger.info("Updating managed block in CLAUDE.md")
            atomic_write_text(claude_md, updated, project_root=project_root)
            return

        if dry_run:
            logger.info("[dry-run] Would append managed block to existing CLAUDE.md")
            return

        logger.info("Appending managed block to existing CLAUDE.md")
        atomic_write_text(claude_md, existing + "\n\n" + _MANAGED_BLOCK, project_root=project_root)
    else:
        if dry_run:
            logger.info("[dry-run] Would create CLAUDE.md with managed block")
            return

        logger.info("Creating CLAUDE.md with managed block")
        atomic_write_text(claude_md, _MANAGED_BLOCK, project_root=project_root)


# ---------------------------------------------------------------------------
# Claude Code CLI integration — .claude/ directory scaffolding (spec-v9)
# ---------------------------------------------------------------------------

_AGENT_BUILDER = """\
---
name: builder
description: Code implementation specialist. Spawns to implement a specific feature, module, or function.
tools: Read, Edit, Write, Glob, Grep, Bash, Agent, TodoWrite
model: sonnet
maxTurns: 50
---

You are a code implementation specialist working inside a codelicious
managed project.

CONTEXT:
- Read CLAUDE.md and .codelicious/STATE.md for project conventions.
- Read ALL files you will modify before making changes.
- Match existing patterns: naming, imports, error handling, code style.

YOUR JOB:
Implement the code you've been asked to write. Write clean, production-ready
code with tests. Run the test suite after your changes. Fix any failures.

QUALITY:
- Every new function needs tests.
- No hardcoded secrets, no eval(), no shell=True.
- Handle errors explicitly — no bare except.
- Follow the project's existing patterns exactly.
"""

_AGENT_TESTER = """\
---
name: tester
description: Test runner and fixer. Spawns to run the full test suite, diagnose failures, and fix them.
tools: Read, Edit, Write, Glob, Grep, Bash
model: sonnet
maxTurns: 30
---

You are a test specialist working inside a codelicious managed project.

YOUR JOB:
1. Run the full test suite (check .codelicious/STATE.md for the test command).
2. If all tests pass, report success.
3. If tests fail:
   - Read the failing test AND the code it tests.
   - Understand the root cause — is it a test bug or a code bug?
   - Fix the issue (prefer fixing code over changing tests).
   - Re-run the full test suite.
   - Repeat until all tests pass.

Also run the linter and formatter. Fix any issues.

Report: number of tests, pass/fail, any fixes applied.
"""

_AGENT_REVIEWER = """\
---
name: reviewer
description: Security and code quality reviewer. Read-only deep review for vulnerabilities and quality issues.
tools: Read, Glob, Grep, Bash
disallowedTools: Edit, Write
model: sonnet
maxTurns: 20
---

You are a senior security and quality reviewer. You do NOT modify code —
you only read and report.

REVIEW DIMENSIONS:
- Security: injection, secrets, OWASP Top 10, unsafe deserialization
- Correctness: logic errors, off-by-one, unhandled edge cases
- Reliability: race conditions, resource leaks, missing error handling
- Test coverage: untested paths, missing edge cases
- Code quality: dead code, duplication, naming issues

For each finding, report:
- Severity: P1 (critical), P2 (important), P3 (minor)
- Location: file:line
- Description: what's wrong and why it matters
- Suggested fix: how to resolve it

Be thorough but avoid false positives. Only flag real issues.
"""

_AGENT_EXPLORER = """\
---
name: explorer
description: Codebase exploration and analysis specialist. Fast research before implementation.
tools: Read, Glob, Grep, Bash
disallowedTools: Edit, Write
model: haiku
maxTurns: 15
---

You are a fast codebase explorer. Your job is to quickly find information
and report back. You do NOT modify any files.

CAPABILITIES:
- Map directory structures and file inventories
- Trace import chains and dependency graphs
- Find function/class definitions and their usages
- Identify patterns, conventions, and coding styles
- Answer specific questions about what the code does

Be concise. Return facts, file paths, and line numbers — not opinions.
"""

_SKILL_RUN_TESTS = """\
---
name: run-tests
description: Run the full test suite, diagnose any failures, fix them, and re-run until green.
allowed-tools: Read, Edit, Write, Bash, Glob, Grep
user-invocable: true
---

Run the full test suite for this project.

Steps:
1. Read .codelicious/STATE.md to find the test command.
2. Run the test command.
3. If all tests pass, report the count and exit.
4. If tests fail:
   - Read the failing test file and the source file it tests.
   - Determine root cause (code bug vs test bug).
   - Fix the issue.
   - Re-run the full test suite.
   - Repeat until all tests pass or you've attempted 5 fix cycles.
5. Report: total tests, passed, failed, fixes applied.
"""

_SKILL_LINT_FIX = """\
---
name: lint-fix
description: Run the project linter and formatter, fix all violations.
allowed-tools: Read, Edit, Bash, Glob
user-invocable: true
---

Run the linter and formatter for this project and fix all issues.

Steps:
1. Detect the linter from project config:
   - Python: ruff check . --fix && ruff format .
   - JavaScript/TypeScript: npx eslint --fix . && npx prettier --write .
   - Rust: cargo clippy --fix && cargo fmt
   - Go: golangci-lint run --fix && gofmt -w .
2. Run the appropriate commands.
3. If auto-fix doesn't resolve everything, read the remaining errors and fix
   them manually.
4. Re-run the linter to confirm zero violations.
5. Report: violations found, auto-fixed, manually fixed, remaining.
"""

_SKILL_VERIFY_ALL = """\
---
name: verify-all
description: Run all quality checks — tests, lint, format, security scan.
allowed-tools: Read, Edit, Write, Bash, Glob, Grep
user-invocable: true
---

Run the complete verification pipeline for this project.

1. **Tests**: Run the full test suite. Fix any failures.
2. **Lint**: Run the linter. Fix all violations.
3. **Format**: Run the formatter. Fix any formatting issues.
4. **Security**: Grep for common security anti-patterns:
   - eval(, exec(, shell=True, subprocess.call.*shell
   - Hardcoded secrets: password\\s*=\\s*["'], api_key\\s*=\\s*["']
   - SQL injection: f"SELECT, f"INSERT, f"UPDATE, f"DELETE
5. **State**: Update .codelicious/STATE.md with current test count and status.

Report a summary of each check: pass/fail, issues found, fixes applied.
"""

_SKILL_UPDATE_STATE = """\
---
name: update-state
description: Update .codelicious/STATE.md with accurate current status.
allowed-tools: Read, Write, Bash, Glob, Grep
user-invocable: true
---

Update .codelicious/STATE.md to accurately reflect the current state of
the project.

Steps:
1. Run the test suite and record the count.
2. Run the linter and check for violations.
3. Count source and test files.
4. Read the current STATE.md.
5. Update the test count, file counts, and task statuses to match reality.
6. Ensure all completed work is recorded.
7. Write the updated STATE.md.
"""

_RULES_SECURITY = """\
---
paths:
  - "**/*.py"
  - "**/*.js"
  - "**/*.ts"
  - "**/*.go"
  - "**/*.rs"
---

# Security Rules

When writing or modifying code, always follow these security rules:

## Never Use
- eval() or exec() with user-controlled input
- shell=True in subprocess calls
- os.system() — use subprocess with shell=False
- String formatting in SQL queries — use parameterized queries
- pickle.loads() on untrusted data
- yaml.load() without SafeLoader

## Always Do
- Validate and sanitize all external input
- Use parameterized queries for database operations
- Set explicit timeouts on network calls and subprocesses
- Use context managers for file handles and connections
- Check return values from security-sensitive operations
- Use secrets module for random token generation, not random

## Credential Safety
- Never hardcode API keys, passwords, or tokens
- Load secrets from environment variables only
- Never log secrets — use masking/redaction
- Never commit .env files
"""


def _detect_conventions(project_root: pathlib.Path) -> str:
    """Read pyproject.toml to detect line-length, quote-style, indent-style.

    Returns a formatted markdown string suitable for .claude/rules/conventions.md.
    """
    line_length = 99
    quote_style = "double quotes"
    indent_style = "4 spaces"

    pyproject = project_root / "pyproject.toml"
    if pyproject.is_file():
        try:
            text = pyproject.read_text(encoding="utf-8")
        except OSError:
            text = ""

        m = re.search(r"line-length\s*=\s*(\d+)", text)
        if m:
            line_length = int(m.group(1))

        m = re.search(r'quote-style\s*=\s*"(\w+)"', text)
        if m:
            raw = m.group(1)
            quote_style = "double quotes" if raw == "double" else "single quotes"

        m = re.search(r'indent-style\s*=\s*"(\w+)"', text)
        if m:
            raw = m.group(1)
            indent_style = "tabs" if raw == "tab" else "4 spaces"

    return f"""\
---
paths:
  - "**/*.py"
---

# Python Conventions

- Line length: {line_length} characters max
- Quote style: {quote_style}
- Indent: {indent_style}
- Line endings: LF
- No trailing whitespace
- Type hints encouraged but not required
- Test files: test_*.py in tests/ directory
- Test functions: test_* prefix
- Fixtures: use pytest fixtures, not setUp/tearDown
"""


def _build_permissions(
    test_command: str,
    lint_command: str,
    format_command: str,
) -> dict[str, list[str]]:
    """Build allow/deny permission lists.

    Claude Code receives an explicit allowlist of safe Bash commands rather than
    the broad ``Bash(*)`` wildcard.  Dangerous operations are also enumerated in
    the deny list so that any future widening of the allowlist cannot accidentally
    re-enable them.
    """
    allow: list[str] = [
        "Read",
        "Edit",
        "Write",
        "Glob",
        "Grep",
        "Agent",
        "TodoWrite",
        # Safe read-only / inspection commands
        "Bash(cat *)",
        "Bash(ls *)",
        "Bash(find *)",
        "Bash(head *)",
        "Bash(tail *)",
        "Bash(wc *)",
        "Bash(diff *)",
        "Bash(grep *)",
        "Bash(sort *)",
        "Bash(echo *)",
        # Safe filesystem mutation commands
        "Bash(mkdir *)",
        "Bash(cp *)",
        "Bash(mv *)",
        "Bash(touch *)",
        # Test runners
        "Bash(pytest *)",
        "Bash(python -m pytest *)",
        # Linters / formatters
        "Bash(ruff *)",
        "Bash(black *)",
        # JavaScript / TypeScript tooling
        "Bash(npm test *)",
        "Bash(npm run *)",
        "Bash(npx tsc *)",
        # Package installation
        "Bash(pip install *)",
        "Bash(pip3 install *)",
        "Bash(npm install *)",
    ]

    deny: list[str] = [
        # Prevent force-pushes and pushes to protected branches
        "Bash(git push --force*)",
        "Bash(git push -f *)",
        "Bash(git checkout main*)",
        "Bash(git checkout master*)",
        "Bash(git push * main*)",
        "Bash(git push * master*)",
        # Prevent destructive filesystem operations
        "Bash(rm -rf /*)",
        "Bash(rm -rf .)",
        "Bash(rm -rf ~*)",
        "Bash(sudo *)",
        # Prevent data exfiltration / network access
        "Bash(curl *)",
        "Bash(wget *)",
        "Bash(nc *)",
        "Bash(dd *)",
    ]

    return {"allow": allow, "deny": deny}


def scaffold_claude_dir(
    project_root: pathlib.Path,
    *,
    dry_run: bool = False,
    test_command: str = "",
    lint_command: str = "",
    format_command: str = "",
    languages: list[str] | None = None,
) -> list[str]:
    """Generate the ``.claude/`` directory with agents, skills, rules, and settings.

    The directory structure follows the Claude Code CLI spec-v9 layout:

    - agents/{builder,tester,reviewer,explorer}/SKILL.md
    - skills/{run-tests,lint-fix,verify-all,update-state}/SKILL.md
    - rules/{conventions.md,security.md}
    - settings.json

    Files whose content already matches the desired output are skipped
    (idempotent).  When *dry_run* is ``True``, actions are logged but
    nothing is written to disk.

    Returns a list of relative paths (from *project_root*) that were written.
    """
    # Build the file manifest: relative-path -> content
    files: dict[str, str] = {
        ".claude/agents/builder/SKILL.md": _AGENT_BUILDER,
        ".claude/agents/tester/SKILL.md": _AGENT_TESTER,
        ".claude/agents/reviewer/SKILL.md": _AGENT_REVIEWER,
        ".claude/agents/explorer/SKILL.md": _AGENT_EXPLORER,
        ".claude/skills/run-tests/SKILL.md": _SKILL_RUN_TESTS,
        ".claude/skills/lint-fix/SKILL.md": _SKILL_LINT_FIX,
        ".claude/skills/verify-all/SKILL.md": _SKILL_VERIFY_ALL,
        ".claude/skills/update-state/SKILL.md": _SKILL_UPDATE_STATE,
        ".claude/rules/security.md": _RULES_SECURITY,
    }

    # Dynamically generated files.
    files[".claude/rules/conventions.md"] = _detect_conventions(project_root)

    permissions = _build_permissions(test_command, lint_command, format_command)
    settings = {"permissions": permissions}
    files[".claude/settings.json"] = json.dumps(settings, indent=2) + "\n"

    written: list[str] = []

    for rel_path, content in files.items():
        target = project_root / rel_path

        # Idempotency: skip if content already matches.
        try:
            existing = target.read_text(encoding="utf-8")
            if existing == content:
                logger.debug("Up to date: %s", rel_path)
                continue
        except FileNotFoundError:
            pass

        if dry_run:
            logger.info("[dry-run] Would write %s", rel_path)
            written.append(rel_path)
            continue

        # Ensure parent directories exist.
        target.parent.mkdir(parents=True, exist_ok=True)

        # Use restrictive permissions for settings.json (S20-P2-10)
        file_mode = 0o600 if rel_path.endswith("settings.json") else 0o644
        atomic_write_text(target, content, mode=file_mode, project_root=project_root)
        logger.info("Wrote %s", rel_path)
        written.append(rel_path)

    if not written:
        logger.debug(".claude/ directory is already up to date")

    return written
