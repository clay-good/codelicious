# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Bite-sized PR defaults** (spec 28 Phase 1): `--max-commits-per-pr` default lowered from 50 to 8 so PRs stay human-reviewable at a glance.

### Added

- `--max-loc-per-pr` CLI flag (default 400, range 50–5000) — wired through to `V2Orchestrator`. Diff-cap split logic lands in spec 28 Phase 2.

## [1.0.0] - 2025-12-01

### Added

- Dual-engine architecture: Claude Code CLI and HuggingFace (DeepSeek + Qwen)
- Automatic engine detection with fallback (Claude > HuggingFace)
- Spec discovery from `docs/specs/*.md` with checkbox-based progress tracking
- Deterministic git workflow: one branch and one PR per spec
- 6-phase Claude Code lifecycle: scaffold, analyze, build, verify, reflect, PR
- 50-iteration agentic loop for HuggingFace engine with tool dispatch
- Parallel spec execution (`--parallel N`) for HuggingFace engine
- Defense-in-depth security: command denylist, shell injection prevention, path traversal defense
- Credential redaction across all log output (30+ regex patterns)
- SSRF protection for LLM endpoint URLs
- Prompt injection detection in spec text
- Sandboxed file operations with TOCTOU-safe atomic writes
- Exponential backoff with jitter for transient LLM errors (429, 5xx)
- Graceful SIGTERM shutdown with atexit cleanup
- Cumulative build timeout enforcement across phases
- Pre-flight auth validation for GitHub (`gh`) and GitLab (`glab`)
- `--dry-run` mode for previewing spec discovery without execution
- `--spec PATH` for targeting a single spec file
- `--max-commits-per-pr` cap (default 50, max 100)
- Zero runtime dependencies (stdlib only)
- 90%+ test coverage enforced in CI
