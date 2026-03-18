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
# Clone and install (includes dev tools: pytest, ruff, bandit, pip-audit)
git clone https://github.com/clay-good/codelicious.git
cd codelicious
pip install -e ".[dev]"
# Or minimal install without dev tools: pip install -e .

# Option 1: Claude Code CLI (requires claude CLI + API credits)
codelicious /path/to/your/repo

# Option 2: HuggingFace engine (free, no API costs)
export HF_TOKEN=hf_your_token_here  # Get one at https://huggingface.co/settings/tokens
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

## Dual Engine Architecture

Codelicious auto-detects the best available engine at startup:

| Engine | Backend | How It Works |
|--------|---------|--------------|
| **Claude Code CLI** | `claude` binary | Spawns Claude Code as subprocess. Claude handles its own tools (Read, Write, Bash, etc). 6-phase lifecycle with scaffolding, verification, and reflection. |
| **HuggingFace** | DeepSeek-V3 + Qwen3-235B | Free HTTP API via SambaNova. DeepSeek plans, Qwen codes. 50-iteration agentic loop. No API costs. |

Auto-detection priority: Claude Code CLI > HuggingFace > error with setup instructions.

> **Note:** Engine selection happens at startup, not mid-build. If you hit Claude token limits, re-run with `--engine huggingface` to use the free HuggingFace backend. The HuggingFace engine is a fully independent code path — not a degraded mode.

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

### Test Infrastructure

```mermaid
flowchart TB
    subgraph Fixtures["tests/fixtures/"]
        Specs["specs/\nvalid_simple.md\nvalid_multi_section.md\ninvalid_*.md\nmalicious_*.md"]
        LLMResp["llm_responses/\nvalid_*.json\ninvalid_*.json\nmalicious_*.json"]
        Repos["repos/factory.py\ncreate_minimal_repo()\ncreate_repo_with_specs()"]
        Mocks["mocks/\nllm_mock.py\ngit_mock.py\nsubprocess_mock.py"]
    end

    subgraph TestModules["Test Modules"]
        Unit["Unit Tests\ntest_sandbox.py\ntest_executor.py\ntest_parser.py\ntest_verifier.py"]
        Integration["Integration Tests\ntest_cli.py\ntest_engine_selection.py\ntest_git_orchestrator.py"]
        Security["Security Tests\ntest_security_audit.py\ntest_thread_safety.py"]
        Schema["Validation Tests\ntest_schema.py\ntest_config.py"]
    end

    subgraph Coverage["Coverage Enforcement"]
        PytestCov["pytest --cov\nfail_under = 80%"]
        Report["Coverage Report\nterm-missing output"]
    end

    Fixtures --> TestModules
    TestModules --> PytestCov
    PytestCov --> Report
```

### Error Recovery and Retry Flow

```mermaid
flowchart TB
    Operation["Operation\n(LLM call, git cmd, agent run)"]
    Classify{"Error\nType?"}
    Transient["Transient Error\n(rate limit, timeout, provider error)"]
    Permanent["Permanent Error\n(sandbox violation, parse error, config error)"]
    Retry{"Retry\nAttempt <= 3?"}
    Backoff["Exponential Backoff\ndelay = min(base * 2^n + jitter, 30s)"]
    Success["Operation Succeeded"]
    FailTransient["All Retries Exhausted\nExit Code 2"]
    FailPermanent["Permanent Failure\nExit Code 1"]

    Operation --> Classify
    Classify -->|"is_transient = True"| Transient
    Classify -->|"is_transient = False"| Permanent
    Transient --> Retry
    Retry -->|"Yes"| Backoff
    Backoff --> Operation
    Retry -->|"No"| FailTransient
    Permanent --> FailPermanent
    Operation -->|"No error"| Success
```

### Spec-11 Hardening Phase Dependencies

