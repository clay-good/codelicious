---
version: 1.0.0
status: Draft
date: 2026-03-20
author: Claude Opus 4.6 (spec generation), Clay Good (review)
depends_on: ["18_operational_resilience_v1.md", "17_security_quality_hardening_v1.md", "16_reliability_test_coverage_v1.md"]
related_specs: ["00_master_spec.md", "07_sandbox_security_hardening.md", "08_hardening_reliability_v1.md", "15_parallel_agentic_loops_v1.md"]
supersedes: []
---

# spec-19: Code Quality Hardening, Edge Case Closure, and Developer Experience

## 1. Executive Summary

After 18 prior specifications, the codelicious codebase has 580+ passing tests, zero lint violations,
a 9-layer security model, and dual-engine architecture. Specs 16 and 17 systematically close all P1/P2
security findings. Spec 18 adds operational resilience (signal handling, retries, startup validation,
cumulative timeouts). However, a deep code-level audit reveals a distinct category of gaps that none
of those specs address: code quality deficiencies, edge case failures, resource leaks, documentation
drift, test fixture weakness, and developer experience friction.

This spec addresses 47 specific gaps across 15 categories:

- Hardcoded configuration constants with no override mechanism (4 modules)
- Cryptic or unhelpful error messages that hinder debugging (5 locations)
- Resource cleanup gaps: file handle leaks and temp file orphans (3 modules)
- Edge cases in path normalization, token estimation, and security scanning (4 modules)
- Documentation drift: README CLI reference does not match argparse definitions (6 discrepancies)
- Test fixture realism: conftest stubs do not exercise boundary conditions (3 fixture families)
- Dev dependency version ranges too loose, risking CI breakage (4 packages)
- CI workflow gaps: no coverage enforcement, no install sanity check, no strict audit (5 gaps)
- Code duplication: repeated environment parsing and file I/O patterns (3 locations)
- Type safety: missing return type hints and untyped kwargs (5 modules)
- Prompt template variable injection risk (1 module)
- Dry-run mode creates filesystem side effects despite claiming no-op (2 modules)
- Configuration validation gaps at startup (2 modules)
- Logger permission enforcement gaps (1 module)
- Inconsistent error handling patterns across engines (3 modules)

This spec does not introduce new features. Every phase fixes a real, measured gap in the existing
codebase that would cause confusing failures, maintenance burden, or developer friction under
real-world usage conditions.

### Motivation

Codelicious has reached functional completeness and is closing its security backlog through specs
16-18. The next risk frontier is developer experience and maintainability. When a user encounters a
cryptic error message, a leaked file handle, or a README that contradicts the actual CLI flags, they
lose trust in the tool even if the security model is sound. When a contributor opens the codebase and
finds duplicated patterns, missing type hints, and test fixtures that only exercise the happy path,
they cannot confidently make changes without risking regressions.

These gaps do not cause security vulnerabilities (those are spec-17 scope) or crash-on-failure
behavior (spec-18 scope). They cause slow, compounding degradation of code quality, developer
confidence, and maintainability. This spec closes every one of them.

### Codebase Metrics (Measured 2026-03-20, Post-Spec-16 Phase 1)

| Metric | Current Value | Target After This Spec |
|--------|---------------|------------------------|
| Source modules | 30 in src/codelicious/ | 30 (no new modules) |
| Source lines | ~8,800 | ~9,400 (+600 net for validation, cleanup, type hints) |
| Passing tests | 580+ | 650+ (+70 for edge case, dry-run, fixture, and config tests) |
| P1 critical findings | 6 open (spec-17 scope) | 6 open (unchanged, spec-17 owns these) |
| P2 important findings | 11 open (spec-17 scope) | 11 open (unchanged, spec-17 owns these) |
| Code quality gaps (this spec) | 47 | 0 |
| Functions with return type hints | ~60% | 95%+ |
| README-to-CLI accuracy | 4 discrepancies | 0 |
| Test fixtures with edge cases | 0 | 12+ parameterized edge case fixtures |
| Dry-run filesystem side effects | 2 (mkdir calls) | 0 |
| Runtime dependencies | 0 (stdlib only) | 0 (unchanged) |

### Relationship to Specs 16, 17, and 18

Specs 16 and 17 focus on security findings (P1/P2), test coverage expansion, credential redaction,
and CI quality gates. Spec 18 focuses on operational resilience under failure conditions (signals,
retries, timeouts, startup validation of external tools). This spec is orthogonal: it addresses code
quality, developer experience, and maintainability concerns that only manifest during development,
debugging, or onboarding -- not during security audits or production failures.

The only shared files are:
- cli.py (spec-17 Phase 1 fixes silent exception swallowing; spec-18 Phase 1 adds signal handlers;
  this spec Phase 2 improves error message quality in argument validation)
- sandbox.py (spec-17 Phases 2-3 fix race conditions; this spec Phase 4 fixes read_file
  UnicodeDecodeError handling and Phase 12 fixes dry-run mkdir side effects)
- verifier.py (spec-17 Phase 8 fixes subprocess process groups; this spec Phase 4 improves error
  guidance for missing tools)

In all cases the changes are additive and target different code paths within the same files.

### Logic Breakdown (Post-Spec-19)

| Category | Estimated Lines | Percentage | Description |
|----------|-----------------|------------|-------------|
| Deterministic safety harness | ~4,200 | 45% | sandbox, verifier, command_runner, fs_tools, audit_logger, security_constants, config validation |
| Probabilistic LLM-driven | ~3,600 | 38% | planner, executor, llm_client, agent_runner, loop_controller, prompts (with safe templating), context_manager, rag_engine, engines |
| Shared infrastructure | ~1,600 | 17% | cli, logger, cache_engine, tools/registry, config, errors, git_orchestrator, build_logger, progress, type stubs |

The deterministic safety harness grows as configuration validation, error message improvements, and
type annotations are added. The probabilistic layer stays constant in line count but gains safer
template rendering. Shared infrastructure grows modestly from extracted utilities and type stubs.

---

## 2. Scope and Non-Goals

### In Scope

1. Replace hardcoded configuration constants with environment-variable-overridable defaults in
   budget_guard.py, verifier.py, sandbox.py, and progress.py.
2. Improve error messages in cli.py, sandbox.py, config.py, and verifier.py to include actual values,
   root causes, and actionable guidance.
3. Fix resource cleanup gaps in progress.py, _io.py, and sandbox.py (file handle leaks, temp file
   orphans).
4. Close edge cases in executor.py (path normalization), context_manager.py (unicode token
   estimation), verifier.py (f-string/bytes literal handling in security scanner), and sandbox.py
   (UnicodeDecodeError on binary file reads).
5. Correct all README-to-CLI discrepancies (flag names, defaults, missing flags, engine-specific
   behavior).
6. Expand test fixtures in conftest.py with parameterized edge cases (circular dependencies, empty
   files, malformed spec blocks, multi-file responses, unicode filenames).
7. Tighten dev dependency version ranges in pyproject.toml with upper bounds.
8. Close CI workflow gaps: add coverage enforcement, install sanity check, strict pip-audit, and
   Python 3.14 to test matrix.
9. Extract duplicated environment parsing and file I/O patterns into shared utilities.
10. Add return type hints to all public functions across 5+ modules.
11. Fix prompt template variable injection risk in prompts.py.
12. Eliminate dry-run filesystem side effects in sandbox.py and document dry-run behavior in
    engines/base.py.
