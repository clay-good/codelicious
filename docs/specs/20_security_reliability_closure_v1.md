---
version: 1.0.0
status: Draft
date: 2026-03-21
author: Claude Opus 4.6 (spec generation), Clay Good (review)
depends_on: ["19_code_quality_hardening_v1.md", "18_operational_resilience_v1.md", "17_security_quality_hardening_v1.md", "16_reliability_test_coverage_v1.md"]
related_specs: ["00_master_spec.md", "07_sandbox_security_hardening.md", "15_parallel_agentic_loops_v1.md"]
supersedes: []
---

# spec-20: Security Closure, Reliability Hardening, and MVP Certification

## 1. Executive Summary

After 19 prior specifications, the codelicious codebase has 588 passing tests, zero lint violations,
a 9-layer security model, dual-engine architecture, and comprehensive spec-driven documentation.
However, a fresh deep audit on 2026-03-21 reveals a distinct category of findings that prior specs
either deferred, missed, or introduced as side effects of earlier fixes. These findings span five
domains: (1) new security vulnerabilities not covered by specs 16-17, (2) reliability gaps in git
orchestration and build cleanup, (3) thread safety holes in shared state, (4) dead or misleading
configuration paths, and (5) test coverage for previously untestable attack surfaces.

This spec addresses 38 specific findings across 12 categories:

- SSRF via unvalidated LLM endpoint URL (1 finding, llm_client.py)
- Unsafe git staging that commits secrets with warning-only guard (1 finding, git_orchestrator.py)
- Unconditional --dangerously-skip-permissions on Claude CLI subprocess (1 finding, agent_runner.py)
- Prompt injection via unsanitized spec_filter in agent prompts (1 finding, claude_engine.py + prompts.py)
- World-readable SQLite database with no path validation (1 finding, rag_engine.py)
- Git orchestrator input validation gaps (2 findings, git_orchestrator.py)
- Directory listing sandbox escape via os.walk (1 finding, fs_tools.py)
- Verify command argument denylist bypass (1 finding, verifier.py)
- Missing rate limiting and backoff on LLM HTTP calls (2 findings, huggingface_engine.py + llm_client.py)
- Thread safety gaps in BudgetGuard and audit logger (2 findings)
- Build cleanup symlink attack and timestamp mismatch (2 findings, build_logger.py)
- Atomic write utility missing sandbox guard (1 finding, _io.py)
- Multiline string tracker fragility in security scanner (1 finding, verifier.py)
- Intent classifier fail-open semantics (1 finding, planner.py)
- Regex ReDoS in markdown parser (1 finding, executor.py)
- Credential redaction timing gap in log formatter (1 finding, logger.py)
- Dead configuration key creating false sense of security (1 finding, loop_controller.py)
- Markdown table corruption in build summary (1 finding, verifier.py)
- Coverage timeout not configurable (1 finding, verifier.py)
- Silent event drops after build session close (1 finding, build_logger.py)
- Duplicate sensitive-file check doubling subprocess calls (1 finding, git_orchestrator.py)
- Comprehensive test coverage for all new fixes (38 findings, 120+ new tests)
- Sample dummy data generation for edge case testing (1 deliverable)
- Full documentation update cycle (README, STATE.md, CLAUDE.md, memory)

This spec does not introduce new features. Every phase fixes a real, measured gap in the existing
codebase that would cause data exfiltration, secret exposure, silent corruption, or degraded
reliability under production conditions.

### Motivation

Specs 16-17 defined a registry of P1/P2 findings based on the audit snapshot from 2026-03-19. Since
then, a fresh independent audit on 2026-03-21 has uncovered 5 new P1-critical findings and 11 new
P2-important findings that were not in the original registry. These fall into two categories:

First, architectural blind spots that earlier audits did not examine. The SSRF vector in
llm_client.py, the unconditional --dangerously-skip-permissions flag, and the git-add-dot secret
staging issue were not flagged because prior audits focused on the sandbox, verifier, and command
runner modules. This spec widens the audit perimeter to cover the full module set.

Second, interaction effects between modules. The atomic_write_text utility in _io.py was introduced
to fix TOCTOU races in the sandbox, but it has no sandbox guard of its own, meaning callers outside
the sandbox (like scaffolder.py) can write to arbitrary paths. The build_logger cleanup function
uses shutil.rmtree on paths that could be symlinks. These are emergent risks from composing safe
primitives in unsafe ways.

The intent of this spec is to close every remaining finding to zero, add comprehensive tests for
each fix, generate sample dummy data for edge case validation, and update all documentation so the
codebase reaches a certifiable MVP state.

### Codebase Metrics (Measured 2026-03-21, Post-Spec-16 Phase 2)

| Metric | Current Value | Target After This Spec |
|--------|---------------|------------------------|
| Source modules | 30 in src/codelicious/ | 30 (no new modules) |
| Source lines | ~8,800 | ~9,600 (+800 net for fixes, guards, and tests) |
| Passing tests | 588 | 720+ (+132 for new finding coverage and edge cases) |
| New P1 critical findings (this audit) | 5 | 0 |
| New P2 important findings (this audit) | 11 | 0 |
| New P3 minor findings (this audit) | 10 | 0 |
| Prior P1/P2 from specs 16-17 | 17 open | 17 open (unchanged, specs 16-17 own these) |
| Thread safety gaps | 2 (BudgetGuard, audit_logger) | 0 |
| Secret staging risk | git add . with warning-only | git add . blocked, explicit paths required |
| Runtime dependencies | 0 (stdlib only) | 0 (unchanged) |
| Sample test data fixtures | 0 | 15+ parameterized edge case data sets |

### Relationship to Specs 16, 17, 18, and 19

Specs 16-17 own the original P1/P2 finding registry (P1-2 through P2-NEW-2). This spec does not
duplicate or supersede those fixes. Instead, it addresses findings from a 2026-03-21 audit that
are distinct from the 16-17 registry. The finding IDs in this spec use the prefix "S20-" to avoid
collision with the existing P1/P2 numbering.

Spec 18 owns operational resilience (signal handling, retries, startup validation, cumulative
timeouts). This spec addresses rate limiting and backoff specifically in the LLM HTTP path, which
spec 18 deferred as a non-goal.

Spec 19 owns code quality, developer experience, and documentation drift. This spec addresses
security-relevant documentation updates (the --dangerously-skip-permissions flag, secret staging
behavior, and SSRF mitigation) but does not overlap with spec 19's error message or type hint work.

The only shared files are:
- llm_client.py (spec-18 adds retry logic; this spec adds endpoint URL validation, which runs
  before any retry logic)
- verifier.py (spec-17 Phase 8 fixes subprocess groups; spec-19 Phase 4 fixes edge cases; this
  spec fixes the multiline string tracker and coverage timeout, different code paths)
- build_logger.py (spec-19 Phase 3 fixes resource cleanup; this spec fixes cleanup symlink attack
  and timestamp mismatch, different functions)
- git_orchestrator.py (spec-17 Phase 8 fixes push timeout; this spec fixes secret staging and
  newline injection, different functions)
- logger.py (spec-19 Phase 14 fixes permissions; this spec fixes the redaction timing gap in the
  filter, different class)

In all cases the changes are additive and target different code paths within the same files.

### Logic Breakdown (Post-Spec-20)

| Category | Estimated Lines | Percentage | Description |
|----------|-----------------|------------|-------------|
| Deterministic safety harness | ~4,500 | 47% | sandbox, verifier, command_runner, fs_tools, audit_logger, security_constants, config validation, endpoint validation, git staging guard |
| Probabilistic LLM-driven | ~3,600 | 37% | planner (with fail-closed semantics), executor (with ReDoS-safe regex), llm_client (with backoff), agent_runner, loop_controller, prompts, context_manager, rag_engine, engines |
| Shared infrastructure | ~1,500 | 16% | cli, logger (with redaction fix), cache_engine, tools/registry, config, errors, git_orchestrator, build_logger (with cleanup fix), progress, _io (with sandbox guard) |

The deterministic safety harness grows as endpoint validation, git staging guards, thread locks,
and sandbox path checks are added. The probabilistic layer shrinks proportionally as unsafe patterns
(fail-open classifier, ReDoS regex) are replaced with safe equivalents.

---

## 2. Scope and Non-Goals

### In Scope

1. Validate LLM endpoint URLs against HTTPS-only and deny RFC-1918 private address ranges in
   llm_client.py.
2. Replace git add . with explicit file staging and convert the sensitive-file warning to a hard
   abort in git_orchestrator.py.
3. Remove --dangerously-skip-permissions from agent_runner.py and configure Claude CLI permissions
   through the settings.json allowlist already scaffolded by the project.
4. Sanitize spec_filter to safe path characters before prompt rendering in claude_engine.py.
5. Set 0o600 permissions on the SQLite database and validate the resolved path is within the
   project directory in rag_engine.py.
