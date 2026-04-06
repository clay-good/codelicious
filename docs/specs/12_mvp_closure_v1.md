---
version: 1.0.0
status: Complete
date: 2026-03-16
author: Claude Opus 4.6 (spec generation), Clay Good (review)
depends_on: ["11_mvp_hardening_v1.md", "08_hardening_reliability_v1.md", "07_sandbox_security_hardening.md"]
related_specs: ["00_master_spec.md", "05_feature_dual_engine.md", "06_production_hardening.md", "09_security_reliability_v1.md", "10_comprehensive_hardening_v1.md"]
---

# spec-12: MVP Closure -- Security Remediation, Test Completeness, and Production Readiness

## 1. Executive Summary

This spec is the final hardening pass before the codelicious MVP is considered production-ready
for private org use. It consolidates all unresolved P1 and P2 findings from the deep security
review in STATE.md, the reviewer audit of all 35 Python source modules, and the test coverage
gap analysis across 14 test files. It does not introduce net-new features, change model
selection, or modify prompt engineering. Every phase targets a concrete deficiency that already
exists in the shipped code.

The codebase today has 260 passing tests across 14 test files covering 11 of 30 source modules.
19 modules have zero dedicated test coverage. The security harness (sandbox, command runner,
verifier, audit logger) is strong in design but has 8 critical findings (P1) and 12 important
findings (P2) that weaken it in practice. This spec closes those gaps.

Goal: bring the codebase from "working MVP with 260 tests and 30+ known issues" to "hardened
MVP with 400+ tests, zero P1 issues, zero P2 issues, full documentation alignment, and
enforced quality gates."

### Codebase Metrics (Measured)

Source: 8,383 lines across 35 Python modules in src/codelicious/.
Tests: 3,809 lines across 14 test files in tests/.
Specs: 12 spec files in docs/specs/ (specs 00-11).

### Logic Breakdown (Measured)

