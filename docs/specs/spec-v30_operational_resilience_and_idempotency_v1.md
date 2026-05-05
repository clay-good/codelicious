---
version: 1.0.0
status: Complete
created: 2026-05-03
updated: 2026-05-04
related_specs: ["27_codelicious_v2_rewrite.md", "28_bite_sized_continuous_prs_v1.md", "spec-v29_gap_closure_v1.md", "18_operational_resilience_v1.md"]
progress:
  completed: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
  pending: []
---

# Spec v30 — Operational Resilience & Idempotency Gap Closure (2026-05-03)

## Background

Spec v29 closes 18 gaps, mostly around legacy-orchestrator cleanup, jitter,
chunk-scoped verification, and missing tests for individual modules. After
landing v29, a second pass surfaced a different *category* of gap: things
that work fine for a single, lucky, end-to-end run but fall over under
realistic operational conditions — concurrent invocations, partial failures
followed by resumes, oversized specs, rate-limit storms, log-file
contention, and CLI flags that are only validated at one layer.

These gaps are **orthogonal to v29**: they are not on v29's inventory, they
are not addressed by deleting the legacy `Orchestrator`, and they will
remain after every step of v29 is merged. They are ordered here by impact
on a real user running `codelicious build` against a non-trivial spec on a
shared workstation.

## Gap Inventory

| # | Title | Severity |
|---|---|---|
| 1 | No concurrent-run lockfile — two `codelicious build` invocations on the same repo can race on git, sandbox, and `latest.log` | High (correctness) — **DONE** (`_run_lock` advisory `fcntl.flock`; second invocation exits 75) |
| 2 | No idempotent resume — if a run aborts mid-spec (rate-limit, SIGTERM, crash), restarting redoes already-merged chunks and may double-PR | High (correctness) — **DONE** (atomic JSON ledger at `.codelicious/state/<spec>.json`; `--no-resume` and `--reset-ledger` flags) |
| 3 | `--endpoint` CLI flag is not validated for HTTPS at the CLI layer; config-layer validation runs only when LLMClient is constructed, after a banner has already been printed | High (security) — **DONE** (`_validate_endpoint_url_strict` runs before banner; rejects http, user-info, empty host with masked output, exits 2) |
| 4 | SIGTERM handler raises `SystemExit(143)` but there is no integration test asserting that an in-flight chunk and its subprocess (Claude CLI) both terminate within the 5 s grace window | High (resilience) — **DONE** (`TestSigtermIntegration` in `test_cli.py` spawns a real Python child holding the run-lock, sends SIGTERM, asserts exit 143 within 8s and lockfile cleanup) |
| 5 | No engine fallback on persistent rate-limit — Claude CLI rate-limit aborts the build (per recent commit `9b68ea84`) instead of failing over to the HuggingFace engine when both are configured | Medium (resilience) — **DONE** (`Orchestrator(engines=[…])` ordered list; rate-limited engine is dropped and the chunk retries on the next one; CLI auto-builds the list when both creds are present) |
| 6 | Chunker has no token-budget awareness — a chunk whose estimated files exceed the engine context window will be dispatched anyway and fail at runtime | Medium (correctness) — **DONE** (`enforce_token_budget` halves over-budget chunks recursively up to depth 3; orchestrator runs it after deterministic chunking) |
| 7 | `latest.log` symlink is updated non-atomically on every run — two simultaneous runs (or a fast restart) leave a dangling or wrong-target symlink | Medium (operational) — **DONE** (`_atomic_symlink_update` uses tmp + `os.replace`; Windows fallback writes `<link>.txt`) |
| 8 | Verifier measures coverage but does not enforce a gate — a chunk whose patch drops coverage below the project floor still returns `success=True` | Medium (correctness) — **DONE** (`resolve_min_coverage` + `_enforce_coverage_floor`; CLI `--min-coverage`, `[tool.codelicious].min_coverage`, default 90) |
| 9 | PR description body lacks chunk metadata (parent spec link, dependency chain, verifier summary) — humans reviewing the PR have no context | Medium (UX) — **DONE** (`_build_pr_body` accepts `chunk_metadata`; renders Chunk Context, Verifier Summary, Audit Log sections; missing fields → `n/a`) |
| 10 | Branch-name collision — two chunks whose titles normalize to the same slug produce the same branch; the second `git checkout -b` fails with a cryptic error | Medium (correctness) — **DONE** (`_disambiguate_branch` probes local + remote, suffix or unix-ts fallback, INFO logged) |
| 11 | `audit_logger` rotation has a thread-safe append path but no `fcntl.flock` cross-process guard; concurrent `codelicious` runs interleave audit lines | Medium (security) — **DONE** (`_cross_process_lock` wraps every append with `fcntl.flock` on `.audit.lock`; Windows `msvcrt.locking` fallback) |
| 12 | No diagnostic dump on abnormal exit — when the build aborts (deadline, rate-limit, exception), there is no single artifact summarizing what completed, what failed, and what to retry | Low (UX) — **DONE** (`_write_postmortem` aggregates ledger counts + log tail + resume hint; called on abort) |

