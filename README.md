# Codelicious

**Outcome as a Service.** Write specs. Run `codelicious /path/to/repo`. Get a green, review-ready Pull Request.

Codelicious is a headless, autonomous developer CLI. It reads your markdown specifications, builds the code, runs tests, and delivers a working PR — no human in the loop.

## How It Works

```
You write specs (docs/specs/*.md)
        |
codelicious /path/to/repo
        |
   +-----------+
   |  Engine   |  Claude Code CLI (primary)
   |  Select   |  HuggingFace API (fallback)
   +-----------+
        |
  Scaffold CLAUDE.md + .claude/
        |
  BUILD: implement specs autonomously
        |
  VERIFY: syntax + tests + security scan
        |
  REFLECT: quality review (optional)
        |
  GIT: commit + push + create PR
        |
  Done. Review-ready PR on GitHub.
```

## Quick Start

```bash
# Clone and install
git clone https://github.com/clay-good/codelicious.git
cd codelicious
pip install -e .

# Run with Claude Code (default if claude CLI is installed)
codelicious /path/to/your/repo

# Or force HuggingFace engine
export HF_TOKEN=hf_your_token_here
codelicious /path/to/your/repo --engine huggingface
```

## Dual Engine Architecture

Codelicious auto-detects the best available engine:

| Engine | Backend | How It Works |
|--------|---------|--------------|
| **Claude Code CLI** | `claude` binary | Spawns Claude Code as subprocess. Claude handles its own tools (Read, Write, Bash, etc). 6-phase lifecycle with scaffolding, verification, and reflection. |
| **HuggingFace** | DeepSeek-V3 + Qwen3-235B | HTTP API with custom tool dispatch. DeepSeek plans, Qwen codes. 50-iteration agentic loop. |

Auto-detection priority: Claude Code CLI > HuggingFace > error with setup instructions.

## CLI Reference

```
codelicious <repo_path> [options]

Options:
  --engine {auto,claude,huggingface}  Build engine (default: auto)
  --model MODEL                       Model override (e.g. claude-sonnet-4-6)
  --agent-timeout SECONDS             Claude engine timeout (default: 1800)
  --resume SESSION_ID                  Resume a previous Claude session
  --verify-passes N                    Verification passes (default: 3)
  --no-reflect                         Skip quality review phase
  --push-pr                            Push and create/update PR
  --max-iterations N                   HF engine max iterations (default: 50)
  --dry-run                            Log phases without executing
  --spec PATH                          Target a specific spec file
```

## Claude Code Engine Phases

When using the Claude Code engine, codelicious runs a 6-phase lifecycle:

1. **SCAFFOLD** — writes `CLAUDE.md` and `.claude/` directory (agents, skills, rules, settings) into the target project
2. **BUILD** — spawns Claude Code CLI with an autonomous build prompt. Claude reads specs, implements code, runs tests, commits.
3. **VERIFY** — runs deterministic verification: Python syntax check, test suite, security pattern scan
4. **REFLECT** — optional read-only quality review by Claude (can skip with `--no-reflect`)
5. **GIT** — commits all changes to the feature branch
6. **PR** — pushes and creates/updates a draft PR (requires `--push-pr`)

## Security Model

Codelicious enforces defense-in-depth security, all hardcoded in Python (not configurable by the LLM):

- **Command denylist** — 39 dangerous commands blocked (`rm`, `sudo`, `dd`, `kill`, `curl`, etc.)
- **Shell injection prevention** — `shell=False` + metacharacter blocking (`|`, `&`, `;`, `$`, etc.)
- **File write protection** — LLM cannot modify its own tool source code or security config
- **File extension allowlist** — only safe file types can be written
- **Path traversal defense** — null byte detection, `..` rejection, symlink resolution
- **Security scanning** — pre-commit scan for `eval()`, `exec()`, `shell=True`, hardcoded secrets

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
  errors.py                 # 48 typed exceptions
  config.py                 # Environment + file config loading
```

## Runtime Files

Codelicious creates a `.codelicious/` directory in the target repo:

| File | Purpose |
|------|---------|
| `state.json` | Task progress and memory |
| `cache.json` | File hash index |
| `db.sqlite3` | Vector embeddings for RAG |
| `audit.log` | Full agent interaction log |
| `security.log` | Security events only |
| `STATE.md` | Human-readable build status |
| `BUILD_COMPLETE` | Sentinel file (contains "DONE" when finished) |

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

## Zero Dependencies

The core engine uses only Python standard library (`urllib`, `json`, `sqlite3`, `subprocess`). No pip packages required for runtime.

## Architecture Diagrams

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

### Security Architecture (Defense in Depth)

```mermaid
flowchart TB
    LLM["LLM Agent\n(Claude or DeepSeek/Qwen)"]

    subgraph Security_Layers["Defense-in-Depth Layers"]
        direction TB
        L1["Layer 1: Command Denylist\n39 dangerous commands + 20 interpreters\n(security_constants.py)"]
        L2["Layer 2: Metacharacter Filter\n11 shell injection chars blocked\n(security_constants.py)"]
        L3["Layer 3: shell=False\nNo shell interpretation\n(command_runner.py)"]
        L4["Layer 4: Extension Allowlist\n32 safe file types only\n(sandbox.py)"]
        L5["Layer 5: Path Validation\nNull bytes, .., symlinks, TOCTOU\n(sandbox.py)"]
        L6["Layer 6: Protected Paths\nSecurity-critical files immutable\n(sandbox.py)"]
        L7["Layer 7: Size/Count Limits\n1MB per file, 200 files per session\n(sandbox.py)"]
        L8["Layer 8: Security Scanner\neval/exec/shell=True/secrets detection\n(verifier.py)"]
        L9["Layer 9: Audit Logging\nAll operations logged to audit.log + security.log\n(audit_logger.py)"]
    end

    LLM --> L1 --> L2 --> L3
    L3 --> L4 --> L5 --> L6 --> L7
    L7 --> L8 --> L9
    L9 --> FS["Filesystem\n(safe writes only)"]
