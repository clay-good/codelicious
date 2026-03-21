# Codelicious

**Outcome as a Service.** Write specs. Run `codelicious /path/to/repo`. Get a green, review-ready Pull Request.

Codelicious is a headless, autonomous developer CLI that transforms markdown specifications into production-ready Pull Requests with zero human intervention. It orchestrates a dual-engine architecture powered by Claude Code and HuggingFace (DeepSeek for reasoning, Qwen for coding).

```
Spec -> Code -> Test -> Commit -> PR
```

---

## Quick Start

```bash
# 1. Clone and install (includes dev tools: pytest, ruff, bandit, pip-audit)
git clone https://github.com/clay-good/codelicious.git
cd codelicious
pip install -e ".[dev]"
# Or minimal install without dev tools: pip install -e .

# 2. Run against your repo
codelicious /path/to/your/repo
```

### Engine Options

```bash
# Claude Code CLI (requires `claude` binary installed + API credits)
codelicious /path/to/your/repo

# HuggingFace engine (free, no API costs)
export HF_TOKEN=hf_your_token_here  # https://huggingface.co/settings/tokens
codelicious /path/to/your/repo --engine huggingface
```

### Development Setup

```bash
pip install -e ".[dev]"    # Install with dev dependencies (pytest, ruff, bandit, pip-audit)
pytest                      # Run tests
ruff check src/ tests/      # Lint
bandit -r src/              # Security scan
pip-audit                   # Dependency vulnerability check
```

---

## How Git, Commits, and PRs Work

This is the part you need to understand. Codelicious works **inside a git repo you provide**. Here's the full workflow:

### Prerequisites

Your target repo must:
1. **Be a git repository** (has a `.git/` folder)
2. **Have a remote named `origin`** pointing to GitHub or GitLab
3. **Have `gh` CLI installed and authenticated** (for GitHub PRs) or `glab` for GitLab MRs

### Step-by-Step Workflow

```bash
# 1. Navigate to your project repo
cd /path/to/your/repo

# 2. Make sure you're on main and up to date
git checkout main
git pull origin main

# 3. Run codelicious with --push-pr to get the full pipeline
codelicious /path/to/your/repo --push-pr
```

**What happens automatically:**

1. Codelicious detects you're on `main` and creates a feature branch: `codelicious/auto-build`
2. It reads your specs from `docs/specs/*.md`
3. It implements the code, runs tests, verifies
4. It commits changes to the feature branch
5. With `--push-pr`, it pushes the branch and creates a **Draft PR** via `gh pr create --draft`
6. When all verification passes, it marks the PR as **Ready for Review**

### Manual Git Push (if you skip --push-pr)

If you run without `--push-pr`, codelicious still commits locally but does NOT push. You handle it:

```bash
# After codelicious finishes:
cd /path/to/your/repo
git log --oneline -5           # See what codelicious committed
git push -u origin HEAD        # Push the feature branch

# Create the PR yourself:
gh pr create --title "feat: autonomous implementation" --body "Built by Codelicious"
# Or for GitLab:
glab mr create --title "feat: autonomous implementation" --description "Built by Codelicious"
```

### Recommended Workflow for Iterative Builds

```bash
# First run — builds and creates draft PR
codelicious /path/to/your/repo --push-pr

# Subsequent runs — appends commits to the same branch/PR
codelicious /path/to/your/repo --push-pr

# When you're happy, the PR is already open — just review and merge
```

### Summary of Commands

| Step | Command | When |
|------|---------|------|
| Install | `pip install -e .` | Once |
| Build + auto PR | `codelicious /path/to/repo --push-pr` | Each build cycle |
| Build only (no push) | `codelicious /path/to/repo` | When you want to review locally first |
| Push manually | `git push -u origin HEAD` | After a no-push build |
| Create PR (GitHub) | `gh pr create --draft` | After manual push |
| Create MR (GitLab) | `glab mr create` | After manual push |

---

## Dual Engine Architecture

Codelicious auto-detects the best available engine at startup:

| Engine | Backend | How It Works |
|--------|---------|--------------|
| **Claude Code CLI** | `claude` binary | Spawns Claude Code as subprocess. 6-phase lifecycle: scaffold, build, verify, reflect, commit, PR. |
| **HuggingFace** | DeepSeek-V3 + Qwen3-235B | Free HTTP API via SambaNova. DeepSeek plans, Qwen codes. 50-iteration agentic loop. No API costs. |

Auto-detection priority: Claude Code CLI > HuggingFace > error with setup instructions.

> **Note:** Engine selection happens at startup, not mid-build. If you hit Claude token limits, re-run with `--engine huggingface` to use the free HuggingFace backend. The HuggingFace engine is a fully independent code path — not a degraded mode.

---

## CLI Reference

