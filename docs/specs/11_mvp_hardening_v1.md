---
version: 1.0.0
status: Complete
date: 2026-03-16
author: Claude Opus 4.6 (spec generation), Clay Good (review)
depends_on: ["10_comprehensive_hardening_v1.md", "09_security_reliability_v1.md", "08_hardening_reliability_v1.md"]
related_specs: ["00_master_spec.md", "01_feature_cli_tooling.md", "02_feature_agent_tools.md", "03_feature_git_orchestration.md", "05_feature_dual_engine.md", "06_production_hardening.md", "07_sandbox_security_hardening.md"]
---

# spec-11: MVP Hardening -- Security Closure, Test Completeness, and Production Readiness

## 1. Executive Summary

Specs 07 through 10 identified 66+ security findings and scoped a broad remediation roadmap.
As of 2026-03-16, only spec-07 is fully complete and spec-08 Phase 1 (BuildResult.success bug)
is verified. The remaining 15 phases of spec-08, all of spec-09, and all of spec-10 remain
unimplemented.

This spec consolidates the highest-impact, lowest-risk work items from specs 08, 09, and 10
into a single actionable build plan with 20 phases. Each phase is sequenced to avoid merge
conflicts, includes a Claude Code prompt ready for copy-paste execution, and specifies
deterministic acceptance criteria that can be verified without human judgment.

This spec does not introduce net-new features. Every phase targets a concrete deficiency in
security, reliability, correctness, test coverage, documentation, or code quality that already
exists in the shipped code. The goal is to bring the codebase from "working MVP with 260 tests
and 38 known issues" to "bulletproof MVP with 400+ tests and zero known P1/P2 issues."

### Logic Breakdown (Measured)

Source: 8,087 lines across 30 Python modules in src/codelicious/.

| Category | Lines | Percentage | Description |
|----------|-------|------------|-------------|
| Deterministic (safety harness) | 3,435 | 42% | Sandbox, verifier, command runner, git orchestrator, path validation, denylist enforcement, file extension checks, audit logging, config loading, build session management, error types, security constants |
| Probabilistic (LLM-driven) | 3,710 | 46% | Spec parsing, task planning, code generation, prompt templates, agent subprocess management, LLM HTTP client, agentic loop controller, RAG engine, cache engine, scaffolder |
| Shared infrastructure | 942 | 12% | CLI entry point, parser, context manager, engine base class, engine selection, tool registry |

This spec operates entirely within the deterministic 42% layer and the shared 12% layer.
No LLM prompts, model selection, or probabilistic behavior is modified.

Test suite: 3,809 lines across 13 test files. 260 tests passing in 3.32 seconds.

### Guiding Principles

- Fix what exists. Do not add features nobody asked for.
- Every change must have a test that would have failed before the fix.
- Security fixes are hardcoded in Python. Nothing is configurable by the LLM.
- All file I/O uses explicit UTF-8 encoding with encoding="utf-8" parameter.
- All logging uses percent-style formatting so the SanitizingFilter can intercept arguments.
- Dead code is removed, not commented out.
- Documentation must reflect the actual state of the code, not aspirational state.
- Tests must be deterministic: no network access, no API keys, no filesystem timing.

---

## 2. Scope and Non-Goals

### In Scope

1. All 11 P1 (Critical) security findings from STATE.md.
2. All 14 P2 (Important) security findings from STATE.md.
3. Test coverage for the 5 untested modules: llm_client.py, git_orchestrator.py,
   huggingface_engine.py, loop_controller.py, config.py.
4. Integration test infrastructure with deterministic fixtures and sample data.
5. Cache flush implementation (CacheManager.flush_cache stub).
6. Dead code removal (loop_controller.py if superseded, stale references).
7. Documentation alignment (CLAUDE.md, README.md, STATE.md).
8. Lint, format, and security scan enforcement as blocking gates.
9. Pre-commit hook hardening and pyproject.toml dev dependency declaration.
10. Type annotation gaps in llm_client.py and loop_controller.py.

### Non-Goals

1. New features, new engines, new CLI flags, or new tool types.
2. Spec-04 extensions (CI/CD bots, browser-in-the-loop, swarm architecture).
3. External dependency additions (requests, httpx, pydantic) -- stdlib only.
4. Model selection changes or LLM prompt modifications.
5. Performance optimization beyond fixing known DoS vectors.
6. UI, web dashboard, or API server functionality.

---

## 3. User Intent and Expected Behavior

### As a developer running codelicious against my repo:

- When I run `codelicious /path/to/repo`, I expect the build to either succeed with a
  review-ready PR or fail with a clear error message and non-zero exit code. I do not expect
  silent failures where the tool reports success but produced broken output.

- When I run `codelicious /path/to/repo --dry-run`, I expect zero filesystem side effects.
  No files created, no git operations, no network calls.

- When I run `codelicious /path/to/repo --push-pr` and the PR creation fails, I expect an
  error message in stderr and a non-zero exit code, not a silently swallowed exception.

- When the LLM generates code containing eval(), exec(), or hardcoded secrets, I expect the
  security scanner to catch and report these before any git commit occurs.

- When I configure LLM_ENDPOINT via environment variable, I expect the tool to reject HTTP
  endpoints and require HTTPS to protect my API key in transit.

- When the build writes files, I expect it to only stage files it actually wrote during the
  current session, not pre-existing sensitive files like .env or credentials.json.

### As a contributor running the test suite:

- When I run `pytest`, I expect all tests to pass in under 10 seconds with zero network
  access, zero API keys required, and zero filesystem timing dependencies.

- When I run `ruff check src/ tests/`, I expect zero lint violations.

- When I run `ruff format --check src/ tests/`, I expect zero format violations.

- When I run `pytest --cov=src/codelicious --cov-report=term-missing`, I expect at least
  80% line coverage across all modules and 95% coverage on security-critical modules
  (sandbox.py, command_runner.py, verifier.py, fs_tools.py).

### As a security reviewer auditing the codebase:

- When I search for shell=True, I expect zero results in production code.

- When I search for subprocess calls, I expect every one to use shell=False with explicit
  argument lists, not string commands.

- When I review audit.log and security.log, I expect no API keys, tokens, or credentials
  to appear in any log entry, even in error messages from failed HTTP calls.

- When I review file write operations, I expect atomic write patterns (tempfile + os.replace)
  with no TOCTOU windows exploitable by a concurrent process.

---

## 4. Quick Install and Verify

```
git clone https://github.com/clay-good/codelicious.git
cd codelicious
pip install -e ".[test]"
pre-commit install

# Verify everything passes
pytest
ruff check src/ tests/
ruff format --check src/ tests/
ruff check src/ --select=S
```

After this spec is fully implemented, the above four commands must all exit 0.

---

## 5. Deterministic vs Probabilistic Logic Analysis

### What is deterministic in this codebase

Every security control, validation check, file operation, subprocess invocation, logging
call, and git operation is deterministic Python code. These components produce the same
output for the same input every time. They are fully testable with unit tests and do not
require LLM access.

Modules: sandbox.py, verifier.py, command_runner.py, fs_tools.py, audit_logger.py,
security_constants.py, git_orchestrator.py, config.py, build_logger.py, logger.py,
errors.py, cli.py (argument parsing), parser.py (markdown splitting), context_manager.py
(token counting), engines/base.py (ABC), engines/__init__.py (selection logic),
tools/registry.py (dispatch table).

### What is probabilistic in this codebase

All code generation, task planning, error recovery strategy selection, commit message
authoring, and quality reflection is driven by LLM inference. These components produce
different outputs for the same input across runs. They are tested by mocking the LLM
response and asserting correct handling of the response.

