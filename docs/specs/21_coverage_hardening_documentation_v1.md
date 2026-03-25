# Spec-21: Test Coverage, Security Hardening, and Documentation Accuracy

**Version:** 1.0.0
**Date:** 2026-03-23
**Status:** Draft
**Depends On:** spec-16 (Phases 1-10 complete), spec-08 (complete), spec-07 (complete)
**Supersedes:** None (consolidates open items from specs 16-20 with current measured state)

---

## 1. Purpose

This specification closes the gap between the codebase's stated targets and its measured reality. As of 2026-03-23, the project reports 714 passing tests and "90%+ coverage" in spec-16 planning documents, but actual measured line coverage is 57%. Five production modules sit at 0% coverage. README claims diverge from source constants. Three P2 security findings remain open. This spec brings those numbers into alignment without adding new features, new runtime dependencies, or new modules.

---

## 2. Measured Baseline (2026-03-23)

All numbers below are measured, not projected.

| Metric | Current Value |
|--------|---------------|
| Production source files | 34 |
| Production source lines | 9,842 |
| Test files | 25 |
| Tests passing | 714 |
| Tests failing | 0 |
| Line coverage (pytest-cov) | 57% |
| Lint violations (ruff check) | 0 |
| Format violations (ruff format) | 0 |
| Bandit findings (with skip list) | 0 |
| pip-audit findings | 0 |
| Open P2 findings | 3 (P2-12, P2-NEW-1, P2-NEW-2) |
| Open REV-P1 findings | 5 (documented for future work) |
| Open REV-P2 findings | 5 (documented for future work) |
| CI coverage enforcement | None |
| Python 3.14 in CI matrix | No |

### Modules at 0% Coverage

| Module | Lines | Purpose |
|--------|-------|---------|
| budget_guard.py | 134 | Build cost tracking and budget enforcement |
| config.py | 455 | Environment and CLI configuration loading |
| orchestrator.py | 709 | Main build orchestration and phase coordination |
| huggingface_engine.py | 166 | HuggingFace HTTP engine for agentic loop |
| __main__.py | 9 | Entry point wrapper |

### Modules Below 50% Coverage

| Module | Lines | Coverage | Purpose |
|--------|-------|----------|---------|
| engines/__init__.py | 69 | 30% | Engine auto-detection |
| planner.py | 690 | 29% | Intent classification and task planning |
| tools/registry.py | 165 | 33% | Tool dispatch table |
| claude_engine.py | 588 | 34% | Claude Code CLI engine |
| git_orchestrator.py | 234 | 36% | Git operations and PR management |
| logger.py | 246 | 39% | Structured logging and secret redaction |
| prompts.py | 551 | 47% | Prompt templates and rendering |
| loop_controller.py | 250 | 50% | HuggingFace conversation loop |

### Deterministic vs Probabilistic Logic Breakdown

The codebase is a deterministic Python harness that orchestrates probabilistic LLM calls. Understanding this ratio informs which code paths are unit-testable with mocks versus which require integration-level validation.

| Category | Modules | Lines | Percentage |
|----------|---------|-------|------------|
| Deterministic (fully testable, no LLM dependency) | cli, config, parser, sandbox, verifier, fs_tools, command_runner, git_orchestrator, build_logger, logger, security_constants, errors, progress, _io, cache_engine, scaffolder, context_manager, budget_guard | ~5,500 | ~56% |
| Probabilistic (LLM-dependent, requires mocking) | executor, planner, llm_client, loop_controller, orchestrator, claude_engine, huggingface_engine, agent_runner, rag_engine, prompts | ~4,300 | ~44% |

This 56/44 split means that over half the codebase can reach near-100% coverage through deterministic unit tests alone. The probabilistic modules require mock-based testing of their dispatch, error handling, and validation logic.

---

## 3. README Documentation Discrepancies

The following claims in README.md do not match measured source code.

| README Claim | Actual Value | Location |
|--------------|--------------|----------|
| "39 dangerous commands blocked" | 80+ commands in DENIED_COMMANDS frozenset | security_constants.py lines 21-95 |
| "32 safe file types only" | 72+ extensions in ALLOWED_EXTENSIONS frozenset | sandbox.py lines 29-63 |
| Coverage claims of "90%+" in spec-16 diagrams | Measured 57% | pytest-cov output |
| "12 blocked chars" in security architecture diagram | 13 characters in BLOCKED_METACHARACTERS frozenset | security_constants.py line 14 |

---

## 4. Open Security Findings

### From STATE.md (Original Audit)

| ID | Location | Description | Severity |
|----|----------|-------------|----------|
| P2-12 | build_logger.py:163-178 | Race condition in file creation where permissions are set after open, not atomically | P2 |
| P2-NEW-1 | git_orchestrator.py:164-168 | Missing timeout on git push subprocess call, could hang indefinitely | P2 |
| P2-NEW-2 | verifier.py:190-196,262-278 | subprocess.run invoked without process group isolation, orphan risk on timeout | P2 |

### From Deep Review (REV Prefix)