```
codelicious <repo_path> [options]

Options:
  --engine {auto,claude,huggingface}  Build engine (default: auto)
  --model MODEL                       Model override (e.g. claude-sonnet-4-6)
  --agent-timeout SECONDS             Claude engine timeout (default: 1800)
  --resume SESSION_ID                 Resume a previous Claude session
  --verify-passes N                   Verification passes (default: 3)
  --no-reflect                        Skip quality review phase
  --push-pr                           Push and create/update PR
  --max-iterations N                  HF engine max iterations (default: 50)
  --dry-run                           Log phases without executing
  --spec PATH                         Target a specific spec file
```

## Claude Code Engine Phases

When using the Claude Code engine, codelicious runs a 6-phase lifecycle:

1. **SCAFFOLD** — writes `CLAUDE.md` and `.claude/` directory (agents, skills, rules, settings) into the target project
2. **BUILD** — spawns Claude Code CLI with an autonomous build prompt. Claude reads specs, implements code, runs tests, commits.
3. **VERIFY** — runs deterministic verification: Python syntax check, test suite, security pattern scan
4. **REFLECT** — optional read-only quality review by Claude (can skip with `--no-reflect`)
5. **GIT** — commits all changes to the feature branch
6. **PR** — pushes and creates/updates a draft PR (requires `--push-pr`)

---

## Writing Specs

Place markdown specs in `docs/specs/` in your target repo. Codelicious will find and build them in order.

```markdown
# Feature: User Authentication

## Requirements
- [ ] Add login endpoint at POST /api/auth/login
- [ ] Add JWT token generation
- [ ] Add middleware for protected routes
- [ ] Write tests for all auth flows

## Acceptance Criteria
- All tests pass
- No hardcoded secrets
- Rate limiting on login endpoint
```

---

## Security Model

Codelicious enforces defense-in-depth security, all hardcoded in Python (not configurable by the LLM):

- **Command denylist** — 39 dangerous commands blocked (`rm`, `sudo`, `dd`, `kill`, `curl`, etc.)
- **Shell injection prevention** — `shell=False` + metacharacter blocking (`|`, `&`, `;`, `$`, etc.)
- **File write protection** — LLM cannot modify its own tool source code or security config
- **File extension allowlist** — only safe file types can be written
- **Path traversal defense** — null byte detection, `..` rejection, symlink resolution
- **Security scanning** — pre-commit scan for `eval()`, `exec()`, `shell=True`, hardcoded secrets

---

## Project Structure

```
src/codelicious/
  cli.py                    # Entry point with engine selection
  engines/
    __init__.py             # select_engine() auto-detection
    base.py                 # BuildEngine ABC + BuildResult
    claude_engine.py        # Claude Code CLI 6-phase engine
    huggingface_engine.py   # HuggingFace tool-dispatch engine
  agent_runner.py           # Claude subprocess management
  scaffolder.py             # CLAUDE.md + .claude/ generation
  prompts.py                # All agent prompt templates
  verifier.py               # Deterministic verification pipeline
  tools/
    registry.py             # Tool name -> function dispatch
    fs_tools.py             # Sandboxed file operations
    command_runner.py        # Denylist command execution
    audit_logger.py         # Security event logging
  git/
    git_orchestrator.py     # Branch safety + PR management
  context/
    cache_engine.py         # State persistence
    rag_engine.py           # SQLite vector search
  errors.py                 # Typed exceptions
  config.py                 # Environment + file config loading
```

## Runtime Files

Codelicious creates a `.codelicious/` directory in the target repo (gitignored):

| File | Purpose |
|------|---------|
| `state.json` | Task progress and memory |
| `cache.json` | File hash index |
| `db.sqlite3` | Vector embeddings for RAG |
| `audit.log` | Full agent interaction log |
| `security.log` | Security events only |
| `STATE.md` | Human-readable build status |
| `BUILD_COMPLETE` | Sentinel file (contains "DONE" when finished) |

---

## Architecture

### Build Lifecycle

```mermaid
flowchart TB
    User["Developer runs: codelicious /path/to/repo"]
    EngineSelect{"Engine\nSelection"}
    Claude["Claude Code CLI Engine"]
    HF["HuggingFace Engine"]

    subgraph Claude_Lifecycle["Claude Code 6-Phase Lifecycle"]
        C1["1. SCAFFOLD\nWrite CLAUDE.md + .claude/"]
        C2["2. ANALYZE\nExplore codebase"]
        C3["3. BUILD\nImplement specs"]
        C4["4. VERIFY\nSyntax + Tests + Security"]
        C5["5. REFLECT\nQuality review"]
        C6["6. PR\nCommit + Push + PR"]
        C1 --> C2 --> C3 --> C4 --> C5 --> C6
    end

    subgraph HF_Lifecycle["HuggingFace Agentic Loop"]
        H1["System prompt\nwith tool schemas"]
        H2["LLM generates\ntool calls"]
        H3["Tool dispatch\n(read/write/run)"]
        H4["Result appended\nto history"]
        H5{"Iteration\nlimit?"}
        H1 --> H2 --> H3 --> H4 --> H5
        H5 -->|No| H2
        H5 -->|Yes| H6["Return result"]
    end

    User --> EngineSelect
    EngineSelect -->|"claude binary found"| Claude
    EngineSelect -->|"HF_TOKEN set"| HF
    Claude --> Claude_Lifecycle
    HF --> HF_Lifecycle

    C6 --> Done["Review-ready PR"]
    H6 --> Done
```