6. Strip newlines from file paths before passing to git add in git_orchestrator.py.
7. Validate each path yielded by os.walk against the sandbox boundary in fs_tools.py.
8. Apply the command denylist to all arguments (not just the binary name) in verifier.py
   check_custom_command.
9. Add exponential backoff with jitter for LLM HTTP retries in huggingface_engine.py and honour
   the retry_after_s field from LLMRateLimitError.
10. Add threading.Lock to BudgetGuard for thread-safe counter updates.
11. Add fcntl.flock or threading.Lock to audit_logger.py for cross-thread write safety.
12. Fix build_logger.py cleanup to resolve symlinks before rmtree and fix the uppercase/lowercase
    Z timestamp mismatch.
13. Add a project_root parameter to atomic_write_text in _io.py and validate target paths.
14. Replace the line-counting multiline string tracker in verifier.py check_security with
    tokenize-based string boundary detection.
15. Change classify_intent in planner.py to fail closed on all non-parsing exceptions.
16. Replace the ReDoS-vulnerable markdown regex in executor.py with a line-by-line parser.
17. Override SanitizingFilter in logger.py to also sanitize the final formatted log message.
18. Remove the dead allowlisted_commands config key from loop_controller.py or wire it into
    CommandRunner with validation.
19. Escape pipe characters in markdown table values in verifier.py write_build_summary.
20. Add a configurable timeout parameter to check_coverage in verifier.py.
21. Log a warning when emit() is called on a closed BuildSession in build_logger.py.
22. Remove the duplicate _check_staged_files_for_sensitive_patterns call in git_orchestrator.py.
23. Write 120+ new tests covering every fix in this spec.
24. Generate 15+ sample dummy data fixtures for edge case testing.
25. Update README.md, STATE.md, CLAUDE.md, and memory files to reflect final state.

### Non-Goals

- New features, new CLI flags, new engine backends, or new tool implementations.
- Fixes already owned by specs 16-17 (original P1/P2 registry).
- Operational resilience patterns owned by spec 18 (signal handling, cumulative timeouts, startup
  validation of git/claude/pytest binaries).
- Code quality and developer experience owned by spec 19 (error messages, type hints, dependency
  pinning, CI workflow gaps, dry-run purity).
- Async/await rewrite or architectural changes.
- Performance optimization beyond fixing the tight retry loop.
- License selection or open-source release preparation.

---

## 3. Definitions

| Term | Meaning |
|------|---------|
| SSRF | Server-Side Request Forgery: an attack where the application is tricked into making HTTP requests to unintended internal or external destinations |
| RFC-1918 | Private IPv4 address ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16) that should not be reachable from user-facing HTTP clients |
| Fail closed | A security design where ambiguous or unexpected conditions result in denying the action rather than permitting it |
| Fail open | The opposite: ambiguous conditions result in permitting the action, which is unsafe for security-critical decisions |
| ReDoS | Regular Expression Denial of Service: a crafted input that causes a regex engine to enter catastrophic backtracking, consuming CPU indefinitely |
| TOCTOU | Time-of-Check-to-Time-of-Use: a race condition where the state checked (e.g., "is this a symlink?") changes before the state is used (e.g., "write to this path") |
| Exponential backoff | A retry strategy where the delay between retries doubles each time (e.g., 1s, 2s, 4s, 8s) to avoid overwhelming a failing service |
| Jitter | Random variation added to backoff delays to prevent synchronized retry storms from multiple clients |
| Process group | A Unix mechanism where a parent process and all its children share a group ID, allowing signals to be sent to the entire group at once |

---

## 4. Acceptance Criteria (Global)

All of the following must be true after all phases of this spec are complete:

1. All 588 existing tests continue to pass with zero regressions.
2. At least 120 new tests are added, bringing the total to 720+.
3. Zero S20-P1 findings remain open.
4. Zero S20-P2 findings remain open.
5. Zero S20-P3 findings remain open.
6. LLM endpoint URL validation rejects HTTP, localhost, and RFC-1918 addresses.
7. git add . is never called; all staging uses explicit file paths.
8. --dangerously-skip-permissions does not appear in any subprocess command.
9. BudgetGuard and AuditLogger are thread-safe under concurrent access.
10. Build cleanup cannot be tricked into deleting arbitrary directories via symlinks.
11. atomic_write_text validates target paths against a project root.
12. The security scanner correctly handles multiline strings using Python tokenize.
13. classify_intent fails closed on all non-parsing exceptions.
14. No regex in the codebase is susceptible to catastrophic backtracking.
15. Lint (ruff check) and format (ruff format --check) pass with zero violations.
16. No new runtime dependencies are introduced.
17. 15+ sample dummy data fixtures exist in tests/fixtures/ for edge case testing.
18. README.md, STATE.md, and CLAUDE.md are updated to reflect the post-spec-20 state.

---

## 5. Security Findings Registry (S20 Audit, 2026-03-21)

### S20-P1: Critical Findings

| ID | Location | Description | Resolved In |
|----|----------|-------------|-------------|
| S20-P1-1 | llm_client.py:45 | SSRF via unvalidated LLM_ENDPOINT env var; sends API key to arbitrary URL | Phase 1 |
| S20-P1-2 | git_orchestrator.py:146 | git add . stages secrets; sensitive-file check is warning-only, does not abort | Phase 2 |
| S20-P1-3 | agent_runner.py:87 | --dangerously-skip-permissions passed unconditionally to Claude CLI subprocess | Phase 3 |
| S20-P1-4 | claude_engine.py:104, prompts.py:225 | Prompt injection via unsanitized spec_filter rendered into agent prompt | Phase 4 |
| S20-P1-5 | rag_engine.py:36-48 | SQLite database created with world-readable permissions, no path sandbox check | Phase 5 |

### S20-P2: Important Findings

| ID | Location | Description | Resolved In |
|----|----------|-------------|-------------|
| S20-P2-1 | git_orchestrator.py:115 | Newline in filename splits staged path into two git add arguments | Phase 2 |
| S20-P2-2 | fs_tools.py:75-123 | os.walk output paths not validated against sandbox boundary | Phase 6 |
| S20-P2-3 | verifier.py:771-858 | verify_command denylist only checks binary name, not arguments | Phase 7 |
| S20-P2-4 | huggingface_engine.py:93-102 | No backoff on LLM errors; 50 rapid retries in tight loop | Phase 8 |
| S20-P2-5 | budget_guard.py:68-111 | BudgetGuard counters not protected by lock; data race under threads | Phase 9 |
| S20-P2-6 | huggingface_engine.py:93-102 | LLMRateLimitError.retry_after_s field ignored; immediate retry | Phase 8 |
| S20-P2-7 | git_orchestrator.py:147,150 | Duplicate _check_staged_files call doubles subprocess invocations | Phase 2 |
| S20-P2-8 | verifier.py:682-705 | Multiline string tracker uses line.count(delim) % 2 heuristic; false positives and negatives | Phase 10 |
| S20-P2-9 | build_logger.py:78-87 | shutil.rmtree on symlink-vulnerable path in cleanup_old_builds | Phase 11 |
| S20-P2-10 | _io.py:14-52 | atomic_write_text has no sandbox/path guard; scaffolder can write anywhere | Phase 12 |
| S20-P2-11 | audit_logger.py:101-108 | Audit log writes without file lock; interleaved output under concurrency | Phase 9 |

### S20-P3: Minor Findings

| ID | Location | Description | Resolved In |
|----|----------|-------------|-------------|
| S20-P3-1 | planner.py:254-262 | classify_intent fails open on non-network exceptions (e.g., KeyError) | Phase 13 |
| S20-P3-2 | executor.py:254 | Markdown regex susceptible to ReDoS on pathological backtick input | Phase 14 |
| S20-P3-3 | logger.py:102-116 | SanitizingFilter does not redact the final formatted log message | Phase 15 |
| S20-P3-4 | loop_controller.py:90-96 | Dead allowlisted_commands config key creates false sense of security | Phase 16 |
| S20-P3-5 | executor.py:86 | Path normalization .. check comment implies security guard but is not definitive | Phase 14 |
| S20-P3-6 | build_logger.py:68-74,113 | endswith("z") never matches generated "Z" suffix; cleanup never runs | Phase 11 |
| S20-P3-7 | verifier.py:1022-1024 | Markdown table values not pipe-escaped; corrupts build summary output | Phase 17 |
| S20-P3-8 | verifier.py:261-278 | check_coverage hard-codes 180s timeout, ignoring configurable pattern | Phase 17 |
| S20-P3-9 | build_logger.py:184-195 | Events silently dropped after close() with no warning logged | Phase 11 |
| S20-P3-10 | parser.py | No maximum spec file size or binary content rejection | Phase 18 |

