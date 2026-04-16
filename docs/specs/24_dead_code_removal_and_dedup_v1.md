---
version: 1.0.0
status: Approved
related_specs: ["13_bulletproof_mvp_v1.md", "20_security_reliability_closure_v1.md"]
---

# Spec 24: Dead Code Removal, Config Deduplication & Ruff Hardening

## Intent

The codebase has accumulated dead code — entire modules, standalone functions, and
duplicate logic — that is tested but never called at runtime. This inflates maintenance
surface, misleads new contributors, and adds ~900 lines of untouchable code. This spec
removes all confirmed dead code, extracts a shared config loader to eliminate a copy-pasted
40-line block, tightens ruff linting rules, and cleans up broad exception handlers.

## Scope

6 phases, each independently verifiable. No new features. Pure subtraction and dedup.

---

## Phase 1: Delete Dead Source Modules

Four modules are never imported by any file in `src/codelicious/`. They exist only to
satisfy test coverage requirements from prior specs. The tests that cover them will be
deleted alongside the modules — they test code that has zero callers and cannot affect
runtime behavior.

**Files to delete (source):**

| Module | Lines | Why dead |
|--------|-------|----------|
| `src/codelicious/build_logger.py` | 361 | `BuildSession`, `cleanup_old_builds` never imported from any source module |
| `src/codelicious/progress.py` | 114 | `ProgressReporter` never imported from any source module |
| `src/codelicious/structured_logger.py` | 82 | `StructuredLogger` never imported from any source module |
| `src/codelicious/budget_guard.py` | 152 | `BudgetGuard` never imported from any source module |

**Files to delete (tests):**

| Test file | Reason |
|-----------|--------|
| `tests/test_build_logger.py` | Tests deleted module |
| `tests/test_progress.py` | Tests deleted module |
| `tests/test_structured_logger.py` | Tests deleted module |
| `tests/test_budget_guard.py` | Tests deleted module |

**Acceptance criteria:**

- [x] All 4 source modules deleted
- [x] All 4 corresponding test files deleted
- [x] `grep -rn 'build_logger\|BuildSession\|cleanup_old_builds' src/codelicious/` returns 0 matches
- [x] `grep -rn 'ProgressReporter' src/codelicious/` returns 0 matches
- [x] `grep -rn 'StructuredLogger' src/codelicious/` returns 0 matches (excluding comments)
- [x] `grep -rn 'BudgetGuard' src/codelicious/` returns 0 matches
- [x] All remaining tests pass (1,814 passed)
- [x] No import errors: `python -c "from codelicious.cli import main"`

---

## Phase 2: Remove Dead Functions and Classes

These functions/classes exist in live modules but are never called from any source file.
Remove them and their tests. Keep the live code in the same modules.

**In `src/codelicious/config.py` — remove:**

| Symbol | Line | Why dead |
|--------|------|----------|
| `_parse_env_int()` | 31 | Only used by `build_config()` which is itself dead |
| `_parse_env_float()` | 53 | Only used by `build_config()` which is itself dead |
| `_parse_env_bool()` | 75 | Only used by `build_config()` which is itself dead |
| `class PolicyConfig` | 126 | Never instantiated from source |
| `class Config` | 202 | Never instantiated from source |
| `build_config()` | 258 | Never called from source |
| `import argparse` | top | Only used by `build_config()` |

Keep `_validate_endpoint_url()` — it is used by `rag_engine.py` (imported from
`llm_client.py`, but config.py has its own copy used in tests).

Check: after removal, does any source file still import from `codelicious.config`?
If not, consider whether the module should be deleted entirely or kept as a stub.
If `_validate_endpoint_url` is the only live function, move it to the module that
actually uses it and delete config.py.

**In `src/codelicious/logger.py` — remove:**