### Security Architecture

```mermaid
flowchart TB
    LLM["LLM Agent\n(Claude or DeepSeek/Qwen)"]

    subgraph Security_Layers["Defense-in-Depth Layers"]
        direction TB
        L1["Command Denylist\n39 dangerous commands blocked"]
        L2["Metacharacter Filter\nShell injection chars blocked"]
        L3["shell=False\nNo shell interpretation"]
        L4["Extension Allowlist\n32 safe file types only"]
        L5["Path Validation\nNull bytes, .., symlinks"]
        L6["Protected Paths\nSecurity-critical files immutable"]
        L7["Size/Count Limits\n1MB per file, 200 files per session"]
        L8["Security Scanner\neval/exec/secrets detection"]
        L9["Audit Logging\nAll operations logged"]
    end

    LLM --> L1 --> L2 --> L3
    L3 --> L4 --> L5 --> L6 --> L7
    L7 --> L8 --> L9
    L9 --> FS["Filesystem\n(safe writes only)"]
```

---

## Security Findings Resolution

```mermaid
pie title Security Findings Resolution (Spec-07 through Spec-14)
    "Resolved by Spec-07 (sandbox)" : 16
    "Resolved by Spec-08 (reliability)" : 2
    "Resolved by Spec-13 (bulletproof)" : 42
    "Resolved by Spec-14 (hardening v2)" : 20
```

### Spec-15 Parallel Execution Architecture

```mermaid
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

    style Shared fill:#228B22,color:#fff
    style PerLoop fill:#4169E1,color:#fff
```

### Structured Logging Flow (Spec-15)

```mermaid
flowchart LR
    subgraph Loops["Concurrent Agentic Loops"]
        L1["loop-001"]
        L2["loop-002"]
        L3["loop-003"]
        L4["loop-004"]
    end

    SL["StructuredLogger\n(thread-safe)"]

    subgraph Output["Dual Output Streams"]
        File["build.log\nJSON Lines\n(machine-readable)"]
        Term["Terminal\n[loop-id] formatted\n(human-readable)"]
    end

    L1 & L2 & L3 & L4 --> SL
    SL --> File
    SL --> Term
```

### Thread Safety Model (Spec-15)

```mermaid
flowchart TB
    subgraph Global["Global Resources (Lock-Protected)"]
        direction LR
        S1["Sandbox\nFile count: global 200 limit\nLock: full validate-write cycle"]
        S2["AuditLogger\nLock: per file write\naudit.log + security.log"]
        S3["CacheManager\nLock: load-modify-flush\ncache.json + state.json"]
        S4["StructuredLogger\nLock: per JSON line write\nbuild.log"]
    end

    subgraph Stateless["Stateless (No Lock Needed)"]
        direction LR
        S5["LLMClient\nImmutable config after init\nurllib creates new conn per call"]
    end

    subgraph Isolated["Per-Loop Instances (No Sharing)"]
        direction LR
        S6["ToolRegistry\nOwn tool schema + dispatch"]
        S7["Message History\nOwn list per loop"]
        S8["Iteration Counter\nOwn int per loop"]
    end

    style Global fill:#DAA520,color:#000
    style Stateless fill:#228B22,color:#fff
    style Isolated fill:#4169E1,color:#fff
```

### Spec-15 Throughput Scaling Projection

```mermaid
xychart-beta
    title "Estimated Tokens Per Second by Parallelism Level"
    x-axis ["1 loop", "2 loops", "4 loops", "8 loops"]
    y-axis "Tokens/Second (SambaNova via HF Router)" 0 --> 1800
    bar [125, 250, 500, 1000]
```

### Spec-16 CI Quality Gate Pipeline

```mermaid
flowchart LR
    A[Push / PR] --> B[Lint\nruff check]
    B --> C[Format\nruff format]
    C --> D[Tests\npytest]
    D --> E[Coverage\n90% minimum]
    E --> F[Security\nbandit]
    F --> G[Audit\npip-audit]
    G --> H{All Pass?}
    H -->|Yes| I[Merge Ready]
    H -->|No| J[Block Merge]

    style I fill:#228B22,color:#fff
    style J fill:#DC143C,color:#fff
```

### Spec-16 Security Defense Layers

```mermaid
flowchart TB
    subgraph L1["Layer 1: Input Validation"]
        A1["Command denylist\n39 blocked commands"]
        A2["Shell metacharacter filter\n12 blocked chars"]
        A3["Path traversal defense\niterative decode + sandbox"]
    end

    subgraph L2["Layer 2: Execution Safety"]
        B1["shell=False enforcement"]
        B2["Process group timeout"]
        B3["Prompt sanitization"]
    end

    subgraph L3["Layer 3: Output Protection"]
        C1["File extension allowlist"]
        C2["File count/size limits"]
        C3["Atomic writes + symlink check"]
    end

    subgraph L4["Layer 4: Audit and Detection"]
        D1["Security event logging"]
        D2["Credential sanitization"]
        D3["Secret pattern scanning"]
    end

    L1 --> L2 --> L3 --> L4

    style L1 fill:#DAA520,color:#000
    style L2 fill:#4169E1,color:#fff
    style L3 fill:#228B22,color:#fff
    style L4 fill:#8B008B,color:#fff
```