| ID | Location | Description | Severity |
|----|----------|-------------|----------|
| REV-P1-1 | agent_runner.py:410,419 | Assertions used in threaded context (disabled with python -O flag) | P1 |
| REV-P1-2 | executor.py:254-257 | ReDoS risk in markdown regex with quadratic time complexity | P1 |
| REV-P1-3 | sandbox.py:229 | TOCTOU race between exists() check and subsequent write | P1 |
| REV-P1-4 | planner.py:439,614 | JSON deserialization without depth limits on untrusted input | P1 |
| REV-P1-5 | verifier.py:262-278 | Subprocess timeout does not send SIGKILL to process group | P1 |
| REV-P2-1 | agent_runner.py:428-431 | Thread lifecycle race condition between join and result check | P2 |
| REV-P2-2 | command_runner.py:14 | CommandDeniedError defined but never raised (dead code or missing integration) | P2 |
| REV-P2-3 | sandbox.py:243 | mkdir with exist_ok=True hides symlink directory substitution | P2 |
| REV-P2-4 | verifier.py:459-468 | Incomplete secret patterns missing Stripe, JWT, SSH key formats | P2 |
| REV-P2-5 | planner.py:241 | Timing side-channel on intent classifier string comparison | P2 |

### New Findings (This Audit)

| ID | Location | Description | Severity |
|----|----------|-------------|----------|
| S21-P2-1 | logger.py:50,74-77,88-89 | ReDoS in secret redaction regex: unbounded quantifiers on attacker-controlled log input | P2 |
| S21-P2-2 | claude_engine.py:507-511 | Backoff timeout parsed from message string without min/max clamp, attacker-controlled sleep duration | P2 |
| S21-P2-3 | build_logger.py:168 | Bare except BaseException catches KeyboardInterrupt and SystemExit, prevents clean shutdown | P2 |
| S21-P3-1 | Multiple files | Bare except Exception clauses mask root causes (build_logger:123, huggingface_engine:93,139, claude_engine:205,228,239,248, git_orchestrator:52,87, cli:93) | P3 |
| S21-P3-2 | agent_runner.py:65 vs parser.py:86 | Inconsistent null byte handling: agent_runner silently strips, parser rejects | P3 |

---

## 5. Scope

### In Scope

- Raise measured line coverage from 57% to 80%+ by adding tests for uncovered modules
- Close all 3 original P2 findings (P2-12, P2-NEW-1, P2-NEW-2)
- Close all 5 REV-P1 findings
- Close all 5 REV-P2 findings
- Close all 3 S21-P2 findings
- Fix README documentation discrepancies (4 items)
- Add coverage enforcement to CI pipeline
- Add Python 3.14 to CI test matrix
- Replace bare except BaseException/Exception with specific types in security-critical paths
- Generate sample test data fixtures for untested modules
- Update STATE.md with final verified metrics
- Add system design Mermaid diagrams to README.md for spec-21

### Out of Scope

- New features, commands, or CLI flags
- New runtime dependencies
- New source modules (only new test files)
- Async/await rewrite
- HTTP connection pooling
- Performance optimization
- Windows-specific path handling
- API documentation generation

---

## 6. Implementation Phases

Each phase is self-contained: implement, test, verify green. Phases are ordered by risk (security fixes first, then coverage, then documentation).

---

### Phase 1: Close P2-12 -- Build Logger File Creation Race

**Finding:** build_logger.py sets file permissions with os.chmod() after the file is already opened and written, creating a window where the file is world-readable.

**Fix:** Use os.open() with explicit mode bits to create the file with correct permissions from the start, then wrap in os.fdopen() for Pythonic file I/O.

**Acceptance Criteria:**
- File is never readable by group or other at any point in its lifecycle
- No bare except BaseException (also fixes S21-P2-3)
- Existing test_build_logger.py tests continue to pass
- New test verifies file permissions are 0o600 immediately after creation

**Claude Code Prompt:**
```
Read src/codelicious/build_logger.py in full. Find all locations where a file is
opened for writing and permissions are set afterward with os.chmod(). Refactor each
to use os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600) followed by
os.fdopen(fd, 'w') so the file is never world-readable. Also replace the bare
`except BaseException` on line 168 with `except (OSError, IOError)`. Run the
existing test_build_logger.py tests and ensure they pass. Add a new test that
creates a build session, emits an event, and asserts the log file permissions
are 0o600 using os.stat().st_mode & 0o777. Run pytest tests/test_build_logger.py
-v to verify.
```

---

### Phase 2: Close P2-NEW-1 -- Git Push Timeout

**Finding:** git_orchestrator.py calls subprocess.run() for git push without a timeout parameter. A hung remote could block the build indefinitely.

**Fix:** Add a timeout parameter (default 120 seconds) to all subprocess.run() calls in git_orchestrator.py. Catch subprocess.TimeoutExpired and raise a typed GitTimeoutError.

**Acceptance Criteria:**
- All subprocess.run() calls in git_orchestrator.py have explicit timeout parameters
- subprocess.TimeoutExpired is caught and re-raised as GitTimeoutError
- Existing test_git_orchestrator.py tests continue to pass
- New test verifies that timeout is passed to subprocess.run

**Claude Code Prompt:**
```
Read src/codelicious/git/git_orchestrator.py in full and src/codelicious/errors.py
in full. Add a GIT_TIMEOUT_S = 120 constant at the top of git_orchestrator.py.
For every subprocess.run() call in the file, add timeout=GIT_TIMEOUT_S. Wrap each
in a try/except that catches subprocess.TimeoutExpired and raises
codelicious.errors.GitTimeoutError (add this class to errors.py if it does not
exist, following the existing exception pattern). Run pytest tests/test_git_orchestrator.py
-v. Then add a new test in test_git_orchestrator.py that patches subprocess.run to
raise subprocess.TimeoutExpired and asserts GitTimeoutError is raised. Run the full
test suite with pytest tests/ -v --tb=short.
```

---

### Phase 3: Close P2-NEW-2 -- Verifier Subprocess Process Group

**Finding:** verifier.py uses subprocess.run() without start_new_session=True, so if a subprocess hangs and is killed, its children survive as orphans.

