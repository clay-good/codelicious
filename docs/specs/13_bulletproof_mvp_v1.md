---
version: 1.0.0
status: Draft
date: 2026-03-16
author: Claude Opus 4.6 (spec generation), Clay Good (review)
depends_on: ["12_mvp_closure_v1.md", "08_hardening_reliability_v1.md", "07_sandbox_security_hardening.md"]
related_specs: ["00_master_spec.md", "05_feature_dual_engine.md", "06_production_hardening.md", "09_security_reliability_v1.md", "10_comprehensive_hardening_v1.md", "11_mvp_hardening_v1.md"]
---

# spec-13: Bulletproof MVP -- Security Closure, Reliability Hardening, Dead Code Removal, Full Test Coverage, and Documentation Alignment

## 1. Executive Summary

This spec is the definitive hardening pass for the codelicious MVP. It addresses every
remaining gap identified through a comprehensive codebase review of all 30 Python source
modules (8,452 lines), 274 passing tests (14 test files, 3.31s runtime), and 12 prior
specification documents. It does not introduce net-new features, change model selection,
or modify prompt engineering. Every phase targets a concrete deficiency that already exists
in the shipped code.

Specs 07 through 12 identified and partially addressed security findings, reliability
concerns, test coverage gaps, and code quality issues. As of 2026-03-16, spec-07 is fully
complete and spec-08 Phase 2 is verified (BuildResult.success fix, CacheManager.flush_cache).
The remaining 14 phases of spec-08, all of specs 09-12 remain unimplemented. This spec
consolidates the highest-impact items from those specs, adds newly discovered findings from
an independent deep review, and sequences everything into a single executable build plan.

Goal: bring the codebase from "working MVP with 274 tests and 25+ known issues" to
"bulletproof MVP with 500+ tests, zero P1 issues, zero P2 issues, no dead code, full
documentation alignment, and enforced quality gates."

### Codebase Metrics (Measured 2026-03-16)

| Metric | Value |
|--------|-------|
| Source lines | 8,452 across 30 Python modules in src/codelicious/ |
| Test lines | ~4,000 across 14 test files in tests/ |
| Specs | 13 spec files in docs/specs/ (specs 00-12) |
| Passing tests | 274 (100% pass rate, 3.31s) |
| Exception classes | 48 in errors.py |
| Security defense layers | 9 (denylist, metacharacter, shell=False, extension allowlist, path validation, protected paths, size/count limits, security scanner, audit logging) |
| Runtime dependencies | 0 (stdlib only) |
| Modules with full test coverage | 11 of 30 (37%) |
| Modules with zero test coverage | 12 of 30 (40%) |
| Modules with partial test coverage | 7 of 30 (23%) |

### Logic Breakdown (Measured)

