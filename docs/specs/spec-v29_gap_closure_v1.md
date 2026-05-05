---
version: 1.0.0
status: Complete
created: 2026-05-03
updated: 2026-05-04
related_specs: ["27_codelicious_v2_rewrite.md", "28_bite_sized_continuous_prs_v1.md", "06_production_hardening.md", "07_sandbox_security_hardening.md"]
progress:
  completed: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
  pending: []
---

# Spec v29 — Gap Closure (2026-05-03)

## Background

Codelicious has evolved across 28 specs and a v2 rewrite (spec 27) plus a
bite-sized-PR tightening pass (spec 28). The codebase is mostly aligned to
the v2 architecture, but a deep audit surfaced **18 concrete gaps** between
what is specified and what is implemented, plus several low-grade resilience
and consistency issues.

Headline findings:

* **Spec drift:** spec 28 documents a default LOC cap of 400, but a recent
  commit (`258e5e90 lower default PR cap to 250 LOC`) silently changed the
  runtime default to 250 without updating the spec. The spec and the code
  now disagree.
* **Legacy 4-phase orchestrator (`Orchestrator` BUILD/MERGE/REVIEW/FIX) is
  still present** alongside the v2 chunk-based `V2Orchestrator`, yet spec 27
  Phase 4.1 explicitly mandates removal. ~1,100 lines of dead code remain
  reachable through the legacy `run_build_cycle()` engine path.
