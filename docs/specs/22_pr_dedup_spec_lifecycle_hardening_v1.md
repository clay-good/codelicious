---
version: 1.0.0
status: Complete
date: 2026-03-23
completed: 2026-04-03
author: Claude Opus 4.6 (spec generation), Clay Good (review)
depends_on: ["16_reliability_test_coverage_v1.md", "08_hardening_reliability_v1.md"]
related_specs: ["00_master_spec.md", "03_feature_git_orchestration.md", "21_coverage_hardening_documentation_v1.md"]
supersedes: []
---

# spec-22: PR Deduplication, Spec-as-PR Lifecycle, and Codebase Hardening

## 1. Purpose

This specification fixes the duplicate PR bug, establishes a deterministic one-spec-equals-one-PR lifecycle, and closes all remaining security, reliability, and test coverage gaps discovered during a comprehensive audit of the 9,893-line codebase.

The duplicate PR problem has been observed three times in production. PRs #6, #7, and #8 in the repository all targeted the same work (spec-16 Phase 10 ReDoS fix) but were created on three different branches: `codelicious/build-18_operational_resilience_v1`, `codelicious/build-06_production_hardening`, and `codelicious/build-05_feature_dual_engine`. Two had to be manually closed. The root cause is a missing spec-to-PR mapping, a silent TypeError at `claude_engine.py:264`, and two competing PR creation paths (the agent prompt at `prompts.py:96` and the orchestrator at `git_orchestrator.py:176`).

This spec does not introduce new features. Every phase fixes a measured deficiency.

---

## 2. Measured Baseline (2026-03-23)

All values below are measured from the current `main` branch.

