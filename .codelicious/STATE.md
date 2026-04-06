# codelicious Build State

## Current Status

**Last Updated:** 2026-04-05
**Current Spec:** spec-21: Test Coverage, Security Hardening, and Documentation Accuracy
**Phase:** spec-21 COMPLETE — all 22 phases done
**Status:** VERIFIED GREEN — 1898 tests passing, lint clean, format clean
**Completed This Session:** spec-20 (all 22 phases), spec-21 (all 22 phases)

## Next Step

No remaining specs. All specs through spec-23 are complete. The codebase is at MVP certification with 1898 tests, zero lint violations, and all security findings resolved.

## spec-20 Final Certification (COMPLETE)

| Check | Status | Details |
|-------|--------|---------|
| Tests | PASS | 1872 tests passing |
| Lint | PASS | ruff check — zero violations |
| Format | PASS | ruff format — all 78 files formatted |
| Security | PASS | No eval/exec/shell=True in production code |
| Dependencies | PASS | Zero runtime dependencies (stdlib only) |
| S20-P1 Critical | 5/5 FIXED | SSRF, git staging, permissions, prompt injection, SQLite |
| S20-P2 Important | 11/11 FIXED | Sandbox, denylist, backoff, locks, tokenize, cleanup, atomic write |
| S20-P3 Minor | 10/10 FIXED | Fail-closed, ReDoS, redaction, config, summary, parser |
| Documentation | PASS | CLAUDE.md rules, STATE.md, README.md diagrams updated |
| BUILD_COMPLETE | DONE | Written to .codelicious/BUILD_COMPLETE |

## Verification Results

| Check | Status | Details |
|-------|--------|---------|
| Tests | PASS | 1898 tests passed in ~41s |
| Coverage | PASS | 90%+ line coverage (threshold: 90%) |
| Lint | PASS | All checks passed (ruff check) |
| Format | PASS | All files formatted (ruff format) |
| Security | PASS | No eval(), exec(), shell=True, hardcoded secrets, or SQL injection in production code |
| Deep Review | COMPLETE | 89 findings fixed across performance, reliability, security, QA |

---

## Security Review Findings (Deep Review - 2026-03-22, Updated Pass 3)

### Latest Comprehensive Review (6 Modules in Parallel)

**Modules Reviewed:** agent_runner.py, command_runner.py, sandbox.py, verifier.py, executor.py, planner.py

#### New P1 Findings (All FIXED in spec-23)

| ID | Location | Description | Status |
|----|----------|-------------|--------|
| ~~REV-P1-1~~ | ~~`agent_runner.py:459,471`~~ | ~~Assertions in threaded context (disabled with -O)~~ | **FIXED:** spec-23 Phase 1 — replaced with if-guard |
| ~~REV-P1-2~~ | ~~`executor.py:254-257`~~ | ~~ReDoS in markdown regex (quadratic time)~~ | **FIXED:** spec-16 Phase 10 (Matches P2-11) |
| ~~REV-P1-3~~ | ~~`sandbox.py:239`~~ | ~~TOCTOU race in exists() check~~ | **FIXED:** spec-23 Phase 1 — _written_paths tracking |
| ~~REV-P1-4~~ | ~~`planner.py:445,620`~~ | ~~JSON deserialization without depth limits~~ | **FIXED:** spec-23 Phase 1 — _safe_json_loads with 5MB/50-depth limits |
| ~~REV-P1-5~~ | ~~`verifier.py:262-278`~~ | ~~Subprocess timeout doesn't kill process~~ | **FIXED:** spec-23 Phase 1 — start_new_session + killpg |

#### New P2 Findings (All FIXED in spec-23)

| ID | Location | Description | Status |
|----|----------|-------------|--------|
| ~~REV-P2-1~~ | ~~`agent_runner.py:591-596`~~ | ~~Thread lifecycle race condition~~ | **FIXED:** spec-23 Phase 2 — removed misleading is_alive checks |
| ~~REV-P2-2~~ | ~~`command_runner.py:14`~~ | ~~CommandDeniedError defined but never raised~~ | **FIXED:** spec-23 Phase 2 — dead code removed |
| ~~REV-P2-3~~ | ~~`sandbox.py:254`~~ | ~~mkdir exist_ok=True hides symlink substitution~~ | **FIXED:** spec-23 Phase 2 — post-mkdir realpath verification |
| ~~REV-P2-4~~ | ~~`verifier.py:459-468`~~ | ~~Incomplete secret patterns (Stripe, JWT, SSH)~~ | **FIXED:** spec-16 Phase 9 (Matches P2-9) |
| ~~REV-P2-5~~ | ~~`planner.py:210-270`~~ | ~~Timing attack on intent classifier~~ | **FIXED:** spec-23 Phase 2 — constant-time pattern checking |

**Note:** All REV findings are now FIXED. Zero open P1 or P2 findings remain. 1563 tests passing.

---

## Security Review Findings (Prior - 2026-03-19)

### Critical (P1) - 10 Issues (4 fixed in spec-08)

| ID | Location | Description | Status |
|----|----------|-------------|--------|
| ~~P1-1~~ | ~~`fs_tools.py:28-47`~~ | ~~TOCTOU race condition~~ | **FIXED:** Delegates to Sandbox.write_file |
| ~~P1-2~~ | ~~`command_runner.py:50,76`~~ | ~~Command injection via whitespace - split() vs shlex.split() mismatch~~ | **FIXED:** spec-16 Phase 1 |
| ~~P1-3~~ | ~~`fs_tools.py:87-88`~~ | ~~Symlink attack~~ | **FIXED:** Sandbox atomic write |
| ~~P1-4~~ | ~~`sandbox.py:215-228,349-350`~~ | ~~File count increment race - counter after write, not during validation~~ | **FIXED:** spec-16 Phase 2 |
| ~~P1-5~~ | ~~`sandbox.py:349-350`~~ | ~~Overwrite count bug - counter increments even for existing files~~ | **FIXED:** spec-16 Phase 2 |
| ~~P1-6~~ | ~~`sandbox.py:240-248`~~ | ~~Symlink TOCTOU gap - window between check and write~~ | **FIXED:** spec-16 Phase 2 |
| ~~P1-7~~ | ~~`llm_client.py:118-122`~~ | ~~API key logging risk~~ | **FIXED:** spec-16 Phase 3 |
| ~~P1-8~~ | ~~`cli.py:111-114`~~ | ~~Silent exception swallowing - `except Exception: pass`~~ | **FIXED:** spec-16 Phase 4 |
| ~~P1-9~~ | ~~`loop_controller.py:95-96,159`~~ | ~~JSON deserialization without size/depth limits - DoS vector~~ | **FIXED:** spec-16 Phase 5 |
| ~~P1-10~~ | ~~`planner.py:356-404`~~ | ~~Path traversal bypass~~ | **FIXED:** spec-16 Phase 6 - iterative decode loop |
| ~~P1-11~~ | ~~`agent_runner.py:105`~~ | ~~Prompt injection - unsanitized prompt to subprocess~~ | **FIXED:** spec-16 Phase 7 - sanitize_prompt function |

### Important (P2) - 13 Issues (4 fixed in spec-08)