**Fix:** Add start_new_session=True to all subprocess.run() and subprocess.Popen() calls in verifier.py. On timeout, kill the entire process group.

**Acceptance Criteria:**
- All subprocess invocations in verifier.py use start_new_session=True
- Timeout handling sends SIGKILL to the process group, not just the parent
- Existing test_verifier.py tests continue to pass
- New test verifies start_new_session=True is passed to subprocess calls

**Claude Code Prompt:**
```
Read src/codelicious/verifier.py in full. Find every subprocess.run() and
subprocess.Popen() call. Add start_new_session=True to each. For any call that
has a timeout parameter, add a try/except for subprocess.TimeoutExpired that calls
os.killpg(proc.pid, signal.SIGKILL) before re-raising. Import os and signal at the
top if not already imported. Run pytest tests/test_verifier.py -v. Add a new test
that patches subprocess.run, passes a command that would time out, and verifies that
start_new_session=True was in the call kwargs. Run the full test suite.
```

---

### Phase 4: Close REV-P1-1 -- Replace Assertions with Explicit Checks

**Finding:** agent_runner.py uses Python assert statements for validation in threaded code. These are removed when Python runs with the -O (optimize) flag, silently disabling the validation.

**Fix:** Replace assert statements with explicit if/raise blocks using appropriate exception types.

**Acceptance Criteria:**
- No assert statements used for runtime validation in agent_runner.py
- Each replaced assertion raises a specific exception (ValueError, TypeError, or RuntimeError)
- Existing test_agent_runner.py tests continue to pass

**Claude Code Prompt:**
```
Read src/codelicious/agent_runner.py in full. Find all assert statements. Replace
each with an explicit if-not-condition/raise pattern. Use ValueError for argument
validation, TypeError for type checks, and RuntimeError for state invariants. Do
NOT remove assert statements in test files. Run pytest tests/test_agent_runner.py -v.
Then run the full test suite with pytest tests/ -v --tb=short.
```

---

### Phase 5: Close REV-P1-2 -- Executor ReDoS Prevention

**Finding:** executor.py has regex patterns for markdown parsing that exhibit quadratic backtracking on adversarial input.

**Fix:** Replace vulnerable regex patterns with bounded alternatives or state-machine parsers (consistent with the approach used in spec-16 Phase 10).

**Acceptance Criteria:**
- No regex pattern in executor.py uses unbounded repetition on untrusted input
- A test with a 100KB adversarial string completes in under 1 second
- Existing test_executor.py tests continue to pass

**Claude Code Prompt:**
```
Read src/codelicious/executor.py in full. Identify all re.compile() and re.search()
and re.match() calls. For each pattern that uses unbounded quantifiers like .*, .+,
[^x]*, or {n,} on input that comes from LLM responses, either add an upper bound
to the quantifier or replace the regex with a string-based state machine (as was
done in Phase 10 of spec-16). Add a test in test_executor.py that feeds a 100KB
string of repeated backtick characters and asserts parse_llm_response completes in
under 1 second using time.monotonic(). Run the full test suite.
```

---

### Phase 6: Close REV-P1-3 -- Sandbox TOCTOU Hardening

**Finding:** sandbox.py has a TOCTOU (time-of-check-time-of-use) gap at line 229 where it checks file existence before writing, but an attacker could substitute a symlink between the check and the write.

**Fix:** Use the atomic write pattern (tempfile in same directory, then os.replace) which is already used elsewhere in the codebase. The post-write symlink verification already exists; ensure it runs unconditionally.

**Acceptance Criteria:**
- No gap between existence check and write operation
- Post-write symlink verification is unconditional (not behind a flag or conditional)
- Existing test_sandbox.py tests continue to pass
- New test simulates symlink substitution between check and write

**Claude Code Prompt:**
```
Read src/codelicious/sandbox.py in full. Find the exists() check near line 229.
Refactor write_file() so that the file count validation and the actual write happen
inside the same lock-protected block, with no gap where a symlink could be
substituted. Ensure the post-write symlink check (resolve() comparison) runs
unconditionally after every write. Add a test in test_sandbox.py that patches
os.path.exists to return False on first call and True on second call (simulating
a race) and verifies the write still succeeds safely. Run the full test suite.
```

---

### Phase 7: Close REV-P1-4 -- JSON Deserialization Depth Limits

**Finding:** planner.py deserializes JSON from LLM responses without depth limits, allowing a deeply nested payload to cause stack overflow.

**Fix:** Add a pre-parse depth check that scans for nested brackets and rejects input exceeding a configurable maximum depth (default 50).

**Acceptance Criteria:**
- JSON input with nesting depth exceeding 50 is rejected with a descriptive error
- Normal LLM plan responses (typical depth 3-5) are unaffected
- Existing test_planner.py tests continue to pass
- New test verifies rejection of depth-51 nested JSON

**Claude Code Prompt:**
```
Read src/codelicious/planner.py in full and src/codelicious/loop_controller.py in
full (which already has size validation). Add a _check_json_depth(raw: str,
max_depth: int = 50) function in planner.py that iterates through the string
counting bracket nesting depth. If depth exceeds max_depth, raise
codelicious.errors.PlanValidationError. Call this function before every
json.loads() call on untrusted input in planner.py. Add a test in test_planner.py
that generates a string with 51 levels of nested objects and asserts
PlanValidationError is raised. Also test that a normal 3-level plan passes. Run
the full test suite.
```

---

### Phase 8: Close REV-P1-5 -- Verifier Subprocess SIGKILL on Timeout

