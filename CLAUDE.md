# Codelicious Development Guide

## Project Overview

Codelicious is a headless, autonomous developer CLI that transforms markdown specs into Pull Requests. It uses a dual-engine architecture (Claude Code CLI + HuggingFace) with zero runtime dependencies.

## How to Run

```bash
# Install
pip install -e ".[dev]"

# Run tests
pytest

# Lint
ruff check src/ tests/
ruff format src/ tests/

# Security scan
bandit -r src/
```

## Architecture

- `src/codelicious/cli.py` -- entry point, engine selection, CLI arg parsing
- `src/codelicious/orchestrator.py` -- 4-phase orchestration (BUILD, MERGE, REVIEW, FIX)
- `src/codelicious/engines/` -- dual engine system (Claude Code CLI + HuggingFace)
- `src/codelicious/tools/` -- tool dispatch (read/write files, run commands, search)
- `src/codelicious/git/` -- deterministic git operations (branch, commit, PR)
- `src/codelicious/sandbox.py` -- filesystem isolation, TOCTOU-safe operations
- `src/codelicious/verifier.py` -- lint, test, security, coverage checks

## Conventions

- Python 3.10+, line length 120, double quotes
- Zero runtime dependencies (stdlib only)
- All tests in `tests/`, named `test_*.py`
- Use pytest fixtures, not setUp/tearDown

## Resilience Rules

- Always check the build deadline before starting a new phase
- LLM calls use exponential backoff with jitter for transient errors (429, 5xx)
- SIGTERM triggers graceful shutdown via SystemExit(143)
- Subprocess timeouts use process groups (start_new_session=True) with SIGTERM then SIGKILL

## Security Rules

- Never use `eval()`, `exec()`, or `shell=True`
- Never hardcode API keys or secrets
- All file writes go through `Sandbox` (atomic, TOCTOU-safe)
- Command execution uses denylist model (see `security_constants.py`)
- All LLM endpoint URLs validated for HTTPS
- Credential redaction on all log output