| Metric | Current Value | Target After This Spec |
|--------|---------------|------------------------|
| Production source files | 34 | 34 (no new modules) |
| Production source lines | 9,893 | ~10,200 (net +300 for fixes) |
| Test files | 25 | 25+ |
| Tests passing | 715 | 760+ |
| Line coverage (pytest-cov) | 57% | 70%+ |
| Lint violations | 0 | 0 |
| Format violations | 0 | 0 |
| Open P1 findings | 4 (this audit) | 0 |
| Open P2 findings | 20 (this audit) | 0 |
| Duplicate PR incidents | 3 observed | 0 (structurally prevented) |
| Specs with orphaned PRs | 3 (PRs #6, #7, #8) | 0 |

### Deterministic vs Probabilistic Logic Breakdown

| Category | Modules | Lines | Percentage |
|----------|---------|-------|------------|
| Deterministic (fully testable, no LLM) | cli, config, parser, sandbox, verifier, fs_tools, command_runner, git_orchestrator, build_logger, logger, security_constants, errors, progress, _io, cache_engine, scaffolder, context_manager, budget_guard | ~5,500 | ~56% |
| Probabilistic (LLM-dependent, mock-testable) | executor, planner, llm_client, loop_controller, orchestrator, claude_engine, huggingface_engine, agent_runner, rag_engine, prompts | ~4,400 | ~44% |

This 56/44 split means over half the codebase reaches near-100% coverage through deterministic tests. The probabilistic modules require mock-based testing of their dispatch, error handling, and validation logic.

---

## 3. Root Cause Analysis: Duplicate PR Bug

### Observed Symptoms

Three PRs created for the same spec-16 Phase 10 work:

| PR | Title | Branch | State |
|----|-------|--------|-------|
| #6 | fix(executor): replace regex with state machine to prevent ReDoS | codelicious/build-18_operational_resilience_v1 | CLOSED (duplicate) |
| #7 | fix(executor): replace regex with state machine for code block parsing | codelicious/build-06_production_hardening | CLOSED (duplicate) |
| #8 | fix(executor): Replace regex parsers with state machines for ReDoS prevention | codelicious/build-05_feature_dual_engine | MERGED |

### Root Causes (4 Independent Failures)

**RC-1: Silent TypeError in claude_engine.py:264.** The method `ensure_draft_pr_exists(spec_summary: str)` requires one argument. The call site at `claude_engine.py:264` passes zero arguments: `git_manager.ensure_draft_pr_exists()`. This raises a `TypeError` on every invocation. The `except Exception` at line 267 swallows it silently. The orchestrator never creates its intended PR, so the agent creates its own via the prompt instructions.

**RC-2: Two competing PR creation paths.** The agent prompt at `prompts.py:93-103` instructs the Claude agent to run `gh pr create --draft` during its build step. Independently, `git_orchestrator.py:176-204` also creates PRs via `ensure_draft_pr_exists`. When both paths execute (or when RC-1 silences one), the behavior is unpredictable.

**RC-3: Branch naming is not spec-aware.** The orchestrator creates branches named `codelicious/build-{spec_stem}` where `spec_stem` is the filename of the spec file. For spec-16, if the system picks up `05_feature_dual_engine.md` as an incomplete spec (because it contains unchecked checkboxes unrelated to the current work), the branch becomes `codelicious/build-05_feature_dual_engine`. Three different specs found incomplete produce three branches and three PRs, even though the actual work is identical.

**RC-4: gh pr view checks only the current branch.** The deduplication check at `git_orchestrator.py:190` runs `gh pr view` which scopes to the current HEAD branch. It cannot detect that a PR for the same spec already exists on a different branch.

### Design Fix: One Spec = One PR

The fix establishes this invariant: **each spec file maps to exactly one branch and exactly one PR**. The branch name is derived deterministically from the spec filename. Before creating a PR, the system queries GitHub for any open PR with a title prefix matching the spec identifier. The agent prompt is stripped of all PR creation instructions -- only the orchestrator creates PRs.

---

## 4. Phase Plan

This spec contains 10 phases. Each phase is independently committable, testable, and deployable. Phases 1-4 fix the duplicate PR bug. Phases 5-8 close security and reliability findings. Phases 9-10 expand test coverage and update documentation.

---

### Phase 1: Fix the Spec-to-Branch Mapping

**Intent:** As a user running `codelicious /path/to/repo`, when the system processes spec-16, it creates a branch named `codelicious/spec-16` regardless of which filename contains the spec. If I re-run, it reuses the same branch. No orphaned branches.

**Files to modify:**
- `src/codelicious/git/git_orchestrator.py`
- `src/codelicious/engines/claude_engine.py`
- `src/codelicious/orchestrator.py`

**Changes:**

1. Add a `spec_branch_name(spec_path: Path) -> str` function to `git_orchestrator.py` that extracts the spec number from the filename (the leading digits before the first underscore) and returns `codelicious/spec-{number}`. For files without a leading number, use the full stem: `codelicious/spec-{stem}`.

2. In `git_orchestrator.py:GitManager`, add a `spec_id: str | None` attribute that tracks which spec is being built. Update `assert_safe_branch` to accept an optional `spec_id` parameter and use `spec_branch_name` to derive the feature branch name instead of the hardcoded `codelicious/auto-build`.

3. In `claude_engine.py:_run_single_cycle`, pass the spec filter path to `git_manager.assert_safe_branch(spec_id=...)` so the branch name is deterministic per spec.

4. In `orchestrator.py:_build_spec_in_worktree`, use `spec_branch_name(spec_path)` instead of `f"codelicious/build-{spec_path.stem}"`.

**Acceptance criteria:**
- [ ] `spec_branch_name(Path("16_reliability_test_coverage_v1.md"))` returns `"codelicious/spec-16"`
- [ ] `spec_branch_name(Path("ROADMAP.md"))` returns `"codelicious/spec-ROADMAP"`
- [ ] Re-running the same spec reuses the existing branch (no duplicate branches)
- [ ] All existing tests pass

**Claude Code prompt:**
```
Read src/codelicious/git/git_orchestrator.py, src/codelicious/engines/claude_engine.py, and src/codelicious/orchestrator.py.

In git_orchestrator.py, add a module-level function spec_branch_name(spec_path: Path) -> str that extracts the spec number from the filename. Use re.match(r"^(\d+)", spec_path.stem) to get the leading digits. If digits found, return f"codelicious/spec-{digits}". Otherwise return f"codelicious/spec-{spec_path.stem}".

Add a spec_id: str | None = None parameter to GitManager.__init__. Update assert_safe_branch to use spec_branch_name when spec_id is set, falling back to "codelicious/auto-build" when spec_id is None (backward compat).

In claude_engine.py _run_single_cycle, extract the spec number from spec_filter if provided, and pass it as spec_id when constructing or calling git_manager.

In orchestrator.py _build_spec_in_worktree, replace the branch_name assignment at line 420 with a call to spec_branch_name(spec_path).

Write tests in tests/test_git_orchestrator.py for spec_branch_name covering: numbered spec, non-numbered spec, path with directory prefix.

Run tests. Fix any failures. Commit with message: "fix(git): deterministic spec-to-branch mapping (spec-22 Phase 1)".
```

---

### Phase 2: Fix the Duplicate PR Check (ensure_draft_pr_exists)

**Intent:** As a user, when I run codelicious and it finishes building spec-16, the system checks if any open PR already exists for spec-16 across ALL branches (not just the current one). If a PR exists, it appends commits. If no PR exists, it creates one. I never see duplicate PRs.

**Files to modify:**
- `src/codelicious/git/git_orchestrator.py`
- `src/codelicious/engines/claude_engine.py`

**Changes:**

1. Rewrite `ensure_draft_pr_exists` to:
   a. Accept `spec_id: str` and `spec_path: Path | None = None` parameters.
   b. Use `gh pr list --state open --json number,title,headRefName --limit 100` to list all open PRs.
   c. Search for any PR whose title starts with the spec identifier prefix (e.g., `[spec-16]`).
   d. If found, log "PR #{number} already exists for spec-{id}" and return the PR number.
   e. If not found, create a new PR with title format `[spec-{id}] {summary}` and body containing the spec filename and a "Built by Codelicious" footer.
   f. Return the PR number on success, None on failure.

2. Fix `claude_engine.py:264` to pass the required arguments: `git_manager.ensure_draft_pr_exists(spec_id=spec_id, spec_path=spec_filter)`.

3. Add `timeout=30` to all `subprocess.run(["gh", ...])` calls in `git_orchestrator.py`.

4. Check `git push` return code at line 164-168. If push fails, log the error and skip PR creation.

**Acceptance criteria:**
- [ ] `ensure_draft_pr_exists("16")` finds existing PR #8 and does not create a duplicate
- [ ] `ensure_draft_pr_exists("99")` creates a new PR titled `[spec-99] ...`
- [ ] All gh subprocess calls have `timeout=30`
- [ ] Push failure prevents PR creation and logs a clear error
- [ ] The TypeError at claude_engine.py:264 is fixed
- [ ] All existing tests pass

**Claude Code prompt:**
```
Read src/codelicious/git/git_orchestrator.py and src/codelicious/engines/claude_engine.py.

Rewrite ensure_draft_pr_exists with this signature: def ensure_draft_pr_exists(self, spec_id: str, spec_summary: str = "") -> int | None.

Implementation:
1. Run gh pr list --state open --json number,title,headRefName --limit 100 with timeout=30, capture output, parse JSON.
2. Search the list for any PR whose title starts with f"[spec-{spec_id}]".
3. If found, log the match and return the PR number.
4. If not found, construct title as f"[spec-{spec_id}] {spec_summary}" (truncated to 70 chars) and body with the spec-id and "Built by Codelicious" footer.
5. Run gh pr create --draft --title ... --body ... with timeout=30.
6. Return the new PR number on success, None on failure.

Fix the push at lines 164-168 to check returncode. If non-zero, log error and return early (skip PR creation).

Fix claude_engine.py line 264 to pass spec_id derived from the spec_filter path.

Add timeout=30 to every subprocess.run(["gh", ...]) call in the file.

Write tests in tests/test_git_orchestrator.py that mock subprocess.run to test: (a) PR found by title prefix, (b) no PR found so new one created, (c) gh command failure handled gracefully, (d) push failure skips PR creation.

Run tests. Fix any failures. Commit with message: "fix(git): PR deduplication via spec-id title prefix (spec-22 Phase 2)".
```

---

### Phase 3: Remove PR Creation from Agent Prompt

**Intent:** As a user, the PR lifecycle is handled exclusively by the deterministic Python orchestrator, not by the LLM agent. The agent focuses on code implementation, testing, and committing. PR creation is a post-build orchestrator responsibility.

**Files to modify:**
- `src/codelicious/prompts.py`

**Changes:**

1. In `AGENT_BUILD_SPEC`, replace Step 5 (lines 89-108) to remove all PR creation instructions. The new Step 5 should instruct the agent to:
   a. Stage specific files (not `git add -A`): `git add <files you created or modified>`
   b. Commit with a descriptive message
   c. Push to the current branch
   d. Do NOT create or manage PRs -- the orchestrator handles this

2. Remove the `gh pr create` and `gh pr view` instructions entirely from the agent prompt. The agent should never run `gh pr` commands.

3. Update `AGENT_BUILD_TASK` similarly if it contains PR instructions.

**Acceptance criteria:**
- [ ] `AGENT_BUILD_SPEC` contains no `gh pr create` or `gh pr view` instructions
- [ ] `AGENT_BUILD_SPEC` instructs `git add <specific files>` instead of `git add -A`
- [ ] The prompt still instructs the agent to commit and push
- [ ] All existing tests that reference prompt content are updated
- [ ] All tests pass

**Claude Code prompt:**
```
Read src/codelicious/prompts.py fully.

In AGENT_BUILD_SPEC, replace Step 5 (the commit/push/PR step) with:

### Step 5: Commit and push

1. **Stage specific files**: git add <files you created or modified> (do NOT use git add -A or git add .)
2. **Commit**: git commit -m "<type>(<scope>): <description>"
3. **Push**: git push (or git push -u origin <branch> if no upstream)

Do NOT create, edit, or manage pull requests. The orchestrator handles PR lifecycle.

Remove all gh pr create, gh pr view, and gh pr edit instructions from every prompt constant in the file.

Search for any test that asserts on the old prompt content (grep for "gh pr create" in tests/). Update those tests.

Run tests. Fix any failures. Commit with message: "fix(prompts): remove PR creation from agent prompt (spec-22 Phase 3)".
```

---

### Phase 4: Wire the Full Spec-as-PR Lifecycle

**Intent:** As a user, when I run `codelicious /path/to/repo --push-pr`, the system: (1) creates branch `codelicious/spec-{N}` for each incomplete spec, (2) builds and commits on that branch, (3) pushes, (4) creates or reuses a PR titled `[spec-{N}] ...`, (5) transitions to ready-for-review when verification passes. Each spec is a complete PR with all its commits.

**Files to modify:**
- `src/codelicious/engines/claude_engine.py`
- `src/codelicious/git/git_orchestrator.py`
- `src/codelicious/orchestrator.py`

**Changes:**

1. In `claude_engine.py:_run_single_cycle`, restructure Phase 5 (GIT) and Phase 6 (PR):
   a. Extract the spec_id from spec_filter.
   b. Pass spec_id to `commit_verified_changes` so the commit message includes the spec reference.
   c. Pass spec_id to `ensure_draft_pr_exists` so the PR title includes the spec prefix.
   d. Only call `transition_pr_to_review` if verification passed (currently called unconditionally).

2. In `git_orchestrator.py:commit_verified_changes`, accept an optional `spec_id: str | None` parameter. When provided, prefix the commit message with `[spec-{id}]`.

3. In `git_orchestrator.py:transition_pr_to_review`, accept a `spec_id: str` parameter. Use `gh pr list` to find the PR by spec-id prefix, then mark that specific PR as ready.

4. In `orchestrator.py:run`, after the merge phase, create one PR per successfully built spec using the spec-id naming.

5. Change `forbidden_branches` at line 33 from a mutable `set` to a `frozenset`.

**Acceptance criteria:**
- [ ] Running with spec-16 creates branch `codelicious/spec-16` and PR `[spec-16] ...`
- [ ] Running again with spec-16 reuses the same branch and PR
- [ ] `transition_pr_to_review` targets the correct spec's PR
- [ ] `forbidden_branches` is a `frozenset`
- [ ] All existing tests pass

**Claude Code prompt:**
```
Read src/codelicious/engines/claude_engine.py, src/codelicious/git/git_orchestrator.py, and src/codelicious/orchestrator.py.

In claude_engine.py _run_single_cycle:
- Extract spec_id from spec_filter using the same regex as spec_branch_name.
- Pass spec_id to git_manager.commit_verified_changes and git_manager.ensure_draft_pr_exists.
- Only call transition_pr_to_review if the build was verified green.

In git_orchestrator.py:
- Change line 33 from set to frozenset.
- Add spec_id: str | None = None parameter to commit_verified_changes. Prefix commit message with [spec-{id}] when provided.
- Add spec_id: str parameter to transition_pr_to_review. Use gh pr list --json to find the PR by title prefix, then run gh pr ready on that PR number.
- Remove the duplicate _check_staged_files_for_sensitive_patterns call at line 150.

In orchestrator.py run method, after merging worktree branches, call ensure_draft_pr_exists for each successfully built spec.

Write tests for: commit message prefixing, transition targeting correct PR, frozenset immutability.

Run tests. Fix any failures. Commit with message: "feat(git): complete spec-as-PR lifecycle (spec-22 Phase 4)".
```

---

### Phase 5: Fix Build Logger Cleanup Bug and File Race

**Intent:** As a user, old build directories are actually cleaned up after the configured retention period. Build log files are created with correct permissions atomically.

**Files to modify:**
- `src/codelicious/build_logger.py`

**Changes:**

1. Fix `cleanup_old_builds` at line 68: change `endswith("z")` to `endswith("Z")`. The session ID format from `strftime("%Y%m%dT%H%M%Sz")` produces an uppercase Z literal at the end.

2. Fix the corresponding `strptime` pattern at line 73 to match: `"%Y%m%dT%H%M%SZ"`.

3. Fix the file creation race at lines 159-174 (P2-12 from STATE.md): open the log file using `os.open` with `O_WRONLY | O_CREAT | O_EXCL` and mode `0o600` to set permissions atomically at creation time, then wrap with `os.fdopen`.

4. Move the `onerror` lambda at line 79 outside the for-loop to avoid creating a new function object on each iteration.

**Acceptance criteria:**
- [ ] `cleanup_old_builds` correctly identifies session directories ending in uppercase Z
- [ ] Build log files are created with 0o600 permissions atomically
- [ ] P2-12 from STATE.md is resolved
- [ ] All existing tests pass

**Claude Code prompt:**
```
Read src/codelicious/build_logger.py fully.

Fix line 68: change endswith("z") to endsWith("Z"). This is the session ID format bug -- strftime produces uppercase Z.

Fix line 73: change strptime format to use uppercase Z: "%Y%m%dT%H%M%SZ".

Fix lines 159-174 (the file creation race P2-12): Replace the open() call with:
  fd = os.open(str(path), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
  handle = os.fdopen(fd, "a")
This sets permissions atomically at file creation, eliminating the window between open and chmod.

Move the onerror lambda at line 79 outside the for-loop (define it once before the loop).

Write tests in tests/test_build_logger.py for:
- cleanup_old_builds identifies directories ending in "Z"
- Log file is created with 0o600 permissions (use os.stat to verify)
- FileExistsError from O_EXCL is handled gracefully

Run tests. Fix any failures. Commit with message: "fix(build_logger): cleanup bug and atomic file creation (spec-22 Phase 5)".
```

---

### Phase 6: Fix Audit Logger, Budget Guard, and Progress Thread Safety

**Intent:** As a user running parallel spec builds, log entries are not interleaved or corrupted, budget counters are accurate across threads, and progress file handles do not leak.

**Files to modify:**
- `src/codelicious/tools/audit_logger.py`
- `src/codelicious/budget_guard.py`
- `src/codelicious/progress.py`

**Changes:**

1. In `audit_logger.py:AuditFormatter.format` (lines 35-36), save and restore `record.levelname` instead of mutating it permanently. This prevents corruption of downstream handlers.

2. In `audit_logger.py:_write_to_file` and `_write_to_security_log`, add a `threading.Lock` to serialize file writes. Acquire the lock before `open()`, release after `close()`.

3. In `budget_guard.py`, add a `threading.Lock` protecting `_calls_made` and `_estimated_cost_usd` in the `record` method. This prevents lost-update races during parallel builds.

4. In `progress.py` (lines 76-78), if `os.chmod` fails, log a warning and continue (assign `self._handle` before the `chmod` attempt). Do not raise -- the permission hardening is defense-in-depth, not critical.

**Acceptance criteria:**
- [ ] AuditFormatter does not permanently mutate LogRecord.levelname
- [ ] Concurrent audit log writes do not interleave
- [ ] BudgetGuard.record is thread-safe
- [ ] ProgressReporter does not leak file handles on chmod failure
- [ ] All existing tests pass

**Claude Code prompt:**
```
Read src/codelicious/tools/audit_logger.py, src/codelicious/budget_guard.py, and src/codelicious/progress.py.

In audit_logger.py AuditFormatter.format:
- Save original: orig_level = record.levelname
- Set custom: record.levelname = self.COLORS[record.levelno]
- Format: result = super().format(record)
- Restore: record.levelname = orig_level
- Return result

In audit_logger.py, add import threading at the top. Add a module-level _file_lock = threading.Lock(). In _write_to_file and _write_to_security_log, wrap the open/write/close block with: with _file_lock:.

In budget_guard.py, add import threading. Add self._lock = threading.Lock() in __init__. In the record method, wrap the counter updates with: with self._lock:.

In progress.py, restructure lines 76-78: assign self._handle = handle before os.chmod. Wrap os.chmod in try/except OSError and log a warning on failure instead of raising.

Write tests for:
- AuditFormatter preserves original levelname after format()
- BudgetGuard.record is safe under concurrent calls (use threading)
- ProgressReporter survives chmod failure

Run tests. Fix any failures. Commit with message: "fix(thread-safety): audit logger, budget guard, and progress (spec-22 Phase 6)".
```

---

### Phase 7: Fix Context Manager Token Budget, Parser TOCTOU, and Config Repr Safety

**Intent:** As a user, file contents in prompts respect the token budget and do not cause silent budget overruns. File reads are not vulnerable to TOCTOU races. API keys are never accidentally logged.

**Files to modify:**
- `src/codelicious/context_manager.py`
- `src/codelicious/parser.py`
- `src/codelicious/config.py`

**Changes:**

1. In `context_manager.py:build_task_prompt` (lines 156-161), add a token budget check before appending each file's content. If adding the file would exceed `budget.available_tokens`, truncate the file content or skip it with a note. Update `tokens_used` after adding each file section.

2. Fix `tokens_used` tracking after Priority 5 (line 201-203) to reflect the actual tokens added by the tree section.

3. In `parser.py` (lines 69-78), eliminate the TOCTOU race: open the file once, read up to `MAX_FILE_SIZE + 1` bytes, and raise `FileTooLargeError` if the read exceeds the limit. Remove the separate `stat()` call.

4. In `config.py`, add a `__repr__` override to the `Config` dataclass that masks the `api_key` field: `api_key="****"` if set, `api_key=""` if empty. This prevents accidental exposure via logging or debugging.

**Acceptance criteria:**
- [ ] File contents in prompts respect the token budget limit
- [ ] Parser reads file once (no TOCTOU window between stat and read)
- [ ] `repr(config)` shows `api_key="****"` when a key is set
- [ ] All existing tests pass

**Claude Code prompt:**
```
Read src/codelicious/context_manager.py, src/codelicious/parser.py, and src/codelicious/config.py.

In context_manager.py build_task_prompt, at lines 156-161 where file contents are added:
- Before appending each file section, estimate its token count.
- If tokens_used + estimated > budget.available_tokens, truncate the file content to fit or skip with a "[truncated]" note.
- Update tokens_used after appending each file section.
- Fix line 201-203: update tokens_used after adding the tree section.

In parser.py, replace lines 69-78:
- Remove the stat() call.
- Open the file and read up to MAX_FILE_SIZE + 1 bytes.
- If len(content) > MAX_FILE_SIZE, raise FileTooLargeError.
- Otherwise decode and proceed.
This eliminates the TOCTOU race.

In config.py, add to the Config dataclass:
def __repr__(self):
    fields = []
    for f in dataclasses.fields(self):
        val = getattr(self, f.name)
        if f.name == "api_key" and val:
            val = "****"
        fields.append(f"{f.name}={val!r}")
    return f"Config({', '.join(fields)})"

Write tests for:
- File content truncation when budget is exceeded
- Parser raises FileTooLargeError for oversized files without TOCTOU
- Config repr masks api_key

Run tests. Fix any failures. Commit with message: "fix(security): token budget, TOCTOU, and config repr safety (spec-22 Phase 7)".
```

---

### Phase 8: Fix Security Constants and Cache/RAG Engine Gaps

**Intent:** As a user, the command denylist blocks all common code execution runtimes. The LLM agent cannot use git commands to bypass branch protections. RAG engine queries have length limits and SQLite uses WAL mode.

**Files to modify:**
- `src/codelicious/security_constants.py`
- `src/codelicious/context/cache_engine.py`
- `src/codelicious/context/rag_engine.py`

**Changes:**

1. In `security_constants.py:DENIED_COMMANDS`, add: `"java"`, `"javac"`, `"go"`, `"cargo"`, `"dotnet"`, `"mvn"`, `"gradle"`. These runtimes can execute arbitrary code if present in the target environment.

2. Add `"git"` to `DENIED_COMMANDS`. All git operations should go through `GitManager`, not through the LLM agent's `run_command` tool. This is a defense-in-depth measure: the agent prompt already forbids force-push, but advisory prohibitions are not enforceable.

3. In `cache_engine.py:record_memory_mutation`, enforce a 2000-character limit on `interaction_summary` before appending to the ledger. Truncate with a `[truncated]` suffix if exceeded.

4. In `rag_engine.py`, after opening the SQLite connection, execute `PRAGMA journal_mode=WAL` and `PRAGMA busy_timeout=5000`. Apply this in `_init_db`, `ingest_file`, and `semantic_search` connection sites.

5. In `rag_engine.py:semantic_search`, cap the `query` parameter to 2000 characters before calling `_get_embedding`.

**Acceptance criteria:**
- [ ] `"git"` is in DENIED_COMMANDS
- [ ] `"java"`, `"go"`, `"cargo"`, `"dotnet"` are in DENIED_COMMANDS
- [ ] `record_memory_mutation` truncates summaries exceeding 2000 characters
- [ ] SQLite connections use WAL mode and busy_timeout
- [ ] semantic_search caps query length to 2000 characters
- [ ] All existing tests pass (update security_constants tests for new entries)

**Claude Code prompt:**
```
Read src/codelicious/security_constants.py, src/codelicious/context/cache_engine.py, and src/codelicious/context/rag_engine.py.

In security_constants.py, add to DENIED_COMMANDS frozenset: "java", "javac", "go", "cargo", "dotnet", "mvn", "gradle", "git". Keep the frozenset sorted alphabetically.

In cache_engine.py record_memory_mutation, before appending interaction_summary to the ledger:
  MAX_SUMMARY_LEN = 2000
  if len(interaction_summary) > MAX_SUMMARY_LEN:
      interaction_summary = interaction_summary[:MAX_SUMMARY_LEN] + " [truncated]"

In rag_engine.py, create a helper _configure_connection(conn) that runs:
  conn.execute("PRAGMA journal_mode=WAL")
  conn.execute("PRAGMA busy_timeout=5000")
Call this in _init_db after opening the connection, and in ingest_file and semantic_search after their sqlite3.connect calls.

In rag_engine.py semantic_search, at the top of the method:
  MAX_QUERY_LEN = 2000
  query = query[:MAX_QUERY_LEN]

Update tests in tests/test_security_audit.py for the new denied commands. Write tests for cache_engine summary truncation and rag_engine query length cap.

Run tests. Fix any failures. Commit with message: "fix(security): expand denylist, cache limits, RAG WAL mode (spec-22 Phase 8)".
```

---

### Phase 9: Expand Test Coverage for PR Lifecycle and Orchestrator

**Intent:** As a developer, the entire PR lifecycle (branch creation, PR dedup, commit, push, transition) has comprehensive test coverage. The orchestrator's phase-based pipeline has mock-based tests for all phases.

**Files to modify:**
- `tests/test_git_orchestrator.py`
- `tests/test_claude_engine.py`

**Changes:**

1. In `tests/test_git_orchestrator.py`, add comprehensive tests for:
   a. `spec_branch_name` -- all edge cases (numbered, non-numbered, nested paths)
   b. `ensure_draft_pr_exists` -- PR found by title prefix, no PR found, gh failure, network timeout
   c. `commit_verified_changes` -- successful commit, push failure handling, spec_id prefixing
   d. `transition_pr_to_review` -- finds correct PR by spec-id, handles gh absence
   e. `assert_safe_branch` -- with spec_id, without spec_id, forbidden branch detection
   f. `_check_staged_files_for_sensitive_patterns` -- sensitive file detection, clean staging

2. In `tests/test_claude_engine.py`, add mock-based tests for:
   a. `_run_single_cycle` Phase 5/6 -- spec_id passed correctly through the pipeline
   b. `_run_single_cycle` -- TypeError no longer occurs at the ensure_draft_pr_exists call
   c. `_run_parallel_cycle` -- each spec gets its own spec-id-based branch
   d. Error recovery -- rate limit, token exhaustion, auth failure

3. Use `unittest.mock.patch("subprocess.run")` to mock all git and gh commands. Use sample JSON responses for gh pr list output.

**Acceptance criteria:**
- [ ] test_git_orchestrator.py has 30+ tests covering all public methods
- [ ] test_claude_engine.py has 15+ tests covering the build lifecycle
- [ ] All mocked tests pass
- [ ] No real subprocess calls in tests (all mocked)
- [ ] Coverage of git_orchestrator.py exceeds 80%
- [ ] Coverage of claude_engine.py exceeds 50%

**Claude Code prompt:**
```
Read tests/test_git_orchestrator.py and tests/test_claude_engine.py fully.

Expand test_git_orchestrator.py with these test functions (use unittest.mock.patch for subprocess.run):

For spec_branch_name:
- test_spec_branch_name_numbered: assert "codelicious/spec-16"
- test_spec_branch_name_non_numbered: assert "codelicious/spec-ROADMAP"
- test_spec_branch_name_nested_path: works with Path("docs/specs/16_foo.md")

For ensure_draft_pr_exists:
- test_ensure_pr_exists_finds_existing: mock gh pr list returning JSON with [spec-16] title, assert no create call
- test_ensure_pr_creates_new: mock gh pr list returning empty, assert gh pr create called
- test_ensure_pr_gh_failure: mock gh failure, assert returns None
- test_ensure_pr_timeout: mock subprocess timeout, assert graceful handling

For commit_verified_changes:
- test_commit_with_spec_id: assert commit message starts with [spec-16]
- test_commit_push_failure_skips_pr: mock push failure, assert ensure_draft_pr_exists not called
- test_commit_nothing_to_commit: mock empty status, assert no commit call
- test_commit_sensitive_file_warning: mock staged .env file, assert warning logged

For transition_pr_to_review:
- test_transition_finds_pr_by_spec_id: mock gh pr list, assert gh pr ready called with correct PR number
- test_transition_no_pr_found: assert graceful no-op

For assert_safe_branch:
- test_safe_branch_with_spec_id: assert checkout to codelicious/spec-16
- test_safe_branch_forbidden: assert feature branch created
- test_safe_branch_already_safe: assert no checkout

Expand test_claude_engine.py with mock-based tests:
- test_single_cycle_passes_spec_id: mock all phases, assert ensure_draft_pr_exists receives spec_id
- test_single_cycle_no_push_pr: assert PR methods not called when push_pr=False
- test_single_cycle_rate_limit: mock AgentTimeout, assert RATE_LIMIT result
- test_parallel_cycle_uses_spec_branches: mock specs discovery, assert each spec gets unique branch

Run tests. Fix any failures. Commit with message: "test(git): comprehensive PR lifecycle and engine tests (spec-22 Phase 9)".
```

---

### Phase 10: Update Documentation, STATE.md, and README Mermaid Diagrams

**Intent:** As a user reading the README, the documentation accurately reflects the current architecture, security posture, and spec-as-PR workflow. STATE.md reflects all fixes from this spec. Mermaid diagrams visualize the actual system design.

**Files to modify:**
- `README.md`
- `.codelicious/STATE.md`

**Changes:**

1. In README.md "How Git, Commits, and PRs Work" section, update to describe the spec-as-PR lifecycle:
   - Each spec gets branch `codelicious/spec-{N}`
   - Each spec gets exactly one PR titled `[spec-{N}] ...`
   - Re-runs append commits to the same branch/PR
   - The orchestrator handles all PR lifecycle (not the agent)

2. In README.md "Security Model" section, update the command count to match the actual DENIED_COMMANDS frozenset size after Phase 8 additions.

3. Add Mermaid diagrams to the end of README.md (see Section 5 below for diagram content).

4. Update STATE.md to reflect:
   - All P2 findings fixed (P2-12 in Phase 5, P2-NEW-1 in Phase 2)
   - Duplicate PR bug resolved
   - New test counts and coverage numbers
   - Spec-22 completion status

**Acceptance criteria:**
- [x] README documents the spec-as-PR workflow accurately
- [x] README security numbers match actual constants (96 commands, 31 extensions)
- [x] Mermaid diagrams render correctly in GitHub markdown
- [x] STATE.md reflects spec-22 completion
- [x] No stale claims remain in documentation

**Claude Code prompt:**
```
Read README.md and .codelicious/STATE.md fully.

In README.md, update the "How Git, Commits, and PRs Work" section to describe the spec-as-PR lifecycle:
- Branch naming: codelicious/spec-{N} (derived from spec filename)
- PR naming: [spec-{N}] <summary> (one PR per spec, deduplicated by title prefix)
- Re-runs append commits to the same branch and PR
- The Python orchestrator handles all PR creation and lifecycle transitions
- The LLM agent is responsible for code, tests, commits, and push only

Update the "Security Model" counts: count the actual entries in DENIED_COMMANDS and ALLOWED_EXTENSIONS and use those numbers.

Add the Mermaid diagrams from the spec to the end of README.md under a "## System Architecture" heading.

Update STATE.md:
- Current Spec: spec-22
- List each phase with completion status
- Update test counts
- Mark P2-12, P2-NEW-1 as FIXED
- Mark duplicate PR bug as FIXED

Commit with message: "docs: update README and STATE for spec-22 (spec-22 Phase 10)".
```

---

## 5. System Design (Mermaid Diagrams)

The following diagrams should be appended to the end of README.md under a `## System Architecture` heading.

### 5.1 Spec-as-PR Lifecycle

```
graph TD
    A[User runs: codelicious /path/to/repo --push-pr] --> B[CLI parses args]
    B --> C[Engine selection: Claude or HuggingFace]
    C --> D[GitManager.assert_safe_branch with spec_id]
    D --> E{On forbidden branch?}
    E -->|Yes| F[Create/checkout codelicious/spec-N]
    E -->|No| G[Continue on current branch]
    F --> H[Scaffold: write CLAUDE.md + .claude/]
    G --> H
    H --> I[Build: spawn agent with spec prompt]
    I --> J[Verify: syntax + tests + security scan]
    J -->|Fail| K[Fix agent: re-run with error context]
    K --> J
    J -->|Pass| L[Commit: git add specific-files + commit]
    L --> M[Push: git push to spec branch]
    M --> N{Push succeeded?}
    N -->|No| O[Log error, skip PR]
    N -->|Yes| P[ensure_draft_pr_exists with spec_id]
    P --> Q{PR with spec-N prefix exists?}
    Q -->|Yes| R[Log: PR already exists, commits appended]
    Q -->|No| S[gh pr create --draft with spec-N title]
    R --> T[Verify passed?]
    S --> T
    T -->|Yes| U[transition_pr_to_review]
    T -->|No| V[PR stays as draft]
```

### 5.2 Duplicate PR Prevention Flow

```
graph LR
    A[ensure_draft_pr_exists called] --> B[gh pr list --state open --json]
    B --> C{Parse JSON response}
    C -->|Success| D{Any PR title starts with spec-N?}
    C -->|Failure| E[Log warning, return None]
    D -->|Found PR #X| F[Return PR number X]
    D -->|Not found| G[gh pr create --draft]
    G --> H{Create succeeded?}
    H -->|Yes| I[Return new PR number]
    H -->|No| J[Log error, return None]
```

### 5.3 Full Build Pipeline (6 Phases)

```
graph TD
    subgraph "Phase 1: SCAFFOLD"
        S1[Write CLAUDE.md] --> S2[Write .claude/ directory]
    end

    subgraph "Phase 2: BUILD"
        B1[Clear BUILD_COMPLETE] --> B2[Render build prompt with spec filter]
        B2 --> B3[Spawn Claude agent]
        B3 --> B4{Agent completes?}
        B4 -->|Timeout| B5[Return TIMEOUT result]
        B4 -->|Rate limit| B6[Return RATE_LIMIT result]
        B4 -->|Success| B7[Continue to verify]
    end

    subgraph "Phase 3: VERIFY"
        V1[Python syntax check] --> V2[Run test suite]
        V2 --> V3[Security pattern scan]
        V3 --> V4{All passed?}
        V4 -->|No| V5[Spawn fix agent]
        V5 --> V1
        V4 -->|Yes| V6[Verification green]
    end

    subgraph "Phase 4: REFLECT"
        R1[Read-only quality review]
    end

    subgraph "Phase 5: GIT"
        G1[Stage specific files] --> G2[Commit with spec-id prefix]
        G2 --> G3[Push to spec branch]
    end

    subgraph "Phase 6: PR"
        P1[Check for existing PR by spec-id] --> P2{PR exists?}
        P2 -->|Yes| P3[Append commits]
        P2 -->|No| P4[Create draft PR]
        P3 --> P5{Verification passed?}
        P4 --> P5
        P5 -->|Yes| P6[Mark PR ready for review]
        P5 -->|No| P7[Keep as draft]
    end

    S2 --> B1
    B7 --> V1
    V6 --> R1
    R1 --> G1
    G3 --> P1
```

### 5.4 Parallel Orchestrator (Phase-Based)

```
graph TD
    subgraph "Phase 1: BUILD parallel"
        W1[Spec-16 in worktree] --> M1[Merge]
        W2[Spec-17 in worktree] --> M1
        W3[Spec-18 in worktree] --> M1
    end

    subgraph "Phase 2: MERGE serial"
        M1 --> M2{Merge conflicts?}
        M2 -->|No| M3[All merged to feature branch]
        M2 -->|Yes| M4[Abort conflicting merge, log skip]
    end

    subgraph "Phase 3: REVIEW parallel"
        M3 --> R1[Security reviewer]
        M3 --> R2[QA reviewer]
        M3 --> R3[Performance reviewer]
        R1 --> T1[Triage findings]
        R2 --> T1
        R3 --> T1
    end

    subgraph "Phase 4: FIX serial"
        T1 --> F1[Fix agent applies P1 first]
        F1 --> F2[Fix agent applies P2]
        F2 --> F3[Run verify-all]
    end

    F3 --> PR[Create/update PR per spec]
```

---

## 6. Complete Finding Inventory

This section catalogs every finding from the deep audit, its severity, which phase fixes it, and the specific file and line.

### P1 Critical (4 findings)

| ID | File | Line | Description | Phase |
|----|------|------|-------------|-------|
| S22-P1-1 | claude_engine.py | 264 | TypeError: ensure_draft_pr_exists() called with no arguments | Phase 2 |
| S22-P1-2 | git_orchestrator.py | 176-204 | Duplicate PR creation: no spec-to-PR mapping, no cross-branch dedup | Phase 2 |
| S22-P1-3 | git_orchestrator.py | 164-168 | Push failure silently swallowed, PR created for unpushed branch | Phase 2 |
| S22-P1-4 | build_logger.py | 68 | endswith("z") vs endsWith("Z") means cleanup never removes build dirs | Phase 5 |

### P2 Important (20 findings)

| ID | File | Line | Description | Phase |
|----|------|------|-------------|-------|
| S22-P2-1 | git_orchestrator.py | 33 | forbidden_branches is mutable set (should be frozenset) | Phase 4 |
| S22-P2-2 | git_orchestrator.py | 147, 150 | Duplicate _check_staged_files_for_sensitive_patterns call | Phase 4 |
| S22-P2-3 | git_orchestrator.py | 184, 190, 197 | No timeout on gh CLI subprocess calls | Phase 2 |
| S22-P2-4 | prompts.py | 93 | Agent prompt instructs git add -A (stages secrets) | Phase 3 |
| S22-P2-5 | prompts.py | 96-103 | Agent prompt creates PRs (competing with orchestrator) | Phase 3 |
| S22-P2-6 | audit_logger.py | 35-36 | LogRecord.levelname mutation corrupts downstream handlers | Phase 6 |
| S22-P2-7 | audit_logger.py | 101-108 | Log file writes not thread-safe | Phase 6 |
| S22-P2-8 | budget_guard.py | 101-118 | Counter updates not thread-safe (race in parallel builds) | Phase 6 |
| S22-P2-9 | context_manager.py | 156-161 | File contents bypass token budget cap | Phase 7 |
| S22-P2-10 | parser.py | 69-78 | TOCTOU race between stat() and read_text() | Phase 7 |
| S22-P2-11 | config.py | 161 | API key in plain dataclass repr (logging risk) | Phase 7 |
| S22-P2-12 | security_constants.py | 21-95 | Missing java, go, cargo, dotnet, git from denylist | Phase 8 |
| S22-P2-13 | cache_engine.py | 128-136 | No length limit on LLM-generated summaries | Phase 8 |
| S22-P2-14 | rag_engine.py | 142-156 | No query length cap on semantic_search | Phase 8 |
| S22-P2-15 | rag_engine.py | 36, 101, 140 | SQLite without WAL mode or busy_timeout | Phase 8 |
| S22-P2-16 | build_logger.py | 163-178 | File creation race: permissions after open (P2-12 from STATE.md) | Phase 5 |
| S22-P2-17 | progress.py | 76-78 | chmod failure leaks file handle and causes infinite retry | Phase 6 |
| S22-P2-18 | huggingface_engine.py | 99 | Raw exception leaked into LLM message history | Documented |
| S22-P2-19 | huggingface_engine.py | 83-153 | Unbounded message history accumulation | Documented |
| S22-P2-20 | git_orchestrator.py | 164-168 | Missing timeout on git push (P2-NEW-1 from STATE.md) | Phase 2 |

### P3 Minor (Documented, not fixed in this spec)

| ID | File | Description |
|----|------|-------------|
| S22-P3-1 | scaffolder.py:410-442 | _build_permissions ignores test/lint/format command parameters |
| S22-P3-2 | scaffolder.py:376-386 | Regex TOML parsing is fragile |
| S22-P3-3 | config.py:179 | max_turns=0 semantics ambiguous |
| S22-P3-4 | parser.py:143-150 | Preamble section gets level=0 and empty title |
| S22-P3-5 | registry.py:32-69 | dispatch returns dict but contract is implicit |
| S22-P3-6 | prompts.py:289-302 | render() silently ignores unused template variables |
| S22-P3-7 | prompts.py:130 | AGENT_BUILD alias exports same string under two names |
| S22-P3-8 | _io.py:43 | shutil.move cross-filesystem fallback does not fsync |
| S22-P3-9 | build_logger.py:79 | onerror lambda recreated on each loop iteration |
| S22-P3-10 | rag_engine.py:98-114 | Chunk text returned verbatim (prompt injection surface) |
| S22-P3-11 | huggingface_engine.py:104 | response["choices"][0]["message"] with no safety check |
| S22-P3-12 | huggingface_engine.py:49-54 | Config loading with vestigial allowlisted_commands key |

---

## 7. Test Plan

### Unit Tests (Per Phase)

| Phase | Test File | Tests Added | What They Cover |
|-------|-----------|-------------|-----------------|
| 1 | test_git_orchestrator.py | 3+ | spec_branch_name edge cases |
| 2 | test_git_orchestrator.py | 6+ | PR dedup, push failure, timeout |
| 4 | test_git_orchestrator.py | 5+ | Commit prefixing, transition, frozenset |
| 5 | test_build_logger.py | 3+ | Cleanup bug, atomic file creation |
| 6 | test_security_audit.py / new | 4+ | Thread safety, LogRecord preservation |
| 7 | test_context_manager.py / test_parser.py / test_config.py | 4+ | Budget, TOCTOU, repr |
| 8 | test_security_audit.py / test_cache_engine.py / test_rag_engine.py | 4+ | Denylist, truncation, WAL |
| 9 | test_git_orchestrator.py / test_claude_engine.py | 30+ | Full lifecycle coverage |

### Integration Validation

After all phases:
- [ ] `pytest` -- all tests green
- [ ] `ruff check src/ tests/` -- zero violations
- [ ] `ruff format --check src/ tests/` -- all formatted
- [ ] `bandit -r src/ -c pyproject.toml` -- zero findings
- [ ] `pip-audit` -- zero vulnerabilities
- [ ] `pytest --cov=src/codelicious --cov-report=term-missing` -- 70%+ overall

### Manual Validation (Post-Merge)

- [ ] Run `codelicious /path/to/test-repo --push-pr` with a single spec: one PR created
- [ ] Re-run: same PR updated, no duplicate
- [ ] Run with two specs: two PRs created, one per spec
- [ ] Intentionally break a spec: PR stays as draft
- [ ] Fix the spec and re-run: PR transitions to ready

---

## 8. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Adding git to DENIED_COMMANDS breaks HF engine's agentic loop if agent uses git directly | Build failures | Phase 3 removes git instructions from agent prompt; GitManager handles all git ops |
| spec_branch_name regex fails on unusual filenames | Wrong branch names | Fallback to full stem; tests cover edge cases |
| gh pr list --json output format changes across gh versions | PR dedup breaks | Parse defensively with .get(); test with sample JSON |
| Thread safety changes in Phase 6 introduce deadlocks | Hung builds | Lock scopes are narrow (single-operation); no nested locks |
| Removing PR instructions from agent prompt causes agent to skip push | PR never created | Prompt still instructs push; orchestrator creates PR post-push |

---

## 9. Dependency and Backward Compatibility Notes

- No new runtime dependencies.
- No new modules.
- Branch naming changes from `codelicious/auto-build` and `codelicious/build-{stem}` to `codelicious/spec-{N}`. Existing branches are not affected but new runs will use the new naming. This is a one-way migration.
- PR title format changes from free-form to `[spec-{N}] ...`. Existing PRs are not renamed. The dedup logic searches for the prefix, so it will not match old-format PRs. This is intentional: old PRs should be closed manually, new ones follow the convention.
- The `ensure_draft_pr_exists` signature changes from `(spec_summary: str)` to `(spec_id: str, spec_summary: str = "")`. All call sites are updated in this spec.
- The `AGENT_BUILD_SPEC` prompt changes to remove PR instructions. This affects the behavior of the Claude agent during builds but does not change any Python interfaces.

---

## 10. Out of Scope (Deferred to Future Specs)

These items were identified during the audit but are not addressed in this spec because they require new modules, new dependencies, or architectural changes beyond the current scope.

| Item | Status |
|------|--------|
| ~~REV-P1-1: Assertions in threaded context~~ | **FIXED** in spec-23 Phase 1 |
| ~~REV-P1-3: TOCTOU race in sandbox.py~~ | **FIXED** in spec-23 Phase 1 |
| ~~REV-P1-4: JSON deserialization depth limits~~ | **FIXED** in spec-23 Phase 1 |
| ~~P2-NEW-2: subprocess.run without process group~~ | **FIXED** in spec-23 Phase 1 |
| ~~S22-P2-18: HF engine error content in history~~ | **MITIGATED** — truncate_history + generic error messages |
| ~~S22-P2-19: HF engine unbounded message history~~ | **MITIGATED** — truncate_history at line 126 |
| S22-P3-10: RAG chunk prompt injection surface | Requires content sanitization framework |
| ~~CI/CD pipeline with coverage enforcement~~ | **EXISTS** — .github/workflows/ci.yml |
| ~~Pre-commit hooks~~ | **EXISTS** — .pre-commit-config.yaml |