13. Add configuration validation (model name format, API key non-empty, writable output directory)
    in config.py and cli.py.
14. Fix logger permission enforcement gap in logger.py.
15. Standardize error handling patterns across cli.py, claude_engine.py, and huggingface_engine.py.

### Non-Goals

- New features, new CLI flags, new engine backends, or new tool implementations.
- Security finding closure (spec-17 scope).
- Operational resilience patterns like retries, signal handling, or cumulative timeouts (spec-18
  scope).
- Performance optimization or parallelism changes (spec-15 scope).
- API documentation generation (Sphinx, MkDocs) or ADR creation.
- License selection or open-source release preparation.
- Breaking changes to the public CLI interface.

---

## 3. Definitions

| Term | Meaning |
|------|---------|
| Configuration constant | A hardcoded value (timeout, limit, rate) embedded directly in source code with no override mechanism |
| Environment-variable override | A pattern where a constant has a default but can be changed via an environment variable at runtime |
| Edge case | An input or condition at the boundary of expected behavior that the current code does not handle gracefully |
| Test fixture | A reusable test data object or factory defined in conftest.py and used across multiple test files |
| Dry-run mode | A CLI flag (--dry-run) that should log planned actions without modifying the filesystem or making network calls |
| Template variable injection | A condition where user-controlled input in a template variable expands or corrupts adjacent template syntax |
| Type stub | A return type annotation or TypedDict definition that makes function signatures self-documenting |
| CI quality gate | A GitHub Actions job step that must pass for a PR to be merge-eligible |

---

## 4. Acceptance Criteria (Global)

All of the following must be true after all phases of this spec are complete:

1. All 580+ existing tests continue to pass with zero regressions.
2. At least 70 new tests are added, bringing the total to 650+.
3. Zero README-to-CLI discrepancies remain.
4. All public functions in cli.py, config.py, engines/base.py, progress.py, and prompts.py have
   return type hints.
5. conftest.py contains parameterized edge case fixtures for circular dependencies, empty inputs,
   malformed blocks, and unicode filenames.
6. Dry-run mode creates zero filesystem side effects (no directories, no files, no temp artifacts).
7. All error messages in sandbox.py, cli.py, config.py, and verifier.py include actual values and
   actionable guidance.
8. pyproject.toml dev dependencies have upper bounds.
9. CI workflow includes coverage enforcement at 80%+ threshold, install sanity check, and Python
   3.14 in the test matrix.
10. prompts.py template rendering is safe against variable injection.
11. Lint (ruff check) and format (ruff format --check) pass with zero violations.
12. No new runtime dependencies are introduced.

---

## 5. Code Quality Findings Registry

### Configuration Hardening (CH) Findings

| ID | Location | Description | Resolved In |
|----|----------|-------------|-------------|
| CH-1 | budget_guard.py:16-20 | Pricing constants hardcoded, no env override | Phase 1 |
| CH-2 | verifier.py:37-44 | Timeout constants hardcoded, no env override for slow CI | Phase 1 |
| CH-3 | sandbox.py:29-72 | Extension allowlist not extensible via env | Phase 1 |
| CH-4 | progress.py:22 | Max progress bytes hardcoded, no env override | Phase 1 |

### Error Message Quality (EM) Findings

| ID | Location | Description | Resolved In |
|----|----------|-------------|-------------|
| EM-1 | sandbox.py:133-134 | Path traversal error does not show resolved path | Phase 2 |
| EM-2 | sandbox.py:148-152 | PathTraversalError is generic, no root cause distinction | Phase 2 |
| EM-3 | config.py:260-261 | max_context_tokens error has no suggested value | Phase 2 |
| EM-4 | verifier.py:569 | "pytest not installed" has no install guidance | Phase 2 |
| EM-5 | cli.py:113-114 | Silent exception after PR transition (spec-17 overlap, additive) | Phase 2 |

### Resource Cleanup (RC) Findings

| ID | Location | Description | Resolved In |
|----|----------|-------------|-------------|
| RC-1 | progress.py:56-80 | File handle leak if close() not called | Phase 3 |
| RC-2 | _io.py:32 | Temp file orphan if exception before fdopen | Phase 3 |
| RC-3 | sandbox.py:290-298 | Temp file cleanup gap if mkstemp fails | Phase 3 |

### Edge Case (EC) Findings

| ID | Location | Description | Resolved In |
|----|----------|-------------|-------------|
| EC-1 | executor.py:65-89 | Path normalization misses triple-dot and UNC paths | Phase 4 |
| EC-2 | context_manager.py:31-48 | Token estimation wrong for unicode/emoji | Phase 4 |
| EC-3 | verifier.py:600-648 | Security scanner misses f-string and bytes literals | Phase 4 |
| EC-4 | sandbox.py:359-367 | read_file crashes on binary files with UnicodeDecodeError | Phase 4 |

### Documentation Drift (DD) Findings

| ID | Location | Description | Resolved In |
|----|----------|-------------|-------------|
| DD-1 | README.md:149 | Shows --agent-timeout, code uses --agent-timeout-s | Phase 5 |
| DD-2 | README.md:145-150 | Missing --dry-run and --max-iterations from CLI reference | Phase 5 |
| DD-3 | README.md:149 | Default timeout value not verified against argparse | Phase 5 |
| DD-4 | README.md:145-155 | No engine-specific flag documentation | Phase 5 |
| DD-5 | README.md:831 | License says MIT but project is private org, no LICENSE file | Phase 5 |
| DD-6 | README.md:145 | CLI synopsis format inconsistent with argparse output | Phase 5 |

### Test Fixture (TF) Findings

| ID | Location | Description | Resolved In |
|----|----------|-------------|-------------|
| TF-1 | conftest.py:13-18 | sample_spec_path has no multi-line or dependency content | Phase 6 |
| TF-2 | conftest.py:22-43 | canned_plan has no circular dependency case | Phase 6 |
| TF-3 | conftest.py:47-49 | canned_code_response has no multi-file or malformed case | Phase 6 |
| TF-4 | tests/ | No edge case fixtures for empty inputs or unicode filenames | Phase 6 |

### Dependency Pinning (DP) Findings

| ID | Location | Description | Resolved In |
|----|----------|-------------|-------------|
| DP-1 | pyproject.toml:34 | pytest>=7.0 has no upper bound | Phase 7 |
| DP-2 | pyproject.toml:35 | pytest-cov>=4.0 has no upper bound | Phase 7 |
| DP-3 | pyproject.toml:36 | ruff>=0.4.0 has no upper bound | Phase 7 |
| DP-4 | pyproject.toml:37-38 | bandit and pip-audit have no upper bounds | Phase 7 |

### CI Workflow (CI) Findings

| ID | Location | Description | Resolved In |
|----|----------|-------------|-------------|
| CI-1 | ci.yml | No coverage enforcement job | Phase 8 |
| CI-2 | ci.yml | No post-install sanity check | Phase 8 |
| CI-3 | ci.yml | pip-audit not using --strict | Phase 8 |
| CI-4 | ci.yml:14 | Python 3.14 in classifiers but not in CI matrix | Phase 8 |
| CI-5 | ci.yml | No artifact upload for coverage reports | Phase 8 |

### Code Duplication (CD) Findings

