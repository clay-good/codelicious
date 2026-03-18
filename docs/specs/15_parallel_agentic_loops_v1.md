---
version: 1.0.0
status: Draft
date: 2026-03-18
author: Claude Opus 4.6 (spec generation), Clay Good (review)
depends_on: ["14_hardening_v2.md", "08_hardening_reliability_v1.md", "05_feature_dual_engine.md"]
supersedes: []
---

# spec-15: Parallel Agentic Loops -- Concurrent Build Execution, Structured Logging, and Reliability Hardening

## 1. Executive Summary

This spec introduces concurrent agentic loop execution to codelicious. Today, the HuggingFace engine
runs a single sequential agentic loop: one LLM call at a time, one tool dispatch at a time, one spec
at a time. This is the primary throughput bottleneck. For customers who need higher tokens-per-second
throughput (e.g., Impala AI inference workloads), the system must be able to run multiple agentic loops
in parallel, each working on an independent spec or subtask.

This spec also addresses structured logging to both a rotating log file and the CLI terminal, resolves
remaining P1/P2 security findings from STATE.md, and hardens the concurrency model to be thread-safe
throughout the codebase.

This spec does not introduce new LLM providers, new tool types, or changes to the Claude Code engine
lifecycle. Every change operates within the existing architecture and fixes real, measured deficiencies.

### Motivation

A single codelicious session against the HuggingFace Router (SambaNova backend) achieves approximately
50-200 tokens per second, bounded by single-request latency on DeepSeek-V3 and Qwen3-235B. The system
prompt + tool schema overhead is approximately 2,000 tokens per request round-trip. With 50 iterations
and an average 4,000-token response, a single session processes roughly 200,000-300,000 tokens over a
30-60 minute build cycle.

To meaningfully increase throughput for customers running codelicious at scale:

1. Multiple agentic loops must run concurrently, each with its own message history and tool context.
2. Logging must be structured and centralized so that concurrent loops produce coherent, interleaved
   output rather than garbled terminal noise.
3. The filesystem sandbox, audit logger, and cache engine must be thread-safe under concurrent access.
4. The loop controller must support per-loop isolation while sharing a single LLM client connection pool.

### Codebase Metrics (Measured 2026-03-18, Post-Spec-08 Phase 8)

| Metric | Current Value | Target After This Spec |
|--------|---------------|------------------------|
| Source modules | 30 in src/codelicious/ | 32-33 (parallel_executor, structured_logger added) |
| Source lines | ~8,450 | ~9,200 (+750 net new for parallelism + logging) |
| Passing tests | 531 (100% pass) | 620+ |
| Concurrent agentic loops | 1 (sequential only) | Configurable 1-N (default 4) |
| Throughput per session | 50-200 TPS (single loop) | 200-800 TPS (4 concurrent loops) |
| Log output | Unstructured print + logging module | Structured JSON log file + formatted CLI stream |
| Thread-safe modules | 1 (sandbox.py partial) | All stateful modules |
| P1 critical findings | 9 open | 6 open (3 fixed in this spec) |
| P2 important findings | 10 open | 7 open (3 fixed in this spec) |
| Runtime dependencies | 0 (stdlib only) | 0 (unchanged, uses concurrent.futures from stdlib) |

### Logic Breakdown (Post-Spec-15)

| Category | Lines | Percentage | Description |
|----------|-------|------------|-------------|
| Deterministic safety harness | ~3,800 | 41% | sandbox, verifier, command_runner, fs_tools, audit_logger, parallel_executor, structured_logger |
| Probabilistic LLM-driven | ~4,050 | 44% | planner, executor, llm_client, agent_runner, loop_controller, prompts, context_manager, rag_engine, engines |
| Shared infrastructure | ~1,350 | 15% | cli, logger, cache_engine, tools/registry, config, errors, git_orchestrator |

The new parallel_executor module falls entirely within the deterministic safety harness (42% layer)
because it orchestrates concurrency boundaries without making any LLM calls itself. The LLM-driven
percentage decreases slightly as the deterministic orchestration layer grows.

---

## 2. Scope and Non-Goals

### In Scope

1. A new ParallelExecutor class in src/codelicious/parallel_executor.py that manages a pool of
   concurrent agentic loops using concurrent.futures.ThreadPoolExecutor (stdlib, zero new deps).
2. A new StructuredLogger class in src/codelicious/structured_logger.py that writes JSON-formatted
   log entries to .codelicious/build.log and human-readable formatted output to the CLI terminal.
3. Thread-safe refactoring of audit_logger.py, cache_engine.py, and sandbox.py to support concurrent
   access from multiple agentic loops.
4. CLI argument --parallel N to configure the number of concurrent agentic loops (default: 1 for
   backwards compatibility, max: 8).
5. Per-loop isolation: each agentic loop gets its own message history, iteration counter, and loop ID
   but shares the sandbox, audit logger, cache engine, and LLM client.
6. Spec partitioning: when multiple specs exist in docs/specs/, the parallel executor assigns each
   spec to a separate loop. When there are more specs than loops, specs queue and execute as loops
   become available.
7. Fix P1-2 (command injection via whitespace split/shlex mismatch).
8. Fix P1-8 (silent exception swallowing in cli.py).
9. Fix P2-3 (missing process group timeout in command_runner.py).
10. Comprehensive tests for all new and modified modules.
11. Structured logging to both .codelicious/build.log (JSON, machine-readable) and terminal (formatted).
12. Update README.md with new Mermaid diagrams for the parallel architecture.
13. Update STATE.md with current progress.

### Non-Goals

1. Async/await rewrite. The system stays synchronous with thread-based parallelism. Python asyncio
   would require rewriting urllib calls to aiohttp, adding a runtime dependency. ThreadPoolExecutor
   achieves the same throughput for I/O-bound LLM API calls without changing the HTTP layer.
2. Distributed execution across multiple machines. This spec targets single-machine parallelism only.
3. Claude Code engine parallelism. The Claude Code engine spawns a subprocess (the claude binary) which
   manages its own concurrency internally. This spec targets the HuggingFace engine only.
4. New LLM providers or model changes.
5. GPU/TPU inference. Codelicious is an orchestration layer, not an inference server.
6. WebSocket or streaming connections to HuggingFace. The current HTTP POST model is sufficient.
7. License file creation or open-source compliance changes.

---

## 3. System Design

### 3.1 Parallel Execution Architecture

The ParallelExecutor sits between the HuggingFace engine and the individual agentic loops. It receives
a list of spec files, partitions them across N worker threads, and collects results.