### Spec-16 Module Test Coverage Map

```mermaid
block-beta
    columns 5
    sandbox["sandbox.py\n50+ tests"]:1
    verifier["verifier.py\n60+ tests"]:1
    executor["executor.py\n45+ tests"]:1
    cmd_runner["command_runner\n30+ tests"]:1
    parser["parser.py\n31 tests"]:1
    context_mgr["context_mgr\n35+ tests"]:1
    fs_tools["fs_tools.py\n20+ tests"]:1
    security["security_audit\n35+ tests"]:1
    llm_client["llm_client\n17 tests"]:1
    cache["cache_engine\n16 tests"]:1
    cli["cli.py\nNEW"]:1
    agent_runner["agent_runner\nNEW"]:1
    planner["planner.py\nNEW"]:1
    config["config.py\nNEW"]:1
    budget["budget_guard\nNEW"]:1

    style sandbox fill:#228B22,color:#fff
    style verifier fill:#228B22,color:#fff
    style executor fill:#228B22,color:#fff
    style cmd_runner fill:#228B22,color:#fff
    style parser fill:#228B22,color:#fff
    style context_mgr fill:#228B22,color:#fff
    style fs_tools fill:#228B22,color:#fff
    style security fill:#228B22,color:#fff
    style llm_client fill:#228B22,color:#fff
    style cache fill:#228B22,color:#fff
    style cli fill:#4169E1,color:#fff
    style agent_runner fill:#4169E1,color:#fff
    style planner fill:#4169E1,color:#fff
    style config fill:#4169E1,color:#fff
    style budget fill:#4169E1,color:#fff
```

Green = existing coverage, Blue = new in spec-16

### Spec-17 Security Finding Resolution Flow

```mermaid
flowchart TB
    subgraph P1["P1 Critical (6 Findings)"]
        P14["P1-4: File count race"]
        P15["P1-5: Overwrite count bug"]
        P16["P1-6: Symlink TOCTOU"]
        P18["P1-8: Silent exception"]
        P19["P1-9: JSON deser DoS"]
        P111["P1-11: Prompt injection"]
    end

    subgraph P2["P2 Important (11 Findings)"]
        P25["P2-5: Dir listing DoS"]
        P26["P2-6: mkdir race"]
        P27["P2-7: Silent chmod"]
        P28["P2-8: Verifier injection"]
        P29["P2-9: Secret detection gaps"]
        P210["P2-10: Timeout overrun"]
        P211["P2-11: Regex backtrack"]
        P212["P2-12: Log file perms"]
        P213["P2-13: Incomplete redaction"]
        P2N1["P2-NEW-1: Git push timeout"]
        P2N2["P2-NEW-2: Verifier proc group"]
    end

    subgraph Phases["Implementation Phases"]
        Ph1["Phase 1: cli.py"]
        Ph2["Phase 2: sandbox count"]
        Ph3["Phase 3: sandbox symlink"]
        Ph4["Phase 4: JSON limits"]
        Ph5["Phase 5: prompt sanitize"]
        Ph6["Phase 6: dir limits"]
        Ph7["Phase 7: race fixes"]
        Ph8["Phase 8: verifier + git"]
        Ph9["Phase 9: credentials"]
        Ph10["Phase 10: regex fix"]
        Ph11["Phase 11: timeout fix"]
    end

    P18 --> Ph1
    P14 --> Ph2
    P15 --> Ph2
    P16 --> Ph3
    P19 --> Ph4
    P111 --> Ph5
    P25 --> Ph6
    P26 --> Ph7
    P27 --> Ph7
    P212 --> Ph7
    P28 --> Ph8
    P2N1 --> Ph8
    P2N2 --> Ph8
    P29 --> Ph9
    P213 --> Ph9
    P211 --> Ph10
    P210 --> Ph11

    Ph1 & Ph2 & Ph3 & Ph4 & Ph5 & Ph6 & Ph7 & Ph8 & Ph9 & Ph10 & Ph11 --> ZeroFindings["Zero Open Findings"]

    style P1 fill:#DC143C,color:#fff
    style P2 fill:#DAA520,color:#000
    style ZeroFindings fill:#228B22,color:#fff
```

### Spec-17 Atomic File Write Sequence (Post-Fix)

