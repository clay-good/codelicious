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

---

## Zero Dependencies

The core engine uses only Python standard library (`urllib`, `json`, `sqlite3`, `subprocess`). No pip packages required at runtime.

## License

MIT