```
codelicious /path/to/repo --engine huggingface --parallel 4
    |
    v
HuggingFaceEngine.run_build_cycle()
    |
    v
ParallelExecutor(max_workers=4)
    |
    +---> Thread 1: LoopWorker(spec="01_feature_cli.md",     loop_id="loop-001")
    |         |
    |         +---> LLMClient.chat_completion() [shared, thread-safe]
    |         +---> ToolRegistry.dispatch()     [per-loop instance]
    |         +---> Sandbox                     [shared, lock-protected]
    |         +---> AuditLogger                 [shared, lock-protected]
    |
    +---> Thread 2: LoopWorker(spec="02_feature_agent.md",   loop_id="loop-002")
    |         |
    |         +---> LLMClient.chat_completion() [shared, thread-safe]
    |         +---> ToolRegistry.dispatch()     [per-loop instance]
    |         +---> Sandbox                     [shared, lock-protected]
    |         +---> AuditLogger                 [shared, lock-protected]
    |
    +---> Thread 3: LoopWorker(spec="03_feature_git.md",     loop_id="loop-003")
    |         ...
    |
    +---> Thread 4: LoopWorker(spec="04_feature_ext.md",     loop_id="loop-004")
              ...
    |
    v
ParallelExecutor.collect_results()
    |
    v
BuildResult(success=all_passed, message="4/4 specs complete", elapsed_s=...)
```

### 3.2 Thread Safety Model

Each shared resource gets explicit concurrency protection:

| Resource | Protection | Granularity |
|----------|-----------|-------------|
| LLMClient | Stateless after init (thread-safe by design) | No lock needed |
| Sandbox | Existing threading.Lock + expanded to cover full validate-write cycle | Per-operation |
| AuditLogger | New threading.Lock around all file write operations | Per-write |
| CacheManager | New threading.Lock around load/flush operations | Per-operation |
| ToolRegistry | Per-loop instance (no sharing) | N/A |
| Message history | Per-loop list (no sharing) | N/A |
| StructuredLogger | threading.Lock around file writes, no lock for stdout (GIL-protected) | Per-write |

### 3.3 Structured Logging Design

Current state: codelicious uses Python's logging module with a SanitizingFilter. Output goes to
stderr via StreamHandler and to .codelicious/audit.log via FileHandler. The format is human-readable
but not machine-parseable. Concurrent loops would produce interleaved, unreadable output.

Target state: a StructuredLogger that produces two output streams.

Stream 1: .codelicious/build.log (JSON Lines format, machine-readable)
```
{"ts":"2026-03-18T14:32:01.123Z","loop_id":"loop-001","level":"INFO","phase":"TOOL_CALL","tool":"write_file","args":{"path":"src/auth.py"},"duration_ms":45}
{"ts":"2026-03-18T14:32:01.456Z","loop_id":"loop-002","level":"INFO","phase":"LLM_CALL","model":"Qwen3-235B","tokens_in":2048,"tokens_out":3200,"duration_ms":8500}
{"ts":"2026-03-18T14:32:02.789Z","loop_id":"loop-001","level":"WARN","phase":"SECURITY","event":"DENIED_COMMAND","cmd":"rm -rf /"}
```

Stream 2: Terminal (formatted, color-coded by loop_id, human-readable)
```
[loop-001] INFO  TOOL_CALL  write_file src/auth.py (45ms)
[loop-002] INFO  LLM_CALL   Qwen3-235B 2048->3200 tokens (8.5s)
[loop-001] WARN  SECURITY   DENIED_COMMAND: rm -rf /
```

Each log entry includes: timestamp, loop_id, log level, phase, and phase-specific fields. The
loop_id prefix on terminal output makes concurrent output readable.

### 3.4 Spec Partitioning Strategy

When --parallel N is set and multiple specs exist:

1. The ParallelExecutor scans docs/specs/ for markdown files matching the naming convention.
2. If --spec PATH is also set, only that spec runs (parallelism ignored, single loop).
3. Specs are sorted by numeric prefix (00, 01, 02, ...) to maintain dependency ordering.
4. The first N specs are assigned to N loops. Remaining specs queue in FIFO order.
5. When a loop completes its spec, it picks the next queued spec.
6. If a spec fails (loop exhausts iterations without ALL_SPECS_COMPLETE), the failure is recorded
   but other loops continue. The ParallelExecutor does not abort all loops on a single failure.
7. Final BuildResult.success is True only if ALL specs completed successfully.

### 3.5 LLM Client Connection Pooling

The current LLMClient uses urllib.request.urlopen() which creates a new TCP connection per request.
Under concurrent load with 4+ threads, this means 4+ simultaneous connections to the HuggingFace
Router. This is acceptable because:

- urllib handles TLS negotiation per-connection (no shared state)
- HuggingFace Router supports concurrent connections from the same API key
- SambaNova backend load-balances across inference replicas
- Connection overhead (~100ms TLS handshake) is negligible vs LLM inference latency (~5-30s)

No connection pooling changes are needed. The LLMClient is already stateless after __init__
(api_key, endpoint_url, model names are immutable strings). Multiple threads can safely call
chat_completion() concurrently.

---

## 4. Intent and Expected Behavior

### As a user running codelicious with --parallel

"As a user, when I run `codelicious /path/to/repo --engine huggingface --parallel 4`, I expect
the system to find all spec files in docs/specs/, distribute them across 4 concurrent agentic loops,
and execute them simultaneously. I expect to see structured, labeled output on my terminal showing
which loop is doing what. I expect a single final BuildResult that tells me how many specs passed
and how many failed. I expect the build to complete in roughly 1/Nth the time of sequential execution
for N independent specs."

### As a user running codelicious without --parallel

"As a user, when I run `codelicious /path/to/repo` without the --parallel flag, I expect identical
behavior to the current system. The default is --parallel 1, which means a single sequential agentic
loop. No behavior changes. No performance regression."

### As a user reviewing build.log

"As a user, when I open .codelicious/build.log after a parallel build, I expect JSON Lines format
where every entry has a loop_id field. I can filter by loop_id to see the full history of a single
loop, or sort by timestamp to see the interleaved chronological view. I can pipe this file to jq
for analysis."

### As a developer debugging a failed spec

"As a developer, when one spec fails in a parallel build, I expect the other specs to continue
running. I expect the final output to clearly indicate which spec failed and which loop ran it.
I expect the build.log to contain the full LLM conversation history for the failed loop so I can
diagnose the issue."

### As a security auditor reviewing parallel execution

"As a security auditor, I expect the sandbox file count limit (200 files per session) to be enforced
globally across all concurrent loops, not per-loop. I expect the audit.log and security.log to
contain entries from all loops with clear loop_id attribution. I expect no race conditions in file
write operations even under concurrent access."

---

## 5. Quick Install and Verification

After implementing this spec, the following commands should work:

```bash
# Install (unchanged)
pip install -e ".[dev]"

# Run sequential (default, backwards compatible)
export HF_TOKEN='hf_your_token_here'
codelicious /path/to/repo --engine huggingface

# Run parallel with 4 loops
codelicious /path/to/repo --engine huggingface --parallel 4

# Run parallel with specific spec (parallelism ignored)
codelicious /path/to/repo --engine huggingface --parallel 4 --spec docs/specs/01_feature_cli.md

# Verify build log exists and is JSON Lines
cat .codelicious/build.log | python3 -m json.tool --no-ensure-ascii

# Filter build log by loop
cat .codelicious/build.log | python3 -c "
import json, sys
for line in sys.stdin:
    entry = json.loads(line)
    if entry.get('loop_id') == 'loop-001':
        print(json.dumps(entry))
"

# Run tests
pytest tests/ -v

# Lint
ruff check src/ tests/
```

---

## 6. Phases