```mermaid
sequenceDiagram
    participant Thread as Worker Thread
    participant Lock as Sandbox Lock
    participant Set as Written Paths Set
    participant Counter as File Counter
    participant FS as Filesystem
    participant Check as Post-Write Check

    Thread->>Lock: acquire()
    Lock-->>Thread: granted

    Thread->>Set: path in _written_paths?
    alt New file
        Set-->>Thread: No (new file)
        Thread->>Counter: count < max_files?
        alt Under limit
            Counter-->>Thread: Yes
            Counter->>Counter: increment
            Set->>Set: add(path)
            Thread->>FS: tempfile.write(content)
            Thread->>FS: os.replace(temp, target)
            alt Write fails
                FS-->>Thread: OSError
                Counter->>Counter: decrement
                Set->>Set: remove(path)
                Thread->>Lock: release()
                Thread-->>Thread: raise FileWriteError
            else Write succeeds
                FS-->>Thread: OK
                Thread->>Check: os.lstat(target)
                alt Symlink detected
                    Check-->>Thread: is_symlink=True
                    Thread->>FS: os.unlink(target)
                    Counter->>Counter: decrement
                    Set->>Set: remove(path)
                    Thread->>Lock: release()
                    Thread-->>Thread: raise SandboxViolationError
                else Normal file
                    Check-->>Thread: is_symlink=False
                    Thread->>Lock: release()
                    Thread-->>Thread: return success
                end
            end
        else Over limit
            Counter-->>Thread: No (at max)
            Thread->>Lock: release()
            Thread-->>Thread: raise FileCountLimitError
        end
    else Existing file (overwrite)
        Set-->>Thread: Yes (overwrite)
        Thread->>FS: tempfile.write(content)
        Thread->>FS: os.replace(temp, target)
        Thread->>Check: os.lstat(target)
        Check-->>Thread: is_symlink=False
        Thread->>Lock: release()
        Thread-->>Thread: return success
    end
```

### Spec-17 Credential Redaction Coverage

```mermaid
flowchart LR
    subgraph Existing["Existing Patterns (Pre-Spec-17)"]
        E1["OpenAI (sk-)"]
        E2["GitHub (ghp_, gho_, ghu_, ghs_, ghr_)"]
        E3["AWS (AKIA, ABIA, ACCA, ASIA)"]
        E4["Anthropic (sk-ant-)"]
        E5["JWT (eyJ...)"]
        E6["Database URLs"]
        E7["Bearer tokens"]
        E8["Azure credentials"]
        E9["GCP service accounts"]
        E10["HuggingFace (hf_)"]
    end

    subgraph New["New Patterns (Spec-17 Phase 9)"]
        N1["SSH Private Keys"]
        N2["NPM Tokens (npm_)"]
        N3["Slack (xoxb-, xoxp-, xoxs-, xoxa-)"]
        N4["Stripe (sk_live_, pk_live_, rk_live_)"]
        N5["Twilio (AC, SK + 32 hex)"]
        N6["Webhook URLs with tokens"]
    end

    Existing --> Redactor["sanitize_message()"]
    New --> Redactor
    Redactor --> Safe["Safe Log Output\n(all credentials replaced\nwith REDACTED)"]

    style Existing fill:#228B22,color:#fff
    style New fill:#4169E1,color:#fff
    style Safe fill:#228B22,color:#fff
```

### Spec-18 LLM API Retry Flow

```mermaid
flowchart TB
    Call["LLM API Call"]
    Check{"Response\nStatus?"}
    Success["Return Result"]
    Transient{"Transient?\n429/500/502/503/504\nURLError/Timeout"}
    Fatal["Raise Immediately\n401/403/ValueError"]
    Retry{"Retries\nRemaining?"}
    Backoff["Sleep: base * 2^attempt + jitter"]
    Fail["Raise After Retries\nInclude retry count"]

    Call --> Check
    Check -->|200 OK| Success
    Check -->|Error| Transient
    Transient -->|Yes| Retry
    Transient -->|No| Fatal
    Retry -->|Yes| Backoff
    Retry -->|No| Fail
    Backoff --> Call

    style Success fill:#228B22,color:#fff
    style Fatal fill:#DC143C,color:#fff
    style Fail fill:#DC143C,color:#fff
    style Backoff fill:#DAA520,color:#000
```

### Spec-18 Startup Validation Flow

```mermaid
flowchart TB
    Start["codelicious /path/to/repo"]
    Git{"git on PATH?"}
    GitErr["Error: git not found\nexit 1"]
    Engine{"Engine\nSelection?"}
    Claude{"claude on PATH?"}
    ClaudeErr["Error: claude not found\nexit 1"]
    HF{"HF_TOKEN set?"}
    HFErr["Error: HF_TOKEN required\nexit 1"]
    HTTPS{"Endpoint HTTPS?"}
    HTTPSErr["Error: HTTPS required\nexit 1"]
    Ready["Dependencies Validated\nStart Build"]

    Start --> Git
    Git -->|No| GitErr
    Git -->|Yes| Engine
    Engine -->|claude| Claude
    Engine -->|huggingface| HF
    Engine -->|auto| Claude
    Claude -->|Yes| Ready
    Claude -->|No, explicit| ClaudeErr
    Claude -->|No, auto| HF
    HF -->|Yes| HTTPS
    HF -->|No| HFErr
    HTTPS -->|Yes| Ready
    HTTPS -->|No| HTTPSErr

    style Ready fill:#228B22,color:#fff
    style GitErr fill:#DC143C,color:#fff
    style ClaudeErr fill:#DC143C,color:#fff
    style HFErr fill:#DC143C,color:#fff
    style HTTPSErr fill:#DC143C,color:#fff
```