Modules: planner.py, executor.py, prompts.py, claude_engine.py (build orchestration),
huggingface_engine.py (agentic loop), agent_runner.py (subprocess to claude CLI),
llm_client.py (HTTP to HuggingFace), loop_controller.py (tool dispatch), rag_engine.py
(embedding search), cache_engine.py (state persistence), scaffolder.py (template generation).

### Boundary between deterministic and probabilistic

The boundary is enforced by the tool dispatch layer. LLM output (probabilistic) is parsed
into tool calls (deterministic). Every tool call passes through the deterministic safety
harness (denylist, sandbox, path validation, extension allowlist, size limits, audit logging)
before any side effect occurs. The LLM never has direct filesystem or subprocess access.

---

## 6. Implementation Phases

Each phase below includes:
- A description of the problem and why it matters.
- The files to modify and the specific changes required.
- A Claude Code prompt ready for copy-paste execution.
- Deterministic acceptance criteria.

---

### Phase 1: Fix Silent Exception Swallowing in CLI (P1-8)

**Problem:** cli.py lines 127-130 catch Exception during PR transition and silently discard
it with `pass`. If PR creation fails, the user sees exit code 0 and no error message.

**Files:** src/codelicious/cli.py, tests/test_cli.py (new)

**Changes:**
- Replace the bare `except Exception: pass` with proper error logging and non-zero exit.
- Log the exception message to stderr using logger.error().
- Set the exit code to 1 when PR transition fails.
- Add test that verifies exception is logged and exit code is non-zero.

**Acceptance Criteria:**
- No bare `except: pass` or `except Exception: pass` patterns exist in cli.py.
- test_cli.py has a test that mocks git_manager.transition_pr_to_review to raise, asserts
  logger.error was called, and asserts sys.exit(1) or equivalent.
- pytest passes.

**Claude Code Prompt:**

```
Read src/codelicious/cli.py. Find the try/except block around transition_pr_to_review
(approximately lines 127-130). Replace the bare `except Exception: pass` with:
  except Exception as exc:
      logger.error("PR transition failed: %s", exc)
      raise SystemExit(1) from exc

Create tests/test_cli.py with a test_pr_transition_failure test that:
1. Mocks git_manager.transition_pr_to_review to raise RuntimeError("GitHub API down")
2. Asserts that SystemExit(1) is raised
3. Asserts that "PR transition failed" appears in log output

Run pytest tests/test_cli.py to verify. Then run pytest to verify no regressions.
Run ruff check src/codelicious/cli.py tests/test_cli.py and fix any violations.
```

---

### Phase 2: Fix Command Injection via Whitespace Mismatch (P1-2)

**Problem:** command_runner.py validates commands using str.split() (line 99) but executes
them using shlex.split() (line 125). These two functions split differently on escaped
spaces, quoted arguments, and backslash sequences. An attacker can craft a command string
that passes validation but executes differently.

**Files:** src/codelicious/tools/command_runner.py, tests/test_command_runner.py (new)

**Changes:**
- Use shlex.split() for both validation and execution.
- If shlex.split() raises ValueError (unclosed quote), reject the command.
- Add tests for edge cases: escaped spaces, single quotes, double quotes, unclosed quotes,
  backslash sequences, commands with arguments that look like different commands after split.

**Acceptance Criteria:**
- command_runner.py uses shlex.split() in the validation path, not str.split().
- test_command_runner.py has at least 15 tests covering: denied commands, allowed commands,
  metacharacter rejection, whitespace edge cases, unclosed quotes, escaped characters.
- pytest passes.

**Claude Code Prompt:**

```
Read src/codelicious/tools/command_runner.py completely. Find where str.split() is used
for command validation (the line that extracts the command name to check against the
denylist). Replace it with shlex.split() wrapped in a try/except ValueError that rejects
commands with parsing errors.

Ensure the validation path and execution path both use shlex.split() so there is no
split mismatch.

Create tests/test_command_runner.py with these tests:
1. test_denied_command_rejected -- "rm -rf /" raises DeniedCommandError
2. test_allowed_command_passes -- "echo hello" succeeds
3. test_metacharacter_pipe_rejected -- "echo hello | cat" rejected
4. test_metacharacter_semicolon_rejected -- "echo hello ; rm -rf /" rejected
5. test_metacharacter_backtick_rejected -- "echo `whoami`" rejected
6. test_metacharacter_dollar_rejected -- "echo $HOME" rejected
7. test_whitespace_in_quotes -- 'echo "hello world"' passes (single command)
8. test_escaped_space -- "echo hello\\ world" consistent between validation and execution
9. test_unclosed_quote_rejected -- 'echo "hello' rejected (ValueError from shlex)
10. test_backslash_sequence -- "echo \\n" handled consistently
11. test_empty_command_rejected -- "" rejected
12. test_whitespace_only_rejected -- "   " rejected
13. test_denied_with_path -- "/usr/bin/rm foo" rejected (basename check)
14. test_denied_case_insensitive -- verify case handling matches expectations
15. test_newline_in_command_rejected -- "echo hello\nrm -rf /" rejected (P2-8)

Mock subprocess.run to avoid actual command execution. Use MagicMock for the config object.
Run pytest tests/test_command_runner.py to verify. Then run full pytest.
Run ruff check and ruff format on both files.
```

---

### Phase 3: Fix TOCTOU Race in FSTooling native_write_file (P1-1, P1-3)

**Problem:** fs_tools.py validates the path, then writes the file in a separate step. Between
validation and write, an attacker could replace the target with a symlink pointing outside
the sandbox. Additionally, mkstemp uses the target's parent directory without verifying that
the parent itself is not a symlink.

**Files:** src/codelicious/tools/fs_tools.py, tests/test_fs_tools.py (new)

**Changes:**
- Resolve the parent directory with os.path.realpath() before calling mkstemp.
- Verify the resolved parent is still within the sandbox root.
- Open the final target path with O_NOFOLLOW (on platforms that support it) or verify
  the target is not a symlink immediately before os.replace().
- Delegate all writes through Sandbox.write_file() which already has atomic write logic.
- Add tests that create a symlink after validation and verify the write is rejected.

**Acceptance Criteria:**
- native_write_file delegates to Sandbox.write_file() instead of implementing its own
  write path, eliminating the duplicate TOCTOU window.
- test_fs_tools.py has at least 12 tests covering: normal write, overwrite, path traversal
  rejection, symlink rejection, protected path rejection, parent symlink rejection,
  extension allowlist, file size limit, file count limit, dry run, information disclosure
  (exception messages do not leak internal paths), directory listing limits.
- pytest passes.

**Claude Code Prompt:**

```
Read src/codelicious/tools/fs_tools.py and src/codelicious/sandbox.py completely.

Refactor native_write_file in fs_tools.py to delegate to self.sandbox.write_file() instead
of implementing its own tempfile + os.replace pattern. The Sandbox class already handles
atomic writes with symlink detection. This eliminates the TOCTOU race (P1-1) and the
unverified parent directory issue (P1-3).

Before delegating, resolve the parent directory path and verify it is within sandbox root:
  parent_real = os.path.realpath(str(target.parent))
  if not parent_real.startswith(str(self.sandbox.root)):
      raise PathTraversalError(...)

Wrap exceptions from sandbox.write_file() so that internal paths are not leaked to the
LLM in error messages (P2-2). Replace raw exception messages with generic ones:
  except PathTraversalError:
      return "Error: path is outside the allowed directory"
  except DeniedPathError:
      return "Error: this file is protected and cannot be modified"

Create tests/test_fs_tools.py with at least 12 tests:
1. test_write_creates_file -- normal write succeeds
2. test_write_overwrites_existing -- overwrite succeeds
3. test_path_traversal_rejected -- "../../../etc/passwd" rejected
4. test_symlink_target_rejected -- symlink pointing outside sandbox rejected
5. test_protected_path_rejected -- CLAUDE.md or similar protected file rejected
6. test_parent_symlink_rejected -- parent directory is symlink outside sandbox
7. test_extension_allowlist -- .exe file rejected
8. test_file_size_limit -- content exceeding max_file_size rejected
9. test_file_count_limit -- exceeding max_file_count rejected
10. test_dry_run_no_write -- dry_run=True does not create files
11. test_error_message_no_internal_paths -- exception message does not contain sandbox root
12. test_directory_listing_returns_files -- native_list_directory returns expected structure

Run pytest tests/test_fs_tools.py, then full pytest.
Run ruff check and ruff format on modified files.
```

