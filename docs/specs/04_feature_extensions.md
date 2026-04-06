---
version: 1.0.0
status: Complete
related_specs: ["00_master_spec.md", "01_feature_cli_tooling.md"]
---

# Feature Spec: Enterprise Extensions (V2 Roadmap)

## Intent
As Codelicious evolves from a local autonomous CLI into an enterprise-grade Outcome-as-a-Service pipeline, the architecture must expand to support headless CI/CD orchestration, visual quality assurance, and multi-agent peer review. This spec outlines the implementation design for the next phase of Codelicious.

---

## 1. "Issue-to-Outcome" CI/CD Native Bots

### Objective
Remove the need for a developer to manually trigger `codelicious /path` locally. Instead, allow project managers or users to open a GitHub/GitLab issue that autonomously triggers the build loop in the cloud.

### Implementation Design
- **Trigger:** A GitHub Action (or GitLab CI pipeline) configured to run on `issues.opened` or `issue_comment.created`.
- **Condition:** The workflow only executes if the issue contains the label `codelicious-run` (or a specific trigger command like `/codelicious`).
- **Execution:**
  1. The CI runner checks out the repository.
  2. It installs the `codelicious` CLI.
  3. It extracts the Issue Title and Issue Body, writing them dynamically to `docs/specs/issue_spec.md`.
  4. It runs `codelicious .` using secure repository secrets for the `LLM_API_KEY` and `GITHUB_TOKEN`.
- **Outcome:** Codelicious performs its standard 90% probabilistic loop, creating an isolated branch, committing the code, and opening a Draft PR. The final step of the Git Orchestrator links the PR to the original issue (e.g., "Fixes #123") and requests human review.

---

## 2. Browser-in-the-Loop (Visual Feedback)

### Objective
Grant the execution agent the ability to visually verify frontend development (CSS, DOM structure, React/Vue rendering) instead of relying solely on unit tests and linters.

### Implementation Design
- **Tool Addition:** A new `browser_eval` tool injected into the Tool Registry schemas.
- **Execution Context:**
  1. If the Qwen coder detects frontend tasks, it uses `run_command` to start the local dev server (e.g., `npm run dev &`).
  2. The agent calls standard Playwright or Puppeteer headless wrappers included in the Codelicious Python core.
  3. **Capabilities:** 
     - Capture the DOM explicitly and return the HTML tree to the LLM.
     - Scrape the browser console for JavaScript runtime errors.
     - (Advanced) Use a Vision-capable LLM to view screenshot diffs and detect visual drift.
- **Outcome:** The agent literally "looks" at the rendered webpage to confirm the CSS button is green before it commits the code.

---

## 3. Swarm Architecture (Multi-Agent Conflict)

### Objective
Simulate a real-world development team's Pull Request review process inside the iterative build cycle to ensure maximum security, architecture compliance, and code quality before a commit is even pushed.

### Implementation Design
- **Role Separation:** Instead of a single system prompt, Codelicious instances three distinct LLM profiles:
  1. **The Planner/Coder (DeepSeek/Qwen):** Writes the code (Current implementation).
  2. **The Security Verifier (e.g., Llama-3-Guard):** A specialized infosec persona.
  3. **The Senior Architect:** A strict persona analyzing the diff against clean-code principles.
- **Execution Flow:**
  1. Qwen finishes writing a task and suggests it is ready to commit.
  2. The Python `loop_controller.py` intercepts this. It generates a `git diff`.
  3. It sends the diff to the Security Verifier and Senior Architect.
  4. If either review agent replies with `REJECT: <reason>`, the Python loop pipes that feedback directly back into the Qwen Coder's context window as a Tool Error, forcing it to try again.
  5. Only when all agents output `APPROVE` does the commit execute.
- **Outcome:** Phenomenal code quality and zero trust implementation, ensuring the LLM automatically reviews its own work from adversarial perspectives.

---

## 4. Local Vector Database for Instant RAG

### Objective
Provide Codelicious with the ability to instantly perform semantic search across the entire repository to fetch the exact necessary context without blindly relying on manual `grep_search` or dumping whole files into the token window.

### Implementation Design
- **Dependency Constraint:** We explicitly **cannot** install libraries like `sentence-transformers` locally, as forcing a 2GB PyTorch download ruins the lightweight nature of a thin CLI tool.
- **Execution Flow:**
  1. **Indexing Sync:** On startup, the CLI recursively walks all allowed paths. It chunks file text into 500-token blocks.
  2. **Serverless Embeddings:** The CLI sends these chunks via a zero-dependency HTTP POST to a free Hugging Face feature-extraction API endpoint (e.g., `BAAI/bge-small-en-v1.5`).
  3. **Local Storage:** The resulting embedding vectors are saved locally into a lightweight `sqlite3` database file located at `.codelicious/db.sqlite3`.
  4. **The New Tool:** We inject a `semantic_search(query: str)` tool into the `registry.py` schema.
  5. **RAG Retrieval:** When the Qwen/DeepSeek agent needs to find "authentication logic", it simply calls `semantic_search("authentication flow")`. Python immediately embeds the query via HF API, runs a Cosine Similarity calculation against the SQLite rows natively, and returns the top 3 file snippets.
- **Outcome:** The LLM gets instantaneous context awareness across 10,000+ file codebases inside a thin, lightning-fast Python CLI using $0 of local compute overhead.
