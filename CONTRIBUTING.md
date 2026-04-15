# Contributing to Codelicious

Thanks for your interest in contributing! Here's how to get started.

## Development Setup

```bash
git clone https://github.com/clay-good/codelicious.git
cd codelicious
pip install -e ".[dev]"
pre-commit install
```

## Running Checks

```bash
pytest                      # Run tests (~1,900 tests)
ruff check src/ tests/      # Lint
ruff format src/ tests/     # Format
bandit -r src/              # Security scan
pip-audit                   # Dependency vulnerabilities
```

All checks must pass before submitting a PR. The pre-commit hooks run `ruff` and `bandit` automatically on each commit.

## Code Style

- Python 3.10+
- Line length: 120 characters
- Double quotes
- 4-space indentation
- Use pytest fixtures, not `setUp`/`tearDown`

## Submitting Changes

1. Fork the repo and create a feature branch from `main`
2. Make your changes
3. Add or update tests as needed
4. Ensure all checks pass (`pytest`, `ruff check`, `ruff format --check`, `bandit`)
5. Open a pull request against `main`

## Security

- Never use `eval()`, `exec()`, or `shell=True`
- Never hardcode API keys or secrets
- All file writes must go through `Sandbox` (atomic, TOCTOU-safe)
- See [CLAUDE.md](CLAUDE.md) for the full security rules

## Reporting Issues

Use [GitHub Issues](https://github.com/clay-good/codelicious/issues) to report bugs or request features. Please include:

- Steps to reproduce (for bugs)
- Python version and OS
- Full error output / traceback