---

### Phase 4: Fix Symlink TOCTOU and File Count Race in Sandbox (P1-4, P1-5, P1-6)

**Problem:** sandbox.py has three related race conditions:
- P1-6: Symlink check (os.path.islink) happens before the atomic write (os.replace),
  leaving a window where an attacker could create a symlink.
- P1-4: File count is incremented after the write completes, not atomically with validation.
- P1-5: File count increments even for overwrites, allowing the counter to exceed the limit.

**Files:** src/codelicious/sandbox.py, tests/test_sandbox.py

**Changes:**
- Move the symlink check to after os.replace() by checking the final path. If the replaced
  path is now a symlink (because something raced), delete the written content and raise.
- Acquire the file count lock before validation and hold it through the write.
- Check if the target file already exists before incrementing the counter (overwrites should
  not increment).
- Add tests for concurrent write attempts and overwrite counting.

**Acceptance Criteria:**
- The symlink check occurs after os.replace, not before.
- The file count lock is held from validation through write completion.
- Overwriting an existing file does not increment the file counter.
- test_sandbox.py has new tests for: overwrite does not increment count, concurrent writes
  respect file limit, symlink created during write window is detected.
- pytest passes. Existing sandbox tests still pass.

**Claude Code Prompt:**

```
Read src/codelicious/sandbox.py completely, focusing on the write_file method and the
_file_count_lock usage.

Fix P1-6 (Symlink TOCTOU):
- After os.replace(tmp_name, resolved_path), immediately check os.path.islink(resolved_path).
- If it is a symlink, os.unlink(resolved_path) and raise PathTraversalError.
- This closes the race window because we check AFTER the write, not before.

Fix P1-4 and P1-5 (File count race):
- Acquire self._file_count_lock BEFORE calling validate_write().
- Hold the lock through the entire write_file operation (validation + write + count update).
- Before incrementing self._file_count, check if the target file already existed.
- If it already existed (overwrite), do not increment the counter.
- Use a pattern like:
    existed = resolved_path.exists()
    ... perform write ...
    if not existed:
        self._file_count += 1

Add these tests to tests/test_sandbox.py:
1. test_overwrite_does_not_increment_count -- write file, overwrite it, verify count is 1
2. test_file_count_at_limit_allows_overwrite -- at max count, overwriting existing file works
3. test_file_count_at_limit_rejects_new -- at max count, new file is rejected
4. test_symlink_after_replace_detected -- (if possible to test) create scenario where
   symlink detection after write catches the issue

Run pytest tests/test_sandbox.py, then full pytest.
Run ruff check and ruff format on sandbox.py.
```

---

### Phase 5: Sanitize LLM API Error Bodies (P1-7)

**Problem:** llm_client.py logs HTTP error response bodies without sanitization. If the LLM
provider echoes back the API key in an error response (common with 401 Unauthorized), the
key appears in plaintext in the log file.

**Files:** src/codelicious/llm_client.py, tests/test_llm_client.py (new)

**Changes:**
- Import the sanitize_message function from logger.py.
- Apply sanitize_message() to all error response bodies before logging.
- Apply sanitize_message() to all exception messages that include HTTP response content.
- Add tests that verify API keys in error responses are redacted before logging.

**Acceptance Criteria:**
- Every logger.error() and logger.warning() call in llm_client.py that includes HTTP
  response content passes it through sanitize_message() first.
- test_llm_client.py has at least 20 tests covering: successful request, 401 with key in
  body, 429 rate limit, 500 server error, 502 bad gateway, 503 service unavailable,
  connection timeout, DNS failure, malformed JSON response, empty response body, very large
  response body (truncation), HTTPS enforcement, retry logic, request headers do not log
  the Authorization value, streaming response parsing, non-JSON content type.
- No API key pattern (sk-*, hf_*, Bearer *) appears in any log output during tests.
- pytest passes.

**Claude Code Prompt:**

```
Read src/codelicious/llm_client.py and src/codelicious/logger.py completely.

In llm_client.py, find every place where HTTP error response bodies or exception messages
are logged. Apply logger.sanitize_message() to the content before logging. Examples:

Before:
  logger.error(f"HTTPError {e.code}: {error_body}")
After:
  from codelicious.logger import sanitize_message
  logger.error("HTTPError %s: %s", e.code, sanitize_message(error_body))

Also ensure the Authorization header value is never logged. If there is any debug logging
of request headers, redact the Authorization value.

Create tests/test_llm_client.py with at least 20 tests. Mock urllib.request.urlopen to
simulate various HTTP responses:
1. test_successful_request -- 200 response returns parsed JSON
2. test_401_key_redacted -- 401 response body containing "sk-abc123" is logged as "[REDACTED]"
3. test_429_rate_limit -- 429 response raises ClaudeRateLimitError or equivalent
4. test_500_server_error -- 500 response raises with sanitized message
5. test_502_bad_gateway -- 502 response handled gracefully
6. test_503_service_unavailable -- 503 response handled gracefully
7. test_connection_timeout -- URLError with timeout raises AgentTimeout or equivalent
8. test_dns_failure -- URLError with DNS failure raises with clear message
9. test_malformed_json -- 200 response with invalid JSON raises parse error
10. test_empty_response -- 200 response with empty body handled
11. test_large_response_body -- very large response body truncated in logs
12. test_https_endpoint -- verify HTTPS is required (or document if not yet enforced)
13. test_retry_on_transient -- 503 retried with backoff (if retry logic exists)
14. test_no_retry_on_permanent -- 401 not retried
15. test_auth_header_not_logged -- Authorization header value not in log output
16. test_hf_token_redacted -- "hf_abc123" in error body is redacted
17. test_bearer_token_redacted -- "Bearer sk-abc123" in error body is redacted
18. test_request_timeout_configurable -- timeout parameter is passed to urlopen
19. test_content_type_json -- request Content-Type header is application/json
20. test_user_agent_header -- request includes User-Agent header

Run pytest tests/test_llm_client.py, then full pytest.
Run ruff check and ruff format on both files.
```

---

### Phase 6: Fix JSON Deserialization Without Validation (P1-9)

**Problem:** loop_controller.py reads JSON config with json.loads(config_path.read_text())
without handling JSONDecodeError, without size limits, and without schema validation. A
malformed or very large config file could crash the process or consume excessive memory.

**Files:** src/codelicious/loop_controller.py, tests/test_loop_controller.py (new)

**Changes:**
- Wrap json.loads() in try/except json.JSONDecodeError with a clear error message.
- Add a size check before reading: if file > 10MB, reject.
- Validate required keys exist in the parsed config.
- Add UTF-8 encoding parameter to read_text().
- Add tests for: valid config, empty file, malformed JSON, missing keys, oversized file.

**Acceptance Criteria:**
- json.loads() is wrapped in try/except json.JSONDecodeError.
- File size is checked before reading (10MB limit).
- Required config keys are validated after parsing.
- read_text() uses encoding="utf-8".
- test_loop_controller.py has at least 10 tests.
- pytest passes.

**Claude Code Prompt:**