**Finding:** verifier.py catches subprocess.TimeoutExpired but does not kill the process group, leaving zombie processes.

**Fix:** This overlaps with Phase 3 (P2-NEW-2). Verify that Phase 3 also addresses this finding. If Phase 3 is complete, validate with a test that the process group receives SIGKILL.

**Acceptance Criteria:**
- On timeout, os.killpg() is called with SIGKILL on the process group
- No zombie processes after timeout (verified by test)
- This is a verification phase -- if Phase 3 already covers it, just add the test

**Claude Code Prompt:**
```
Read src/codelicious/verifier.py and verify that Phase 3 changes are in place
(start_new_session=True and os.killpg on timeout). If they are, add a test in
test_verifier.py that mocks subprocess.Popen to simulate a timeout, and asserts
that os.killpg was called with signal.SIGKILL. If Phase 3 changes are NOT yet in
place, implement them as described in Phase 3 first. Run the full test suite.
```

---

### Phase 9: Close REV-P2-1 through REV-P2-5

**9a: REV-P2-1 -- Thread Lifecycle Race in agent_runner.py**

**Fix:** Add a threading.Event for completion signaling instead of relying on thread.is_alive() after join(timeout).

**9b: REV-P2-2 -- Dead Code CommandDeniedError**

**Fix:** Either integrate CommandDeniedError into the validation path (raise it from _is_safe when a denied command is detected) or remove it if CommandRunnerError already serves this purpose.

**9c: REV-P2-3 -- mkdir exist_ok=True Symlink Substitution**

**Fix:** After mkdir, verify the created path resolves to within the sandbox root using the existing resolve_path method.

**9d: REV-P2-4 -- Incomplete Secret Patterns in Verifier**

**Fix:** Add patterns for Stripe keys (sk_live_, pk_live_), JWT (eyJ prefix with two dots), and SSH private key headers.

**9e: REV-P2-5 -- Timing Side-Channel on Intent Classifier**

**Fix:** Use hmac.compare_digest() for the string comparison in the intent classifier result, or normalize timing by always comparing against all patterns regardless of early match.

**Acceptance Criteria for all 9a-9e:**
- Each finding has a corresponding fix and test
- No new bare except clauses introduced
- Full test suite passes after all fixes

**Claude Code Prompt:**
```
This phase has 5 sub-fixes. Implement them one at a time.

9a: Read src/codelicious/agent_runner.py. Replace the thread.is_alive() check
after join(timeout) with a threading.Event pattern: the worker thread sets the
event on completion, the caller waits on the event with a timeout. Add a test
that verifies the event is set after successful completion.

9b: Read src/codelicious/tools/command_runner.py. Find CommandDeniedError. If
_is_safe() currently raises CommandRunnerError when a denied command is detected,
change it to raise CommandDeniedError instead (which should be a subclass of
CommandRunnerError). Update tests to expect CommandDeniedError. If CommandDeniedError
is unused and redundant, remove it.

9c: Read src/codelicious/sandbox.py. After every os.makedirs() call, add a
resolve_path() check that verifies the created directory is within the sandbox root.
Add a test that creates a directory and verifies resolve_path succeeds.

9d: Read src/codelicious/verifier.py. Find the secret detection patterns. Add
patterns for: Stripe live keys (sk_live_[A-Za-z0-9]{24,}), Stripe publishable keys
(pk_live_[A-Za-z0-9]{24,99}), JWT tokens (eyJ[A-Za-z0-9_-]{10,100}\.[A-Za-z0-9_-]{10,100}\.),
and SSH private key headers (-----BEGIN\s+(RSA|EC|OPENSSH)\s+PRIVATE\s+KEY-----).
Add tests for each pattern.

9e: Read src/codelicious/planner.py. Find the intent classification result comparison.
Replace direct string equality with hmac.compare_digest() or normalize timing by
iterating all patterns unconditionally. Add a test that verifies classification
returns correct results for both safe and malicious intents.

After all 5 sub-fixes, run the full test suite: pytest tests/ -v --tb=short.
```

---

### Phase 10: Close S21-P2-1 -- Logger ReDoS Prevention

**Finding:** logger.py uses regex patterns with unbounded quantifiers for secret redaction. Since log messages can contain attacker-controlled input (LLM responses, error messages), these patterns are ReDoS vectors.

**Fix:** Add upper bounds to all unbounded quantifiers in secret redaction patterns.

**Acceptance Criteria:**
- No regex pattern in logger.py uses {n,} without an upper bound
- A test with a 50KB adversarial string completes in under 1 second
- Existing test_logger_sanitization.py tests continue to pass
- Secret redaction still works correctly for real-world secrets

**Claude Code Prompt:**
```
Read src/codelicious/logger.py in full. Find the _REDACT_PATTERNS list. For every
regex pattern that uses an unbounded quantifier like {100,} or {20,} or [\s\S]*,
add a reasonable upper bound. For example: {100,} becomes {100,500}, {20,} becomes
{20,200}, [\s\S]*? for SSH keys becomes [\s\S]{0,5000}. The bounds should be
generous enough to catch real secrets but small enough to prevent quadratic
backtracking. Add a test in test_logger_sanitization.py that feeds a 50KB string
of repeated "sk-" characters and asserts sanitize_message completes in under 1
second. Run the full test suite.
```

---

### Phase 11: Close S21-P2-2 -- Backoff Timeout Clamping

**Finding:** claude_engine.py parses a backoff timeout from a message string and sleeps for that duration without validation. A malformed or adversarial message could cause an arbitrarily long sleep.

**Fix:** Clamp the parsed backoff value between 1.0 and 300.0 seconds.