```

### Data Flow and State Management

```mermaid
flowchart LR
    subgraph Input["Input"]
        Specs["docs/specs/*.md"]
        Repo["Target Repository"]
    end

    subgraph Engine["Build Engine"]
        Planner["Planner\n(spec parsing)"]
        Builder["Builder\n(code generation)"]
        Verifier["Verifier\n(deterministic checks)"]
    end

    subgraph State[".codelicious/ Runtime State"]
        Cache["cache.json\n(file hashes)"]
        StateJSON["state.json\n(memory ledger)"]
        DB["db.sqlite3\n(RAG vectors)"]
        Audit["audit.log"]
        SecLog["security.log"]
        StateMD["STATE.md"]
    end

    subgraph Output["Output"]
        Branch["Feature Branch"]
        PR["Pull Request"]
        Logs["Build Logs"]
    end

    Specs --> Planner
    Repo --> Planner
    Planner --> Builder
    Builder --> Verifier
    Builder --> Cache
    Builder --> StateJSON
    Builder --> DB
    Verifier --> Audit
    Verifier --> SecLog
    Verifier --> StateMD
    Verifier --> Branch
    Branch --> PR
    Audit --> Logs
```

### Module Dependency Graph

```mermaid
graph TD
    CLI["cli.py"]
    EI["engines/__init__.py\nselect_engine()"]
    CE["engines/claude_engine.py"]
    HE["engines/huggingface_engine.py"]
    AR["agent_runner.py"]
    SC["scaffolder.py"]
    PR["prompts.py"]
    VE["verifier.py"]
    SB["sandbox.py"]
    CR["tools/command_runner.py"]
    FS["tools/fs_tools.py"]
    TR["tools/registry.py"]
    AL["tools/audit_logger.py"]
    GO["git/git_orchestrator.py"]
    CM["context/cache_engine.py"]
    RE["context/rag_engine.py"]
    LC["loop_controller.py"]
    LM["llm_client.py"]
    LG["logger.py"]
    ER["errors.py"]
    SC2["security_constants.py"]
    CF["config.py"]

    CLI --> EI
    EI --> CE
    EI --> HE
    CE --> AR
    CE --> SC
    CE --> PR
    CE --> VE
    CE --> GO
    HE --> LC
    HE --> LM
    LC --> TR
    TR --> FS
    TR --> CR
    TR --> AL
    FS --> SB
    CR --> SC2
    VE --> SC2
    SB --> ER
    GO --> LG
    LM --> LG
    CE --> CM
    HE --> CM
    TR --> RE
    CLI --> LG
    CLI --> CF
```

### Threat Model: Where Security Controls Apply

```mermaid
flowchart TB
    Spec["Spec File\n(docs/specs/*.md)"]
    EnvVar["Environment Variables\n(API keys, endpoints)"]
    LLMResp["LLM Response\n(code, tool calls)"]
    GitState["Git Working Tree\n(pre-existing files)"]

    subgraph Validation["Input Validation Layer"]
        V1["Spec Parser\nSize limit, UTF-8, null byte check"]
        V2["Config Loader\nHTTPS enforcement, truthy parsing"]
        V3["Intent Classifier\nInjection pattern detection"]
    end

    subgraph Execution["Execution Layer"]
        E1["Command Runner\nDenylist + metachar filter + shell=False"]
        E2["File Writer\nSandbox: extension allowlist, path validation,\nsize/count limits, symlink detection"]
        E3["Executor\nResponse parsing, path normalization"]
    end

    subgraph Output["Output Validation Layer"]
        O1["Security Scanner\nPython + JS/TS pattern detection"]
        O2["Git Staging\nExplicit file list, sensitive pattern scan"]
        O3["Commit Sanitization\nLength limit, null byte strip, UTF-8 validation"]
    end

    subgraph Audit["Audit Layer"]
        A1["Audit Logger\n0o600 permissions, structured events"]
        A2["Security Logger\nDedicated security.log"]
        A3["SanitizingFilter\nSecret redaction in all log output"]
    end

    Spec --> V1
    EnvVar --> V2
    LLMResp --> V3
    V1 --> E3
    V2 --> E1
    V3 --> E1
    V3 --> E2
    E3 --> E2
    E1 --> O1
    E2 --> O1
    O1 --> O2
    O2 --> O3
    E1 --> A1
    E2 --> A1
    O1 --> A2
    A1 --> A3
    A2 --> A3
    GitState --> O2
```

### Data Flow: API Key Lifecycle

```mermaid
flowchart LR
    Source["API Key Source\n(env var or config)"]
    Config["Config Loader\nValidates HTTPS endpoint"]
    Client["LLM Client\nAuthorization: Bearer header"]
    TLS["TLS Encrypted Channel\n(HTTPS enforced)"]
    Provider["LLM Provider\n(HuggingFace/Anthropic)"]
    Logger["Logger\nSanitizingFilter redacts keys"]
    AuditLog["audit.log\n0o600 permissions"]

    Source --> Config
    Config --> Client
    Client --> TLS
    TLS --> Provider
    Client -.->|"Error path"| Logger
    Logger --> AuditLog

    style TLS fill:#228B22,color:#fff
    style Logger fill:#DAA520,color:#000
```

## License

MIT
