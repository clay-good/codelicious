---
version: 1.0.0
status: Draft
related_specs: ["27_codelicious_v2_rewrite.md", "15_parallel_agentic_loops_v1.md", "22_pr_dedup_spec_lifecycle_hardening_v1.md"]
---

# Spec 28: Bite-Sized Continuous PR Stream

## Vision

Codelicious already commits one logical chunk per commit and supports
PR-commit caps via `V2Orchestrator`. This spec tightens the workflow so
that **every PR is human-reviewable at a glance**: small, focused, and
single-purpose. The tool runs continuously, producing a steady stream of
many small PRs rather than a few large ones.

### Design Goals

1. **Default PR size: 5–10 commits**, not 50.
2. **Diff-size cap** in addition to commit-count cap. A PR with 6 commits
   touching 3,000 LOC is not reviewable; split it.
3. **Continuous production mode**: the tool keeps slicing work and opening
   PRs without operator intervention.
4. **No new abstractions.** Reuse `V2Orchestrator`, `GitManager`,
   `BuildLoop`. Only extend.
5. **Backwards compatible.** Operators who set `--max-commits-per-pr=50`
   on the CLI keep that behavior.

---

## Phase 1: Bite-Sized Defaults

**Priority:** P0 — the user-facing behavior change.

### 1.1: Lower default commit cap

**File:** `src/codelicious/cli.py`

- [x] Change the default value of `max_commits_per_pr` from `50` to `8`
      in `_parse_args` (around line 371)
- [x] Update the validation range comment / error message if it references
      the old default
- [x] Update the banner print line that echoes the cap so it reflects the
      new default
- [x] Add a `--max-loc-per-pr` CLI flag, default `250`, range 50–5000,
      mapped via the same `_INT_KEYS` mechanism as `max_commits_per_pr`
- [x] Pass `max_loc_per_pr` into `V2Orchestrator(...)` constructor
      (constructor accepts the kwarg now; cap-enforcement logic lands in Phase 2.2)

**Claude Code prompt:**
> Open `src/codelicious/cli.py`. In `_parse_args`, change the default
> for `max_commits_per_pr` from 50 to 8. Add a new option
> `max_loc_per_pr` with default 250, validated to be between 50 and 5000,
> and add the flag `--max-loc-per-pr` to the arg map. Update `_INT_KEYS`
> to include it. In `main()`, pass `max_loc_per_pr=opts.get("max_loc_per_pr", 250)`
> when constructing `V2Orchestrator`. Update the banner to print both caps.
> Do not change behavior when the operator explicitly sets the cap.

### 1.2: README + CHANGELOG

- [x] Add a "Bite-sized PR mode" section to `README.md` explaining the new
      defaults and how to override them
- [x] Add a `CHANGELOG.md` entry under unreleased

---

## Phase 2: Diff-Size Cap

**Priority:** P0 — the new mechanism.

### 2.1: `GitManager.get_pr_diff_loc`

**File:** `src/codelicious/git/git_orchestrator.py`

- [x] Add a method `get_pr_diff_loc(self, pr_number: int) -> int` that
      returns the total lines changed (additions + deletions) on the PR
      branch relative to its merge base with `main`
- [x] Implementation: run `git diff --shortstat $(git merge-base HEAD main)..HEAD`
      and parse the output. Use a 30-second subprocess timeout. No `shell=True`.
- [x] On any failure (no merge base, parse error, timeout), return `0`
      and log a warning — never raise. The cap is advisory.
- [x] Add unit tests in `tests/test_git_orchestrator.py` covering: clean
      output, multiple-line shortstat, empty diff, command failure
      (7 tests in `TestGetPrDiffLoc`, all passing)

**Claude Code prompt:**
> In `src/codelicious/git/git_orchestrator.py`, add a method
> `get_pr_diff_loc(self, pr_number: int) -> int` to `GitManager`. It
> should compute insertions+deletions on the current branch vs. its merge
> base with `main` using `git diff --shortstat` (subprocess with 30s
> timeout, no shell). Parse "N insertions(+), M deletions(-)" out of
> stdout. Return 0 on any error and log a warning. Add tests in
> `tests/test_git_orchestrator.py` for happy path, empty diff, and
> subprocess failure.

### 2.2: Wire diff cap into `V2Orchestrator`

**File:** `src/codelicious/orchestrator.py`

- [x] Add `max_loc_per_pr: int = 250` parameter to `V2Orchestrator.__init__`
      (done in Phase 1.1)
- [x] In `run()`, after the existing commit-cap check (around line 1204),
      add a parallel check: if `max_loc_per_pr > 0` and
      `git_manager.get_pr_diff_loc(pr_number) >= max_loc_per_pr`, perform
      the same split sequence (transition_pr_to_review →
      create_continuation_branch → push → ensure_draft_pr_exists)