| Symbol | Line | Why dead |
|--------|------|----------|
| `setup_logging()` | 244 | cli.py uses its own `setup_logger()` |
| `create_log_callback()` | 290 | Never called from source |
| `class TimingContext` | 302 | Never used from source |
| `log_call_details()` | 328 | Never called from source |

Keep `sanitize_message()`, `SanitizingFilter`, `REDACTION_PATTERNS` — these are used
by cli.py.

**In `src/codelicious/_env.py` — remove:**

| Symbol | Line | Why dead |
|--------|------|----------|
| `parse_env_str()` | 84 | Never called from any source module |

**In `src/codelicious/planner.py` — remove:**

| Symbol | Line | Why dead |
|--------|------|----------|
| `analyze_spec_drift()` | 678 | Never called from any source module |

Remove from `__all__` as well.

**In `src/codelicious/git/git_orchestrator.py` — remove:**

| Symbol | Line | Why dead |
|--------|------|----------|
| `_unstage_sensitive_files()` | 316 | Never called — `commit_verified_changes()` raises instead of unstaging |

**In `src/codelicious/context_manager.py` — remove:**

| Symbol | Line | Why dead |
|--------|------|----------|
| `truncate_to_tokens()` | 90 | Never called from source |
| `_warn_if_extreme_truncation()` | 72 | Only called by `truncate_to_tokens()` |

**Test updates:** Remove or update test functions that test deleted symbols. Do NOT
delete entire test files if they also test live code — only remove the specific test
classes/functions for deleted symbols.

**Acceptance criteria:**

- [x] All listed symbols removed from source
- [x] `__all__` lists updated in planner.py, _env.py, config.py, logger.py, context_manager.py
- [x] Tests referencing deleted symbols updated (removed or redirected)
- [x] `grep -rn 'build_config\|PolicyConfig\b' src/codelicious/` returns 0 matches
- [x] `grep -rn 'setup_logging\b' src/codelicious/` returns 0 matches (in logger.py)
- [x] `grep -rn 'TimingContext\|log_call_details\|create_log_callback' src/codelicious/` returns 0 matches
- [x] `grep -rn 'parse_env_str\b' src/codelicious/` returns 0 matches
- [x] `grep -rn 'analyze_spec_drift' src/codelicious/` returns 0 matches
- [x] `grep -rn '_unstage_sensitive' src/codelicious/` returns 0 matches
- [x] `grep -rn 'truncate_to_tokens\|_warn_if_extreme' src/codelicious/` returns 0 matches
- [x] All remaining tests pass (1,712 passed)
- [x] No import errors

---

## Phase 3: Extract Shared Config Loader

`loop_controller.py` (lines 142-177) and `huggingface_engine.py` (lines 140-170) contain
a near-identical ~35 line config.json loading block: read file, check size, JSON parse,
filter to allowed keys, deprecation warning for `allowlisted_commands`, clamp
`max_calls_per_iteration`.

Extract this into a single function.

**Implementation:**

Add to `src/codelicious/config.py` (or a new location if config.py was deleted in Phase 2):

```python
def load_project_config(repo_path: pathlib.Path) -> dict:
    """Load and validate .codelicious/config.json.

    Returns a dict filtered to allowed keys with values clamped to safe ranges.
    Returns an empty dict on any error (missing file, malformed JSON, too large).
    """
```

The function must:
1. Read `repo_path / ".codelicious" / "config.json"`
2. Reject files > 100KB
3. Parse JSON, require top-level dict
4. Filter to `_ALLOWED_CONFIG_KEYS` (same frozenset)
5. Log deprecation warning and remove `allowlisted_commands`
6. Clamp `max_calls_per_iteration` to range [10, 100]
7. Return the filtered dict (empty dict on any error)

**Then update:**
- `loop_controller.py`: Replace lines 142-177 with `defaults = load_project_config(self.repo_path)`
- `huggingface_engine.py`: Replace lines 140-170 with `config = load_project_config(repo_path)`

**Acceptance criteria:**