**Acceptance Criteria:**
- Backoff value is always between 1.0 and 300.0 seconds
- ValueError/IndexError from parsing defaults to a safe fallback
- New test verifies clamping behavior

**Claude Code Prompt:**
```
Read src/codelicious/engines/claude_engine.py in full. Find the line where backoff
is parsed from cycle_result.message (near line 507). Wrap the float() parse in a
try/except (ValueError, IndexError) with a default fallback of 30.0 seconds. After
parsing, clamp with: backoff = min(max(backoff, 1.0), 300.0). Add a test in
test_claude_engine.py that creates a mock BuildResult with message "rate_limit:999"
and verifies the engine clamps to 300.0. Add another test with message "rate_limit:0.001"
and verify it clamps to 1.0. Add a test with message "rate_limit:garbage" and verify
it uses the 30.0 default. Run the full test suite.
```

---

### Phase 12: Test Coverage -- budget_guard.py (0% to 80%+)

**Target Module:** src/codelicious/budget_guard.py (134 lines, 0% coverage)

**Expected behavior as a user:**
- As a user, when I configure a max build cost of $3.00 and my build has consumed $2.99, the next LLM call should be allowed.
- As a user, when my build exceeds the configured budget, BudgetExhaustedError should be raised immediately.
- As a user, when I set CODELICIOUS_MAX_BUILD_COST_USD=10.0 in my environment, the budget limit should be $10.00, not the default $3.00.
- As a user, when I set an invalid value like CODELICIOUS_MAX_BUILD_COST_USD=abc, the system should fall back to the default and log a warning.

**Claude Code Prompt:**
```
Read src/codelicious/budget_guard.py in full and src/codelicious/errors.py in full.
Create tests/test_budget_guard.py with the following tests:

1. test_default_limits: BudgetGuard with no env vars has max_calls=150, max_cost=3.00
2. test_env_override_max_cost: Set CODELICIOUS_MAX_BUILD_COST_USD=10.0, verify limit
3. test_env_override_invalid_falls_back: Set CODELICIOUS_MAX_BUILD_COST_USD=abc, verify default
4. test_check_under_budget: Record 5 calls at $0.10 each, check() returns True
5. test_check_over_budget_raises: Record calls until cost exceeds max, verify BudgetExhaustedError
6. test_check_over_call_limit_raises: Record 151 calls, verify BudgetExhaustedError
7. test_record_tracks_tokens: Record input/output tokens, verify token properties
8. test_record_accumulates_cost: Record multiple calls, verify total_cost_usd property
9. test_budget_guard_fresh_state: New instance has zero calls and zero cost
10. test_cost_calculation: Verify cost = (input_tokens * INPUT_RATE + output_tokens * OUTPUT_RATE) / 1_000_000

Use monkeypatch for environment variables. Do not mock internal methods. Run
pytest tests/test_budget_guard.py -v.
```

---

### Phase 13: Test Coverage -- config.py (0% to 80%+)

**Target Module:** src/codelicious/config.py (455 lines, 0% coverage)

**Expected behavior as a user:**
- As a user, when I run codelicious with --engine huggingface, the config should reflect engine="huggingface".
- As a user, when I have ANTHROPIC_API_KEY set and no --engine flag, the config should auto-detect the appropriate engine.
- As a user, when I provide an invalid --verify-passes value like -1, the system should reject it with a clear error.
- As a user, when I set CODELICIOUS_POLICY_ENABLED=true, the PolicyConfig should be populated.

**Claude Code Prompt:**
```
Read src/codelicious/config.py in full. Create tests/test_config.py with these tests:

1. test_build_config_defaults: build_config() with no args or env vars returns sensible defaults
2. test_build_config_engine_flag: build_config(["repo", "--engine", "huggingface"]) sets engine
3. test_build_config_model_flag: build_config(["repo", "--model", "deepseek-v3"]) sets model
4. test_build_config_dry_run: build_config(["repo", "--dry-run"]) sets dry_run=True
5. test_build_config_push_pr: build_config(["repo", "--push-pr"]) sets push_pr=True
6. test_build_config_verify_passes: build_config(["repo", "--verify-passes", "5"]) sets passes=5
7. test_parse_env_int_valid: _parse_env_int returns correct int
8. test_parse_env_int_invalid: _parse_env_int with non-numeric returns default
9. test_parse_env_float_valid: _parse_env_float returns correct float
10. test_parse_env_bool_true_values: _parse_env_bool with "true", "1", "yes" returns True
11. test_parse_env_bool_false_values: _parse_env_bool with "false", "0", "no" returns False
12. test_policy_config_from_env: Set CODELICIOUS_POLICY_ENABLED=true and related vars, verify PolicyConfig
13. test_config_repo_path_required: build_config([]) raises SystemExit
14. test_config_agent_timeout: build_config(["repo", "--agent-timeout", "3600"]) sets timeout

Use monkeypatch for environment variables and sys.argv. Run pytest tests/test_config.py -v.
```

---

### Phase 14: Test Coverage -- orchestrator.py (0% to 60%+)

**Target Module:** src/codelicious/orchestrator.py (709 lines, 0% coverage)

**Expected behavior as a user:**
- As a user, when I run codelicious against a repo with valid specs, the orchestrator should coordinate the build lifecycle phases in order.
- As a user, when the build phase fails, the orchestrator should attempt recovery before moving to the next phase.
- As a user, when all verification passes succeed, the build should be marked as successful.
- As a user, when I use --dry-run, no files should be written and no git operations should occur.