Each phase includes the exact files to modify, the change description, acceptance criteria, and a
Claude Code prompt that can be copy-pasted to execute the phase.

---

### Phase 1: Fix P1-2 -- Unify Command Validation to Use shlex.split Everywhere

**Priority:** P1 Critical Security
**Files:** src/codelicious/tools/command_runner.py, tests/test_command_runner.py

**Problem:**
command_runner.py validates commands using str.split() (line 99-100) but executes them using
shlex.split() (line 125). This mismatch means a command like `ls "rm -rf /"` passes validation
(split sees ["ls", '"rm', '-rf', '/"']) but shlex.split produces ["ls", "rm -rf /"], potentially
bypassing the denylist check.

**Fix:**
Replace the str.split() call in the validation path with shlex.split(). Both validation and
execution must use identical tokenization. If shlex.split() raises ValueError (unmatched quotes),
reject the command.

**Expected Behavior:**
- As a user, when the LLM generates a command with quoted arguments, I expect the denylist check
  to see the same tokens that subprocess.run will execute.
- As a user, when the LLM generates a command with unmatched quotes, I expect a clear rejection
  rather than undefined behavior.

**Acceptance Criteria:**
- [ ] command_runner.py uses shlex.split() for both validation and execution
- [ ] shlex.ValueError is caught and the command is rejected with an error message
- [ ] Existing test_command_runner.py tests still pass (195 tests)
- [ ] New tests verify that quoted-argument denylist bypass is blocked
- [ ] New tests verify that unmatched quotes are rejected

**Claude Code Prompt:**
```
Read src/codelicious/tools/command_runner.py. Find the validation path where str.split() is used
to tokenize the command for denylist checking. Replace it with shlex.split() wrapped in a try/except
for ValueError. If shlex.split raises ValueError, return a ToolResponse with success=False and an
error message about malformed command syntax. Ensure the execution path also uses the same
shlex.split() tokens. Then read tests/test_command_runner.py and add tests:
- test_quoted_denylist_bypass_blocked: command='ls "rm -rf /"' should be safe (rm is inside quotes
  and is an argument to ls, not a command). Verify the command runs with ls as the binary.
- test_unmatched_quotes_rejected: command="ls 'unclosed" should be rejected.
- test_shlex_split_consistency: verify that the validation tokenization matches execution tokenization
  for commands with spaces, quotes, and backslashes.
Run pytest tests/test_command_runner.py -v to verify all tests pass. Run ruff check src/ tests/.
```

---

### Phase 2: Fix P1-8 -- Replace Silent Exception Swallowing in cli.py

**Priority:** P1 Critical Security
**Files:** src/codelicious/cli.py, tests/test_cli.py (new)

**Problem:**
cli.py line 113-114 contains a bare `except Exception: pass` that silently swallows errors from
the PR transition step. If the PR creation or transition fails, the user gets no feedback.

**Fix:**
Replace the bare except with explicit error logging. Log the exception at ERROR level with the
full traceback. Do not re-raise (the build succeeded, PR transition is best-effort). But the user
must see the error in both the terminal and the audit log.

**Expected Behavior:**
- As a user, when the PR transition fails after a successful build, I expect to see an ERROR log
  message explaining what went wrong (e.g., "GitHub API returned 403: insufficient permissions").
- As a user, I expect the build to still report success (the code was built and committed), but
  with a warning that the PR step failed.

**Acceptance Criteria:**
- [ ] cli.py logs PR transition errors at ERROR level with exception details
- [ ] No bare `except Exception: pass` remains in cli.py
- [ ] New test_cli.py tests verify that PR errors are logged, not swallowed
- [ ] Existing behavior is preserved: build success is not affected by PR failure

**Claude Code Prompt:**
```
Read src/codelicious/cli.py. Find the bare except Exception: pass block (around line 113-114) that
swallows PR transition errors. Replace it with:
    except Exception as exc:
        logger.error("PR transition failed: %s", exc, exc_info=True)
Ensure the build still reports success even when this error is logged. Then create
tests/test_cli.py with tests:
- test_pr_transition_error_logged: mock git_manager.transition_pr_to_review to raise RuntimeError,
  verify that logger.error is called with the exception message.
- test_pr_transition_error_does_not_affect_build_result: verify that BuildResult.success is still
  True when PR transition fails.
Run pytest tests/test_cli.py -v. Run ruff check src/ tests/.
```

---

### Phase 3: Fix P2-3 -- Add Process Group Timeout to command_runner.py

**Priority:** P2 Important Reliability
**Files:** src/codelicious/tools/command_runner.py, tests/test_command_runner.py

**Problem:**
command_runner.py uses subprocess.run() with a timeout, but child processes spawned by the command
(e.g., pytest spawning subprocesses) are not killed when the timeout fires. The timeout kills the
top-level process, but orphaned children continue running.

**Fix:**
Use os.setsid() as the preexec_fn to create a new process group. On timeout, send SIGTERM to the
entire process group using os.killpg(). After a 5-second grace period, send SIGKILL if the group
is still alive. This is POSIX-only (Linux/macOS), which matches the target platform.

**Expected Behavior:**
- As a user, when a command times out, I expect ALL processes it spawned to be terminated, not
  just the top-level process.
- As a user on macOS or Linux, I expect this to work correctly. Windows is not a target platform.

**Acceptance Criteria:**
- [ ] subprocess.run() uses start_new_session=True (Python 3.11+ equivalent of preexec_fn=os.setsid)
- [ ] On subprocess.TimeoutExpired, os.killpg(pgid, signal.SIGTERM) is called
- [ ] After 5-second grace, os.killpg(pgid, signal.SIGKILL) is called if group still alive
- [ ] New tests verify process group cleanup on timeout
- [ ] Existing timeout tests still pass

**Claude Code Prompt:**
```
Read src/codelicious/tools/command_runner.py. Find the subprocess.run() call. Modify it to use
start_new_session=True. Wrap the call in a try/except for subprocess.TimeoutExpired. In the except
block:
1. Get the process group ID from the expired process (e.process.pid).
2. Call os.killpg(pgid, signal.SIGTERM).
3. Wait 5 seconds with a try/except around os.waitpid(pgid, os.WNOHANG).
4. If still alive, call os.killpg(pgid, signal.SIGKILL).
5. Return ToolResponse with success=False and stderr="Command timed out after Ns".
Import signal and os at the top of the file. Then add tests to tests/test_command_runner.py:
- test_timeout_kills_process_group: mock subprocess.run to raise TimeoutExpired, verify
  os.killpg is called with SIGTERM.
- test_timeout_sigkill_after_grace: verify SIGKILL is sent if process group survives SIGTERM.
Note: Since we can't easily spawn real process groups in unit tests, mock os.killpg and
os.waitpid to verify the calls are made correctly.
Run pytest tests/test_command_runner.py -v. Run ruff check src/ tests/.
```

---

### Phase 4: Create StructuredLogger Module

**Priority:** P2 Important Reliability
**Files:** src/codelicious/structured_logger.py (new), tests/test_structured_logger.py (new)

**Problem:**
The current logging system produces unstructured output via Python's logging module. Under
concurrent execution, interleaved log lines from multiple loops become unreadable. There is no
machine-parseable log format for post-build analysis.