- [x] Refactor the split sequence into a private helper
      `_split_pr_and_continue(spec_id_str, spec_title, pr_part) -> tuple[int, int | None]`
      so the commit-cap and loc-cap branches both call the same code path
- [x] Log which cap triggered the split (commits vs. LOC) at INFO

**Claude Code prompt:**
> In `src/codelicious/orchestrator.py`, extend `V2Orchestrator`. Add
> `max_loc_per_pr: int = 250` to `__init__`. Extract the existing
> commit-cap split logic in `run()` (around line 1206) into a helper
> method `_split_pr_and_continue` that takes `spec_id_str`, `spec_title`,
> current `pr_part`, and returns `(new_pr_part, new_pr_number)`. Then
> add a second guard right after the commit-count guard: if
> `self.max_loc_per_pr > 0 and self.git_manager.get_pr_diff_loc(pr_number) >= self.max_loc_per_pr`,
> log "PR #N reached X LOC (cap=Y). Splitting." and call the same helper.
> Do not duplicate the split sequence.

### 2.3: Tests

**File:** `tests/test_orchestrator.py`

- [x] Test that diff-cap split fires when `get_pr_diff_loc` returns a
      value >= `max_loc_per_pr` (mock the git_manager)
- [x] Test that commit-cap and diff-cap can both fire on the same spec
      and produce separate continuation branches
      (covered: commit cap takes precedence; both cap=0 disables polling)
- [x] Test that `max_loc_per_pr=0` disables the diff cap

Tests live in `tests/test_v2_orchestrator.py::TestV2OrchestratorPrSplitCaps`
(4 cases, all passing). Full suite: 1882 tests pass; lint clean.

---

## Phase 3: Continuous Production Mode

**Priority:** P1 — makes the workflow self-sustaining.

### 3.1: `--continuous` flag

**File:** `src/codelicious/cli.py`

- [x] Add a `--continuous` boolean flag (default `False`)
- [x] When set, after `V2Orchestrator.run()` completes, re-discover
      incomplete specs and run again — with a configurable
      `--cycle-sleep-s` (default 60, range 0–3600) between cycles
- [x] Honor SIGTERM / Ctrl-C to exit cleanly between cycles
      (existing `KeyboardInterrupt`/SIGTERM handlers wrap the loop)
- [x] Stop the loop when there are zero incomplete specs left (log
      "No specs remaining; exiting continuous mode.")

**Claude Code prompt:**
> In `src/codelicious/cli.py`, add `--continuous` (bool, default False)
> and `--cycle-sleep-s` (int, default 60, range 0–3600) flags. After the
> single-shot `V2Orchestrator.run` call in `main()`, if `--continuous`
> is set, wrap that call in a `while True` loop that re-runs spec
> discovery each iteration, sleeps `cycle_sleep_s` between cycles using
> `time.sleep`, and breaks when no incomplete specs remain. The existing
> SIGTERM handler must cause the loop to exit cleanly. Do not change
> single-shot behavior.

### 3.2: Cycle metrics

- [x] In continuous mode, track and log: total cycles run, total elapsed
      time per cycle, and a final aggregate at shutdown
      (PR/commit totals are already surfaced per-cycle by `V2Orchestrator`'s
      result message; not re-counted in the CLI)
- [x] Print a one-line summary per cycle and a final summary on shutdown

---

## Phase 4: Git Credential Pre-Flight (SSH / GPG / gh)

**Priority:** P1 — prevents continuous mode from stalling on a passphrase
prompt deep inside an automated cycle.

The existing `_run_auth_preflight` validates `gh auth status` only. In
continuous mode, codelicious also pushes commits and (often) signs them
— if the SSH key is locked or the GPG agent has no cached passphrase,
the `git push` or `git commit -S` blocks waiting for stdin that no one
is watching. This phase adds an upfront probe that detects these cases
and prompts the user *once*, at startup, to unlock credentials before
the autonomous loop begins.

### 4.1: Probe push transport and credential status

**File:** `src/codelicious/cli.py` (new helper near `_run_auth_preflight`)

- [x] Add a helper `_probe_git_credentials(repo_path: Path) -> dict` that
      inspects the repo and returns a dict with:
      `transport` (`ssh`, `https`, or `unknown`),
      `gpg_signing` (`bool` — whether `commit.gpgsign` is true),
      `ssh_key_loaded` (`bool` — whether `ssh-add -l` lists at least one key
      OR transport is not ssh),
      `gpg_agent_warm` (`bool` — whether `gpg --list-secret-keys` succeeds
      without prompting OR signing is disabled).
