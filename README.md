# Codelicious

**Outcome as a Service.** Codelicious is an open-source, fully self-hosted autonomous developer CLI explicitly designed for Headless Agentic Workflows.

Write specs. Run `codelicious /path/to/repo`. Get a green, review-ready Pull Request.

---

## The Autonomous Workflow

1. **Human Intent:** You write markdown specifications detailing feature requirements in your repo.
2. **Ignition:** You run `codelicious /path/to/repo` in your terminal or CI environment.
3. **The Build Cycle:**
   - Codelicious reads all specs and caches repository state.
   - DeepSeek-V3 plans the tasks.
   - Qwen 2.5 Coder generates the code in a secure sandbox.
   - Tests and linters run deterministically. Errors are fed back to Qwen automatically.
4. **Git Orchestration:**
   - On the first successful run, Codelicious creates a Draft PR/MR (GitHub or GitLab).
   - As it moves through subsequent tasks in its plan, it continuously commits to this same feature branch.
5. **Outcome Delivery:** 
   - When all specs are fulfilled and the complete cycle is 100% green, Codelicious automatically marks the Draft PR as "Ready for Review" and requests human human review.
   - You only intervene to approve the final, working product.

---

## Why Codelicious?

**1. Massive Cost Efficiency (Pennies vs Dollars)**
Using Claude Code CLI or Devin for a full build cycle on a lightweight app often means paying for massive context windows repeatedly, easily costing $5–$20 per feature. Codelicious runs entirely on your own Hugging Face, TGI, or vLLM endpoints. By separating Reasoning (DeepSeek) and Execution (Qwen), and aggressively caching context locally in `.codelicious/cache.json`, you pay fractions of a cent per token—or literally $0 if running locally.

**2. Headless Agentic Workflows**
No VSCode GUI. No back-and-forth chat prompts. Codelicious runs purely dynamically. We utilize specific "Sub-Agents" (headless planners and semantic searchers powered by DeepSeek-V3) that recursively scour the repo to find your specifications, parse intent, and delegate coding to the Qwen Agent automatically.

**3. 90% Probabilistic / 10% Deterministic Engine**
Unlike previous iterations, Codelicious relies on the LLM to do almost *everything* (90%). The models control the layout, finding the specs, choosing what tests to run, and fixing code. The Python core is a razor-thin 10% deterministic shield: it merely prevents path traversal injections, prevents Git writes to `main`, and catches timeout errors. This gives Codelicious the unparalleled organic intelligence of Claude Code CLI.

**4. Uncompromising Audit Logs**
In an Outcome as a Service pipeline, trust is critical. Codelicious logs *everything*. Every LLM inference payload, every sandbox violation caught by the 10% shield, and every test outcome is streamed verbosely to your CLI stdout and permanently written to `.codelicious/audit.log`. You always know exactly why the agent made a decision.

**5. Context Caching & State Management**
Unlike tools that forget their lessons between sessions, Codelicious continuously writes its learnings, heuristics, and semantic search indexes to a centralized `.codelicious/state.json` and `.codelicious/cache.json` in your repository. It builds compounding intelligence on your specific codebase without massive re-indexing costs.

---

## Quick Start

```bash
# Clone the repository
git clone https://github.com/codelicious-ai/codelicious.git
cd codelicious

# Install the autonomous engine globally
pip install -e .

# Export your LLM Provider configurations (HuggingFace Serverless by default)
# IMPORTANT: For Hugging Face Fine-Grained Tokens, ensure you grant the "Make calls to the Serverless Inference API" permission!
export LLM_API_KEY=hf_your_key_here
export MODEL_PLANNER=deepseek-ai/DeepSeek-V3
export MODEL_CODER=Qwen/Qwen2.5-Coder-32B-Instruct

# (Optional) If you want Codelicious to automatically open PRs on GitHub, 
# simply ensure you have the GitHub CLI (`gh`) installed and authenticated locally.
# Codelicious natively inherits your local .git scope!

# Initiate complete Outcome as a Service flow
codelicious /Users/user/Documents/your-repo
```

---

## Repository Architecture and Explicit File Paths

Codelicious maintains a rigid, simplified directory structure to maintain extreme execution speed and low context footprints:

| Component | Absolute Path within Repo | Purpose |
| :--- | :--- | :--- |
| **CLI Entrypoint** | `src/codelicious/cli.py` | Command line parser, cache hydration, loops initialize. |
| **Agentic Loop** | `src/codelicious/loop_controller.py` | The main `while` loop that calls the LLM iteratively. |
| **Git Orchestrator** | `src/codelicious/git/git_orchestrator.py` | PR/MR management and branch isolation enforcer. |
| **Tool Registry** | `src/codelicious/tools/registry.py` | Maps LLM JSON tool payloads to Python functions. |
| **FS Sandbox Tools** | `src/codelicious/tools/fs_tools.py` | High-security `read_file` and `write_file` implementations. |
| **Shell Runner** | `src/codelicious/tools/command_runner.py` | Executes shell commands restricted strictly by config. |
| **Audit Logger** | `src/codelicious/tools/audit_logger.py` | Dumps all payloads to console and `audit.log`. |
| **Cache Engine** | `src/codelicious/context/cache_engine.py` | Serializes LLM state to the local repo's JSON ledgers. |
| **RAG Engine** | `src/codelicious/context/rag_engine.py` | Instant codebase semantic search using local SQLite vectors. |
| **Persistent Ledger** | `[Target Repo]/.codelicious/state.json` | Stores long-term memory of tasks and resolutions. |
| **Runtime Index** | `[Target Repo]/.codelicious/cache.json` | Stores file tree hashes to limit context bloat. |
| **Vector Database** | `[Target Repo]/.codelicious/db.sqlite3` | Lightweight semantic embedding storage for instant RAG. |
| **Audit Log** | `[Target Repo]/.codelicious/audit.log` | Verbosely stores every agent interaction. |
| **Configuration** | `[Target Repo]/.codelicious/config.json` | Defines LLM endpoints, secrets, and shell allowlists. |