---

## 6. Intent and Expected Behavior

This section describes the expected behavior of the system from the perspective of three user
personas: the developer running codelicious, the operator monitoring it in CI/CD, and the security
auditor reviewing it.

### As a developer running codelicious against my repo:

- When I set LLM_ENDPOINT to a URL, I expect codelicious to reject HTTP URLs, localhost, and
  private IP addresses with a clear error message explaining that only HTTPS endpoints on public
  addresses are permitted.
- When codelicious stages files for commit, I expect it to never use git add . and to abort the
  commit if any file matches a sensitive pattern (.env, private keys, credentials), rather than
  logging a warning and proceeding.
- When I pass --spec with a path containing special characters, I expect those characters to be
  sanitized before being rendered into any LLM prompt, preventing prompt injection.
- When I run codelicious with the HuggingFace engine and the API returns a rate limit error, I
  expect codelicious to wait the specified retry_after_s duration before retrying, not hammer the
  endpoint 50 times in a tight loop.
- When I use --dry-run, I expect zero filesystem side effects: no directories created, no files
  written, no SQLite databases opened.

### As an operator running codelicious in CI/CD:

- When multiple codelicious instances run against the same repo concurrently, I expect the audit
  log to contain non-interleaved, correctly ordered entries.
- When the build session is closed, I expect any subsequent emit() calls to log a warning rather
  than silently dropping events, so I can diagnose late-arriving events.
- When old build sessions are cleaned up, I expect codelicious to verify that the cleanup target
  is not a symlink before calling rmtree, preventing directory traversal attacks.
- When the budget guard tracks API costs across threads, I expect the counters to be accurate
  (no lost increments due to data races).

### As a security auditor reviewing the codebase:

- I expect the Claude CLI subprocess to not use --dangerously-skip-permissions. If the project
  needs specific permissions, they should be configured through the settings.json allowlist.
- I expect the SQLite database for RAG embeddings to be created with 0o600 permissions and its
  path to be validated within the project directory.
- I expect the security scanner to correctly identify eval/exec calls inside multiline strings
  (not produce false negatives due to a fragile line-counting heuristic).
- I expect the intent classifier to fail closed on unexpected exceptions (not fail open and
  allow a potentially malicious spec to proceed).
- I expect no regex in the codebase to be susceptible to catastrophic backtracking on crafted
  input.

---

## 7. Quick Install and Verification

```
# Clone and install
git clone https://github.com/clay-good/codelicious.git
cd codelicious
pip install -e ".[dev]"

# Run the full verification suite
pytest tests/ -v                      # All tests pass
ruff check src/ tests/                # Zero lint violations
ruff format --check src/ tests/       # All formatted
bandit -r src/ -ll                    # No high/critical findings
pip-audit                             # No known vulnerabilities

# Run only spec-20 tests
pytest tests/ -v -k "s20 or spec20"

# Verify specific fixes
pytest tests/test_llm_client.py -v -k "ssrf or endpoint_validation"
pytest tests/test_git_orchestrator.py -v -k "staging or sensitive"
pytest tests/test_agent_runner.py -v -k "permissions or dangerously"
pytest tests/test_budget_guard.py -v -k "thread_safe"
pytest tests/test_build_logger.py -v -k "symlink or cleanup"
```

---

## 8. Implementation Phases

### Phase 1: SSRF Prevention in LLM Client (S20-P1-1)

**Files:** src/codelicious/llm_client.py, tests/test_llm_client.py

**Problem:** The LLM_ENDPOINT environment variable is used as-is to construct HTTP requests. The
API key is sent as a Bearer token to whatever URL is provided. An attacker who controls the
environment variable (or a misconfigured CI pipeline that leaks it) can redirect API traffic to an
internal service, exfiltrating the API key and any prompt data.

**Fix:**
- Add a _validate_endpoint_url(url: str) function that:
  - Rejects non-HTTPS schemes (http://, ftp://, file://)
  - Parses the hostname and resolves it to an IP address
  - Rejects RFC-1918 private ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16)
  - Rejects loopback (127.0.0.0/8, ::1)
  - Rejects link-local (169.254.0.0/16)
  - Allows an explicit allowlist of known-good base URLs as a constant
- Call _validate_endpoint_url in the LLMClient constructor before storing self.endpoint_url
- Raise ConfigurationError with a clear message on validation failure

**Tests (8 new):**
- test_rejects_http_scheme
- test_rejects_ftp_scheme
- test_rejects_file_scheme
- test_rejects_localhost
- test_rejects_private_10_range
- test_rejects_private_172_range
- test_rejects_private_192_range
- test_accepts_valid_https_endpoint

**Claude Code Prompt:**

```
Read src/codelicious/llm_client.py fully. Add a _validate_endpoint_url(url: str) -> str function
at module level that:
1. Parses the URL with urllib.parse.urlparse
2. Rejects any scheme other than "https" by raising ConfigurationError
3. Resolves the hostname to an IP address using socket.getaddrinfo
4. Checks the IP against ipaddress.ip_address() and rejects:
   - ipaddress.is_private (covers 10.x, 172.16-31.x, 192.168.x)
   - ipaddress.is_loopback (127.x, ::1)
   - ipaddress.is_link_local (169.254.x)
5. Returns the validated URL string
6. Call this function in LLMClient.__init__ before assigning self.endpoint_url
7. Import ConfigurationError from codelicious.errors

Then read tests/test_llm_client.py and add 8 new test functions covering each rejection case
and the happy path. Use @pytest.mark.parametrize for the private IP range tests. Run pytest to
verify all tests pass. Run ruff check and ruff format.
```

---

### Phase 2: Git Staging Safety (S20-P1-2, S20-P2-1, S20-P2-7)

**Files:** src/codelicious/git/git_orchestrator.py, tests/test_git_orchestrator.py

**Problem:** Three related issues in the git orchestrator:
1. When files_to_stage is None, the code runs git add . which stages every file in the working
   tree, including .env files, private keys, and credentials. The sensitive-file check that
   follows only logs a warning but does not abort.
2. File paths from git diff output are split on newlines and passed to git add. A filename
   containing a newline character would be split into two arguments.
3. The _check_staged_files_for_sensitive_patterns function is called twice per commit when
   files_to_stage is falsy (once after git add . on line ~147, again unconditionally on line ~150).

**Fix:**
- Replace git add . with git add -u (only stage tracked files, never new untracked files)
- When files_to_stage is explicitly provided, validate each path: strip newlines, reject paths
  containing newline characters by raising GitOperationError
- Change _check_staged_files_for_sensitive_patterns to raise GitOperationError instead of
  logging a warning when a sensitive file is detected
- Add .pem, .key, .p12, .pfx, .netrc, and aws/credentials to SENSITIVE_PATTERNS
- Remove the duplicate call so the function is invoked exactly once after staging is complete

**Tests (12 new):**
- test_staging_uses_git_add_u_not_dot
- test_staging_explicit_files_strips_newlines
- test_staging_rejects_newline_in_filename
- test_sensitive_file_aborts_commit (for .env)
- test_sensitive_file_aborts_commit_pem
- test_sensitive_file_aborts_commit_key
- test_sensitive_file_aborts_commit_netrc
- test_sensitive_check_called_once_not_twice
- test_staging_explicit_files_happy_path
- test_staging_no_sensitive_files_proceeds
- test_sensitive_patterns_list_completeness
- test_commit_with_clean_staged_files_succeeds

**Claude Code Prompt:**

```
Read src/codelicious/git/git_orchestrator.py fully. Find the commit_verified_changes method.
Make these changes:

1. Replace "git add ." with "git add -u" in the branch where files_to_stage is falsy.
2. When files_to_stage is provided, add validation: for each path, if "\n" in path, raise
   GitOperationError(f"Filename contains newline character: {repr(path)}")
3. Find _check_staged_files_for_sensitive_patterns. Change the warning log + continue to
   raise GitOperationError(f"Refusing to commit sensitive file: {matched_file}")
4. Add these patterns to SENSITIVE_PATTERNS if not present: ".pem", ".key", ".p12", ".pfx",
   ".netrc", "aws/credentials"
5. Remove the duplicate call to _check_staged_files_for_sensitive_patterns so it runs exactly
   once, after all staging is complete.

Then read tests/test_git_orchestrator.py and add 12 new tests covering each fix. Mock
subprocess.run to capture the git commands issued. Verify that git add . never appears, that
git add -u is used, that newline filenames raise, that sensitive files raise, and that the
check runs exactly once. Run pytest, ruff check, ruff format.
```

---

### Phase 3: Remove --dangerously-skip-permissions (S20-P1-3)

**Files:** src/codelicious/agent_runner.py, src/codelicious/scaffolder.py, tests/test_agent_runner.py