**Fix:**
Create a StructuredLogger class that writes to two streams:
1. .codelicious/build.log -- JSON Lines format, one JSON object per line, appended atomically.
2. Terminal stdout -- formatted with [loop_id] prefix, human-readable.

The StructuredLogger is thread-safe (uses threading.Lock for file writes). It does not replace
the existing logging module setup. It supplements it for build-phase events that need loop_id
attribution.

**Expected Behavior:**
- As a user running a parallel build, I expect terminal output to show [loop-001], [loop-002],
  etc. prefixes on every line so I can visually track which loop is doing what.
- As a user analyzing a completed build, I expect .codelicious/build.log to contain valid JSON
  Lines that I can filter with jq or Python.

**Acceptance Criteria:**
- [ ] StructuredLogger class exists in src/codelicious/structured_logger.py
- [ ] write() method accepts loop_id, level, phase, and arbitrary keyword data
- [ ] File output is JSON Lines format (one JSON object per line, newline-terminated)
- [ ] Terminal output is formatted with [loop_id] prefix
- [ ] File writes are atomic (write full line + flush in one locked operation)
- [ ] File permissions are 0o640 (owner read/write, group read)
- [ ] Credential sanitization is applied to all logged data (reuse SanitizingFilter patterns)
- [ ] Tests verify JSON Lines format, terminal format, thread safety, and credential sanitization
- [ ] build.log file is created in .codelicious/ directory

**Claude Code Prompt:**
```
Create src/codelicious/structured_logger.py with:

import json
import logging
import threading
import time
from pathlib import Path

class StructuredLogger:
    def __init__(self, repo_path: Path):
        - Store repo_path
        - Set log_path = repo_path / ".codelicious" / "build.log"
        - Create parent directory if needed
        - Open the log file in append mode with encoding="utf-8"
        - Set file permissions to 0o640
        - Initialize threading.Lock for file writes
        - Get a Python logger for terminal output

    def write(self, loop_id: str, level: str, phase: str, **data):
        - Build a dict: {"ts": ISO-8601 UTC timestamp, "loop_id": loop_id, "level": level,
          "phase": phase, **data}
        - Sanitize all string values using the patterns from logger.py SanitizingFilter
        - Serialize to JSON (one line, no indent)
        - Acquire lock, write line + newline to file, flush, release lock
        - Also emit formatted line to terminal logger:
          "[{loop_id}] {level:<5} {phase:<12} {summary}" where summary is a concise
          human-readable string derived from the data dict

    def close(self):
        - Flush and close the file handle

Implement the _sanitize method by importing the SECRET_PATTERNS from logger.py (or copying the
compiled regex list). Apply each pattern to every string value in the data dict.

Create tests/test_structured_logger.py with:
- test_json_lines_format: write 3 entries, read file, verify each line is valid JSON with
  required fields (ts, loop_id, level, phase).
- test_terminal_output_format: capture logging output, verify [loop_id] prefix format.
- test_thread_safety: spawn 10 threads each writing 100 entries, verify total line count is 1000
  and every line is valid JSON.
- test_credential_sanitization: write an entry containing "hf_abc123secret", verify the file
  contains the redacted version.
- test_file_permissions: verify the file has 0o640 permissions.
Run pytest tests/test_structured_logger.py -v. Run ruff check src/ tests/.
```

---

### Phase 5: Create ParallelExecutor Module

**Priority:** Core Feature
**Files:** src/codelicious/parallel_executor.py (new), tests/test_parallel_executor.py (new)

**Problem:**
The HuggingFace engine runs a single sequential agentic loop. There is no mechanism to run multiple
loops concurrently on different specs.

**Fix:**
Create a ParallelExecutor class that uses concurrent.futures.ThreadPoolExecutor to run multiple
agentic loops in parallel. Each loop is an independent LoopWorker that processes a single spec file.

**Expected Behavior:**
- As a user with 4 specs and --parallel 4, I expect all 4 specs to start simultaneously.
- As a user with 6 specs and --parallel 4, I expect 4 specs to start immediately, and the
  remaining 2 to start as the first loops complete.
- As a user with 1 spec and --parallel 4, I expect a single loop (no wasted threads).
- As a user, when one spec fails, I expect the other loops to continue and complete independently.

**Acceptance Criteria:**
- [ ] ParallelExecutor class exists in src/codelicious/parallel_executor.py
- [ ] Uses concurrent.futures.ThreadPoolExecutor (stdlib)
- [ ] Each LoopWorker gets: spec_path, loop_id, shared LLMClient, shared Sandbox, shared AuditLogger,
      own ToolRegistry instance, own message history list
- [ ] Spec partitioning: specs sorted by numeric prefix, distributed round-robin to workers
- [ ] Failed specs do not abort other loops
- [ ] Final result aggregates all loop results into a single BuildResult
- [ ] max_workers validated: min 1, max 8, default 1
- [ ] Tests verify: parallel execution, failure isolation, result aggregation, worker count bounds

**Claude Code Prompt:**
```
Create src/codelicious/parallel_executor.py with:

import concurrent.futures
import logging
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional

from codelicious.engines.base import BuildResult
from codelicious.structured_logger import StructuredLogger

logger = logging.getLogger("codelicious.parallel")

@dataclass
class LoopResult:
    spec_path: str
    loop_id: str
    success: bool
    message: str
    iterations: int
    elapsed_s: float

class ParallelExecutor:
    def __init__(self, repo_path: Path, max_workers: int = 1):
        - Validate max_workers: clamp to range [1, 8]
        - Store repo_path, max_workers
        - Initialize StructuredLogger

    def execute(self, spec_paths: List[Path], run_single_loop_fn, **kwargs) -> BuildResult:
        - If len(spec_paths) == 0: return BuildResult(success=False, message="No specs found")
        - If len(spec_paths) == 1 or max_workers == 1: run sequentially (no thread pool overhead)
        - Otherwise: create ThreadPoolExecutor(max_workers=min(max_workers, len(spec_paths)))
        - Submit each spec as a future with a unique loop_id ("loop-001", "loop-002", ...)
        - Collect results as futures complete (using as_completed for progress reporting)
        - Log each completion via StructuredLogger
        - Aggregate: success = all(r.success for r in results)
        - Return BuildResult with aggregated message and total elapsed time

    run_single_loop_fn is a callable that takes (spec_path, loop_id, structured_logger, **kwargs)
    and returns a LoopResult. This callable is provided by the HuggingFace engine, keeping the
    ParallelExecutor decoupled from engine internals.

Create tests/test_parallel_executor.py with:
- test_single_spec_no_thread_pool: verify that 1 spec runs without ThreadPoolExecutor
- test_multiple_specs_parallel: mock run_single_loop_fn to sleep(0.1) and return success,
  verify that 4 specs with max_workers=4 complete in ~0.1s (not ~0.4s)
- test_failure_isolation: mock one spec to fail, verify others still succeed
- test_result_aggregation: verify BuildResult.success is False when any spec fails
- test_max_workers_clamped: verify max_workers=0 becomes 1, max_workers=100 becomes 8
- test_empty_specs: verify BuildResult.success is False with empty spec list
- test_loop_id_assignment: verify loop_ids are "loop-001", "loop-002", etc.
Run pytest tests/test_parallel_executor.py -v. Run ruff check src/ tests/.
```