| ID | Location | Description | Status |
|----|----------|-------------|--------|
| ~~P2-1~~ | ~~`fs_tools.py:23-26`~~ | ~~Incomplete path traversal~~ | **FIXED:** Sandbox.resolve_path |
| ~~P2-2~~ | ~~`fs_tools.py:46-47`~~ | ~~Information disclosure~~ | **FIXED:** SandboxViolationError |
| ~~P2-3~~ | ~~`command_runner.py:79-86`~~ | ~~Missing process group timeout - orphaned children~~ | **FIXED:** spec-16 Phase 1 |
| ~~P2-4~~ | ~~`fs_tools.py:49-65`~~ | ~~Case-sensitive bypass~~ | **FIXED:** Sandbox handles |
| ~~P2-5~~ | ~~`fs_tools.py:100-117`~~ | ~~DoS via large directory tree - no depth/count limits~~ | **FIXED:** spec-16 Phase 8 - max_depth/max_entries limits |
| ~~P2-6~~ | ~~`sandbox.py:277`~~ | ~~Race in directory creation - mkdir outside lock~~ | **FIXED:** spec-16 Phase 2 |
| ~~P2-7~~ | ~~`sandbox.py:365-370`~~ | ~~Silent chmod failure~~ | **FIXED:** spec-16 Phase 2 |
| ~~P2-8~~ | ~~`verifier.py:810-817`~~ | ~~Command injection edge cases - newlines not blocked~~ | **FIXED:** spec-16 Phase 9 - pre-shlex.split() newline check |
| ~~P2-9~~ | ~~`verifier.py:459-468`~~ | ~~Secret detection gaps - base64, hex secrets missed~~ | **FIXED:** spec-16 Phase 9 - added Google, Stripe, JWT, base64 patterns |
| ~~P2-10~~ | ~~`agent_runner.py:410-434`~~ | ~~Timeout overrun - up to 1s beyond configured~~ | **FIXED:** spec-16 Phase 7 - 0.1s polling interval |
| ~~P2-11~~ | ~~`executor.py:254-256`~~ | ~~Regex catastrophic backtracking~~ | **FIXED:** spec-16 Phase 10 - state machine parsers |
| ~~P2-12~~ | ~~`build_logger.py:163-178`~~ | ~~Race in file creation - permissions after open~~ | **FIXED:** spec-16 Phase 11 - atomic os.open(0o600)+os.fdopen |
| ~~P2-13~~ | ~~`logger.py:26-67`~~ | ~~Incomplete redaction - SSH keys, NPM tokens, webhooks~~ | **FIXED:** spec-16 Phase 3 |
| ~~P2-14~~ | ~~`audit_logger.py:8-10`~~ | ~~Global log level mutation~~ | **FIXED:** Phase 8 |
| P2-NEW-1 | `git_orchestrator.py:164-168` | Missing timeout on git push | Mitigated (push already has timeout=120) |
| ~~P2-NEW-2~~ | ~~`verifier.py:190-196,262-278`~~ | ~~subprocess.run without process group~~ | **FIXED:** spec-23 Phase 1 — start_new_session + killpg |

### Minor (P3) - 18+ Issues

- Magic numbers without constants (multiple files)
- Missing type hints on some functions
- Inconsistent error handling (soft fail vs exception)
- Broad exception catching (`except Exception`)

---

## Positive Security Practices Observed

1. **Frozen Security Constants**: `DENIED_COMMANDS`, `BLOCKED_METACHARACTERS` use frozenset
2. **Defense in Depth**: Multiple validation layers (denylist + metacharacters + shell=False)
3. **Atomic File Operations**: tempfile + os.replace pattern throughout
4. **Thread-Safe Resource Limits**: Lock-protected file count and operations
5. **Comprehensive Audit Logging**: Dedicated security.log with structured events
6. **Path Validation**: Multi-layer checks using POSIX and native parsers
7. **Protected Paths**: DENIED_PATTERNS prevents LLM from modifying security files
8. **Credential Sanitization**: Extensive regex patterns in logger.py
9. **Intent Classification**: LLM-based malicious spec detection
10. **Immutable System Prompts**: Security prompts hardcoded, not from config

---

## Completed Tasks

### spec-21 Phases 17-22: Documentation, CI, Exceptions, Fixtures, Metrics, Diagrams (COMPLETE)

- [x] Phase 17: README documentation discrepancies — pre-resolved (spec-22 Phase 10 updated all counts)
- [x] Phase 18: CI pipeline improvements — pre-resolved (spec-19 Phase 8: Python 3.14-dev, coverage 90%, CLI check)
- [x] Phase 19: Bare exception clauses — all `except BaseException` are intentional fd cleanup; `except Exception` in correct locations
- [x] Phase 20: Sample test data fixtures — 6 new fixtures created:
  - `sample_budget_state.json`, `sample_config_env.json`, `sample_orchestrator_phases.json`
  - `adversarial_inputs.json` (20 path traversal + 20 shell injection variants)
  - `sample_llm_responses/tool_call_response.txt`, `sample_llm_responses/rate_limit_response.txt`
- [x] Phase 21: STATE.md metrics — updated per-phase throughout spec-21
- [x] Phase 22: Mermaid diagrams — pre-resolved (spec-20 Phase 21 added 5 diagrams)
- [x] **spec-21 is COMPLETE: all 22 phases resolved**

### spec-21 Phase 16: Test Coverage — Remaining Low-Coverage Modules (COMPLETE)

- [x] Phase 16a (engines/__init__.py): 2 new tests in `TestExplicitEngineSelection`:
  - `test_select_engine_explicit_huggingface_without_token_raises`
  - `test_select_engine_explicit_claude_without_binary_raises`
- [x] Phase 16b (planner.py): All spec-listed tests already covered by existing 113 tests
- [x] Phase 16c (registry.py): 2 new tests in `TestRegistryCoverageS21`:
  - `test_dispatch_unknown_tool_returns_failure`, `test_dispatch_calls_audit_logger`
- [x] Phase 16d (logger.py): 3 new tests in `TestTimingContextAndLogCallDetails`:
  - `test_timing_context_measures_elapsed`, `test_timing_context_logs_failure`, `test_log_call_details_format`
- [x] Phase 16e (prompts.py): 4 new tests in `TestPromptsRenderAndConstants`:
  - `test_render_substitution`, `test_render_no_args_returns_unchanged`
  - `test_all_prompt_constants_are_strings`, `test_agent_build_spec_contains_template_vars`
- [x] Phase 16: All 1898 tests passing, lint clean, format clean

### spec-21 Phase 15: Test Coverage — huggingface_engine.py (COMPLETE)

- [x] Phase 15: 7/10 spec-listed tests already covered by existing 25 tests
- [x] Phase 15: 3 new tests in `TestHuggingFaceEngineCoverageS21`:
  - `test_tool_call_invalid_json_handled` — malformed JSON in tool call args caught gracefully
  - `test_tool_dispatch_specific_tool_called` — verifies dispatch receives correct tool name and args
  - `test_spec_filter_sanitized_in_system_prompt` — spec_filter with special chars doesn't crash
- [x] Phase 15: 28 total huggingface_engine tests, all passing
- [x] Phase 15: All 1887 tests passing, lint clean, format clean

### spec-21 Phase 14: Test Coverage — orchestrator.py (COMPLETE)

- [x] Phase 14: 8/10 spec-listed tests already covered by existing 56 tests
- [x] Phase 14: 5 new tests in `TestReviewerPromptsStructure` + `TestReviewRoleDataclass`:
  - `test_reviewer_prompts_is_dict_with_string_values`
  - `test_reviewer_prompts_has_security_role`
  - `test_reviewer_prompts_contain_template_vars`
  - `test_review_role_fields`, `test_review_role_is_frozen`
- [x] Phase 14: 61 total orchestrator tests, all passing
- [x] Phase 14: All 1884 tests passing, lint clean, format clean

### spec-21 Phase 13: Test Coverage — config.py (COMPLETE)

- [x] Phase 13: 10/14 spec-listed tests already covered by existing 86 tests
- [x] Phase 13: `_parse_env_int` and `_parse_env_float` — already had 10 direct unit tests
- [x] Phase 13: `build_config()` — already had comprehensive tests for all CLI flags and validation
- [x] Phase 13: `PolicyConfig` — already had 8 tests including endpoint validation and budget
- [x] Phase 13: 4 new tests in `TestParseEnvBool`:
  - `test_true_values` (8 truthy variants), `test_false_values` (7 falsy variants)
  - `test_absent_returns_default_true`, `test_absent_returns_default_false`