**Problem:** Every Claude CLI subprocess is launched with --dangerously-skip-permissions, which
disables all permission guardrails. This means the agent has unrestricted access to the filesystem,
network, and shell, regardless of the permissions configured in settings.json.

**Fix:**
- Remove --dangerously-skip-permissions from the command list in agent_runner.py
- Verify that scaffolder.py already writes a settings.json with an appropriate allowlist of
  permitted tools and paths. If not, add the necessary permissions to the scaffolded settings.json
  so the Claude CLI can still perform its build tasks without the dangerous flag.
- Add a constant FORBIDDEN_CLI_FLAGS = frozenset(["--dangerously-skip-permissions"]) and assert
  that no command list contains any of these flags before subprocess execution.

**Tests (6 new):**
- test_command_does_not_contain_dangerously_skip_permissions
- test_forbidden_flag_assertion_raises
- test_scaffolded_settings_has_permissions
- test_agent_subprocess_command_structure
- test_settings_json_allows_required_tools
- test_settings_json_denies_dangerous_operations

**Claude Code Prompt:**

```
Read src/codelicious/agent_runner.py fully. Find where --dangerously-skip-permissions is added
to the subprocess command list. Remove it.

Add a module-level constant:
FORBIDDEN_CLI_FLAGS = frozenset(["--dangerously-skip-permissions"])

Add a validation step before subprocess.Popen (or subprocess.run) that checks:
for flag in FORBIDDEN_CLI_FLAGS:
    if flag in cmd:
        raise SecurityViolationError(f"Forbidden CLI flag: {flag}")

Then read src/codelicious/scaffolder.py. Verify that the settings.json written by scaffold()
includes an allowlist of permissions for the Claude CLI (file read/write within repo, command
execution for pytest/ruff/git). If the settings.json does not have permissions configured, add
them so the Claude CLI can operate without the dangerous flag.

Then read tests/test_agent_runner.py (create if needed) and add 6 tests. Mock subprocess to
capture commands. Verify the flag is absent, the assertion works, and the settings.json has
correct permissions. Run pytest, ruff check, ruff format.
```

---

### Phase 4: Prompt Injection Sanitization (S20-P1-4)

**Files:** src/codelicious/engines/claude_engine.py, src/codelicious/prompts.py, tests/test_claude_engine.py

**Problem:** The spec_filter CLI argument is rendered directly into the agent prompt via string
substitution. A value like "spec.md\n\nIGNORE PREVIOUS INSTRUCTIONS" would be injected verbatim.
The prompt injection scanner in planner.py does not run on agent prompts.

**Fix:**
- Add a _sanitize_spec_filter(value: str) -> str function that strips all characters except
  alphanumeric, forward slash, hyphen, underscore, period, and space
- Call this function before rendering spec_filter into any prompt template
- Add a length limit (256 characters) to prevent prompt bloat
- Apply the planner's _check_injection patterns to all rendered prompts, not just spec text

**Tests (8 new):**
- test_spec_filter_strips_newlines
- test_spec_filter_strips_shell_metacharacters
- test_spec_filter_allows_normal_path
- test_spec_filter_length_limit
- test_spec_filter_empty_string
- test_spec_filter_unicode_stripped
- test_rendered_prompt_does_not_contain_injection
- test_injection_check_runs_on_agent_prompts

**Claude Code Prompt:**

```
Read src/codelicious/engines/claude_engine.py fully. Find where spec_filter is used in prompt
rendering (look for render() calls or string formatting with spec_filter).

Add a module-level function:
import re
_SAFE_PATH_RE = re.compile(r"[^a-zA-Z0-9/_.\- ]")

def _sanitize_spec_filter(value: str) -> str:
    sanitized = _SAFE_PATH_RE.sub("", value)
    return sanitized[:256]

Call _sanitize_spec_filter(spec_filter) before passing it to any prompt render() call.

Then read src/codelicious/prompts.py. If there is a render() function, verify it does not do
eval() or exec(). If it uses str.format() or %, verify the sanitized input cannot break template
syntax.

Then read tests/test_claude_engine.py (create if needed) and add 8 tests covering each
sanitization case. Use parameterized inputs including newlines, semicolons, backticks, long
strings, empty strings, and unicode. Run pytest, ruff check, ruff format.
```

---

### Phase 5: SQLite Database Permissions and Path Validation (S20-P1-5)

**Files:** src/codelicious/context/rag_engine.py, tests/test_rag_engine.py

**Problem:** The SQLite database at .codelicious/db.sqlite3 is created with default permissions
(potentially world-readable). The database path is derived from repo_path with no validation that
the resolved path is within the project directory.

**Fix:**
- After creating the database file, set permissions to 0o600 using os.chmod
- Before connecting, resolve the database path and verify it starts with the resolved repo_path
- If the resolved path is outside the repo, raise SandboxViolationError
- Add a check for symlinks at the .codelicious/ directory level

**Tests (6 new):**
- test_database_permissions_are_0600
- test_database_path_within_repo
- test_database_path_outside_repo_raises
- test_database_symlink_rejected
- test_database_created_in_codelicious_dir
- test_database_close_flushes_wal

**Claude Code Prompt:**

```
Read src/codelicious/context/rag_engine.py fully. Find where the SQLite connection is created
(look for sqlite3.connect or similar).

Add path validation before the connect call:
1. resolved_db = Path(db_path).resolve()
2. resolved_repo = Path(repo_path).resolve()
3. if not str(resolved_db).startswith(str(resolved_repo) + os.sep):
       raise SandboxViolationError(f"Database path outside project: {resolved_db}")
4. if resolved_db.is_symlink() or resolved_db.parent.is_symlink():
       raise SandboxViolationError("Database path contains symlink")

After the database is created (first connect or first write), add:
os.chmod(str(resolved_db), 0o600)

Import SandboxViolationError from codelicious.errors.

Then read tests/test_rag_engine.py and add 6 tests. Use tmp_path fixtures to create repos with
symlinks and paths outside the repo. Run pytest, ruff check, ruff format.
```

---

### Phase 6: Directory Listing Sandbox Enforcement (S20-P2-2)

**Files:** src/codelicious/tools/fs_tools.py, tests/test_fs_tools.py

**Problem:** native_list_directory validates the entry point against the sandbox but then calls
os.walk and includes all yielded paths without verifying each one. A symlink inside the directory
tree could expose paths outside the sandbox boundary.

**Fix:**
- Set followlinks=False explicitly on os.walk
- For each path yielded by os.walk, resolve it and verify it starts with the resolved repo_path
- Skip any path that resolves outside the sandbox with a debug log
- Add a maximum depth parameter (default 10) and maximum entry count (default 5000)

**Tests (8 new):**
- test_walk_followlinks_false
- test_walk_path_outside_sandbox_skipped
- test_walk_symlink_not_followed
- test_walk_depth_limit_enforced
- test_walk_entry_count_limit_enforced
- test_walk_normal_directory_succeeds
- test_walk_empty_directory_returns_empty
- test_walk_nested_directories

**Claude Code Prompt:**

```
Read src/codelicious/tools/fs_tools.py fully. Find the native_list_directory function.

Modify the os.walk call to explicitly pass followlinks=False.

Add depth and entry count tracking:
1. max_depth = 10, max_entries = 5000
2. Track current depth by counting os.sep in the relative path from the root
3. If depth > max_depth, skip (do not descend)
4. Track total entries; if > max_entries, stop walking

For each file_path and dir_path yielded by os.walk:
1. resolved = Path(item).resolve()
2. if not str(resolved).startswith(str(self.repo_path.resolve()) + os.sep): continue

Then read tests/test_fs_tools.py and add 8 tests. Use tmp_path to create directory trees with
symlinks pointing outside the tree, deeply nested directories, and large entry counts. Run
pytest, ruff check, ruff format.
```

---

### Phase 7: Verify Command Denylist Argument Checking (S20-P2-3)

**Files:** src/codelicious/verifier.py, tests/test_verifier.py

**Problem:** check_custom_command applies the DENIED_COMMANDS denylist only to the basename of the
binary (args[0]). Arguments that are themselves executables or scripts (e.g., make -f /tmp/evil.mk)
pass through unchecked.

**Fix:**
- After checking args[0] against the denylist, also check all subsequent arguments:
  - Reject any argument that matches a denied command name (e.g., "python3" as an argument)
  - Reject any argument containing path separators that ends with a denied command name
  - Reject arguments matching common script extensions (.sh, .bash, .py, .rb, .pl) from
    untrusted paths (outside the repo directory)
- Add the checks as a helper function _validate_command_args(args, repo_path)

**Tests (8 new):**
- test_denylist_rejects_python_as_argument
- test_denylist_rejects_bash_script_argument
- test_denylist_allows_safe_arguments
- test_denylist_rejects_denied_command_in_path
- test_denylist_allows_repo_internal_scripts
- test_denylist_rejects_external_scripts
- test_denylist_checks_all_arguments_not_just_first
- test_verify_command_with_safe_make_target