---

### Phase 6: Thread-Safe Refactoring of AuditLogger

**Priority:** P2 Important Reliability
**Files:** src/codelicious/tools/audit_logger.py, tests/test_security_audit.py

**Problem:**
audit_logger.py writes to audit.log and security.log without any locking. Under concurrent
agentic loops, interleaved writes can corrupt log entries (partial lines, mixed JSON).

**Fix:**
Add a threading.Lock to the AuditLogger class. All file write operations acquire the lock before
writing and release after flushing. The lock is per-AuditLogger instance. Since audit_logger is
shared across loops (by design, for centralized security logging), the lock protects concurrent
access.

**Expected Behavior:**
- As a security auditor, I expect audit.log and security.log entries to be complete and
  non-interleaved even when 4 loops are writing simultaneously.
- As a developer, I expect no deadlocks or performance degradation from the lock (file writes
  are fast, lock contention is minimal).

**Acceptance Criteria:**
- [ ] AuditLogger.__init__ creates a threading.Lock
- [ ] All file write methods acquire the lock before writing
- [ ] Existing test_security_audit.py tests still pass (20 tests)
- [ ] New tests verify thread safety: 4 threads writing 100 events each, all entries present and complete
- [ ] No deadlocks under concurrent access

**Claude Code Prompt:**
```
Read src/codelicious/tools/audit_logger.py. Add a threading.Lock to __init__. Find every method
that writes to audit.log or security.log (typically via logging handlers or direct file writes).
Wrap each write section in a with self._lock: block. Do not hold the lock during any I/O other
than the file write itself (do not hold it during string formatting or data preparation).

Then read tests/test_security_audit.py and add:
- test_audit_logger_thread_safety: create an AuditLogger, spawn 4 threads each calling
  log_security_event 100 times with unique messages, then read audit.log and verify 400 complete
  entries exist with no partial lines.
- test_audit_logger_no_deadlock: spawn 10 threads that rapidly alternate between log_security_event
  and set_iteration/set_current_tool calls, verify completion within 5 seconds.
Run pytest tests/test_security_audit.py -v. Run ruff check src/ tests/.
```

---

### Phase 7: Thread-Safe Refactoring of CacheManager

**Priority:** P2 Important Reliability
**Files:** src/codelicious/context/cache_engine.py, tests/test_cache_engine.py

**Problem:**
CacheManager.flush_cache() and _flush_state() use atomic writes (tempfile + os.replace), which
is safe for single-writer scenarios. Under concurrent loops, two threads could flush simultaneously,
and the second os.replace would silently overwrite the first. Additionally, load_cache() and
load_state() have no locking, so a thread could read a partially-written file.

**Fix:**
Add a threading.Lock to CacheManager. Lock around the full load-modify-flush cycle. Since cache
operations are infrequent (once per iteration, not per tool call), lock contention is negligible.

**Expected Behavior:**
- As a developer, I expect cache.json and state.json to always contain complete, valid JSON even
  when 4 loops are flushing simultaneously.
- As a developer, I expect no data loss from concurrent flushes.

**Acceptance Criteria:**
- [ ] CacheManager.__init__ creates a threading.Lock
- [ ] load_cache(), load_state(), flush_cache(), _flush_state() all acquire the lock
- [ ] Existing test_cache_engine.py tests still pass (14 tests)
- [ ] New tests verify: 4 threads flushing different data, final state contains all updates
- [ ] New tests verify: concurrent load during flush returns valid JSON (not partial)

**Claude Code Prompt:**
```
Read src/codelicious/context/cache_engine.py. Add a threading.Lock to __init__. Wrap load_cache,
load_state, flush_cache, and _flush_state in with self._lock: blocks. The lock must cover the
entire read-modify-write cycle to prevent lost updates.

Then read tests/test_cache_engine.py and add:
- test_concurrent_flush: create CacheManager, spawn 4 threads that each call flush_cache with
  different file hashes, verify final cache.json contains entries from all threads.
- test_concurrent_load_during_flush: spawn one thread that flushes in a loop, another that loads
  in a loop, verify load always returns valid JSON (never empty or partial).
Run pytest tests/test_cache_engine.py -v. Run ruff check src/ tests/.
```

---

### Phase 8: Integrate ParallelExecutor into HuggingFaceEngine

**Priority:** Core Feature
**Files:** src/codelicious/engines/huggingface_engine.py, src/codelicious/cli.py

**Problem:**
The HuggingFace engine runs a single agentic loop in run_build_cycle(). There is no integration
point for the ParallelExecutor.

**Fix:**
Refactor HuggingFaceEngine.run_build_cycle() to:
1. Accept a max_workers parameter (from CLI --parallel).
2. Discover spec files in docs/specs/ (or use --spec if provided).
3. If max_workers > 1 and multiple specs exist, use ParallelExecutor.
4. If max_workers == 1 or single spec, run the existing sequential loop (no behavior change).
5. Extract the existing agentic loop body into a _run_single_loop() method that accepts
   (spec_path, loop_id, structured_logger) and returns a LoopResult.

Also update cli.py to:
1. Add --parallel N argument (default: 1, type: int).
2. Pass max_workers to the engine's run_build_cycle().

**Expected Behavior:**
- As a user, when I run without --parallel, behavior is identical to the current system.
- As a user, when I run with --parallel 4, the HuggingFace engine discovers specs and runs
  them concurrently.
- As a user using the Claude Code engine, --parallel is accepted but ignored (Claude manages
  its own concurrency).

**Acceptance Criteria:**
- [ ] cli.py has --parallel N argument with default=1, type=int
- [ ] HuggingFaceEngine.run_build_cycle accepts max_workers parameter
- [ ] When max_workers=1, existing sequential behavior is preserved exactly
- [ ] When max_workers>1, ParallelExecutor is used
- [ ] _run_single_loop() is extracted and works independently
- [ ] Existing tests still pass (no regressions)
- [ ] Claude Code engine ignores --parallel (no error, no change)

**Claude Code Prompt:**
```
Read src/codelicious/engines/huggingface_engine.py. Refactor run_build_cycle:

1. Add max_workers=1 parameter to run_build_cycle signature.
2. Add spec discovery: scan repo_path / "docs" / "specs" for *.md files, sorted by name.
   If spec_filter is set, use only that file.
3. Extract the existing agentic loop (lines 83-153 approximately) into a new method:
   def _run_single_loop(self, spec_path, loop_id, repo_path, git_manager, cache_manager,
                         structured_logger, max_iterations):
   This method returns a LoopResult (import from parallel_executor).
4. In run_build_cycle: if max_workers > 1 and len(spec_paths) > 1, create ParallelExecutor
   and call execute(). Otherwise, call _run_single_loop directly.

Then read src/codelicious/cli.py. Add argparse argument:
    parser.add_argument("--parallel", type=int, default=1,
                        help="Number of concurrent agentic loops (HF engine only, default: 1)")
Pass args.parallel as max_workers to engine.run_build_cycle().

Do NOT modify the Claude Code engine. If --parallel is passed with --engine claude, it is silently
ignored.

Run pytest -v. Run ruff check src/ tests/.
```