- [x] Phase 13: 90 total config tests, all passing
- [x] Phase 13: All 1879 tests passing, lint clean, format clean

### spec-21 Phase 12: Test Coverage — budget_guard.py (COMPLETE)

- [x] Phase 12: 7/10 spec-listed tests already covered by existing 30 tests
- [x] Phase 12: 3 new tests in `TestBudgetGuardCoverageS21`:
  - `test_budget_guard_fresh_state` (zero calls, zero cost, full calls_remaining)
  - `test_default_limits` (max_calls and max_cost match module constants)
  - `test_cost_calculation_formula` (verifies exact cost = tokens * rates / 1M)
- [x] Phase 12: 33 total budget_guard tests, all passing
- [x] Phase 12: All 1875 tests passing, lint clean, format clean

### spec-21 Phases 1-11: Security Findings + Backoff Clamping (COMPLETE)

- [x] Phases 1-9: All pre-resolved by specs 16, 22, 23, and 20:
  - P2-12 (build logger race) — spec-16 Phase 11
  - P2-NEW-1 (git push timeout) — already has timeout=120
  - P2-NEW-2 (verifier process group) — spec-23 Phase 1
  - REV-P1-1 through REV-P1-5 — spec-23 Phase 1
  - REV-P2-1 through REV-P2-5 — spec-23 Phase 2
- [x] Phase 10: Logger ReDoS (S21-P2-1) — verified not exploitable (50KB in 0.000s, pre-filter skips non-matching)
- [x] Phase 11: Backoff timeout clamping (S21-P2-2) — added `min(max(backoff, 1.0), 300.0)` to claude_engine.py
- [x] Phase 11: 3 new tests in `TestBackoffTimeoutClamping`:
  - `test_backoff_clamps_high_value_to_300`, `test_backoff_clamps_low_value_to_1`
  - `test_backoff_uses_default_on_garbage`
- [x] All 1872 tests passing, lint clean, format clean

### spec-20 Phase 22: Final Verification and Certification (COMPLETE)

- [x] Phase 22: pytest — 1869 tests passing in ~41s
- [x] Phase 22: ruff check — zero violations
- [x] Phase 22: ruff format — all 78 files formatted
- [x] Phase 22: Security scan — all findings are false positives (string literals in docs/patterns)
- [x] Phase 22: Runtime dependencies — NONE (stdlib only)
- [x] Phase 22: 1564 test functions across 41 test files (1869 collected with parameterized)
- [x] Phase 22: CLAUDE.md — all 5 spec-20 security rules present
- [x] Phase 22: STATE.md — all phases documented with completion status
- [x] Phase 22: README.md — 5 new Mermaid diagrams rendering correctly
- [x] Phase 22: BUILD_COMPLETE — "DONE" written
- [x] **spec-20 is COMPLETE: 26/26 findings resolved across 22 phases**

### spec-20 Phase 21: Mermaid Diagrams for README.md (COMPLETE)

- [x] Phase 21: Added 5 Mermaid diagrams to README.md before "Zero Dependencies" section:
  1. **S20 Finding Resolution Flow** — flowchart: 26 findings → 18 phases → zero open
  2. **Git Staging Safety (Before/After)** — sequence diagram: git add . vs git add -u with abort
  3. **LLM Endpoint Validation** — flowchart: URL → parse → scheme → DNS → IP check → accept/reject
  4. **Thread Safety Model** — block diagram: Sandbox, BudgetGuard, AuditLogger locks
  5. **Credential Redaction Pipeline** — flowchart: msg → sanitize → args → sanitize → format → sanitize → output
- [x] Phase 21: All 1869 tests passing, lint clean, format clean

### spec-20 Phase 20: Documentation Update Cycle (COMPLETE)

- [x] Phase 20: Added Security Policy section to CLAUDE.md with 5 spec-20 rules:
  - No `git add .`, no `--dangerously-skip-permissions`, HTTPS-only endpoints
  - No sensitive file commits, sanitize user input before prompt rendering
- [x] Phase 20: Updated CLAUDE.md Git & PR Policy to match orchestrator-owned workflow
- [x] Phase 20: STATE.md already up to date from per-phase updates (Phases 1-19)
- [x] Phase 20: All 1869 tests passing, lint clean, format clean

### spec-20 Phase 19: Sample Dummy Data and Edge Case Fixtures (COMPLETE)

- [x] Phase 19: Created 10 new fixture files in `tests/fixtures/`:
  - `empty_spec.md` (0 bytes), `frontmatter_only_spec.md` (YAML only)
  - `circular_deps.json` (A→B→A), `malformed_llm_response.json` (missing keys)
  - `no_code_blocks_response.txt`, `nested_backticks_response.txt`
  - `unicode_filename_response.txt`, `private_ip_endpoints.json` (7 invalid URLs)
  - `sensitive_filenames.json` (19 patterns), `deprecated_config.json`
- [x] Phase 19: Added 11 new fixtures to `conftest.py`:
  - `empty_spec_path`, `frontmatter_only_spec_path`, `circular_deps_plan`
  - `malformed_llm_response`, `no_code_blocks_response`, `unicode_filename_response`
  - `private_ip_endpoints`, `sensitive_filenames`, `nested_backticks_response`
  - `deprecated_config`, `pathological_backticks` (programmatic 2MB+)
- [x] Phase 19: Total fixture files: 24 (13 pre-existing + 11 new)
- [x] Phase 19: All 1869 tests passing, lint clean, format clean

### spec-20 Phase 18: Spec Parser Input Validation (COMPLETE)

- [x] Phase 18: Verified all parser guards already in place:
  - `MAX_FILE_SIZE = 1_048_576` (1 MB) at module level
  - Size check via `len(raw) > MAX_FILE_SIZE` → `FileTooLargeError`
  - UTF-8 decode with `UnicodeDecodeError` → `FileEncodingError`
  - Null byte check `"\x00" in content` → `ParseError`
- [x] Phase 18: 6 new tests in `TestSpecParserInputValidation`:
  - `test_parser_rejects_oversized_spec`, `test_parser_rejects_binary_content`
  - `test_parser_strips_null_bytes`, `test_parser_accepts_valid_utf8`
  - `test_parser_accepts_unicode_content`, `test_parser_size_limit_configurable`
- [x] Phase 18: All 1869 tests passing, lint clean, format clean
- [x] **All S20 security findings (5 P1 + 11 P2 + 10 P3) now resolved in Phases 1-18**

### spec-20 Phase 17: Build Summary and Coverage Fixes (COMPLETE)

- [x] Phase 17: Added `_escape_markdown_cell(value)` helper — replaces `|` with `\|`, newlines with spaces (S20-P3-7)
- [x] Phase 17: Applied `_escape_markdown_cell` to check name and message in `write_build_summary` table rows
- [x] Phase 17: Added `timeout: int = 180` parameter to `check_coverage` (S20-P3-8)
- [x] Phase 17: Replaced hardcoded `timeout=180` with the parameter in subprocess.run call
- [x] Phase 17: 6 new tests in `TestBuildSummaryAndCoverage`:
  - `test_build_summary_escapes_pipe_in_title`, `test_build_summary_escapes_pipe_in_error`
  - `test_build_summary_handles_newline_in_cell`, `test_escape_markdown_cell_helper`
  - `test_coverage_timeout_default_180`, `test_coverage_timeout_used_in_subprocess`
- [x] Phase 17: All 1863 tests passing, lint clean, format clean

### spec-20 Phase 16: Dead Configuration Removal (COMPLETE)

