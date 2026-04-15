---
version: 2.0.0
status: Draft
related_specs: ["00_master_spec.md", "05_feature_dual_engine.md", "15_parallel_agentic_loops_v1.md", "22_pr_dedup_spec_lifecycle_hardening_v1.md"]
---

# Spec 27: Codelicious v2 — The Orchestration Rewrite

## Vision

Codelicious v2 is a **spec-to-PR orchestrator** that complements Claude Code and
open-source models — not a reimplementation of either. It owns the workflow that
no single AI tool handles end-to-end:

```
Spec discovery → Work chunking → Engine delegation → Commit discipline → PR lifecycle → Human review
```

Claude Code is brilliant at autonomous coding. HuggingFace open-source models are
getting there. Codelicious v2 doesn't compete with either — it wraps them in a
disciplined engineering workflow that produces human-reviewable, size-chunked PRs
from markdown specs.

### Design Principles

1. **Complement, don't compete.** Claude Code handles autonomous coding. Codelicious
   handles the orchestration around it — spec discovery, work chunking, commit
   discipline, PR lifecycle, review coordination.
2. **One commit per unit of work.** Every logical chunk of work gets exactly one commit.
   Human engineers review commits, not monolithic diffs.
3. **Engine-agnostic orchestration.** The same workflow runs identically whether the
   engine is Claude Code CLI, HuggingFace, or (future) Anthropic API / Gemini / OpenAI.
4. **Pre-commit local-first.** The primary trigger is `codelicious /path`. The tool
   fully bakes a product to spec before any code reaches a remote.
5. **Zero runtime dependencies.** Python stdlib only. No pip install surprises.

---

## Phase 0: Git Authentication & Credential Pre-Flight

**Priority:** P0 — nothing works without this.

### 0.1: `gh` Authentication Gate

**File:** `src/codelicious/cli.py`

At CLI startup, before any engine runs, validate that the user can push code and
create PRs. This is a hard gate — fail fast with actionable errors.

- [x] Run `gh auth status` (not just `gh --version`) at startup
- [x] If `gh` is not installed, print install instructions and exit with code 1
- [x] If `gh` is installed but not authenticated, run `gh auth login` interactively and
      wait for the user to complete the flow (this caches the credential via `gh`'s
      built-in secure credential store — no password handling by codelicious)
- [x] If `gh auth status` succeeds, log the authenticated user and continue
- [x] Store the result of the auth check in a `PreFlightResult` dataclass so
      downstream code can reference the authenticated username
- [x] For GitLab: detect if remote URL is GitLab (contains `gitlab`) and check for
      `glab auth status` instead; prompt `glab auth login` if needed
- [x] Add `--skip-auth-check` flag for CI environments where auth is pre-provisioned
      (e.g., `GITHUB_TOKEN` env var or machine-level `gh` auth)

### 0.2: Git Identity Configuration

**File:** `src/codelicious/git/git_orchestrator.py`

- [x] At init, check `git config user.name` and `git config user.email` in the target repo
- [x] If either is unset, check global git config as fallback
- [x] If still unset, prompt the user to set them (required for commits)
- [x] Log the git identity that will be used for commits

### 0.3: GPG Signing Fallback

**File:** `src/codelicious/git/git_orchestrator.py`

- [x] When `git commit` fails with a GPG signing error (exit code 1, stderr contains
      "gpg failed" or "signing failed"), retry the commit with `--no-gpg-sign`
- [x] Log a warning: "GPG signing unavailable — committing unsigned. Configure GPG
      signing or set `commit.gpgsign=false` to suppress this warning."
- [x] Do NOT globally disable GPG signing — only fall back per-commit when it fails

### 0.4: Push Failure Differentiation

**File:** `src/codelicious/git/git_orchestrator.py`

The current `push_to_origin()` retries all failures identically. Fix this:

- [x] Parse stderr on push failure to classify the error:
  - **Auth failure** (stderr contains "Permission denied", "Authentication failed",
    "could not read Username"): do NOT retry, fail
    immediately with actionable message pointing to `gh auth login`
  - **Remote branch conflict** (stderr contains "rejected", "non-fast-forward"):
    do NOT retry, fail with message suggesting `git pull --rebase`
  - **Transient failure** (stderr contains "Connection reset", "Connection timed out",
    "Could not resolve host", "SSL", any 5xx): retry with backoff (current behavior)