---

## Step-by-step Fix Instructions

### Step 1: Add a per-repo lockfile to prevent concurrent runs [High]

**Context:** Nothing today prevents two `codelicious build` invocations
from running against the same repository checkout. Both will try to
create branches, write to `.codelicious/`, append to `audit.log`, and
update the `latest.log` symlink. The git operations alone can corrupt
each other (one process's `git checkout -b` racing the other's
`git commit`). On a shared workstation or CI runner reusing a workspace
this is a realistic foot-gun.

**Prompt for Claude Code:**
> Read `src/codelicious/cli.py` to find where the build command begins
> executing (look for the `cmd_build` or equivalent function near line
> 800). Before any work starts — after argument parsing but before any
> git, sandbox, or LLM call — acquire an advisory lock at
> `<repo_root>/.codelicious/run.lock` using `fcntl.flock` with
> `fcntl.LOCK_EX | fcntl.LOCK_NB`. If the lock cannot be acquired,
> read the PID from inside the lockfile (we will write it in a moment)
> and print: `Error: another codelicious run is in progress (pid
> <PID>). If you believe this is stale, delete <path>.` and exit with
> code 75 (EX_TEMPFAIL). On successful acquisition, write the current
> PID into the lockfile and register an `atexit` handler that releases
> the lock and removes the file. Wrap this in a context manager
> `_run_lock(repo_root: Path)` so the lifecycle is obvious. On
> non-POSIX platforms where `fcntl` is unavailable, log a single
> WARNING ("concurrent-run protection unavailable on this platform")
> and proceed without locking. Add tests in
> `tests/test_cli.py::TestRunLock` that: (a) acquires the lock and
> asserts a second acquisition in a child process exits with 75, (b)
> confirms the lockfile is removed on normal exit, (c) confirms the
> lockfile is removed on `SystemExit(143)` (SIGTERM path).

**Acceptance criteria:**
- Second concurrent invocation exits with code 75 and a clear message.
- Lockfile is removed on normal exit, SIGTERM, and uncaught exception.
- 3 new tests pass on POSIX; Windows path logs the warning.

---

### Step 2: Idempotent resume — skip already-merged chunks on restart [High]

**Context:** A build can abort mid-spec for many reasons (rate-limit
abort per `9b68ea84`, SIGTERM, deadline, network blip). When the user
re-runs `codelicious build` against the same spec, the chunker
re-produces the same chunk list, but `V2Orchestrator.run()` does not
check whether a chunk's expected output already exists in git. Result:
duplicate PRs, wasted LLM budget, and possible merge conflicts when the
re-run touches files the prior run already merged.