**Claude Code Prompt:**

```
Read src/codelicious/verifier.py fully. Find the check_custom_command function (or wherever
the DENIED_COMMANDS denylist is applied to verify commands).

Add a helper function _validate_command_args(args: list[str], repo_path: Path) -> None that:
1. For each arg in args[1:]:
   a. Extract basename: os.path.basename(arg)
   b. If basename (without extension) is in DENIED_COMMANDS, raise VerificationError
   c. If arg contains "/" and ends with .sh/.bash/.py/.rb/.pl:
      - Resolve the path
      - If it does not start with str(repo_path.resolve()), raise VerificationError
2. Call this function after the existing binary name check

Then read tests/test_verifier.py and add 8 tests using parameterized inputs. Test that
"make -f evil.mk" is caught if evil.mk is outside repo, that "pytest --co" is allowed, that
"echo python3" is caught. Run pytest, ruff check, ruff format.
```

---

### Phase 8: LLM Rate Limiting and Exponential Backoff (S20-P2-4, S20-P2-6)

**Files:** src/codelicious/engines/huggingface_engine.py, tests/test_huggingface_engine.py (create if needed)

**Problem:** The HuggingFace engine catches all exceptions in its agentic loop and immediately
retries by appending an error message to history. There is no delay between retries. The
LLMRateLimitError exception carries a retry_after_s field that is never read.

**Fix:**
- In the main agentic loop, catch LLMRateLimitError separately from other exceptions
- When catching LLMRateLimitError, sleep for e.retry_after_s (capped at 60 seconds)
- For other transient errors (ConnectionError, TimeoutError, URLError), implement exponential
  backoff: base_delay * 2^consecutive_failures + random jitter (0 to 1 second)
- Cap maximum backoff at 30 seconds
- Cap consecutive failures at 5 before raising and aborting the loop
- Log each retry with the delay duration at WARNING level

**Tests (10 new):**
- test_rate_limit_sleeps_for_retry_after
- test_rate_limit_caps_at_60_seconds
- test_transient_error_exponential_backoff
- test_backoff_caps_at_30_seconds
- test_consecutive_failures_abort_at_5
- test_success_resets_failure_counter
- test_non_transient_error_raises_immediately
- test_backoff_includes_jitter
- test_retry_logs_warning_with_delay
- test_normal_iteration_no_delay

**Claude Code Prompt:**

```
Read src/codelicious/engines/huggingface_engine.py fully. Find the main agentic loop (the
while/for loop that calls the LLM and dispatches tools).

Refactor the exception handling:
1. Import LLMRateLimitError from codelicious.errors
2. Import time, random
3. Add a consecutive_failures counter initialized to 0 before the loop
4. In the try/except block:
   a. On success: reset consecutive_failures = 0
   b. Catch LLMRateLimitError as e:
      - delay = min(e.retry_after_s, 60)
      - logger.warning("Rate limited, sleeping %.1fs", delay)
      - time.sleep(delay)
      - continue
   c. Catch (ConnectionError, TimeoutError, OSError) as e:
      - consecutive_failures += 1
      - if consecutive_failures >= 5: raise
      - delay = min(2.0 * (2 ** consecutive_failures) + random.uniform(0, 1), 30)
      - logger.warning("Transient error, retry in %.1fs: %s", delay, e)
      - time.sleep(delay)
      - Append error message to history
      - continue
   d. Catch other Exception as e: raise (do not retry)

Then create tests/test_huggingface_engine.py (or add to existing). Add 10 tests. Mock
time.sleep and LLMClient to control exceptions. Verify sleep durations, failure counting,
and abort behavior. Run pytest, ruff check, ruff format.
```

---

### Phase 9: Thread Safety for BudgetGuard and AuditLogger (S20-P2-5, S20-P2-11)

**Files:** src/codelicious/budget_guard.py, src/codelicious/tools/audit_logger.py, tests/test_budget_guard.py (create if needed), tests/test_audit_logger.py (create if needed)

**Problem:** BudgetGuard._calls_made and _estimated_cost_usd are plain numeric fields with no
lock protection. Under concurrent access from multiple LoopWorker threads, increments can be lost.
Similarly, audit_logger.py opens the log file in append mode for every write without a threading
lock, which can cause interleaved output for large entries.

**Fix:**
- BudgetGuard: Add a threading.Lock. Acquire it in both record() and check().
- AuditLogger: Add a threading.Lock around the file write in _write_to_file. Acquire it before
  opening the file and release after closing. This ensures atomic writes from the application's
  perspective.

**Tests (10 new):**
- test_budget_guard_thread_safe_increment (spawn 10 threads, each calling record 100 times)
- test_budget_guard_thread_safe_check
- test_budget_guard_lock_exists
- test_budget_guard_no_lost_increments
- test_budget_guard_concurrent_check_and_record
- test_audit_logger_thread_safe_write (spawn 10 threads, each writing 50 entries)
- test_audit_logger_lock_exists
- test_audit_logger_no_interleaved_output
- test_audit_logger_concurrent_write_ordering
- test_audit_logger_large_entry_atomicity

**Claude Code Prompt:**

```
Read src/codelicious/budget_guard.py fully. Add:
1. import threading at the top
2. In __init__, add: self._lock = threading.Lock()
3. In record(), wrap the counter updates with: with self._lock:
4. In check(), wrap the reads with: with self._lock:

Then read src/codelicious/tools/audit_logger.py fully. Add:
1. import threading at the top (if not present)
2. In __init__, add: self._write_lock = threading.Lock()
3. In _write_to_file, wrap the file open/write/close with: with self._write_lock:

Then create tests/test_budget_guard.py and add 5 tests using concurrent.futures.ThreadPoolExecutor
to verify thread safety. Each test should spawn 10 threads that concurrently call record() and
check(), then verify the final counters equal the expected sum.

Then create tests/test_audit_logger.py (or add to existing) and add 5 tests using ThreadPoolExecutor
to verify concurrent writes produce non-interleaved output. Read the resulting log file and verify
each line is a complete JSON entry. Run pytest, ruff check, ruff format.
```

---

### Phase 10: Multiline String Tracker Replacement (S20-P2-8)

**Files:** src/codelicious/verifier.py, tests/test_verifier.py

**Problem:** The security scanner's multiline string tracker uses line.count(delim) % 2 == 1 to
detect entry/exit of triple-quoted strings. This fails for lines containing an even number of
triple-quote pairs and does not handle cases where both triple-double-quotes and triple-single-quotes
appear on the same line.

**Fix:**
- Replace the line-counting heuristic with Python's tokenize module
- Use tokenize.generate_tokens on the file content to identify all STRING tokens
- Build a set of (start_line, end_line) ranges for all string tokens
- When scanning for dangerous patterns (eval, exec, etc.), skip lines that fall within a string
  token range
- Fall back to the heuristic only if tokenize raises a TokenError (e.g., on syntactically invalid
  Python)

**Tests (8 new):**
- test_scanner_skips_eval_inside_docstring
- test_scanner_catches_eval_outside_docstring
- test_scanner_handles_double_triple_quotes_on_one_line
- test_scanner_handles_mixed_quote_styles
- test_scanner_handles_f_string_with_eval
- test_scanner_fallback_on_invalid_syntax
- test_scanner_multiline_string_spanning_many_lines
- test_scanner_raw_string_with_dangerous_pattern

**Claude Code Prompt:**

```
Read src/codelicious/verifier.py fully. Find the check_security function and its multiline
string tracking logic (look for triple-quote detection, delim counting, or in_multiline_string).

Replace the heuristic with tokenize-based detection:
1. import tokenize, io at the top
2. Add a helper function _get_string_line_ranges(source: str) -> set[int]:
   a. Use tokenize.generate_tokens(io.StringIO(source).readline)
   b. For each token with type == tokenize.STRING:
      - Add all lines from token.start[0] to token.end[0] to the set
   c. Catch tokenize.TokenError and return an empty set (fall back to no exclusions)
   d. Return the set of line numbers that are inside strings
3. In check_security, call _get_string_line_ranges on the file content
4. When checking each line for dangerous patterns, skip if line_number is in the string ranges

Then read tests/test_verifier.py and add 8 tests. Create Python source strings with:
- eval() inside a docstring (should not be flagged)
- eval() outside a docstring (should be flagged)
- A line with two sets of triple-double-quotes (the old heuristic would fail)
- Mixed quote styles on the same line
- f-strings containing eval-like text
- Syntactically invalid Python (tokenize fallback)
Run pytest, ruff check, ruff format.
```

---

### Phase 11: Build Logger Cleanup Safety (S20-P2-9, S20-P3-6, S20-P3-9)