**Claude Code Prompt:**
```
Read src/codelicious/orchestrator.py in full. Create tests/test_orchestrator.py.
The orchestrator has complex dependencies (engines, git, verifier), so mock external
calls heavily. Test:

1. test_orchestrator_init: Orchestrator initializes with config and sets up phases
2. test_reviewer_prompts_structure: REVIEWER_PROMPTS dict has expected keys and string values
3. test_review_role_dataclass: ReviewRole has name, prompt, and system fields
4. test_dry_run_skips_execution: With dry_run=True, no subprocess calls are made
5. test_phase_ordering: Phases execute in the expected order (scaffold, build, verify, reflect, git, pr)
6. test_verification_failure_triggers_fix: When verify returns failures, a fix cycle runs
7. test_successful_build_returns_success: Mocked successful phases return BuildResult(success=True)
8. test_build_failure_returns_failure: Mocked failing build returns BuildResult(success=False)
9. test_keyboard_interrupt_handled: KeyboardInterrupt during build is caught gracefully
10. test_max_fix_iterations: After N failed fix attempts, the orchestrator stops

Mock all subprocess calls, LLM clients, git operations, and file I/O. Run
pytest tests/test_orchestrator.py -v.
```

---

### Phase 15: Test Coverage -- huggingface_engine.py (0% to 70%+)

**Target Module:** src/codelicious/engines/huggingface_engine.py (166 lines, 0% coverage)

**Expected behavior as a user:**
- As a user, when I run codelicious with --engine huggingface, it should use the HuggingFace HTTP API.
- As a user, when the LLM returns a tool_call response, the engine should dispatch the tool and continue the loop.
- As a user, when the LLM returns plain content without tool calls, the iteration should still count.
- As a user, when the max iteration limit is reached, the engine should stop and return whatever was built.

**Claude Code Prompt:**
```
Read src/codelicious/engines/huggingface_engine.py in full. Create
tests/test_huggingface_engine.py with these tests:

1. test_engine_init: HuggingFaceEngine initializes with config path and sets up client
2. test_run_build_cycle_no_tool_calls: Mock LLM returning plain text, verify loop completes
3. test_run_build_cycle_with_tool_call: Mock LLM returning tool_call, verify dispatch
4. test_max_iterations_stops_loop: Mock LLM always returning tool calls, verify loop stops at limit
5. test_tool_dispatch_read_file: Mock tool call for read_file, verify FSTooling.native_read_file called
6. test_tool_dispatch_write_file: Mock tool call for write_file, verify FSTooling.native_write_file called
7. test_tool_dispatch_run_command: Mock tool call for run_command, verify CommandRunner.safe_run called
8. test_llm_error_handled: Mock LLM raising exception, verify error is caught and logged
9. test_tool_call_invalid_json: Mock tool call with malformed JSON arguments, verify graceful handling
10. test_build_result_returned: Verify BuildResult is returned with appropriate success/message fields

Mock LLMClient, ToolRegistry, and all I/O. Run pytest tests/test_huggingface_engine.py -v.
```

---

### Phase 16: Test Coverage -- Remaining Low-Coverage Modules

Bring engines/__init__.py (30%), planner.py (29%), registry.py (33%), logger.py (39%), and prompts.py (47%) to 60%+ each.

**Claude Code Prompt:**
```
This phase adds targeted tests to 5 low-coverage modules. For each, read the source
file first, then add tests to the existing test file or create a new one.

16a: engines/__init__.py -- Add tests/test_engine_selection.py:
- test_select_engine_claude_found: Mock shutil.which("claude") returning a path, verify ClaudeCodeEngine
- test_select_engine_hf_fallback: Mock no claude, HF_TOKEN set, verify HuggingFaceEngine
- test_select_engine_neither: Mock no claude, no HF_TOKEN, verify EngineNotFoundError
- test_select_engine_explicit_claude: select_engine("claude") returns ClaudeCodeEngine
- test_select_engine_explicit_huggingface: select_engine("huggingface") returns HuggingFaceEngine

16b: planner.py -- Add to tests/test_planner.py:
- test_classify_intent_safe: Safe spec text returns "build" classification
- test_classify_intent_malicious: Injection text returns "malicious" classification
- test_create_plan_basic: Valid spec returns Task list
- test_create_plan_empty_spec: Empty spec raises PlanValidationError
- test_validate_task_paths: Task with valid paths passes validation
- test_validate_task_traversal: Task with ../ path raises SandboxViolationError

16c: tools/registry.py -- Add tests/test_registry.py:
- test_dispatch_read_file: dispatch("read_file", ...) calls fs_tools
- test_dispatch_write_file: dispatch("write_file", ...) calls fs_tools
- test_dispatch_run_command: dispatch("run_command", ...) calls command_runner
- test_dispatch_unknown_tool: dispatch("unknown", ...) raises ToolNotFoundError
- test_generate_schema: generate_schema() returns valid list of tool definitions
- test_dispatch_logs_audit: dispatch logs to audit_logger

16d: logger.py -- Add to tests/test_logger_sanitization.py:
- test_sanitizing_filter_applied: SanitizingFilter removes API keys from log records
- test_setup_logging_creates_file: setup_logging() creates log file with correct permissions
- test_timing_context: TimingContext measures elapsed time correctly
- test_log_call_details: log_call_details formats message correctly

16e: prompts.py -- Add tests/test_prompts.py:
- test_agent_build_spec_not_empty: AGENT_BUILD_SPEC is a non-empty string
- test_render_substitution: render() substitutes template variables
- test_check_build_complete_true: check_build_complete returns True for "DONE" content
- test_check_build_complete_false: check_build_complete returns False for other content
- test_all_prompt_constants_are_strings: All module-level uppercase constants are str type

Run the full test suite after all 5 sub-phases.
```