---

### Phase 9: Expand Sandbox Thread Safety for Full Validate-Write Cycle

**Priority:** P1 Critical Security
**Files:** src/codelicious/sandbox.py, tests/test_sandbox.py

**Problem:**
sandbox.py has a threading.Lock for the file counter, but the lock does not cover the full
validate-then-write cycle. Under concurrent loops, Thread A could validate a path and Thread B
could create a symlink at that path before Thread A writes. This is the P1-6 TOCTOU gap, now
critical because concurrent loops make it exploitable.

**Fix:**
Expand the existing lock to cover the entire validate_write -> write_file cycle. The lock is
held from path validation through file write completion. This eliminates the TOCTOU window.

Performance impact: file writes are fast (disk I/O), and lock contention under 4 loops is
negligible. The lock serializes file writes, not LLM calls (which dominate wall-clock time).

**Expected Behavior:**
- As a security auditor, I expect no TOCTOU window between path validation and file write,
  even under concurrent access from 4 loops.
- As a developer, I expect no measurable performance degradation from the expanded lock scope.

**Acceptance Criteria:**
- [ ] sandbox.py lock covers the full validate -> resolve -> check_denied -> check_extension
      -> check_symlink -> write cycle
- [ ] Existing test_sandbox.py tests still pass (46 tests)
- [ ] New tests: 4 threads writing to different paths concurrently, all writes succeed
- [ ] New tests: 4 threads writing to the same path concurrently, no corruption
- [ ] File count limit (200) is enforced globally across all concurrent writes

**Claude Code Prompt:**
```
Read src/codelicious/sandbox.py. Find the existing threading.Lock (used for file counting). Expand
its scope: the lock must be acquired at the beginning of write_file() and released at the end,
covering the entire validation + write cycle. Do not hold the lock during the actual tempfile
write to disk (only hold it during validation + the final os.replace atomic rename). This minimizes
lock contention while eliminating the TOCTOU window.

Specifically:
1. Acquire lock at start of write_file()
2. Run all validation (resolve_path, check_denied, check_extension, validate_write, check_symlink)
3. Create tempfile and write content (release lock here is OK since tempfile path is unique)
4. Re-acquire lock for the final os.replace() + counter increment
5. Release lock

Then add to tests/test_sandbox.py:
- test_concurrent_writes_different_paths: 4 threads write to 4 different .py files, all succeed
- test_concurrent_writes_same_path: 4 threads write to the same .py file, final content is one
  of the 4 (no corruption, no partial writes)
- test_concurrent_file_count_limit: set max_file_count=10, spawn 4 threads each writing 5 files,
  verify that exactly 10 files are created and additional writes are rejected
Run pytest tests/test_sandbox.py -v. Run ruff check src/ tests/.
```

---

### Phase 10: Integration Tests for Parallel Execution

**Priority:** Core Feature
**Files:** tests/test_parallel_integration.py (new)

**Problem:**
Phases 1-9 add individual components. This phase verifies they work together end-to-end.

**Fix:**
Create an integration test that:
1. Sets up a temporary repository with 3 spec files.
2. Mocks the LLM client to return predetermined tool call sequences.
3. Runs the HuggingFace engine with max_workers=3.
4. Verifies that all 3 specs are processed, build.log contains entries from all 3 loop IDs,
   audit.log contains entries from all 3 loops, and the final BuildResult aggregates correctly.

**Expected Behavior:**
- As a developer, I expect the integration test to prove that parallel execution works end-to-end
  without requiring real API calls or network access.

**Acceptance Criteria:**
- [ ] Integration test exists in tests/test_parallel_integration.py
- [ ] Test creates a temporary repo with 3 dummy spec files
- [ ] LLMClient is mocked to return tool calls and eventually "ALL_SPECS_COMPLETE"
- [ ] Test runs with max_workers=3
- [ ] Test verifies: 3 LoopResults, all successful, build.log has 3 distinct loop_ids
- [ ] Test verifies: audit.log has entries from all loops
- [ ] Test verifies: no partial or corrupted log lines
- [ ] Test completes in under 10 seconds (no real LLM calls)

**Claude Code Prompt:**
```
Create tests/test_parallel_integration.py:

import json
import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

from codelicious.engines.huggingface_engine import HuggingFaceEngine
from codelicious.context.cache_engine import CacheManager

Set up a fixture that:
1. Creates a tempdir with docs/specs/ containing 3 dummy spec files (01_test.md, 02_test.md,
   03_test.md), each with a simple "# Test Spec N" content.
2. Creates .codelicious/ directory.

Mock LLMClient.chat_completion to return a response with content="ALL_SPECS_COMPLETE" (no tool
calls, immediate completion signal). This simulates a trivial build that completes in one iteration.

Test test_parallel_three_specs:
1. Create HuggingFaceEngine.
2. Call run_build_cycle with the temp repo and max_workers=3.
3. Assert BuildResult.success is True.
4. Read .codelicious/build.log, verify it contains JSON Lines with loop_ids "loop-001",
   "loop-002", "loop-003".
5. Verify all lines are valid JSON.

Test test_parallel_one_failure:
1. Mock LLMClient to return "ALL_SPECS_COMPLETE" for specs 1 and 3, but exhaust iterations
   (return empty tool calls, no completion signal) for spec 2.
2. Run with max_workers=3 and max_iterations=2.
3. Assert BuildResult.success is False (one spec failed).
4. Verify build.log contains entries from all 3 loop_ids.

Run pytest tests/test_parallel_integration.py -v. Run ruff check src/ tests/.
```

---

### Phase 11: Sample Dummy Data and Test Fixtures

**Priority:** Testing
**Files:** tests/fixtures/ (new directory), tests/conftest.py

**Problem:**
Tests currently create ad-hoc temporary files inline. There are no shared fixtures for common
test scenarios like "a repository with specs" or "a mock LLM response with tool calls."

**Fix:**
Create a tests/fixtures/ directory with reusable test data:
1. tests/fixtures/specs/ -- sample spec files (valid, invalid, malicious).
2. tests/fixtures/llm_responses/ -- mock LLM responses (with tool calls, without, error responses).
3. tests/conftest.py -- shared pytest fixtures (temp_repo, mock_llm_client, mock_sandbox).

**Expected Behavior:**
- As a developer writing new tests, I expect to find ready-made fixtures for common scenarios
  rather than having to create mock data from scratch.
- As a developer, I expect conftest.py to provide fixtures like `temp_repo_with_specs` that
  create a complete temporary repository with .codelicious/ directory and sample spec files.

**Acceptance Criteria:**
- [ ] tests/fixtures/specs/ contains: valid_simple.md, valid_multi_section.md, invalid_empty.md,
      malicious_path_traversal.md
- [ ] tests/fixtures/llm_responses/ contains: tool_call_write_file.json, tool_call_run_command.json,
      completion_signal.json, error_rate_limit.json
- [ ] tests/conftest.py has fixtures: temp_repo, temp_repo_with_specs, mock_llm_success,
      mock_llm_tool_call
