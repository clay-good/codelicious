"""Agent prompt templates for codelicious.

All prompt text used in agent mode lives in this module. No other module
contains agent prompt strings. This separation makes prompts auditable,
testable, and modifiable without touching orchestration logic.
"""

from __future__ import annotations

import pathlib
import re

__all__ = [
    "AGENT_BUILD_SPEC",
    "CHUNK_EXECUTE",
    "CHUNK_FIX",
    "CHUNK_VERIFY",
    "check_build_complete",
    "clear_build_complete",
    "render",
    "scan_remaining_tasks",
    "scan_remaining_tasks_for_spec",
]

# ---------------------------------------------------------------------------
# Active prompts — Claude Code gets full autonomy
# ---------------------------------------------------------------------------

AGENT_BUILD_SPEC: str = """\
You are codelicious, an autonomous build agent for {{project_name}}.

## Your mission

Build ALL incomplete tasks from your assigned spec file. You handle
understanding, implementation, and testing. The orchestrator handles
all git operations (branching, committing, pushing, PRs) — you MUST NOT.

## Your assigned spec file

{{spec_filter}}

**IMPORTANT:** Only build tasks from the spec file listed above. Do NOT
look at or build tasks from other spec files. If the spec_filter above
is empty, find the first incomplete spec file in the repo and build from
that one only.

## CRITICAL: Do NOT run git or gh commands

The codelicious orchestrator manages all git and GitHub operations
deterministically. You MUST NOT run any of these commands:
- git checkout, git branch, git add, git commit, git push
- gh pr create, gh pr view, gh pr edit
- Any other git or gh CLI commands

If you run git or gh commands, you will create duplicate branches and
PRs. The orchestrator will commit and push your work automatically.

### Step 1: Understand the project

- Read your assigned spec file first.
- Read CLAUDE.md, README, and the project manifest (package.json,
  pyproject.toml, Cargo.toml, go.mod, etc.). Learn the tech stack.
- Figure out how to run tests and lint for THIS project.
- If this is your first time in this repo, write what you learned to
  CLAUDE.md so future runs are faster.

### Step 2: Find tasks in your assigned spec

- Look through your assigned spec file for unchecked `- [ ]` items.
- **If ALL tasks in your spec are `- [x]` (nothing left to do):**
  1. Update .codelicious/STATE.md to reflect completion.
  2. Write "DONE" to `.codelicious/BUILD_COMPLETE` and stop.

### Step 3: Build each task

For each unchecked `- [ ]` item in your assigned spec, in order:

1. Read existing code before modifying. Match existing patterns.
2. Implement the task completely.
3. Run tests and lint. Fix ALL failures:
   - Run the test suite
   - If failures, read errors carefully, fix the root cause
   - Run tests again
   - Repeat until green (up to 3 attempts)
4. Mark the task done: change `- [ ]` to `- [x]` in the spec file.
5. Move on to the next unchecked `- [ ]` item.

### Step 4: When all tasks are done

- Update .codelicious/STATE.md with current status.
- Write "DONE" to `.codelicious/BUILD_COMPLETE`

## Rules

- **Build ALL unchecked tasks** in your assigned spec before stopping.
- Every change MUST pass tests. No broken code.
- Keep docs (README, CLAUDE.md) current if your changes affect them.
- Do NOT run git or gh commands. The orchestrator handles all git ops.
"""


# ---------------------------------------------------------------------------
# spec-27 Phase 6.2: Chunk-focused prompt templates
# ---------------------------------------------------------------------------

CHUNK_EXECUTE: str = """\
You are working in {{repo_path}}.

## Spec Context
{{spec_content}}

## Your Task (Chunk {{chunk_id}})
{{chunk_description}}

## Constraints
- Only modify files relevant to this specific task
- Run tests after making changes to verify correctness
- Run linting (ruff check) to ensure code quality
- Do not modify files outside the scope of this task
- Do NOT run git or gh commands — the orchestrator handles all git operations

## Previous Work
These chunks have already been completed:
{{previous_chunks}}

## Validation
This task is complete when: {{chunk_validation}}
"""

CHUNK_VERIFY: str = """\
You are verifying changes in {{repo_path}} for chunk {{chunk_id}}.

Run all applicable checks:
1. Run the test suite (pytest, jest, cargo test, go test — whatever applies)
2. Run the linter (ruff check, eslint, etc.)
3. Check for any syntax errors or import failures

Report results. If everything passes, respond with VERIFICATION_PASSED.
If there are failures, list each one with file path and error message.
"""