---

### Phase 17: Fix README Documentation Discrepancies

**Claude Code Prompt:**
```
Read README.md in full. Read src/codelicious/security_constants.py in full. Read
src/codelicious/sandbox.py lines 29-63 (ALLOWED_EXTENSIONS).

Fix these specific discrepancies in README.md:

1. Change "39 dangerous commands blocked" to the actual count of commands in the
   DENIED_COMMANDS frozenset. Count them programmatically:
   python3 -c "from codelicious.security_constants import DENIED_COMMANDS; print(len(DENIED_COMMANDS))"

2. Change "32 safe file types only" to the actual count of extensions in the
   ALLOWED_EXTENSIONS frozenset. Count them programmatically:
   python3 -c "from codelicious.sandbox import Sandbox; print(len(Sandbox.ALLOWED_EXTENSIONS))"

3. Change "12 blocked chars" to the actual count of characters in
   BLOCKED_METACHARACTERS.

4. In the Mermaid Security Architecture diagram, update the counts to match.

Do NOT change any other content in the README. Only fix the 4 numerical discrepancies.
Run a quick grep to verify no other occurrences of the old numbers remain.
```

---

### Phase 18: CI Pipeline Improvements

**Fix:** Add coverage enforcement and Python 3.14 to the CI matrix.

**Acceptance Criteria:**
- CI enforces minimum 75% line coverage (realistic near-term target)
- Python 3.14 is in the test matrix
- pip install sanity check verifies the package installs cleanly
- No existing CI jobs break

**Claude Code Prompt:**
```
Read .github/workflows/ci.yml in full. Make these changes:

1. Add "3.14" to the python-version matrix (after "3.13")
2. Change the pytest command from "pytest tests/ -v --tb=short" to
   "pytest tests/ -v --tb=short --cov=src/codelicious --cov-report=term-missing --cov-fail-under=75"
3. Add a new step after "Install dependencies" called "Verify install" that runs:
   "python -c 'import codelicious; print(codelicious.__version__)'"
4. Add "allow-failure: true" for the Python 3.14 matrix entry since it may have
   upstream compatibility issues. Use the continue-on-error syntax for this.

Do NOT change the security job. Only modify the test job. Run a YAML syntax check
with: python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"
```

---

### Phase 19: Replace Bare Exception Clauses in Security-Critical Paths

**Fix:** Replace bare except Exception/BaseException with specific exception types in files that handle security-sensitive operations.

**Acceptance Criteria:**
- No bare except BaseException in production code
- Bare except Exception reduced to only cases where it genuinely needs to catch all exceptions (tool dispatch, top-level CLI)
- Each replacement uses the narrowest appropriate exception type
- Full test suite passes

**Claude Code Prompt:**
```
Search the production codebase for bare exception handlers:
  grep -rn "except Exception" src/codelicious/
  grep -rn "except BaseException" src/codelicious/

For each occurrence, read the surrounding context and replace with the narrowest
appropriate exception type:
- File I/O errors: except (OSError, IOError)
- JSON parsing: except (json.JSONDecodeError, ValueError)
- Network errors: except (urllib.error.URLError, urllib.error.HTTPError, ConnectionError)
- Subprocess errors: except (subprocess.SubprocessError, OSError)
- Type/value errors: except (TypeError, ValueError)

Leave bare except Exception ONLY in these locations where catching all exceptions
is intentional:
- cli.py top-level main() (fatal error handler)
- tools/registry.py dispatch() (tool isolation)

Run the full test suite after each file modification. Do NOT modify test files.
```

---

### Phase 20: Generate Sample Test Data Fixtures

**Fix:** Create realistic test fixtures for modules that currently lack them.

**Claude Code Prompt:**
```
Create the following test fixture files:

1. tests/fixtures/sample_budget_state.json:
   A JSON object with calls_made, total_input_tokens, total_output_tokens, total_cost_usd
   representing a build at 80% budget capacity.

2. tests/fixtures/sample_config_env.json:
   A JSON object mapping environment variable names to sample values for all
   CODELICIOUS_* env vars referenced in config.py.

3. tests/fixtures/sample_orchestrator_phases.json:
   A JSON array of phase objects with name, status, duration_s, and error fields
   representing a successful 6-phase build.

4. tests/fixtures/adversarial_inputs.json:
   A JSON object with keys like "deep_nested_json" (50 levels), "long_backticks"
   (100KB of backtick characters), "null_byte_string" (string with embedded \x00),
   "path_traversal_variants" (array of 20 traversal attempts), and
   "shell_injection_variants" (array of 20 injection attempts).

5. tests/fixtures/sample_llm_responses/tool_call_response.txt:
   A realistic LLM response containing a tool_call for write_file.

6. tests/fixtures/sample_llm_responses/multi_tool_response.txt:
   A realistic LLM response containing 3 sequential tool calls.

7. tests/fixtures/sample_llm_responses/rate_limit_response.txt:
   A realistic rate limit error response from the HuggingFace API.

Make all fixtures valid JSON (where applicable) and realistic. Do not include
real API keys or secrets in any fixture.
```

---

### Phase 21: Update STATE.md with Verified Metrics