**Files:** src/codelicious/build_logger.py, tests/test_build_logger.py

**Problem:** Three related issues:
1. cleanup_old_builds calls shutil.rmtree on directories that could be symlinks, enabling an
   attacker to delete arbitrary directories.
2. The timestamp check uses endswith("z") (lowercase) but session IDs are generated with an
   uppercase "Z" suffix, so cleanup never actually runs.
3. emit() called after close() silently drops events with no warning.

**Fix:**
- In cleanup_old_builds: resolve each session_dir path, verify it starts with builds_dir, and
  skip symlinks with session_dir.is_symlink()
- Fix the endswith check to use "Z" (uppercase) to match the generation format
- In emit(): if the session is closed, log a warning with the event type before returning

**Tests (8 new):**
- test_cleanup_skips_symlinks
- test_cleanup_validates_path_within_builds_dir
- test_cleanup_timestamp_case_matches_generation
- test_cleanup_actually_removes_old_sessions
- test_cleanup_preserves_recent_sessions
- test_emit_after_close_logs_warning
- test_emit_after_close_does_not_write
- test_session_close_is_idempotent

**Claude Code Prompt:**

```
Read src/codelicious/build_logger.py fully. Find cleanup_old_builds.

Fix 1 - Symlink safety:
Before calling shutil.rmtree(session_dir):
1. if session_dir.is_symlink(): logger.warning("Skipping symlink: %s", session_dir); continue
2. resolved = session_dir.resolve()
3. if not str(resolved).startswith(str(builds_dir.resolve())): continue

Fix 2 - Timestamp case:
Find the endswith("z") check. Change it to endswith("Z") to match the strftime format that
generates the suffix.

Fix 3 - emit after close:
Find the emit() method. Where it checks if the session is closed and returns early, add:
logger.warning("Event dropped: session closed, event_type=%s", event.get("type", "unknown"))

Then read tests/test_build_logger.py and add 8 tests. Use tmp_path to create session directories,
symlinks, and old/recent sessions. Verify cleanup behavior. Test emit() after close() by
capturing log output. Run pytest, ruff check, ruff format.
```

---

### Phase 12: Atomic Write Path Validation (S20-P2-10)

**Files:** src/codelicious/_io.py, tests/test_io.py (create if needed)

**Problem:** atomic_write_text creates parent directories and writes files to arbitrary paths.
Callers outside the sandbox (like scaffolder.py) can write to any location on the filesystem.
The function also sets file permissions to 0o644 (world-readable), which is inappropriate for
security-sensitive files like settings.json.

**Fix:**
- Add an optional project_root parameter to atomic_write_text
- When project_root is provided, resolve both target and project_root and verify target is within
  the project root
- Change default permissions to 0o644 but add a permissions parameter so callers can specify 0o600
  for sensitive files
- Update scaffolder.py to pass project_root and use 0o600 for settings.json

**Tests (8 new):**
- test_write_within_project_root_succeeds
- test_write_outside_project_root_raises
- test_write_with_symlink_target_raises
- test_write_default_permissions_0644
- test_write_sensitive_permissions_0600
- test_write_without_project_root_allows_any_path (backward compat)
- test_write_creates_parent_directories
- test_write_atomic_replace_not_truncate

**Claude Code Prompt:**

```
Read src/codelicious/_io.py fully. Find atomic_write_text.

Add parameters:
def atomic_write_text(target: Path, content: str, *, project_root: Path | None = None,
                      permissions: int = 0o644) -> None:

At the start of the function, before mkdir:
1. if project_root is not None:
       resolved_target = Path(target).resolve()
       resolved_root = Path(project_root).resolve()
       if not str(resolved_target).startswith(str(resolved_root) + os.sep):
           raise SandboxViolationError(f"Write target outside project: {resolved_target}")
       if resolved_target.is_symlink():
           raise SandboxViolationError(f"Write target is symlink: {resolved_target}")

2. Replace the hardcoded os.chmod(target, 0o644) with os.chmod(target, permissions)

Then read src/codelicious/scaffolder.py. Find calls to atomic_write_text. Add project_root=
self.project_root (or equivalent) to each call. For settings.json specifically, pass
permissions=0o600.

Then create tests/test_io.py and add 8 tests using tmp_path. Test path validation, symlink
rejection, permissions, and backward compatibility. Run pytest, ruff check, ruff format.
```

---

### Phase 13: Intent Classifier Fail-Closed Semantics (S20-P3-1)

**Files:** src/codelicious/planner.py, tests/test_planner.py (create if needed)

**Problem:** classify_intent fails closed only for OSError, ConnectionError, and TimeoutError. Any
other exception (KeyError, json.JSONDecodeError, ValueError, AttributeError, or programming errors)
causes the build to proceed with the potentially malicious spec.

**Fix:**
- Invert the exception handling: fail closed by default, fail open only for explicitly listed
  parsing exceptions
- The only exceptions that should fail open are when the LLM response is received but cannot be
  parsed into a classification (json.JSONDecodeError on the response body, KeyError for a missing
  classification field)
- All other exceptions (including unexpected ones) should fail closed

**Tests (6 new):**
- test_classify_fails_closed_on_key_error
- test_classify_fails_closed_on_attribute_error
- test_classify_fails_closed_on_value_error
- test_classify_fails_open_on_json_decode_error (response parsing)
- test_classify_fails_closed_on_runtime_error
- test_classify_succeeds_on_safe_spec

**Claude Code Prompt:**

```
Read src/codelicious/planner.py fully. Find classify_intent or the function that determines
whether a spec is safe or malicious.

Refactor the exception handling to fail closed by default:
1. Wrap the LLM call and response parsing in try/except
2. Inner try: parse the LLM response JSON and extract the classification
   - Catch json.JSONDecodeError: log warning, return "safe" (fail open -- we got a response
     but could not parse the classification field)
3. Outer try: the LLM API call itself
   - Catch Exception (catch-all): log error, return "malicious" (fail closed)
   This means ConnectionError, KeyError, AttributeError, RuntimeError, and any other unexpected
   exception all result in blocking the spec.

Add a comment explaining the fail-closed rationale.

Then create tests/test_planner.py (or add to existing) and add 6 tests. Mock the LLM client
to raise various exceptions. Verify fail-closed vs fail-open behavior. Run pytest, ruff check,
ruff format.
```

---

### Phase 14: ReDoS-Safe Markdown Parsing (S20-P3-2, S20-P3-5)

**Files:** src/codelicious/executor.py, tests/test_executor.py

**Problem:** The regex pattern for parsing markdown code blocks with filenames uses .*? with
re.DOTALL, which can cause quadratic backtracking on pathological input (many nested backtick
sequences). The path normalization function's .. check is sound but the comment implies it is a
security guard rather than an early filter.

**Fix:**
- Replace the regex-based markdown parser (_parse_markdown_with_filename) with a line-by-line
  state machine that scans for opening/closing triple-backtick fences
- This eliminates all backtracking risk and is more readable
- Update the .. check comment to clarify that the sandbox is the definitive guard

**Tests (8 new):**
- test_parse_normal_code_block
- test_parse_multiple_code_blocks
- test_parse_nested_backticks_no_hang (the ReDoS case)
- test_parse_empty_code_block
- test_parse_code_block_with_language
- test_parse_code_block_with_filename
- test_parse_large_input_completes_in_time (timeout 5 seconds on 2MB input)
- test_path_normalization_comment_accuracy

**Claude Code Prompt:**

```
Read src/codelicious/executor.py fully. Find the _parse_markdown_with_filename function (or
the regex that matches code blocks with filenames).

Replace the regex with a line-by-line parser:
def _parse_markdown_with_filename(text: str) -> list[tuple[str, str]]:
    results = []
    current_filename = None
    current_lines = []
    in_block = False
    for line in text.split("\n"):
        if not in_block and line.startswith("```"):
            # Extract filename from the opening fence
            header = line[3:].strip()
            parts = header.split(None, 1)
            if len(parts) >= 1 and ("/" in parts[-1] or "." in parts[-1]):
                current_filename = parts[-1] if len(parts) == 1 else parts[1]
            elif len(parts) == 2:
                current_filename = parts[1]
            else:
                current_filename = None
            current_lines = []
            in_block = True
        elif in_block and line.startswith("```"):
            if current_filename:
                results.append((current_filename, "\n".join(current_lines)))
            in_block = False
            current_filename = None
        elif in_block:
            current_lines.append(line)
    return results

Also find the .. path normalization check. Update its comment to:
# Early filter for path traversal. The sandbox's resolve_path() is the definitive guard.