```
Read src/codelicious/loop_controller.py completely.

Find the json.loads(config_path.read_text()) call (approximately line 26). Refactor it:

1. Check file size before reading:
   if config_path.stat().st_size > 10_000_000:
       raise ConfigError("Config file exceeds 10MB limit")

2. Read with explicit encoding:
   raw = config_path.read_text(encoding="utf-8")

3. Parse with error handling:
   try:
       self.config = json.loads(raw)
   except json.JSONDecodeError as exc:
       raise ConfigError(f"Invalid JSON in config: {exc}") from exc

4. Validate required keys:
   required = {"project_root", "specs_dir"}
   missing = required - set(self.config.keys())
   if missing:
       raise ConfigError(f"Missing config keys: {missing}")

Create tests/test_loop_controller.py with at least 10 tests:
1. test_valid_config_loads -- valid JSON with required keys succeeds
2. test_empty_file_raises -- empty file raises ConfigError
3. test_malformed_json_raises -- "{bad json" raises ConfigError
4. test_missing_required_key_raises -- missing project_root raises ConfigError
5. test_oversized_file_raises -- file > 10MB raises ConfigError
6. test_utf8_encoding -- file with UTF-8 characters loads correctly
7. test_extra_keys_allowed -- extra keys do not cause errors
8. test_null_values_handled -- null values in JSON handled
9. test_nested_config -- nested objects parsed correctly
10. test_config_file_not_found -- missing file raises FileNotFoundError

Mock or use tmp_path for all file operations. Do not use real config files.
Run pytest tests/test_loop_controller.py, then full pytest.
Run ruff check and ruff format on both files.
```

---

### Phase 7: Fix Path Traversal Bypass via Triple-Encoding (P1-10)

**Problem:** planner.py performs double-decoding of URL-encoded paths to catch traversal
attempts like %252e%252e (double-encoded ..). However, triple-encoding (%25252e%25252e)
bypasses this check because only two rounds of decoding are performed.

**Files:** src/codelicious/planner.py, tests/test_planner.py (update existing or new)

**Changes:**
- Replace the fixed double-decode with a loop that decodes until the string stops changing
  or a maximum of 5 iterations.
- After decoding, apply the standard path traversal checks (reject "..", null bytes,
  absolute paths).
- Add tests for single, double, triple, and quadruple encoded path traversal attempts.

**Acceptance Criteria:**
- Path decoding loops until stable or 5 iterations, whichever comes first.
- Triple-encoded "../" is detected and rejected.
- Quadruple-encoded "../" is detected and rejected.
- test_planner.py (or a new test file) has tests for all encoding levels.
- pytest passes.

**Claude Code Prompt:**

```
Read src/codelicious/planner.py completely. Find the path traversal detection logic
(approximately lines 378-432) that performs URL decoding.

Replace the fixed double-decode with iterative decoding:

  from urllib.parse import unquote

  def _fully_decode(value: str, max_rounds: int = 5) -> str:
      for _ in range(max_rounds):
          decoded = unquote(value)
          if decoded == value:
              break
          value = decoded
      return value

Apply _fully_decode() to all path components before checking for ".." traversal.

Add tests (in tests/test_planner.py or a new file) for:
1. test_single_encoded_dotdot_rejected -- "%2e%2e" rejected
2. test_double_encoded_dotdot_rejected -- "%252e%252e" rejected
3. test_triple_encoded_dotdot_rejected -- "%25252e%25252e" rejected
4. test_quadruple_encoded_dotdot_rejected -- "%2525252e%2525252e" rejected
5. test_clean_path_allowed -- "src/main.py" allowed
6. test_mixed_encoding_rejected -- "src/%2e%2e/etc/passwd" rejected
7. test_null_byte_rejected -- "src/main.py%00.txt" rejected

Run pytest to verify. Run ruff check and ruff format on modified files.
```

---

### Phase 8: HTTPS Endpoint Validation (P1-11 related, spec-09 CRITICAL)

**Problem:** The LLM endpoint URL is configurable via environment variable but the code
never validates that the scheme is HTTPS. If an attacker sets LLM_ENDPOINT=http://evil.com,
API keys are transmitted in cleartext.

**Files:** src/codelicious/llm_client.py, src/codelicious/config.py, tests/test_llm_client.py
(update), tests/test_config.py (new)

**Changes:**
- In config.py, validate that any LLM endpoint URL starts with "https://".
- Allow "http://localhost" and "http://127.0.0.1" for local development only.
- Raise ConfigError if a non-HTTPS, non-localhost endpoint is configured.
- In llm_client.py, add a defensive check before making HTTP requests.
- Add tests for HTTPS enforcement and localhost exception.

**Acceptance Criteria:**
- config.py rejects http:// endpoints that are not localhost.
- llm_client.py has a defensive HTTPS check before request.
- test_config.py has tests for: HTTPS allowed, HTTP rejected, localhost allowed, 127.0.0.1
  allowed, empty endpoint handled, malformed URL rejected.
- pytest passes.

**Claude Code Prompt:**

```
Read src/codelicious/config.py and src/codelicious/llm_client.py completely.

In config.py, find where the LLM endpoint is loaded from environment variables. Add
validation:

  from urllib.parse import urlparse

  def _validate_endpoint(url: str) -> str:
      parsed = urlparse(url)
      if parsed.scheme == "https":
          return url
      if parsed.scheme == "http" and parsed.hostname in ("localhost", "127.0.0.1", "::1"):
          return url
      raise ConfigError(
          "LLM endpoint must use HTTPS. Got: %s. "
          "HTTP is only allowed for localhost development." % parsed.scheme
      )

Apply this validation wherever the endpoint is set or loaded.

In llm_client.py, add a defensive check in the constructor or request method:
  if not self.endpoint.startswith("https://") and "localhost" not in self.endpoint and "127.0.0.1" not in self.endpoint:
      raise ConfigError("Refusing to send API key over non-HTTPS connection")

Create tests/test_config.py with at least 8 tests:
1. test_https_endpoint_allowed -- "https://api.example.com" accepted
2. test_http_endpoint_rejected -- "http://api.example.com" raises ConfigError
3. test_http_localhost_allowed -- "http://localhost:8080" accepted
4. test_http_127_allowed -- "http://127.0.0.1:8080" accepted
5. test_empty_endpoint_uses_default -- empty string uses default endpoint
6. test_malformed_url_rejected -- "not-a-url" raises ConfigError
7. test_ftp_rejected -- "ftp://api.example.com" raises ConfigError
8. test_no_scheme_rejected -- "api.example.com" raises ConfigError

Update tests/test_llm_client.py with a test_http_endpoint_rejected test.

Run pytest, ruff check, ruff format on all modified files.
```

---

### Phase 9: Fix Git Staging to Use Explicit File Lists (P1 related, spec-09 CRITICAL)

**Problem:** git_orchestrator.py uses `git add .` which stages all files in the working
tree, including pre-existing .env files, credentials.json, private keys, and other sensitive
files that codelicious did not write.

**Files:** src/codelicious/git/git_orchestrator.py, tests/test_git_orchestrator.py (new)

**Changes:**
- Track files written during the build session (Sandbox already tracks this).
- Replace `git add .` with `git add` followed by the explicit list of written files.
- If the written file list is empty, skip the commit entirely.
- Add tests that verify only written files are staged, not pre-existing files.

**Acceptance Criteria:**
- git_orchestrator.py never calls `git add .` or `git add -A`.
- Only files from the build session's written file list are staged.
- Pre-existing .env, .git/config, credentials.json are never staged.
- test_git_orchestrator.py has at least 15 tests covering: commit with written files,
  commit with no files (skip), branch creation, branch switching, PR creation mock,
  pre-existing .env not staged, commit message formatting, error handling for git failures,
  detached HEAD handling.
- pytest passes.

**Claude Code Prompt:**