| Category | Lines | Percentage | Modules |
|----------|-------|------------|---------|
| Deterministic safety harness | ~3,500 | 42% | sandbox, verifier, command_runner, fs_tools, audit_logger, git_orchestrator, config, _io, budget_guard, build_logger, progress, errors, security_constants |
| Probabilistic LLM-driven | ~3,800 | 45% | planner, executor, llm_client, agent_runner, loop_controller, prompts, context_manager, scaffolder, rag_engine, engines/* |
| Shared infrastructure | ~1,083 | 13% | cli, logger, cache_engine, tools/registry |

This spec operates primarily within the deterministic 42% layer. The only changes to the
probabilistic layer are defensive input validation at system boundaries (planner injection
guard, LLM response size cap, agent_runner argument sanitization).

### Relationship to Prior Specs

Spec-07 built the defense-in-depth security layers. Spec-08 Phase 1 fixed BuildResult.success.
Specs 08-11 scoped broad remediation but remain largely unimplemented (15 of 16 spec-08 phases,
all of specs 09-11). This spec cherry-picks the highest-impact, lowest-risk items from those
specs and adds findings from a fresh independent review that specs 08-11 did not cover:

- P1-01: Prompt injection guard is advisory-only (planner.py) -- not in any prior spec.
- P1-02: Denylist missing interpreter binaries (command_runner.py) -- partially in spec-09.
- P1-03: Unconditional --dangerously-skip-permissions (agent_runner.py) -- not in any spec.
- P1-05: git add . stages secrets (git_orchestrator.py) -- in spec-11 Phase 9.
- P2-10: ensure_draft_pr_exists called with missing argument (claude_engine.py) -- not in any spec.
- P2-12: pyproject.toml missing dev deps and tool configs -- partially in spec-10.
- P3-07: 19 modules with zero test coverage -- partially in specs 10/11.

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

1. All 8 P1 (critical) security findings: prompt injection, denylist gaps, permission bypass,
   secret staging, git error swallowing, API key logging, PR title sanitization, protected
   path read enforcement.
2. All 12 P2 (important) findings: flush_cache stub, atomic write permissions, hardcoded
   max_iterations, unbounded response read, untyped parameters, JSON size cap, RAG memory
   explosion, unvalidated reviewer strings, global log level mutation, missing function
   argument, provider logging, missing dev dependencies.
3. Test coverage expansion: dedicated test files for all 19 untested modules.
4. Sample data generation: deterministic fixtures for LLM responses, git state, config
   schemas, and spec parsing edge cases.
5. pyproject.toml completion: dev dependencies, tool configs (ruff, mypy, coverage, pytest).
6. Documentation alignment: README.md accuracy, CLAUDE.md updates, MEMORY.md population.
7. Lint and format enforcement: ruff config with explicit rule selection, format as gate.
8. Pre-commit hook validation: ensure hooks match documented commands.
9. Mermaid diagram updates in README.md reflecting spec-12 changes.

### Non-Goals

- New features (browser-in-the-loop, swarm architecture, vector DB activation, CI/CD).
- Model selection changes or prompt engineering modifications.
- License, legal compliance, or contributor documentation.
- Performance benchmarking beyond fixing known unbounded operations.
- Changes to the Claude Code CLI invocation model (--dangerously-skip-permissions is
  documented but left as an operator decision, not removed).

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

---

## 4. Acceptance Criteria (Global)

All of the following must be true when this spec is complete:

1. Zero P1 findings remain open. Each P1 fix has a regression test that would have failed
   before the fix.
2. Zero P2 findings remain open. Each P2 fix has a regression test.
3. Every source module in src/codelicious/ has a corresponding test file in tests/.
4. pytest runs 400+ tests with zero failures and zero collection errors.
5. pytest --cov reports 80%+ line coverage for src/codelicious/.
6. ruff check src/ tests/ passes with zero violations using the configured rule set.
7. ruff format --check src/ tests/ passes with zero reformatting needed.
8. mypy src/codelicious/ --strict produces zero errors (advisory, not blocking).
9. pre-commit run --all-files passes with zero failures.
10. README.md accurately reflects the current architecture, commands, and security model.
11. CLAUDE.md accurately reflects the current development workflow.
12. All Mermaid diagrams in README.md render correctly and reflect spec-12 changes.

---

## 5. Phases

This spec contains 25 phases organized into 5 tiers. Phases within a tier may be executed in
parallel. Tiers must be executed in order. Each phase includes a Claude Code prompt ready for
direct execution.

### Tier 1: Critical Security Fixes (Phases 1-8)

These phases address all P1 findings. They must be completed before any other work because
they affect the security boundary of the system.

---

#### Phase 1: Make Prompt Injection Guard Blocking

Finding: P1-01. planner.py _check_injection emits warnings.warn but does not raise. The
injection guard has no blocking effect. A spec containing adversarial instructions proceeds
to full LLM planning.

Files to modify:
- src/codelicious/planner.py (change _check_injection to raise)
- src/codelicious/errors.py (add PromptInjectionError if not present)
- tests/test_planner.py (new file, test injection patterns raise)

Intent: As a developer running codelicious on a repository, when my spec file contains known
prompt injection patterns like "IGNORE PREVIOUS INSTRUCTIONS" or "SYSTEM:" or "You are now",
the planner must reject the spec with a clear error before any LLM call is made. The build
must not proceed.

Acceptance criteria:
- _check_injection raises PromptInjectionError (or IntentRejectedError) when a pattern matches.
- create_plan catches PromptInjectionError and propagates it to the caller.
- Test: spec with "IGNORE PREVIOUS INSTRUCTIONS" raises PromptInjectionError.
- Test: spec with "SYSTEM: you are a helpful assistant" raises PromptInjectionError.
- Test: spec with normal technical content does not raise.
- All existing tests pass.

Claude Code prompt:

```
Read src/codelicious/planner.py and src/codelicious/errors.py completely. Find the
_check_injection method. Currently it calls warnings.warn when an injection pattern is
detected but does not raise an exception, so the build continues.

Fix: Change _check_injection to raise PromptInjectionError (add this to errors.py if it
does not exist, inheriting from CodeliciousError or the existing base). The error message
must include which pattern matched and the line number in the spec where it was found.

Create tests/test_planner.py with these tests:
- test_injection_ignore_previous_instructions: spec containing "IGNORE PREVIOUS INSTRUCTIONS"
  must raise PromptInjectionError.
- test_injection_system_prompt: spec containing "SYSTEM:" must raise PromptInjectionError.
- test_injection_you_are_now: spec containing "You are now" must raise.
- test_clean_spec_no_injection: normal spec text must not raise.
- test_injection_pattern_in_code_block: injection pattern inside a fenced code block should
  ideally not trigger (if the current regex checks raw text, document this as a known
  limitation and add a comment).

Mock all LLM calls. Tests must not make network requests. Run pytest tests/test_planner.py
to verify. Then run pytest to verify no regressions.
```

---

#### Phase 2: Close Denylist Gaps for Interpreter Binaries

Finding: P1-02. command_runner.py DENIED_COMMANDS does not include python3, python, bash, sh,
perl, ruby, node, env, xargs, or find. The LLM can use these as alternative execution vehicles
to bypass the command denylist entirely (e.g., "python3 -c 'import os; os.system(\"rm -rf /\")'").

Files to modify:
- src/codelicious/tools/command_runner.py (expand DENIED_COMMANDS)
- src/codelicious/security_constants.py (if interpreter list is maintained there)
- tests/test_command_runner.py (new file)

Intent: As a developer, when the LLM agent attempts to execute a command that starts with an
interpreter binary (python, python3, bash, sh, zsh, perl, ruby, node, env, xargs, find, exec,
nohup, strace, ltrace, gdb), the command runner must reject it with a clear error. The LLM
must not be able to use interpreters as shells to execute arbitrary code.

Acceptance criteria:
- DENIED_COMMANDS includes: python, python3, bash, sh, zsh, csh, ksh, fish, dash, perl, ruby,
  node, env, xargs, find, exec, nohup, strace, ltrace, gdb, script, expect.
- Test: "python3 -c 'import os'" is rejected.
- Test: "env rm -rf /" is rejected.
- Test: "bash -c 'echo hello'" is rejected.
- Test: "node -e 'process.exit(1)'" is rejected.
- Test: "xargs rm" is rejected.
- Test: "git status" is still allowed (not an interpreter).
- Test: "pytest tests/" is still allowed.
- All existing tests pass.

Claude Code prompt:

```
Read src/codelicious/tools/command_runner.py completely. Read
src/codelicious/security_constants.py if it exists. Find DENIED_COMMANDS (likely a frozenset).

The current denylist blocks destructive commands (rm, sudo, dd, kill, etc.) but does NOT
block interpreter binaries. The LLM can run "python3 -c 'import os; os.system(\"rm -rf /\")'"
or "bash -c 'rm -rf /'" or "env rm -rf /" to bypass the denylist entirely.

Fix: Add ALL of these to DENIED_COMMANDS: python, python3, bash, sh, zsh, csh, ksh, fish,
dash, perl, ruby, node, env, xargs, find, exec, nohup, strace, ltrace, gdb, script, expect.

Create tests/test_command_runner.py:
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

Use unittest.mock.patch for subprocess. No actual commands should execute. Run pytest
tests/test_command_runner.py then pytest to verify.
```

---

#### Phase 3: Document and Gate --dangerously-skip-permissions

Finding: P1-03. agent_runner.py always passes --dangerously-skip-permissions to the Claude CLI.
This gives the agent subprocess unrestricted host filesystem and shell access with no human
confirmation. There is no way to disable this.

Files to modify:
- src/codelicious/agent_runner.py (add config flag)
- src/codelicious/config.py (add skip_permissions field)
- src/codelicious/cli.py (add --skip-permissions CLI flag)
- tests/test_agent_runner.py (new file)

Intent: As a developer running codelicious, I want to be aware that --dangerously-skip-permissions
is being used and have the option to disable it. By default the flag should still be on (the
tool is designed for autonomous use), but the user must be able to opt out via
--no-skip-permissions for environments where human confirmation is required.

Acceptance criteria:
- Config dataclass has a skip_permissions: bool field, default True.
- CLI has --no-skip-permissions flag that sets skip_permissions=False.
- agent_runner reads skip_permissions from config and only includes
  --dangerously-skip-permissions when True.
- When skip_permissions is True, a log.warning is emitted at the start of the build:
  "Running Claude CLI with --dangerously-skip-permissions. The agent has unrestricted host
  access."
- Test: with skip_permissions=True, the constructed command includes the flag.
- Test: with skip_permissions=False, the constructed command does not include the flag.
- Test: the warning is emitted when skip_permissions=True.
- All existing tests pass.

Claude Code prompt:

```
Read src/codelicious/agent_runner.py, src/codelicious/config.py, and src/codelicious/cli.py
completely.

In agent_runner.py, find where --dangerously-skip-permissions is added to the command list.
Currently it is always included with no way to disable it.

Fix:
1. In config.py, add skip_permissions: bool = True to the Config dataclass.
2. In cli.py, add --no-skip-permissions as an argparse flag that sets skip_permissions=False.
3. In agent_runner.py, check config.skip_permissions before including the flag. When True,
   emit logger.warning("Running Claude CLI with --dangerously-skip-permissions. The agent
   has unrestricted host access.").

Create tests/test_agent_runner.py:
- test_skip_permissions_true_includes_flag: mock subprocess, verify command list includes
  --dangerously-skip-permissions.
- test_skip_permissions_false_excludes_flag: verify command list does NOT include it.
- test_skip_permissions_warning_emitted: verify logger.warning is called.
- test_default_skip_permissions_is_true: verify Config().skip_permissions is True.

Mock all subprocess calls. No actual Claude CLI invocations. Run pytest
tests/test_agent_runner.py then pytest to verify.
```

---

#### Phase 4: Replace git add . with Explicit File Staging

Finding: P1-05 and P1-06. git_orchestrator.py commit_verified_changes runs "git add ." which
stages all untracked files including secrets, .env files, credentials, and temporary state.
Additionally, git errors in this function are silently swallowed by a bare except Exception.

Files to modify:
- src/codelicious/git/git_orchestrator.py (replace git add . with explicit file list)
- tests/test_git_orchestrator.py (new file)

Intent: As a developer, when codelicious commits changes, it must only stage files that were
actually modified by the build process. It must never stage .env files, credential files
(.pem, .key, .p12), or other sensitive patterns. Git command failures must propagate as
exceptions, not be silently swallowed.

Acceptance criteria:
- commit_verified_changes accepts a list of file paths to stage, or uses "git add -u" to
  stage only tracked file modifications.
- Before staging, a pre-check rejects any file matching: .env*, *.pem, *.key, *.p12,
  *.pfx, credentials.*, secrets.*, *.secret.
- Git command failures raise GitError (or RuntimeError) instead of being caught by bare
  except Exception.
- Test: staging a list of safe files succeeds.
- Test: staging a .env file is rejected with an error.
- Test: staging a .pem file is rejected.
- Test: git add failure raises an exception.
- Test: git commit failure raises an exception.
- All existing tests pass.

Claude Code prompt:

```
Read src/codelicious/git/git_orchestrator.py completely. Find commit_verified_changes.

Currently it runs "git add ." (stages everything) and wraps the entire function in a bare
except Exception that silently swallows errors.

Fix:
1. Change "git add ." to "git add -u" (only stage modifications to tracked files). If the
   function receives a file_paths parameter, use "git add" with explicit paths instead.
2. Before staging, check each file against a SENSITIVE_PATTERNS frozenset: ".env", ".pem",
   ".key", ".p12", ".pfx", "credentials.", "secrets.", ".secret". Reject any match with
   a clear error message.
3. Remove the bare except Exception. Let git errors propagate. If specific recovery is
   needed, catch subprocess.CalledProcessError and re-raise as a descriptive RuntimeError.
4. Fix ensure_draft_pr_exists: it is called with no arguments at claude_engine.py:222 but
   requires spec_summary. Add a default value or fix the caller.

Create tests/test_git_orchestrator.py:
- test_commit_stages_tracked_changes_only
- test_commit_rejects_env_file
- test_commit_rejects_pem_file
- test_commit_rejects_key_file
- test_git_add_failure_raises
- test_git_commit_failure_raises
- test_assert_safe_branch_rejects_main
- test_assert_safe_branch_allows_feature_branch
- test_ensure_draft_pr_missing_arg_uses_default

Mock all subprocess/git calls. No actual git operations. Run pytest
tests/test_git_orchestrator.py then pytest to verify.
```

---

#### Phase 5: Sanitize API Key Exposure in Logging

Finding: P1-04. llm_client.py stores self.api_key as a plain attribute. While it is not
directly logged, any object repr, debug dump, or error traceback could expose it. f-strings
in logger calls bypass the SanitizingFilter.

Files to modify:
- src/codelicious/llm_client.py (mask api_key in repr, use %-style logging)
- src/codelicious/config.py (mask api_key in Config repr)
- tests/test_llm_client.py (new file)

Intent: As a developer, I must be confident that my API keys never appear in log files, error
tracebacks, or object representations. The LLM client and config objects must mask sensitive
fields in all string representations.

Acceptance criteria:
- LLMClient.__repr__ shows api_key as "***" (or omits it entirely).
- Config.__repr__ (or __str__) masks api_key.
- All logger.info/debug/warning calls in llm_client.py use %-style formatting, not f-strings.
- LLMClient.api_key is stored but never appears in any log output.
- Test: repr(LLMClient(..., api_key="sk-1234")) does not contain "sk-1234".
- Test: repr(Config(api_key="hf_abcd")) does not contain "hf_abcd".
- Test: logger output during LLMClient initialization does not contain the key.
- All existing tests pass.

Claude Code prompt:

```
Read src/codelicious/llm_client.py and src/codelicious/config.py completely.

Findings:
1. LLMClient stores self.api_key as a plain attribute with no __repr__ override. Any debug
   dump or error traceback will expose the key.
2. Config stores api_key with no masking in repr.
3. llm_client.py uses f-strings in logger calls (lines 67-68), bypassing the SanitizingFilter.

Fix:
1. Add __repr__ to LLMClient that masks api_key: return something like
   "LLMClient(endpoint=..., api_key='***')".
2. Add __repr__ to Config (if not present) that masks api_key.
3. Convert all f-string logger calls in llm_client.py to %-style:
   logger.info("LLM Planner: %s | Coder: %s", self.planner_model, self.coder_model)
4. Do the same for any other f-string logger calls you find in the file.

Create tests/test_llm_client.py:
- test_repr_masks_api_key
- test_config_repr_masks_api_key
- test_logger_does_not_contain_api_key (capture log output, verify key absent)
- test_llm_client_init_with_env_vars (mock os.environ)
- test_llm_client_init_with_explicit_args
- test_llm_client_missing_api_key_raises

Mock urllib and os.environ. No network calls. Run pytest tests/test_llm_client.py then
pytest to verify.
```

---

#### Phase 6: Sanitize PR Title from LLM Content

Finding: P1-07. git_orchestrator.py builds PR title from unsanitized LLM-generated commit
message. While subprocess list invocation prevents shell injection, the content could contain
misleading markdown, control characters, or excessive length.

Files to modify:
- src/codelicious/git/git_orchestrator.py (sanitize PR title and commit message)
- tests/test_git_orchestrator.py (extend from Phase 4)

Intent: As a developer, PR titles and commit messages generated by the LLM must be sanitized
to ASCII printable characters, truncated to 72 characters for titles and 500 characters for
commit message subject lines, and stripped of control characters and null bytes.

Acceptance criteria:
- PR title is truncated to 72 characters.
- Commit message subject line is truncated to 72 characters.
- Non-printable characters (ASCII < 32 except newline, tab) are stripped.
- Null bytes are stripped.
- Test: title with 200 characters is truncated to 72.
- Test: title with control characters has them stripped.
- Test: title with null bytes has them stripped.
- Test: normal title passes through unchanged.
- All existing tests pass.

Claude Code prompt:

```
Read src/codelicious/git/git_orchestrator.py completely. Find where PR titles and commit
messages are constructed.

Add a _sanitize_message(text: str, max_length: int = 72) -> str helper:
1. Strip null bytes.
2. Strip non-printable ASCII characters (ord < 32 except \n and \t).
3. Truncate to max_length, appending "..." if truncated.
4. Strip leading/trailing whitespace.

Apply _sanitize_message to:
- PR title (max_length=72)
- Commit message subject line (max_length=72)
- Branch name components derived from LLM output (max_length=50, also replace
  non-alphanumeric chars except - and / with -)

Extend tests/test_git_orchestrator.py (from Phase 4):
- test_sanitize_truncates_long_title
- test_sanitize_strips_control_chars
- test_sanitize_strips_null_bytes
- test_sanitize_normal_passthrough
- test_sanitize_empty_string

Mock subprocess. Run pytest tests/test_git_orchestrator.py then pytest to verify.
```

---

#### Phase 7: Validate Reviewer Strings in Git Orchestrator

Finding: P2-08. git_orchestrator.py passes reviewer strings to "gh pr edit --reviewer" without
validation. A reviewer string starting with "--" could inject gh CLI flags.

Files to modify:
- src/codelicious/git/git_orchestrator.py (validate reviewer strings)
- tests/test_git_orchestrator.py (extend)

Intent: As a developer, reviewer usernames passed to the gh CLI must be validated to contain
only alphanumeric characters, hyphens, and underscores (matching GitHub username rules). Any
string starting with "--" or containing shell-unsafe characters must be rejected.

Acceptance criteria:
- Reviewer strings are validated against pattern [a-zA-Z0-9_-]+.
- Strings starting with "--" are rejected.
- Strings containing spaces, semicolons, or pipe characters are rejected.
- Test: "valid-user" passes validation.
- Test: "--malicious-flag" is rejected.
- Test: "user; rm -rf /" is rejected.
- All existing tests pass.

Claude Code prompt:

```
Read src/codelicious/git/git_orchestrator.py. Find where reviewers are passed to gh CLI.

Add a _validate_reviewer(username: str) -> str function:
1. Strip whitespace.
2. Reject if empty after strip.
3. Reject if starts with "-".
4. Reject if does not match regex ^[a-zA-Z0-9_-]+$.
5. Return the validated username.

Apply to all reviewer strings before they are passed to subprocess.

Extend tests/test_git_orchestrator.py:
- test_valid_reviewer_accepted
- test_reviewer_with_flag_rejected
- test_reviewer_with_semicolon_rejected
- test_reviewer_with_space_rejected
- test_empty_reviewer_rejected

Run pytest tests/test_git_orchestrator.py then pytest to verify.
```

---

#### Phase 8: Enforce Read Protection on Security-Critical Files

Finding: P1-08. fs_tools.py _is_protected_path only blocks writes. The LLM can read all
source files including security tool source code (command_runner.py, registry.py, sandbox.py)
to understand and craft bypasses.

Files to modify:
- src/codelicious/tools/fs_tools.py (add read protection)
- tests/test_fs_tools.py (new file)

Intent: As a developer, the LLM agent must not be able to read the source code of the security
harness (sandbox.py, command_runner.py, security_constants.py, audit_logger.py, fs_tools.py).
It can read all other project files. This prevents the agent from reverse-engineering the
security controls.

Acceptance criteria:
- native_read_file checks _is_protected_path before reading.
- Protected paths include at minimum: sandbox.py, command_runner.py, security_constants.py,
  audit_logger.py, fs_tools.py.
- Attempting to read a protected file returns an error message, not the file contents.
- Test: reading command_runner.py returns error, not contents.
- Test: reading a normal source file succeeds.
- Test: reading a test file succeeds.
- native_read_file enforces a 10MB size limit.
- Test: reading a file over 10MB returns error.
- All existing tests pass.

Claude Code prompt:

```
Read src/codelicious/tools/fs_tools.py completely.

Currently _is_protected_path is only called in native_write_file. The LLM can freely read
all security-critical source files via native_read_file.

Fix:
1. Add _is_protected_path check to native_read_file. If the path matches a protected
   pattern, return "Error: access to security-critical files is restricted."
2. Add a size check: if the file is larger than 10MB (10 * 1024 * 1024 bytes), return
   "Error: file exceeds 10MB size limit."
3. Add the size check before reading to prevent memory exhaustion.

Create tests/test_fs_tools.py:
- test_read_protected_file_rejected (command_runner.py)
- test_read_normal_file_succeeds
- test_read_test_file_succeeds
- test_write_protected_file_rejected
- test_write_normal_file_succeeds
- test_read_oversized_file_rejected (create a tmp file > 10MB)
- test_protected_path_normalization (../tools/command_runner.py still blocked)

Use tmp_path for all file operations. Run pytest tests/test_fs_tools.py then pytest to verify.
```

---

### Tier 2: Reliability and Correctness Fixes (Phases 9-14)

These phases address all P2 findings that affect correctness and reliability. They can be
done in parallel within this tier.

---

#### Phase 9: Implement flush_cache and Atomic State Persistence

Finding: P2-01. cache_engine.py flush_cache is a no-op stub. State is never persisted to disk.
P3-03. .codelicious directory created with world-readable permissions.

Files to modify:
- src/codelicious/context/cache_engine.py (implement flush_cache, fix permissions)
- src/codelicious/_io.py (fix TOCTOU on file permissions -- P2-02)
- tests/test_cache_engine.py (new file)
- tests/test_io.py (new file)

Intent: As a developer, build state must be persisted to disk so that resumed builds have
access to prior context. The .codelicious directory must be created with 0o700 permissions
(owner-only). Atomic file writes must set permissions before the rename, not after.

Acceptance criteria:
- flush_cache writes cache.json and state.json to disk using atomic_write_text.
- record_memory_mutation calls flush_cache after appending to the memory ledger.
- .codelicious directory is created with mode=0o700.
- atomic_write_text in _io.py calls os.fchmod(fd, mode) before closing the fd, not after
  os.replace.
- Test: flush_cache creates valid JSON files on disk.
- Test: record_memory_mutation persists to disk.
- Test: .codelicious dir has 0o700 permissions after creation.
- Test: atomic_write_text sets permissions before rename.
- All existing tests pass.

Claude Code prompt:

```
Read src/codelicious/context/cache_engine.py and src/codelicious/_io.py completely.

Findings:
1. flush_cache is a stub containing only "pass".
2. record_memory_mutation appends to in-memory list but never writes to disk.
3. _ensure_skeleton creates .codelicious dir with default permissions (0o755 via umask).
4. atomic_write_text sets chmod after os.replace, creating a TOCTOU window.

Fix cache_engine.py:
1. Implement flush_cache: serialize self._cache_data to cache.json and self._state_data to
   state.json using atomic_write_text from _io.py.
2. Call flush_cache at the end of record_memory_mutation.
3. In _ensure_skeleton, use self.codelicious_dir.mkdir(mode=0o700, parents=True, exist_ok=True).

Fix _io.py:
1. In atomic_write_text, call os.fchmod(fd, mode) before os.close(fd), then os.replace.
   Remove the os.chmod call after os.replace.

Create tests/test_cache_engine.py:
- test_flush_cache_creates_files
- test_flush_cache_valid_json
- test_record_memory_persists
- test_codelicious_dir_permissions
- test_ensure_skeleton_idempotent

Create tests/test_io.py:
- test_atomic_write_creates_file
- test_atomic_write_permissions_before_rename
- test_atomic_write_content_correct
- test_atomic_write_overwrites_existing
- test_atomic_write_parent_dir_created

Use tmp_path. Run pytest tests/test_cache_engine.py tests/test_io.py then pytest to verify.
```

---

#### Phase 10: Fix max_iterations Config Passthrough

Finding: P2-03. loop_controller.py hardcodes max_iterations=50, ignoring the value from CLI
and config.

Files to modify:
- src/codelicious/loop_controller.py (accept max_iterations parameter)
- tests/test_loop_controller.py (new file)

Intent: As a developer, when I pass --max-iterations 10 on the CLI, the HuggingFace engine
loop must respect that value and stop after 10 iterations, not the hardcoded 50.

Acceptance criteria:
- BuildLoop.__init__ accepts max_iterations with default 50.
- run_continuous_cycle uses self.max_iterations.
- HuggingFaceEngine passes config.max_iterations to BuildLoop.
- Test: BuildLoop(max_iterations=5) stops after 5 iterations.
- Test: BuildLoop() defaults to 50.
- Test: iteration count is tracked correctly.
- All existing tests pass.

Claude Code prompt:

```
Read src/codelicious/loop_controller.py and src/codelicious/engines/huggingface_engine.py
completely.

Finding: BuildLoop.run_continuous_cycle hardcodes max_iterations = 50 regardless of what
is passed via CLI --max-iterations.

Fix:
1. Add max_iterations: int = 50 to BuildLoop.__init__.
2. Store as self.max_iterations.
3. Use self.max_iterations in run_continuous_cycle instead of the hardcoded 50.
4. In huggingface_engine.py, pass config.max_iterations to BuildLoop constructor.

Create tests/test_loop_controller.py:
- test_default_max_iterations_is_50
- test_custom_max_iterations_respected
- test_loop_stops_at_max
- test_loop_early_exit_on_completion (if ALL_SPECS_COMPLETE detected)

Mock LLM client and tool registry. No network calls. Run pytest
tests/test_loop_controller.py then pytest to verify.
```

---

#### Phase 11: Cap LLM Response Body Size

Finding: P2-04. llm_client.py reads the full HTTP response body with no size limit. A
malfunctioning API could return gigabytes of data.

Files to modify:
- src/codelicious/llm_client.py (add response size cap)
- tests/test_llm_client.py (extend from Phase 5)

Intent: As a developer, the LLM client must not read more than 50MB from any API response.
Responses exceeding this limit must be truncated and logged as a warning.

Acceptance criteria:
- response.read(MAX_RESPONSE_BYTES) with MAX_RESPONSE_BYTES = 50 * 1024 * 1024.
- If the response is at the cap, log a warning about possible truncation.
- Test: response under cap is read fully.
- Test: response at cap triggers warning.
- All existing tests pass.

Claude Code prompt:

```
Read src/codelicious/llm_client.py. Find where urllib.request.urlopen response is read.

Fix: Replace response.read() with response.read(50 * 1024 * 1024). Define
MAX_RESPONSE_BYTES = 50 * 1024 * 1024 as a module constant. If len(body) ==
MAX_RESPONSE_BYTES, emit logger.warning("LLM response may have been truncated at %d bytes",
MAX_RESPONSE_BYTES).

Extend tests/test_llm_client.py:
- test_response_under_cap_read_fully
- test_response_at_cap_triggers_warning

Mock urllib.request.urlopen. Run pytest tests/test_llm_client.py then pytest to verify.
```

---

#### Phase 12: Cap RAG Engine Query Results

Finding: P2-07. rag_engine.py loads ALL chunks from SQLite for similarity search with no
LIMIT clause.

Files to modify:
- src/codelicious/context/rag_engine.py (add LIMIT and top_k validation)
- tests/test_rag_engine.py (new file)

Intent: As a developer, RAG similarity searches must not load the entire database into memory.
The search must be limited to a configurable top_k (default 10, max 100) and the SQL query
must use a LIMIT clause.

Acceptance criteria:
- search_similar accepts top_k parameter with default 10 and max 100.
- SQL query includes LIMIT clause (at least top_k * 10 to allow post-sort filtering).
- top_k values above 100 are clamped to 100 with a warning.
- top_k values below 1 are clamped to 1.
- Test: search with top_k=5 returns at most 5 results.
- Test: top_k=200 is clamped to 100.
- Test: top_k=0 is clamped to 1.
- Test: empty database returns empty list.
- All existing tests pass.

Claude Code prompt:

```
Read src/codelicious/context/rag_engine.py completely. Find the search/similarity method.

Currently the SQL query fetches ALL rows from file_chunks with no LIMIT. For large codebases
this loads thousands of rows with 384-float vectors into memory.

Fix:
1. Add top_k: int = 10 parameter to the search method.
2. Clamp top_k to range [1, 100]. Log warning if clamped.
3. Add LIMIT clause to the SQL query: LIMIT top_k * 10 (fetch more than needed to allow
   sorting by similarity, then return only top_k results).
4. After computing similarities, return only the top top_k results.

Create tests/test_rag_engine.py:
- test_search_returns_top_k_results
- test_top_k_clamped_at_100
- test_top_k_clamped_at_1
- test_empty_database_returns_empty
- test_ingest_and_search_roundtrip
- test_duplicate_ingest_idempotent

Use tmp_path for SQLite database. Mock any HTTP calls for embeddings. Run pytest
tests/test_rag_engine.py then pytest to verify.
```

---

#### Phase 13: Fix Global Log Level Mutation in Audit Logger

Finding: P2-09. audit_logger.py calls logging.addLevelName at module import time, modifying
the global logging registry for all loggers in the process.

Files to modify:
- src/codelicious/tools/audit_logger.py (use custom formatter, not global level names)
- tests/test_security_audit.py (extend with regression test)

Intent: As a developer, importing audit_logger must not affect the global logging level-name
registry. Custom formatting must be applied only to the audit logger's own handlers.

Acceptance criteria:
- Module-level logging.addLevelName calls are removed.
- Custom level display is handled by a custom Formatter subclass attached only to the
  audit logger's handlers.
- logging.getLevelName(logging.INFO) returns "INFO" (not any custom value) after importing
  audit_logger.
- Test: after importing audit_logger, logging.getLevelName(logging.INFO) == "INFO".
- Test: audit logger output still shows the desired custom format.
- All existing tests pass.

Claude Code prompt:

```
Read src/codelicious/tools/audit_logger.py completely.

Currently lines 8-10 call logging.addLevelName() at import time, modifying the global
logging registry. This affects ALL loggers in the process including third-party libraries.

Fix:
1. Remove the module-level logging.addLevelName() calls.
2. Create a custom logging.Formatter subclass (AuditFormatter) that overrides format() to
   display the desired level name format.
3. Attach AuditFormatter only to the handlers created by AuditLogger, not globally.
4. Verify that the existing test_security_audit.py tests still pass.

Extend tests/test_security_audit.py:
- test_global_level_names_unchanged: after importing audit_logger, verify
  logging.getLevelName(logging.INFO) == "INFO".
- test_audit_formatter_custom_output: verify the audit handler produces the expected format.

Run pytest tests/test_security_audit.py then pytest to verify.
```

---

#### Phase 14: Fix ensure_draft_pr_exists Missing Argument

Finding: P2-10. claude_engine.py:222 calls git_manager.ensure_draft_pr_exists() with no
arguments, but the method requires spec_summary: str. This is a runtime TypeError.

Files to modify:
- src/codelicious/engines/claude_engine.py (pass spec_summary)
- tests/test_claude_engine.py (extend with regression test)

Intent: As a developer using --push-pr with the Claude engine, the PR creation must not crash
with a TypeError. A meaningful spec summary must be passed.

Acceptance criteria:
- ensure_draft_pr_exists is called with a meaningful summary string (e.g., "Autonomous
  build from codelicious" or derived from the spec being built).
- Test: build with push_pr=True does not raise TypeError on PR creation.
- All existing tests pass.

Claude Code prompt:

```
Read src/codelicious/engines/claude_engine.py completely. Find the call to
ensure_draft_pr_exists (around line 222). It is called with no arguments but the method
signature requires spec_summary: str.

Fix: Pass a meaningful string. Options:
1. Use the spec filename or title if available from the build context.
2. Use a default like "Autonomous build from codelicious".
3. Add spec_summary as a parameter to the build method and thread it through.

Choose the simplest option that provides a useful PR title.

Extend tests/test_claude_engine.py:
- test_push_pr_calls_ensure_draft_with_summary: mock git_manager, verify
  ensure_draft_pr_exists is called with a non-empty string argument.

Run pytest tests/test_claude_engine.py then pytest to verify.
```

---

### Tier 3: Code Quality and Configuration (Phases 15-18)

These phases address infrastructure, dependencies, and code quality.

---

#### Phase 15: Complete pyproject.toml with Dev Dependencies and Tool Configs

Finding: P2-12. pyproject.toml is missing dev dependencies (ruff, pytest-cov, mypy,
pre-commit) and all tool configuration sections.

Files to modify:
- pyproject.toml

Intent: As a developer setting up the project, pip install -e ".[dev]" must install all
tools needed for development: pytest, pytest-cov, ruff, mypy, pre-commit. Tool configs
(ruff, mypy, coverage, pytest) must be centralized in pyproject.toml so they work out of
the box.

Acceptance criteria:
- [project.optional-dependencies] dev group includes: pytest>=7.0, pytest-cov>=4.0,
  ruff>=0.4.0, mypy>=1.10, pre-commit>=3.0.
- [tool.ruff] section with line-length=99, target-version="py310".
- [tool.ruff.lint] section with select=["E", "F", "W", "I", "S", "G", "B", "UP", "RUF"]
  and appropriate ignore list.
- [tool.mypy] section with python_version="3.10", strict=true, warn_return_any=true.
- [tool.coverage.run] section with source=["src/codelicious"], omit=["*/tests/*"].
- [tool.coverage.report] section with fail_under=80.
- [tool.pytest.ini_options] retains testpaths=["tests"] and adds addopts="--strict-markers".
- pip install -e ".[dev]" succeeds.
- ruff check src/ tests/ uses the configured rules.
- All existing tests pass.

Claude Code prompt:

```
Read pyproject.toml completely.

Currently it only has [project.optional-dependencies] test = ["pytest>=7.0"] and
[tool.pytest.ini_options] testpaths = ["tests"]. No ruff, mypy, coverage, or pre-commit
config.

Add the following sections to pyproject.toml:

[project.optional-dependencies]
dev = [
    "pytest>=7.0",
    "pytest-cov>=4.0",
    "ruff>=0.4.0",
    "mypy>=1.10",
    "pre-commit>=3.0",
]

Keep the existing test group as-is for backwards compatibility.

[tool.ruff]
line-length = 99
target-version = "py310"

[tool.ruff.lint]
select = ["E", "F", "W", "I", "B", "UP", "RUF"]
ignore = [
    "E501",   # line too long (handled by formatter)
    "UP007",  # use X | Y for union (requires 3.10+, keep Optional for clarity)
]

[tool.ruff.format]
quote-style = "double"
indent-style = "space"
line-ending = "auto"

[tool.mypy]
python_version = "3.10"
warn_return_any = true
warn_unused_configs = true
disallow_untyped_defs = true

[tool.coverage.run]
source = ["src/codelicious"]
omit = ["*/tests/*"]

[tool.coverage.report]
fail_under = 80
show_missing = true

Update [tool.pytest.ini_options] to add addopts = "--strict-markers".

Run ruff check src/ tests/ and ruff format --check src/ tests/ to verify the new config
works. Fix any new lint violations introduced by the expanded rule set. Run pytest to verify
no regressions.
```

---

#### Phase 16: Convert f-string Logger Calls to Percent-Style

Finding: P3-01. Multiple files use f-strings inside logger calls, bypassing lazy evaluation
and the SanitizingFilter.

Files to modify:
- src/codelicious/llm_client.py
- src/codelicious/loop_controller.py
- src/codelicious/git/git_orchestrator.py
- src/codelicious/agent_runner.py
- src/codelicious/context/cache_engine.py
- src/codelicious/engines/claude_engine.py
- src/codelicious/engines/huggingface_engine.py
- (any other files with f-string logger calls)

Intent: As a developer, all logger calls must use %-style formatting so the SanitizingFilter
can intercept arguments before they are formatted into the message. f-strings are evaluated
eagerly, bypassing the filter and wasting CPU when the log level is disabled.

Acceptance criteria:
- Zero f-string logger calls remain in src/codelicious/.
- All logger calls use %-style: logger.info("message %s", value).
- ruff check with the "G" (flake8-logging-format) rule passes.
- All existing tests pass.

Claude Code prompt:

```
Search all Python files in src/codelicious/ for f-string usage in logger calls. The pattern
to find is: logger.(info|debug|warning|error|critical)(f"

For each match, convert from:
  logger.info(f"Message {value}")
to:
  logger.info("Message %s", value)

For multiple values:
  logger.info(f"A={a}, B={b}")
becomes:
  logger.info("A=%s, B=%s", a, b)

Do NOT change:
- raise statements (f-strings are fine there)
- print statements
- string assignments

After conversion, add "G" to the ruff lint select list in pyproject.toml if not already
there. Run ruff check src/ tests/ --select=G to verify zero violations. Run pytest to
verify no regressions.
```

---

#### Phase 17: Remove Dead Code in loop_controller.py

Finding: P3-02. loop_controller.py BuildLoop duplicates the HuggingFace engine loop and
appears to be unused (not imported anywhere).

Files to modify:
- src/codelicious/loop_controller.py (remove or mark as used)

Intent: As a developer, dead code creates confusion and maintenance burden. If BuildLoop
is not imported or used anywhere in the codebase, it should be removed. If it is used,
the duplication with HuggingFaceEngine should be resolved.

Acceptance criteria:
- If BuildLoop is unused: remove loop_controller.py entirely, remove any imports of it.
- If BuildLoop is used: have HuggingFaceEngine delegate to it (single source of truth).
- No import errors after removal/refactor.
- All existing tests pass.

Claude Code prompt:

```
Search the entire codebase for imports of loop_controller or BuildLoop:
- grep -r "loop_controller" src/ tests/
- grep -r "BuildLoop" src/ tests/

If BuildLoop is not imported anywhere except its own file:
1. Delete src/codelicious/loop_controller.py.
2. Remove any references to it in __init__.py or other files.
3. Verify no import errors: python -c "import codelicious"

If BuildLoop IS imported somewhere:
1. Make HuggingFaceEngine delegate to BuildLoop instead of duplicating the loop logic.
2. Remove the duplicate code from huggingface_engine.py.

Run pytest to verify no regressions.
```

---

#### Phase 18: Fix File Permissions in fs_tools.py Writes

Finding: P3-05. fs_tools.py native_write_file creates files with 0o600 (owner-only) via
mkstemp, but source code files should typically be 0o644.

Files to modify:
- src/codelicious/tools/fs_tools.py (set 0o644 after write)
- tests/test_fs_tools.py (extend from Phase 8)

Intent: As a developer, files written by the LLM agent must have standard permissions (0o644)
so they are readable by all users and processes on the system, matching the behavior of
normal file creation.

Acceptance criteria:
- Files written by native_write_file have permissions 0o644.
- The permission is set via os.fchmod on the fd before closing, or via os.chmod after
  os.replace.
- Test: written file has 0o644 permissions.
- All existing tests pass.

Claude Code prompt:

```
Read src/codelicious/tools/fs_tools.py. Find native_write_file.

Currently mkstemp creates files with 0o600. After os.replace, the file at the target path
has owner-only permissions, which is too restrictive for source code.

Fix: After os.replace(tmp_path, target), call os.chmod(str(target), 0o644).
Or better: call os.fchmod(fd, 0o644) before os.close(fd) so the permission is set before
the file becomes visible at the target path.

Extend tests/test_fs_tools.py:
- test_written_file_has_644_permissions

Use tmp_path. Run pytest tests/test_fs_tools.py then pytest to verify.
```

---

### Tier 4: Test Coverage Expansion (Phases 19-22)

These phases create test files for all untested modules.

---

#### Phase 19: Test Suite for tools/registry.py

Files to create:
- tests/test_registry.py

Intent: As a developer, the tool registry (which dispatches LLM tool calls to functions)
must be tested for correct routing, unknown tool handling, and error propagation.

Acceptance criteria:
- Test: known tool name dispatches to correct function.
- Test: unknown tool name returns error, does not crash.
- Test: tool function that raises returns error message.
- Test: all registered tool names are covered.
- All existing tests pass.

Claude Code prompt:

```
Read src/codelicious/tools/registry.py completely. Understand all registered tools and their
dispatch logic.

Create tests/test_registry.py:
- test_dispatch_known_tool
- test_dispatch_unknown_tool_returns_error
- test_dispatch_tool_exception_returns_error
- test_all_tool_names_registered
- test_dispatch_with_valid_arguments
- test_dispatch_with_missing_arguments

Mock the underlying tool functions (fs_tools, command_runner). No actual file or command
operations. Run pytest tests/test_registry.py then pytest to verify.
```

---

#### Phase 20: Test Suite for config.py

Files to create:
- tests/test_config.py (new file)

Intent: As a developer, the config module must be tested for environment variable parsing,
default values, type coercion, and edge cases.

Acceptance criteria:
- Test: default Config values are correct.
- Test: env var overrides work (HF_TOKEN, CODELICIOUS_ENGINE, etc.).
- Test: boolean parsing works ("true", "1", "yes" all resolve to True).
- Test: invalid engine value raises or falls back to default.
- Test: api_key is masked in repr.
- All existing tests pass.

Claude Code prompt:

```
Read src/codelicious/config.py completely.

Create tests/test_config.py:
- test_default_values
- test_env_var_api_key (mock os.environ)
- test_env_var_engine_override
- test_boolean_parsing_true_values
- test_boolean_parsing_false_values
- test_invalid_engine_handling
- test_config_repr_masks_api_key
- test_build_config_from_namespace (mock argparse.Namespace)
- test_https_endpoint_enforcement (if applicable)

Mock os.environ for all tests. Run pytest tests/test_config.py then pytest to verify.
```

---

#### Phase 21: Test Suite for budget_guard.py

Files to create:
- tests/test_budget_guard.py

Intent: As a developer, the budget guard (which limits LLM call count and estimated cost)
must be tested for correct enforcement, boundary conditions, and reset behavior.

Acceptance criteria:
- Test: budget allows calls under the limit.
- Test: budget rejects calls at the limit.
- Test: budget tracks cumulative cost correctly.
- Test: budget reset clears counters.
- All existing tests pass.

Claude Code prompt:

```
Read src/codelicious/budget_guard.py completely. Understand the budget enforcement logic.

Create tests/test_budget_guard.py:
- test_allows_calls_under_limit
- test_rejects_calls_at_limit
- test_tracks_cumulative_cost
- test_reset_clears_counters
- test_default_limits
- test_custom_limits
- test_concurrent_increments_safe (if thread safety is relevant)

No network calls. Run pytest tests/test_budget_guard.py then pytest to verify.
```

---

#### Phase 22: Test Suite for cli.py and errors.py

Files to create:
- tests/test_cli.py
- tests/test_errors.py

Intent: As a developer, the CLI entry point must be tested for argument parsing, engine
selection, and error handling. The errors module must be tested for exception hierarchy
correctness.

Acceptance criteria:
- Test: --engine auto selects correctly based on environment.
- Test: --dry-run flag sets config.dry_run=True.
- Test: --help does not crash.
- Test: missing repo path produces clear error.
- Test: all 48 exception classes can be instantiated.
- Test: exception hierarchy (inheritance) is correct.
- Test: transient vs permanent error classification works.
- All existing tests pass.

Claude Code prompt:

```
Read src/codelicious/cli.py and src/codelicious/errors.py completely.

Create tests/test_cli.py:
- test_parse_args_defaults
- test_parse_args_engine_override
- test_parse_args_dry_run
- test_parse_args_max_iterations
- test_missing_repo_path_error
- test_engine_auto_selection_claude (mock shutil.which("claude") returning path)
- test_engine_auto_selection_huggingface (mock shutil.which returning None, HF_TOKEN set)

Mock subprocess, shutil.which, and os.environ. No actual CLI invocations.

Create tests/test_errors.py:
- test_all_exceptions_instantiable (iterate through all 48 exception classes)
- test_exception_hierarchy (CodeliciousError is base)
- test_transient_error_classification
- test_permanent_error_classification
- test_exception_messages

Run pytest tests/test_cli.py tests/test_errors.py then pytest to verify.
```

---

### Tier 5: Documentation, Linting, and Final Validation (Phases 23-25)

---

#### Phase 23: Fix All Lint and Format Violations

Files to modify:
- Any files flagged by ruff check and ruff format.

Intent: As a developer, the codebase must pass ruff check and ruff format with zero
violations using the rule set configured in Phase 15.

Acceptance criteria:
- ruff check src/ tests/ returns zero violations.
- ruff format --check src/ tests/ returns zero files needing reformatting.
- ruff check src/ --select=S (security) returns zero violations.
- No functional changes -- only lint/format fixes.
- All existing tests pass.

Claude Code prompt:

```
Run ruff check src/ tests/ with the pyproject.toml config from Phase 15. Fix ALL violations.
For each violation:
1. If it is a real issue (unused import, undefined name, etc.), fix the code.
2. If it is a false positive that cannot be fixed without breaking functionality, add a
   targeted # noqa: XXXX comment with explanation.

Then run ruff format src/ tests/ to auto-format all files.

Then run ruff check src/ tests/ again to verify zero violations.
Then run ruff format --check src/ tests/ to verify zero format issues.
Then run pytest to verify no regressions.

Do NOT add blanket ignores. Each noqa must reference a specific rule code.
```

---

#### Phase 24: Update Documentation (README.md, CLAUDE.md, MEMORY.md)

Files to modify:
- README.md (accuracy audit, update diagrams)
- CLAUDE.md (update commands, add dev setup)
- .claude/projects/-Users-user-Documents-codelicious-v1/memory/MEMORY.md (update index)

Intent: As a developer reading the documentation, every command, file path, and architectural
description must match the actual state of the code after all spec-12 changes. Stale
references must be removed. New capabilities must be documented.

Acceptance criteria:
- README.md Quick Start shows pip install -e ".[dev]" as the recommended install.
- README.md Security Model section reflects all denylist additions from Phase 2.
- README.md CLI Reference includes --no-skip-permissions.
- CLAUDE.md Common Commands section is accurate.
- CLAUDE.md includes "Run dev setup: pip install -e '.[dev]'".
- All Mermaid diagrams render correctly.
- No references to removed files or renamed modules.
- MEMORY.md index is up to date.

Claude Code prompt:

```
Read README.md and CLAUDE.md completely.

Audit both files against the actual codebase state after spec-12 changes:

README.md fixes:
1. Quick Start: change "pip install -e ." to "pip install -e '.[dev]'" for dev setup.
2. Security Model: update command denylist count from "39 dangerous commands" to reflect
   the actual count after Phase 2 additions. Update "20 interpreters" if changed.
3. CLI Reference: add --no-skip-permissions flag documentation.
4. Project Structure: verify all file paths match actual files. Remove any that were deleted
   (e.g., loop_controller.py if removed in Phase 17).
5. Verify all Mermaid diagrams are syntactically correct.

CLAUDE.md fixes:
1. Add "Dev setup: pip install -e '.[dev]'" to Common Commands.
2. Verify all command examples match actual tool configs.
3. Update test count if it changed.

Do NOT add emojis, mdashes, or decorative elements. Keep the tone factual and concise.

Run a quick sanity check: python -c "import codelicious" to verify the package is importable.
```

---

#### Phase 25: Final Verification and State Update

Files to modify:
- .codelicious/STATE.md (update with spec-12 completion status)

Intent: As a developer, after all spec-12 phases are complete, the build state must reflect
the new test count, coverage percentage, and security posture. A full verification pass must
confirm all acceptance criteria are met.

Acceptance criteria:
- pytest passes with 400+ tests, zero failures, zero collection errors.
- pytest --cov=src/codelicious --cov-report=term-missing reports 80%+ coverage.
- ruff check src/ tests/ passes with zero violations.
- ruff format --check src/ tests/ passes.
- STATE.md is updated with: current spec (spec-12), phase (complete), test count, coverage,
  all P1/P2 findings marked resolved.
- BUILD_COMPLETE contains "DONE" if all criteria are met.

Claude Code prompt:

```
Run the full verification suite in this order:

1. pip install -e ".[dev]" (ensure package and dev deps are installed)
2. ruff format src/ tests/ (auto-format)
3. ruff check src/ tests/ --fix (auto-fix lint)
4. ruff check src/ tests/ (verify zero violations remain)
5. ruff format --check src/ tests/ (verify format is clean)
6. pytest --cov=src/codelicious --cov-report=term-missing -v (run all tests with coverage)
7. ruff check src/ --select=S (security-specific check)

Report:
- Total test count
- Coverage percentage
- Any remaining violations
- Any failing tests

Update .codelicious/STATE.md:
- Current Spec: spec-12
- Phase: ALL COMPLETE
- Test count: [actual number]
- Coverage: [actual percentage]
- P1 findings: 0 remaining (list all 8 as resolved)
- P2 findings: 0 remaining (list all 12 as resolved)

If all criteria pass, write "DONE" to .codelicious/BUILD_COMPLETE.
If any criteria fail, document what failed and what remains.
```

---

## 6. Phase Dependencies

Phases within a tier can be executed in parallel. Tiers must be executed in order.

| Tier | Phases | Prerequisite |
|------|--------|--------------|
| 1: Critical Security | 1-8 | None (start here) |
| 2: Reliability | 9-14 | Tier 1 complete |
| 3: Code Quality | 15-18 | Tier 2 complete |
| 4: Test Coverage | 19-22 | Tier 3 complete (need pyproject.toml config) |
| 5: Final Validation | 23-25 | Tier 4 complete |

Within Tier 1, suggested order for minimal merge conflicts:
- Phase 1 (planner.py) and Phase 2 (command_runner.py) can run in parallel.
- Phase 3 (agent_runner.py + config.py + cli.py) depends on nothing in Tier 1.
- Phases 4, 6, 7 all modify git_orchestrator.py -- run sequentially.
- Phase 5 (llm_client.py + config.py) conflicts with Phase 3 on config.py -- run after 3.
- Phase 8 (fs_tools.py) can run in parallel with Phases 1-3.

---

## 7. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Existing tests break during refactoring | Medium | Medium | Run pytest after every phase. Phase isolation minimizes cross-cutting changes. |
| New ruff rules flag hundreds of violations | Medium | Low | Phase 23 handles all lint fixes after functional changes are complete. |
| Coverage target (80%) not reachable in 25 phases | Low | Medium | 19 new test files target the untested 55% of modules. |
| f-string to %-style conversion introduces bugs | Low | Medium | Regex-based conversion with manual review. Tests catch regressions. |
| Removing loop_controller.py breaks an import | Low | High | Phase 17 checks all imports before deletion. |

---

## 8. Findings Summary

### P1 (Critical) -- 8 findings, all addressed

| ID | Finding | Phase |
|----|---------|-------|
| P1-01 | Prompt injection guard advisory-only | Phase 1 |
| P1-02 | Denylist missing interpreter binaries | Phase 2 |
| P1-03 | Unconditional --dangerously-skip-permissions | Phase 3 |
| P1-04 | API key logging exposure risk | Phase 5 |
| P1-05 | git add . stages secrets | Phase 4 |
| P1-06 | git errors silently swallowed | Phase 4 |
| P1-07 | Unsanitized LLM content in PR title | Phase 6 |
| P1-08 | Protected files readable by LLM | Phase 8 |

### P2 (Important) -- 12 findings, all addressed

| ID | Finding | Phase |
|----|---------|-------|
| P2-01 | flush_cache is a no-op stub | Phase 9 |
| P2-02 | TOCTOU on atomic write permissions | Phase 9 |
| P2-03 | max_iterations hardcoded, ignores config | Phase 10 |
| P2-04 | Unbounded LLM response body read | Phase 11 |
| P2-05 | Untyped None defaults in LLMClient | Phase 5 |
| P2-06 | No JSON size cap before parse | Phase 11 |
| P2-07 | Unbounded RAG query loads all chunks | Phase 12 |
| P2-08 | Unvalidated reviewer strings passed to gh | Phase 7 |
| P2-09 | Global log level mutation at import | Phase 13 |
| P2-10 | ensure_draft_pr_exists missing required arg | Phase 14 |
| P2-11 | Provider/model logged at INFO level | Phase 5 |
| P2-12 | pyproject.toml missing dev deps and configs | Phase 15 |

### P3 (Minor) -- 9 findings, all addressed

| ID | Finding | Phase |
|----|---------|-------|
| P3-01 | f-strings in logger calls | Phase 16 |
| P3-02 | Dead code in loop_controller.py | Phase 17 |
| P3-03 | .codelicious dir world-readable | Phase 9 |
| P3-04 | Unbounded file read in fs_tools | Phase 8 |
| P3-05 | Written files have 0o600 permissions | Phase 18 |
| P3-06 | argparse import not under TYPE_CHECKING | Phase 16 |
| P3-07 | 19 modules with zero test coverage | Phases 19-22 |
| P3-08 | elapsed_s=0.0 sentinel in AgentResult | Phase 3 |
| P3-09 | Misleading warnings import in errors.py | Phase 23 |

---

## 9. Test Coverage Target

### Current State (260 tests, 14 files, 11 modules covered)

| Module | Test File | Tests |
|--------|-----------|-------|
| build_logger | test_build_logger.py | ~20 |
| claude_engine | test_claude_engine.py | 4 |
| context_manager | test_context_manager.py | ~20 |
| executor | test_executor.py | ~30 |
| parser | test_parser.py | ~20 |
| progress | test_progress.py | ~15 |
| sandbox | test_sandbox.py | ~46 |
| scaffolder | test_scaffolder.py, test_scaffolder_v9.py | ~30 |
| security_audit | test_security_audit.py | 14 |
| verifier | test_verifier.py | ~57 |
| integration | test_integration_v11.py | ~4 |

### Target State (400+ tests, 25+ files, 30 modules covered)

New test files from this spec:
| Module | Test File | Estimated Tests |
|--------|-----------|-----------------|
| planner | test_planner.py | 5 (Phase 1) |
| command_runner | test_command_runner.py | 13 (Phase 2) |
| agent_runner | test_agent_runner.py | 4 (Phase 3) |
| git_orchestrator | test_git_orchestrator.py | 14 (Phases 4, 6, 7) |
| llm_client | test_llm_client.py | 9 (Phases 5, 11) |
| fs_tools | test_fs_tools.py | 8 (Phases 8, 18) |
| cache_engine | test_cache_engine.py | 5 (Phase 9) |
| _io | test_io.py | 5 (Phase 9) |
| loop_controller | test_loop_controller.py | 4 (Phase 10) |
| rag_engine | test_rag_engine.py | 6 (Phase 12) |
| registry | test_registry.py | 6 (Phase 19) |
| config | test_config.py | 9 (Phase 20) |
| budget_guard | test_budget_guard.py | 7 (Phase 21) |
| cli | test_cli.py | 7 (Phase 22) |
| errors | test_errors.py | 5 (Phase 22) |

Estimated new tests: ~107
Estimated total: ~367 (existing may grow during regression additions)
Target: 400+ (remaining gap covered by edge case tests added during Tier 5 lint pass)

---

## 10. Sample Data and Fixtures

### Existing Fixtures (tests/fixtures/)

- sample_spec.md, sample_spec_v11.md -- valid spec files
- malformed_spec.md, minimal_spec.md -- edge case specs
- sample_plan_v11.json -- valid plan JSON
- sample_llm_responses/ -- LLM response fixtures (4 files)
- sample_state.json, corrupted_state.json -- state fixtures

### New Fixtures Needed

| Fixture | Purpose | Phase |
|---------|---------|-------|
| injection_spec.md | Spec with IGNORE PREVIOUS INSTRUCTIONS | Phase 1 |
| config_valid.json | Valid config for schema tests | Phase 20 |
| config_invalid.json | Invalid config for error tests | Phase 20 |
| llm_response_oversized.txt | 51MB response for cap test | Phase 11 |
| git_status_output.txt | Mocked git status output | Phase 4 |
| reviewer_strings.json | Valid and invalid reviewer names | Phase 7 |

---

## 11. Quick Install and Verification

For a developer setting up the project from scratch after spec-12:

```
git clone https://github.com/clay-good/codelicious.git
cd codelicious
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
pre-commit install
pytest --cov=src/codelicious --cov-report=term-missing
ruff check src/ tests/
ruff format --check src/ tests/
```

Expected output after spec-12 completion:
- pytest: 400+ tests passed, 80%+ coverage
- ruff check: 0 violations
- ruff format: 0 files need formatting