Then read tests/test_executor.py and add 8 tests. Include a test with 2MB of nested backticks
that must complete in under 5 seconds (use pytest timeout or time.time() check). Run pytest,
ruff check, ruff format.
```

---

### Phase 15: Credential Redaction Timing Fix (S20-P3-3)

**Files:** src/codelicious/logger.py, tests/test_security_audit.py

**Problem:** SanitizingFilter.filter() redacts record.msg and record.args independently, but
Python's logging formats them as record.msg % record.args after the filter runs. A secret that
appears only in a format argument could survive into the final formatted message.

**Fix:**
- After sanitizing record.msg and record.args, also format the message early by calling
  record.getMessage(), sanitize the result, and replace record.msg with the sanitized formatted
  string while clearing record.args
- This ensures the final output is always redacted regardless of how the logging framework
  processes the record

**Tests (6 new):**
- test_secret_in_format_arg_is_redacted
- test_secret_in_msg_is_redacted
- test_secret_spanning_msg_and_args_is_redacted
- test_non_secret_format_args_preserved
- test_integer_format_args_not_corrupted
- test_empty_args_handled

**Claude Code Prompt:**

```
Read src/codelicious/logger.py fully. Find the SanitizingFilter class and its filter() method.

At the end of the filter() method, before returning True, add:
1. Try to format the message early:
   try:
       formatted = record.getMessage()
       sanitized_formatted = sanitize_message(formatted)
       record.msg = sanitized_formatted
       record.args = None
   except Exception:
       pass  # If formatting fails, the individual sanitization is still in place

This ensures the final formatted message is always sanitized.

Then read tests/test_security_audit.py and add 6 tests. Create log records with secrets in
format arguments (e.g., logger.info("Key: %s", "sk-ant-secret123")) and verify the output
contains "REDACTED" not the secret. Run pytest, ruff check, ruff format.
```

---

### Phase 16: Dead Configuration Removal (S20-P3-4)

**Files:** src/codelicious/loop_controller.py, tests/test_loop_controller.py

**Problem:** The config.json schema includes allowlisted_commands, but CommandRunner ignores this
key entirely and uses its own hardcoded DENIED_COMMANDS. The config key creates a false sense of
security: an operator might add commands to the allowlist expecting them to be permitted, when in
reality the denylist always wins.

**Fix:**
- Remove the allowlisted_commands key from the config.json schema/template
- If the config is loaded and contains allowlisted_commands, log a deprecation warning explaining
  that command restrictions are hardcoded in security_constants.py
- Update any config.json documentation or templates to remove the key

**Tests (4 new):**
- test_config_without_allowlisted_commands_loads
- test_config_with_allowlisted_commands_logs_deprecation_warning
- test_command_runner_ignores_config_allowlist
- test_config_template_does_not_contain_allowlisted_commands

**Claude Code Prompt:**

```
Read src/codelicious/loop_controller.py fully. Find where config.json is loaded and where
allowlisted_commands is read.

1. If allowlisted_commands is read from the config, remove the code that reads it.
2. Add a deprecation check: if the loaded config dict contains "allowlisted_commands":
   logger.warning("Config key 'allowlisted_commands' is deprecated and ignored. "
                   "Command restrictions are hardcoded in security_constants.py.")
3. If there is a config template or schema definition that includes allowlisted_commands,
   remove it.

Then read tests/test_loop_controller.py and add 4 tests. Test that the config loads without
the key, that a deprecation warning is logged when the key is present, and that CommandRunner
behavior is unaffected. Run pytest, ruff check, ruff format.
```

---

### Phase 17: Build Summary and Coverage Fixes (S20-P3-7, S20-P3-8)

**Files:** src/codelicious/verifier.py, tests/test_verifier.py

**Problem:** Two minor issues in the verifier:
1. write_build_summary writes task titles and error messages into a Markdown table without
   escaping pipe characters, which corrupts the table structure.
2. check_coverage hard-codes a 180-second timeout instead of accepting a configurable parameter.

**Fix:**
- Add a _escape_markdown_cell(value: str) -> str helper that replaces | with the escaped form
  and strips newlines
- Apply this helper to all values written into markdown table cells
- Add a timeout parameter to check_coverage with a default of 180

**Tests (6 new):**
- test_build_summary_escapes_pipe_in_title
- test_build_summary_escapes_pipe_in_error
- test_build_summary_handles_newline_in_cell
- test_coverage_timeout_default_180
- test_coverage_timeout_custom_value
- test_coverage_timeout_used_in_subprocess

**Claude Code Prompt:**

```
Read src/codelicious/verifier.py fully. Find write_build_summary and check_coverage.

For write_build_summary:
1. Add a helper at module level:
   def _escape_markdown_cell(value: str) -> str:
       return value.replace("|", "\\|").replace("\n", " ")
2. Apply _escape_markdown_cell() to every value written into a markdown table cell in
   write_build_summary.

For check_coverage:
1. Add timeout: int = 180 to the function signature
2. Use the timeout parameter in the subprocess.run call instead of the hardcoded 180

Then read tests/test_verifier.py and add 6 tests. Test that pipe characters are escaped, that
newlines are removed, that the default timeout is 180, and that a custom timeout is respected.
Run pytest, ruff check, ruff format.
```

---

### Phase 18: Spec Parser Input Validation (S20-P3-10)

**Files:** src/codelicious/parser.py, tests/test_parser.py

**Problem:** The spec parser does not enforce a maximum file size or reject binary content. A
maliciously large spec file could cause excessive memory allocation, and binary content could
inject control characters into LLM prompts.

**Fix:**
- Add a maximum spec file size constant (default 1 MB, matching the sandbox limit)
- Check file size before reading; raise SpecParseError if exceeded
- After reading, verify the content is valid UTF-8; raise SpecParseError on UnicodeDecodeError
- Strip null bytes from the content after reading

**Tests (6 new):**
- test_parser_rejects_oversized_spec
- test_parser_rejects_binary_content
- test_parser_strips_null_bytes
- test_parser_accepts_valid_utf8
- test_parser_accepts_unicode_content
- test_parser_size_limit_configurable

**Claude Code Prompt:**

```
Read src/codelicious/parser.py fully. Find the function that reads and parses a spec file
(likely parse_spec or similar).

At the start of the function, before reading the file:
1. MAX_SPEC_SIZE = 1_048_576  # 1 MB
2. file_size = Path(spec_path).stat().st_size
3. if file_size > MAX_SPEC_SIZE:
       raise SpecParseError(f"Spec file too large: {file_size} bytes (max {MAX_SPEC_SIZE})")

After reading the file content:
4. if not isinstance(content, str):
       content = content.decode("utf-8")  # Will raise UnicodeDecodeError on binary
5. content = content.replace("\x00", "")  # Strip null bytes

Wrap the decode in try/except UnicodeDecodeError and raise SpecParseError.

Then read tests/test_parser.py and add 6 tests using tmp_path to create spec files of various
sizes and content types. Run pytest, ruff check, ruff format.
```

---

### Phase 19: Sample Dummy Data and Edge Case Fixtures

**Files:** tests/fixtures/ (new directory), tests/conftest.py

**Problem:** The existing test fixtures only exercise happy paths. There are no parameterized
edge case data sets for boundary conditions like empty inputs, malformed JSON, unicode filenames,
circular dependencies, oversized content, or special characters in paths.

**Fix:**
- Create a tests/fixtures/ directory with sample data files
- Add 15+ fixture data sets covering the following edge cases:
  - Empty spec file (0 bytes)
  - Spec file at exactly the size limit (1 MB)
  - Spec file with only YAML frontmatter (no body)
  - Spec with circular task dependencies (A depends on B depends on A)
  - Malformed JSON LLM response (missing keys, extra fields, wrong types)
  - LLM response with no code blocks
  - LLM response with nested/malformed code blocks
  - Filename with unicode characters
  - Filename with spaces and special characters
  - Git diff output with newlines in filenames
  - Config with deprecated allowlisted_commands key
  - SQLite database path containing symlink
  - Endpoint URL with private IP address
  - Endpoint URL with HTTP scheme
  - Commit message with pipe characters and newlines
- Update conftest.py with pytest fixtures that load these data sets
- Add parameterized test markers so edge cases can be run selectively

**Tests:** Fixtures are used by tests in all prior phases. This phase creates the shared data.

**Claude Code Prompt:**

```
Create the directory tests/fixtures/ if it does not exist. Create these fixture files:

1. tests/fixtures/empty_spec.md - empty file (0 bytes)
2. tests/fixtures/frontmatter_only_spec.md - YAML frontmatter with no body:
   ---
   version: 1.0.0
   status: Draft
   ---
3. tests/fixtures/circular_deps.json - JSON plan with circular dependencies:
   {"tasks": [{"id": "a", "title": "Task A", "depends_on": ["b"]},
              {"id": "b", "title": "Task B", "depends_on": ["a"]}]}
4. tests/fixtures/malformed_llm_response.json - JSON missing required keys:
   {"choices": [{"message": {}}]}