| ID | Location | Description | Resolved In |
|----|----------|-------------|-------------|
| CD-1 | config.py, budget_guard.py | Duplicated env var parsing with fallback logic | Phase 9 |
| CD-2 | verifier.py, sandbox.py | Duplicated file read with exception handling | Phase 9 |
| CD-3 | cli.py, claude_engine.py, huggingface_engine.py | Duplicated try-except-log patterns | Phase 9 |

### Type Safety (TS) Findings

| ID | Location | Description | Resolved In |
|----|----------|-------------|-------------|
| TS-1 | cli.py:13-14 | setup_logger() missing return type | Phase 10 |
| TS-2 | engines/base.py:38 | run_build_cycle **kwargs untyped | Phase 10 |
| TS-3 | progress.py:38-54 | emit() **kwargs untyped | Phase 10 |
| TS-4 | executor.py:100-170 | parse_llm_response() return type unclear | Phase 10 |
| TS-5 | verifier.py:94 | probe_tools() unused parameter not documented | Phase 10 |

### Template Safety (TM) Findings

| ID | Location | Description | Resolved In |
|----|----------|-------------|-------------|
| TM-1 | prompts.py:225-237 | render() uses naive str.replace, vulnerable to variable injection | Phase 11 |
| TM-2 | prompts.py:36-126 | Agent prompts use template vars that could collide with spec content | Phase 11 |

### Dry-Run (DR) Findings

| ID | Location | Description | Resolved In |
|----|----------|-------------|-------------|
| DR-1 | sandbox.py:236-238 | Dry-run still calls parent.mkdir() | Phase 12 |
| DR-2 | engines/base.py | Dry-run behavior not documented in engine contract | Phase 12 |
| DR-3 | cli.py:101 | Dry-run kwarg passed but engine behavior undefined | Phase 12 |

### Config Validation (CV) Findings

| ID | Location | Description | Resolved In |
|----|----------|-------------|-------------|
| CV-1 | config.py:190-198 | No validation that model name is well-formed | Phase 13 |
| CV-2 | config.py | No validation that API key env var is non-empty when needed | Phase 13 |
| CV-3 | cli.py:68-72 | No check that .codelicious/ is writable before 45-min build | Phase 13 |

### Logger (LG) Findings

| ID | Location | Description | Resolved In |
|----|----------|-------------|-------------|
| LG-1 | logger.py:140-160 | Directory permissions not enforced on existing dirs | Phase 14 |
| LG-2 | logger.py:105-115 | SanitizingFilter mutates LogRecord in place (double-sanitize risk) | Phase 14 |

### Error Handling Consistency (EH) Findings

| ID | Location | Description | Resolved In |
|----|----------|-------------|-------------|
| EH-1 | cli.py | Broad except Exception patterns | Phase 15 |
| EH-2 | claude_engine.py | Inconsistent error classification (fatal vs transient) | Phase 15 |
| EH-3 | huggingface_engine.py | Silent failures on empty LLM responses | Phase 15 |

---

## 6. Implementation Phases

### Tier 1: Foundation (Phases 1-4, Sequential)

These phases establish the groundwork that later phases depend on.

---

### Phase 1: Configuration Constants with Environment Variable Overrides

**Findings addressed:** CH-1, CH-2, CH-3, CH-4

**As a user** running codelicious in a slow CI environment (GitHub Actions free tier with 2 vCPU),
I want to increase verifier timeouts without editing source code, so that my builds do not fail
due to infrastructure speed rather than code quality.

**As a contributor** updating the extension allowlist for a project that uses .proto or .graphql
files, I want to add extensions via an environment variable rather than forking the codebase.

**Acceptance criteria:**
- budget_guard.py reads CODELICIOUS_INPUT_RATE_PER_MTOK and CODELICIOUS_OUTPUT_RATE_PER_MTOK
  from environment, falling back to current hardcoded defaults.
- verifier.py reads CODELICIOUS_TIMEOUT_SYNTAX, CODELICIOUS_TIMEOUT_TEST,
  CODELICIOUS_TIMEOUT_LINT, CODELICIOUS_TIMEOUT_AUDIT, CODELICIOUS_TIMEOUT_PLAYWRIGHT from
  environment, falling back to current defaults.
- sandbox.py reads CODELICIOUS_EXTRA_EXTENSIONS from environment as a comma-separated list and
  merges them into the existing ALLOWED_EXTENSIONS frozenset at Sandbox.__init__ time. The base
  frozenset remains immutable. Invalid extensions (missing leading dot, containing path separators)
  are logged and skipped.
- progress.py reads CODELICIOUS_MAX_PROGRESS_BYTES from environment, falling back to 10485760.
- All environment variable parsing uses a shared helper function (see Phase 9 for extraction).
- 8 new tests validate: env override works, invalid env value falls back to default, empty env
  var falls back to default, extension validation rejects bad input.

**Root cause:** Configuration constants were embedded during initial development when the tool was
used by a single developer. As the user base grows, runtime configurability becomes necessary
without requiring source edits.

**Fix strategy:** Add environment variable reads in each module's initialization path. Use
os.environ.get() with type conversion and fallback. Validate ranges (timeouts must be positive,
rates must be non-negative). Log at DEBUG level when an override is active.

**Claude Code prompt:**

```
Read src/codelicious/budget_guard.py, src/codelicious/verifier.py, src/codelicious/sandbox.py,
and src/codelicious/progress.py. For each file:

1. Identify all hardcoded numeric or collection constants that control runtime behavior (timeouts,
   limits, rates, allowlists).
2. Add environment variable overrides using os.environ.get() with the naming convention
   CODELICIOUS_<CONSTANT_NAME>. Parse integers with int(), floats with float(), and
   comma-separated lists with str.split(",").
3. Validate parsed values: timeouts must be > 0, rates must be >= 0.0, extensions must start
   with "." and not contain "/" or "\\". Log invalid values at WARNING and fall back to defaults.
4. For sandbox.py CODELICIOUS_EXTRA_EXTENSIONS, merge the parsed set with the existing
   ALLOWED_EXTENSIONS frozenset in __init__, not at module level. Store as self._allowed_extensions.
5. Write tests in tests/test_config_overrides.py that use monkeypatch.setenv to verify: override
   works, invalid value falls back, empty string falls back, extension validation rejects bad input.

Run pytest after changes. Run ruff check src/ tests/. Fix any issues.
```

---

### Phase 2: Error Message Quality Improvements

**Findings addressed:** EM-1, EM-2, EM-3, EM-4, EM-5

**As a user** who encounters a "path is outside the project directory" error, I want to see the
actual resolved path and the project root so I can understand what went wrong and fix my spec.

**As a user** who sees "pytest not installed; cannot run tests", I want to see the exact install
command (pip install -e ".[dev]") so I can fix it immediately.

**Acceptance criteria:**
- sandbox.py PathTraversalError messages include the resolved path and the project root in the
  error string: "Resolved path '/actual/path' escapes project root '/project/root'".
- sandbox.py distinguishes between symlink-based escapes ("path resolves through symlink to...")
  and direct path escapes ("path component '..' resolves outside...").
- config.py max_context_tokens error includes: "must be >= 1000 (recommended: 4000-8000 for
  most models)".
- verifier.py tool-not-found messages include install commands: "pytest not found. Install with:
  pip install pytest (or pip install -e '.[dev]' for all dev tools)".
- 5 new tests verify that error messages contain the expected contextual information.

**Root cause:** Error messages were written during initial development when the author was the only
user and knew the context implicitly. External users need explicit guidance.