- [x] Phase 16: Removed `allowlisted_commands` from defaults in `loop_controller.py` and `huggingface_engine.py` (S20-P3-4)
- [x] Phase 16: Added deprecation warning + `del` when `allowlisted_commands` found in loaded config (both files)
- [x] Phase 16: Updated 3 existing tests to reflect config no longer contains `allowlisted_commands`
- [x] Phase 16: Updated 1 HF engine test (`test_config_json_filters_disallowed_keys`)
- [x] Phase 16: 4 new tests in `TestAllowlistedCommandsDeprecation`:
  - `test_config_without_allowlisted_commands_loads`
  - `test_config_with_allowlisted_commands_logs_deprecation_warning`
  - `test_command_runner_ignores_config_allowlist`
  - `test_config_template_does_not_contain_allowlisted_commands`
- [x] Phase 16: All 1857 tests passing, lint clean, format clean

### spec-20 Phase 15: Credential Redaction Timing Fix (COMPLETE)

- [x] Phase 15: Added early-format sanitization to `SanitizingFilter.filter()` (S20-P3-3)
- [x] Phase 15: After individual msg/args sanitization, calls `record.getMessage()` → `sanitize_message()` → replaces `record.msg`, clears `record.args`
- [x] Phase 15: Updated 4 existing tests to check formatted output instead of intermediate `record.args`
- [x] Phase 15: 6 new tests in `TestCredentialRedactionTiming`:
  - `test_secret_in_format_arg_is_redacted`, `test_secret_in_msg_is_redacted`
  - `test_secret_spanning_msg_and_args_is_redacted`, `test_non_secret_format_args_preserved`
  - `test_integer_format_args_not_corrupted`, `test_empty_args_handled`
- [x] Phase 15: All 1853 tests passing, lint clean, format clean

### spec-20 Phase 14: ReDoS-Safe Markdown Parsing (COMPLETE)

- [x] Phase 14: Verified state machine parser already in place (spec-16 Phase 10 replaced regex)
- [x] Phase 14: Updated path normalization comment: "Early filter for path traversal. The sandbox's resolve_path() is the definitive guard." (S20-P3-5)
- [x] Phase 14: 8 new tests in `TestReDoSSafeMarkdownParsing`:
  - `test_parse_normal_code_block`, `test_parse_multiple_code_blocks`
  - `test_parse_nested_backticks_no_hang` (pathological 30KB backtick input < 5s)
  - `test_parse_empty_code_block`, `test_parse_code_block_with_language`
  - `test_parse_code_block_with_filename`, `test_parse_large_input_completes_in_time` (2MB+ < 5s)
  - `test_path_normalization_comment_accuracy`
- [x] Phase 14: All 1847 tests passing, lint clean, format clean

### spec-20 Phase 13: Intent Classifier Fail-Closed Semantics (COMPLETE)

- [x] Phase 13: Inverted exception handling in `classify_intent` — fail closed by default (S20-P3-1)
- [x] Phase 13: Only `json.JSONDecodeError` fails open (LLM response unparseable → allow)
- [x] Phase 13: All other exceptions (KeyError, ValueError, AttributeError, RuntimeError, OSError, etc.) → reject
- [x] Phase 13: Removed unused LLM error type imports from classify_intent
- [x] Phase 13: Updated docstring to reflect fail-closed semantics
- [x] Phase 13: Updated existing `test_value_error_returns_true` → `test_value_error_returns_false`
- [x] Phase 13: 6 new tests in `TestClassifyIntentFailClosed`:
  - `test_classify_fails_closed_on_key_error`, `test_classify_fails_closed_on_attribute_error`
  - `test_classify_fails_closed_on_value_error`, `test_classify_fails_open_on_json_decode_error`
  - `test_classify_fails_closed_on_runtime_error`, `test_classify_succeeds_on_safe_spec`
- [x] Phase 13: All 1839 tests passing, lint clean, format clean

### spec-20 Phase 12: Atomic Write Path Validation (COMPLETE)

- [x] Phase 12: Added `project_root` keyword parameter to `atomic_write_text` (S20-P2-10)
- [x] Phase 12: When `project_root` is set: resolves target, verifies within root, rejects symlinks
- [x] Phase 12: `mode` parameter already existed — no change needed for permissions
- [x] Phase 12: Updated `scaffold()` — all 3 `atomic_write_text` calls pass `project_root=project_root`
- [x] Phase 12: Updated `scaffold_claude_dir()` — passes `project_root=project_root` + `mode=0o600` for settings.json
- [x] Phase 12: 8 new tests in `TestAtomicWritePathValidation`:
  - `test_write_within_project_root_succeeds`, `test_write_outside_project_root_raises`
  - `test_write_with_symlink_target_raises`, `test_write_default_permissions_0644`
  - `test_write_sensitive_permissions_0600`, `test_write_without_project_root_allows_any_path`
  - `test_write_creates_parent_directories`, `test_write_atomic_replace_not_truncate`
- [x] Phase 12: All 1833 tests passing, lint clean, format clean

### spec-20 Phase 11: Build Logger Cleanup Safety (COMPLETE)

- [x] Phase 11: Verified symlink safety already in place (lines 67-72: `is_symlink()` + `is_relative_to()`) (S20-P2-9)
- [x] Phase 11: Verified uppercase "Z" check already in place (line 79: `endswith("Z")`) (S20-P3-6)
- [x] Phase 11: Added `logger.warning("Event dropped: session closed, event_type=%s", event)` to `emit()` (S20-P3-9)
- [x] Phase 11: Added warning to `write_phase_header()` for consistency
- [x] Phase 11: 8 new tests in `TestBuildLoggerCleanupSafety`:
  - `test_cleanup_skips_symlinks`, `test_cleanup_validates_path_within_builds_dir`
  - `test_cleanup_timestamp_case_matches_generation`, `test_cleanup_actually_removes_old_sessions`
  - `test_cleanup_preserves_recent_sessions`, `test_emit_after_close_logs_warning`
  - `test_emit_after_close_does_not_write`, `test_session_close_is_idempotent`
- [x] Phase 11: All 1825 tests passing, lint clean, format clean
- [x] **All S20-P2 important findings (S20-P2-1 through S20-P2-11) now resolved**

### spec-20 Phase 10: Multiline String Tracker Replacement (COMPLETE)

- [x] Phase 10: Added `import io, tokenize` to verifier.py
- [x] Phase 10: Added `_get_string_line_ranges(source)` helper using `tokenize.generate_tokens`:
  - Only skips interior lines of multiline (multi-line-span) strings
  - Skips single-line triple-quoted strings (docstrings) entirely
  - Falls back to empty set on `TokenError` (invalid Python scanned conservatively)
  - Does NOT skip single-line regular strings (secret patterns need those)
- [x] Phase 10: Replaced 40-line heuristic (`in_multiline_string` / `line.count(delim) % 2`) with 3-line tokenize check
- [x] Phase 10: Opening/closing lines of multiline strings still scanned (code before `"""` caught by `_strip_string_literals`)
- [x] Phase 10: 8 new tests in `TestTokenizeStringDetection`:
  - `test_scanner_skips_eval_inside_docstring`, `test_scanner_catches_eval_outside_docstring`
  - `test_scanner_handles_double_triple_quotes_on_one_line`, `test_scanner_handles_mixed_quote_styles`
  - `test_scanner_handles_f_string_with_eval`, `test_scanner_fallback_on_invalid_syntax`
  - `test_scanner_multiline_string_spanning_many_lines`, `test_scanner_raw_string_with_dangerous_pattern`
- [x] Phase 10: All 1817 tests passing, lint clean, format clean

### spec-20 Phase 9: Thread Safety for BudgetGuard and AuditLogger (COMPLETE)