- [ ] Existing tests continue to pass (fixtures supplement, not replace)
- [ ] At least 2 existing test files are updated to use the new fixtures

**Claude Code Prompt:**
```
Create the following directory structure:
- tests/fixtures/specs/valid_simple.md: A minimal valid spec with one requirement.
- tests/fixtures/specs/valid_multi_section.md: A valid spec with 3 sections and 5 requirements.
- tests/fixtures/specs/invalid_empty.md: Empty file.
- tests/fixtures/specs/malicious_path_traversal.md: Spec with ../../etc/passwd in requirement text.
- tests/fixtures/llm_responses/tool_call_write_file.json: OpenAI-compatible response with a
  write_file tool call.
- tests/fixtures/llm_responses/tool_call_run_command.json: Response with a run_command tool call
  for "pytest".
- tests/fixtures/llm_responses/completion_signal.json: Response with content="ALL_SPECS_COMPLETE".
- tests/fixtures/llm_responses/error_rate_limit.json: Response simulating a 429 rate limit error.

Then read tests/conftest.py. Add these fixtures (keep all existing fixtures):
- temp_repo: creates a tempdir with .codelicious/ and returns the Path.
- temp_repo_with_specs: creates a tempdir with .codelicious/ and docs/specs/ containing the
  valid_simple.md and valid_multi_section.md fixtures.
- mock_llm_success: returns a MagicMock of LLMClient where chat_completion returns the
  completion_signal.json response.
- mock_llm_tool_call: returns a MagicMock of LLMClient where chat_completion returns the
  tool_call_write_file.json response.

Run pytest -v. Run ruff check src/ tests/.
```

---

### Phase 12: Update README.md with Parallel Architecture Diagrams

**Priority:** Documentation
**Files:** README.md

**Problem:**
The README documents the sequential architecture. It does not reflect the new parallel execution
capability.

**Fix:**
Add new Mermaid diagrams to README.md covering:
1. Parallel Execution Architecture (showing ParallelExecutor, ThreadPoolExecutor, LoopWorkers).
2. Thread Safety Model (showing which resources are shared vs per-loop, and lock granularity).
3. Updated CLI Reference (adding --parallel flag).
4. Updated Codebase Logic Composition pie chart (reflecting new modules).

**Expected Behavior:**
- As a new developer reading the README, I expect to understand the parallel execution model
  from the diagrams without reading source code.

**Acceptance Criteria:**
- [ ] README.md contains a "Parallel Execution Architecture" Mermaid diagram
- [ ] README.md contains a "Thread Safety Model" Mermaid diagram
- [ ] CLI Reference table includes --parallel flag
- [ ] Codebase Logic Composition pie chart is updated
- [ ] All existing diagrams are preserved (append new ones, do not remove old ones)

**Claude Code Prompt:**
```
Read README.md. Add the following sections BEFORE the "## License" line at the end:

1. Under "## CLI Reference", add --parallel N to the options list:
   --parallel N                       Concurrent agentic loops, HF engine only (default: 1)

2. Add a new section "### Parallel Execution Architecture" with this Mermaid diagram:

flowchart TB
    CLI["codelicious /repo --parallel 4"]
    Engine["HuggingFaceEngine.run_build_cycle()"]
    PE["ParallelExecutor(max_workers=4)"]

    subgraph Workers["ThreadPoolExecutor"]
        W1["LoopWorker loop-001\nspec: 01_feature_cli.md"]
        W2["LoopWorker loop-002\nspec: 02_feature_agent.md"]
        W3["LoopWorker loop-003\nspec: 03_feature_git.md"]
        W4["LoopWorker loop-004\nspec: 04_feature_ext.md"]
    end

    subgraph Shared["Shared Resources (Thread-Safe)"]
        LLM["LLMClient\n(stateless)"]
        SB["Sandbox\n(Lock)"]
        AL["AuditLogger\n(Lock)"]
        CM["CacheManager\n(Lock)"]
        SL["StructuredLogger\n(Lock)"]
    end

    subgraph PerLoop["Per-Loop Resources (No Sharing)"]
        TR["ToolRegistry\n(per instance)"]
        MH["Message History\n(per list)"]
    end

    CLI --> Engine --> PE
    PE --> Workers
    W1 & W2 & W3 & W4 --> Shared
    W1 & W2 & W3 & W4 --> PerLoop
    Workers --> Result["BuildResult\n(aggregated)"]

3. Add a new section "### Structured Logging Flow" with a Mermaid diagram showing:
   LoopWorker --> StructuredLogger --> build.log (JSON Lines) and Terminal (formatted)

4. Update the "Codebase Logic Composition" pie chart to:
   pie title Code Composition by Logic Type (~9,200 lines)
       "Deterministic Safety Harness (41%)" : 3800
       "Probabilistic LLM-Driven (44%)" : 4050
       "Shared Infrastructure (15%)" : 1350

Do NOT remove any existing diagrams or sections. Append new content only.
Run ruff check src/ tests/.
```

---

### Phase 13: Update STATE.md and CLAUDE.md

**Priority:** Documentation
**Files:** .codelicious/STATE.md, CLAUDE.md

**Problem:**
STATE.md reflects spec-08 Phase 8 as the latest completed work. CLAUDE.md does not mention
parallel execution or the --parallel flag.

**Fix:**
Update STATE.md to reflect the current spec-15 progress. Update CLAUDE.md to mention the
parallel execution capability for the builder agent.

**Acceptance Criteria:**
- [ ] STATE.md reflects spec-15 as current work
- [ ] STATE.md lists all spec-15 phases with completion checkboxes
- [ ] CLAUDE.md mentions --parallel flag in the "How to Work" section
- [ ] CLAUDE.md mentions StructuredLogger for debugging parallel builds

**Claude Code Prompt:**
```
Read .codelicious/STATE.md. Add a new section at the top for spec-15:

### spec-15: Parallel Agentic Loops (IN PROGRESS)

- [ ] Phase 1: Fix P1-2 -- Unify Command Validation (shlex.split)
- [ ] Phase 2: Fix P1-8 -- Replace Silent Exception Swallowing
- [ ] Phase 3: Fix P2-3 -- Add Process Group Timeout
- [ ] Phase 4: Create StructuredLogger Module
- [ ] Phase 5: Create ParallelExecutor Module
- [ ] Phase 6: Thread-Safe AuditLogger
- [ ] Phase 7: Thread-Safe CacheManager
- [ ] Phase 8: Integrate ParallelExecutor into HuggingFaceEngine
- [ ] Phase 9: Expand Sandbox Thread Safety
- [ ] Phase 10: Integration Tests for Parallel Execution
- [ ] Phase 11: Sample Dummy Data and Test Fixtures
- [ ] Phase 12: Update README.md with Parallel Architecture Diagrams
- [ ] Phase 13: Update STATE.md and CLAUDE.md
- [ ] Phase 14: Lint, Format, and Full Verification

Update the "Current Status" header to reference spec-15.

Then read CLAUDE.md. In the "## How to Work" section, add:
- Use `--parallel N` with the HuggingFace engine to run N concurrent agentic loops.
- Check `.codelicious/build.log` for structured JSON Lines logging of parallel builds.

Do not remove any existing content.
```

