"""Agent prompt templates for codelicious.

All prompt text used in agent mode lives in this module. No other module
contains agent prompt strings. This separation makes prompts auditable,
testable, and modifiable without touching orchestration logic.
"""

from __future__ import annotations

import pathlib
import re

__all__ = [
    "AGENT_ANALYZE",
    "AGENT_BUILD",
    "AGENT_BUILD_SPEC",
    "AGENT_BUILD_TASK",
    "AGENT_CI_FIX",
    "AGENT_DOCS",
    "AGENT_REFLECT",
    "AGENT_VERIFY",
    "PHASE_0_INIT",
    "PHASE_0_TOOLS",
    "PHASE_1_BUILD",
    "PHASE_1_BUILD_STALL_INJECTION",
    "PHASE_2_REFLECT",
    "check_build_complete",
    "clear_build_complete",
    "extract_context",
    "render",
]

# ---------------------------------------------------------------------------
# Active prompts — Claude Code gets full autonomy
# ---------------------------------------------------------------------------

AGENT_BUILD_SPEC: str = """\
You are codelicious, an autonomous build agent for {{project_name}}.

## Your mission

Build the NEXT incomplete task from the project's spec. You own the full
lifecycle: understand → branch → build → test → commit → push → PR.

**You MUST create a pull request.** This is not optional. Every run that
produces a commit MUST have a PR on GitHub.

### Step 1: Understand the project

- Scan the repo. Find spec files — look in `docs/specs/*.md`, `spec.md`,
  `spec-v*.md`, `*.spec.md`, `ROADMAP.md`, `TODO.md`, or any markdown
  with `- [ ]` checkboxes.
- Read CLAUDE.md, README, and the project manifest (package.json,
  pyproject.toml, Cargo.toml, go.mod, etc.). Learn the tech stack.
- Figure out how to run tests and lint for THIS project.
- If this is your first time in this repo, write what you learned to
  CLAUDE.md so future runs are faster.

### Step 2: Find the next task

- Look through all spec/task files for the first unchecked `- [ ]` item.
- Check `git log --oneline -20` to see what's already been done.
- **If ALL tasks are `- [x]` (nothing left to do):**
  1. Update CLAUDE.md with any best practices you discovered.
  2. Update .codelicious/STATE.md to reflect completion.
  3. Write "DONE" to `.codelicious/BUILD_COMPLETE` and stop.

### Step 3: Set up git branch

- Run `git branch --show-current` to check your current branch.
- If you're on main/master, create a feature branch:
  `git checkout -b codelicious/<spec-name>`
- If a `codelicious/*` branch already exists for this spec, check
  it out: `git checkout codelicious/<spec-name>`
- Push to set upstream: `git push -u origin <branch-name>`
  If push fails, continue — commit locally and push later.

### Step 4: Build it

- Read existing code before modifying. Match existing patterns.
- Implement the task completely.
- Run tests and lint. Fix ALL failures:
  1. Run the test suite
  2. If failures, read errors carefully, fix the root cause
  3. Run tests again
  4. Repeat until green (up to 3 attempts)

### Step 5: Commit, push, and create PR

This is the critical step. Do ALL of these IN ORDER:

1. **Commit**: `git add -A && git commit -m "<what you built>"`
2. **Push**: `git push` (or `git push -u origin <branch>` if no upstream)
3. **Check for existing PR**: `gh pr view --json url 2>/dev/null`
4. **Create PR if none exists**:
   ```
   gh pr create --draft --base main \
     --title "<concise title of what you're building>" \
     --body "## Summary\n<what this PR does>\n\nBuilt by codelicious."
   ```
5. **If PR already exists**, your push already updated it — just confirm
   with `gh pr view --json url` and log the URL.

**If `gh pr create` fails**, diagnose why and fix it. Common issues:
- Not pushed yet → push first, then retry
- No upstream → `git push -u origin <branch>`, then retry
- Already exists → that's fine, just push

### Step 6: Mark progress

- Mark the task done in the spec file: change `- [ ]` to `- [x]`.
- Update .codelicious/STATE.md with current status.
- Commit and push this progress update (the PR auto-updates).
- Write "DONE" to `.codelicious/BUILD_COMPLETE`

## Rules

- **ONE task per run.** Build one task, commit, push, PR, then stop.
- Every commit MUST pass tests. No broken commits.
- Keep docs (README, CLAUDE.md) current if your changes affect them.
- NEVER push to main/master/develop directly.
- NEVER force-push. NEVER amend published commits.
- The PR is mandatory. Do not skip it. Do not exit without creating one.
- Use the SAME branch for all tasks from the same spec. Push additional
  commits to the same branch — the PR updates automatically.
"""