- [x] Return a structured `PushResult` dataclass instead of `bool`:
  ```python
  @dataclasses.dataclass(frozen=True)
  class PushResult:
      success: bool
      error_type: str | None  # "auth", "conflict", "transient", "unknown"
      message: str
  ```
- [x] Remove stderr truncation (`[:200]`) — log full stderr on failure
- [x] Update all callers (orchestrator, both engines) to check `PushResult.success`
      and handle `error_type` appropriately — NO more ignoring the return value

---

## Phase 1: CLI Entry Point & Trigger Model

**Priority:** P0

### 1.1: Single CLI Entry Point

**File:** `src/codelicious/cli.py`

The only trigger for v2 is a user CLI command. No daemons, no watchers, no webhooks
(those come later as a separate integration layer).

```bash
codelicious /path/to/repo                    # Build all incomplete specs
codelicious /path/to/repo --spec docs/specs/feature.md  # Build one spec
codelicious /path/to/repo --engine claude    # Force Claude Code CLI
codelicious /path/to/repo --engine huggingface  # Force HuggingFace
codelicious /path/to/repo --dry-run          # Plan only, no writes
```

- [x] Keep existing arg parsing but simplify: remove `--resume`, `--orchestrate`,
      `--continuous` flags — v2 always runs the full orchestration loop
- [x] Add `--dry-run` flag: discovers specs, chunks work, prints the plan, exits
- [x] Add `--max-commits-per-pr N` flag (default: 50, max: 100) to control PR size
- [x] Add `--platform github|gitlab|auto` flag (default: auto-detect from remote URL)
- [x] Startup sequence:
  1. Parse args
  2. Validate git repo at path
  3. Run pre-flight checks (Phase 0)
  4. Discover specs
  5. Chunk work
  6. Execute via selected engine
  7. Manage PR lifecycle

### 1.2: Spec Discovery (Keep Existing, Clean Up)

**File:** `src/codelicious/engines/claude_engine.py` → move to `src/codelicious/spec_discovery.py`

- [x] Extract `_walk_for_specs()` and `_discover_incomplete_specs()` from `claude_engine.py`
      into a new standalone module `src/codelicious/spec_discovery.py`
- [x] Both engines must use the same discovery logic (currently only Claude engine has it)
- [x] Keep the two-tier approach: any `.md` in `specs/` dirs + regex match elsewhere
- [x] Keep untracked file inclusion (spec 26 fix)
- [x] Add `--spec path` override to skip discovery and target one file

---

## Phase 2: Work Chunking — One Commit Per Unit of Work

**Priority:** P0 — this is the core differentiator.

### 2.1: Spec Decomposition Into Commit-Sized Chunks

**New file:** `src/codelicious/chunker.py`

A spec may describe a large feature. Codelicious v2 decomposes it into **commit-sized
units of work** — each one becomes exactly one commit. This is what makes PRs
reviewable by human engineers.

- [x] Define a `WorkChunk` dataclass:
  ```python
  @dataclasses.dataclass(frozen=True)
  class WorkChunk:
      id: str                    # e.g., "spec-27-chunk-03"
      spec_path: pathlib.Path    # Source spec file
      title: str                 # Short description (becomes commit message prefix)
      description: str           # Full instructions for the engine
      depends_on: list[str]      # IDs of chunks that must complete first
      estimated_files: list[str] # Files likely to be touched (hint, not constraint)
      validation: str            # How to verify this chunk is done
  ```
- [x] Implement `chunk_spec(spec_path, repo_path) -> list[WorkChunk]`:
  - Parse the spec into sections (reuse existing `parser.py`)
  - Each `- [ ]` checkbox item becomes one `WorkChunk` (or group small related items)
  - Infer dependency order from section structure (Phase 1 before Phase 2, etc.)
  - If a section has no checkboxes, treat the entire section as one chunk
- [x] Implement `chunk_spec_with_llm(spec_path, repo_path, llm_client) -> list[WorkChunk]`:
  - For complex specs, use the LLM to decompose into optimal commit-sized chunks
  - Prompt template: "Given this spec and this repo structure, decompose into
    independent, commit-sized units of work. Each chunk should touch a small number
    of files and be independently testable."
  - Validate LLM output (no circular deps, no path traversal, reasonable chunk count)