```mermaid
flowchart TB
    subgraph P1_Security["P1 Critical Security Fixes"]
        Ph1["Phase 1\nCLI Exception\nSwallowing"]
        Ph2["Phase 2\nCommand Split\nMismatch"]
        Ph3["Phase 3\nTOCTOU Race\nfs_tools"]
        Ph4["Phase 4\nSandbox Race\nConditions"]
        Ph5["Phase 5\nAPI Error\nSanitization"]
        Ph7["Phase 7\nPath Traversal\nTriple-Encode"]
        Ph8["Phase 8\nHTTPS Endpoint\nValidation"]
        Ph9["Phase 9\nGit Staging\nExplicit Files"]
    end

    subgraph P2_Reliability["P2 Reliability Fixes"]
        Ph6["Phase 6\nJSON Config\nValidation"]
        Ph11["Phase 11\nMetacharacter\nUnification"]
        Ph12["Phase 12\nLogging Format\nPercent-Style"]
        Ph13["Phase 13\nCase-Insensitive\nPath Bypass"]
        Ph14["Phase 14\nProcess Group\nTimeout"]
        Ph15["Phase 15\nDirectory Listing\nLimits"]
        Ph16["Phase 16\nRegex Backtrack\nFix"]
    end

    subgraph Test_Coverage["Test Coverage"]
        Ph10["Phase 10\nCache Flush\nImplementation"]
        Ph17["Phase 17\nHuggingFace Engine\nTests"]
        Ph18["Phase 18\nConfig Module\nTests"]
    end

    subgraph Final["Final Validation"]
        Ph19["Phase 19\nIntegration Tests\nand Sample Data"]
        Ph20["Phase 20\nDocs Alignment\nand Lint Gates"]
    end

    Ph2 --> Ph11
    Ph2 --> Ph14
    Ph11 --> Ph14
    Ph5 --> Ph8
    Ph3 --> Ph13
    Ph3 --> Ph15
    Ph5 --> Ph17
    Ph6 --> Ph17
    Ph8 --> Ph18

    Ph1 --> Ph19
    Ph2 --> Ph19
    Ph3 --> Ph19
    Ph4 --> Ph19
    Ph5 --> Ph19
    Ph6 --> Ph19
    Ph7 --> Ph19
    Ph8 --> Ph19
    Ph9 --> Ph19
    Ph10 --> Ph19
    Ph11 --> Ph19
    Ph12 --> Ph19
    Ph13 --> Ph19
    Ph14 --> Ph19
    Ph15 --> Ph19
    Ph16 --> Ph19
    Ph17 --> Ph19
    Ph18 --> Ph19
    Ph19 --> Ph20

    style P1_Security fill:#B22222,color:#fff
    style P2_Reliability fill:#DAA520,color:#000
    style Test_Coverage fill:#228B22,color:#fff
    style Final fill:#4169E1,color:#fff
```

### Codebase Logic Composition

```mermaid
pie title Code Composition by Logic Type (8,383 lines)
    "Deterministic Safety Harness (42%)" : 3521
    "Probabilistic LLM-Driven (45%)" : 3772
    "Shared Infrastructure (13%)" : 1090
```

### Spec-12 MVP Closure Phase Dependencies