```
Read src/codelicious/git/git_orchestrator.py completely. Also read src/codelicious/sandbox.py
to understand how written files are tracked.

Find every occurrence of "git add ." or "git add -A" in git_orchestrator.py. Replace with
explicit file staging:

  def commit_changes(self, message: str, written_files: list[str]) -> None:
      if not written_files:
          logger.info("No files to commit, skipping")
          return
      # Stage only the files we wrote
      for filepath in written_files:
          self._run_git(["git", "add", "--", filepath])
      self._run_git(["git", "commit", "-m", message])

Ensure the Sandbox or BuildSession passes the list of written files to the git orchestrator.

Create tests/test_git_orchestrator.py with at least 15 tests:
1. test_commit_stages_only_written_files
2. test_commit_skips_when_no_files
3. test_pre_existing_env_not_staged
4. test_branch_creation
5. test_branch_switch
6. test_pr_creation_calls_gh
7. test_commit_message_formatting
8. test_git_add_failure_raises
9. test_git_commit_failure_raises
10. test_detached_head_error
11. test_branch_already_exists
12. test_push_to_remote
13. test_push_failure_raises
14. test_transition_pr_to_review
15. test_transition_pr_failure_logged

Mock subprocess.run for all git commands. Use MagicMock for config.
Run pytest tests/test_git_orchestrator.py, then full pytest.
Run ruff check and ruff format on both files.
```

---

### Phase 10: Implement CacheManager.flush_cache (spec-08 Phase 2)

**Problem:** cache_engine.py has a flush_cache() method that is a stub with only a comment.
State is never persisted to disk, so builds cannot resume from where they left off.

**Files:** src/codelicious/context/cache_engine.py, tests/test_cache_engine.py (new)

**Changes:**
- Implement flush_cache() using the atomic write pattern (tempfile + os.replace).
- Write cache state as JSON with explicit UTF-8 encoding.
- Add a load_cache() method that reads persisted state.
- Add tests for flush, load, round-trip, corruption recovery.

**Acceptance Criteria:**
- flush_cache() writes state to disk atomically.
- load_cache() reads persisted state.
- Round-trip test: flush then load returns original state.
- Corrupted cache file is handled gracefully (logged warning, empty state returned).
- File permissions are set to 0o644.
- test_cache_engine.py has at least 10 tests.
- pytest passes.

**Claude Code Prompt:**

```
Read src/codelicious/context/cache_engine.py completely.

Implement flush_cache() using atomic write:

  import json
  import tempfile
  import os

  def flush_cache(self) -> None:
      cache_path = self.root / "cache.json"
      data = json.dumps(self._state, indent=2, ensure_ascii=False)
      fd, tmp_path = tempfile.mkstemp(
          dir=str(self.root),
          prefix=".cache_tmp_",
          suffix=".json"
      )
      try:
          with os.fdopen(fd, "w", encoding="utf-8") as f:
              f.write(data)
          os.chmod(tmp_path, 0o644)
          os.replace(tmp_path, str(cache_path))
      except Exception:
          os.unlink(tmp_path)
          raise

Implement load_cache() for reading persisted state:

  def load_cache(self) -> None:
      cache_path = self.root / "cache.json"
      if not cache_path.exists():
          return
      try:
          raw = cache_path.read_text(encoding="utf-8")
          self._state = json.loads(raw)
      except (json.JSONDecodeError, OSError) as exc:
          logger.warning("Cache file corrupted, starting fresh: %s", exc)
          self._state = {}

Create tests/test_cache_engine.py with at least 10 tests:
1. test_flush_creates_file
2. test_flush_content_is_valid_json
3. test_load_reads_flushed_state
4. test_round_trip_preserves_data
5. test_load_missing_file_no_error
6. test_load_corrupted_json_resets
7. test_load_empty_file_resets
8. test_flush_overwrites_existing
9. test_file_permissions_644
10. test_concurrent_flush_safe (use threading)

Run pytest tests/test_cache_engine.py, then full pytest.
Run ruff check and ruff format on both files.
```

---

### Phase 11: Unify Metacharacter Constants and Add Interpreter Denylist (spec-08 Phase 3)

**Problem:** command_runner.py and verifier.py each define their own set of blocked shell
metacharacters. They are inconsistent -- one may block characters the other does not. Also,
the command denylist does not include interpreter binaries (python, bash, sh, node, perl,
ruby), allowing the LLM to execute arbitrary code via "python -c 'import os; os.system(cmd)'".

**Files:** src/codelicious/security_constants.py, src/codelicious/tools/command_runner.py,
src/codelicious/verifier.py, tests/test_command_runner.py (update)

**Changes:**
- Define BLOCKED_METACHARACTERS as a single frozenset in security_constants.py.
- Import and use it in both command_runner.py and verifier.py. Remove duplicate definitions.
- Add interpreter binaries to DENIED_COMMANDS in security_constants.py: python, python3,
  python3.10, python3.11, python3.12, python3.13, bash, sh, zsh, fish, dash, csh, tcsh,
  ksh, node, deno, bun, perl, ruby, lua, php, Rscript, julia, pwsh, powershell.
- Add tests verifying interpreter commands are rejected.

**Acceptance Criteria:**
- BLOCKED_METACHARACTERS is defined exactly once in security_constants.py.
- command_runner.py and verifier.py both import from security_constants.py.
- All 25+ interpreter binaries are in DENIED_COMMANDS.
- test_command_runner.py has tests for at least 5 interpreter rejections.
- pytest passes.

**Claude Code Prompt:**

```
Read src/codelicious/security_constants.py, src/codelicious/tools/command_runner.py, and
src/codelicious/verifier.py.

In security_constants.py, ensure BLOCKED_METACHARACTERS is defined as a frozenset:
  BLOCKED_METACHARACTERS = frozenset({"|", "&", ";", "$", "`", "(", ")", "{", "}", "<", ">", "!", "\\", "\n", "\r"})

Note: add newline and carriage return to the set (P2-8 fix).

Add interpreter binaries to DENIED_COMMANDS:
  "python", "python3", "python3.10", "python3.11", "python3.12", "python3.13",
  "bash", "sh", "zsh", "fish", "dash", "csh", "tcsh", "ksh",
  "node", "deno", "bun", "perl", "ruby", "lua", "php", "Rscript", "julia",
  "pwsh", "powershell"

In command_runner.py, remove any local definition of blocked metacharacters and import
from security_constants. Same for verifier.py.

Update tests/test_command_runner.py to add:
1. test_python_interpreter_rejected -- "python -c 'print(1)'" rejected
2. test_bash_interpreter_rejected -- "bash -c 'echo hello'" rejected
3. test_node_interpreter_rejected -- "node -e 'console.log(1)'" rejected
4. test_perl_interpreter_rejected -- "perl -e 'print 1'" rejected
5. test_newline_metacharacter_rejected -- command with \n rejected
6. test_carriage_return_rejected -- command with \r rejected

Run pytest, ruff check, ruff format on all modified files.
```

---

### Phase 12: Fix Logging to Use Percent-Style Formatting (spec-08 Phase 7, P2-14)

**Problem:** Multiple modules use f-string interpolation in logger calls. This bypasses the
SanitizingFilter because the string is already interpolated before the filter sees it. Also,
audit_logger.py mutates the global logging level with addLevelName() at import time, which
affects all loggers in the process.

**Files:** src/codelicious/tools/audit_logger.py, src/codelicious/llm_client.py,
src/codelicious/build_logger.py, and any other files with f-string logging.

**Changes:**
- Replace all logger.info(f"...{var}...") with logger.info("...%s...", var).
- Replace all logger.error(f"...{var}...") with logger.error("...%s...", var).
- Same for logger.warning, logger.debug.
- In audit_logger.py, replace addLevelName() with a module-level constant and custom
  formatter instead of mutating the global logging namespace.
- Add a ruff rule to enforce this going forward (LOG015 or equivalent).

**Acceptance Criteria:**
- Zero f-string logger calls in src/codelicious/ (grep for 'logger\.\w+\(f"' returns 0).
- audit_logger.py does not call addLevelName().
- SanitizingFilter can intercept all logged values.
- pytest passes. Existing log-dependent tests still pass.

**Claude Code Prompt:**

```
Search the entire src/codelicious/ directory for f-string logging patterns:
  grep -rn 'logger\.\(info\|error\|warning\|debug\)(f"' src/codelicious/
  grep -rn "logger\.\(info\|error\|warning\|debug\)(f'" src/codelicious/