**Fix strategy:** Modify exception raise sites to include f-string interpolation of actual values.
Add install guidance as string constants to avoid repetition.

**Claude Code prompt:**

```
Read src/codelicious/sandbox.py, src/codelicious/config.py, and src/codelicious/verifier.py.

1. In sandbox.py, find every raise statement for PathTraversalError, DeniedPathError, and
   SandboxViolationError. Update the message string to include the actual resolved path and the
   project root using f-strings. For symlink-related errors, prefix with "Symlink resolution:".
   For path component errors, prefix with "Path traversal:".
2. In config.py, find the validation for max_context_tokens. Update the error message to include
   a recommended range: "must be >= 1000 (recommended: 4000-8000 for most models)".
3. In verifier.py, find every "not installed" or "not found" message for pytest, ruff, bandit,
   eslint, cargo, and go. Add the install command as guidance. For Python tools, suggest
   "pip install -e '.[dev]'" as the primary recommendation.
4. Write tests in tests/test_error_messages.py that trigger each error path and assert the
   message contains the expected contextual substring (path value, install command, etc.).

Run pytest after changes. Run ruff check src/ tests/. Fix any issues.
```

---

### Phase 3: Resource Cleanup -- File Handle and Temp File Leaks

**Findings addressed:** RC-1, RC-2, RC-3

**As a user** running codelicious in a long CI pipeline, I want file handles to be properly closed
even when exceptions occur, so that I do not hit OS file descriptor limits or leave orphaned temp
files on disk.

**Acceptance criteria:**
- progress.py ProgressReporter implements __del__ as a safety net that calls close() if the
  file handle is still open. A warning is logged if __del__ has to close it (indicating the
  caller forgot).
- _io.py wraps the mkstemp-to-fdopen sequence in a try-except that calls os.close(fd) and
  os.unlink(tmp_path) if fdopen raises.
- sandbox.py write_file() initializes tmp_name to None before the try block and checks
  "if tmp_name is not None" in the cleanup path, preventing NameError if mkstemp itself fails.
- 6 new tests verify: ProgressReporter warns on __del__ cleanup, _io.py cleans temp file on
  fdopen failure (using mock to force OSError), sandbox cleanup handles mkstemp failure.

**Root cause:** Resource cleanup was implemented for the happy path but not for all exception paths.
Python's garbage collector does not guarantee prompt file handle closure.

**Fix strategy:** Add defensive cleanup in except and finally blocks. Use __del__ as a warning
mechanism, not a primary cleanup path.

**Claude Code prompt:**

```
Read src/codelicious/progress.py, src/codelicious/_io.py, and src/codelicious/sandbox.py.

1. In progress.py, add a __del__ method to ProgressReporter that checks if self._fh is not None
   and not closed. If so, log a WARNING "ProgressReporter was not properly closed; cleaning up
   in __del__" and call self.close(). This is a safety net, not the primary cleanup mechanism.
2. In _io.py, find the mkstemp call. Wrap the sequence from mkstemp through fdopen in a
   try-except. In the except block, call os.close(fd) if fd is defined, and os.unlink(tmp_path)
   if tmp_path is defined and exists. Re-raise the exception after cleanup.
3. In sandbox.py write_file(), set tmp_name = None before the try block. In the except/finally
   cleanup block, check "if tmp_name is not None and os.path.exists(tmp_name)" before calling
   os.unlink(tmp_name).
4. Write tests in tests/test_resource_cleanup.py. Use unittest.mock to force exceptions at
   specific points and verify cleanup occurs. Test that ProgressReporter.__del__ logs a warning.

Run pytest after changes. Run ruff check src/ tests/. Fix any issues.
```

---

### Phase 4: Edge Case Closure

**Findings addressed:** EC-1, EC-2, EC-3, EC-4

**As a user** writing specs that reference files with unicode characters in their names, I want
the sandbox to handle them without crashing.

**As a user** whose project contains binary files (images, compiled assets), I want read_file()
to return a clear error rather than an opaque UnicodeDecodeError traceback.

**Acceptance criteria:**
- executor.py _normalize_file_path() rejects paths containing "..." (triple-dot or more) as
  a component, and rejects Windows UNC paths (starting with "//").
- context_manager.py estimate_tokens() documents in its docstring that the estimate is
  approximate and may over-count for emoji/multi-byte characters. No code change needed if the
  docstring is accurate.
- verifier.py _strip_string_literals() handles bytes literals (b"...", b'...') the same way as
  regular string literals. f-string expressions are left intact (only the static portions of
  f-strings are stripped).
- sandbox.py read_file() catches UnicodeDecodeError and raises a FileReadError with message:
  "Cannot read '{filename}' as text (likely a binary file). Only UTF-8 text files are supported."
- 10 new tests verify: triple-dot path rejection, UNC path rejection, bytes literal stripping,
  binary file read error message, and token estimation docstring accuracy.

**Root cause:** Initial implementation handled common cases but did not consider adversarial path
inputs, non-ASCII content, or binary files in project directories.

**Fix strategy:** Add explicit checks for each edge case. Prefer clear error messages over silent
mishandling.

**Claude Code prompt:**

```
Read src/codelicious/executor.py, src/codelicious/context_manager.py,
src/codelicious/verifier.py, and src/codelicious/sandbox.py.

1. In executor.py _normalize_file_path(), add a check after the existing ".." handling: if any
   path component matches the regex r"^\.{3,}$" (three or more consecutive dots), raise
   ValueError("Path component '...' is not allowed"). Also reject paths starting with "//" by
   checking path.startswith("//") before normalization.
2. In context_manager.py estimate_tokens(), add a docstring note: "Approximate estimate using
   3.5 chars/token for code and 4 chars/token for prose. May over-count for multi-byte Unicode
   characters (emoji, CJK). Suitable for budget estimation, not exact billing."
3. In verifier.py _strip_string_literals(), extend the regex or logic to handle b"..." and b'...'
   prefixes the same way it handles regular string literals. Ensure f-string static portions are
   stripped but expressions inside {} are preserved.
4. In sandbox.py read_file(), wrap the existing .read_text(encoding="utf-8") call in a try-except
   UnicodeDecodeError block. Raise FileReadError with a clear message including the filename.
5. Write tests in tests/test_edge_cases.py covering all four fixes with at least 2 test cases each.

Run pytest after changes. Run ruff check src/ tests/. Fix any issues.
```

---

### Tier 2: Documentation and Testing (Phases 5-8, Parallelizable)

These phases can be executed in any order or in parallel. They have no dependencies on each other
but depend on Tier 1 being complete.

---

### Phase 5: README-to-CLI Accuracy Reconciliation

**Findings addressed:** DD-1, DD-2, DD-3, DD-4, DD-5, DD-6

**As a user** reading the README to learn the CLI flags, I want the documented flag names and
defaults to exactly match what the tool actually accepts, so that I do not waste time debugging
typos in my shell commands.

**Acceptance criteria:**
- README.md CLI Reference section lists every flag defined in cli.py argparse with the exact
  flag name, type, default value, and description.
- The --agent-timeout flag name matches the argparse definition exactly (resolve DD-1).
- --dry-run and --max-iterations are listed in the CLI Reference section.
- Engine-specific flags are grouped and labeled (e.g., "Claude-only:", "HuggingFace-only:").
- The License section is updated to remove "MIT" and replace with a note that the project is
  under a private license pending open-source release, or the MIT text is kept if that is the
  intended license. Verify with the project owner.