---

### Phase 14: Lint, Format, and Full Verification

**Priority:** Final Validation
**Files:** All modified files

**Problem:**
After 13 phases of changes, the codebase must pass all quality gates.

**Fix:**
Run the full verification suite: pytest, ruff check, ruff format, and security scan. Fix any
issues found.

**Acceptance Criteria:**
- [ ] All tests pass (620+ expected)
- [ ] ruff check src/ tests/ reports zero violations
- [ ] ruff format --check src/ tests/ reports zero formatting issues
- [ ] No eval(), exec(), shell=True, or hardcoded secrets in new code
- [ ] .codelicious/BUILD_COMPLETE contains "DONE"

**Claude Code Prompt:**
```
Run the following commands in sequence:
1. ruff check src/ tests/ --fix (auto-fix lint issues)
2. ruff format src/ tests/ (auto-format)
3. pytest tests/ -v --tb=short (run all tests, show failures)
4. If any tests fail, read the failing test file and the source file it tests. Fix the issue.
   Re-run pytest until all tests pass.
5. Run: grep -rn "eval(" src/ --include="*.py" | grep -v "test_" | grep -v "#" to check for
   eval() usage. Same for exec(, shell=True, and common secret patterns.
6. Write "DONE" to .codelicious/BUILD_COMPLETE.
```

---

## 7. Security Considerations

### 7.1 Thread Safety Under Concurrent Access

The parallel execution model introduces shared mutable state that must be protected:

- **File system sandbox**: The file count limit (200 files per session) is global across all loops.
  The expanded lock in Phase 9 ensures atomic validate-then-write operations.
- **Audit logging**: Security events from all loops must be logged completely and without corruption.
  Phase 6 adds locking to AuditLogger file writes.
- **Cache persistence**: state.json and cache.json are shared ledgers. Phase 7 adds locking to
  CacheManager to prevent lost updates.

### 7.2 Resource Exhaustion

- **Thread count**: Clamped to [1, 8] to prevent unbounded thread creation.
- **File descriptors**: Each loop opens LLM connections and may trigger tool executions. With 8
  concurrent loops, peak file descriptor usage is approximately 8 (LLM) + 8 (stdout pipes) +
  8 (stderr pipes) + 3 (log files) = 27. Well within the default ulimit of 256.
- **Memory**: Each loop maintains a message history list that grows up to 80K tokens
  (approximately 320KB of text). With 8 loops, peak memory for message histories is approximately
  2.5MB. Negligible.

### 7.3 Denial of Service via Spec Count

A malicious repository could contain hundreds of spec files, attempting to overwhelm the system.
The ParallelExecutor's max_workers cap (8) limits concurrent threads. Specs beyond the worker
count queue in FIFO order and execute sequentially as workers become available. The total
execution time is bounded by max_iterations * max_workers * llm_timeout.

### 7.4 Log Injection

build.log uses JSON serialization, which escapes special characters. An LLM-generated string
containing newlines or JSON syntax will be safely escaped by json.dumps(). The StructuredLogger
also applies credential sanitization to all logged data.

---

## 8. Performance Projections

### 8.1 Throughput Model

| Configuration | Concurrent Loops | Est. TPS (SambaNova) | Est. TPS (Dedicated Inference) |
|---------------|-----------------|----------------------|-------------------------------|
| --parallel 1 (default) | 1 | 50-200 | 200-500 |
| --parallel 2 | 2 | 100-400 | 400-1,000 |
| --parallel 4 | 4 | 200-800 | 800-2,000 |
| --parallel 8 | 8 | 400-1,600 | 1,600-4,000 |

These are estimates assuming independent specs with no shared file contention. Actual throughput
depends on: LLM provider capacity, network latency, spec complexity, and sandbox lock contention.

### 8.2 Bottleneck Analysis

| Component | Single Loop | 4 Loops | Mitigation |
|-----------|------------|---------|------------|
| LLM API latency | 5-30s per call | Same per call, 4x concurrency | Provider-side, not codelicious |
| Sandbox file writes | ~1ms per write | ~1ms per write (serialized by lock) | Lock contention negligible |
| Audit logging | ~0.1ms per entry | ~0.1ms per entry (serialized by lock) | Lock contention negligible |
| Cache flush | ~5ms per flush | ~5ms per flush (serialized by lock) | Infrequent (once per iteration) |
| Message history | In-memory, ~0.01ms | Per-loop, no contention | N/A |

The dominant bottleneck is LLM API latency (5-30 seconds per call). All other operations are
sub-millisecond. Parallel loops achieve near-linear throughput scaling because each loop spends
99%+ of its time waiting for LLM responses (I/O bound).

---

## 9. Rollback Plan

If parallel execution introduces instability:

1. Set --parallel 1 (default). This restores sequential behavior with zero code changes.
2. The ParallelExecutor is only activated when max_workers > 1 AND multiple specs exist.
   Single-spec builds always use the sequential path regardless of --parallel value.
3. All thread-safety changes (locks in AuditLogger, CacheManager, Sandbox) are backwards
   compatible. They add overhead of approximately 0.001ms per lock acquisition, which is
   unmeasurable in practice.

---

## 10. Testing Strategy

### 10.1 Unit Tests

| Module | New Tests | Total After Spec |
|--------|-----------|-----------------|
| test_command_runner.py | 5 (P1-2, P2-3 fixes) | 200 |
| test_cli.py (new) | 4 (P1-8 fix) | 4 |
| test_structured_logger.py (new) | 5 | 5 |
| test_parallel_executor.py (new) | 7 | 7 |
| test_security_audit.py | 2 (thread safety) | 22 |
| test_cache_engine.py | 2 (thread safety) | 16 |
| test_sandbox.py | 3 (thread safety) | 49 |
| test_parallel_integration.py (new) | 2 | 2 |

### 10.2 Test Principles

- All tests are deterministic: no network calls, no API keys, no filesystem timing dependencies.
- LLM calls are mocked. Tests verify orchestration logic, not LLM output quality.
- Thread safety tests use controlled synchronization (barriers, events) to force race conditions.
- Integration tests use temporary directories that are cleaned up after each test.

---

## 11. Acceptance Criteria (Spec-Level)

- [ ] All 14 phases complete with individual acceptance criteria met
- [ ] pytest reports 620+ passing tests with zero failures
- [ ] ruff check src/ tests/ reports zero violations
- [ ] ruff format --check src/ tests/ reports zero formatting issues
- [ ] codelicious --parallel 1 produces identical behavior to current system (regression test)
- [ ] codelicious --parallel 4 with 4 specs produces 4 concurrent loop executions
- [ ] .codelicious/build.log contains valid JSON Lines with loop_id fields
- [ ] audit.log and security.log contain entries from all concurrent loops
- [ ] File count limit (200) is enforced globally across all concurrent loops
- [ ] No new runtime dependencies (stdlib only)
- [ ] README.md contains updated Mermaid diagrams
- [ ] STATE.md reflects spec-15 progress
- [ ] .codelicious/BUILD_COMPLETE contains "DONE"