```mermaid
flowchart TB
    subgraph Tier1["Tier 1: Critical Security (Phases 1-8)"]
        P1["Phase 1\nPrompt Injection\nBlocking Guard"]
        P2["Phase 2\nInterpreter\nDenylist Closure"]
        P3["Phase 3\nPermissions\nFlag Gating"]
        P4["Phase 4\nExplicit Git\nFile Staging"]
        P5["Phase 5\nAPI Key\nLog Masking"]
        P6["Phase 6\nPR Title\nSanitization"]
        P7["Phase 7\nReviewer String\nValidation"]
        P8["Phase 8\nRead Protection\nSecurity Files"]
    end

    subgraph Tier2["Tier 2: Reliability (Phases 9-14)"]
        P9["Phase 9\nflush_cache +\nAtomic Writes"]
        P10["Phase 10\nmax_iterations\nConfig Fix"]
        P11["Phase 11\nResponse Body\nSize Cap"]
        P12["Phase 12\nRAG Query\nResult Cap"]
        P13["Phase 13\nAudit Logger\nLevel Fix"]
        P14["Phase 14\nPR Function\nArg Fix"]
    end

    subgraph Tier3["Tier 3: Code Quality (Phases 15-18)"]
        P15["Phase 15\npyproject.toml\nDev Deps"]
        P16["Phase 16\nPercent-Style\nLogging"]
        P17["Phase 17\nDead Code\nRemoval"]
        P18["Phase 18\nFile Permission\nFix"]
    end

    subgraph Tier4["Tier 4: Test Coverage (Phases 19-22)"]
        P19["Phase 19\nregistry.py\nTests"]
        P20["Phase 20\nconfig.py\nTests"]
        P21["Phase 21\nbudget_guard.py\nTests"]
        P22["Phase 22\ncli.py + errors.py\nTests"]
    end

    subgraph Tier5["Tier 5: Final (Phases 23-25)"]
        P23["Phase 23\nLint + Format\nCleanup"]
        P24["Phase 24\nDocumentation\nAlignment"]
        P25["Phase 25\nFull Verification\n+ State Update"]
    end

    P1 & P2 & P3 & P8 --> Tier2
    P4 --> P6
    P4 --> P7
    P5 --> P14
    Tier2 --> Tier3
    Tier3 --> Tier4
    Tier4 --> Tier5

    style Tier1 fill:#B22222,color:#fff
    style Tier2 fill:#DAA520,color:#000
    style Tier3 fill:#4169E1,color:#fff
    style Tier4 fill:#228B22,color:#fff
    style Tier5 fill:#6A0DAD,color:#fff
```

### Test Coverage Gap Analysis

```mermaid
pie title Module Test Coverage (35 modules)
    "Tested (11 modules, 31%)" : 11
    "Untested (19 modules, 54%)" : 19
    "Partial (5 modules, 14%)" : 5
```

### Spec-13 Bulletproof MVP Phase Dependencies

```mermaid
flowchart TB
    subgraph Tier1["Tier 1: Critical Security Fixes (Phases 1-8)"]
        P1["Phase 1\nPrompt Injection\nBlocking Guard"]
        P2["Phase 2\nInterpreter\nDenylist Closure"]
        P3["Phase 3\nTOCTOU Race\nfs_tools Fix"]
        P4["Phase 4\nCommand Split\nShlex Unification"]
        P5["Phase 5\nAPI Error Body\nSanitization"]
        P6["Phase 6\nVerifier Multiline\nString Bypass"]
        P7["Phase 7\nCLI Exception\nSwallowing Fix"]
        P8["Phase 8\nJSON Deser\nValidation"]
    end

    subgraph Tier2["Tier 2: Reliability Fixes (Phases 9-15)"]
        P9["Phase 9\nMetacharacter\nUnification"]
        P10["Phase 10\nDeprecated rmtree\nAPI Fix"]
        P11["Phase 11\nRead-Path Denied\nFilter"]
        P12["Phase 12\nExplicit Git\nFile Staging"]
        P13["Phase 13\nProcess Group\nTimeout"]
        P14["Phase 14\nSecret Redaction\nCompletion"]
        P15["Phase 15\nHistory Bounding\nHF Engine"]
    end

    subgraph Tier3["Tier 3: Code Quality (Phases 16-19)"]
        P16["Phase 16\nDead Code\nRemoval"]
        P17["Phase 17\nPercent-Style\nLogging"]
        P18["Phase 18\nAudit Logger\nLevel Fix"]
        P19["Phase 19\nAtomic Plan\nFile Writes"]
    end

    subgraph Tier4["Tier 4: Test Coverage (Phases 20-23)"]
        P20["Phase 20\nconfig.py\nTests"]
        P21["Phase 21\nregistry.py\nTests"]
        P22["Phase 22\nerrors.py Tests\n+ Dedup"]
        P23["Phase 23\nRAG + Progress\nTests"]
    end

    subgraph Tier5["Tier 5: Final (Phases 24-25)"]
        P24["Phase 24\npyproject.toml\n+ .gitignore"]
        P25["Phase 25\nFull Verify\n+ Docs Align"]
    end

    Tier1 --> Tier2
    Tier2 --> Tier3
    P9 --> P13
    P16 --> P17
    Tier3 --> Tier4
    Tier4 --> Tier5
    P24 --> P25

    style Tier1 fill:#B22222,color:#fff
    style Tier2 fill:#DAA520,color:#000
    style Tier3 fill:#4169E1,color:#fff
    style Tier4 fill:#228B22,color:#fff
    style Tier5 fill:#6A0DAD,color:#fff
```