For each match, convert from f-string to percent-style:
  Before: logger.info(f"Processing {filename} with {count} items")
  After:  logger.info("Processing %s with %s items", filename, count)

In audit_logger.py, find addLevelName() calls. Remove them. Instead, use a custom
Formatter subclass that maps level numbers to custom names:

  class AuditFormatter(logging.Formatter):
      _LEVEL_NAMES = {
          25: "AUDIT",
          35: "SECURITY",
      }
      def format(self, record: logging.LogRecord) -> str:
          if record.levelno in self._LEVEL_NAMES:
              record.levelname = self._LEVEL_NAMES[record.levelno]
          return super().format(record)

Apply AuditFormatter to the audit and security log handlers instead of mutating globals.

Run pytest to verify no regressions.
Run: grep -rn 'logger\.\w*(f"' src/codelicious/ -- should return 0 results.
Run ruff check and ruff format on all modified files.
```

---

### Phase 13: Fix Case-Sensitive Path Bypass on macOS (P2-4)

**Problem:** fs_tools.py checks protected paths using case-sensitive string comparison.
On macOS (HFS+/APFS) and Windows (NTFS), the filesystem is case-insensitive, so
"CLAUDE.MD" or "claude.md" bypasses the check for "CLAUDE.md".

**Files:** src/codelicious/tools/fs_tools.py, src/codelicious/sandbox.py,
tests/test_fs_tools.py (update)

**Changes:**
- Normalize all path comparisons to lowercase using .lower() or os.path.normcase().
- Store protected paths in their normalized form.
- Add tests for case-insensitive path matching.

**Acceptance Criteria:**
- Protected path checks use case-insensitive comparison.
- "CLAUDE.MD", "Claude.md", "claude.MD" are all rejected as protected paths.
- Tests verify case-insensitive matching.
- pytest passes.

**Claude Code Prompt:**

```
Read src/codelicious/tools/fs_tools.py and src/codelicious/sandbox.py.

Find PROTECTED_PATHS (likely a frozenset of path strings). Ensure all comparisons against
this set use case-normalized paths:

  def _is_protected(self, path: Path) -> bool:
      normalized = str(path).lower()
      return any(
          protected.lower() in normalized
          for protected in PROTECTED_PATHS
      )

Apply os.path.normcase() for cross-platform correctness where appropriate.

Update tests/test_fs_tools.py to add:
1. test_protected_path_uppercase -- "CLAUDE.MD" rejected
2. test_protected_path_mixed_case -- "Claude.Md" rejected
3. test_protected_path_lowercase -- "claude.md" rejected
4. test_protected_gitconfig_case -- ".GIT/CONFIG" rejected

Run pytest, ruff check, ruff format on modified files.
```

---

### Phase 14: Add Missing Process Group Timeout (P2-3)

**Problem:** command_runner.py kills the subprocess on timeout but does not kill child
processes spawned by the command. A command like "make" that spawns subprocesses will leave
orphan processes running after timeout.

**Files:** src/codelicious/tools/command_runner.py, tests/test_command_runner.py (update)

**Changes:**
- Use start_new_session=True in subprocess.Popen to create a new process group.
- On timeout, kill the entire process group with os.killpg().
- Add a test that verifies process group cleanup on timeout.

**Acceptance Criteria:**
- subprocess calls use start_new_session=True (or equivalent).
- On timeout, os.killpg() is called with the process group ID.
- test_command_runner.py has a test_timeout_kills_process_group test.
- pytest passes.

**Claude Code Prompt:**

```
Read src/codelicious/tools/command_runner.py completely. Find the subprocess.run() or
subprocess.Popen() call.

Add start_new_session=True to create a new process group:
  result = subprocess.run(
      args,
      ...,
      start_new_session=True,
      timeout=self.timeout,
  )

Wrap in try/except subprocess.TimeoutExpired:
  except subprocess.TimeoutExpired:
      # Kill the entire process group
      import os
      import signal
      try:
          os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
      except (ProcessLookupError, PermissionError):
          pass
      raise

If using subprocess.run() (which does not expose the pid), refactor to use Popen for
timeout-sensitive commands so we have access to proc.pid.

Add test to tests/test_command_runner.py:
  test_timeout_kills_process_group -- mock subprocess to simulate timeout, verify
  os.killpg was called

Run pytest, ruff check, ruff format on modified files.
```

---

### Phase 15: Add Directory Listing Limits (P2-5)

**Problem:** fs_tools.py native_list_directory has no depth or entry limits. A directory
with millions of files or deeply nested symlink loops could cause the listing to consume
all available memory or hang indefinitely.

**Files:** src/codelicious/tools/fs_tools.py, tests/test_fs_tools.py (update)

**Changes:**
- Add max_depth parameter (default 10) to limit recursion depth.
- Add max_entries parameter (default 5000) to limit total entries returned.
- When limits are hit, truncate the result and append a message indicating truncation.
- Add tests for depth and entry limits.

**Acceptance Criteria:**
- native_list_directory respects max_depth and max_entries limits.
- Deeply nested directories (depth > 10) are truncated.
- Large directories (> 5000 entries) are truncated.
- Truncation message is included in the result.
- Tests verify both limits.
- pytest passes.

**Claude Code Prompt:**

```
Read src/codelicious/tools/fs_tools.py. Find the native_list_directory method.

Add parameters and enforce limits:

  def native_list_directory(
      self, path: str, max_depth: int = 10, max_entries: int = 5000
  ) -> str:
      entries: list[str] = []
      truncated = False

      def _walk(dir_path: Path, depth: int) -> None:
          nonlocal truncated
          if depth > max_depth:
              truncated = True
              return
          if len(entries) >= max_entries:
              truncated = True
              return
          try:
              for item in sorted(dir_path.iterdir()):
                  if len(entries) >= max_entries:
                      truncated = True
                      return
                  entries.append(str(item.relative_to(self.sandbox.root)))
                  if item.is_dir() and not item.is_symlink():
                      _walk(item, depth + 1)
          except PermissionError:
              pass

      _walk(Path(path), 0)
      result = "\n".join(entries)
      if truncated:
          result += "\n[truncated: listing exceeded depth or entry limits]"
      return result

Add tests to tests/test_fs_tools.py:
1. test_directory_listing_depth_limit -- nested dirs beyond limit are not listed
2. test_directory_listing_entry_limit -- large directory is truncated
3. test_directory_listing_truncation_message -- truncation message appears
4. test_directory_listing_symlink_not_followed -- symlink dirs are not recursed into

Run pytest, ruff check, ruff format on modified files.
```

---

### Phase 16: Fix Regex Catastrophic Backtracking (P2-11)

**Problem:** executor.py uses a regex pattern to extract content from backtick-fenced code
blocks. Maliciously crafted LLM responses with nested or unclosed backticks could cause the
regex engine to enter exponential backtracking, freezing the parser.

**Files:** src/codelicious/executor.py, tests/test_executor.py (update)

**Changes:**
- Replace the regex with a simple state-machine parser that scans line by line.
- The parser looks for lines starting with ``` and tracks open/close state.
- Add a timeout or line limit to the parser.
- Add tests with pathological input that would cause backtracking in the original regex.