- [x] Hard cap: maximum 100 chunks per spec (reject specs that decompose larger)
- [x] Each chunk's description includes the full spec context + specific focus area

### 2.2: Commit Discipline

**File:** `src/codelicious/git/git_orchestrator.py`

- [x] New method `commit_chunk(chunk: WorkChunk, files: list[Path]) -> CommitResult`:
  - Stage only the files the engine modified for this chunk
  - Commit message format: `[spec-{id}] {chunk.title}`
  - Body includes: chunk description summary, files changed, validation result
  - GPG signing with unsigned fallback (Phase 0.3)
  - Returns `CommitResult` with commit SHA on success
- [x] New method `get_pr_commit_count(pr_number: int) -> int`:
  - Count commits on the PR branch (used to enforce the per-PR cap)
- [x] Enforce commit atomicity: if verification fails for a chunk, revert the
      working tree changes for that chunk (don't leave half-done work)

### 2.3: PR Size Management

**File:** `src/codelicious/git/git_orchestrator.py`

- [x] Track commit count per PR branch
- [x] When commit count reaches `--max-commits-per-pr` (default 50, max 100):
  1. Mark the current PR as ready for review
  2. Create a new branch: `codelicious/spec-{id}-part-{N+1}`
  3. Create a new draft PR linked to the previous one
  4. Continue work on the new branch
- [x] PR title format: `[spec-{id}] {spec_title}` (or `[spec-{id}] {spec_title} (part N)`)
- [x] PR body includes:
  - Link to the spec file
  - List of chunks included in this PR
  - Link to previous/next part PRs if split
  - Summary of what was built

---

## Phase 3: Engine Architecture — Delegate, Don't Reimplement

**Priority:** P0

### 3.1: Engine Interface (Revised)

**File:** `src/codelicious/engines/base.py`

The engine interface changes from "run a full build cycle" to "execute one chunk":

- [x] Revise `BuildEngine` abstract base:
  ```python
  class BuildEngine(abc.ABC):
      @abc.abstractmethod
      def execute_chunk(
          self,
          chunk: WorkChunk,
          repo_path: pathlib.Path,
          context: EngineContext,
      ) -> ChunkResult:
          """Execute a single work chunk. Returns files modified + verification status."""
          ...

      @abc.abstractmethod
      def verify_chunk(
          self,
          chunk: WorkChunk,
          repo_path: pathlib.Path,
      ) -> VerificationResult:
          """Verify a completed chunk passes lint/test/security checks."""
          ...

      @abc.abstractmethod
      def fix_chunk(
          self,
          chunk: WorkChunk,
          repo_path: pathlib.Path,
          failures: list[str],
      ) -> ChunkResult:
          """Attempt to fix verification failures for a chunk."""
          ...
  ```
- [x] Define `ChunkResult`:
  ```python
  @dataclasses.dataclass(frozen=True)
  class ChunkResult:
      success: bool
      files_modified: list[pathlib.Path]
      message: str
      retries_used: int
  ```
- [x] Define `EngineContext`:
  ```python
  @dataclasses.dataclass(frozen=True)
  class EngineContext:
      spec_path: pathlib.Path
      spec_content: str
      repo_file_tree: list[str]
      previous_chunks: list[str]  # Summaries of already-completed chunks
      deadline: float             # monotonic clock deadline
  ```

### 3.2: Claude Code CLI Engine (Rewritten)

**File:** `src/codelicious/engines/claude_engine.py`

**Key change:** Stop micromanaging Claude Code. Let it run autonomously via headless
mode. Codelicious only provides the prompt, the working directory, and collects the
result.

- [x] `execute_chunk()` implementation:
  1. Build a focused prompt from the chunk description + repo context
  2. Spawn `claude` in headless mode with auto-accept:
     ```
     claude -p "{prompt}" \
       --output-format stream-json \
       --max-turns 50 \
       --allowedTools "Edit,Write,Bash(git status:*),Bash(pytest:*),Bash(ruff:*),Read,Glob,Grep"
     ```
  3. Stream stdout, parse `stream-json` events for progress
  4. On completion, collect the list of files modified (from `git diff --name-only`)
  5. Return `ChunkResult`
- [x] Remove the 6-phase internal pipeline (SCAFFOLD → ANALYZE → BUILD → VERIFY →
      REFLECT → COMMIT) — Claude Code handles all of this natively
- [x] Remove `_walk_for_specs()` and `_discover_incomplete_specs()` (moved to
      `spec_discovery.py` in Phase 1.2)
- [x] Keep rate-limit detection and backoff (429 / token exhaustion) from `agent_runner.py`
- [x] Keep credential redaction on all logged output
- [x] Keep the `--dangerously-skip-permissions` prohibition (never pass this flag)
- [x] Prompt template for chunks:
  ```
  You are working in {repo_path}.

  ## Spec Context
  {spec_content}

  ## Your Task (Chunk {chunk.id})
  {chunk.description}

  ## Constraints
  - Only modify files relevant to this specific task
  - Run tests after making changes to verify correctness
  - Run linting (ruff check) to ensure code quality
  - Do not modify files outside the scope of this task

  ## Previous Work
  These chunks have already been completed:
  {previous_chunk_summaries}

  ## Validation
  This task is complete when: {chunk.validation}
  ```

### 3.3: HuggingFace Engine (Enhanced)

**File:** `src/codelicious/engines/huggingface_engine.py`

The HF engine must replicate the autonomous development capability that Claude Code
provides natively. This means a more sophisticated agentic loop with better prompting.

- [x] `execute_chunk()` implementation:
  1. Build a detailed system prompt that gives the model autonomous dev capabilities
  2. Run the tool-dispatch agentic loop (existing `loop_controller.py` pattern)
  3. Available tools: `read_file`, `write_file`, `list_directory`, `run_command`,
     `search_files`, `search_code`
  4. Enhanced system prompt for autonomous development:
     ```
     You are an autonomous software developer. You have tools to read, write, search,
     and execute commands in a repository. Your task is to implement one specific chunk
     of work from a larger spec.

     WORKFLOW:
     1. Read the relevant existing files to understand the codebase
     2. Plan your changes
     3. Implement the changes using write_file
     4. Run tests using run_command to verify your work
     5. Run linting using run_command to check code quality
     6. Fix any issues found
     7. When all tests pass and lint is clean, respond with CHUNK_COMPLETE

     RULES:
     - Make minimal, focused changes
     - Follow existing code patterns and conventions
     - Always run tests after changes
     - Never modify files outside the scope of your assigned chunk
     ```
  5. On `CHUNK_COMPLETE` signal, collect modified files and return `ChunkResult`
- [x] Enhanced tool descriptions with usage examples in the schema (helps smaller models)
- [x] Add a `--model` flag to select specific HF model (default: best available code model)
- [x] Keep the existing retry logic for transient failures (429, 5xx)
- [x] Keep history truncation to stay within context window
- [x] Add a "reflection" step: after tool loop completes, ask the model to review
      its own changes and fix any issues before signaling CHUNK_COMPLETE

### 3.4: Engine Selection (Updated)

**File:** `src/codelicious/engines/__init__.py`

- [x] Update `select_engine()` to support the new engine preference values:
  - `"auto"`: prefer Claude Code CLI if available, else HuggingFace (unchanged)
  - `"claude"`: force Claude Code CLI engine
  - `"huggingface"`: force HuggingFace engine
- [x] Future engine slots (not implemented in v2, but leave the interface clean):
  - `"anthropic-api"`: Anthropic API direct (for teams without Claude Code CLI)
  - `"openai"`: OpenAI/Codex API
  - `"gemini"`: Google Gemini API

---

## Phase 4: Orchestration Loop (Rewritten)

**Priority:** P0

### 4.1: Main Orchestration Loop

**File:** `src/codelicious/orchestrator.py` (rewrite)

The orchestrator is the heart of v2. It runs the full workflow:

```
discover specs → chunk work → execute chunks serially → commit each → manage PR
```

- [x] Rewrite `Orchestrator.run()`:
  ```python
  def run(self, repo_path, engine, config) -> OrchestratorResult:
      # 1. Discover incomplete specs
      specs = discover_incomplete_specs(repo_path)

      for spec in specs:
          # 2. Chunk the spec into commit-sized work units
          chunks = chunk_spec(spec, repo_path)

          # 3. Create/find the PR for this spec
          branch = git.assert_safe_branch(spec)
          git.push_to_origin()  # Ensure remote branch exists
          pr = git.ensure_draft_pr_exists(spec)

          for chunk in chunks:
              # 4. Check PR commit cap
              if git.get_pr_commit_count(pr) >= max_commits_per_pr:
                  git.transition_pr_to_review(pr)
                  branch = git.create_continuation_branch(spec, part)
                  pr = git.ensure_draft_pr_exists(spec, part)

              # 5. Execute the chunk
              result = engine.execute_chunk(chunk, repo_path, context)
              if not result.success:
                  # Try fix cycle (up to 3 attempts)
                  result = self._fix_cycle(engine, chunk, repo_path)

              # 6. Verify the chunk
              verification = engine.verify_chunk(chunk, repo_path)
              if not verification.passed:
                  result = engine.fix_chunk(chunk, repo_path, verification.failures)
                  verification = engine.verify_chunk(chunk, repo_path)

              # 7. Commit exactly this chunk's changes
              if result.success and verification.passed:
                  commit = git.commit_chunk(chunk, result.files_modified)
                  push = git.push_to_origin()
                  if not push.success:
                      handle_push_failure(push)

              # 8. Mark chunk complete in spec (check the checkbox)
              mark_chunk_complete(spec, chunk)

          # 9. Final PR transition
          git.transition_pr_to_review(pr)
  ```
- [x] Remove the 4-phase model (BUILD → MERGE → REVIEW → FIX) — the new model is
      simpler: chunk → execute → verify → commit → push, serially per chunk
- [x] Remove worktree isolation for now (simplify — each spec gets a branch, not a worktree)
- [x] Keep the review phase as optional: if `default_reviewers` is configured,
      assign them when transitioning PR to review
- [x] Respect build deadline: check `time.monotonic()` before each chunk

### 4.2: Spec Lifecycle Management

**File:** `src/codelicious/spec_discovery.py`

- [x] After a chunk completes successfully, update the spec file:
  - Find the corresponding `- [ ]` checkbox and change it to `- [x]`
  - This is a separate commit: `[spec-{id}] mark chunk {N} complete`
- [x] On resume (re-running codelicious on same repo), already-checked items are
      skipped — only unchecked `- [ ]` items generate new chunks
- [x] A spec is "complete" when all checkboxes are `[x]` — it's excluded from
      future discovery

### 4.3: Progress Reporting

**File:** `src/codelicious/cli.py`

- [x] Print clear progress during execution:
  ```
  [codelicious] Discovered 3 incomplete specs
  [codelicious] Spec: docs/specs/feature_auth.md (8 chunks)
  [codelicious] Chunk 1/8: Add User model — executing...
  [codelicious] Chunk 1/8: Add User model — verifying...
  [codelicious] Chunk 1/8: Add User model — committed (abc1234)
  [codelicious] Chunk 1/8: Add User model — pushed
  [codelicious] Chunk 2/8: Add auth middleware — executing...
  ...
  [codelicious] PR #42 ready for review (8 commits)
  ```
- [x] On `--dry-run`, print the plan without executing:
  ```
  [codelicious] DRY RUN — no changes will be made
  [codelicious] Discovered 3 incomplete specs
  [codelicious] Spec: docs/specs/feature_auth.md
    Chunk 1: Add User model (depends on: none)
    Chunk 2: Add auth middleware (depends on: chunk-1)
    Chunk 3: Add login endpoint (depends on: chunk-1, chunk-2)
    ...
  [codelicious] Would create PR with ~8 commits
  ```

---

## Phase 5: PR Lifecycle Management

**Priority:** P1

### 5.1: PR Creation & Updates (GitHub)

**File:** `src/codelicious/git/git_orchestrator.py`

- [x] `ensure_draft_pr_exists()` — validate `gh auth status` before any `gh` command
      (not just `gh --version`)
- [x] Gate PR creation on successful push — if `push_to_origin()` returned failure,
      do not attempt to create a PR (log the push failure instead)
- [x] On PR creation, set body with:
  - Spec file link (relative path in repo)
  - Chunk summary table (chunk title + status)
  - Auto-generated from spec content
- [x] As chunks complete and push, the PR automatically shows new commits
- [x] On PR split (commit cap reached), link the new PR to the old one in the body

### 5.2: PR Creation & Updates (GitLab)

**File:** `src/codelicious/git/git_orchestrator.py`

- [x] Detect GitLab from remote URL (contains `gitlab.com` or `gitlab` in hostname)
- [x] Use `glab` CLI for GitLab operations:
  - `glab mr create --draft` instead of `gh pr create --draft`
  - `glab mr update` instead of `gh pr edit`
  - `glab mr ready` instead of `gh pr ready`
- [x] Same PR body format and lifecycle as GitHub
- [x] If neither `gh` nor `glab` is available, skip PR creation with a clear warning
      (commits and pushes still work — the user just creates the PR manually)

### 5.3: PR Transition to Review

**File:** `src/codelicious/git/git_orchestrator.py`

- [x] When all chunks for a spec are complete and verified:
  1. Final push to ensure all commits are on remote
  2. Update PR body with final summary
  3. Mark PR as ready for review (`gh pr ready` / `glab mr ready`)
  4. Assign reviewers if configured in `.codelicious/config.json`
- [x] If reviewer assignment fails, log a warning but don't fail the build
      (the PR is still ready, just missing reviewer assignment)

---

## Phase 6: Module Cleanup & Simplification

**Priority:** P1

### 6.1: Remove Redundant Modules

The v2 rewrite simplifies the architecture. Remove modules that are no longer needed:

- [x] Delete `src/codelicious/progress.py` (already deleted per git status)
- [x] Delete `src/codelicious/budget_guard.py` (already deleted per git status)
- [x] Delete `src/codelicious/build_logger.py` (already deleted per git status)
- [x] Merge `src/codelicious/executor.py` into `orchestrator.py` if it only calls
      engine methods
- [x] Merge `src/codelicious/parallel_executor.py` into `orchestrator.py` — parallel
      execution of chunks within a spec can be a future enhancement; v2 runs serially
- [x] Keep `src/codelicious/loop_controller.py` — still needed for HuggingFace
      agentic loop
- [x] Keep `src/codelicious/agent_runner.py` — still needed for Claude CLI subprocess
      management
- [x] Keep all security modules (`sandbox.py`, `security_constants.py`, tool audit) —
      these are critical

### 6.2: Consolidate Prompts

**File:** `src/codelicious/prompts.py`

- [x] Remove multi-phase prompt templates (SCAFFOLD, ANALYZE, REFLECT, etc.)
- [x] Add new chunk-focused prompt templates:
  - `CHUNK_EXECUTE` — given to the engine for a single chunk
  - `CHUNK_VERIFY` — verification instructions
  - `CHUNK_FIX` — fix failures for a chunk
- [x] Keep `render()` template function
- [x] Keep `scan_remaining_tasks()` for spec completion detection

### 6.3: Configuration Updates

**File:** `src/codelicious/config.py`

- [x] Add new config keys to `.codelicious/config.json`:
  ```json
  {
    "max_commits_per_pr": 50,
    "platform": "auto",
    "default_reviewers": ["user1", "user2"],
    "default_engine": "auto",
    "verify_command": "pytest && ruff check src/",
    "chunk_strategy": "auto"
  }
  ```
- [x] Validate `max_commits_per_pr` is between 1 and 100
- [x] Validate `platform` is one of "auto", "github", "gitlab"
- [x] Validate `chunk_strategy` is one of "auto", "checkbox", "llm"

---

## Phase 7: Testing

**Priority:** P1

### 7.1: Unit Tests for New Modules

- [x] `tests/test_spec_discovery.py` — test spec discovery with various repo layouts
- [x] `tests/test_chunker.py` — test work chunking from specs
- [x] `tests/test_push_result.py` — test push failure classification
- [x] `tests/test_commit_chunk.py` — test single-chunk commit workflow
- [x] `tests/test_pr_size_management.py` — test PR splitting at commit cap

### 7.2: Integration Tests

- [x] `tests/test_auth_preflight.py` — test gh/glab auth detection
- [x] `tests/test_gpg_fallback.py` — test unsigned commit fallback
- [x] `tests/test_full_workflow.py` — end-to-end: spec → chunks → commits → PR
      (uses a temp git repo with a mock remote)
- [x] `tests/test_engine_claude.py` — test Claude engine chunk execution
      (mocks `claude` subprocess)
- [x] `tests/test_engine_huggingface.py` — test HF engine chunk execution
      (mocks HTTP calls)

### 7.3: Existing Test Updates

- [x] Update all existing tests that reference removed/renamed modules
- [x] Remove test fixtures for deleted features (adversarial_inputs.json, etc. —
      already deleted per git status)
- [x] Ensure `pytest` passes with zero warnings on the new codebase

---

## Phase 8: Future Integration Points (Design Only — Not Implemented in v2)

These are NOT part of v2. They are documented here so the architecture accommodates
them without requiring a rewrite.

### 8.1: Trigger Integrations (Future)

The v2 CLI-only trigger model is intentionally simple. Future triggers include:

- **Jira webhook** → receives issue creation/update → maps Jira ticket to spec →
  runs codelicious → posts PR link back to Jira ticket
- **Slack bot** → receives message in a channel → parses spec from message or
  linked document → runs codelicious → posts PR link to thread
- **GitHub Issue** → watches for issues with a specific label → creates spec from
  issue body → runs codelicious → links PR to issue
- **Cron / CI** → scheduled runs that discover new/updated specs and build them

**Architecture note:** These triggers are a thin layer that:
1. Receives an event
2. Writes/updates a spec `.md` file in the repo
3. Calls `codelicious /path` (the same CLI entry point)
4. Posts the result back to the source system

The orchestration logic never changes — only the trigger and the notification sink.

### 8.2: Additional Engine Backends (Future)

- **Anthropic API** (`--engine anthropic-api`): Direct API calls for teams without
  Claude Code CLI access. Uses the Claude API with tool use for autonomous coding.
- **OpenAI / Codex** (`--engine openai`): OpenAI API with function calling.
- **Google Gemini** (`--engine gemini`): Gemini API with tool use.

Each engine implements the same `BuildEngine.execute_chunk()` interface. The
orchestration layer doesn't change.

### 8.3: PR Review Automation (Future)

- After PR is created, run read-only review agents (security, QA, performance)
- Post review comments directly on the PR
- If critical findings, auto-create fix chunks and append commits
- This reuses the existing `ReviewRole` / `Finding` patterns from the current
  orchestrator, but as a post-PR-creation step rather than inline

---

## Migration Plan

### What Gets Rewritten
| Module | Action |
|--------|--------|
| `cli.py` | Modify — add pre-flight checks, simplify flags |
| `orchestrator.py` | Rewrite — new chunk-based serial loop |
| `engines/claude_engine.py` | Rewrite — delegate to Claude Code headless mode |
| `engines/huggingface_engine.py` | Modify — implement `execute_chunk()` interface |
| `engines/base.py` | Rewrite — new `BuildEngine` interface |
| `engines/__init__.py` | Minor update — same selection logic |
| `git/git_orchestrator.py` | Modify — add auth checks, PushResult, commit_chunk |
| `prompts.py` | Modify — replace multi-phase with chunk-focused templates |
| `config.py` | Modify — add new config keys |

### What Gets Created
| Module | Purpose |
|--------|---------|
| `spec_discovery.py` | Extracted from claude_engine.py |
| `chunker.py` | Spec decomposition into commit-sized chunks |

### What Gets Kept As-Is
| Module | Reason |
|--------|--------|
| `sandbox.py` | Security-critical, well-tested |
| `verifier.py` | Solid verification logic |
| `planner.py` | Task decomposition (feeds into chunker) |
| `agent_runner.py` | Claude CLI subprocess management |
| `loop_controller.py` | HF agentic loop |
| `tools/*` | Tool dispatch for HF engine |
| `context/*` | Caching and RAG |
| `security_constants.py` | Security rules |
| `logger.py` | Credential redaction |
| `_env.py`, `_io.py` | Utility modules |

### What Gets Removed
| Module | Reason |
|--------|--------|
| `progress.py` | Already deleted |
| `budget_guard.py` | Already deleted |
| `build_logger.py` | Already deleted |
| `executor.py` | Merged into orchestrator |
| `parallel_executor.py` | Merged into orchestrator (serial for v2) |

---

## Success Criteria

- [x] `codelicious /path/to/repo` discovers specs, chunks work, executes via Claude
      Code CLI or HuggingFace, produces one commit per chunk, and creates a PR
- [x] Git auth is validated at startup — no silent push failures
- [x] GPG signing falls back to unsigned when signing is unavailable
- [x] PRs are capped at 50-100 commits; larger specs split across linked PRs
- [x] `--dry-run` shows the full plan without modifying anything
- [x] All existing security protections (sandbox, path traversal, credential redaction,
      injection detection) remain intact
- [x] Both GitHub and GitLab are supported for PR/MR creation
- [x] `pytest` passes, `ruff check` clean, `bandit` clean
- [x] Zero runtime dependencies (stdlib only)