**Prompt for Claude Code:**
> In `src/codelicious/orchestrator.py:V2Orchestrator`, introduce a
> persistent chunk-status ledger at `<repo_root>/.codelicious/state/<
> spec_slug>.json` with the schema `{"chunks": {"<chunk_id>":
> {"status": "merged"|"failed"|"in_progress", "pr_url": "...",
> "branch": "...", "completed_at": "<iso8601>"}}}`. On `run()` start,
> load the ledger if present; for every chunk in the plan, if its
> ledger entry is `"merged"`, skip execution and log INFO ("Skipping
> already-merged chunk <id>: <title>"). After each successful
> `engine.execute_chunk` + verify + git push + PR create, update the
> ledger atomically (write to `.tmp` then `os.rename`). Use the chunk's
> stable `id` (already produced by the chunker) as the key — verify
> chunker IDs are deterministic across runs by reading `chunker.py`;
> if not, derive an ID from `sha256(title + sorted(files))[:12]` and
> persist that. Add `--no-resume` and `--reset-ledger` CLI flags in
> `cli.py` that bypass or delete the ledger respectively. Tests in
> `tests/test_v2_orchestrator.py::TestIdempotentResume`: (a) ledger
> with one chunk marked merged → that chunk is skipped, (b) full
> ledger → no chunks executed, (c) `--no-resume` ignores the ledger,
> (d) `--reset-ledger` deletes it before run.

**Acceptance criteria:**
- A second run after a partial completion executes only the unfinished chunks.
- Ledger writes are atomic (no half-written JSON on crash).
- Tests for skip, full-skip, no-resume, and reset all pass.
- `--no-resume` and `--reset-ledger` are documented in `--help`.

---

### Step 3: Validate `--endpoint` for HTTPS at the CLI layer [High]

**Context:** `src/codelicious/config.py:136` and
`src/codelicious/llm_client.py:97` both check `scheme != "https"` and
reject non-HTTPS endpoints — but only when `LLMClient` is instantiated,
which happens *after* the CLI has already parsed args and printed the
banner. A user passing `--endpoint http://internal-proxy/...` sees the
banner with their (insecure) endpoint, then a confusing error several
lines later. CLAUDE.md says "All LLM endpoint URLs validated for HTTPS"
— validation should fail fast.

**Prompt for Claude Code:**
> In `src/codelicious/cli.py`, locate `_parse_args` (around line 600)
> and `_validate_opts` (around line 700). Add a validation block: if
> `opts.get("endpoint")` is set, parse it with `urllib.parse.urlsplit`
> and reject any scheme other than `https`. Reject also if the host is
> empty or if the URL contains user-info (e.g.
> `https://user:pass@host`) — credentials in URLs are a known
> exfiltration vector. On rejection, print
> `Error: --endpoint must be an https:// URL with no embedded
> credentials, got: <sanitized>` (sanitize by masking any user-info
> with `***`) and exit with code 2. Add tests in
> `tests/test_cli.py::TestEndpointValidation` covering: http URL
> rejected, https URL accepted, https URL with user-info rejected,
> empty host rejected, malformed URL rejected. Ensure the same
> validation is *not* duplicated — refactor `config.py:_validate_url`
> to expose a single `validate_endpoint_url(url) -> None` helper that
> both the CLI and `LLMClient.__init__` call.

**Acceptance criteria:**
- Insecure endpoints rejected before the banner prints.
- Credentials-in-URL rejected with masked output.
- Single helper used by both CLI and LLMClient.
- 5 new tests pass.

---

### Step 4: Integration test for SIGTERM graceful shutdown [High]

**Context:** `cli.py:37-39` registers a SIGTERM handler that raises
`SystemExit(143)`. `agent_runner.py:46` defines `_SIGTERM_GRACE_S = 5`
and uses it on subprocess timeouts. There is no test that runs a full
build, sends SIGTERM mid-chunk, and asserts: (a) the subprocess
(Claude CLI mock) receives SIGTERM, (b) it gets SIGKILL after 5 s if
unresponsive, (c) the lockfile from Step 1 is released, (d) the ledger
from Step 2 marks the in-flight chunk as `"failed"` not
`"in_progress"`. CLAUDE.md mandates this works; no test proves it
does.

**Prompt for Claude Code:**
> Create `tests/test_sigterm_integration.py`. The test launches
> `codelicious build` as a subprocess against a fixture spec
> (write a tiny one to `tmp_path/spec.md`). Use a mock engine
> shimmed via env var (e.g. `CODELICIOUS_ENGINE=mock` reads from
> `src/codelicious/engines/mock_engine.py` — create that engine if
> missing, with a configurable per-chunk sleep). Configure the mock
> engine to sleep 30 s in `execute_chunk`. From the parent test, after
> 2 s, send `SIGTERM` to the child PID. Assert: child exits with code
> 143 within 8 s, the lockfile under `.codelicious/run.lock` no longer
> exists, the ledger entry for the in-flight chunk has status
> `"failed"` with reason `"sigterm"`, and stderr contains "Received
> SIGTERM". Also assert that any subprocess spawned by the agent
> runner (use `psutil` if already a dep — otherwise spawn a sentinel
> file-creating subprocess and confirm it was killed) is no longer
> alive. Mark the test `@pytest.mark.skipif(sys.platform == "win32",
> ...)`.

**Acceptance criteria:**
- Test exists and passes on POSIX.
- Child process exits 143 within 8 seconds of SIGTERM.
- No orphaned subprocesses, lockfile, or `in_progress` ledger entries remain.

---

### Step 5: Engine fallback on persistent Claude rate-limit [Medium]

**Context:** Commit `9b68ea84` ("abort build on Claude CLI rate-limit
instead of burning through every chunk") is correct given a single
engine, but spec 27 §1 advertises a "dual-engine architecture". When a
user has both `ANTHROPIC_API_KEY` (or Claude CLI auth) *and*
`HF_TOKEN` configured, a Claude rate-limit should fail over to the HF
engine for the remainder of the spec rather than aborting.

**Prompt for Claude Code:**
> In `src/codelicious/orchestrator.py:V2Orchestrator`, accept a list
> `engines: list[Engine]` (ordered by preference) instead of a single
> `engine`. In the per-chunk loop, on `ClaudeRateLimitError` (or
> equivalent rate-limit signal from any engine), log WARNING
> ("<engine_name> rate-limited; failing over to <next_engine_name>
> for the remainder of this spec"), drop the rate-limited engine
> from the active list, and retry the same chunk on the next engine.
> If the active list becomes empty, abort with the existing rate-limit
> behavior (do not retry the same engine). Update `cli.py` to assemble
> the engine list based on which credentials are present:
> Claude-first if both, HF-only if only HF, Claude-only if only
> Claude. Add tests in `tests/test_v2_orchestrator.py::TestEngineFallback`
> with two mock engines: (a) primary rate-limits on chunk 2 → fallback
> takes over from chunk 2, (b) both rate-limit → abort, (c) primary
> rate-limits on chunk 2, secondary rate-limits on chunk 4 → abort
> at chunk 4. Verify the chunk-2 retry on the fallback engine
> actually executes (don't double-skip).

**Acceptance criteria:**
- Build continues on the fallback engine after primary rate-limits.
- Rate-limited engine is removed for the rest of the run (no flapping).
- 3 new tests pass.
- `--engine` flag (if present) can still force a single engine.

---

### Step 6: Token-budget-aware chunk sizing [Medium]

**Context:** `chunker.py` produces chunks based on LOC and commit
caps but does not estimate the prompt token count for each chunk.
A chunk whose `estimated_files` collectively exceed the engine's
context window (e.g., Claude Sonnet 4.6 at 200k tokens, or HF at much
less) is dispatched anyway and fails inside the engine with a
context-overflow error — wasting one full chunk's worth of LLM budget
to discover the problem.

**Prompt for Claude Code:**
> Add `_estimate_chunk_tokens(chunk: WorkChunk, repo: Path) -> int` to
> `src/codelicious/chunker.py`. Estimate as: 4 chars/token, summing
> over (chunk title + description + chunk-execute prompt template +
> sum of file sizes for `chunk.files`). Add a module-level constant
> `_MAX_CHUNK_TOKENS_PER_ENGINE = {"claude": 150_000, "huggingface":
> 24_000, "default": 24_000}` (leaving 50k headroom on Claude's 200k
> for response). After chunking (deterministic and LLM paths), iterate
> chunks and for any chunk exceeding the budget for the *least
> capable* engine in the active engine list, split it: keep the title,
> halve the file list, mark the second half as depending on the first
> with id-suffix `_b`. Cap recursive splits at depth 3 and log
> WARNING if a chunk still exceeds budget after 3 splits ("Chunk
> <id> still <N> tokens after 3 splits — dispatch anyway, may fail").
> Tests in `tests/test_chunker.py::TestTokenBudget`: under-budget
> chunk → unchanged, over-budget chunk → split with correct
> dependency, recursively over-budget → 4 sub-chunks max, splits
> preserve total file coverage.

**Acceptance criteria:**
- No chunk silently exceeds the engine context window.
- Splits preserve dependency ordering and file coverage.
- 4 new tests pass.

---

### Step 7: Atomic update of the `latest.log` symlink [Medium]

**Context:** Recent commit `258e5e90` adds a `latest.log` symlink.
The current implementation likely uses `os.symlink(target, link)`
which fails if `link` exists, *or* `os.unlink(link); os.symlink(...)`
which is non-atomic. Two simultaneous runs (Step 1 will eventually
prevent this, but a fast restart after crash within the lock-release
window can reproduce it) can leave the symlink dangling or pointing
to a partially-written file. POSIX guarantees atomic symlink update
via `os.symlink(target, tmp); os.rename(tmp, link)`.

**Prompt for Claude Code:**
> In `src/codelicious/logger.py`, find where `latest.log` is created
> (search for `"latest.log"` or `os.symlink`). Replace the
> non-atomic update with: `tmp = link.with_suffix(f".{os.getpid()}.
> tmp"); os.symlink(target.name, tmp); os.replace(tmp, link)`. Use
> `os.replace` (atomic on POSIX, atomic on NTFS for symlinks since
> Win10). On platforms where `os.symlink` fails due to permissions
> (Windows without developer mode), fall back to writing a plain
> file `latest.log.txt` containing the path to the active log, and
> log INFO once per process. Add a test in `tests/test_logger.py`
> that runs the symlink update twice in quick succession and asserts
> the symlink resolves to the most recent log file with no
> intermediate broken state (use `os.readlink` between updates from
> a thread to detect a window where `readlink` raises).

**Acceptance criteria:**
- Symlink update is atomic via tmp + rename.
- Windows fallback documented and tested.
- Race-detection test passes.

---

### Step 8: Enforce coverage gate in verifier, not just measure [Medium]

**Context:** `src/codelicious/verifier.py` runs `pytest --cov` (per
recent specs) but the result feeds into `VerifyResult` only
informationally. A chunk that drops project coverage from 92% to 71%
returns `success=True`. CLAUDE.md and the project itself promise
"coverage ≥ 90%" — this is enforced for human-written code by CI but
not for codelicious-generated code at chunk time, when the violation
is cheapest to fix.

**Prompt for Claude Code:**
> In `src/codelicious/verifier.py`, locate the coverage parsing
> (search for `--cov` or `coverage`). Add a parameter
> `min_coverage: float = 90.0` to the public `verify()` and
> `verify_paths()` functions (Step 6 of v29 introduces
> `verify_paths`). After parsing the coverage percentage, if it is
> below `min_coverage`, set `result.success = False` and append to
> `result.failures`: f"coverage {pct:.1f}% below floor
> {min_coverage:.1f}%". Read the threshold from
> `pyproject.toml::[tool.codelicious].min_coverage` if present
> (parse with `tomllib`), else use 90.0. Add a `--min-coverage` CLI
> flag in `cli.py` that overrides both. Tests in
> `tests/test_verifier.py::TestCoverageGate`: 95% coverage with
> 90% floor → success, 85% with 90% floor → failure with the
> expected message, override via pyproject → uses pyproject value,
> override via CLI flag → CLI wins.

**Acceptance criteria:**
- Coverage drops below floor → `success=False`.
- Three-way override precedence: CLI > pyproject > default.
- 4 new tests pass.

---

### Step 9: Enrich PR description with chunk metadata [Medium]

**Context:** `src/codelicious/git/` produces PRs but their descriptions
do not include: a link to the parent spec file, the chunk's position
in the dependency graph, the verifier summary (lint warnings, test
count, coverage delta), or a link to the audit log slice for this
chunk. A reviewer opens the PR and sees only the commit messages.
This is the single highest-leverage UX improvement for the human
reviewer.

**Prompt for Claude Code:**
> In `src/codelicious/git/` (locate the PR-create function — likely
> `pr.py` or similar; `grep -rn "gh pr create\|create_pr" src/`),
> extend the PR body template to include a `## Chunk Context`
> section with: spec source path (relative to repo root), chunk id
> and title, list of chunks this one depends on, list of chunks
> that depend on it, and a `## Verifier Summary` section with
> `tests passed: N | lint warnings: N | coverage: P% (Δ +/-X.X
> pp)`. Read these from the `ChunkResult` and `VerifyResult` already
> available at PR-create time. If any field is missing, render
> `n/a` rather than crashing. Add a `## Audit Log` section with the
> path to the rotated audit log file for the run (from Step 1's
> ledger). Update tests in `tests/test_git_pr.py` (or create) to
> assert each section appears in the rendered body for a sample
> ChunkResult.

**Acceptance criteria:**
- PR body includes Chunk Context, Verifier Summary, Audit Log sections.
- Missing fields render as `n/a`, never raise.
- Tests assert each section's presence.

---

### Step 10: Detect and disambiguate branch-name collisions [Medium]

**Context:** The branch name is derived from a slug of the chunk
title. Two chunks titled "fix: handle empty input" (e.g., produced by
the LLM in a long spec) normalize to identical slugs. The first
`git checkout -b` succeeds; the second fails with "branch already
exists" and the error surfaces as a generic chunk failure with no
hint that the cause is a name collision.

**Prompt for Claude Code:**
> In `src/codelicious/git/` find the slug-to-branch-name function
> (likely `_slugify` or `_branch_name_for_chunk`). After computing
> the candidate slug, run `git branch --list <slug>` and
> `git ls-remote --heads origin <slug>`; if either returns a hit,
> append a suffix `-<chunk_id_short>` (first 6 chars of the chunk
> id) to disambiguate. If even *that* collides (extremely unlikely),
> append `-<unix_timestamp>`. Log INFO when disambiguation triggers:
> "Branch <slug> exists; using <slug>-<suffix>". Add tests in
> `tests/test_git_branches.py`: (a) unique slug → unchanged, (b) local
> collision → suffixed with chunk id, (c) remote-only collision →
> suffixed, (d) both collisions of suffixed name → timestamp suffix.

**Acceptance criteria:**
- Two chunks with identical titles produce distinct branches.
- Disambiguation is logged so the reviewer can match branch to chunk.
- 4 new tests pass.

---

### Step 11: Cross-process file lock on audit-log rotation [Medium]

**Context:** v29 Step 12 adds a thread-safe append test for
`audit_logger.py` (10 threads × 100 entries). That covers
intra-process safety. But two `codelicious` processes (Step 1 will
prevent same-repo collisions; cross-repo audit logs may still share a
location if `CODELICIOUS_AUDIT_DIR` is set globally) can interleave
audit lines across the rotation boundary, producing a corrupt
JSON-lines file.

**Prompt for Claude Code:**
> In `src/codelicious/tools/audit_logger.py`, wrap the append + rotate
> critical section with `fcntl.flock(fd, LOCK_EX)` / `LOCK_UN`. Use a
> dedicated lock file at `<audit_dir>/.audit.lock` rather than locking
> the audit log itself (rotation moves the audit log; a lock on a
> moved fd is undefined). On Windows, use `msvcrt.locking` if
> available; otherwise log a one-shot WARNING and proceed without
> cross-process locking (intra-process locks remain). Add a test in
> the v29 Step 12 file `tests/test_audit_logger.py` that uses
> `multiprocessing` to spawn 4 workers each writing 50 entries —
> assert all 200 lines parse as JSON and no line is interleaved
> (`worker_id` field unique per line). Skip on Windows.

**Acceptance criteria:**
- Cross-process audit-log writes never interleave on POSIX.
- 200 entries from 4 processes all parse as JSON.
- Windows fallback documented and warned about.

---

### Step 12: Diagnostic dump on abnormal exit [Low]

**Context:** When a build aborts (deadline reached, rate-limit on all
engines, uncaught exception), the operator must `tail` the log and
mentally reconstruct what completed. With the ledger from Step 2
already capturing per-chunk status, dumping a one-page summary
("postmortem") on abnormal exit is nearly free.

**Prompt for Claude Code:**
> In `src/codelicious/cli.py`, register an `atexit` handler (also
> invoked on SystemExit and uncaught Exception via `sys.excepthook`)
> that, if the run did not complete normally, writes
> `<repo_root>/.codelicious/postmortem-<timestamp>.md` with: the
> abort reason (deadline / rate-limit / signal / exception), counts
> of merged / failed / skipped / pending chunks (from the Step 2
> ledger), the last 50 lines of the run log, and a "Resume command"
> footer that prints the exact `codelicious build <spec>
> [--reset-ledger if appropriate]` command needed to continue. On
> normal exit (all chunks merged), do NOT write a postmortem. Print
> the postmortem path to stderr on abort. Add tests in
> `tests/test_cli.py::TestPostmortem`: (a) deadline abort writes
> postmortem with status counts, (b) normal completion writes none,
> (c) postmortem path is printed to stderr.

**Acceptance criteria:**
- Postmortem appears only on abnormal exit.
- Includes status counts, abort reason, resume command.
- 3 new tests pass.

---

## Roll-out Order

Steps **1, 2, and 4** form a tightly coupled trio (lockfile, ledger,
SIGTERM test) and should land together or in immediate succession —
each makes the others meaningful. Step **3** is independent and
high-value (security); land it first to remove the foot-gun. Steps
**5 (engine fallback)** and **6 (token budget)** depend on the v29
legacy-orchestrator removal (v29 Step 2) being complete. Steps
**7–11** are independent and parallelizable. Step **12 (postmortem)**
depends on Step 2's ledger format and should land last.

**Suggested merge order:** 3 → 1 → 2 → 4 → 7 → 10 → 11 → 8 → 9 → 5 → 6 → 12.

## Acceptance Criteria (overall)

- [ ] All 12 steps complete and merged, each as a separate PR.
- [ ] `pytest` passes with coverage ≥ 90%.
- [ ] `ruff check src/ tests/` clean.
- [ ] `bandit -r src/` clean.
- [ ] Two simultaneous `codelicious build` invocations on the same repo: second exits 75.
- [ ] Killing a build with SIGTERM mid-chunk leaves no lockfile, no orphan subprocesses, and a `failed` ledger entry.
- [ ] Re-running `codelicious build` against a partially-completed spec only executes the unfinished chunks.
- [ ] Passing `--endpoint http://...` exits 2 before the banner prints.
- [ ] On Claude rate-limit with HF configured, build continues on HF.
- [ ] PR descriptions include chunk context, verifier summary, and audit-log link.
- [ ] On any abnormal exit, a postmortem markdown appears under `.codelicious/`.

## Out of Scope

- Distributed-locking across machines (would require Redis or similar — violates zero-runtime-dependency rule).
- Resuming an aborted *single chunk* mid-flight (the unit of resumption is the chunk; partial chunk work is discarded). A future spec could explore checkpointing within `agent_runner` if needed.
- A web UI for the postmortem / ledger — markdown is sufficient for the headless-CLI value proposition.
- Mocking out git for the SIGTERM integration test — the test should exercise the real git path; if that proves flaky, factor a thin git facade in a follow-up spec.