| Category | Lines | Percentage | Modules |
|----------|-------|------------|---------|
| Deterministic safety harness | ~3,500 | 42% | sandbox, verifier, command_runner, fs_tools, audit_logger, git_orchestrator, config, _io, budget_guard, build_logger, progress, errors, security_constants |
| Probabilistic LLM-driven | ~3,800 | 45% | planner, executor, llm_client, agent_runner, loop_controller, prompts, context_manager, scaffolder, rag_engine, engines/* |
| Shared infrastructure | ~1,100 | 13% | cli, logger, cache_engine, tools/registry |

This spec operates primarily within the deterministic 42% layer and the shared 13% layer.
The only changes to the probabilistic layer are defensive input validation at system
boundaries (planner injection guard, LLM response size cap, agent_runner argument
sanitization, conversation history bounding).

### Relationship to Prior Specs

This spec supersedes the unimplemented phases of specs 08-12 by cherry-picking and
deduplicating them into a single ordered plan. Specifically:

- Spec-08 Phases 3-16: consolidated into Phases 1-5, 7-9, 12-14, 20-21 of this spec.
- Spec-09 through Spec-10: security and reliability items merged into Phases 1-11.
- Spec-11 Phases 1-20: highest-impact items merged into Phases 1-14, 16-21.
- Spec-12 Phases 1-25: all items accounted for in this spec's 25 phases.
- New findings not in any prior spec: Phase 6 (verifier multiline string bypass),
  Phase 10 (deprecated shutil.rmtree API), Phase 11 (read-path denied-path enforcement),
  Phase 15 (conversation history bounding), Phase 22 (duplicate code elimination).

### Guiding Principles

- Fix what exists. Do not add features nobody asked for.
- Every change must have a test that would have failed before the fix.
- Security fixes are hardcoded in Python. Nothing is configurable by the LLM.
- All file I/O uses explicit encoding="utf-8".
- All logging uses percent-style formatting for SanitizingFilter interception.
- Dead code is removed, not commented out.
- Documentation reflects actual code state, not aspirational state.
- Tests are deterministic: no network, no API keys, no filesystem timing, no randomness.

---

## 2. Scope and Non-Goals

### In Scope

1. All remaining P1 (critical) security findings: prompt injection blocking, denylist
   interpreter closure, TOCTOU mitigation in fs_tools and sandbox, command split/shlex
   mismatch, API key logging sanitization, silent exception swallowing, JSON deserialization
   validation, path traversal triple-encoding defense, agent_runner prompt sanitization.
2. All remaining P2 (important) findings: incomplete path traversal, information disclosure
   to LLM, missing process group timeout, case-insensitive path bypass, DoS via directory
   listing, race in directory creation, silent chmod failure, command injection edge cases,
   secret detection false negatives, timeout overrun, regex catastrophic backtracking, race
   in file creation, incomplete secret redaction, global log level mutation.
3. All P3 findings from the independent review: f-string logging bypass, sanitizing filter
   gaps, duplicate BuildLoop/HuggingFaceEngine code, non-atomic plan file writes, metacharacter
   set inconsistency, missing HuggingFace token in secret patterns, sandbox read-path denied
   filter, BUILD_COMPLETE acceptance robustness, atomic_write_text directory boundary check,
   verifier multiline string tracking bypass, deprecated shutil.rmtree onerror API.
4. Dead code removal: approximately 1,500 lines of legacy proxilion-build code across
   executor.py, context_manager.py, parser.py, planner.py, sandbox.py, and budget_guard.py
   that are never imported by the active engine code paths.
5. Test coverage expansion: dedicated test files for all 12 currently untested modules,
   bringing total from 274 to 500+ tests.
6. Sample data generation: deterministic fixtures for LLM responses, git state, config
   schemas, and spec parsing edge cases.
7. pyproject.toml completion: dev dependencies (ruff, mypy, pytest-cov, pre-commit),
   tool configurations, coverage thresholds.
8. Documentation alignment: README.md accuracy, CLAUDE.md updates, STATE.md refresh,
   MEMORY.md population.
9. Lint and format enforcement: ruff config with explicit rule selection, format as gate.
10. Mermaid diagram updates in README.md reflecting spec-13 changes.

### Non-Goals

- New features (browser-in-the-loop, swarm architecture, vector DB activation, CI/CD bots).
- Model selection changes or prompt engineering modifications.
- License, legal compliance, or contributor documentation.
- Performance benchmarking beyond fixing known unbounded operations.
- External dependency additions (requests, httpx, pydantic) for runtime. Stdlib only.
- UI, web dashboard, or API server functionality.
- Changes to the dual-engine selection logic or HuggingFace model choices.

---

## 3. Definitions

- Deterministic logic: code paths with fixed, predictable behavior for any given input.
  Examples: sandbox path validation, command denylist checks, file extension filtering.
- Probabilistic logic: code paths whose behavior depends on LLM output. Examples: task
  planning, code generation, error recovery prompts.
- System boundary: any point where external input enters the deterministic layer. Examples:
  LLM response parsing, spec file reading, environment variable loading, config file parsing.
- TOCTOU: time-of-check-to-time-of-use race condition where a security check and the
  subsequent action happen in separate steps with an exploitable window between them.
- Dead code: source modules or functions that are not imported or called by any active
  code path (cli.py entry point through either engine).
- Regression test: a test that would have failed before the fix and passes after. Every
  fix in this spec must have at least one.

---

## 4. Acceptance Criteria (Global)

All of the following must be true when this spec is complete:

1. Zero P1 findings remain open. Each P1 fix has a regression test that would have failed
   before the fix.
2. Zero P2 findings remain open. Each P2 fix has a regression test.
3. Zero P3 findings remain open. Each P3 fix has a regression test or documented rationale.
4. Every source module in src/codelicious/ has a corresponding test file in tests/.
5. pytest runs 500+ tests with zero failures and zero collection errors.
6. pytest --cov reports 80%+ line coverage for src/codelicious/.
7. ruff check src/ tests/ passes with zero violations.
8. ruff format --check src/ tests/ passes with zero reformatting needed.
9. No dead code remains: every module in src/codelicious/ is imported by at least one
   active code path or test.
10. README.md accurately reflects the current architecture, commands, and security model.
11. CLAUDE.md accurately reflects the current development workflow.
12. STATE.md reflects all completed phases and current verification results.
13. All Mermaid diagrams in README.md render correctly and reflect spec-13 changes.
14. .gitignore includes venv/, build/, dist/, .coverage, .pytest_cache/, .mypy_cache/,
    .ruff_cache/, __pycache__/, *.egg-info/.

---

## 5. Phases

This spec contains 25 phases organized into 5 tiers. Phases within a tier may be executed
in parallel. Tiers must be executed in order. Each phase includes a Claude Code prompt
ready for direct execution.

### Tier 1: Critical Security Fixes (Phases 1-8)

These phases address all P1 findings. They must be completed before any other work because
they affect the security boundary of the system.

---

#### Phase 1: Make Prompt Injection Guard Blocking — COMPLETE

- [x] `_check_injection` raises `PromptInjectionError` instead of `warnings.warn`
- [x] Error includes matched pattern and approximate line number
- [x] `PromptInjectionError` added to `errors.py` (inherits `CodeliciousError`)
- [x] 10 new tests in `tests/test_planner.py` (all 6 patterns, clean spec, line number, case-insensitive, code block limitation)
- [x] 763 tests pass (no regressions)

Finding: planner.py _check_injection emits warnings.warn but does not raise. The injection
guard has no blocking effect. A spec containing adversarial instructions proceeds to full
LLM planning without interruption.

Files to modify:
- src/codelicious/planner.py (change _check_injection to raise)
- src/codelicious/errors.py (add PromptInjectionError if not present)
- tests/test_planner.py (new file)

Intent: As a developer running codelicious on a repository, when my spec file contains known
prompt injection patterns like "IGNORE PREVIOUS INSTRUCTIONS" or "SYSTEM:" or "You are now",
the planner must reject the spec with a clear error before any LLM call is made. The build
must not proceed. When a spec contains normal technical content describing authentication
flows or system architecture, the planner must accept it without false positives.

Acceptance criteria:
- _check_injection raises PromptInjectionError when a pattern matches.
- create_plan catches PromptInjectionError and propagates it to the caller.
- Test: spec with "IGNORE PREVIOUS INSTRUCTIONS" raises PromptInjectionError.
- Test: spec with "SYSTEM: you are a helpful assistant" raises PromptInjectionError.
- Test: spec with normal technical content does not raise.
- Test: spec with injection pattern inside a fenced code block is documented as a known
  limitation with a comment if the current regex matches raw text.
- All existing 274 tests pass.

Claude Code prompt:

```
Read src/codelicious/planner.py and src/codelicious/errors.py completely. Find the
_check_injection method. Currently it calls warnings.warn when an injection pattern is
detected but does not raise an exception, so the build continues with the injected spec.

Fix: Change _check_injection to raise PromptInjectionError (add this to errors.py if it
does not exist, inheriting from CodeliciousError or the existing base exception). The error
message must include which pattern matched and the approximate location in the spec where
it was found.

Create tests/test_planner.py with these tests:
- test_injection_ignore_previous_instructions: spec containing "IGNORE PREVIOUS
  INSTRUCTIONS" must raise PromptInjectionError.
- test_injection_system_prompt: spec containing "SYSTEM:" at line start must raise
  PromptInjectionError.
- test_injection_you_are_now: spec containing "You are now" must raise.
- test_clean_spec_no_injection: normal spec text about authentication and system design
  must not raise.
- test_injection_pattern_in_code_block: injection pattern inside a fenced code block --
  document behavior as a comment in the test.

Mock all LLM calls. Tests must not make network requests. Run pytest tests/test_planner.py
to verify. Then run the full test suite with pytest to verify no regressions. All 274+
existing tests must still pass.
```

---

#### Phase 2: Close Denylist Gaps for Interpreter Binaries

Finding: command_runner.py DENIED_COMMANDS does not include python3, python, bash, sh,
perl, ruby, node, env, xargs, or find. The LLM can use these as alternative execution
vehicles to bypass the command denylist entirely. For example: "python3 -c 'import os;
os.system(\"rm -rf /\")'" or "bash -c 'rm -rf /'" or "env rm -rf /".

Files to modify:
- src/codelicious/tools/command_runner.py (expand DENIED_COMMANDS)
- src/codelicious/security_constants.py (if interpreter list is maintained there)
- tests/test_command_runner.py (new file)

Intent: As a developer, when the LLM agent attempts to execute a command that starts with
an interpreter binary (python, python3, bash, sh, zsh, perl, ruby, node, env, xargs, find,
exec, nohup, strace, ltrace, gdb), the command runner must reject it with a clear error
message naming the denied command. The LLM must not be able to use interpreters as shells
to run arbitrary code. Legitimate build commands like "git status", "pytest tests/", and
"ruff check src/" must continue to work.

Acceptance criteria:
- DENIED_COMMANDS includes: python, python3, bash, sh, zsh, csh, ksh, fish, dash, perl,
  ruby, node, env, xargs, find, exec, nohup, strace, ltrace, gdb, script, expect.
- Test: "python3 -c 'import os'" is rejected.
- Test: "env rm -rf /" is rejected.
- Test: "bash -c 'echo hello'" is rejected.
- Test: "node -e 'process.exit(1)'" is rejected.
- Test: "xargs rm" is rejected.
- Test: "git status" is still allowed.
- Test: "pytest tests/" is still allowed.
- Test: "ruff check src/" is still allowed.
- All existing tests pass.

Claude Code prompt:

```
Read src/codelicious/tools/command_runner.py completely. Read
src/codelicious/security_constants.py completely. Find DENIED_COMMANDS (likely a frozenset).

The current denylist blocks destructive commands (rm, sudo, dd, kill, etc.) but does NOT
block interpreter binaries. The LLM can run "python3 -c 'import os; os.system(\"rm -rf
/\")'" or "bash -c 'rm -rf /'" to bypass the denylist.

Fix: Add ALL of these to DENIED_COMMANDS: python, python3, bash, sh, zsh, csh, ksh, fish,
dash, perl, ruby, node, env, xargs, find, exec, nohup, strace, ltrace, gdb, script, expect.
If the denylist is split between command_runner.py and security_constants.py, add the
interpreter entries to the same location as the existing entries.

Create tests/test_command_runner.py with these tests:
- test_interpreter_python3_rejected
- test_interpreter_bash_rejected
- test_interpreter_env_rejected
- test_interpreter_node_rejected
- test_interpreter_xargs_rejected
- test_interpreter_perl_rejected
- test_allowed_git_status
- test_allowed_pytest
- test_allowed_ruff
- test_denied_rm
- test_denied_sudo
- test_metacharacter_pipe_rejected
- test_metacharacter_semicolon_rejected

Use unittest.mock.patch for subprocess calls. No actual commands should execute. Run pytest
tests/test_command_runner.py then run the full test suite to verify no regressions.
```

---

#### Phase 3: Fix TOCTOU Race Condition in fs_tools.py

Finding: fs_tools.py native_write_file validates the path, then writes to it in a separate
step. Between validation and write, the target path could be replaced with a symlink
pointing outside the sandbox. The mkstemp call uses an unverified parent directory.

Files to modify:
- src/codelicious/tools/fs_tools.py (atomic write with post-write verification)
- tests/test_fs_tools.py (new file)

Intent: As a developer, when the LLM agent writes a file through fs_tools, the write
operation must be atomic and the final file location must be verified after the write
completes. If the resolved path after writing differs from the resolved path before writing
(indicating a symlink swap attack), the operation must fail and the written file must be
removed. The temp file must be created inside the sandbox root, not in the system temp
directory.

Acceptance criteria:
- native_write_file creates the temp file inside self.repo_path (not system temp).
- After os.replace, the final path is re-resolved and checked against the sandbox boundary.
- If post-write verification fails, the file is removed and an error is raised.
- Test: write to a normal path inside sandbox succeeds.
- Test: write to a path that resolves outside sandbox raises SandboxViolationError or
  equivalent.
- Test: write to a symlink pointing outside sandbox is caught.
- Test: write to a protected path (e.g., .claude/settings.json) raises ProtectedPathError
  or equivalent.
- All existing tests pass.

Claude Code prompt:

```
Read src/codelicious/tools/fs_tools.py completely. Read src/codelicious/sandbox.py to
understand the Sandbox class's write path and how it handles TOCTOU.

The current native_write_file in fs_tools.py has a TOCTOU vulnerability: it validates the
target path, then calls tempfile.mkstemp() in an uncontrolled directory, writes content,
and calls os.replace(). Between validation and replace, the target could be swapped with a
symlink.

Fix:
1. Create the temp file inside self.repo_path using tempfile.mkstemp(dir=str(self.repo_path)).
2. After os.replace(temp_path, target), re-resolve the final path:
   final_resolved = target.resolve()
   If final_resolved is not relative to self.repo_path, remove the file and raise an error.
3. Wrap the entire write in a try/except that cleans up the temp file on any failure.

Create tests/test_fs_tools.py:
- test_write_file_normal_path_succeeds
- test_write_file_outside_sandbox_raises
- test_write_file_protected_path_raises
- test_read_file_normal_path_succeeds
- test_read_file_outside_sandbox_raises
- test_list_directory_normal_succeeds
- test_list_directory_outside_sandbox_raises
- test_write_file_empty_content_succeeds
- test_write_file_creates_parent_directories

Use tmp_path pytest fixture for all filesystem operations. No real sandbox needed. Run
pytest tests/test_fs_tools.py then full suite.
```

---

#### Phase 4: Fix Command Split/Shlex Mismatch

Finding: command_runner.py validates the command by splitting on whitespace (str.split()),
but executes using shlex.split(). These produce different results for quoted arguments.
A command like 'echo "rm -rf /"' splits differently: str.split gives ["echo", "\"rm",
"-rf", "/\""] while shlex.split gives ["echo", "rm -rf /"]. The denylist check sees
different tokens than the executor.

Files to modify:
- src/codelicious/tools/command_runner.py (use shlex.split for both validation and execution)
- tests/test_command_runner.py (add split-mismatch tests)

Intent: As a developer, the command runner must use the same tokenization for validation
and execution. When I pass a command string, the tokens checked against the denylist must
be exactly the tokens that subprocess.run receives. There must be no way to disguise a
denied command inside quoted arguments that bypass the denylist check but are expanded
during execution.

Acceptance criteria:
- Both validation and execution use shlex.split() for tokenization.
- If shlex.split raises ValueError (malformed quoting), the command is rejected.
- Test: 'echo "rm -rf /"' -- "rm" inside quotes is not a command, allowed.
- Test: 'rm -rf /' -- "rm" as first token is denied.
- Test: malformed quoting like 'echo "unclosed raises ValueError and is rejected.
- Test: empty string command is rejected.
- All existing tests pass.

Claude Code prompt:

```
Read src/codelicious/tools/command_runner.py completely. Find where the command string is
tokenized for denylist validation and where it is tokenized for execution.

The bug: validation uses cmd.split() (whitespace split) but execution uses
shlex.split(cmd). These produce different token lists for quoted strings. An attacker
could craft a command where the denylist sees safe tokens but shlex.split produces
dangerous ones, or vice versa.

Fix: Use shlex.split(cmd) for BOTH validation and execution. Catch ValueError from
shlex.split (raised on malformed quoting like unclosed quotes) and reject the command
with a clear error message.

Add these tests to tests/test_command_runner.py:
- test_split_mismatch_quoted_rm_allowed: 'echo "rm -rf /"' should be allowed because
  "rm" is inside quotes and not the command name.
- test_split_mismatch_unquoted_rm_denied: 'rm -rf /' should be denied.
- test_malformed_quoting_rejected: 'echo "unclosed' should raise an error.
- test_empty_command_rejected: empty string should raise an error.

Run pytest tests/test_command_runner.py then full suite.
```

---

#### Phase 5: Sanitize API Error Bodies in LLM Client

Finding: llm_client.py logs error responses from the LLM provider at INFO level. These
error bodies may contain reflected API keys, authentication tokens, or other sensitive
data. The SanitizingFilter may not be attached to the logger if setup_logging() has not
been called before LLMClient is instantiated.

Files to modify:
- src/codelicious/llm_client.py (sanitize error bodies before logging)
- src/codelicious/logger.py (ensure SanitizingFilter is on root codelicious logger)
- tests/test_llm_client.py (new file)

Intent: As a developer, when an LLM API call fails and the provider returns an error body,
the error body must be sanitized (API keys, tokens, and URLs with credentials redacted)
before it appears in any log output or exception message. Even if setup_logging() has not
been called, the redaction must still apply. Sensitive values must never appear in log
files, console output, or exception tracebacks.

Acceptance criteria:
- Error bodies are passed through the sanitization regex before logging.
- Exception messages from LLM failures are truncated to 500 characters.
- The SanitizingFilter is added to the root "codelicious" logger, not just handlers.
- Test: error body containing "hf_abc123secret" is redacted to "[REDACTED]".
- Test: error body containing "sk-abc123secret" is redacted.
- Test: error body longer than 500 chars is truncated in exception message.
- Test: normal successful response does not trigger sanitization overhead.
- All existing tests pass.

Claude Code prompt:

```
Read src/codelicious/llm_client.py completely. Read src/codelicious/logger.py completely.

Two problems:
1. llm_client.py logs error response bodies without sanitization. If the provider reflects
   the API key in the error, it appears in logs.
2. logger.py attaches SanitizingFilter to handlers, but if LLMClient is instantiated
   before setup_logging() (as in loop_controller.py), the filter is never attached.

Fix 1: In llm_client.py, before logging any error body, pass it through a sanitize
function. Import the _SECRET_REGEXES from logger.py (or create a standalone sanitize_text
function in logger.py that applies the regexes). Truncate error bodies to 500 chars in
exception messages.

Fix 2: In logger.py setup_logging(), also add the SanitizingFilter to the root
"codelicious" logger object (not just the handlers), so all child loggers inherit it
regardless of instantiation order.

Fix 3: Convert all f-string logger calls in llm_client.py to percent-style formatting
so the SanitizingFilter can intercept record.args.

Create tests/test_llm_client.py:
- test_error_body_with_hf_token_redacted
- test_error_body_with_sk_token_redacted
- test_error_body_truncated_in_exception
- test_successful_response_no_sanitization_overhead
- test_timeout_error_handling
- test_connection_error_handling

Mock urllib.request.urlopen for all tests. No network access. Run pytest
tests/test_llm_client.py then full suite.
```

---

#### Phase 6: Fix Verifier Multiline String Tracking Bypass

Finding: verifier.py check_security skips entire lines when inside a multiline string,
but the opening and closing delimiter lines may contain executable code outside the string.
For example, 'result = os.system("""' has the dangerous os.system call on the same line
as the opening triple-quote. The current logic skips this line entirely. Similarly,
'"""); os.system("rm -rf /")' has executable code after the closing delimiter that is
also skipped.

Files to modify:
- src/codelicious/verifier.py (process portions of lines outside string delimiters)
- tests/test_verifier.py (add multiline string bypass tests)

Intent: As a developer, the security scanner must detect dangerous patterns (eval, exec,
os.system, subprocess with shell=True) even when they appear on the same line as a triple-
quote delimiter. The scanner must not skip security-critical code just because it shares a
line with a string boundary. Normal docstrings and multiline strings containing words like
"eval" or "system" in documentation text should not trigger false positives when they are
entirely within the string.

Acceptance criteria:
- Code on the same line as an opening triple-quote is scanned for dangerous patterns.
- Code on the same line after a closing triple-quote is scanned for dangerous patterns.
- Content fully inside multiline strings is still skipped (no false positives on docstrings).
- Test: 'os.system("""' on a single line is flagged.
- Test: '"""); os.system("rm")' on a single line is flagged.
- Test: a normal docstring containing the word "system" is not flagged.
- All existing 57 verifier tests pass.

Claude Code prompt:

```
Read src/codelicious/verifier.py completely. Find the check_security function's multiline
string tracking logic (look for in_multiline_string or triple-quote counting logic, likely
around lines 700-730).

The bug: when a line contains a triple-quote delimiter, the entire line is skipped from
security scanning. But the portion of the line outside the string may contain dangerous
code like os.system() or eval().

Fix: Instead of skipping the entire line with "continue" when a delimiter is found, extract
the portions of the line that are outside the multiline string and scan those portions.
Specifically:
1. If a line opens a multiline string (odd count of triple-quotes), scan the text BEFORE
   the first triple-quote.
2. If a line closes a multiline string, scan the text AFTER the last triple-quote.
3. If a line both opens and closes (even count), scan the text before the first and after
   the last triple-quote.

Add these tests to the existing tests/test_verifier.py:
- test_security_os_system_on_triple_quote_line_flagged
- test_security_code_after_closing_triple_quote_flagged
- test_security_normal_docstring_not_flagged
- test_security_docstring_containing_eval_word_not_flagged

Run pytest tests/test_verifier.py then full suite.
```

---

#### Phase 7: Fix Silent Exception Swallowing in CLI

Finding: cli.py catches exceptions from the PR transition step and silently ignores them.
The user sees a "build complete" message but the PR was never created or transitioned.
This masks real failures in git operations.

Files to modify:
- src/codelicious/cli.py (log PR transition errors, re-raise or set exit code)
- tests/test_cli.py (new file)

Intent: As a developer, when the build completes but the PR creation or transition fails,
I must see a clear error message explaining what went wrong. The CLI exit code must
indicate partial failure (e.g., exit code 2 for "build succeeded but PR failed"). The
build result itself should not be masked by the PR failure.

Acceptance criteria:
- PR transition errors are logged at ERROR level with the full exception message.
- The CLI exits with code 2 (not 0) when build succeeds but PR fails.
- The build result (files created, tests passed) is still reported to the user.
- Test: successful build with successful PR returns exit code 0.
- Test: successful build with PR failure returns exit code 2 and logs the error.
- Test: failed build returns exit code 1 regardless of PR status.
- All existing tests pass.

Claude Code prompt:

```
Read src/codelicious/cli.py completely. Find the try/except block around PR transition
(likely around lines 127-130 based on STATE.md).

The bug: the except clause catches the PR error and does nothing with it. The user sees
"build complete" but the PR was never created.

Fix:
1. In the except block, log the error at ERROR level: logger.error("PR transition
   failed: %s", exc)
2. Set a flag like pr_failed = True.
3. At the end of main(), if pr_failed is True, return exit code 2 instead of 0.
4. Still print the build result summary before the error message so the user knows
   what succeeded.

Create tests/test_cli.py:
- test_cli_build_success_pr_success_exit_0
- test_cli_build_success_pr_failure_exit_2
- test_cli_build_failure_exit_1
- test_cli_engine_selection_claude (mock shutil.which to return a path)
- test_cli_engine_selection_huggingface (mock shutil.which to return None, set HF_TOKEN)
- test_cli_engine_selection_no_engine (mock both unavailable)

Mock all engine build calls and git operations. No actual builds or git commands. Run
pytest tests/test_cli.py then full suite.
```

---

#### Phase 8: Add JSON Deserialization Validation

Finding: loop_controller.py and huggingface_engine.py deserialize JSON from LLM responses
without size limits or schema validation. A malicious or buggy LLM response could send
an extremely large JSON payload causing out-of-memory, or a payload with unexpected
structure causing crashes deep in the tool dispatch logic.

Files to modify:
- src/codelicious/loop_controller.py (add size cap and schema validation)
- src/codelicious/engines/huggingface_engine.py (same fixes)
- tests/test_loop_controller.py (new file)

Intent: As a developer, when the HuggingFace engine receives a JSON response from the LLM
provider, the response body must be size-capped before parsing (10MB maximum). After
parsing, the response structure must be validated to contain the expected fields (choices,
message, tool_calls) before being processed. Malformed or oversized responses must produce
a clear error and not crash the build loop.

Acceptance criteria:
- Response bodies larger than 10MB are rejected before JSON parsing.
- Parsed JSON is validated for expected structure (choices array with message objects).
- Missing or malformed fields produce a descriptive error, not a KeyError or TypeError.
- Test: response body of 11MB is rejected with a size error.
- Test: valid JSON with correct structure is accepted.
- Test: JSON missing "choices" key raises a descriptive error.
- Test: JSON with "choices" but no "message" raises a descriptive error.
- Test: empty response body raises a descriptive error.
- All existing tests pass.

Claude Code prompt:

```
Read src/codelicious/loop_controller.py completely. Read
src/codelicious/engines/huggingface_engine.py completely. Find where JSON responses from
the LLM are deserialized (json.loads calls).

Two problems:
1. No size limit on the response body before json.loads. A 1GB response would be loaded
   into memory.
2. No structure validation after parsing. The code assumes response["choices"][0]
   ["message"] exists and crashes with KeyError if it does not.

Fix in both files:
1. Before json.loads, check len(response_body) <= 10_000_000. If exceeded, raise
   ResponseTooLargeError (add to errors.py if needed).
2. After json.loads, validate the structure:
   - response must be a dict
   - response must have "choices" key with a non-empty list
   - choices[0] must have "message" key with a dict value
   If validation fails, raise LLMResponseError with a descriptive message including
   what was expected and what was received (type and keys present).

Create tests/test_loop_controller.py:
- test_oversized_response_rejected
- test_valid_response_accepted
- test_missing_choices_key_raises
- test_empty_choices_raises
- test_missing_message_key_raises
- test_non_dict_response_raises
- test_empty_body_raises

Mock all HTTP calls. Run pytest tests/test_loop_controller.py then full suite.
```

---

### Tier 2: Reliability and Correctness Fixes (Phases 9-15)

These phases address P2 findings and reliability concerns. They depend on Tier 1 being
complete because some fixes build on the security primitives established in Tier 1.

---

#### Phase 9: Unify Metacharacter Constants

Finding: command_runner.py and verifier.py maintain separate metacharacter blocklists that
are inconsistent. command_runner uses BLOCKED_METACHARACTERS (includes "!") while verifier
uses _SHELL_METACHARACTERS (missing "!"). This inconsistency is a maintenance hazard and
could lead to bypass if one list is updated without the other.

Files to modify:
- src/codelicious/security_constants.py (create unified SHELL_METACHARACTERS constant)
- src/codelicious/tools/command_runner.py (import from security_constants)
- src/codelicious/verifier.py (import from security_constants)
- tests/test_security_constants.py (new file)

Intent: As a developer maintaining the security layer, I want a single source of truth for
shell metacharacter definitions. When I add a new metacharacter to block, I should only
need to update one location. Both the command runner and the verifier must use the same
set of blocked characters.

Acceptance criteria:
- SHELL_METACHARACTERS is defined once in security_constants.py as a frozenset.
- command_runner.py and verifier.py both import from security_constants.py.
- The unified set includes all characters from both current sets ("|", "&", ";", "$", "`",
  "(", ")", "{", "}", "!", newline).
- Test: security_constants.SHELL_METACHARACTERS contains all expected characters.
- Test: the set is a frozenset (immutable).
- All existing tests pass.

Claude Code prompt:

```
Read src/codelicious/security_constants.py, src/codelicious/tools/command_runner.py, and
src/codelicious/verifier.py. Find all metacharacter/shell-character constant definitions.

The inconsistency: command_runner.py has BLOCKED_METACHARACTERS with "!" included.
verifier.py has _SHELL_METACHARACTERS without "!". They should be identical.

Fix:
1. In security_constants.py, define SHELL_METACHARACTERS as a frozenset containing the
   union of both current sets: |, &, ;, $, `, (, ), {, }, !, \n, \r.
2. In command_runner.py, replace the local constant with:
   from codelicious.security_constants import SHELL_METACHARACTERS
3. In verifier.py, replace the local constant with the same import.
4. Remove the old local definitions.

Create tests/test_security_constants.py:
- test_shell_metacharacters_contains_pipe
- test_shell_metacharacters_contains_bang
- test_shell_metacharacters_contains_newline
- test_shell_metacharacters_is_frozenset
- test_denied_commands_is_frozenset
- test_denied_commands_contains_rm

Run pytest tests/test_security_constants.py then full suite.
```

---

#### Phase 10: Fix Deprecated shutil.rmtree onerror API

Finding: build_logger.py cleanup_old_builds uses the onerror parameter of shutil.rmtree,
which was deprecated in Python 3.12 in favor of onexc. On Python 3.12+ this may emit
DeprecationWarning. On future Python versions it may be removed entirely.

Files to modify:
- src/codelicious/build_logger.py (use onexc on Python 3.12+, onerror on older)
- tests/test_build_logger.py (add cleanup test)

Intent: As a developer running codelicious on Python 3.12 or newer, the cleanup_old_builds
function must not emit deprecation warnings. On older Python versions it must still work.
The error handling behavior (log a warning and continue) must be preserved regardless of
which parameter is used.

Acceptance criteria:
- On Python 3.12+, shutil.rmtree uses onexc parameter.
- On Python 3.10-3.11, shutil.rmtree uses onerror parameter.
- Failed removal of individual files is logged at WARNING level, not raised.
- Test: cleanup with a permission-denied file logs a warning but does not raise.
- Test: cleanup with normal directory succeeds silently.
- All existing tests pass.

Claude Code prompt:

```
Read src/codelicious/build_logger.py completely. Find cleanup_old_builds and the
shutil.rmtree call with onerror.

The onerror parameter was deprecated in Python 3.12 in favor of onexc. The signature
difference: onerror receives (func, path, exc_info) while onexc receives (func, path, exc).

Fix: Use sys.version_info to select the correct parameter:
    import sys

    def _rmtree_error_handler(func, path, exc_info_or_exc):
        if isinstance(exc_info_or_exc, tuple):
            exc = exc_info_or_exc[1]
        else:
            exc = exc_info_or_exc
        logger.warning("Failed to remove %s: %s", path, exc)

    if sys.version_info >= (3, 12):
        shutil.rmtree(session_dir, onexc=_rmtree_error_handler)
    else:
        shutil.rmtree(session_dir, onerror=_rmtree_error_handler)

Add tests to tests/test_build_logger.py:
- test_cleanup_old_builds_normal_directory
- test_cleanup_old_builds_permission_denied_logs_warning (mock rmtree to call the handler)
- test_cleanup_old_builds_nonexistent_directory

Run pytest tests/test_build_logger.py then full suite.
```

---

#### Phase 11: Enforce Denied-Path Filter on Sandbox Read Path

Finding: sandbox.py read_file only checks path traversal (resolve_path) but does not call
_check_denied. The LLM can read .env, .git/config, or .codelicious/config.json through
the sandbox read path. Similarly, fs_tools.py native_read_file has no extension or denied-
path filtering. The LLM agent can freely read sensitive files.

Files to modify:
- src/codelicious/sandbox.py (add _check_denied to read_file)
- src/codelicious/tools/fs_tools.py (add denied-path check to native_read_file)
- tests/test_sandbox.py (add read-path denied tests)
- tests/test_fs_tools.py (add read-path denied tests)

Intent: As a developer, the LLM agent must not be able to read .env files, .git/config,
.codelicious/config.json, or any file matching the denied patterns through either the
Sandbox or FSTooling read paths. The same restrictions that apply to writes should apply
to reads for sensitive file patterns. Normal source files (.py, .md, .json in non-sensitive
locations) must remain readable.

Acceptance criteria:
- sandbox.py read_file calls _check_denied(resolved) after resolve_path.
- fs_tools.py native_read_file checks against DENIED_PATTERNS or similar.
- Test: reading ".env" through sandbox raises.
- Test: reading ".git/config" through sandbox raises.
- Test: reading "src/main.py" through sandbox succeeds.
- Test: reading ".env" through FSTooling raises.
- Test: reading "README.md" through FSTooling succeeds.
- All existing tests pass.

Claude Code prompt:

```
Read src/codelicious/sandbox.py completely. Find read_file and _check_denied. Note that
read_file calls resolve_path but not _check_denied.

Read src/codelicious/tools/fs_tools.py completely. Find native_read_file. Note it has
_assert_in_sandbox but no denied-pattern check.

Fix 1: In sandbox.py read_file, after the resolve_path call, add:
    self._check_denied(resolved)

Fix 2: In fs_tools.py, add a denied-path check to native_read_file. Either:
  a) Import and call the sandbox's denied check, or
  b) Create a DENIED_READ_PATTERNS set in fs_tools.py (matching .env, .git/, etc.)
     and check the relative path against it before reading.

Add to tests/test_sandbox.py:
- test_read_file_env_denied
- test_read_file_git_config_denied
- test_read_file_codelicious_config_denied
- test_read_file_normal_source_allowed

Add to tests/test_fs_tools.py:
- test_read_file_env_denied
- test_read_file_normal_source_allowed

Run the relevant test files then full suite.
```

---

#### Phase 12: Fix Git Staging to Use Explicit File Lists

Finding: git_orchestrator.py uses "git add ." which stages everything in the working tree,
including .env files, large binaries, and any sensitive files that the .gitignore may not
cover. This is dangerous because the LLM could create an .env file that "git add ." would
stage and the subsequent commit would push to the remote.

Files to modify:
- src/codelicious/git/git_orchestrator.py (replace "git add ." with explicit file list)
- tests/test_git_orchestrator.py (new file)

Intent: As a developer, when codelicious commits changes, only files that were explicitly
created or modified by the build agent should be staged. The git add command must use an
explicit list of file paths, not "git add .". Sensitive patterns (.env, .env.*, *.pem,
*.key, id_rsa, credentials.json) must be excluded from staging even if explicitly listed.
The commit must only contain files the agent intentionally produced.

Acceptance criteria:
- git_orchestrator.py stages files by explicit path, not "git add .".
- A SENSITIVE_PATTERNS set filters out dangerous files before staging.
- Test: staging a list of .py files succeeds.
- Test: staging a list that includes ".env" filters it out with a warning.
- Test: staging a list that includes "credentials.json" filters it out.
- Test: empty file list after filtering produces a warning, no commit.
- All existing tests pass.

Claude Code prompt:

```
Read src/codelicious/git/git_orchestrator.py completely. Find the "git add ." call.

The fix requires two changes:
1. Replace "git add ." with explicit file staging. The method should accept a list of
   file paths to stage, or use "git diff --name-only" to get the list of changed files.
2. Before staging, filter the file list against SENSITIVE_PATTERNS:
   SENSITIVE_PATTERNS = frozenset({
       ".env", ".env.local", ".env.production", ".env.staging",
       "credentials.json", "secrets.json", "*.pem", "*.key",
       "id_rsa", "id_ed25519", ".codelicious/config.json",
   })

Implementation approach:
  a) Use subprocess to run "git diff --name-only --diff-filter=ACMR" to get modified files.
  b) Filter the list against SENSITIVE_PATTERNS (use fnmatch for glob patterns).
  c) Run "git add" with the filtered file list.
  d) If the filtered list is empty, log a warning and skip the commit.

Also sanitize the stderr output in _run_cmd to truncate to 500 chars before including
in exception messages (P2-8 fix from STATE.md).

Create tests/test_git_orchestrator.py:
- test_stage_files_normal_list
- test_stage_files_filters_env
- test_stage_files_filters_credentials
- test_stage_files_empty_after_filter_warns
- test_run_cmd_stderr_truncated
- test_commit_with_valid_message
- test_branch_creation

Mock all subprocess.run calls. No actual git operations. Run pytest
tests/test_git_orchestrator.py then full suite.
```

---

#### Phase 13: Add Process Group Timeout and Cleanup

Finding: command_runner.py spawns child processes with subprocess.run and a timeout, but
does not use process groups. When the timeout fires, only the direct child is killed. If
the child spawned grandchildren (e.g., pytest spawning test subprocesses), those
grandchildren become orphans and continue running indefinitely.

Files to modify:
- src/codelicious/tools/command_runner.py (use start_new_session=True, kill process group)
- tests/test_command_runner.py (add timeout cleanup test)

Intent: As a developer, when a command times out during execution, all processes spawned
by that command (including grandchildren) must be terminated. No orphan processes should
remain after a timeout. The timeout should be configurable via the command_runner
constructor rather than hardcoded.

Acceptance criteria:
- subprocess.run is called with start_new_session=True (Unix) to create a process group.
- On timeout, os.killpg is used to kill the entire process group.
- The timeout value is a constructor parameter with a default of 120 seconds.
- Test: timeout fires and process group is killed (mock os.killpg).
- Test: normal completion does not trigger process group kill.
- Test: custom timeout value is respected.
- All existing tests pass.

Claude Code prompt:

```
Read src/codelicious/tools/command_runner.py completely. Find the subprocess.run call and
the timeout handling.

Fix:
1. Add start_new_session=True to the subprocess.run call (creates a new process group on
   Unix).
2. Wrap the subprocess.run in a try/except subprocess.TimeoutExpired.
3. In the except block, use os.killpg(proc.pid, signal.SIGTERM) to kill the entire
   process group, then wait briefly, then os.killpg(proc.pid, signal.SIGKILL) if still
   running.
4. Make the timeout a constructor parameter: def __init__(self, ..., timeout: int = 120).
5. Use self.timeout in the subprocess.run call.

Note: subprocess.run does not return the Popen object needed for os.killpg. Switch to
subprocess.Popen for the execution path that needs timeout + process group kill. Keep
the simple subprocess.run for commands that do not need this.

Alternative simpler approach: use subprocess.run with timeout, and in the
TimeoutExpired handler, use the process object from the exception
(exc.cmd, exc.timeout are available but not the PID). If this approach is insufficient,
switch to Popen.

Add to tests/test_command_runner.py:
- test_timeout_kills_process_group (mock Popen and os.killpg)
- test_normal_completion_no_kill
- test_custom_timeout_respected

Run pytest tests/test_command_runner.py then full suite.
```

---

#### Phase 14: Fix Incomplete Secret Redaction

Finding: logger.py has 23 regex patterns for secret redaction but is missing patterns for
SSH keys (ssh-rsa, ssh-ed25519), webhook URLs (hooks.slack.com, hooks.discord.com),
HuggingFace tokens (hf_...), and base64-encoded bearer tokens. The verifier's
_SECRET_PATTERNS also lacks HuggingFace token detection.

Files to modify:
- src/codelicious/logger.py (add missing redaction patterns)
- src/codelicious/verifier.py (add hf_ token pattern to _SECRET_PATTERNS)
- tests/test_logger.py (new file)

Intent: As a developer, all known secret formats must be redacted from log output. When the
LLM generates code containing a HuggingFace token like "hf_abcdefghij1234567890", it must
appear as "[REDACTED]" in all logs. SSH private key markers, webhook URLs with tokens, and
common cloud provider key formats must all be caught. False positives on normal strings
(like "hf_" in a variable name discussion) are acceptable as the cost of security.

Acceptance criteria:
- logger.py redacts: hf_[20+ chars], ssh-rsa [base64], ssh-ed25519 [base64],
  hooks.slack.com/[path], hooks.discord.com/[path].
- verifier.py _SECRET_PATTERNS includes hf_ token detection.
- Test: "hf_abcdefghij1234567890abcdef" is redacted.
- Test: "ssh-rsa AAAAB3NzaC1yc2EAAAA..." is redacted.
- Test: "hooks.slack.com/services/T00/B00/xxx" is redacted.
- Test: normal log message "file_handle" is not redacted (no false positive on "hf" alone).
- All existing tests pass.

Claude Code prompt:

```
Read src/codelicious/logger.py completely. Find the _SECRET_REGEXES list (or similar).
Read src/codelicious/verifier.py and find _SECRET_PATTERNS.

Add these patterns to logger.py:
1. HuggingFace tokens: r"hf_[A-Za-z0-9]{20,}"
2. SSH RSA keys: r"ssh-rsa\s+[A-Za-z0-9+/=]{40,}"
3. SSH ED25519 keys: r"ssh-ed25519\s+[A-Za-z0-9+/=]{40,}"
4. Slack webhooks: r"hooks\.slack\.com/services/[A-Za-z0-9/]+"
5. Discord webhooks: r"hooks\.discord\.com/api/webhooks/[0-9]+/[A-Za-z0-9_-]+"

Add to verifier.py _SECRET_PATTERNS:
1. r"""['"]hf_[A-Za-z0-9]{20,}['"]"""

Create tests/test_logger.py:
- test_redact_hf_token
- test_redact_ssh_rsa_key
- test_redact_ssh_ed25519_key
- test_redact_slack_webhook
- test_redact_discord_webhook
- test_no_false_positive_on_normal_text
- test_redact_aws_key
- test_redact_github_token
- test_sanitizing_filter_attached_to_root_logger

Run pytest tests/test_logger.py then full suite.
```

---

#### Phase 15: Bound Conversation History in HuggingFace Engine

Finding: huggingface_engine.py and loop_controller.py append every tool result to the
messages list without any eviction. Over 50 iterations with file reads, the list can grow
to hundreds of MB. Every LLM call serializes the entire history to JSON. There is no
sliding window or context trimming.

Files to modify:
- src/codelicious/engines/huggingface_engine.py (add history bounding)
- src/codelicious/loop_controller.py (same fix)
- tests/test_huggingface_engine.py (new file)

Intent: As a developer, the HuggingFace engine must limit the conversation history to a
configurable maximum size (default 100,000 characters of serialized content). When the
history exceeds this limit, the oldest tool results (not the system prompt or the most
recent 5 messages) are evicted. The system prompt is always preserved. The LLM always
sees the most recent context. Memory usage must remain bounded regardless of iteration
count.

Acceptance criteria:
- A MAX_HISTORY_CHARS constant (default 100,000) caps serialized history size.
- When exceeded, messages between index 1 (after system prompt) and len-5 are evicted
  oldest-first until under the cap.
- The system prompt (index 0) is never evicted.
- The most recent 5 messages are never evicted.
- Test: history of 200,000 chars is trimmed to under 100,000.
- Test: system prompt survives trimming.
- Test: most recent 5 messages survive trimming.
- Test: history under the cap is not modified.
- All existing tests pass.

Claude Code prompt:

```
Read src/codelicious/engines/huggingface_engine.py completely. Read
src/codelicious/loop_controller.py completely. Find where messages are appended to the
history list.

Add a _trim_history method to both classes (or extract a shared function):

    MAX_HISTORY_CHARS = 100_000

    def _trim_history(self, messages: list[dict]) -> list[dict]:
        total = sum(len(json.dumps(m)) for m in messages)
        if total <= self.MAX_HISTORY_CHARS:
            return messages
        # Preserve system prompt (index 0) and last 5 messages
        protected_head = messages[:1]
        protected_tail = messages[-5:]
        middle = messages[1:-5]
        # Evict oldest middle messages until under budget
        while middle and total > self.MAX_HISTORY_CHARS:
            evicted = middle.pop(0)
            total -= len(json.dumps(evicted))
        return protected_head + middle + protected_tail

Call _trim_history after each message append in the iteration loop.

Create tests/test_huggingface_engine.py:
- test_trim_history_over_limit
- test_trim_history_under_limit_unchanged
- test_trim_history_preserves_system_prompt
- test_trim_history_preserves_recent_messages
- test_iteration_loop_basic (mock LLM, verify tool dispatch works)
- test_max_iterations_respected

Mock all HTTP calls. Run pytest tests/test_huggingface_engine.py then full suite.
```

---

### Tier 3: Code Quality and Dead Code Removal (Phases 16-19)

These phases remove dead code, fix code quality issues, and improve maintainability.

---

#### Phase 16: Remove Dead Proxilion-Build Legacy Code

Finding: approximately 1,500 lines of legacy code from the original proxilion-build project
are never imported by any active code path. These modules are either fully superseded by
the dual-engine architecture or contain functions that are no longer called. Dead code
increases maintenance burden, confuses new contributors, and provides surface area for
false positive security findings.

Files to modify:
- src/codelicious/context_manager.py (remove or gut to stub if tests import it)
- src/codelicious/budget_guard.py (remove or gut)
- src/codelicious/executor.py (remove functions not imported by any active code path)
- src/codelicious/parser.py (remove functions not imported by any active code path)
- src/codelicious/planner.py (remove functions not imported by any active code path)
- src/codelicious/sandbox.py (audit for functions superseded by fs_tools.py)
- tests/ (remove or update tests that only test dead code)

Intent: As a developer reading this codebase, every module and function that exists must be
reachable from the CLI entry point through at least one engine code path. Dead code that
serves no purpose must be removed entirely, not commented out. If a module still has some
active functions alongside dead ones, only the dead functions are removed. Tests that only
exercise dead code are also removed. The goal is a leaner codebase where every line has a
reason to exist.

Acceptance criteria:
- Every remaining module is imported by at least one active code path (traceable from
  cli.py through either engine).
- No module contains functions that are never called.
- Removed code totals approximately 1,000-1,500 lines.
- All remaining tests pass (some test counts may decrease if dead-code tests are removed).
- No import errors when running python -c "import codelicious".

Claude Code prompt:

```
Trace the import graph starting from src/codelicious/cli.py. For each module in
src/codelicious/, determine if it is imported (directly or transitively) by cli.py or
by either engine (claude_engine.py, huggingface_engine.py).

Modules likely dead or partially dead:
- context_manager.py: check if anything imports it.
- budget_guard.py: check if anything imports it.
- executor.py: check if the engine code paths call any of its functions.
- parser.py: check which functions are actually called vs. which are legacy.
- planner.py: check which functions are actually called vs. legacy.
- sandbox.py: check if fs_tools.py has fully replaced it or if some functions are still
  used.
- loop_controller.py: check if huggingface_engine.py has superseded it.

For each dead module/function:
1. If the entire module is dead, delete the file.
2. If only some functions are dead, remove those functions.
3. If tests only test dead code, remove those test functions.
4. If tests test both live and dead code, remove only the dead-code test functions.

After removal, run: python -c "from codelicious import cli" to verify no import errors.
Run the full test suite. Report how many lines and modules were removed.
```

---

#### Phase 17: Convert F-String Logging to Percent-Style

Finding: multiple modules use f-strings in logger.* calls, which bypasses the
SanitizingFilter. The filter sanitizes record.msg and record.args, but f-strings bake
the value into record.msg before the filter runs. Any secret passed via f-string logging
will not be redacted.

Files to modify:
- src/codelicious/git/git_orchestrator.py
- src/codelicious/loop_controller.py (if not removed in Phase 16)
- src/codelicious/engines/huggingface_engine.py
- src/codelicious/llm_client.py
- src/codelicious/cli.py
- src/codelicious/tools/command_runner.py
- Any other file using f-string logger calls

Intent: As a developer, all log statements must use percent-style formatting
(logger.info("message %s", variable)) so that the SanitizingFilter can intercept and
redact secrets from the variable arguments before the final log message is composed.
F-string logging (logger.info(f"message {variable}")) must not be used anywhere in the
codebase.

Acceptance criteria:
- Zero f-string logger calls remain in src/codelicious/.
- All logger calls use percent-style: logger.info("msg %s", arg).
- A grep for 'logger\.\w+\(f"' across src/ returns zero matches.
- A grep for "logger\.\w+\(f'" across src/ returns zero matches.
- All existing tests pass.

Claude Code prompt:

```
Search all files in src/codelicious/ for f-string logger calls. Use these patterns:
  logger.debug(f"
  logger.info(f"
  logger.warning(f"
  logger.error(f"
  logger.critical(f"
Also check single-quote variants: logger.info(f'

For each match, convert to percent-style. Examples:
  BEFORE: logger.info(f"Current branch is {branch}")
  AFTER:  logger.info("Current branch is %s", branch)

  BEFORE: logger.error(f"Command {cmd} failed: {err}")
  AFTER:  logger.error("Command %s failed: %s", cmd, err)

  BEFORE: logger.info(f"LLM Planner: {self.planner_model} | Coder: {self.coder_model}")
  AFTER:  logger.info("LLM Planner: %s | Coder: %s", self.planner_model, self.coder_model)

After all conversions, verify with:
  grep -rn 'logger\.\w\+(f"' src/codelicious/
  grep -rn "logger\.\w\+(f'" src/codelicious/
Both must return zero results.

Run the full test suite to verify no regressions.
```

---

#### Phase 18: Fix Global Log Level Mutation in audit_logger.py

Finding: audit_logger.py calls logging.addLevelName() at module import time, which mutates
the global logging level namespace. This affects all loggers in the process, including
third-party libraries. On non-TTY environments, the custom level name can corrupt log
output parsers.

Files to modify:
- src/codelicious/tools/audit_logger.py (use a dedicated logger with custom formatting
  instead of custom level names)
- tests/test_security_audit.py (update if needed)

Intent: As a developer, the audit logger must not modify the global logging level namespace.
Custom formatting (colored output, security event prefixes) should be achieved through
a custom Formatter attached to the audit logger's handler, not through addLevelName
mutations. Third-party libraries sharing the same process must not be affected by
codelicious's logging configuration.

Acceptance criteria:
- No calls to logging.addLevelName() remain in the codebase.
- Audit events still appear with clear categorization in the output.
- Custom formatting is handled by a Formatter subclass.
- Test: importing audit_logger does not change logging.getLevelName results for standard
  levels.
- All existing security audit tests pass.

Claude Code prompt:

```
Read src/codelicious/tools/audit_logger.py completely. Find addLevelName calls.

The fix: remove addLevelName calls. Instead, use a custom Formatter that prepends the
security event type to the log message. The formatter should:
1. Check if the log record has a "security_event" extra field.
2. If yes, prepend "[SECURITY:<event_type>]" to the formatted message.
3. On TTY, add color codes. On non-TTY, use plain text.

Replace:
  logging.addLevelName(SECURITY_LEVEL, "SECURITY")
  self.logger.log(SECURITY_LEVEL, msg)
With:
  self.logger.info(msg, extra={"security_event": event_type})
  # The custom formatter handles the prefix/color

Update tests/test_security_audit.py if any tests check for the custom level name.

Run pytest tests/test_security_audit.py then full suite.
```

---

#### Phase 19: Make Plan File Writes Atomic

Finding: planner.py _write_plan_file uses path.write_text() directly, which is not atomic.
If the process crashes mid-write, the plan file is corrupted. The codebase already has
atomic_write_text in _io.py for this exact purpose.

Files to modify:
- src/codelicious/planner.py (use atomic_write_text for plan file writes)
- tests/test_planner.py (add atomic write test)

Intent: As a developer, plan file writes must be crash-safe. If the process is interrupted
during a plan file write, the previous valid plan file must still be intact. The
atomic_write_text function from _io.py must be used for all plan file persistence.

Acceptance criteria:
- _write_plan_file uses atomic_write_text instead of path.write_text.
- The temp file is created in the same directory as the target file.
- Test: _write_plan_file produces a valid JSON file.
- Test: if atomic_write_text raises, the original file is preserved (mock to verify).
- All existing tests pass.

Claude Code prompt:

```
Read src/codelicious/planner.py. Find _write_plan_file. Read src/codelicious/_io.py to
see atomic_write_text.

Fix: Replace path.write_text(...) with atomic_write_text(path, content). Import
atomic_write_text from codelicious._io.

Add to tests/test_planner.py:
- test_write_plan_file_produces_valid_json
- test_write_plan_file_uses_atomic_write (mock atomic_write_text, verify it is called)

Run pytest tests/test_planner.py then full suite.
```

---

### Tier 4: Test Coverage Expansion (Phases 20-23)

These phases fill all remaining test coverage gaps. Every module must have a corresponding
test file.

---

#### Phase 20: Tests for config.py

Files to create:
- tests/test_config.py

Intent: As a developer modifying the configuration loading system, I need tests that verify
environment variable precedence, config file loading, HTTPS enforcement, default values,
and edge cases like missing files or malformed JSON. These tests must exercise all public
functions in config.py without requiring real environment variables or config files.

Acceptance criteria:
- Tests cover: load_config, env var override, config file loading, HTTPS enforcement,
  default values, missing config file, malformed JSON config file.
- At least 10 tests.
- All tests pass without network access or real environment variables.
- All existing tests pass.

Claude Code prompt:

```
Read src/codelicious/config.py completely. Identify all public functions and configuration
loading paths.

Create tests/test_config.py with these tests:
- test_load_config_defaults: with no env vars or config file, defaults are returned.
- test_load_config_env_var_override: environment variable overrides config file value.
- test_load_config_from_file: valid config.json is loaded.
- test_load_config_malformed_json: malformed config.json raises or returns defaults.
- test_load_config_missing_file: missing config.json returns defaults.
- test_https_enforcement: non-HTTPS endpoint URL is rejected or warned.
- test_config_precedence_cli_over_env: CLI arg overrides env var.
- test_config_precedence_env_over_file: env var overrides config file.
- test_empty_config_file: empty JSON object returns defaults.
- test_config_with_extra_keys: unknown keys are ignored.

Use monkeypatch or unittest.mock.patch.dict(os.environ) for env vars. Use tmp_path for
config files. No real environment pollution.

Run pytest tests/test_config.py then full suite.
```

---

#### Phase 21: Tests for tools/registry.py

Files to create:
- tests/test_registry.py

Intent: As a developer modifying the tool registry, I need tests that verify tool
registration, lookup, dispatch, and error handling for unknown tools. The registry is the
gateway between LLM tool calls and actual function execution, so it must be thoroughly
tested.

Acceptance criteria:
- Tests cover: register a tool, lookup by name, dispatch with arguments, unknown tool
  error, duplicate registration handling.
- At least 8 tests.
- All tests pass.

Claude Code prompt:

```
Read src/codelicious/tools/registry.py completely. Identify the registration mechanism,
lookup, and dispatch functions.

Create tests/test_registry.py with these tests:
- test_register_tool: registering a tool makes it available for lookup.
- test_lookup_registered_tool: lookup by name returns the correct function.
- test_lookup_unknown_tool: lookup for unregistered name raises or returns None.
- test_dispatch_tool_with_args: dispatching a tool calls it with the correct arguments.
- test_dispatch_tool_with_kwargs: dispatching with keyword arguments works.
- test_dispatch_unknown_tool_raises: dispatching an unregistered tool raises.
- test_list_available_tools: listing returns all registered tool names.
- test_tool_registry_is_case_sensitive: "ReadFile" and "readfile" are different tools.

Use simple lambda or def functions as mock tools. No actual file or command operations.

Run pytest tests/test_registry.py then full suite.
```

---

#### Phase 22: Tests for errors.py and Duplicate Code Elimination

Files to modify:
- src/codelicious/loop_controller.py (if not removed in Phase 16, deduplicate with
  huggingface_engine.py)
- tests/test_errors.py (new file)

Intent: As a developer, the errors module must be tested to verify the exception hierarchy,
that all exceptions can be instantiated with appropriate messages, and that is_transient
classification works correctly. Additionally, if loop_controller.py was not fully removed
in Phase 16 and duplicates logic with huggingface_engine.py, the duplication must be
resolved by having one delegate to the other.

Acceptance criteria:
- Every exception class in errors.py can be instantiated and has a meaningful str().
- Exception hierarchy is correct (all inherit from CodeliciousError or appropriate base).
- is_transient returns True for transient errors and False for permanent ones.
- If loop_controller.py exists, it delegates to a shared function rather than duplicating
  huggingface_engine.py logic.
- At least 10 tests for errors.py.
- All tests pass.

Claude Code prompt:

```
Read src/codelicious/errors.py completely. Count all exception classes.

Create tests/test_errors.py:
- test_all_exceptions_inherit_from_base: every class in errors.py inherits from
  CodeliciousError (or whatever the base is).
- test_exception_str_includes_message: each exception's str() includes the constructor
  message.
- test_sandbox_violation_error_instantiation
- test_protected_path_error_instantiation
- test_command_denied_error_instantiation
- test_build_error_instantiation
- test_is_transient_for_timeout_error
- test_is_transient_for_rate_limit_error
- test_is_not_transient_for_config_error
- test_is_not_transient_for_sandbox_error
- test_prompt_injection_error_instantiation (added in Phase 1)

For the loop_controller duplication: read both loop_controller.py and
huggingface_engine.py. If _execute_agentic_iteration exists in both with near-identical
logic, extract the shared logic into a function in loop_controller.py and have
huggingface_engine.py import and call it (or delete loop_controller.py entirely if
huggingface_engine.py is the only caller).

Run pytest tests/test_errors.py then full suite.
```

---

#### Phase 23: Tests for rag_engine.py and progress.py

Files to create:
- tests/test_rag_engine.py
- tests/test_progress.py (expand existing if it exists)

Intent: As a developer, the RAG engine and progress reporter must have dedicated tests
covering their core functionality: adding documents, querying by similarity, result
capping, progress event emission, log rotation, and error handling.

Acceptance criteria:
- rag_engine tests: add document, query returns results, empty query returns empty,
  top_k is respected, SQLite index exists.
- progress tests: emit event writes to file, rotation at size limit, closed reporter
  raises, concurrent access is safe.
- At least 8 tests for rag_engine, 6 tests for progress.
- All tests pass.

Claude Code prompt:

```
Read src/codelicious/context/rag_engine.py completely. Read src/codelicious/progress.py
completely.

Create tests/test_rag_engine.py:
- test_add_document_and_query: add a doc, query for it, get it back.
- test_query_empty_db_returns_empty
- test_top_k_limits_results
- test_add_duplicate_document_handled
- test_query_relevance_ordering (add 3 docs, query, verify most relevant first)
- test_sqlite_db_created_in_correct_path
- test_add_document_with_empty_content
- test_query_with_empty_string

Note: if rag_engine uses external embeddings API, mock the embedding function to return
deterministic vectors (e.g., hash-based). Tests must not make network calls.

Create or expand tests/test_progress.py:
- test_emit_event_writes_to_file
- test_emit_multiple_events
- test_rotation_at_size_limit (mock file size)
- test_closed_reporter_raises_or_reinitializes
- test_event_format_is_valid_json
- test_concurrent_emit_is_safe (use threading)

Use tmp_path for all file operations. Run tests then full suite.
```

---

### Tier 5: Documentation, Configuration, and Final Verification (Phases 24-25)

---

#### Phase 24: Update pyproject.toml, .gitignore, and Configuration

Files to modify:
- pyproject.toml (add dev dependencies, tool configs, coverage threshold)
- .gitignore (add missing entries)
- .codelicious/STATE.md (update with spec-13 progress)

Intent: As a developer cloning this repo, I want to run "pip install -e '.[dev]'" and have
all development tools (ruff, mypy, pytest, pytest-cov, pre-commit) installed. The .gitignore
must prevent build artifacts, caches, and virtual environments from being committed. The
project configuration must be the single source of truth for tool settings.

Acceptance criteria:
- pyproject.toml declares dev dependencies: ruff, mypy, pytest, pytest-cov, pre-commit.
- pyproject.toml has [tool.ruff] section with select, line-length, target-version.
- pyproject.toml has [tool.pytest.ini_options] with testpaths, addopts.
- pyproject.toml has [tool.coverage.run] with source and fail_under = 80.
- .gitignore includes: venv/, .venv/, build/, dist/, *.egg-info/, .coverage,
  .pytest_cache/, .mypy_cache/, .ruff_cache/, __pycache__/, *.pyc, .codelicious/db.sqlite3.
- STATE.md reflects spec-13 completion status.

Claude Code prompt:

```
Read pyproject.toml completely. Read .gitignore completely.

Update pyproject.toml:
1. Add optional dev dependencies:
   [project.optional-dependencies]
   dev = [
       "ruff>=0.4.0",
       "mypy>=1.10",
       "pytest>=7.0",
       "pytest-cov>=5.0",
       "pre-commit>=3.7",
   ]

2. Add tool configurations if not present:
   [tool.ruff]
   line-length = 100
   target-version = "py310"

   [tool.ruff.lint]
   select = ["E", "F", "W", "I", "N", "UP", "S", "B", "A", "C4", "ISC", "ICN", "PIE", "T20", "PT", "RET", "SIM", "TID", "TCH", "ERA", "PL", "TRY", "FLY", "PERF", "RUF"]

   [tool.pytest.ini_options]
   testpaths = ["tests"]
   addopts = "-v --tb=short"

   [tool.coverage.run]
   source = ["src/codelicious"]

   [tool.coverage.report]
   fail_under = 80
   show_missing = true

Update .gitignore to include:
   venv/
   .venv/
   build/
   dist/
   *.egg-info/
   .coverage
   .pytest_cache/
   .mypy_cache/
   .ruff_cache/
   __pycache__/
   *.pyc
   *.pyo
   .codelicious/db.sqlite3

Do not remove existing entries. Only add missing ones.

Run pytest to verify nothing broke. Run ruff check src/ tests/ to verify lint config.
```

---

#### Phase 25: Full Verification, Documentation Alignment, and State Update

Files to modify:
- README.md (update metrics, add spec-13 Mermaid diagram)
- CLAUDE.md (verify accuracy)
- .codelicious/STATE.md (final update)

Intent: As a developer or reviewer, every piece of documentation must accurately reflect
the current state of the codebase after all 24 prior phases are complete. The README must
have updated metrics (test count, module count, coverage percentage). STATE.md must show
all spec-13 phases as complete with current verification results. All quality gates must
pass.

Acceptance criteria:
- pytest runs 500+ tests with zero failures.
- pytest --cov reports 80%+ line coverage.
- ruff check src/ tests/ passes with zero violations.
- ruff format --check src/ tests/ passes.
- README.md metrics match actual values.
- STATE.md shows spec-13 as complete with verification results.
- All Mermaid diagrams in README.md are syntactically valid.

Claude Code prompt:

```
Run the full verification suite:
1. pytest -v --tb=short (expect 500+ tests, 0 failures)
2. pytest --cov=src/codelicious --cov-report=term-missing (expect 80%+ coverage)
3. ruff check src/ tests/ (expect 0 violations)
4. ruff format --check src/ tests/ (expect 0 reformats)

Record the exact numbers from each command.

Update README.md:
1. Update the test count in any metrics sections.
2. Update the module count if modules were added/removed.
3. Update the coverage percentage.
4. Verify all Mermaid diagrams are syntactically valid (no unclosed blocks).

Update .codelicious/STATE.md:
1. Set Current Spec to spec-13.
2. Mark all 25 phases as complete with checkmarks.
3. Update the Verification Results table with actual numbers.
4. Update test coverage table with new test files and counts.
5. Set Overall Risk to LOW.

Verify CLAUDE.md still accurately describes the workflow. If any rule references are
outdated (e.g., referencing spec-08 as current), update them.

Write "DONE" to .codelicious/BUILD_COMPLETE.
```

---

## 6. Phase Dependency Graph

Phases within a tier are independent and may be executed in parallel. Tiers must be
executed in order.

Tier 1 (Phases 1-8): No internal dependencies. All may run in parallel.
Tier 2 (Phases 9-15): Depends on Tier 1 completion. Phase 9 should precede Phase 13
  (unified metacharacters used by command runner). Other phases are independent.
Tier 3 (Phases 16-19): Depends on Tier 2 completion. Phase 16 (dead code removal)
  should precede Phase 17 (logging fixes) to avoid fixing code that will be removed.
Tier 4 (Phases 20-23): Depends on Tier 3 completion. All phases are independent.
Tier 5 (Phases 24-25): Depends on all prior tiers. Phase 24 precedes Phase 25.

---

## 7. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Phase 16 (dead code removal) breaks an import chain | Medium | High | Run full import test after each module removal |
| Phase 3 (TOCTOU fix) introduces performance regression | Low | Medium | Benchmark write latency before/after |
| Phase 12 (git staging) changes commit behavior | Medium | Medium | Test with a real git repo in a fixture |
| Phase 6 (verifier multiline fix) introduces false positives | Low | Medium | Run verifier on the entire src/ tree after fix |
| Test count target (500+) not reached | Low | Low | Adjust target based on actual dead code removal |

---

## 8. Quick Install and Verification

After cloning the repository, run these commands to verify the current state:

```bash
# Clone and install with dev dependencies
git clone <repo-url>
cd codelicious-v1
pip install -e ".[dev]"

# Run the full verification suite
pytest -v --tb=short
ruff check src/ tests/
ruff format --check src/ tests/

# Run with coverage
pytest --cov=src/codelicious --cov-report=term-missing

# Run security scan
python -c "from codelicious.verifier import Verifier; v = Verifier('.'); print(v.check_security('src/'))"
```

Expected results before spec-13:
- 274 tests passing in approximately 3.3 seconds
- Zero ruff violations
- Zero format issues
- Approximately 37% module test coverage (11 of 30 modules)

Expected results after spec-13:
- 500+ tests passing
- Zero ruff violations
- Zero format issues
- 80%+ line coverage
- Zero P1/P2/P3 findings

---

## 9. Sample Data and Fixture Requirements

Each test phase should generate deterministic fixtures as needed. The following fixture
types are required across the test suite:

| Fixture Type | Purpose | Location | Used By |
|--------------|---------|----------|---------|
| Minimal spec files | Test parser and planner | tests/fixtures/specs/ | test_planner.py, test_parser.py |
| Malicious spec files | Test injection detection | tests/fixtures/specs/ | test_planner.py |
| LLM response JSON | Test response parsing and validation | tests/fixtures/llm_responses/ | test_llm_client.py, test_loop_controller.py |
| Git repo state | Test git orchestrator | tmp_path fixtures | test_git_orchestrator.py |
| Config JSON files | Test config loading | tmp_path fixtures | test_config.py |
| Large files (generated) | Test size limits | tmp_path fixtures | test_sandbox.py, test_fs_tools.py |
| Multiline Python files | Test verifier string tracking | inline strings | test_verifier.py |
| Security event logs | Test audit logger formatting | tmp_path fixtures | test_security_audit.py |

All fixtures must be deterministic (no randomness, no timestamps, no network-derived data).
Fixtures that require filesystem state should use pytest's tmp_path fixture.

---

## 10. Post-Completion Checklist

After all 25 phases are complete, verify:

- [ ] pytest: 500+ tests, 0 failures, 0 collection errors
- [ ] pytest --cov: 80%+ line coverage
- [ ] ruff check: 0 violations
- [ ] ruff format: 0 reformats needed
- [ ] python -c "from codelicious import cli": no import errors
- [ ] grep for f-string logging: 0 matches in src/
- [ ] grep for addLevelName: 0 matches in src/
- [ ] grep for "git add .": 0 matches in src/ (replaced with explicit staging)
- [x] grep for warnings.warn in planner.py _check_injection: 0 matches (replaced with raise)
- [ ] README.md metrics match actual values
- [ ] STATE.md shows spec-13 complete
- [ ] BUILD_COMPLETE contains "DONE"