- [x] Phase 9: Verified `BudgetGuard._lock` already exists (spec-22 Phase 6) — `record()`, `check()`, and all properties lock-protected
- [x] Phase 9: Verified `AuditLogger._write_lock` already exists (Finding 51) — `_write_to_file` and `_write_to_security_log` lock-protected
- [x] Phase 9: 3 new tests in `TestBudgetGuardThreadSafetyS20`:
  - `test_budget_guard_lock_exists` — verifies `_lock` is a `threading.Lock`
  - `test_budget_guard_no_lost_increments` — 100 threads x 100 records = 10,000 exact
  - `test_budget_guard_concurrent_check_and_record` — mixed concurrent check/record no exceptions
- [x] Phase 9: 5 new tests in `TestAuditLoggerThreadSafety`:
  - `test_audit_logger_lock_exists` — verifies `_write_lock` is a `threading.Lock`
  - `test_audit_logger_thread_safe_write` — 10 threads x 50 writes = 500 exact lines
  - `test_audit_logger_no_interleaved_output` — every line starts with `[` and contains `TOOL_DISPATCH`
  - `test_audit_logger_concurrent_write_ordering` — 8 threads x 10 entries = 80 exact lines
  - `test_audit_logger_large_entry_atomicity` — 5KB entries remain atomic across 4 threads
- [x] Phase 9: All 1809 tests passing, lint clean, format clean

### spec-20 Phase 8: LLM Rate Limiting and Exponential Backoff (COMPLETE)

- [x] Phase 8: Added `retry_after_s` attribute to `LLMRateLimitError` with keyword-only init (default 60.0)
- [x] Phase 8: Added `import random` and `from codelicious.errors import LLMRateLimitError` to HF engine
- [x] Phase 8: Catches `LLMRateLimitError` separately — sleeps for `min(e.retry_after_s, 60)` seconds (S20-P2-6)
- [x] Phase 8: Changed transient backoff from `min(2**n, 60)` to `min(2.0 * 2**n + jitter, 30)` (S20-P2-4)
- [x] Phase 8: Changed abort threshold from `> max_retries` to `>= max_retries` for exact 5-failure abort
- [x] Phase 8: 10 new tests in `TestRateLimitAndBackoff`:
  - `test_rate_limit_sleeps_for_retry_after`, `test_rate_limit_caps_at_60_seconds`
  - `test_transient_error_exponential_backoff`, `test_backoff_caps_at_30_seconds`
  - `test_consecutive_failures_abort_at_5`, `test_success_resets_failure_counter`
  - `test_non_transient_error_raises_immediately`, `test_backoff_includes_jitter`
  - `test_retry_logs_warning_with_delay`, `test_normal_iteration_no_delay`
- [x] Phase 8: All 1801 tests passing, lint clean, format clean

### spec-20 Phase 7: Verify Command Denylist Argument Checking (COMPLETE)

- [x] Phase 7: Added `_SCRIPT_EXTENSIONS` frozenset (`.sh`, `.bash`, `.py`, `.rb`, `.pl`)
- [x] Phase 7: Added `_validate_command_args(args, repo_path)` helper that:
  - Checks each argument basename (with/without extension) against `DENIED_COMMANDS`
  - Validates script files with path separators: resolves path, rejects if outside repo
- [x] Phase 7: Integrated `_validate_command_args` into `check_custom_command` after metacharacter check
- [x] Phase 7: 8 new tests in `TestCommandArgDenylist`:
  - `test_denylist_rejects_python_as_argument`, `test_denylist_rejects_bash_script_argument`
  - `test_denylist_allows_safe_arguments`, `test_denylist_rejects_denied_command_in_path`
  - `test_denylist_allows_repo_internal_scripts`, `test_denylist_rejects_external_scripts`
  - `test_denylist_checks_all_arguments_not_just_first`, `test_verify_command_with_safe_echo_target`
- [x] Phase 7: All 1791 tests passing, lint clean, format clean

### spec-20 Phase 6: Directory Listing Sandbox Enforcement (COMPLETE)

- [x] Phase 6: Set `followlinks=False` on `os.walk` in `native_list_directory` (S20-P2-2)
- [x] Phase 6: Added sandbox boundary validation for every walk root — resolves path and checks against `repo_prefix`
- [x] Phase 6: Added sandbox boundary validation for individual file paths within each directory
- [x] Phase 6: Added `logger` import and debug logging for skipped paths
- [x] Phase 6: Updated `DEFAULT_MAX_DEPTH` from 3 to 10, `DEFAULT_MAX_ENTRIES` from 1000 to 5000
- [x] Phase 6: 8 new tests in `TestDirectoryListingSandbox`:
  - `test_walk_followlinks_false`, `test_walk_path_outside_sandbox_skipped`
  - `test_walk_symlink_not_followed`, `test_walk_depth_limit_enforced`
  - `test_walk_entry_count_limit_enforced`, `test_walk_normal_directory_succeeds`
  - `test_walk_empty_directory_returns_empty`, `test_walk_nested_directories`
- [x] Phase 6: All 1783 tests passing, lint clean, format clean

### spec-20 Phase 5: SQLite Database Permissions and Path Validation (COMPLETE)

- [x] Phase 5: Added `_validate_db_path()` method to `RagEngine` — checks resolved path within project, rejects symlinks
- [x] Phase 5: Added `os.chmod(db_path, 0o600)` after database creation for owner-only permissions
- [x] Phase 5: Imported `SandboxViolationError` for path validation failures
- [x] Phase 5: Resolved `repo_path` in `__init__` to prevent TOCTOU on relative paths
- [x] Phase 5: 6 new tests in `TestDatabaseSecurity`:
  - `test_database_permissions_are_0600`, `test_database_path_within_repo`
  - `test_database_path_outside_repo_raises`, `test_database_symlink_dir_rejected`
  - `test_database_created_in_codelicious_dir`, `test_database_close_flushes_wal`
- [x] Phase 5: All 1775 tests passing, lint clean, format clean
- [x] **All 5 S20-P1 critical findings now resolved (Phases 1-5)**

### spec-20 Phase 4: Prompt Injection Sanitization (COMPLETE)

- [x] Phase 4: Added `_SAFE_PATH_RE` regex and `_MAX_SPEC_FILTER_LEN = 256` constants
- [x] Phase 4: Added `_sanitize_spec_filter()` — strips all chars except `[a-zA-Z0-9/_.\- ]`, enforces 256 char limit
- [x] Phase 4: Applied `_sanitize_spec_filter(spec_filter)` in `_run_single_cycle` before `render()` call
- [x] Phase 4: Verified `render()` uses safe `{{key}}` replacement (no eval/exec/format)
- [x] Phase 4: 8 new tests in `TestSanitizeSpecFilter`:
  - `test_spec_filter_strips_newlines`, `test_spec_filter_strips_shell_metacharacters`
  - `test_spec_filter_allows_normal_path`, `test_spec_filter_length_limit`
  - `test_spec_filter_empty_string`, `test_spec_filter_unicode_stripped`
  - `test_rendered_prompt_does_not_contain_injection`, `test_injection_check_runs_on_agent_prompts`
- [x] Phase 4: All 1769 tests passing, lint clean, format clean

### spec-20 Phase 3: Remove --dangerously-skip-permissions (COMPLETE)