### Spec-18 Graceful Shutdown Sequence

```mermaid
sequenceDiagram
    participant OS as Orchestrator (Docker/K8s)
    participant CLI as cli.py (main)
    participant Handler as SIGTERM Handler
    participant Progress as ProgressReporter
    participant RAG as RagEngine
    participant Exit as atexit hooks

    OS->>CLI: SIGTERM (signal 15)
    CLI->>Handler: _handle_sigterm()
    Handler->>Handler: Set _shutdown_requested = True
    Handler->>Handler: Log WARNING "Received SIGTERM"
    Handler->>CLI: Raise SystemExit(143)
    CLI->>Exit: atexit hooks triggered
    Exit->>Progress: close()
    Progress->>Progress: Flush progress file
    Progress->>Progress: Set _closed = True
    Exit->>RAG: close()
    RAG->>RAG: Flush SQLite WAL
    RAG->>RAG: Close connection
    RAG->>RAG: Set _closed = True
    Exit->>OS: Exit code 143
```

### Spec-18 Cumulative Build Timeout Enforcement

```mermaid
flowchart LR
    Start["Build Start\ndeadline = now + max_build_time"]
    P1["Phase: Scaffold"]
    P2["Phase: Build"]
    P3["Phase: Verify (1)"]
    P4["Phase: Verify (2)"]
    P5["Phase: Verify (3)"]
    P6["Phase: Reflect"]
    P7["Phase: Commit"]
    Check1{"now >\ndeadline?"}
    Check2{"now >\ndeadline?"}
    Check3{"now >\ndeadline?"}
    Timeout["BuildTimeoutError\nReport elapsed time\nand current phase"]
    Done["Build Complete"]

    Start --> P1 --> P2 --> Check1
    Check1 -->|No| P3 --> Check2
    Check1 -->|Yes| Timeout
    Check2 -->|No| P4 --> Check3
    Check2 -->|Yes| Timeout
    Check3 -->|No| P5 --> P6 --> P7 --> Done
    Check3 -->|Yes| Timeout

    style Done fill:#228B22,color:#fff
    style Timeout fill:#DC143C,color:#fff
```

### Spec-18 Plan Validation Pipeline

```mermaid
flowchart TB
    LLM["LLM Generates Plan JSON"]
    Parse["json.loads()"]
    Schema["Schema Validation\n- Is dict?\n- Has 'tasks' list?\n- Each task has title, description?"]
    Cycle["Cycle Detection\n- Build adjacency graph\n- DFS with gray/black sets\n- Report cycle path"]
    Valid["Valid Plan\nProceed to execution"]
    Invalid["InvalidPlanError\nSpecific message\n(missing key, cycle path)"]

    LLM --> Parse --> Schema
    Schema -->|Pass| Cycle
    Schema -->|Fail| Invalid
    Cycle -->|No cycles| Valid
    Cycle -->|Cycle found| Invalid

    style Valid fill:#228B22,color:#fff
    style Invalid fill:#DC143C,color:#fff
```

### Spec-19 Code Quality Improvement Areas

```mermaid
flowchart TB
    subgraph T1["Tier 1: Foundation (Sequential)"]
        P1["Phase 1\nConfig Constants\nEnv Var Overrides"]
        P2["Phase 2\nError Message\nQuality"]
        P3["Phase 3\nResource Cleanup\nFile Handle Leaks"]
        P4["Phase 4\nEdge Case\nClosure"]
        P1 --> P2 --> P3 --> P4
    end

    subgraph T2["Tier 2: Docs and Testing (Parallel)"]
        P5["Phase 5\nREADME-CLI\nAccuracy"]
        P6["Phase 6\nTest Fixture\nExpansion"]
        P7["Phase 7\nDependency\nPinning"]
        P8["Phase 8\nCI Workflow\nHardening"]
    end

    subgraph T3["Tier 3: Code Quality (Parallel)"]
        P9["Phase 9\nShared Utility\nExtraction"]
        P10["Phase 10\nType Safety\nHints"]
        P11["Phase 11\nPrompt Template\nSafety"]
        P12["Phase 12\nDry-Run\nPurity"]
    end

    subgraph T4["Tier 4: Hardening (Sequential)"]
        P13["Phase 13\nConfig Validation\nat Startup"]
        P14["Phase 14\nLogger Permission\nFixes"]
        P15["Phase 15\nError Handling\nConsistency"]
        P13 --> P14 --> P15
    end

    T1 --> T2
    T1 --> T3
    T2 --> T4
    T3 --> T4
    T4 --> Done["47 Gaps Closed\n650+ Tests\nZero Quality Findings"]

    style T1 fill:#4169E1,color:#fff
    style T2 fill:#228B22,color:#fff
    style T3 fill:#DAA520,color:#000
    style T4 fill:#8B008B,color:#fff
    style Done fill:#228B22,color:#fff
```