- No new CLI flags are added. This phase only corrects documentation.

**Root cause:** README was written once and not updated as CLI flags were renamed or added in
subsequent specs.

**Fix strategy:** Read cli.py argparse definition programmatically, extract all flags with their
metadata, and rewrite the CLI Reference section to match exactly.

**Claude Code prompt:**

```
Read src/codelicious/cli.py and extract every argument added via parser.add_argument(). For each
argument, note: flag name(s), type, default, help text, choices (if any).

Then read README.md and find the "CLI Reference" section (currently around line 139-155).

Rewrite the CLI Reference section to exactly match the argparse definition. Use this format:

  codelicious <repo_path> [options]

  Options:
    --engine {auto,claude,huggingface}  Build engine (default: auto)
    --flag-name TYPE                     Description (default: VALUE)
    ...

Group flags by engine applicability if some are engine-specific. Add a note after each
engine-specific flag like "(Claude engine only)" or "(HuggingFace engine only)".

Check the License section at the bottom of README.md. If there is no LICENSE file in the repo
root, update the section to say: "Private. License to be determined." If a LICENSE file exists,
keep it consistent.

Do NOT add or remove any CLI flags. Only correct the documentation.

Run ruff check src/ tests/ after changes to verify nothing broke.
```

---

### Phase 6: Test Fixture Expansion with Edge Cases

**Findings addressed:** TF-1, TF-2, TF-3, TF-4

**As a contributor** writing new tests, I want conftest.py to provide realistic edge case fixtures
so that I can test boundary conditions without creating boilerplate in every test file.

**Acceptance criteria:**
- conftest.py contains a parameterized fixture "edge_case_spec" that yields specs with: empty
  content, single-line content, content with code blocks, content with YAML frontmatter, and
  content with template-like variables ({{var}}).
- conftest.py contains a parameterized fixture "edge_case_plan" that yields plans with: zero
  tasks, single task with no dependencies, circular dependency (A depends on B, B depends on A),
  task with empty file_paths list, and task with very long description (10,000+ characters).
- conftest.py contains a parameterized fixture "edge_case_code_response" that yields responses
  with: empty content, single file, multiple files, malformed FILE/END FILE markers, binary-like
  content (null bytes), and unicode filenames.
- conftest.py contains a fixture "unicode_filename_dir" that creates a temp directory with files
  named using unicode characters (accented letters, CJK, emoji).
- 12 new fixture variations are defined. Existing fixtures are not modified.

**Root cause:** Test fixtures were created for the happy path during initial TDD development and
not expanded as edge cases were discovered in later specs.

**Fix strategy:** Add new parameterized fixtures using pytest.fixture and pytest.mark.parametrize.
Do not modify existing fixtures to avoid breaking existing tests.

**Claude Code prompt:**

```
Read tests/conftest.py to understand existing fixtures.

Add the following new fixtures (do not modify existing ones):

1. @pytest.fixture(params=[...]) for "edge_case_spec_path": create a tmp_path spec file for each
   param: empty string, "# Minimal", a spec with YAML frontmatter, a spec with code blocks,
   a spec with {{template_var}} strings. Use ids= for readable test IDs.

2. @pytest.fixture(params=[...]) for "edge_case_plan": return plan dicts for each param: empty
   tasks list, single task with no deps, circular deps (task-a depends on task-b, task-b depends
   on task-a), task with empty file_paths, task with 10,000-char description.

3. @pytest.fixture(params=[...]) for "edge_case_code_response": return response strings for:
   empty string, single FILE/END FILE block, two FILE/END FILE blocks, malformed (missing END
   FILE), content with null bytes, content with unicode filename in FILE marker.

4. @pytest.fixture for "unicode_filename_dir": use tmp_path to create files with names like
   "resume.py", "datos.txt", and "test_file.py" (use real unicode, not escapes).

Write 12+ tests in tests/test_edge_case_fixtures.py that simply instantiate each fixture
variation and assert basic properties (type, content length, etc.) to verify the fixtures work.

Run pytest after changes. Run ruff check src/ tests/. Fix any issues.
```

---

### Phase 7: Dev Dependency Version Pinning

**Findings addressed:** DP-1, DP-2, DP-3, DP-4

**As a CI maintainer**, I want dev dependency ranges to have upper bounds so that a breaking
release of ruff or pytest does not silently break our CI pipeline on a Saturday night.

**Acceptance criteria:**
- pyproject.toml dev dependencies have upper bounds: pytest>=7.0,<9.0; pytest-cov>=4.0,<6.0;
  ruff>=0.4.0,<1.0; bandit>=1.7.0,<2.0; pip-audit>=2.6.0,<3.0.
- Upper bounds are generous enough to allow minor version upgrades but block major version
  changes that could introduce breaking API changes.
- pip install -e ".[dev]" still succeeds after the change.
- 0 new tests (this is a metadata-only change).

**Root cause:** Dev dependencies were specified with only lower bounds during initial setup.
Upper bounds were deferred because the tool was under active development and frequent updates
were expected.

**Fix strategy:** Add upper bounds to each dev dependency in pyproject.toml. Use the next major
version as the upper bound. Verify installation succeeds.

**Claude Code prompt:**

```
Read pyproject.toml. In the [project.optional-dependencies] dev section, update each dependency
to include an upper bound:

  "pytest>=7.0,<9.0",
  "pytest-cov>=4.0,<6.0",
  "ruff>=0.4.0,<1.0",
  "bandit>=1.7.0,<2.0",
  "pip-audit>=2.6.0,<3.0",

Run: pip install -e ".[dev]" to verify installation still succeeds.
Run: pytest to verify tests still pass.
Run: ruff check src/ tests/ to verify lint still passes.
```

---

### Phase 8: CI Workflow Hardening

**Findings addressed:** CI-1, CI-2, CI-3, CI-4, CI-5

**As a maintainer**, I want the CI pipeline to enforce coverage thresholds, verify the package
installs correctly, and test all declared Python versions so that quality regressions are caught
before merge.

**Acceptance criteria:**
- CI workflow adds a step after pip install that runs "codelicious --help" and asserts exit code 0.
- CI workflow adds pytest --cov=codelicious --cov-fail-under=80 to the test step.
- CI workflow changes pip-audit to use pip-audit --strict --desc to fail on warnings.
- CI workflow adds Python 3.14-dev to the test matrix (with allow-failure since 3.14 is pre-release).
- CI workflow uploads coverage report as a GitHub Actions artifact.
- All existing CI checks continue to pass.

**Root cause:** CI workflow was built incrementally and focused on correctness checks (lint, test,
security) without coverage enforcement or installation verification.

**Fix strategy:** Add steps and matrix entries to the existing ci.yml. Use continue-on-error for
the 3.14-dev entry since it is pre-release. Add pytest-cov flags to the test command.

**Claude Code prompt:**

```
Read .github/workflows/ci.yml.

Make the following changes:

1. In the test job matrix, add "3.14-dev" to python-version. Add a step-level
   continue-on-error: true for the 3.14-dev entry (use an if condition or matrix include
   with allow-failures).

2. After the "pip install -e '.[dev]'" step, add a new step:
     - name: Verify CLI installs correctly
       run: codelicious --help

3. Change the pytest command to:
     pytest --cov=codelicious --cov-report=xml --cov-fail-under=80

4. Add a step after tests to upload the coverage report:
     - name: Upload coverage report
       uses: actions/upload-artifact@v4
       with:
         name: coverage-report-py${{ matrix.python-version }}
         path: coverage.xml
       if: always()

5. In the security job, change "pip-audit --desc" to "pip-audit --strict --desc".

Run: ruff check .github/ (if applicable) to verify YAML is valid.
Verify the workflow file is valid YAML by running: python -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml'))"
```