- [x] Phase 3: Removed all `--dangerously-skip-permissions` logic from `_build_agent_command` (S20-P1-3)
- [x] Phase 3: Removed unused `os` import after env var logic removal
- [x] Phase 3: Added `FORBIDDEN_CLI_FLAGS` frozenset constant
- [x] Phase 3: Added `_validate_command_flags()` pre-dispatch validation — raises `PolicyViolationError`
- [x] Phase 3: Added `_validate_command_flags(cmd)` call in `run_agent()` before `subprocess.Popen`
- [x] Phase 3: Verified `scaffold_claude_dir()` already writes settings.json with comprehensive allow/deny permissions
- [x] Phase 3: Replaced 7 old `TestAllowDangerousEnvVar` tests with 3 `TestDangerousFlagNeverPresent` tests
- [x] Phase 3: 6 new tests in `TestForbiddenCLIFlags`:
  - `test_command_does_not_contain_dangerously_skip_permissions`
  - `test_forbidden_flag_validation_raises`, `test_validate_command_flags_clean_passes`
  - `test_forbidden_cli_flags_is_frozenset`, `test_agent_subprocess_command_structure`
  - `test_scaffolded_settings_has_permissions`
- [x] Phase 3: All 1761 tests passing, lint clean, format clean

### spec-20 Phase 2: Git Staging Safety (COMPLETE)

- [x] Phase 2: Added `.p12`, `.pfx`, `aws/credentials` to `SENSITIVE_PATTERNS` frozenset (S20-P1-2)
- [x] Phase 2: Replaced `git add .` with `git add -u` in `commit_verified_changes` — never stages untracked files (S20-P1-2)
- [x] Phase 2: Added newline/CR validation for `files_to_stage` paths — raises `GitOperationError` (S20-P2-1)
- [x] Phase 2: Changed `_check_staged_files_for_sensitive_patterns` from warning-only to hard abort via `GitOperationError` (S20-P1-2)
- [x] Phase 2: Removed `_unstage_sensitive_files` call from `commit_verified_changes` — sensitive check now single-point abort (S20-P2-7)
- [x] Phase 2: Ensured `_check_staged_files_for_sensitive_patterns` called exactly once after staging (S20-P2-7)
- [x] Phase 2: Updated 3 existing tests to match new raise-on-sensitive behavior
- [x] Phase 2: 12 new tests in `TestGitStagingSafety`:
  - `test_staging_uses_git_add_u_not_dot`, `test_staging_explicit_files_happy_path`
  - `test_staging_rejects_newline_in_filename`, `test_staging_rejects_newline_raises_git_operation_error`
  - `test_sensitive_file_aborts_commit_env/pem/key/netrc`
  - `test_sensitive_check_called_once_not_twice`, `test_staging_no_sensitive_files_proceeds`
  - `test_sensitive_patterns_list_completeness`, `test_commit_with_clean_staged_files_succeeds`
- [x] Phase 2: All 1759 tests passing, lint clean, format clean

### spec-20 Phase 1: SSRF Prevention in LLM Client (COMPLETE)

- [x] Phase 1: Added `ConfigurationError` to `errors.py` for invalid/insecure configuration values
- [x] Phase 1: Added `from __future__ import annotations` to `errors.py`, `llm_client.py`, `git_orchestrator.py` for Python 3.9 compat
- [x] Phase 1: Rewrote `_validate_endpoint_url` with full SSRF prevention:
  - HTTPS-only scheme enforcement (no HTTP/FTP/file)
  - `_ALLOWED_ENDPOINT_BASES` frozenset for known-good HuggingFace URLs (bypass DNS check)
  - DNS resolution via `socket.getaddrinfo` for non-allowlisted endpoints
  - IP address validation via `ipaddress` module: rejects loopback, link-local, and private (RFC-1918) ranges
- [x] Phase 1: Updated existing `test_custom_endpoint` to mock DNS resolution for non-allowlisted URL
- [x] Phase 1: 13 new tests (8 base + parameterized variants) in `TestEndpointURLValidation`:
  - `test_rejects_http_scheme`, `test_rejects_ftp_scheme`, `test_rejects_file_scheme`
  - `test_rejects_localhost` (loopback), `test_rejects_link_local` (169.254.x.x)
  - `test_rejects_private_10_range` (2 params), `test_rejects_private_172_range` (2 params), `test_rejects_private_192_range` (2 params)
  - `test_accepts_valid_https_endpoint`, `test_accepts_allowlisted_endpoint`
- [x] Phase 1: All 1747 tests passing, lint clean, format clean

### spec-19 Phase 9: Extract Shared Utility Functions (COMPLETE)

- [x] Phase 9: Created _env.py with parse_env_int, parse_env_float, parse_env_str, parse_env_csv (CD-1)
- [x] Phase 9: budget_guard.py — replaced _parse_env_rate with _env.parse_env_float (CD-1)
- [x] Phase 9: verifier.py — replaced _parse_env_timeout with _env.parse_env_int (CD-1)
- [x] Phase 9: progress.py — replaced _parse_max_progress_bytes with _env.parse_env_int (CD-1)
- [x] Phase 9: sandbox.py — replaced _build_allowed_extensions inline parsing with _env.parse_env_csv (CD-1)
- [x] Phase 9: _io.py — added read_text_safe() wrapping UnicodeDecodeError handling (CD-2)
- [x] Phase 9: sandbox.py — refactored read_file() to use _io.read_text_safe (CD-2)
- [x] Phase 9: CD-3 deferred (try-except-log patterns are contextually different across engines)
- [x] Phase 9: Updated test_config_overrides.py to use shared _env functions instead of removed private helpers
- [x] Phase 9: 22 new tests in test_env.py (int/float/str/csv: valid, invalid, empty, boundary, validator)

### spec-19 Phase 8: CI Workflow Hardening (COMPLETE)

- [x] Phase 8: ci.yml — Added Python 3.14-dev to matrix with continue-on-error and fail-fast: false (CI-4)
- [x] Phase 8: ci.yml — Added "Verify CLI installs correctly" step: codelicious --help (CI-2)
- [x] Phase 8: ci.yml — Added --cov-report=xml to pytest for artifact upload (CI-1, CI-5)
- [x] Phase 8: ci.yml — Added upload-artifact@v4 for coverage.xml per Python version (CI-5)
- [x] Phase 8: ci.yml — Added --strict to pip-audit in security job (CI-3)
- [x] Phase 8: YAML validated with PyYAML safe_load
- [x] Phase 8: 0 new tests (CI config change)

### spec-19 Phase 7: Dev Dependency Version Pinning (COMPLETE)

- [x] Phase 7: pyproject.toml — pytest>=7.0,<9.0 (DP-1)
- [x] Phase 7: pyproject.toml — pytest-cov>=4.0,<6.0 (DP-2)
- [x] Phase 7: pyproject.toml — ruff>=0.4.0,<1.0 (DP-3)
- [x] Phase 7: pyproject.toml — bandit>=1.7.0,<2.0; pip-audit>=2.6.0,<3.0; pre-commit>=3.0.0,<5.0 (DP-4)
- [x] Phase 7: 0 new tests (metadata-only change)

### spec-19 Phase 6: Test Fixture Expansion with Edge Cases (COMPLETE)

- [x] Phase 6: conftest.py — edge_case_spec_path: 5 parameterized variations (empty, single-line, YAML frontmatter, code blocks, template vars) (TF-1)
- [x] Phase 6: conftest.py — edge_case_plan: 5 parameterized variations (zero tasks, single no deps, circular deps, empty file_paths, 10k-char description) (TF-2)
- [x] Phase 6: conftest.py — edge_case_code_response: 6 parameterized variations (empty, single file, two files, malformed, null bytes, unicode filename) (TF-3)
- [x] Phase 6: conftest.py — unicode_filename_dir: tmp directory with accented, CJK, and Spanish filenames (TF-4)
- [x] Phase 6: 43 new tests in test_edge_case_fixtures.py (16 fixture variations x multiple assertions + 5 unicode dir tests)
- [x] Phase 6: Existing fixtures untouched — zero regressions

### spec-19 Phase 5: README-to-CLI Accuracy Reconciliation (COMPLETE)