### Spec-19 Finding Distribution by Category

```mermaid
pie title Code Quality Findings by Category (47 Total)
    "Configuration Hardening" : 4
    "Error Messages" : 5
    "Resource Cleanup" : 3
    "Edge Cases" : 4
    "Documentation Drift" : 6
    "Test Fixtures" : 4
    "Dependency Pinning" : 4
    "CI Workflow" : 5
    "Code Duplication" : 3
    "Type Safety" : 5
    "Template Safety" : 2
    "Dry-Run Purity" : 3
    "Config Validation" : 3
    "Logger Fixes" : 2
    "Error Handling" : 3
```

### Spec-19 Configuration Override Flow

```mermaid
flowchart LR
    Env["Environment Variable\nCODELICIOUS_TIMEOUT_TEST=120"]
    Parse["_env.parse_env_int()\nValidate: > 0\nLog: DEBUG override active"]
    Default["Hardcoded Default\n_TIMEOUT_TEST = 60"]
    Module["verifier.py\nUses effective value"]

    Env -->|Set and valid| Parse --> Module
    Env -->|Not set| Default --> Module
    Env -->|Invalid value| Parse
    Parse -->|"WARNING: invalid, using default"| Default

    style Env fill:#4169E1,color:#fff
    style Default fill:#DAA520,color:#000
    style Module fill:#228B22,color:#fff
```

### Spec-19 Dry-Run Fix: Before and After

```mermaid
sequenceDiagram
    participant User as User
    participant CLI as cli.py
    participant SB as Sandbox (dry_run=True)
    participant FS as Filesystem

    Note over User,FS: BEFORE (Bug): mkdir runs even in dry-run
    User->>CLI: codelicious /repo --dry-run
    CLI->>SB: write_file("src/app.py", content)
    SB->>FS: parent.mkdir(parents=True)
    Note right of FS: Directory created (BUG)
    SB->>SB: if self.dry_run: return
    SB-->>CLI: (returned early but dir exists)

    Note over User,FS: AFTER (Fixed): no filesystem changes
    User->>CLI: codelicious /repo --dry-run
    CLI->>SB: write_file("src/app.py", content)
    SB->>SB: if self.dry_run: log and return
    Note right of SB: No mkdir, no temp file, no writes
    SB-->>CLI: (returned early, FS untouched)
```

### Spec-19 Logic Breakdown Progression

```mermaid
xychart-beta
    title "Codebase Composition by Spec Phase (Estimated Lines)"
    x-axis ["Post-16", "Post-17", "Post-18", "Post-19"]
    y-axis "Source Lines" 0 --> 10000
    bar [3800, 3900, 4100, 4200]
    bar [4050, 3600, 3600, 3600]
    bar [1350, 1300, 1500, 1600]
```

### Spec-20 Security Finding Resolution Flow

```mermaid
flowchart TB
    subgraph P1["S20-P1 Critical (5 Findings)"]
        S1["S20-P1-1\nSSRF via\nLLM endpoint"]
        S2["S20-P1-2\ngit add .\nstages secrets"]
        S3["S20-P1-3\n--dangerously-\nskip-permissions"]
        S4["S20-P1-4\nPrompt injection\nvia spec_filter"]
        S5["S20-P1-5\nSQLite DB\nworld-readable"]
    end

    subgraph P2["S20-P2 Important (11 Findings)"]
        S6["S20-P2-1: Newline filename"]
        S7["S20-P2-2: os.walk escape"]
        S8["S20-P2-3: Denylist bypass"]
        S9["S20-P2-4: No backoff"]
        S10["S20-P2-5: BudgetGuard race"]
        S11["S20-P2-6: retry_after ignored"]
        S12["S20-P2-7: Duplicate check"]
        S13["S20-P2-8: String tracker"]
        S14["S20-P2-9: Symlink rmtree"]
        S15["S20-P2-10: atomic_write"]
        S16["S20-P2-11: Audit log race"]
    end

    subgraph Phases["Implementation Phases"]
        Ph1["Phase 1: SSRF"]
        Ph2["Phase 2: Git staging"]
        Ph3["Phase 3: CLI perms"]
        Ph4["Phase 4: Prompt sanitize"]
        Ph5["Phase 5: SQLite perms"]
        Ph6["Phase 6-12: P2 fixes"]
        Ph7["Phase 13-18: P3 fixes"]
    end

    S1 --> Ph1
    S2 --> Ph2
    S3 --> Ph3
    S4 --> Ph4
    S5 --> Ph5
    S6 & S7 & S8 & S9 & S10 & S11 & S12 & S13 & S14 & S15 & S16 --> Ph6
    Ph1 & Ph2 & Ph3 & Ph4 & Ph5 & Ph6 & Ph7 --> Zero["Zero S20 Findings\n720+ Tests"]

    style P1 fill:#DC143C,color:#fff
    style P2 fill:#DAA520,color:#000
    style Zero fill:#228B22,color:#fff
```

### Spec-20 Git Staging Safety (Before and After)