---

### Tier 3: Code Quality (Phases 9-12, Parallelizable)

These phases can be executed in any order or in parallel. They depend on Tier 1 being complete.

---

### Phase 9: Extract Shared Utility Functions

**Findings addressed:** CD-1, CD-2, CD-3

**As a contributor**, I want environment variable parsing and file I/O error handling to be
defined once and imported everywhere, so that bug fixes in these patterns propagate to all callers.

**Acceptance criteria:**
- A new module src/codelicious/_env.py contains: parse_env_int(name, default, min_val=None,
  max_val=None), parse_env_float(name, default, min_val=None, max_val=None),
  parse_env_str(name, default), parse_env_csv(name, default_set, validator=None). Each function
  logs at DEBUG when an override is active and at WARNING when an invalid value is skipped.
- config.py and budget_guard.py import from _env.py instead of duplicating parsing logic.
- verifier.py and sandbox.py import from _env.py for their timeout and extension overrides
  (Phase 1 code refactored to use shared utilities).
- A new function read_text_safe(path) in _io.py wraps Path.read_text() with UnicodeDecodeError
  handling (Phase 4 code refactored to use this shared function).
- 8 new tests in tests/test_env.py verify all parse_env_* functions with valid, invalid, empty,
  and boundary inputs.
- Existing tests continue to pass.

**Root cause:** Environment parsing was implemented independently in multiple modules because each
module was developed in isolation during different spec phases.

**Fix strategy:** Create _env.py with the shared functions. Update callers to import from _env.py.
Verify all tests pass. The shared module has no external dependencies (stdlib only).

**Claude Code prompt:**

```
Create src/codelicious/_env.py with the following functions:

  def parse_env_int(name: str, default: int, min_val: int | None = None,
                    max_val: int | None = None) -> int:
      # Read os.environ.get(name), parse as int, validate range, return default on failure.
      # Log DEBUG when override is active. Log WARNING on invalid value.

  def parse_env_float(name: str, default: float, min_val: float | None = None,
                      max_val: float | None = None) -> float:
      # Same pattern as parse_env_int but for floats.

  def parse_env_csv(name: str, default: frozenset[str],
                    validator: Callable[[str], bool] | None = None) -> frozenset[str]:
      # Read env var, split by comma, strip whitespace, run validator on each item,
      # skip invalid items with WARNING log. Merge with default frozenset. Return frozenset.

  def parse_env_str(name: str, default: str) -> str:
      # Simple string override with DEBUG log.

Then refactor:
- budget_guard.py to use parse_env_float for pricing rates
- verifier.py to use parse_env_int for timeout constants
- sandbox.py to use parse_env_csv for extra extensions
- progress.py to use parse_env_int for max progress bytes

Write tests in tests/test_env.py covering: valid override, invalid type, empty string, below
min_val, above max_val, CSV with invalid items, CSV with empty items.

Run pytest after changes. Run ruff check src/ tests/. Fix any issues.
```

---

### Phase 10: Type Safety -- Return Type Hints and Typed Kwargs

**Findings addressed:** TS-1, TS-2, TS-3, TS-4, TS-5

**As a contributor** reading the codebase for the first time, I want every public function to have
a return type hint so that I can understand the API contract without reading the implementation.

**Acceptance criteria:**
- cli.py: setup_logger() has return type -> logging.Logger. main() has return type -> None.
- engines/base.py: run_build_cycle() documents its expected kwargs in a docstring with types
  and descriptions. Return type is -> BuildResult.
- progress.py: emit() documents its expected kwargs in a docstring.
- executor.py: parse_llm_response() has an explicit return type annotation.
- verifier.py: probe_tools() has a docstring explaining why project_dir is accepted but unused
  (future use for project-specific tool detection), or the parameter is removed if truly unused.
- All modified functions pass ruff check with no new violations.
- 0 new tests (type hints are verified by ruff and do not need runtime tests).

**Root cause:** Type hints were added inconsistently during development. Some modules have complete
annotations while others have partial or missing annotations.

**Fix strategy:** Read each file, identify public functions missing return type hints, add them.
For **kwargs, add a docstring section listing expected keys with types.

**Claude Code prompt:**

```
Read src/codelicious/cli.py, src/codelicious/engines/base.py, src/codelicious/progress.py,
src/codelicious/executor.py, and src/codelicious/verifier.py.

For each file:
1. Find every function definition (def ...) that is missing a return type annotation (-> Type).
2. Add the correct return type based on what the function actually returns.
3. For functions that accept **kwargs, add a docstring section "Keyword Args:" listing each
   expected key with its type and description.
4. For verifier.py probe_tools(), either add a docstring explaining the unused parameter or
   remove it if no callers pass it.

Do NOT change any function behavior, only annotations and docstrings.

Run ruff check src/ to verify no new violations.
Run pytest to verify no regressions.
```

---

### Phase 11: Prompt Template Safety

**Findings addressed:** TM-1, TM-2

**As a user** whose project is named "my_project}}" or whose spec contains the literal string
"{{project_name}}", I want the prompt rendering to handle these edge cases without corrupting
the prompt sent to the LLM.

**Acceptance criteria:**
- prompts.py render() uses string.Template with safe_substitute() instead of naive str.replace().
  Template variables use the $variable syntax (string.Template default) with a thin wrapper that
  accepts the existing {{variable}} syntax for backward compatibility.
- Alternatively, if string.Template is insufficient, the function pre-escapes all "$" and "{{"
  sequences in variable values before substitution.
- A test verifies that a project_name containing "}}" does not corrupt the rendered prompt.
- A test verifies that a spec_filter containing "{{project_name}}" does not cause double
  substitution.
- 4 new tests in tests/test_prompts.py cover injection edge cases.

**Root cause:** The initial render() function used simple str.replace() which is adequate for
controlled inputs but unsafe when template variable values contain template syntax characters.

**Fix strategy:** Use Python's string.Template.safe_substitute() which handles partial
substitution gracefully and does not expand unknown variables. Alternatively, escape special
characters in values before substitution.

**Claude Code prompt:**

```
Read src/codelicious/prompts.py. Find the render() function (or equivalent template rendering
function).

Replace the str.replace()-based rendering with string.Template from Python stdlib:

  from string import Template

  def render(template_str: str, **variables: str) -> str:
      # Convert {{var}} syntax to $var syntax for string.Template compatibility
      converted = template_str
      for key in variables:
          converted = converted.replace("{{" + key + "}}", "${" + key + "}")
      tmpl = Template(converted)
      return tmpl.safe_substitute(variables)

Ensure all existing callers of render() still work. The conversion from {{var}} to ${var} is
a one-time transformation that preserves backward compatibility.

Write tests in tests/test_prompts.py (or add to existing test file):
1. Test normal rendering: render("Hello {{name}}", name="World") == "Hello World"
2. Test value containing "}}": render("Project: {{name}}", name="foo}}bar") == "Project: foo}}bar"
3. Test value containing "{{other_var}}": render("A={{a}} B={{b}}", a="{{b}}", b="real")
   should result in "A={{b}} B=real" (no double substitution)
4. Test unknown variable preserved: render("{{known}} {{unknown}}", known="yes")
   should contain "yes" and "${unknown}" (or leave {{unknown}} intact)

Run pytest after changes. Run ruff check src/ tests/. Fix any issues.
```