- [x] `load_project_config()` function exists and is tested
- [x] `loop_controller.py` calls `load_project_config()` instead of inline logic
- [x] `huggingface_engine.py` calls `load_project_config()` instead of inline logic
- [x] Duplicate config loading code is gone (no `_allowed_keys` defined in either file)
- [x] Existing tests for config loading behavior still pass (1,720 passed)
- [x] New unit tests cover: missing file, oversized file, valid file, deprecated key warning, clamping

---

## Phase 4: Enable Ruff Rule Categories

`pyproject.toml` configures ruff with only `target-version` and `line-length` — no rule
selection. This means only the default rules (E, F) are active. Enable additional
categories that catch real bugs without being noisy.

**Add to `pyproject.toml`:**

```toml
[tool.ruff.lint]
select = [
    "E",     # pycodestyle errors
    "F",     # pyflakes
    "W",     # pycodestyle warnings
    "I",     # isort (import sorting)
    "UP",    # pyupgrade (Python 3.10+ idioms)
    "B",     # flake8-bugbear (common bugs)
    "SIM",   # flake8-simplify
    "RUF",   # ruff-specific rules
]
ignore = [
    "E501",   # line too long (handled by formatter)
    "SIM108", # ternary operator (readability preference)
    "UP007",  # X | Y union syntax (already using from __future__)
]
```

**Then fix all new violations.** Run `ruff check src/ tests/` and fix every issue.
Common fixes will include:
- Import sorting (I)
- Unnecessary `else` after `return` (SIM)
- Mutable default arguments (B006)
- Unused loop variables (B007)

**Acceptance criteria:**

- [x] `pyproject.toml` has `[tool.ruff.lint]` section with `select` and `ignore`
- [x] `ruff check src/ tests/` reports 0 violations with the new rules
- [x] `ruff format --check src/ tests/` reports 0 reformats needed
- [x] All tests pass (1,720 passed)

---

## Phase 5: Narrow Broad Exception Handlers

9 locations use `except Exception:` which swallows all errors silently. Review each
and narrow to specific exception types or add logging.

| File | Line | Context | Action |
|------|------|---------|--------|
| `_io.py` | 66 | format_directory_tree size check | Narrow to `OSError` |
| `logger.py` | 238 | SanitizingFilter.filter | Keep (logging filter must never raise) but add comment |
| `planner.py` | 378 | JSON nesting depth check | Narrow to `(ValueError, TypeError, RecursionError)` |
| `verifier.py` | 1281 | detect_languages file read | Narrow to `OSError` |
| `git/git_orchestrator.py` | 129 | branch name read | Narrow to `(OSError, subprocess.SubprocessError)` |
| `tools/audit_logger.py` | 114 | _ensure_directories | Narrow to `OSError` |
| `tools/audit_logger.py` | 118 | _ensure_directories | Narrow to `OSError` |

**Do NOT change** `build_logger.py` (line 346) or `progress.py` (line 106) — those
modules are deleted in Phase 1.

**Acceptance criteria:**

- [x] All 7 `except Exception:` handlers narrowed to specific types (or documented)
- [x] `grep -n 'except Exception:' src/codelicious/` returns at most 1 match (the SanitizingFilter)
- [x] All tests pass (1,720 passed)

---

## Phase 6: Lint, Format, and Full Verification

**Acceptance criteria:**

- [x] `pytest` — all tests pass (1,720 passed)
- [x] `ruff check src/ tests/` — 0 violations
- [x] `ruff format --check src/ tests/` — 0 reformats
- [x] `python -c "from codelicious.cli import main"` — no import errors
- [x] No new runtime dependencies introduced (dependencies = [])
- [x] Total source LOC reduced by ~1,667 lines (13,348 → 11,681)

---

## Execution Order

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 6
```

Each phase must pass tests before proceeding to the next. Phase 4 (ruff rules) may
surface additional issues in Phases 1-3 code, so ordering matters.