```mermaid
sequenceDiagram
    participant Dev as Developer
    participant GO as GitOrchestrator
    participant Git as git CLI
    participant Check as Sensitive File Check

    Note over Dev,Check: BEFORE (Unsafe): git add . with warning-only guard
    Dev->>GO: commit_verified_changes(files=None)
    GO->>Git: git add .
    Git-->>GO: staged everything (including .env)
    GO->>Check: _check_staged_files()
    Check-->>GO: WARNING: .env detected
    Note right of GO: Warning logged but commit proceeds
    GO->>Git: git commit -m "..."
    Git-->>GO: committed (with secrets)

    Note over Dev,Check: AFTER (Safe): explicit staging with hard abort
    Dev->>GO: commit_verified_changes(files=None)
    GO->>Git: git add -u
    Git-->>GO: staged tracked files only
    GO->>Check: _check_staged_files()
    Check-->>GO: ERROR: .env detected
    Note right of GO: GitOperationError raised, commit aborted
    GO-->>Dev: Error: Refusing to commit sensitive file
```

### Spec-20 LLM Endpoint Validation Pipeline

```mermaid
flowchart TB
    Input["LLM_ENDPOINT env var"]
    Parse["urllib.parse.urlparse()"]
    Scheme{"Scheme\n== https?"}
    SchemeErr["ConfigurationError:\nOnly HTTPS permitted"]
    DNS["socket.getaddrinfo()\nResolve hostname"]
    DNSErr["ConfigurationError:\nCannot resolve hostname"]
    IP["ipaddress.ip_address()"]
    Private{"is_private?\nis_loopback?\nis_link_local?"}
    PrivateErr["ConfigurationError:\nPrivate/loopback IP rejected"]
    Accept["Validated endpoint URL\nStored in LLMClient"]

    Input --> Parse --> Scheme
    Scheme -->|No| SchemeErr
    Scheme -->|Yes| DNS
    DNS -->|Fail| DNSErr
    DNS -->|OK| IP --> Private
    Private -->|Yes| PrivateErr
    Private -->|No| Accept

    style Accept fill:#228B22,color:#fff
    style SchemeErr fill:#DC143C,color:#fff
    style DNSErr fill:#DC143C,color:#fff
    style PrivateErr fill:#DC143C,color:#fff
```

### Spec-20 Thread Safety Model (Updated)

```mermaid
flowchart TB
    subgraph Global["Global Resources (Lock-Protected)"]
        direction LR
        S1["Sandbox\nFile count: global 200 limit\nLock: full validate-write cycle"]
        S2["AuditLogger\nLock: per file write\naudit.log + security.log"]
        S3["CacheManager\nLock: load-modify-flush\ncache.json + state.json"]
        S4["StructuredLogger\nLock: per JSON line write\nbuild.log"]
        S5["BudgetGuard\nLock: record() + check()\ncalls + cost counters"]
    end

    subgraph Stateless["Stateless (No Lock Needed)"]
        direction LR
        S6["LLMClient\nImmutable config after init\nEndpoint validated at construction"]
    end

    subgraph Isolated["Per-Loop Instances (No Sharing)"]
        direction LR
        S7["ToolRegistry\nOwn tool schema + dispatch"]
        S8["Message History\nOwn list per loop"]
        S9["Iteration Counter\nOwn int per loop"]
    end

    style Global fill:#DAA520,color:#000
    style Stateless fill:#228B22,color:#fff
    style Isolated fill:#4169E1,color:#fff
```

### Spec-20 Credential Redaction Pipeline (Updated)

```mermaid
flowchart LR
    subgraph Stage1["Stage 1: Individual Sanitization"]
        Msg["record.msg"]
        Args["record.args"]
        SanMsg["sanitize_message(msg)"]
        SanArgs["sanitize_message(str(arg))"]
        Msg --> SanMsg
        Args --> SanArgs
    end

    subgraph Stage2["Stage 2: Formatted Message Sanitization"]
        Format["record.getMessage()\nmsg % args"]
        SanFinal["sanitize_message(formatted)"]
        Format --> SanFinal
    end

    subgraph Output["Safe Output"]
        Final["record.msg = sanitized\nrecord.args = None\nAll secrets REDACTED"]
    end

    Stage1 --> Stage2 --> Output

    style Stage1 fill:#4169E1,color:#fff
    style Stage2 fill:#DAA520,color:#000
    style Output fill:#228B22,color:#fff
```

### Spec-20 Codebase Composition Progression

```mermaid
xychart-beta
    title "Codebase Composition by Spec Phase (Estimated Lines)"
    x-axis ["Post-16", "Post-17", "Post-18", "Post-19", "Post-20"]
    y-axis "Source Lines" 0 --> 10000
    bar [3800, 3900, 4100, 4200, 4500]
    bar [4050, 3600, 3600, 3600, 3600]
    bar [1350, 1300, 1500, 1600, 1500]
```

---

## Zero Dependencies

The core engine uses only Python standard library (`urllib`, `json`, `sqlite3`, `subprocess`). No pip packages required at runtime.

## License

MIT
