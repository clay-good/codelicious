---
version: 1.0.0
status: Approved
related_specs: ["00_master_spec.md", "05_feature_dual_engine.md"]
---

# Spec 26: Fix Spec Discovery Bugs

## Intent

Two bugs prevent codelicious from discovering spec files in the most common workflow:

1. **Untracked files are silently skipped.** `_walk_for_specs()` calls `git ls-files`
   and filters to only tracked files. A user who creates a new spec and immediately
   runs `codelicious` (before `git add`) sees "no spec files found" with no explanation.
   This is the #1 expected workflow and it silently fails.

2. **Filename regex is too restrictive.** `_SPEC_FILENAME_RE` only matches files starting
   with `spec` (e.g. `spec.md`, `spec-v1.md`) plus `roadmap.md` and `todo.md`. It does
   NOT match the numbered filenames the project itself uses (`01_feature_cli.md`,
   `16_reliability.md`) or any markdown file in `docs/specs/`. The README tells users
   to "place markdown specs in `docs/specs/`" but the engine ignores them unless they
   happen to be named `spec*.md`.

## Scope

2 phases. Bug fixes only — no new features.

---

## Phase 1: Include Untracked Spec Files

**File:** `src/codelicious/engines/claude_engine.py`

**Current behavior (line ~120):**
```python
if tracked is not None and full not in tracked:
    continue
```

This skips any file not in `git ls-files` output. Untracked new specs are invisible.

**Fix:** Remove the tracked-file filter from `_walk_for_specs()`. The function already
prunes `.git/`, `node_modules/`, `__pycache__/`, and other skip directories. The
tracked-file filter adds no safety value (spec files are read-only inputs, not outputs)
and causes the most common workflow to silently fail.

**Also:** Log a count of discovered specs at INFO level so users see what was found.

**Acceptance criteria:**

- [x] `_walk_for_specs()` does not filter by git-tracked status
- [x] `_git_tracked_files()` function is deleted (no longer called)
- [x] A newly created (untracked) spec file in `docs/specs/` is discovered
- [x] All existing tests pass

---

## Phase 2: Fix Filename Regex to Match All Markdown in docs/specs/

**File:** `src/codelicious/engines/claude_engine.py`

**Current behavior:** `_SPEC_FILENAME_RE` only matches `spec*.md`, `*.spec.md`,
`roadmap.md`, `todo.md`. Files like `01_feature_auth.md` or `authentication.md` in
`docs/specs/` are silently ignored.

**Fix:** Change `_walk_for_specs()` to use a two-tier approach:

1. **Any `.md` file inside a `specs/` or `docs/specs/` directory** is a spec
   (matches the HuggingFace engine behavior and README documentation).
2. **At the repo root**, keep the restrictive regex (`spec*.md`, `roadmap.md`, etc.)
   to avoid treating `README.md` or `CHANGELOG.md` as specs.

This matches the HuggingFace engine's `specs_dir.glob("*.md")` (line 61) and the
README's documented behavior.

**Acceptance criteria:**

- [x] `docs/specs/01_feature_auth.md` is discovered as a spec
- [x] `docs/specs/anything.md` is discovered as a spec
- [x] `README.md` at repo root is NOT discovered as a spec
- [x] `CHANGELOG.md` at repo root is NOT discovered as a spec
- [x] A file named `spec.md` at repo root IS still discovered
- [x] New unit tests verify the discovery logic with various layouts
- [x] All existing tests pass
- [x] End-to-end: creating an untracked `docs/specs/01_test.md` with `- [x]` items
      in a git repo, then running `codelicious`, reports "Specs found: 1" and
      "To build: 1" in the banner output