CHUNK_FIX: str = """\
You are working in {{repo_path}}.

## Fix Verification Failures (Chunk {{chunk_id}})

The following verification checks failed after your changes:

{{failures}}

Please fix these issues:
1. Read the error messages carefully
2. Fix the root cause (not just the symptom)
3. Run tests and linting after your fixes to confirm they pass
4. Do NOT run git or gh commands — the orchestrator handles git
"""


# ---------------------------------------------------------------------------
# Completion detection (spec-v3)
# ---------------------------------------------------------------------------

_BUILD_COMPLETE_FILENAME = "BUILD_COMPLETE"


def check_build_complete(project_root: pathlib.Path) -> bool:
    """Check if the agent has signaled build completion.

    Tolerates case variations (DONE, Done, done) and trailing
    whitespace/punctuation from Claude.
    """
    sentinel = project_root / ".codelicious" / _BUILD_COMPLETE_FILENAME
    try:
        content = sentinel.read_text(encoding="utf-8").strip().lower()
    except (FileNotFoundError, OSError):
        return False
    return content in ("done", "done.", "done!")


def clear_build_complete(project_root: pathlib.Path) -> None:
    """Remove the completion sentinel before a new build invocation."""
    sentinel = project_root / ".codelicious" / _BUILD_COMPLETE_FILENAME
    if sentinel.is_file():
        sentinel.unlink()


_UNCHECKED_RE = re.compile(r"^\s*-\s*\[\s*\]", re.MULTILINE)
_CHECKED_RE = re.compile(r"^\s*-\s*\[[xX]\]", re.MULTILINE)

# Common locations where spec/task files live
_SPEC_GLOBS: list[str] = [
    "*.md",
    "docs/**/*.md",
    "docs/specs/**/*.md",
    "specs/**/*.md",
    ".codelicious/STATE.md",
]

# Files that are never treated as specs even if they match globs
_SPEC_EXCLUDE_NAMES: frozenset[str] = frozenset(
    {
        "README.md",
        "CHANGELOG.md",
        "CONTRIBUTING.md",
        "CODE_OF_CONDUCT.md",
        "LICENSE.md",
        "CLAUDE.md",
        "MEMORY.md",
    }
)


def scan_remaining_tasks(project_root: pathlib.Path) -> int:
    """Count remaining work across all spec/task markdown files.

    Returns a count of remaining work items:
    - Each unchecked ``- [ ]`` checkbox counts as 1.
    - A spec file with NO checkboxes at all counts as 1 (it has not
      been processed/marked up yet and needs work).
    - A spec file where all checkboxes are checked contributes 0.

    A return value of 0 means all discoverable specs appear complete.
    """
    total = 0
    seen: set[pathlib.Path] = set()
    for pattern in _SPEC_GLOBS:
        for path in project_root.glob(pattern):
            resolved = path.resolve()
            if resolved in seen or not resolved.is_file():
                continue
            if resolved.name in _SPEC_EXCLUDE_NAMES:
                continue
            seen.add(resolved)
            try:
                content = resolved.read_text(encoding="utf-8", errors="replace")
                unchecked = len(_UNCHECKED_RE.findall(content))
                has_checked = bool(_CHECKED_RE.search(content))

                if unchecked > 0:
                    total += unchecked
                elif not has_checked:
                    # No checkboxes at all -- prose spec, count as 1
                    # remaining item so the loop doesn't exit early
                    total += 1
            except OSError:
                pass
    return total


def scan_remaining_tasks_for_spec(spec_path: pathlib.Path) -> int:
    """Count remaining unchecked ``- [ ]`` items in a single spec file.

    Returns 0 if the file has no unchecked items (or all are checked).
    Returns 1 for a prose spec with no checkboxes at all.
    """
    try:
        content = spec_path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return 0

    unchecked = len(_UNCHECKED_RE.findall(content))
    if unchecked > 0:
        return unchecked

    has_checked = bool(_CHECKED_RE.search(content))
    if not has_checked:
        # Prose spec with no checkboxes — counts as 1 remaining item
        return 1

    return 0


def render(template: str, **kwargs: str) -> str:
    """Render a prompt template with optional variable substitution.

    When called with no keyword arguments, returns the template unchanged.

    Note: Uses simple {{key}} replacement. If templates need literal double
    braces, they should not match any kwarg names to avoid unintended replacement.
    """
    if not kwargs:
        return template
    result = template
    for key, value in kwargs.items():
        result = result.replace(f"{{{{{key}}}}}", value)
    return result