5. tests/fixtures/no_code_blocks_response.txt - LLM response with no code blocks:
   "I have analyzed the codebase and found no changes needed."
6. tests/fixtures/nested_backticks_response.txt - response with nested backtick sequences
   (use 2MB of backtick-heavy content for ReDoS testing -- generate this programmatically in
   conftest.py instead of a static file)
7. tests/fixtures/unicode_filename_response.txt - LLM response with unicode filename
8. tests/fixtures/private_ip_endpoints.json - list of invalid endpoint URLs
9. tests/fixtures/sensitive_filenames.json - list of filenames that should trigger the
   sensitive file check
10. tests/fixtures/sample_spec.md - a well-formed spec for happy-path testing

Then read tests/conftest.py and add pytest fixtures that load these files:
@pytest.fixture
def empty_spec(tmp_path):
    ...

Use @pytest.fixture(params=[...]) for parameterized edge cases.
Run pytest, ruff check, ruff format.
```

---

### Phase 20: Documentation Update Cycle

**Files:** README.md, .codelicious/STATE.md, CLAUDE.md, memory files

**Problem:** Documentation must reflect the post-spec-20 state. The README needs new Mermaid
diagrams for the spec-20 security fixes. STATE.md needs updated finding counts and verification
results. CLAUDE.md rules may need updates for new constraints (no git add ., no
--dangerously-skip-permissions).

**Fix:**
- Update STATE.md with:
  - Current spec: spec-20
  - S20-P1/P2/P3 findings resolved
  - Updated test count
  - Updated verification results
- Update CLAUDE.md with any new rules introduced by this spec
- Add Mermaid diagrams to README.md (see Phase 21)
- Update memory files with current project state

**Claude Code Prompt:**

```
Read .codelicious/STATE.md fully. Update it to reflect spec-20 completion:
1. Current spec: spec-20 (all phases complete)
2. S20 findings: 5 P1, 11 P2, 10 P3 -- all resolved
3. Test count: 720+
4. Verification: all passing

Read CLAUDE.md. Add rules if needed:
- "Never use git add . -- always stage files explicitly"
- "Never pass --dangerously-skip-permissions to Claude CLI"
- "All LLM endpoint URLs must be validated for HTTPS and non-private IP"

Update any stale information in CLAUDE.md to match current state.

Read the memory MEMORY.md file. If the project_codelicious.md memory exists, update it to
reflect the spec-20 state. If not, note that memory should be updated.
```

---

### Phase 21: Mermaid Diagrams for README.md

**Files:** README.md

This phase adds Mermaid diagrams to the end of README.md (before the License section) documenting
the spec-20 security improvements.

**Diagrams to add:**

1. S20 Finding Resolution Flow: Flowchart showing all 26 findings flowing through 18 phases to
   reach zero open findings.

2. Git Staging Safety Model: Sequence diagram showing the before (git add . with warning) and
   after (explicit staging with hard abort) behavior.

3. LLM Endpoint Validation Pipeline: Flowchart showing URL parsing, scheme check, DNS resolution,
   IP classification, and accept/reject outcomes.

4. Thread Safety Model (Updated): Block diagram showing all lock-protected resources including
   the new BudgetGuard and AuditLogger locks.

5. Credential Redaction Pipeline (Updated): Flowchart showing the two-stage sanitization (args
   first, then formatted message).

**Claude Code Prompt:**

```
Read README.md fully. Find the section before "## Zero Dependencies" or "## License" where
Mermaid diagrams are placed.

Add these diagrams:

### Spec-20 Security Finding Resolution Flow

[Mermaid flowchart showing S20-P1-1 through S20-P3-10 flowing through Phases 1-18 to
"Zero S20 Findings"]

### Spec-20 Git Staging Safety (Before and After)

[Mermaid sequence diagram showing the old git-add-dot-with-warning flow and the new
explicit-staging-with-abort flow]

### Spec-20 LLM Endpoint Validation

[Mermaid flowchart: URL -> Parse -> HTTPS? -> Resolve DNS -> Private IP? -> Accept/Reject]

### Spec-20 Thread Safety Model (Updated)

[Mermaid block diagram adding BudgetGuard(Lock) and AuditLogger(Lock) to the existing
thread safety diagram]

### Spec-20 Credential Redaction Pipeline (Updated)

[Mermaid flowchart showing: record.msg -> sanitize -> record.args -> sanitize ->
getMessage() -> sanitize -> final output]

Place these before the "Zero Dependencies" section. Do not remove existing diagrams.
Run ruff check, ruff format to verify no issues.
```

---

### Phase 22: Final Verification and Certification

**Files:** All modified files

**Verification checklist:**
- Run pytest tests/ -v and confirm 720+ tests passing
- Run ruff check src/ tests/ and confirm zero violations
- Run ruff format --check src/ tests/ and confirm all formatted
- Run bandit -r src/ -ll and confirm no high/critical findings
- Run pip-audit and confirm no known vulnerabilities
- Verify no new runtime dependencies in pyproject.toml
- Verify all S20-P1, S20-P2, S20-P3 findings have corresponding tests
- Verify README.md Mermaid diagrams render correctly
- Verify STATE.md reflects final state
- Verify CLAUDE.md rules are up to date

**Claude Code Prompt:**

```
Run the full verification suite:

1. pytest tests/ -v --tb=short
2. ruff check src/ tests/
3. ruff format --check src/ tests/
4. bandit -r src/ -ll
5. pip-audit

If any check fails, fix the issue and re-run. Do not proceed until all checks pass.

Then verify documentation:
1. Read STATE.md and confirm it shows spec-20 complete with 720+ tests
2. Read CLAUDE.md and confirm it has the new rules
3. Count the total number of test functions: grep -r "def test_" tests/ | wc -l

Write "DONE" to .codelicious/BUILD_COMPLETE when all checks pass.
```

---

## 9. Risk Assessment

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| Removing --dangerously-skip-permissions breaks Claude CLI builds | HIGH | MEDIUM | Phase 3 verifies scaffolded settings.json has equivalent permissions |
| Replacing git add . breaks existing workflows | MEDIUM | LOW | git add -u covers tracked files; new files require explicit staging |
| tokenize-based string tracker has different behavior on edge cases | MEDIUM | LOW | Phase 10 includes fallback to heuristic on TokenError |
| Endpoint URL validation blocks legitimate private deployments | MEDIUM | MEDIUM | Document how to add URLs to the allowlist constant |
| Exponential backoff increases build time on flaky networks | LOW | MEDIUM | Cap at 30s per retry, 5 max retries |

---

## 10. Spec-20 Logic Breakdown Summary

### Deterministic vs Probabilistic Composition

| Category | Pre-Spec-20 Lines | Post-Spec-20 Lines | Change | Description |
|----------|-------------------|---------------------|--------|-------------|
| Deterministic safety harness | ~4,200 | ~4,500 | +300 | Endpoint validation, git staging guard, thread locks, sandbox path checks, tokenize-based scanner, input validation |
| Probabilistic LLM-driven | ~3,600 | ~3,600 | 0 | No changes to LLM coordination logic; only safety wrappers around the edges |
| Shared infrastructure | ~1,500 | ~1,500 | 0 | Logger fix and config cleanup are net-neutral in line count |
| Test code | ~5,864 | ~7,200 | +1,336 | 120+ new tests across 18 phases plus 15+ fixture data sets |

### Percentage Breakdown (Post-Spec-20)

| Category | Percentage |
|----------|------------|
| Deterministic safety harness | 47% |
| Probabilistic LLM-driven | 37% |
| Shared infrastructure | 16% |

The deterministic safety harness continues to grow as a proportion of the codebase. This is the
correct trajectory for a tool that executes LLM-generated code: the probabilistic layer should
be tightly wrapped in deterministic validation at every boundary.

---

## 11. Phase Dependency Graph

Phases 1 through 5 (P1 critical fixes) must be implemented sequentially in order because each
one touches a different security boundary and must be verified independently.

Phases 6 through 12 (P2 important fixes) can be implemented in parallel as they modify different
modules with no shared code paths.

Phases 13 through 18 (P3 minor fixes and fixtures) can be implemented in parallel.

Phases 19 and 20 (documentation and fixtures) depend on all prior phases being complete.

Phase 21 (Mermaid diagrams) depends on Phase 20.

Phase 22 (final verification) depends on all prior phases.

```
Phase 1 -> Phase 2 -> Phase 3 -> Phase 4 -> Phase 5
                                                |
                                                v
                    Phase 6, 7, 8, 9, 10, 11, 12 (parallel)
                                                |
                                                v
                    Phase 13, 14, 15, 16, 17, 18 (parallel)
                                                |
                                                v
                              Phase 19 -> Phase 20 -> Phase 21 -> Phase 22
```
