---
version: 1.0.0
status: Approved
related_specs: ["24_dead_code_removal_and_dedup_v1.md"]
---

# Spec 25: Repo Hygiene and Test Consolidation

## Intent

The codebase is functionally complete but has accumulated repo-level debris from 24
specs of iterative development: tracked build artifacts in `.codelicious/`, versioned
test files, stale pre-commit pin, and an empty `__init__.py` public API. This spec
cleans the repo to the state a new contributor or `pip install` user expects.

## Scope

5 phases. No feature changes. Pure housekeeping.

---

## Phase 1: Remove Tracked .codelicious/ Build Artifacts from Git

Git tracks 9 files in `.codelicious/` that are runtime build state, not source code.
The `.gitignore` already has `.codelicious` but these were committed before that rule
existed. They must be removed from git tracking (not from the working tree of users
who have them).

**Files to untrack:**

- `.codelicious/BUILD_COMPLETE`
- `.codelicious/STATE.md`
- `.codelicious/cache.json`
- `.codelicious/state.json`
- `.codelicious/review_performance.json`
- `.codelicious/review_qa.json`
- `.codelicious/review_reliability.json`
- `.codelicious/review_security.json`

**Keep tracked:** `.codelicious/config.json` — this is a legitimate config example
showing the security note.

**Commands:**

```bash
git rm --cached .codelicious/BUILD_COMPLETE .codelicious/STATE.md \
  .codelicious/cache.json .codelicious/state.json \
  .codelicious/review_performance.json .codelicious/review_qa.json \
  .codelicious/review_reliability.json .codelicious/review_security.json
```

**Acceptance criteria:**

- [x] `git ls-files .codelicious/` returns only `config.json`
- [x] `.gitignore` entry for `.codelicious` is still present
- [x] Working tree is not affected (files still exist locally if present)

---

## Phase 2: Rename Versioned Test Files

Two test files carry legacy version suffixes that are meaningless to new contributors:

| Current name | New name | Reason |
|---|---|---|
| `tests/test_integration_v11.py` | `tests/test_integration.py` | The "v11" refers to an internal spec iteration |
| `tests/test_scaffolder_v9.py` | `tests/test_scaffolder_claude_dir.py` | It tests `scaffold_claude_dir()`, not the main `scaffold()` |

**Steps:**

1. `git mv tests/test_integration_v11.py tests/test_integration.py`
2. Update the internal `_FIXTURES` path reference if it uses `v11` in any variable names
3. `git mv tests/test_scaffolder_v9.py tests/test_scaffolder_claude_dir.py`
4. Verify all tests still pass (pytest discovers by `test_*.py` pattern, no hardcoded names)

**Acceptance criteria:**

- [x] `tests/test_integration_v11.py` no longer exists; `tests/test_integration.py` does
- [x] `tests/test_scaffolder_v9.py` no longer exists; `tests/test_scaffolder_claude_dir.py` does
- [x] All tests pass
- [x] No file references the old names

---

## Phase 3: Update Pre-commit Hook Versions

The `.pre-commit-config.yaml` pins old versions:

| Hook | Current | Latest stable |
|---|---|---|
| `ruff-pre-commit` | `v0.4.0` | `v0.11.12` |
| `bandit` | `1.7.8` | `1.9.0` |

Also, the ruff pre-commit hook should pass `--fix` only (no `--unsafe-fixes`), and the
args should match the `pyproject.toml` config (which now has `[tool.ruff.lint]`).

**Update `.pre-commit-config.yaml`:**

```yaml
repos:
  - repo: https://github.com/astral-sh/ruff-pre-commit
    rev: v0.11.12
    hooks:
      - id: ruff
        args: ["check", "--fix"]
      - id: ruff-format
  - repo: https://github.com/PyCQA/bandit
    rev: "1.9.0"
    hooks:
      - id: bandit
        args: ["-r", "src/codelicious/", "-s", "B101,B110,B310,B404,B603,B607"]
```

**Acceptance criteria:**

- [x] `ruff-pre-commit` rev is `v0.11.12`
- [x] `bandit` rev is `1.9.0`
- [x] `ruff check src/ tests/` still reports 0 violations
- [x] All tests pass

---

## Phase 4: Add py.typed Marker and Version Export

For downstream type checkers (`mypy`, `pyright`) to recognize this package as typed,
PEP 561 requires a `py.typed` marker file. Also, `__init__.py` exports nothing useful.

**Steps:**

1. Create `src/codelicious/py.typed` (empty file)
2. Update `src/codelicious/__init__.py` to export the version:

```python
"""codelicious: Autonomous software builder from markdown specifications."""

__version__ = "1.0.0"
```

3. Verify `python -c "import codelicious; print(codelicious.__version__)"` prints `1.0.0`

**Acceptance criteria:**

- [x] `src/codelicious/py.typed` exists (empty file)
- [x] `__version__` is exported from `codelicious.__init__`
- [x] `python -c "import codelicious; print(codelicious.__version__)"` prints `1.0.0`
- [x] All tests pass

---

## Phase 5: Final Verification

**Acceptance criteria:**

- [x] `pytest` — all tests pass
- [x] `ruff check src/ tests/` — 0 violations
- [x] `ruff format --check src/ tests/` — 0 reformats
- [x] `python -c "from codelicious.cli import main"` — no import errors
- [x] `git ls-files .codelicious/` returns only `config.json`
- [x] No test files with version suffixes (`_v[0-9]`)
- [x] `src/codelicious/py.typed` exists

---

## Execution Order

```
Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5
```