### Spec-13 Target State

```mermaid
pie title Target Module Test Coverage After Spec-13
    "Fully Tested (30 modules, 100%)" : 30
```

### Spec-14 Hardening v2 Phase Dependencies

```mermaid
flowchart TB
    subgraph Tier1["Tier 1: Critical Security & Permission Fixes (Phases 1-5)"]
        P1["Phase 1\nGate\n--skip-permissions"]
        P2["Phase 2\nClose env/xargs\nDenylist Gap"]
        P3["Phase 3\nFix Protected\nPath Bypass"]
        P4["Phase 4\nUTF-8 Encoding\nfs_tools Fix"]
        P5["Phase 5\nAudit Logger\nThread Safety"]
    end

    subgraph Tier2["Tier 2: Reliability & Correctness (Phases 6-10)"]
        P6["Phase 6\nCleanup Case\nSensitivity Bug"]
        P7["Phase 7\nRead Size\nLimit"]
        P8["Phase 8\nGit Message\nSanitization"]
        P9["Phase 9\nRAG Response\nSize Cap"]
        P10["Phase 10\nAPI Key\nRepr Safety"]
    end

    subgraph Tier3["Tier 3: Code Quality & Stale Refs (Phases 11-14)"]
        P11["Phase 11\nSanitizingFilter\nRoot Logger"]
        P12["Phase 12\nMarkdown Pipe\nEscaping"]
        P13["Phase 13\nFix proxilion\nReferences"]
        P14["Phase 14\nf-string Logger\nVerification"]
    end

    subgraph Tier4["Tier 4: Test Coverage (Phases 15-18)"]
        P15["Phase 15\nagent_runner\nTests"]
        P16["Phase 16\nscaffolder +\nprompts Tests"]
        P17["Phase 17\n_io + budget\nguard Tests"]
        P18["Phase 18\nSample Dummy\nData Fixtures"]
    end

    subgraph Tier5["Tier 5: Final (Phases 19-20)"]
        P19["Phase 19\nREADME Mermaid\n+ Metrics"]
        P20["Phase 20\nFull Verify\n+ State Update"]
    end

    Tier1 --> Tier2
    Tier2 --> Tier3
    P11 --> P14
    P12 --> P14
    P13 --> P14
    Tier3 --> Tier4
    Tier4 --> Tier5
    P19 --> P20

    style Tier1 fill:#B22222,color:#fff
    style Tier2 fill:#DAA520,color:#000
    style Tier3 fill:#4169E1,color:#fff
    style Tier4 fill:#228B22,color:#fff
    style Tier5 fill:#6A0DAD,color:#fff
```

### Spec-14 Target State

```mermaid
pie title Target State After Spec-13 + Spec-14
    "Fully Tested Modules (95%+)" : 28
    "Partial Coverage (5%)" : 2
```

### Combined Hardening Coverage

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

## License

MIT