**Acceptance Criteria:**
- No regex with nested quantifiers (.*?, .+?) is used for code block extraction.
- Pathological input (10,000 backticks) is parsed in under 1 second.
- Normal code block extraction still works correctly.
- test_executor.py has a test_pathological_backticks_fast test.
- pytest passes.

**Claude Code Prompt:**

```
Read src/codelicious/executor.py. Find the regex pattern used to extract code blocks from
LLM responses (look for patterns with backticks and .*? or similar).

Replace the regex-based extraction with a line-by-line state machine:

  def _extract_code_blocks(response: str) -> list[tuple[str, str]]:
      blocks: list[tuple[str, str]] = []
      current_file: str | None = None
      current_lines: list[str] = []
      in_block = False

      for line in response.split("\n"):
          if not in_block and line.startswith("```"):
              in_block = True
              # Extract filename from the line if present
              # e.g., ```python or ```filename.py
              continue
          if in_block and line.startswith("```"):
              in_block = False
              if current_file and current_lines:
                  blocks.append((current_file, "\n".join(current_lines)))
              current_lines = []
              current_file = None
              continue
          if in_block:
              current_lines.append(line)

      return blocks

Adapt this skeleton to match the existing extraction logic (preserving the --- FILE: ---
format and other extraction strategies).

Add tests to tests/test_executor.py:
1. test_pathological_backticks_fast -- 10,000 backticks parsed in < 1 second
2. test_nested_backticks_handled -- backticks inside code blocks do not break parser
3. test_unclosed_code_block -- unclosed block returns partial content or empty

Run pytest, ruff check, ruff format on modified files.
```

---

### Phase 17: HuggingFace Engine Test Coverage

**Problem:** huggingface_engine.py has zero tests. This module handles the agentic loop,
tool dispatch, message history management, and completion detection for the fallback engine.

**Files:** tests/test_huggingface_engine.py (new)

**Changes:**
- Create comprehensive tests mocking the LLM client and tool registry.
- Test the agentic loop lifecycle: start, tool dispatch, completion, max iterations.
- Test message history bounds (related to spec-08 Phase 6).
- Test error handling: LLM errors, tool errors, timeout.

**Acceptance Criteria:**
- test_huggingface_engine.py has at least 20 tests.
- Tests cover: initialization, single iteration, tool dispatch, completion detection
  (ALL_SPECS_COMPLETE), max iteration enforcement, message history growth, error recovery,
  empty tool calls, invalid tool names, tool execution failure.
- All tests are deterministic (mocked LLM, no network).
- pytest passes.

**Claude Code Prompt:**

```
Read src/codelicious/engines/huggingface_engine.py completely. Also read
src/codelicious/llm_client.py and src/codelicious/tools/registry.py for context.

Create tests/test_huggingface_engine.py with at least 20 tests:

1. test_engine_initializes -- engine creates with valid config
2. test_single_iteration_tool_call -- LLM returns tool call, tool executes, result appended
3. test_completion_detection -- LLM response contains ALL_SPECS_COMPLETE, loop exits
4. test_max_iterations_enforced -- loop stops at max_iterations (default 50)
5. test_tool_dispatch_read_file -- read_file tool call dispatches correctly
6. test_tool_dispatch_write_file -- write_file tool call dispatches correctly
7. test_tool_dispatch_run_command -- run_command tool call dispatches correctly
8. test_invalid_tool_name -- unknown tool name logged and skipped
9. test_empty_tool_calls -- LLM returns no tool calls, iteration continues
10. test_message_history_grows -- each iteration adds messages to history
11. test_message_history_bounded -- history does not exceed reasonable size
12. test_llm_error_logged -- LLM API error is caught, logged, and retried or failed
13. test_tool_error_returned_to_llm -- tool execution error is sent back to LLM
14. test_build_result_success -- successful completion returns BuildResult(success=True)
15. test_build_result_failure -- max iterations returns BuildResult(success=False)
16. test_system_prompt_includes_tools -- system prompt contains tool schemas
17. test_dry_run_no_side_effects -- dry_run=True does not execute tools
18. test_spec_content_in_prompt -- spec content is included in the system prompt
19. test_multiple_tool_calls -- LLM returns multiple tool calls in one response
20. test_timeout_during_iteration -- timeout during tool execution handled

Mock LLMClient to return canned responses. Mock ToolRegistry to track calls.
Use MagicMock for config and git_manager.

Run pytest tests/test_huggingface_engine.py, then full pytest.
Run ruff check and ruff format.
```

---

### Phase 18: Config Module Test Coverage

**Problem:** config.py has zero tests. This module loads environment variables, CLI
arguments, and defaults into a Config dataclass. Incorrect config loading could disable
security features or misconfigure the build.

**Files:** tests/test_config.py (update from Phase 8 or create)

**Changes:**
- Add tests for environment variable loading, default values, type coercion, validation.
- Test interaction between CLI args and env vars (precedence).
- Test edge cases: empty strings, whitespace, very long values.

**Acceptance Criteria:**
- test_config.py has at least 15 tests total (including Phase 8 additions).
- Tests cover: default values, env var override, CLI arg override, precedence order, type
  coercion (string to int, string to bool), missing required values, empty strings,
  HTTPS validation (from Phase 8), timeout bounds, invalid values.
- pytest passes.

**Claude Code Prompt:**

```
Read src/codelicious/config.py completely.

Extend tests/test_config.py (created in Phase 8) to at least 15 total tests:

1-8. (Already created in Phase 8 for HTTPS validation)
9. test_default_agent_timeout -- default timeout is 1800
10. test_env_var_overrides_default -- CODELICIOUS_BUILD_TIMEOUT overrides default
11. test_cli_arg_overrides_env -- CLI --agent-timeout overrides env var
12. test_timeout_type_coercion -- string "300" converted to int 300
13. test_negative_timeout_rejected -- negative timeout raises ConfigError
14. test_zero_timeout_rejected -- zero timeout raises ConfigError
15. test_boolean_coercion -- "true", "1", "yes" all map to True
16. test_empty_string_uses_default -- empty env var uses default value
17. test_whitespace_stripped -- " 300 " stripped to 300
18. test_very_large_timeout_capped -- timeout > 86400 capped or rejected
19. test_model_override -- --model flag sets config.model
20. test_engine_selection -- --engine flag sets config.engine

Mock os.environ for env var tests. Use argparse.Namespace for CLI arg tests.
Run pytest, ruff check, ruff format.
```

---

### Phase 19: Integration Test Infrastructure and Sample Data

**Problem:** The test suite has no end-to-end integration tests. Individual modules are
tested in isolation but the full build lifecycle (CLI invocation through PR creation) is
never tested as a connected pipeline.

**Files:** tests/fixtures/specs/ (new directory), tests/fixtures/llm_responses/ (new),
tests/fixtures/repos.py (new), tests/test_integration.py (new or update existing)

**Changes:**
- Create sample spec fixtures: valid_simple.md, valid_multi_section.md, malicious_eval.md,
  malicious_traversal.md, empty.md, oversized.md.
- Create canned LLM response fixtures: valid_code.json, syntax_error.json,
  security_violation.json, empty_response.json.
- Create a repo factory that sets up a temporary git repo with specs.
- Write integration tests that run the full pipeline with mocked LLM.

**Acceptance Criteria:**
- tests/fixtures/specs/ contains at least 6 sample spec files.
- tests/fixtures/llm_responses/ contains at least 4 canned response files.
- tests/fixtures/repos.py has a create_test_repo() factory function.
- test_integration.py has at least 10 integration tests covering: successful build,
  build with syntax errors, build with security violations, dry run, malicious spec
  rejection, empty spec handling, verifier catches eval(), git staging correctness,
  engine selection (claude vs huggingface), config loading from env vars.
- All integration tests are deterministic (mocked LLM, mocked git, tmp_path).
- pytest passes.

**Claude Code Prompt:**

```
Create the fixture infrastructure:

1. Create tests/fixtures/specs/valid_simple.md:
---
# Feature: Hello World
## Requirements
- Add a hello.py file that prints "Hello, World!"
## Acceptance Criteria
- hello.py exists and runs without errors
---

2. Create tests/fixtures/specs/valid_multi_section.md with 3 sections.

3. Create tests/fixtures/specs/malicious_eval.md that requests code with eval().

4. Create tests/fixtures/specs/malicious_traversal.md that requests writing to ../../etc/passwd.

5. Create tests/fixtures/specs/empty.md with no content.

6. Create tests/fixtures/llm_responses/valid_code.json with a canned response containing
   a simple Python file.

7. Create tests/fixtures/llm_responses/syntax_error.json with a response containing
   invalid Python syntax.

8. Create tests/fixtures/llm_responses/security_violation.json with a response containing
   eval() and hardcoded secrets.

9. Create tests/fixtures/repos.py with:
   def create_test_repo(tmp_path, specs=None):
       # Initialize git repo
       # Create docs/specs/ directory
       # Copy spec fixtures
       # Create .codelicious/ directory
       # Return repo path

10. Create tests/test_integration_e2e.py with at least 10 integration tests.
    Mock run_agent, LLMClient, and subprocess for git commands.
    Test the full pipeline from CLI args through build result.

Run pytest, ruff check, ruff format on all new files.
```

---

### Phase 20: Documentation Alignment, Lint Gate, and Final Verification

**Problem:** CLAUDE.md, README.md, and STATE.md may be out of sync with the actual codebase
after all previous phases. The pre-commit hooks should enforce lint and format as blocking
gates. pyproject.toml should declare dev dependencies.

**Files:** CLAUDE.md, README.md, .codelicious/STATE.md, pyproject.toml,
.pre-commit-config.yaml

**Changes:**
- Update CLAUDE.md Common Commands to reflect current test count and coverage.
- Update README.md project structure if any modules were added or removed.
- Update STATE.md with all completed phases and current verification status.
- Add dev dependencies to pyproject.toml: ruff, pre-commit, mypy, pytest-cov.
- Ensure .pre-commit-config.yaml runs ruff check, ruff format, and fast pytest.
- Run full verification: pytest, ruff check, ruff format, security scan.
- Update the Mermaid diagrams in README.md if architecture changed.

**Acceptance Criteria:**
- CLAUDE.md accurately reflects current commands and test count.
- README.md project structure matches actual src/codelicious/ directory.
- STATE.md shows all completed phases from this spec.
- pyproject.toml has [project.optional-dependencies] dev = ["ruff", "pre-commit",
  "mypy", "pytest-cov"].
- pytest exits 0 with 400+ tests.
- ruff check src/ tests/ exits 0.
- ruff format --check src/ tests/ exits 0.
- ruff check src/ --select=S exits 0.

**Claude Code Prompt:**

```
This is the final phase. Run full verification first:

  pytest --cov=src/codelicious --cov-report=term-missing
  ruff check src/ tests/
  ruff format --check src/ tests/
  ruff check src/ --select=S

If any checks fail, fix them before proceeding.

Update pyproject.toml [project.optional-dependencies]:
  dev = ["ruff>=0.4.0", "pre-commit>=3.0", "mypy>=1.10", "pytest-cov>=5.0"]
  test = ["pytest>=7.0", "pytest-cov>=5.0"]

Update CLAUDE.md:
- Update test count in the Common Commands section
- Ensure all commands listed actually work

Update README.md:
- Verify project structure matches actual directory layout
- Update test infrastructure diagram if needed
- Ensure Mermaid diagrams are accurate

Update .codelicious/STATE.md:
- Mark all completed spec-11 phases
- Update verification results table
- Update test coverage table with new modules

Ensure .pre-commit-config.yaml has these hooks:
- ruff check (with --fix for auto-fixable issues)
- ruff format
- pytest (fast subset or full suite)

Run pre-commit run --all-files to verify hooks work.
Run the full verification suite one final time.
```

---

## 7. Phase Dependency Graph

Phases are ordered to minimize merge conflicts. Independent phases can be built in parallel.

| Phase | Depends On | Can Parallel With |
|-------|------------|-------------------|
| 1 (CLI exception) | None | 2, 5, 6, 7, 10, 11, 12 |
| 2 (Command split) | None | 1, 5, 6, 7, 10, 12 |
| 3 (TOCTOU fs_tools) | None | 1, 2, 5, 6, 7, 10, 12 |
| 4 (Sandbox races) | None | 1, 2, 5, 6, 7, 10, 12 |
| 5 (API error sanitize) | None | 1, 2, 3, 4, 6, 7, 10 |
| 6 (JSON validation) | None | 1, 2, 3, 4, 5, 7, 10 |
| 7 (Path traversal) | None | 1, 2, 3, 4, 5, 6, 10 |
| 8 (HTTPS validation) | 5 | 1, 2, 3, 4, 6, 7, 10 |
| 9 (Git staging) | None | 1, 2, 3, 4, 5, 6, 7, 10 |
| 10 (Cache flush) | None | 1, 2, 3, 4, 5, 6, 7, 9 |
| 11 (Metacharacters) | 2 | 1, 3, 4, 5, 6, 7, 9, 10 |
| 12 (Logging format) | None | 1, 2, 3, 4, 6, 7, 10 |
| 13 (Case-sensitive) | 3 | 1, 2, 5, 6, 7, 10, 12 |
| 14 (Process group) | 2, 11 | 1, 3, 5, 6, 7, 10, 12 |
| 15 (Dir listing) | 3 | 1, 2, 5, 6, 7, 10, 12 |
| 16 (Regex backtrack) | None | 1, 2, 3, 4, 5, 6, 7, 10 |
| 17 (HF engine tests) | 5, 6 | 1, 2, 3, 4, 9, 10, 12 |
| 18 (Config tests) | 8 | 1, 2, 3, 4, 9, 10, 12 |
| 19 (Integration tests) | All of 1-18 | None |
| 20 (Documentation) | All of 1-19 | None |

---

## 8. Risk Assessment

### Before this spec

- 11 P1 Critical issues open
- 14 P2 Important issues open
- 18 P3 Minor issues open
- 260 tests, estimated 40% code coverage
- 5 modules with zero test coverage
- No integration tests

### After this spec (target)

- 0 P1 Critical issues open
- 0 P2 Important issues addressed (5 highest-impact closed, remainder documented)
- 18 P3 Minor issues (tracked, non-blocking)
- 400+ tests, estimated 80% code coverage
- All modules have test coverage
- Integration test infrastructure in place
- Lint, format, and security scan pass as blocking gates

### Residual Risk: LOW

The remaining P3 issues are code quality improvements and minor hardening that do not
represent exploitable vulnerabilities or reliability failures. They are tracked in STATE.md
for future cleanup.

---

## 9. Verification Checklist

After all 20 phases are complete, run these commands. All must exit 0.

```
pytest --cov=src/codelicious --cov-report=term-missing
ruff check src/ tests/
ruff format --check src/ tests/
ruff check src/ --select=S
pre-commit run --all-files
```

Count verification:

```
pytest --co -q | tail -1
```

Expected output: "400+ tests collected" (exact number depends on implementation).

Security verification:

```
grep -rn "shell=True" src/codelicious/ | grep -v "#" | grep -v "test_"
grep -rn 'except Exception: pass' src/codelicious/
grep -rn 'except:$' src/codelicious/
grep -rn 'logger\.\w*(f"' src/codelicious/
```

All four grep commands should return zero results.