* **No jitter on exponential backoff.** `LLMClient` and `loop_controller`
  use plain `2**attempt` backoff, which CLAUDE.md ("LLM calls use
  exponential backoff with jitter for transient errors") explicitly forbids.
* **Two test files are missing for major modules** (`scaffolder.py`'s
  ~558 LOC has shallow tests, `tools/audit_logger.py` has none of its own
  test file), and `chunker.chunk_spec_with_llm` has no dedicated tests.
* The Claude engine's `execute_chunk` does **not pass `stream-json`,
  `--output-format`, or the `--allowedTools` list specified in spec 27
  Phase 3.2** — the prompt is built but the CLI flags spec 27 mandates are
  not visible at the call site (they may live in `agent_runner`, but the
  spec wants them per-chunk).

This spec closes those gaps. It is ordered by severity: critical security
and correctness items first, then resilience, then consistency / cleanup,
then test coverage. Each step is self-contained — pick one off the top,
execute it, ship a small PR, repeat.

## Gap Inventory

| # | Title | Severity |
|---|---|---|
| 1 | Spec 28 documents 400 LOC default but code uses 250 | High (consistency) — **DONE** |
| 2 | Legacy 4-phase `Orchestrator` not removed per spec 27 Phase 4.1 | High (drift) — **DONE** (orchestrator.py 1499→501 LOC; `V2Orchestrator` renamed to `Orchestrator`, alias retained; `tests/test_orchestrator.py` deleted) |
| 3 | LLM backoff has no jitter (CLAUDE.md violation) | High (resilience) — **DONE** |
| 4 | `LLMClient` rate-limit retry ignores `Retry-After` header | High (resilience) — **DONE** |
| 5 | `agent_runner` Claude rate-limit detection exits with retry_after_s=60 always — no provider-supplied delay | Medium (resilience) — **DONE** (`_parse_claude_reset_seconds`) |
| 6 | `verify_chunk` runs the entire repo's verifier — not chunk-scoped (spec 27 §3.1) | Medium (correctness) — **DONE** (`verify_paths` runs scoped ruff/bandit/pytest; both engines call it when chunk has files) |
| 7 | `chunk_spec_with_llm` truncates spec body at 5000 chars silently | Medium (correctness) — **DONE** (`_split_spec_for_llm` produces overlapping windows up to `_LLM_MAX_WINDOWS`; deduped on title) |
| 8 | `engines/base.py` still exposes the legacy `run_build_cycle` abstract method, blocking removal of legacy path | Medium (drift) — **DONE** (`run_build_cycle` and `BuildResult` removed; engine ABC has exactly 3 abstract methods) |
| 9 | `claude_engine.execute_chunk` doesn't surface `--allowedTools`/`--output-format stream-json` flags from spec 27 §3.2 at the chunk call-site | Medium (drift) — **DONE** (`_DEFAULT_ALLOWED_TOOLS` + `_ChunkConfig.allowed_tools/output_format`; `_build_agent_command` consumes them) |
| 10 | No deadline enforcement *per chunk* in `V2Orchestrator.run()` | Medium (resilience) — **DONE** (`>=` deadline gate before each `engine.execute_chunk` call) |
| 11 | `huggingface_engine.execute_chunk` lacks the reflection step's verification — model can fake `CHUNK_COMPLETE` | Medium (correctness) — **DONE** (`_HF_MAX_FIX_ATTEMPTS=2` cap on fix-cycle loop; verify must pass before success=True) |
| 12 | `audit_logger.py` has no dedicated unit-test file | Medium (testing) — **DONE** (`tests/test_audit_logger.py`, 15 cases) |
| 13 | `chunk_spec_with_llm` has no dedicated unit-test coverage | Medium (testing) — **DONE** (`TestChunkSpecWithLlm`, 10 cases) |
| 14 | `_probe_git_credentials` in `cli.py` defaults conservative on failure but doesn't distinguish `ssh-add` exit-1 (no agent) from exit-0-empty (agent but no keys) | Low (UX) — **DONE** (`ssh_agent_state` field) |
| 15 | Sandbox post-write `O_NOFOLLOW` re-check is conditional on `hasattr(os, "O_NOFOLLOW")` — no fallback warning when running on a platform without it (Windows) | Low (security) — **DONE** |
| 16 | `pyproject.toml` declares `Python :: 3.14` classifier without CI matrix coverage | Low (consistency) — **DONE** (CI matrix `3.10/3.11/3.12/3.13/3.14-dev` matches classifiers; 3.14-dev marked `continue-on-error`) |
| 17 | `prompts.py` retains multi-phase legacy templates that spec 27 §6.2 marked for removal | Low (cleanup) — **DONE** (templates already absent; live set documented in module docstring; AGENT_BUILD_SPEC stays until Step 2 lands) |
| 18 | `_DEFAULT_PR_LOC_CAP` constant is duplicated as a literal `250` in cli.py and `400` in the README/spec — single source of truth missing | Low (consistency) — **DONE** (Step 1 added `_DEFAULT_PR_LOC_CAP`; Step 18 added `_FORBIDDEN_PATTERNS_DOC` tuple in scaffolder) |

---

## Step-by-step Fix Instructions

### Step 1: Reconcile spec 28 with the code's 250 LOC default [High]

**Context:** Commit `258e5e90` lowered the runtime default from 400 to 250
LOC per PR but the spec 28 still says 400 and the README's "Bite-sized PR
mode" example uses 400. Operators reading the spec will be surprised the
tool splits earlier than documented.

**Prompt for Claude Code:**
> Open `docs/specs/28_bite_sized_continuous_prs_v1.md` and update every
> reference from `400` LOC to `250` LOC: section 1.1 ("max_loc_per_pr CLI
> flag, default 400"), the Claude-Code prompt block in 1.1 that sets
> `max_loc_per_pr=opts.get("max_loc_per_pr", 400)`, the 2.2 default in the
> `__init__` signature, and the Acceptance Criteria line that says "≤ 400
> LOC each". Also open `README.md`, find the "Bite-sized PR mode" section,
> and adjust the documented default. Then introduce a single-source-of-
> truth constant `_DEFAULT_PR_LOC_CAP = 250` (and `_DEFAULT_PR_COMMIT_CAP =
> 8`) in `src/codelicious/cli.py` near the existing `_INT_KEYS`
> declaration; replace the four magic-number occurrences in `_parse_args`
> defaults, banner print lines, and the `V2Orchestrator(...)` call site.
> Add a regression test to `tests/test_cli.py` that asserts the parsed
> `max_loc_per_pr` default equals the constant.

**Acceptance criteria:**
- Spec 28 and README consistently quote 250 LOC.
- A single named constant drives the default in `cli.py`.
- Test asserts `_parse_args([])["max_loc_per_pr"] == 250`.

---

### Step 2: Remove the legacy 4-phase `Orchestrator` [High]

**Context:** Spec 27 Phase 4.1 mandates "Remove the 4-phase model
(BUILD → MERGE → REVIEW → FIX) — the new model is simpler". `V2Orchestrator`
exists in `orchestrator.py` (line 1124+) but the legacy `Orchestrator`
class (lines 1–1123) is still present, still exported in `__all__`, and
still entry-pointed via `engines/*.run_build_cycle()`. This is dead code
weight + drift risk.

**Prompt for Claude Code:**
> Open `src/codelicious/orchestrator.py` and identify the legacy
> `Orchestrator` class plus its supporting helpers `REVIEWER_PROMPTS`,
> `_MERGE_ABORT_TIMEOUT_S`, and any worktree/merge code that
> `V2Orchestrator` does not call. Trace callers: `grep -rn
> "Orchestrator(" src/ tests/` to find them. Migrate any test that still
> targets the old class to `V2Orchestrator` if equivalent coverage is
> needed; otherwise delete the test. Remove the `Orchestrator` class and
> its helpers, drop them from `__all__`, and update `cli.py` and engine
> entry points so only `V2Orchestrator` is referenced. After deletion,
> rename `V2Orchestrator` → `Orchestrator` (since v2 is now THE
> orchestrator) but keep a `V2Orchestrator = Orchestrator` alias for one
> release cycle to avoid breaking any external import. Also update
> `engines/base.py` to drop `run_build_cycle` from the abstract surface
> (Step 8 covers this in detail). Run `pytest -x` and confirm green.

**Acceptance criteria:**
- `grep -rn "BUILD.*MERGE.*REVIEW.*FIX" src/` returns zero hits.
- `pytest` still passes.
- Net diff is a deletion of >800 LOC.
- No test imports `Orchestrator` to mean the old 4-phase variant.

---

### Step 3: Add jitter to all exponential backoff sites [High]

**Context:** CLAUDE.md states "LLM calls use exponential backoff with
jitter for transient errors (429, 5xx)". Today
`src/codelicious/llm_client.py:221` uses `backoff = self._BACKOFF_BASE_S *
(2**attempt)` with no jitter, and `loop_controller.py:28` uses
`_LLM_BACKOFF_BASE_S` similarly. Without jitter, multiple concurrent
codelicious runs against the same provider thunder-herd on the same retry
cycle.

**Prompt for Claude Code:**
> Add a `_jittered_backoff(base: float, attempt: int) -> float` helper to
> `src/codelicious/llm_client.py` that returns `base * (2**attempt) *
> (0.5 + secrets.SystemRandom().random())` — i.e. multiplicative jitter
> in the range [0.5x, 1.5x]. Use the `secrets` module per the security
> rules ("Use secrets module for random token generation, not random") —
> `SystemRandom().random()` is the correct primitive here. Replace both
> `time.sleep(backoff)` call sites in `chat_completion()` (HTTP retry
> branch and network-error retry branch) to use the new helper. Make the
> identical change in `src/codelicious/loop_controller.py` around line
> 200 where `_LLM_BACKOFF_BASE_S` drives a sleep. Add a unit test in
> `tests/test_llm_client.py` that monkey-patches `secrets.SystemRandom`
> and asserts the actual sleep duration falls within
> `[0.5*expected, 1.5*expected]` for three consecutive attempts.

**Acceptance criteria:**
- Both retry call sites use jittered backoff.
- Jitter is sourced from `secrets`, not `random`.
- New test verifies jitter range.

---

### Step 4: Honor provider-supplied `Retry-After` on 429 in LLMClient [High]

**Context:** `llm_client.py` lines 213–232 handle HTTP 429 by using its
own backoff schedule. HuggingFace and most providers return a `Retry-After`
header (seconds or HTTP date). Ignoring it wastes our retry budget.

**Prompt for Claude Code:**
> In `src/codelicious/llm_client.py`, inside the
> `except urllib.error.HTTPError as e:` branch, after sanitizing the
> error body, read `e.headers.get("Retry-After")`. Parse it as: integer
> seconds first, then HTTP-date (use
> `email.utils.parsedate_to_datetime`). Cap parsed values at 120 seconds
> (defensive: a malicious or buggy provider could send a huge value). If
> `Retry-After` parses successfully and `e.code == 429`, use that value
> instead of the computed exponential backoff (still apply jitter from
> Step 3). Log at INFO level when the provider-supplied value is used:
> "Honoring Retry-After: %.1fs for HTTP 429". Add a test in
> `tests/test_llm_client.py` that builds a mock `HTTPError` whose
> `headers` provides `Retry-After: 7` and asserts `time.sleep` was called
> with a value in [3.5, 10.5].

**Acceptance criteria:**
- `Retry-After` header (integer or HTTP-date) is parsed and respected.
- Cap of 120 s applied.
- Jitter still applied on top.
- New test verifies behavior.

---

### Step 5: Surface provider Retry-After in agent_runner Claude rate-limit path [Medium]

**Context:** `agent_runner.py:263` raises `ClaudeRateLimitError(...,
retry_after_s=60.0)` as a hardcoded constant. The Claude CLI's stderr
message often includes the actual reset window ("resets at 5pm"); we
should parse it where present.

**Prompt for Claude Code:**
> In `src/codelicious/agent_runner.py`, near the rate-limit detection
> block at line 243–264, add a helper `_parse_claude_reset_seconds(text:
> str) -> float | None` that scans `text` for patterns like
> `resets in (\d+) seconds`, `try again in (\d+)m`, or
> `Retry-After: (\d+)`. Return parsed seconds (clamped to [10, 3600]) or
> None. In the existing rate-limit branch, call the parser on
> `(stderr_text + stdout_text)` and pass the result (or 60.0) to
> `ClaudeRateLimitError(retry_after_s=...)`. Add tests in
> `tests/test_agent_runner.py` covering: no match → 60.0, "resets in 30
> seconds" → 30.0, "try again in 5m" → 300.0, value above cap → 3600.0.

**Acceptance criteria:**
- Helper parses three formats and clamps.
- Tests cover all four cases.
- Existing rate-limit tests still pass.

---

### Step 6: Make `verify_chunk` chunk-scoped, not whole-repo [Medium]

**Context:** Spec 27 §3.1 specifies `verify_chunk` "Verify a *completed
chunk* passes lint/test/security checks". The current Claude implementation
(`engines/claude_engine.py:152`) and HF implementation both call the
repo-wide `verifier.verify(repo_path)`. On a 50-chunk run this re-runs the
entire test suite 50 times.

**Prompt for Claude Code:**
> In `src/codelicious/verifier.py`, add a new function `verify_paths(repo:
> Path, paths: list[Path]) -> VerifyResult` that runs lint/security
> checks scoped to the provided paths (pass them as positional args to
> `ruff check` and `bandit`) and the test suite scoped via
> `pytest <inferred-test-paths>` where `<inferred-test-paths>` are derived
> by mapping each modified `src/<module>.py` to `tests/test_<module>.py`
> if it exists, falling back to the full suite when no mapping exists.
> Update `engines/claude_engine.py:verify_chunk` and
> `engines/huggingface_engine.py:verify_chunk` to use the new
> `verify_paths(repo, chunk.estimated_files + result.files_modified)`
> when `files_modified` is non-empty; fall back to `verify(repo_path)`
> otherwise. Add tests in `tests/test_verifier.py::TestVerifyPaths`
> covering: empty paths → falls back to full verify, single src file with
> matching test → only that test runs, source file with no matching test
> → falls back to full suite.

**Acceptance criteria:**
- Chunk-scoped verification runs only mapped tests when mapping exists.
- Lint and bandit only scan modified files.
- 3 new tests pass.

---

### Step 7: Stop silent truncation in `chunk_spec_with_llm` [Medium]

**Context:** `chunker.py:212` truncates the spec body to 5000 chars
(`spec_content[:5000]`). For a 12k-line spec like 27, the LLM only sees the
first ~10% and silently produces an incomplete chunking. There is no
warning logged.

**Prompt for Claude Code:**
> In `src/codelicious/chunker.py`, replace the bare `[:5000]` slice with
> a windowing strategy: if `len(spec_content) > 5000`, log a WARNING
> ("Spec too large for single LLM pass: %d chars, splitting into N
> windows of ~4500 chars with 500-char overlap") and call the LLM once
> per window, merging the resulting chunk lists with deduplication on
> normalized title. Cap total windows at 10 to prevent runaway. If
> windowing produces > `_MAX_CHUNKS_PER_SPEC` items, truncate to the cap
> and log a WARNING. Add tests in `tests/test_chunker.py` covering: short
> spec (no windowing), exactly-5000-char spec (no windowing), 12k-char
> spec (3 windows expected), 60k-char spec (capped at 10 windows + warning).

**Acceptance criteria:**
- Long specs no longer silently lose content.
- Window count and overlap configurable via module-level constants.
- 4 new tests pass.

---

### Step 8: Drop `run_build_cycle` from the engine abstract surface [Medium]

**Context:** `engines/base.py:135` still declares `run_build_cycle` as
`@abc.abstractmethod`. Spec 27 §6.1 says "Merge `executor.py` into
`orchestrator.py`" — the same simplification mandates removing the
legacy entry from the engine interface so engines can't accidentally
re-grow a 6-phase loop.

**Prompt for Claude Code:**
> Open `src/codelicious/engines/base.py`. Remove the abstract
> `run_build_cycle` method, the `BuildResult` dataclass, and the legacy
> docstring sections (the docstring should now describe only the
> chunk-level interface). In `engines/claude_engine.py` and
> `engines/huggingface_engine.py`, remove the `run_build_cycle`
> implementations. Verify that nothing in `cli.py` or `orchestrator.py`
> still calls `run_build_cycle` (Step 2 should have already eliminated
> this; if any remains, route it through `V2Orchestrator.run()`). Update
> `tests/test_engine_base.py` to reflect the new minimal abstract
> surface — assert that subclasses without `execute_chunk` /
> `verify_chunk` / `fix_chunk` raise TypeError on instantiation.

**Acceptance criteria:**
- Engine ABC has exactly three abstract methods.
- `run_build_cycle` and `BuildResult` are gone.
- `pytest tests/test_engine_base.py` passes.

---

### Step 9: Surface Claude CLI flags from spec 27 §3.2 at the chunk call site [Medium]

**Context:** Spec 27 §3.2 specifies the exact Claude CLI invocation:
`claude -p "{prompt}" --output-format stream-json --max-turns 50
--allowedTools "Edit,Write,Bash(git status:*),Bash(pytest:*),Bash(ruff:*),
Read,Glob,Grep"`. `claude_engine.py:execute_chunk` builds a `_ChunkConfig`
with only `model`, `effort`, `max_turns`, `agent_timeout_s`, `dry_run` —
the allowedTools allow-list and stream-json output format are not visible
at the chunk site (they live in `agent_runner` defaults, but spec 27 wants
chunk-level configurability so future engines can tighten the tool list).

**Prompt for Claude Code:**
> Extend `_ChunkConfig` in `engines/claude_engine.py:execute_chunk` to
> include `allowed_tools: list[str]` and `output_format: str` attributes,
> defaulting to the exact list from spec 27 §3.2 and `"stream-json"`.
> Open `src/codelicious/agent_runner.py`, find where the `claude` argv is
> assembled (search for `--max-turns` or `--allowedTools`), and make those
> values read from `config.allowed_tools` and `config.output_format` when
> set, falling back to current defaults. Add a unit test in
> `tests/test_agent_runner.py` (or `test_engine_claude_chunk.py`) that
> patches `subprocess.Popen` and asserts the argv contains the expected
> `--allowedTools` string and `--output-format stream-json`.

**Acceptance criteria:**
- Chunk-level config controls allow-list and output format.
- Default allow-list matches spec 27 verbatim.
- Argv-assertion test passes.

---

### Step 10: Enforce per-chunk deadline in `V2Orchestrator.run()` [Medium]

**Context:** CLAUDE.md: "Always check the build deadline before starting a
new phase". `V2Orchestrator.run()` accepts a `deadline: float = 0.0`
parameter (orchestrator.py:1202) but the per-chunk loop body does not
check it before each chunk.

**Prompt for Claude Code:**
> In `src/codelicious/orchestrator.py:V2Orchestrator.run()`, locate the
> for-each-chunk loop. Before invoking `engine.execute_chunk(...)`, add:
> `if self.deadline and time.monotonic() >= self.deadline: logger.warning(
> "Deadline reached after %d/%d chunks; stopping early.", ...);
> break`. Pass the *remaining* deadline to the engine via
> `EngineContext(deadline=self.deadline - 0)` so engines can budget their
> own subprocess timeouts. Add a test in
> `tests/test_v2_orchestrator.py::TestDeadlineEnforcement` that uses a
> mock engine; sets `deadline = time.monotonic() - 1` (already expired)
> and asserts zero chunks executed. A second test sets a future deadline
> and asserts all chunks ran.

**Acceptance criteria:**
- Loop breaks cleanly when deadline elapses.
- Engine receives current deadline.
- 2 new tests pass.

---

### Step 11: Add a verification gate before HF engine returns CHUNK_COMPLETE [Medium]

**Context:** Spec 27 §3.3 says the HF engine's reflection step should
"review its own changes and fix any issues before signaling
CHUNK_COMPLETE". Today the HF engine accepts the model's
`CHUNK_COMPLETE` token at face value (huggingface_engine.py:188 reflection
step exists, but its output is *advisory*, not gating).

**Prompt for Claude Code:**
> In `src/codelicious/engines/huggingface_engine.py:execute_chunk`, after
> the reflection step (around line 188–220), add a post-reflection
> verification: if `self.verify_chunk(chunk, repo_path)` returns
> `success=False`, do NOT return `ChunkResult(success=True)`. Instead, set
> the model up for one fix-cycle iteration (call `fix_chunk` with the
> failure message, then re-verify). Cap at 2 fix-cycle attempts to
> prevent infinite loops. If still failing, return
> `ChunkResult(success=False, message="HF engine could not satisfy
> verification after 2 fix attempts")`. Add a test in
> `tests/test_engine_huggingface_chunk.py` that mocks `verify_chunk` to
> fail twice then pass, asserts 2 fix attempts and a final success; a
> second test where verify always fails asserts the final ChunkResult is
> not-success and `retries_used >= 2`.

**Acceptance criteria:**
- HF engine never returns success=True without passing verification.
- Hard cap of 2 fix iterations.
- 2 new tests pass.

---

### Step 12: Add dedicated test file for `tools/audit_logger.py` [Medium]

**Context:** `src/codelicious/tools/audit_logger.py` is 256 lines and is
referenced indirectly via `test_registry.py::test_dispatch_calls_audit_
logger`, but has no `tests/test_audit_logger.py`. Audit logging is a
security-relevant code path (every tool call goes through it) and deserves
direct coverage.

**Prompt for Claude Code:**
> Create `tests/test_audit_logger.py`. Read
> `src/codelicious/tools/audit_logger.py` to enumerate its public surface.
> Write tests for: file rotation (writing > size threshold spawns a new
> file), redaction (an entry containing a fake API key like
> `sk-test-12345abcdef` does not appear in the rotated file), atomic
> append behavior (use `os.fork` is forbidden — instead use threads:
> 10 threads each appending 100 entries should yield 1000 distinct lines
> with no truncation), and the JSON-line format (each line parses as
> JSON). Use `pytest` fixtures with `tmp_path`. Aim for 8+ test cases.

**Acceptance criteria:**
- File `tests/test_audit_logger.py` exists with 8+ tests.
- Coverage of `audit_logger.py` rises above 90%.
- All tests pass.

---

### Step 13: Add `chunk_spec_with_llm` test coverage [Medium]

**Context:** `chunker.py:165` exposes a public function that has been
implemented but has no dedicated test cases (existing
`tests/test_chunker.py` only exercises the deterministic `chunk_spec`).
With Step 7's windowing logic landing, the LLM path needs explicit
coverage.

**Prompt for Claude Code:**
> In `tests/test_chunker.py`, add a test class
> `TestChunkSpecWithLLM` that uses a mock `llm_client` whose
> `chat_completion` method returns canned JSON. Cover: valid 3-chunk
> response (assert 3 WorkChunks produced with correct titles), JSON
> wrapped in markdown code fences (parser strips them), invalid JSON
> (falls back to deterministic `chunk_spec`), circular dependency (chunk
> A depends_on B, B depends_on A — assert the bad pair is dropped or the
> entire response is rejected and we fall back), path-traversal attempt
> (a chunk's `files: ["../../etc/passwd"]` — assert the file hint is
> sanitized away), and exceeding `_MAX_CHUNKS_PER_SPEC` (mock returns 150
> chunks — assert truncated to 100 with a warning). Use `caplog` to
> assert warnings.

**Acceptance criteria:**
- 6 new tests under `TestChunkSpecWithLLM`.
- All pass.
- Coverage of `chunk_spec_with_llm` reaches > 95%.

---

### Step 14: Distinguish ssh-add states more precisely [Low]

**Context:** `cli.py:_probe_git_credentials` treats `ssh-add` failure as
"not loaded". But `ssh-add -l` returns exit-1 in two distinct cases: no
agent running vs. agent running but empty. The conservative-default
behavior is correct, but the user-facing prompt could be sharper.

**Prompt for Claude Code:**
> In `src/codelicious/cli.py:_probe_git_credentials`, capture the exact
> exit code from `ssh-add -l`: 0 = keys present, 1 = agent running but
> no keys, 2 = no agent. Return an extra dict key `ssh_agent_state`
> with one of `"keys_loaded"`, `"empty"`, `"no_agent"`, `"unknown"`. In
> `_ensure_git_credentials_unlocked`, branch on this value: when
> `no_agent`, suggest `eval $(ssh-agent)` first; when `empty`, just run
> `ssh-add`. Update existing tests in
> `tests/test_cli.py::TestProbeGitCredentials` to verify the new key,
> and add a new test for the `no_agent` branch (mock subprocess to
> return exit 2).

**Acceptance criteria:**
- New `ssh_agent_state` key in the probe dict.
- Tests cover all three states.
- User-facing message changes by state.

---

### Step 15: Sandbox: explicit Windows fallback warning when O_NOFOLLOW unavailable [Low]

**Context:** `sandbox.py:387`: `if os.path.exists(str(resolved)) and
hasattr(os, "O_NOFOLLOW"):`. On platforms lacking `O_NOFOLLOW` (Windows
mainly), the symlink TOCTOU re-check is silently skipped. Codelicious
claims "TOCTOU-safe operations" in CLAUDE.md.

**Prompt for Claude Code:**
> In `src/codelicious/sandbox.py`, locate the `hasattr(os, "O_NOFOLLOW")`
> guard around line 387. Replace the bare `if not hasattr(...)` skip
> with a startup-time check (in `Sandbox.__init__`): if
> `os.O_NOFOLLOW` is unavailable, log a single WARNING:
> "Sandbox: os.O_NOFOLLOW unavailable on this platform — TOCTOU
> protection on atomic writes is best-effort. Run codelicious on a POSIX
> system for full guarantees." Add a test in `tests/test_sandbox.py`
> that monkey-patches `os` to remove `O_NOFOLLOW` and asserts the
> warning is emitted exactly once per Sandbox instance.

**Acceptance criteria:**
- Operators see a clear warning on Windows.
- Test verifies single-emission behavior.

---

### Step 16: Align Python classifier list with CI matrix [Low]

**Context:** `pyproject.toml` lists Python 3.10 through 3.14 as
supported but the project's CI (if any) likely doesn't cover all five.
Claiming 3.14 support is forward-looking but unverified.

**Prompt for Claude Code:**
> Open `pyproject.toml`. Run `gh workflow list` and inspect the test
> workflow YAML to enumerate the actual Python versions exercised in CI.
> For any version listed in the `classifiers` block but NOT in CI, either
> (a) drop the classifier, or (b) add the version to the CI matrix — pick
> based on whether the project intends to support that version. Default
> to dropping 3.13 and 3.14 from the classifiers if no CI exists, and
> open a follow-up issue titled "Add Python 3.13/3.14 to CI matrix once
> released and stable".

**Acceptance criteria:**
- `pyproject.toml` classifiers match CI reality.
- Follow-up issue exists if classifiers were trimmed.

---

### Step 17: Remove obsolete multi-phase prompt templates [Low]

**Context:** Spec 27 §6.2: "Remove multi-phase prompt templates
(SCAFFOLD, ANALYZE, REFLECT, etc.)". `prompts.py` is 286 lines —
inspect to find any template not in the chunk-focused set
(CHUNK_EXECUTE / CHUNK_VERIFY / CHUNK_FIX) and remove it.

**Prompt for Claude Code:**
> Open `src/codelicious/prompts.py`. List every named template constant.
> Run `grep -rn "<TEMPLATE_NAME>" src/ tests/` for each — any template
> with zero non-test references is dead code. Delete it and update the
> module docstring to enumerate only the live templates. Update
> `tests/test_prompts.py` to drop assertions on deleted templates and
> add a smoke test that asserts CHUNK_EXECUTE, CHUNK_VERIFY, CHUNK_FIX,
> and `render()` exist.

**Acceptance criteria:**
- No dead templates remain.
- Live templates enumerated in module docstring.
- `tests/test_prompts.py` passes.

---

### Step 18: Audit `scaffolder.py` for security-rule self-violations [Low]

**Context:** `scaffolder.py:148, 291, 335-337` contain string literals
listing forbidden patterns (`eval(`, `shell=True`, `os.system`) used as
prose in scaffolded README content. These are scaffolding output, not
runtime calls — but a future refactor that turns them into f-strings
without care could regress security. Tighten the source to make this
harder.

**Prompt for Claude Code:**
> In `src/codelicious/scaffolder.py`, replace the three string-literal
> blocks at lines ~148, ~291, ~335 that enumerate forbidden patterns
> with reads from a single module-level frozen tuple
> `_FORBIDDEN_PATTERNS_DOC = ("eval(", "exec(", "shell=True", ...)`.
> Format that tuple into the scaffolded README/CLAUDE.md/security.md
> output via `"\n".join(f"- {p}" for p in _FORBIDDEN_PATTERNS_DOC)`. The
> tuple becomes the single source of truth and any future change must be
> intentional. Add a test that asserts the scaffolded output contains
> every entry from `_FORBIDDEN_PATTERNS_DOC`.

**Acceptance criteria:**
- Single tuple drives the forbidden-pattern documentation.
- Tests cover the round-trip.

---

## Roll-out Order

Execute the steps in numerical order. Steps 1–3 are mergeable
independently. Steps 6, 8, 9, 10, 11 should land after Step 2 (legacy
removal) so diffs stay clean. Steps 12–18 are pure additions and can be
parallelized.

## Acceptance Criteria (overall)

- [ ] All 18 steps complete and merged.
- [ ] `pytest` passes with coverage ≥ 90% (existing project gate).
- [ ] `ruff check src/ tests/` clean.
- [ ] `bandit -r src/` clean (zero new high/medium findings).
- [ ] `grep -rn "Orchestrator(" src/` returns only `V2Orchestrator`-derived hits.
- [ ] No new runtime dependencies in `pyproject.toml`.
- [ ] Spec 28 and README quote the same LOC default as the code.
- [ ] All retries (LLM, HF tool loop, Claude CLI) include jitter.

## Out of Scope

- New engine backends (Anthropic API, OpenAI, Gemini) — already deferred to
  spec 27 §8.2.
- Stacked PRs / DAG executor — deferred per spec 28 "Out of Scope".
- Webhook/Slack/Jira triggers — deferred per spec 27 §8.1.
- Replacing the `urllib`-based HTTP client with `httpx` — would break the
  zero-runtime-dependency invariant.