---

### Phase 12: Dry-Run Mode Purity

**Findings addressed:** DR-1, DR-2, DR-3

**As a user** running "codelicious /path/to/repo --dry-run", I expect zero filesystem changes.
I want to preview what would happen without any directories being created or files being written.

**Acceptance criteria:**
- sandbox.py write_file() returns early before calling parent.mkdir() when self.dry_run is True.
  The log message includes the would-be file path and content length.
- engines/base.py BuildEngine class docstring documents dry-run behavior: "When dry_run=True,
  the engine must log all phases and planned actions without executing LLM calls, writing files,
  or running commands. Subclasses must check self.dry_run at each phase boundary."
- cli.py passes dry_run to the engine constructor (verify this is already happening).
- 4 new tests verify: sandbox write_file in dry-run creates no files and no directories,
  sandbox write_file in dry-run logs the intended action.

**Root cause:** Dry-run was implemented as a flag check that returns early after logging, but
the mkdir call was placed before the flag check.

**Fix strategy:** Move the dry-run check to the top of write_file() before any filesystem
operations. Add documentation to the engine base class.

**Claude Code prompt:**

```
Read src/codelicious/sandbox.py and find the write_file() method. Locate the dry_run check
and the parent.mkdir() call.

Move the dry-run check to BEFORE the mkdir call. The dry-run block should:
1. Log at INFO: "DRY-RUN: Would write {len(content)} bytes to {file_path}"
2. Return immediately without calling mkdir, mkstemp, os.replace, or any filesystem operation.

Read src/codelicious/engines/base.py. Add a docstring section to the BuildEngine class:

  Dry-Run Behavior:
      When dry_run=True is passed to the constructor, the engine must log all phases
      and planned actions without executing LLM calls, writing files, or running
      commands. Subclasses must check self.dry_run at each phase boundary.

Read src/codelicious/cli.py. Verify that --dry-run is passed to the engine. If not, add it.

Write tests in tests/test_dry_run.py:
1. Create a Sandbox with dry_run=True. Call write_file(). Assert the file does not exist.
   Assert the parent directory was not created.
2. Create a Sandbox with dry_run=True. Call write_file(). Capture log output and assert it
   contains "DRY-RUN" and the file path.

Run pytest after changes. Run ruff check src/ tests/. Fix any issues.
```

---

### Tier 4: Hardening (Phases 13-15, Sequential)

These phases depend on Tiers 1-3 being complete.

---

### Phase 13: Configuration Validation at Startup

**Findings addressed:** CV-1, CV-2, CV-3

**As a user** who accidentally sets CODELICIOUS_MODEL to an empty string or a typo like
"claude-sonet" (missing 'n'), I want the tool to catch this at startup with a clear error
rather than failing 30 minutes into a build with a cryptic HTTP 404.

**Acceptance criteria:**
- config.py adds a validate() method that checks:
  - Model name is non-empty and matches a basic format regex (alphanumeric, hyphens, dots,
    underscores, 3-100 characters).
  - If engine is "huggingface", HF_TOKEN environment variable is set and non-empty.
  - If engine is "claude", the claude binary is on PATH (shutil.which("claude") is not None).
- cli.py calls config.validate() after argument parsing and before engine selection. If
  validation fails, print the error message and exit with code 1.
- cli.py checks that the target repo path exists and that a .codelicious/ directory can be
  created (or already exists and is writable).
- 6 new tests verify: empty model name rejected, malformed model name rejected, missing HF_TOKEN
  rejected when engine is huggingface, unwritable target path rejected, valid config passes.

**Root cause:** Configuration was loaded from environment variables and CLI args without validation.
The assumption was that the user would provide correct values, which is not reliable.

**Fix strategy:** Add a validate() method to the Config class. Call it from cli.py main() before
engine selection. Use clear error messages with guidance.

**Claude Code prompt:**

```
Read src/codelicious/config.py and src/codelicious/cli.py.

1. In config.py, add a method validate(engine: str) -> list[str] that returns a list of
   validation error strings (empty list means valid). Check:
   - Model name is non-empty and matches r"^[a-zA-Z0-9][a-zA-Z0-9._-]{2,99}$"
   - If engine == "huggingface": os.environ.get("HF_TOKEN") is non-empty
   - If engine == "claude": shutil.which("claude") is not None

2. In cli.py main(), after parsing args and before engine selection:
   - Call config.validate(args.engine)
   - If errors are returned, print each error and sys.exit(1)
   - Check that args.repo_path exists and is a directory
   - Check that os.path.join(args.repo_path, ".codelicious") is writable by attempting
     os.makedirs(..., exist_ok=True) and catching PermissionError

3. Write tests in tests/test_config_validation.py using monkeypatch to set/unset env vars
   and mock shutil.which. Test: empty model, bad model format, missing HF_TOKEN, missing
   claude binary, valid config, unwritable path.

Run pytest after changes. Run ruff check src/ tests/. Fix any issues.
```

---

### Phase 14: Logger Permission and Sanitization Fixes

**Findings addressed:** LG-1, LG-2

**As a security-conscious user**, I want the log directory to have restrictive permissions (0o700)
even if it was previously created with more permissive settings, and I want log sanitization to
not corrupt log records if they are processed twice.

**Acceptance criteria:**
- logger.py setup_logging() calls os.chmod(log_dir, 0o700) after mkdir, regardless of whether
  the directory already existed. If chmod fails, log a WARNING with the specific error and
  continue (do not crash).
- logger.py SanitizingFilter.filter() operates on a copy of record.msg rather than mutating in
  place. Uses copy.copy(record) or creates a new string from the original before applying
  regex substitutions.
- 4 new tests verify: existing directory gets chmod applied, chmod failure is logged but does
  not crash, double-filtering a LogRecord does not double-redact (e.g., "REDACTED" does not
  become "REDACTED" with extra markers).

**Root cause:** Directory permission enforcement was only applied during creation (mkdir), not
on pre-existing directories. Log record mutation was an implementation shortcut that works in
practice but violates the principle of least surprise.

**Fix strategy:** Add an explicit chmod call after mkdir. Change SanitizingFilter to work on a
copy of the message string.

**Claude Code prompt:**

```
Read src/codelicious/logger.py.

1. Find the setup_logging() function where the log directory is created. After the
   os.makedirs(..., exist_ok=True) call, add:
     try:
         os.chmod(log_dir, 0o700)
     except OSError as e:
         logging.warning("Could not set permissions on %s: %s", log_dir, e)

2. Find the SanitizingFilter.filter() method. Instead of modifying record.msg in place,
   work on a local variable:
     original_msg = record.msg
     sanitized_msg = original_msg
     for pattern, replacement in self._patterns:
         sanitized_msg = pattern.sub(replacement, sanitized_msg)
     if sanitized_msg != original_msg:
         record.msg = sanitized_msg
   This ensures that if the same record is filtered twice, the second pass is a no-op.

3. Write tests in tests/test_logger_hardening.py:
   - Test that setup_logging applies chmod on an existing directory (create dir with 0o755,
     call setup_logging, verify permissions are 0o700).
   - Test that chmod failure logs a warning (mock os.chmod to raise OSError).
   - Test that filtering a record twice produces the same result as filtering once.
   - Test that "REDACTED" in a message is not further modified by the filter.

Run pytest after changes. Run ruff check src/ tests/. Fix any issues.
```