**Claude Code Prompt:**
```
Run the following commands and record their output:
  pytest tests/ -v --tb=short --cov=src/codelicious --cov-report=term-missing 2>&1 | tail -60
  ruff check src/ tests/
  ruff format --check src/ tests/
  bandit -r src/codelicious/ -s B101,B110,B310,B404,B603,B607

Read .codelicious/STATE.md. Update it to reflect:
- Current spec: spec-21
- Total tests passing (from pytest output)
- Line coverage percentage (from pytest-cov)
- Lint status (from ruff)
- Format status (from ruff)
- Security status (from bandit)
- P1 findings: count remaining
- P2 findings: count remaining
- Updated verification table
- Mark all completed phases from spec-21

Do NOT remove historical information from STATE.md. Append the spec-21 section
below the existing spec-16 section.
```

---

### Phase 22: Add Spec-21 Mermaid Diagrams to README.md

**Claude Code Prompt:**
```
Read README.md in full. Append the following Mermaid diagrams at the end of the
Architecture section (before the final ---):

1. A pie chart showing coverage distribution by module category:
   Title: "Line Coverage by Module Category (Post Spec-21)"
   Segments: Security modules (sandbox, verifier, command_runner, security_constants),
   Core pipeline (executor, planner, orchestrator, cli), Engine layer (claude_engine,
   huggingface_engine, agent_runner), Infrastructure (logger, config, cache_engine,
   build_logger, progress), with approximate coverage percentages from the pytest-cov
   run.

2. A flowchart showing the spec-21 test coverage improvement:
   Title: "Spec-21 Coverage Improvement"
   Showing modules moving from 0% or low% to their target coverage.

Use the exact Mermaid syntax already established in the README (flowchart TB, pie,
xychart-beta). Match the existing color scheme (green for good, gold for warning,
blue for new, crimson for failing).
```

---

## 7. Acceptance Criteria (Full Spec)

All criteria must be met before this spec is marked complete.

| ID | Criterion | Verification Command |
|----|-----------|---------------------|
| AC-1 | All tests pass with 0 failures | pytest tests/ -v --tb=short |
| AC-2 | Line coverage at or above 75% | pytest tests/ --cov=src/codelicious --cov-fail-under=75 |
| AC-3 | Zero lint violations | ruff check src/ tests/ |
| AC-4 | Zero format violations | ruff format --check src/ tests/ |
| AC-5 | Zero bandit findings (with skip list) | bandit -r src/codelicious/ -s B101,B110,B310,B404,B603,B607 |
| AC-6 | Zero pip-audit findings | pip-audit --desc |
| AC-7 | Zero open P2 findings from original audit | Manual: grep "Open" in STATE.md P2 table |
| AC-8 | Zero open REV-P1 findings | Manual: grep "For spec" in STATE.md REV-P1 table |
| AC-9 | README numbers match source constants | Manual: compare README claims to source |
| AC-10 | CI enforces coverage minimum | cat .github/workflows/ci.yml and verify --cov-fail-under |
| AC-11 | Python 3.14 in CI matrix | cat .github/workflows/ci.yml and verify matrix |
| AC-12 | STATE.md reflects verified metrics | Read .codelicious/STATE.md |
| AC-13 | No bare except BaseException in production code | grep -rn "except BaseException" src/codelicious/ returns 0 |
| AC-14 | New test files exist for budget_guard, config, orchestrator, huggingface_engine | ls tests/test_budget_guard.py tests/test_config.py tests/test_orchestrator.py tests/test_huggingface_engine.py |
| AC-15 | At least 15 test fixture files | ls tests/fixtures/ returns 15+ files |
| AC-16 | Mermaid diagrams added to README.md for spec-21 | grep "Spec-21" README.md |

---

## 8. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Refactoring bare exceptions changes error behavior | Medium | Medium | Run full test suite after each file change; keep broad catch in CLI main |
| Coverage target not reachable for orchestrator.py due to heavy integration | Medium | Low | Target 60% not 90% for orchestrator; accept lower coverage for integration-heavy modules |
| Python 3.14 CI failures from upstream | Medium | Low | Use continue-on-error for 3.14 matrix entry |
| ReDoS fixes break legitimate secret detection | Low | Medium | Run test_logger_sanitization.py after each regex change; keep pattern matches generous |
| TOCTOU fixes change sandbox timing | Low | High | Run test_sandbox.py concurrent tests after each change |

---

## 9. Non-Goals

- Achieving 90%+ coverage (the 75% target is realistic given the 44% probabilistic code ratio)
- Adding new CLI features or flags
- Rewriting any module from scratch
- Adding runtime dependencies
- Windows or macOS-specific path handling
- Performance benchmarking or optimization
- API documentation generation
- Pre-commit hook configuration (deferred to future spec)
- Async/await migration

---

## 10. Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| pytest | >=7.0 | Test runner |
| pytest-cov | >=4.0 | Coverage measurement and enforcement |
| ruff | >=0.4.0 | Linting and formatting |
| bandit | >=1.7.0 | Security scanning |
| pip-audit | >=2.6.0 | Dependency vulnerability checking |

All are dev-only. Zero runtime dependencies maintained.

---

## 11. Glossary

| Term | Definition |
|------|------------|
| Deterministic logic | Code paths whose output is fully determined by their input, with no LLM or probabilistic component |
| Probabilistic logic | Code paths that depend on LLM responses and whose output varies between runs |
| TOCTOU | Time-of-check-time-of-use: a race condition where the state changes between validation and use |
| ReDoS | Regular Expression Denial of Service: crafted input that causes exponential regex backtracking |
| Process group | A set of related processes that can be signaled together (used for clean timeout enforcement) |
| Atomic write | A write pattern using tempfile + os.replace that is never partially visible |
| Defense-in-depth | Multiple independent security layers so that failure of one layer does not compromise the system |