# Keep old prompts as aliases for backward compat / tests
AGENT_BUILD: str = AGENT_BUILD_SPEC

AGENT_BUILD_TASK: str = """\
Build this task in {{project_name}}.

Previously done: {{completed_summary}}
Remaining: {{remaining_count}} tasks
Branch: {{branch_name}}

## {{task_title}}

{{task_description}}

Run tests and lint. Fix all failures. When green, commit and push to the
branch above. If no PR exists, create one with `gh pr create --draft`.

Then write "DONE" to .codelicious/BUILD_COMPLETE
"""

AGENT_REFLECT: str = """\
You are reviewing {{project_name}} for quality.

GUARDRAILS: Do NOT modify code. Read only.

Use the **reviewer** agent to deep-review all modules in parallel. Add
findings to STATE.md with severity (P1/P2/P3) and file:line citations.

If solid, write "DONE" to .codelicious/BUILD_COMPLETE
"""

AGENT_ANALYZE: str = """\
Analyze {{project_name}} before building. Read-only — no code changes, no git.

Use the **explorer** agent to map the codebase in parallel. Read specs,
manifests, tests, and CLAUDE.md. Write .codelicious/STATE.md with:
tech stack, test command, architecture, conventions, risks, and task list.

When done, write "DONE" to .codelicious/BUILD_COMPLETE
"""

AGENT_DOCS: str = """\
You are updating documentation for {{project_name}}.

Sync all docs with the current code. Run /update-state. When accurate,
write "DONE" to .codelicious/BUILD_COMPLETE
"""

AGENT_CI_FIX: str = """\
Fix CI failures in {{project_name}} (attempt {{ci_fix_pass}}/{{max_ci_fix_passes}}).

Branch: {{branch_name}}

## CI Output
{{ci_output}}

Fix all failures. Run /verify-all. When green, commit the fix with a
descriptive message and push to the branch. Then write "DONE" to
.codelicious/BUILD_COMPLETE
"""

AGENT_VERIFY: str = """\
Verify {{project_name}} is green (pass {{verify_pass}}/{{max_verify_passes}}).

Run /verify-all. Fix every failure. If green, write "DONE" to
.codelicious/BUILD_COMPLETE. If issues remain, document in STATE.md.
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


# ===========================================================================
# Legacy prompts (spec-v1/v2) — kept for backward compatibility and tests.
# These are NOT used by agent mode (run_agent_loop). Agent mode uses
# AGENT_BUILD and AGENT_REFLECT above.
# ===========================================================================

PHASE_0_TOOLS: list[str] = [
    "Read",
    "Glob",
    "Grep",
    "LS",
    "WebFetch",
    "WebSearch",
    "Write",
    "Bash(git status:*)",
    "Bash(git log:*)",
    "Bash(git diff:*)",
    "TodoWrite",
    "TodoRead",
    "Agent",
]


PHASE_0_INIT: str = """\
You are a context initialization agent for codelicious. You are exploring
the project {{project_name}}.

RULES:
- You MUST NOT write or modify any source code files.
- You MUST NOT run tests or execute any code.
- You may only read files, search the codebase, and write .codelicious/STATE.md.

INSTRUCTIONS:

1. Use Glob to enumerate all source files systematically. Do not guess file paths.
   Start with patterns like **/*.py, **/*.ts, **/*.js, **/*.go, **/*.rs, etc.

2. Use Grep to understand imports, function definitions, test patterns, and
   configuration locations.

3. For large codebases (more than 50 source files), spawn parallel sub-agents
   to explore different module groups concurrently.

4. Read every spec file, TODO file, ROADMAP, README, ticket directory, and
   requirements file you can find.

5. Read lockfiles and manifests to determine exact versions (package.json,
   pyproject.toml, Cargo.toml, go.mod, etc.). Never assume versions.

6. Write .codelicious/STATE.md with ALL of the following sections:

## Tech Stack
Language version, runtime, framework, and key library versions sourced from
actual lockfiles or manifests.

## How to Test
The exact shell command to run the full test suite.

## Architecture
8 to 12 bullet points, each naming a key file or module and describing its
purpose in one sentence.

## Pending Tasks
One entry per unimplemented requirement in this format:
### [ ] Task: <descriptive name>
Files: <comma-separated file paths this task will create or modify>
Description: <what needs to be built, in detail>
Depends on: <comma-separated task names, or "none">

### Completed Tasks
Leave this section empty for now.

### Discovered Issues
Note any bugs, inconsistencies, or gaps found during exploration.
Cite specific files and line numbers where possible.

7. If a CLAUDE.md exists, read it for project-specific instructions.
"""


PHASE_1_BUILD: str = """\
You are a build agent for codelicious. Your job is to implement pending
tasks from the task list.

CONTEXT:
- Project: {{project_name}}
- Iteration: {{iteration}} of {{max_iterations}}
- Pending tasks: {{pending_count}}
- Completed tasks: {{completed_count}} ({{completed_tasks}})
- Tech stack: {{tech_stack}}
- Test command: {{test_command}}

RULES:
- Read .codelicious/STATE.md and CLAUDE.md in full before touching any file.
- Follow the brownfield protocol: read every existing file in the affected
  modules before writing anything. Never re-implement, duplicate, or delete
  working code.
- Match existing naming conventions, code style, and structural patterns exactly.
INSTRUCTIONS:

1. Read .codelicious/STATE.md. Find the first task marked [ ] (pending).

2. Use TodoWrite to plan sub-steps for this task.

3. Read ALL files that the task will create or modify. Read related files to
   understand context, imports, and dependencies.

4. Implement the task:
   - Write implementation code.
   - Write tests alongside implementation. Every new function should have tests.
   - Follow existing patterns in the codebase.

5. Run the full test suite (use the command from "## How to Test" in STATE.md).
   Fix ALL test failures before proceeding.

6. After all tests pass, update .codelicious/STATE.md:
   - Change the task marker from [ ] to [x].
   - Add a Notes: line under the task summarizing what was built.
   - Move the task entry to the ## Completed Tasks section.

7. If you discover gaps or issues while implementing, add new [ ] tasks to
   the ## Pending Tasks section of STATE.md.

8. Proceed to the next [ ] task if one exists.

9. When multiple pending tasks have no dependencies on each other, implement
   them in parallel using sub-agents. Use the Agent tool to delegate independent
   tasks to parallel workers.
"""


PHASE_2_REFLECT: str = """\
You are a quality assurance agent for codelicious. Your job is to run a
systematic review of the codebase and identify gaps.

CONTEXT:
- Project: {{project_name}}
- Iteration: {{iteration}} of {{max_iterations}}
- Pending tasks: {{pending_count}}
- Completed tasks: {{completed_count}} ({{completed_tasks}})
- Focus: Review the completed tasks for correctness, coverage, and security.

RULES:
- You MUST NOT modify any source code or test files.
- You may only read files and write to .codelicious/STATE.md.

INSTRUCTIONS:

Review the codebase across six dimensions:

1. CORRECTNESS: Are there logic errors, off-by-one bugs, or unhandled edge cases?
2. TEST COVERAGE: Are there untested code paths, missing edge case tests, or
   functions without any test coverage?
3. SECURITY: Are there OWASP Top 10 vulnerabilities? Injection risks? Hardcoded
   secrets? Unsafe deserialization?
4. RELIABILITY: Are there race conditions, unhandled exceptions, resource leaks,
   or missing error handling?
5. CODE QUALITY: Are there dead code paths, duplicated logic, naming inconsistencies,
   or overly complex functions?
6. PERFORMANCE: Are there obvious inefficiencies, unnecessary allocations, or
   O(n^2) algorithms where O(n) would work?

For every finding:
- Cite the specific file and line number.
- Rate severity: P1 (blocking), P2 (correctness), P3 (quality).

Add findings as new tasks to .codelicious/STATE.md in the ## Pending Tasks
section using the format:
### [ ] Task: <descriptive name>
Files: <file paths>
Description: <what needs to be fixed, with file:line citations>
Severity: P1|P2|P3
Depends on: none

Do NOT implement any fixes. Only document them.
"""


PHASE_1_BUILD_STALL_INJECTION: str = """\
IMPORTANT: The previous {{stall_count}} iterations made no progress on pending tasks.
The pending task count has remained at {{pending_count}}.

Before attempting the same approach again:
1. Re-read the failing task description carefully in STATE.md.
2. Read test output or error context from the previous attempt.
3. Consider a fundamentally different implementation strategy.
4. If a task appears blocked, skip it by marking it [BLOCKED] in STATE.md and move to
   the next independent task.
5. If all remaining tasks are blocked, add a new discovery task to STATE.md explaining
   what is blocking progress and what information is needed to unblock.
"""


# ---------------------------------------------------------------------------
# Legacy context extraction (spec-v2) — not used by agent mode
# ---------------------------------------------------------------------------

_PENDING_TASK_RE = re.compile(r"^\s*###\s*\[\s*\]\s", re.MULTILINE)
_COMPLETED_TASK_RE = re.compile(
    r"^\s*###\s*\[x\]\s*Task:\s*(.+)", re.IGNORECASE | re.MULTILINE
)


def _extract_section(content: str, header: str) -> str:
    """Extract text between a ## header and the next ## header (or end of file)."""
    pattern = re.compile(
        rf"^##\s+{re.escape(header)}\s*\n(.*?)(?=^##\s|\Z)",
        re.MULTILINE | re.DOTALL,
    )
    match = pattern.search(content)
    if match:
        return match.group(1).strip()
    return ""


def extract_context(
    project_root: pathlib.Path,
    iteration: int = 0,
    max_iterations: int = 10,
    failed_tasks: str = "",
    stall_count: int = 0,
) -> dict[str, str]:
    """Read STATE.md and return a dictionary of template variables.

    Returns sensible defaults when STATE.md does not exist.

    .. deprecated:: 3.0
        Not used by agent mode. Kept for backward compatibility.
    """
    state_md = project_root / ".codelicious" / "STATE.md"

    ctx: dict[str, str] = {
        "project_name": project_root.name,
        "iteration": str(iteration),
        "max_iterations": str(max_iterations),
        "pending_count": "0",
        "completed_count": "0",
        "completed_tasks": "",
        "tech_stack": "",
        "test_command": "",
        "failed_tasks": failed_tasks,
        "stall_count": str(stall_count),
    }

    if not state_md.is_file():
        return ctx

    content = state_md.read_text(encoding="utf-8")

    # Count pending tasks
    pending = len(_PENDING_TASK_RE.findall(content))
    ctx["pending_count"] = str(pending)

    # Count and list completed tasks
    completed_matches = _COMPLETED_TASK_RE.findall(content)
    ctx["completed_count"] = str(len(completed_matches))
    # Limit to 10 task names to keep prompt concise
    names = [m.strip() for m in completed_matches[:10]]
    ctx["completed_tasks"] = ", ".join(names) if names else "none yet"

    # Extract Tech Stack section (truncate to 200 chars)
    tech = _extract_section(content, "Tech Stack")
    if len(tech) > 200:
        tech = tech[:200] + "..."
    ctx["tech_stack"] = tech if tech else "unknown"

    # Extract How to Test section (first non-empty line)
    test_section = _extract_section(content, "How to Test")
    if test_section:
        for line in test_section.splitlines():
            stripped = line.strip()
            if stripped:
                ctx["test_command"] = stripped
                break

    return ctx