---

### Phase 15: Error Handling Consistency Across Engines

**Findings addressed:** EH-1, EH-2, EH-3

**As a user** who encounters an error during a build, I want consistent, informative error
reporting regardless of which engine I am using, so that I can diagnose issues without
guessing whether the error is transient or fatal.

**Acceptance criteria:**
- cli.py replaces all bare "except Exception: pass" with specific exception handling that
  logs the error at WARNING level before continuing. Each catch block documents why the
  exception is non-fatal.
- claude_engine.py classifies exceptions as transient (subprocess timeout, network error) or
  fatal (missing binary, invalid config) in comments or docstrings.
- huggingface_engine.py handles empty LLM responses (empty string, None, missing "choices" key)
  by logging a WARNING and returning a default empty-action response rather than crashing with
  KeyError.
- 6 new tests verify: cli.py logs warnings for non-fatal errors, huggingface_engine handles
  empty response without crash, engine error classification is documented.

**Root cause:** Each engine was developed independently with different error handling conventions.
cli.py inherited broad exception catches from early prototyping that were never narrowed.

**Fix strategy:** Review each exception handler, narrow the exception type where possible, add
logging, and document the rationale.

**Claude Code prompt:**

```
Read src/codelicious/cli.py, src/codelicious/engines/claude_engine.py, and
src/codelicious/engines/huggingface_engine.py.

1. In cli.py, find every "except Exception" or "except Exception as e" block. For each one:
   - If the exception is truly non-fatal, narrow it to the specific exception type (e.g.,
     subprocess.SubprocessError, OSError, RuntimeError) and add a log.warning() call.
   - If the exception should propagate, remove the bare except and let it propagate.
   - Add a comment explaining why the exception is caught and why it is non-fatal.

2. In claude_engine.py, find the main try-except blocks in run_build_cycle(). Add docstring
   or inline comments classifying each caught exception as "transient" (retry-eligible) or
   "fatal" (immediate failure). Example:
     except subprocess.TimeoutExpired:  # Transient: agent exceeded timeout, build can retry
     except FileNotFoundError:          # Fatal: claude binary not found, cannot proceed

3. In huggingface_engine.py, find where the LLM response is parsed (typically response JSON
   with "choices" key). Add defensive checks:
     if not response or "choices" not in response:
         logger.warning("Empty or malformed LLM response, skipping iteration")
         continue  # or return default response
   Also handle response["choices"] being an empty list.

4. Write tests in tests/test_error_handling.py:
   - Test cli.py logs a warning when PR transition fails (mock git_orchestrator to raise).
   - Test huggingface_engine handles empty response dict without crash.
   - Test huggingface_engine handles response with empty choices list.

Run pytest after changes. Run ruff check src/ tests/. Fix any issues.
```

---

## 7. Dependency Graph

```
Phase 1 (Config Constants)
Phase 2 (Error Messages)       --+
Phase 3 (Resource Cleanup)       |
Phase 4 (Edge Cases)             |
         |                       |
         v                       v
+--------+---------+   +--------+---------+
| Tier 2 (5,6,7,8) |   | Tier 3 (9,10,11, |
| Parallel          |   | 12) Parallel     |
+--------+---------+   +--------+---------+
         |                       |
         v                       v
         +----------+------------+
                    |
                    v
         +---------+-----------+
         | Tier 4 (13,14,15)   |
         | Sequential          |
         +---------------------+
```

Tier 1 phases are sequential (1 then 2 then 3 then 4).
Tier 2 phases (5, 6, 7, 8) are parallelizable after Tier 1.
Tier 3 phases (9, 10, 11, 12) are parallelizable after Tier 1.
Tier 4 phases (13, 14, 15) are sequential after Tiers 2 and 3.

---

## 8. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Environment variable overrides change behavior in production | Medium | Medium | Defaults match current hardcoded values; overrides require explicit action |
| Error message changes break tests that assert on exact message text | Medium | Low | Search for assertEqual/assertIn on error messages before changing them |
| Shared utility extraction introduces import cycles | Low | Medium | _env.py has no codelicious imports; only uses stdlib |
| Type hint additions cause ruff violations | Low | Low | Run ruff after each change; type hints are additive |
| Test fixture expansion slows test suite | Low | Low | Parameterized fixtures reuse setup; expected delta under 1 second |
| CI coverage threshold blocks existing PRs | Medium | Medium | Set initial threshold at 80%, which is achievable with current 580+ tests |
| Python 3.14-dev matrix entry causes spurious CI failures | High | Low | Use continue-on-error for 3.14-dev entry |
| Prompt template migration breaks existing prompt rendering | Medium | High | Test all existing prompts before and after migration; use safe_substitute |
| Dry-run fix changes behavior users depend on | Low | Low | Dry-run creating directories was a bug, not a feature; no user depends on it |

---

## 9. Verification Checklist

After each phase, run:

```bash
# Full test suite
pytest tests/ -v

# Lint and format
ruff check src/ tests/
ruff format --check src/ tests/

# Security scan
bandit -r src/ -s B607,B603

# Verify test count increased (update N after each phase)
pytest tests/ --co -q | tail -1
```

After all phases are complete, run the full verification:

```bash
# All tests pass
pytest tests/ -v --tb=short

# Coverage at or above 80%
pytest tests/ --cov=codelicious --cov-fail-under=80

# Lint clean
ruff check src/ tests/

# Format clean
ruff format --check src/ tests/

# Security scan clean
bandit -r src/ -s B607,B603

# Dependency audit clean
pip-audit --strict --desc

# CLI installs and runs
pip install -e ".[dev]" && codelicious --help

# Dry-run creates no files
TEMP_DIR=$(mktemp -d) && codelicious "$TEMP_DIR" --dry-run && [ ! -d "$TEMP_DIR/.codelicious" ] && echo "PASS: dry-run clean" || echo "FAIL: dry-run created files"

# README CLI flags match argparse
python -c "
import subprocess, re
help_output = subprocess.check_output(['codelicious', '--help'], text=True)
readme = open('README.md').read()
for flag in re.findall(r'--[\w-]+', help_output):
    assert flag in readme, f'Missing from README: {flag}'
print('PASS: all CLI flags documented')
"
```

---

## 10. Success Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Passing tests | 580+ | 650+ | pytest tests/ --co -q (count) |
| Code quality gaps | 47 | 0 | This spec's finding registry (all resolved) |
| Functions with return types | ~60% | 95%+ | Manual audit of modified files |
| README-to-CLI discrepancies | 4+ | 0 | Automated check in verification script |
| Dry-run side effects | 2 (mkdir calls) | 0 | Dry-run verification test |
| Test fixture edge cases | 0 | 12+ | Count parameterized fixture variations |
| CI coverage enforcement | None | 80%+ threshold | ci.yml pytest --cov-fail-under |
| Dev dependency upper bounds | 0 of 5 | 5 of 5 | pyproject.toml inspection |
| Template injection risk | Present | Eliminated | Prompt template safety tests |
| Lint violations | 0 | 0 | ruff check src/ tests/ |
| Format violations | 0 | 0 | ruff format --check src/ tests/ |
| Runtime dependencies | 0 | 0 | pip show codelicious (no deps) |