- [x] Phase 5: Rewrote CLI Reference section to match actual cli.py _parse_args (DD-1, DD-3, DD-6)
- [x] Phase 5: Removed phantom flags (--verify-passes, --no-reflect, --push-pr, --max-iterations, --dry-run, --spec) that don't exist in CLI (DD-2)
- [x] Phase 5: Added --allow-dangerous flag and env var documentation (DD-4)
- [x] Phase 5: Marked --resume and --allow-dangerous as "(Claude engine only)" (DD-4)
- [x] Phase 5: Verified LICENSE file exists with MIT text — README License section is accurate (DD-5)
- [x] Phase 5: Added note about hardcoded orchestrate mode parameters
- [x] Phase 5: 0 new tests (documentation-only change)

### spec-19 Phase 4: Edge Case Closure (COMPLETE)

- [x] Phase 4: executor.py — _normalize_file_path() rejects triple-dot+ components (regex \.{3,}) and UNC paths (// or \\) (EC-1)
- [x] Phase 4: context_manager.py — estimate_tokens() docstring updated with approximation note and Unicode caveat (EC-2)
- [x] Phase 4: verifier.py — _strip_string_literals() rewritten: multi-char prefix handling (rb, br, fb, etc.), bytes literals with escape processing, f-string {expr} preservation, _strip_fstring_content helper (EC-3)
- [x] Phase 4: sandbox.py — read_file() catches UnicodeDecodeError, raises FileReadError with filename (EC-4)
- [x] Phase 4: 22 new tests in test_edge_cases.py (triple-dot, UNC, dotfiles, docstring, emoji, bytes literals, f-strings, raw strings, binary file read, UTF-8 baseline)

### spec-19 Phase 3: Resource Cleanup — File Handle and Temp File Leaks (COMPLETE)

- [x] Phase 3: progress.py — __del__ logs WARNING when handle not properly closed, skips warning for None-path reporters (RC-1)
- [x] Phase 3: _io.py — fd_owned flag tracks os.fdopen ownership; fd closed in except path when fdopen fails (RC-2)
- [x] Phase 3: sandbox.py — RC-3 confirmed already fixed (tmp_name=None before try, checked in except)
- [x] Phase 3: 7 new tests in test_resource_cleanup.py (__del__ warning, no warning when closed, no warning for None-path, fd leak on fdopen failure, temp file cleanup, sandbox tempfile failure, baseline write)

### spec-19 Phase 2: Error Message Quality Improvements (COMPLETE)

- [x] Phase 2: sandbox.py — All PathTraversalError messages include resolved path and project root (EM-1)
- [x] Phase 2: sandbox.py — Symlink-based vs direct path escape distinction ("Symlink resolution:" vs "Path traversal:") (EM-2)
- [x] Phase 2: config.py — max_context_tokens error includes "recommended: 4000-8000 for most models" (EM-3)
- [x] Phase 2: verifier.py — _INSTALL_GUIDANCE dict with install commands for all tools (EM-4)
- [x] Phase 2: cli.py — EM-5 confirmed already fixed by spec-16 Phase 4 (logger.exception in place)
- [x] Phase 2: 13 new tests in test_error_messages.py (path escape messages, symlink distinction, config guidance, install commands, CLI exception handling)
- [x] Phase 2: Fixed existing test_sandbox.py match pattern for updated error message

### spec-19 Phase 1: Configuration Constants with Env Var Overrides (COMPLETE)

- [x] Phase 1: budget_guard.py — CODELICIOUS_INPUT_RATE_PER_MTOK / CODELICIOUS_OUTPUT_RATE_PER_MTOK env overrides with validation
- [x] Phase 1: verifier.py — CODELICIOUS_TIMEOUT_SYNTAX/TEST/LINT/AUDIT/PLAYWRIGHT/CUSTOM_CMD/SYNTAX_PER_FILE env overrides
- [x] Phase 1: sandbox.py — CODELICIOUS_EXTRA_EXTENSIONS comma-separated merge into allowed extensions (validates leading dot, no path separators)
- [x] Phase 1: progress.py — CODELICIOUS_MAX_PROGRESS_BYTES env override with validation
- [x] Phase 1: 25 new tests in test_config_overrides.py (valid overrides, invalid fallback, empty fallback, extension validation)

### spec-18 Phases 1+3: Graceful Shutdown and RAG Resilience (COMPLETE)

- [x] Phase 1: SIGTERM handler in cli.py (sets _shutdown_requested flag, logs WARNING, raises SystemExit(143))
- [x] Phase 1: RagEngine.close() with atexit registration (WAL checkpoint flush, idempotent, context manager support)
- [x] Phase 1: ProgressReporter atexit registration (close() already idempotent, now registered via atexit)
- [x] Phase 1: KeyboardInterrupt handler sets _shutdown_requested flag
- [x] Phase 3: semantic_search returns [] on error instead of dict (consistent return type)
- [x] Phase 3: ingest_file skips empty files before chunking
- [x] Phase 4: _validate_dependencies in cli.py (git check, claude binary check, HF token check, auto fallback)
- [x] Phase 4: 5 new tests for startup validation (missing git, missing claude, auto fallback, missing token, invalid prefix)
- [x] Phase 6: Build deadline enforcement in claude_engine + HF engine (_check_deadline before each phase)
- [x] Phase 6: Per-tool timeout in registry.py (concurrent.futures ThreadPoolExecutor, 60s default)
- [x] Phase 6: ToolTimeoutError added to errors.py
- [x] Phase 6: Configurable RAG embedding timeout via CODELICIOUS_EMBEDDING_TIMEOUT env var
- [x] Phase 6: 5 new tests (deadline expired/ok, tool timeout class, RAG default/custom timeout)
- [x] Phase 7: HF engine empty choices graceful degradation (3-consecutive abort, recovery prompt injection)
- [x] Phase 7: _is_transient error classifier (transient retried, fatal re-raised immediately)
- [x] Phase 7: Executor truncation marker appended to oversized responses
- [x] Phase 7: 4 new tests (empty choices degrade, single empty recovers, truncation marker, truncation warning)
- [x] Phase 9: ToolValidationError + _validate_tool_params in registry.py (required param check before dispatch)
- [x] Phase 9: _MAX_HISTORY_MESSAGES safety net in loop_controller.py (auto-truncate at 200 messages)
- [x] Phase 9: 2 new tests (missing required param, write_file missing content)
- [x] Phase 10: Dual WARNING+DEBUG logging in HF engine exception handlers (tool call, git errors)
- [x] Phase 10: LLM API call timing instrumentation in llm_client.py (INFO log with elapsed time + model)
- [x] Phase 10: 1 new test (LLM timing logged)
- [x] Phase 11: test_engine_contract.py (10 tests: interface, fields, types, defaults for both engines)
- [x] Phase 11: CLI validation tests (4 tests: invalid engine, non-integer timeout, unknown flag, defaults)
- [x] 41 new tests total across all modified test files

### spec-23: Security Closure — Remaining Findings (COMPLETE)

- [x] Phase 1: Fix All P1 Critical Findings (REV-P1-1 assertions→if-guard, REV-P1-3 TOCTOU→_written_paths, REV-P1-4 JSON depth/size limits, P2-NEW-2 process groups→start_new_session+killpg)
- [x] Phase 2: Fix All REV-P2 Findings (REV-P2-1 thread race→remove is_alive, REV-P2-2 dead code→removed CommandDeniedError, REV-P2-3 mkdir symlink→post-mkdir realpath check, REV-P2-5 timing→constant-time pattern checking)
- [x] Phase 3: Expand Test Coverage (9 new tests: assertion guard, JSON depth/size, written_paths tracking, timing safety, nested JSON)

### spec-22: PR Deduplication, Spec-as-PR Lifecycle, and Codebase Hardening (COMPLETE)

- [x] Phase 1: Fix Spec-to-Branch Mapping (spec_branch_name, spec_id, frozenset)
- [x] Phase 2: Fix Duplicate PR Check (ensure_draft_pr_exists rewrite, spec-id title prefix dedup, timeout=30)
- [x] Phase 3: Remove PR Creation from Agent Prompt (verified — prompts already correct)
- [x] Phase 4: Wire Full Spec-as-PR Lifecycle (transition_pr_to_review spec_id, verified_green gate, orchestrator per-spec PR)
- [x] Phase 5: Fix Build Logger Cleanup Bug (uppercase Z, onerror hoisted, P2-12 already fixed)
- [x] Phase 6: Fix Audit Logger, Budget Guard, and Progress Thread Safety (levelname restore, BudgetGuard lock, progress already correct)
- [x] Phase 7: Fix Context Manager Token Budget, Parser TOCTOU, and Config Repr Safety (budget-aware file contents, read-once parser, api_key masking)
- [x] Phase 8: Fix Security Constants and Cache/RAG Engine Gaps (java/javac/cargo/dotnet/mvn/gradle added, summary truncation, WAL mode, query cap)
- [x] Phase 9: Expand Test Coverage for PR Lifecycle and Orchestrator (143 git_orchestrator tests, 59 claude_engine tests, transition spec_id, verified_green gating)
- [x] Phase 10: Final Verification and Documentation Update (README spec-as-PR lifecycle, security counts 96 commands/31 extensions, STATE.md updated)

### spec-16: Reliability, Test Coverage, and Production Readiness (COMPLETE)

- [x] Phase 1: Fix Command Injection in command_runner.py (P1-2, P2-3)
- [x] Phase 2: Fix All Sandbox Race Conditions (P1-4, P1-5, P1-6, P2-6, P2-7)
- [x] Phase 3: Fix API Key Exposure and Secret Redaction (P1-7, P2-13)
- [x] Phase 4: Fix Silent Exception Swallowing in cli.py (P1-8)
- [x] Phase 5: Fix JSON Deserialization Without Validation (P1-9)
- [x] Phase 6: Fix Path Traversal Bypass via Triple-Encoding (P1-10)
- [x] Phase 7: Fix Agent Runner Command Injection and Timeout (P1-11, P2-10)
- [x] Phase 8: Fix Directory Listing DoS (P2-5)
- [x] Phase 9: Fix Verifier Command Injection and Secret Detection (P2-8, P2-9)
- [x] Phase 10: Fix Regex Catastrophic Backtracking in executor.py (P2-11)
- [x] Phase 11: Fix Build Logger File Creation Race (P2-12)
- [x] Phase 12: Add Tests for config.py (pre-existing — 83 tests)
- [x] Phase 13: Add Tests for budget_guard.py (pre-existing — 15 tests)
- [x] Phase 14: Add Tests for prompts.py (pre-existing — 47 tests)
- [x] Phase 15: Add Tests for engines/base.py and huggingface_engine.py (9 + 14 tests)
- [x] Phase 16: Add Tests for tools/registry.py (11 tests)
- [x] Phase 17: Add Tests for _io.py and __main__.py (8 + 2 tests)
- [x] Phase 18: Add Coverage Reporting to CI (90% threshold, pip caching)
- [x] Phase 19: Add Pre-Commit Configuration (ruff + bandit hooks)
- [x] Phase 20: Verify Spec-08 Remaining Phases (all confirmed complete)
- [x] Phase 21: Update README with Architecture Diagrams (3 new Mermaid diagrams)
- [x] Phase 22: Final Verification (1502 tests, 90% coverage, BUILD_COMPLETE written)

### spec-08: Hardening, Reliability, and Code Quality (COMPLETE)

- [x] Phase 1: Fix BuildResult.success Always-True Bug
- [x] Phase 2: Implement CacheManager.flush_cache
- [x] Phase 3: Unify Metacharacter Constants and Add Interpreter Denylist
- [x] Phase 4: Unify FSTooling Write Path Through Sandbox
- [x] Phase 5: Fix Git Staging to Use Explicit File Lists
- [x] Phase 6: Bound Message History in HuggingFace Engine
- [x] Phase 7: Fix Logging to Use Percent-Style Formatting
- [x] Phase 8: Fix audit_logger.py Global Log Level Mutation
- [x] Phase 9: Fix conftest.py Stale proxilion-build References
- [x] Phase 10: Sanitize LLM API Error Bodies
- [x] Phase 11: Cap RAG Engine top_k and Add SQLite Index
- [x] Phase 12: Declare Dev Dependencies in pyproject.toml
- [x] Phase 13: Fix BuildSession.__exit__ Success Reporting
- [x] Phase 14: Add Missing .gitignore Entries
- [x] Phase 15: Comprehensive Test Suite Expansion
- [x] Phase 16: Update Documentation and State

### spec-07: Sandbox Security Hardening (COMPLETE)

- [x] All 6 phases complete
- [x] All 16 acceptance criteria met

### Key Test Coverage

| Test File | Count |
|-----------|-------|
| test_command_runner.py | 284 |
| test_git_orchestrator.py | 155 |
| test_verifier.py | 130 |
| test_planner.py | 113 |
| test_config.py | 90 |
| test_agent_runner.py | 70 |
| test_sandbox.py | 59 |
| test_claude_engine.py | 72 |
| test_orchestrator.py | 61 |
| test_loop_controller.py | 60 |
| test_logger_sanitization.py | 54 |
| test_executor.py | 57 |
| test_prompts.py | 42 |
| test_fs_tools.py | 42 |
| test_parser.py | 37 |
| test_llm_client.py | 43 |
| test_rag_engine.py | 35 |
| test_build_logger.py | 35 |
| test_budget_guard.py | 33 |
| test_security_audit.py | 28 |
| test_context_manager.py | 23 |
| test_cli.py | 21 |
| test_scaffolder.py | 20 |
| test_cache_engine.py | 20 |
| test_engines.py | 20 |
| test_tool_registry.py | 17 |
| test_scaffolder_v9.py | 16 |
| test_progress.py | 14 |
| test_huggingface_engine.py | 28 |
| test_registry.py | 15 |
| test_integration_v11.py | 11 |
| test_engine_base.py | 9 |
| test_io.py | 16 |
| test_main.py | 2 |

| test_config_overrides.py | 25 |
| test_error_messages.py | 13 |
| test_resource_cleanup.py | 7 |
| test_edge_cases.py | 22 |
| test_edge_case_fixtures.py | 43 |
| test_env.py | 22 |

**Total: 1852 tests** (1898 collected by pytest including parameterized)

---

## PR Status

- **URL:** https://github.com/clay-good/codelicious/pull/5
- **Branch:** `codelicious/auto-build`
- **Status:** Draft - spec-16 Phase 8 complete

---

## Risk Assessment

**Overall Risk:** LOW-MEDIUM

The codebase has strong security fundamentals with multiple defense layers. All original P1 critical issues are FIXED. New P1s from deep review are lower severity due to defense-in-depth:

- **0 Original P1 Critical**: All 11 resolved (spec-16 Phases 1-7)
- **5 New REV-P1**: Documented for spec-17 (mitigated by existing controls)
- **0 P2 Important**: P2-12 fixed in Phase 11, P2-8/P2-9 fixed in Phase 9, P2-11 fixed in Phase 10

The implementation is production-ready for controlled environments.

**Deep Review (Pass 3):** 6 modules reviewed in parallel (~8,000 lines)
- agent_runner.py: B+ security, B code quality
- command_runner.py: MEDIUM risk, strong shell=False enforcement
- sandbox.py: Strong foundation, TOCTOU hardening recommended
- verifier.py: 8 findings, subprocess cleanup needed
- executor.py: 1 P1 ReDoS, 3 P2, 4 P3
- planner.py: Excellent path traversal defense, JSON depth limits needed