- [x] Detect transport from the `origin` remote URL: `git@`/`ssh://` → ssh,
      `https://` → https, anything else → unknown.
- [x] All subprocess calls use 15 s timeouts, no shell, and never raise.
      On any failure default to the conservative value
      (`ssh_key_loaded=False`, `gpg_agent_warm=False`) so we prompt
      rather than silently let the autonomous loop hang.
- [x] Add unit tests in `tests/test_cli.py` covering: HTTPS-only repo
      (no SSH probe needed), SSH repo with loaded key, SSH repo with no
      keys, gpgsign=true with warm agent, gpgsign=false short-circuits.

**Claude Code prompt:**
> In `src/codelicious/cli.py`, add a private helper
> `_probe_git_credentials(repo_path: Path) -> dict` near
> `_run_auth_preflight`. It runs `git config --get remote.origin.url`,
> `git config --get commit.gpgsign`, `ssh-add -l`, and
> `gpg --list-secret-keys --with-colons` (each with 15 s timeout, no
> shell). Returns a dict with `transport`, `gpg_signing`,
> `ssh_key_loaded`, `gpg_agent_warm`. Conservative defaults on any
> failure. Add 5 unit tests in `tests/test_cli.py` covering the listed
> scenarios.

### 4.2: Interactive prompt when credentials are locked

**File:** `src/codelicious/cli.py`

- [x] After `_run_auth_preflight` succeeds, call `_probe_git_credentials`
      via the new `_ensure_git_credentials_unlocked` helper.
- [x] If `transport == "ssh"` and `not ssh_key_loaded`: run `ssh-add`
      interactively (5 min timeout). Re-probe; warn (or hard-fail in
      `--continuous`) if still locked.
- [x] If `gpg_signing` and `not gpg_agent_warm`: run a one-shot
      `gpg --clearsign --output /dev/null` so the agent caches the
      passphrase. Re-probe.
- [x] Add `--skip-credential-probe` flag (mirrors `--skip-auth-check`)
      for headless environments. Also short-circuited when `GITHUB_TOKEN`
      is present.
- [x] In `--continuous` mode, refuse to start if credentials are still
      locked after the prompt — `sys.exit(1)` with a clear error message.

Tests in `tests/test_cli.py::TestEnsureGitCredentialsUnlocked` (6 cases)
and `TestSkipCredentialProbeFlag` (2 cases). Full suite: 1901 passed.

### 4.3: Continuous-mode re-probe between cycles

**File:** `src/codelicious/cli.py`

- [x] Between continuous cycles, re-run a *non-interactive* probe. If the
      SSH key has been evicted (timeout) or GPG cache expired, log a
      warning and re-prompt before the next cycle (calls
      `_ensure_git_credentials_unlocked(..., continuous=True)` which
      hard-fails if the user cannot unlock).
- [x] Document this behavior in the README "Bite-sized PR mode" section
      (added a "Continuous mode + credential pre-flight" subsection).
      Honors `--skip-credential-probe` / `GITHUB_TOKEN` for headless runs.

## Acceptance Criteria

- [ ] Running `codelicious .` on a multi-task spec produces PRs of ≤ 8 commits
      and ≤ 250 LOC each, splitting into part-2 / part-3 branches as needed.
      *Verified via unit tests; live end-to-end run requires a real repo +
      `gh` auth and is left as a manual smoke test.*
- [x] Existing tests still pass: `pytest` → **1901 passed**.
- [x] New tests: at least 4 added.
      Actual added (spec 28 only):
      - `tests/test_git_orchestrator.py::TestGetPrDiffLoc` — 7 cases
      - `tests/test_v2_orchestrator.py::TestV2OrchestratorPrSplitCaps` — 4 cases
      - `tests/test_cli.py::TestNewCLIFlags` — 5 new cases (continuous, cycle-sleep)
      - `tests/test_cli.py::TestProbeGitCredentials` — 6 cases
      - `tests/test_cli.py::TestEnsureGitCredentialsUnlocked` — 6 cases
      - `tests/test_cli.py::TestSkipCredentialProbeFlag` — 2 cases
      Total: **30 new test cases**.
- [x] `ruff check src/ tests/` clean (also `ruff format` applied — clean).
- [x] `bandit -r src/` clean (0 medium, 0 high; pre-existing low findings only).
- [ ] Continuous mode runs `codelicious . --continuous` without manual
      intervention until all specs complete, then exits cleanly.
      *Logic implemented and unit-tested; live multi-cycle run is a manual
      smoke test against a sandbox repo.*

## Out of Scope

- Stacked PRs (Graphite-style) — possible future spec
- Task-graph DAG executor — possible future spec
- Parallel PRs from a single spec — already partially covered by
  `15_parallel_agentic_loops_v1.md`
