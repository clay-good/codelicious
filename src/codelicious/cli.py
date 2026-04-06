import shutil
import signal
import sys
import logging
import time
from pathlib import Path

# Codelicious internal imports
from codelicious.git.git_orchestrator import GitManager
from codelicious.context.cache_engine import CacheManager
from codelicious.engines import select_engine
from codelicious.engines.claude_engine import _discover_incomplete_specs, _walk_for_specs, _CHECKED_RE, _UNCHECKED_RE

# Graceful shutdown flag (spec-18 Phase 1: GS-1)
_shutdown_requested: bool = False


def _handle_sigterm(signum: int, frame: object) -> None:
    """Handle SIGTERM for graceful shutdown in container/orchestrator environments."""
    global _shutdown_requested
    _shutdown_requested = True
    logging.getLogger("codelicious").warning("Received SIGTERM (signal %d), shutting down gracefully", signum)
    raise SystemExit(143)


def _validate_dependencies(engine_name: str) -> str:
    """Validate external dependencies at startup (spec-18 Phase 4: SV-1, SV-2, SV-3).

    Returns the effective engine name (may change from "auto" to "huggingface"
    if claude is not found).
    """
    _logger = logging.getLogger("codelicious")

    # SV-1: git is always required
    if shutil.which("git") is None:
        print("Error: git is required but not found on PATH. Install git and try again.", file=sys.stderr)
        sys.exit(1)

    # SV-2: claude binary check
    if engine_name in ("claude", "auto"):
        if shutil.which("claude") is None:
            if engine_name == "claude":
                print(
                    "Error: claude binary not found on PATH. Install Claude Code CLI and try again.",
                    file=sys.stderr,
                )
                sys.exit(1)
            else:
                _logger.info("claude binary not found, falling back to HuggingFace engine")
                engine_name = "huggingface"

    # SV-3: HF token check
    if engine_name == "huggingface":
        import os

        hf_token = os.environ.get("HF_TOKEN", "") or os.environ.get("LLM_API_KEY", "")
        if not hf_token:
            print(
                "Error: HF_TOKEN or LLM_API_KEY environment variable is required for HuggingFace engine.\n"
                "Get a token at https://huggingface.co/settings/tokens",
                file=sys.stderr,
            )
            sys.exit(1)
        if not hf_token.startswith("hf_"):
            _logger.warning("HF_TOKEN does not start with 'hf_' -- this may not be a valid HuggingFace token")

    return engine_name


def setup_logger():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    # Attach SanitizingFilter to root logger and each of its handlers to ensure
    # third-party library secrets are redacted at both the logger and handler level (Finding 44)
    from codelicious.logger import SanitizingFilter

    root = logging.getLogger()
    root.addFilter(SanitizingFilter())
    for handler in logging.root.handlers:
        handler.addFilter(SanitizingFilter())
    return logging.getLogger("codelicious")


def _print_banner(repo_path: Path, engine_name: str, branch: str, all_specs, incomplete_specs):
    """Print a verbose startup banner with spec discovery summary."""
    total = len(all_specs)
    incomplete = len(incomplete_specs)
    complete = total - incomplete

    bar_width = 30
    filled = int(bar_width * complete / total) if total else 0
    bar = "\u2588" * filled + "\u2591" * (bar_width - filled)
    pct = (complete / total * 100) if total else 0

    print()
    print("=" * 64)
    print("  CODELICIOUS BUILD")
    print("=" * 64)
    print(f"  Project:  {repo_path}")
    print(f"  Engine:   {engine_name}")
    print(f"  Branch:   {branch}")
    print("-" * 64)
    print(f"  Specs found:      {total}")
    print(f"  Already complete: {complete}")
    print(f"  To build:         {incomplete}")
    print()
    print(f"  Progress: [{bar}] {pct:.0f}%")
    print()
    if incomplete_specs:

        def rel(p):
            return p.relative_to(repo_path) if p.is_relative_to(repo_path) else p

        print("  Specs to build:")
        for i, s in enumerate(incomplete_specs, 1):
            print(f"    {i}. {rel(s)}")
        print()
    print("=" * 64)
    print()


def _print_result(repo_path: Path, result, elapsed: float, initial_incomplete: int):
    """Print a verbose completion summary."""
    # Re-scan to see what's left using the same logic as _discover_incomplete_specs
    all_specs = _walk_for_specs(repo_path)
    remaining = []
    completed_now = []
    for path in all_specs:
        try:
            content = path.read_text(encoding="utf-8", errors="replace")
            has_unchecked = bool(_UNCHECKED_RE.search(content))
            has_checked = bool(_CHECKED_RE.search(content))
            if has_unchecked or not has_checked:
                remaining.append(path)
            else:
                completed_now.append(path)
        except OSError:
            pass

    total = len(all_specs)
    complete = len(completed_now)
    # Clamp to avoid negative numbers if new specs were added during the build
    built_this_run = max(0, initial_incomplete - len(remaining))

    bar_width = 30
    filled = int(bar_width * complete / total) if total else bar_width
    bar = "\u2588" * filled + "\u2591" * (bar_width - filled)
    pct = (complete / total * 100) if total else 100

    mins, secs = divmod(int(elapsed), 60)
    time_str = f"{mins}m {secs}s" if mins else f"{secs}s"

    print()
    print("=" * 64)
    if result.success:
        print("  BUILD COMPLETE")
    else:
        print("  BUILD FINISHED (with issues)")
    print("=" * 64)
    print(f"  Duration:       {time_str}")
    print(f"  Specs built:    {built_this_run}/{initial_incomplete}")
    print(f"  Total progress: {complete}/{total} specs complete")
    print()
    print(f"  Progress: [{bar}] {pct:.0f}%")
    print()
    if remaining:

        def rel(p):
            return p.relative_to(repo_path) if p.is_relative_to(repo_path) else p

        print("  Remaining specs:")
        for i, s in enumerate(remaining, 1):
            print(f"    {i}. {rel(s)}")
        print()
    if result.message:
        print(f"  Status: {result.message}")
        print()
    print("=" * 64)
    print()


def _parse_args(argv: list[str]) -> dict:
    """Parse CLI arguments into a config dict.

    Supports:
        codelicious <repo_path> [options]

    Options:
        --engine claude|huggingface|auto
        --model MODEL_NAME
        --agent-timeout SECONDS
        --resume SESSION_ID
    """
    import os

    _USAGE = (
        "Usage: codelicious <repo_path> [--engine ENGINE] [--model MODEL]\n"
        "                              [--agent-timeout SECS] [--resume SESSION_ID]\n"
        "                              [--allow-dangerous]"
    )

    args = argv[1:]
    opts: dict = {
        "repo_path": "",
        "engine": "",
        "model": "",
        "agent_timeout_s": 1800,
        "resume_session_id": "",
        "allow_dangerous": False,
    }

    # Flags that take a value
    _VALUE_FLAGS = {
        "--engine": "engine",
        "--model": "model",
        "--agent-timeout": "agent_timeout_s",
        "--resume": "resume_session_id",
    }

    # Boolean flags that take no value
    _BOOL_FLAGS = {
        "--allow-dangerous": "allow_dangerous",
    }

    i = 0
    while i < len(args):
        if args[i] in ("-h", "--help"):
            print(_USAGE)
            print()
            print("Point codelicious at a repo and it builds every spec to completion.")
            print("Auto-loops, parallel builds in worktrees, parallel reviewers,")
            print("pushes commits, creates PR. One command. That's it.")
            print()
            print("Options:")
            print("  --engine ENGINE        Force engine: claude, huggingface, auto (default: auto)")
            print("  --model MODEL          Model name (e.g. claude-sonnet-4-20250514)")
            print("  --agent-timeout SECS   Max seconds per agent run (default: 1800)")
            print("  --resume SESSION_ID    Resume a previous Claude session")
            print("  --allow-dangerous      Pass --dangerously-skip-permissions to the claude CLI")
            print()
            print("Environment variables:")
            print("  CODELICIOUS_ENGINE           Same as --engine (CLI flag takes precedence)")
            print("  CODELICIOUS_ALLOW_DANGEROUS  Same as --allow-dangerous (set to 1/true/yes)")
            sys.exit(0)
        elif args[i] in _BOOL_FLAGS:
            opts[_BOOL_FLAGS[args[i]]] = True
            i += 1
        elif args[i] in _VALUE_FLAGS and i + 1 < len(args):
            key = _VALUE_FLAGS[args[i]]
            value = args[i + 1]
            if key == "agent_timeout_s":
                try:
                    value = int(value)
                except ValueError:
                    print(f"Error: --agent-timeout requires an integer, got '{value}'")
                    sys.exit(2)
            opts[key] = value
            i += 2
        elif not args[i].startswith("-") and not opts["repo_path"]:
            opts["repo_path"] = args[i]
            i += 1
        else:
            print(f"Unknown argument: {args[i]}")
            print(_USAGE)
            sys.exit(2)

    if not opts["repo_path"]:
        print(_USAGE)
        sys.exit(2)

    # Env var fallback for engine
    if not opts["engine"]:
        opts["engine"] = os.environ.get("CODELICIOUS_ENGINE", "auto")

    return opts


def main():
    logger = setup_logger()

    # Register SIGTERM handler for graceful shutdown (spec-18 Phase 1: GS-1)
    signal.signal(signal.SIGTERM, _handle_sigterm)

    opts = _parse_args(sys.argv)

    repo_path = Path(opts["repo_path"]).resolve()
    if not repo_path.is_dir():
        logger.error("Repository path %s does not exist or is not a directory.", repo_path)
        sys.exit(1)

    logger.info("Starting Codelicious workflow in %s", repo_path)

    # 0. Validate external dependencies before anything else (spec-18 Phase 4)
    opts["engine"] = _validate_dependencies(opts["engine"])

    # 1. Select build engine
    try:
        engine = select_engine(opts["engine"])
    except RuntimeError as e:
        logger.error(str(e))
        sys.exit(1)

    # 2. Initialize Git Orchestration
    git_manager = GitManager(repo_path)
    git_manager.assert_safe_branch()

    # 3. Hydrate centralized cache context
    cache_manager = CacheManager(repo_path)
    cache_manager.load_cache()

    # 4. Discover specs and print startup banner
    # Walk the repo tree once and reuse the result so _discover_incomplete_specs
    # does not repeat the filesystem traversal (Finding 25).
    all_specs = _walk_for_specs(repo_path)
    incomplete_specs = _discover_incomplete_specs(repo_path, all_specs=all_specs)

    _print_banner(repo_path, engine.name, git_manager.current_branch, all_specs, incomplete_specs)

    if not incomplete_specs:
        logger.info("Nothing to build — all specs are complete.")
        _print_result(
            repo_path,
            type("R", (), {"success": True, "message": "All specs already complete."})(),
            0.0,
            0,
        )
        sys.exit(0)

    initial_incomplete = len(incomplete_specs)
    build_start = time.monotonic()

    try:
        # 5. Run the build cycle — orchestrate mode handles looping,
        #    worktree isolation, and review/fix internally.
        result = engine.run_build_cycle(
            repo_path=repo_path,
            git_manager=git_manager,
            cache_manager=cache_manager,
            spec_filter=None,
            model=opts["model"],
            agent_timeout_s=opts["agent_timeout_s"],
            verify_passes=3,
            reflect=True,
            push_pr=True,
            resume_session_id=opts["resume_session_id"],
            dry_run=False,
            effort="",
            max_turns=0,
            auto_mode=False,  # orchestrate mode handles its own looping
            max_cycles=50,
            parallel=1,  # orchestrate mode uses build_workers for parallelism
            orchestrate=True,
            reviewers="",
            build_workers=3,
            review_workers=4,
            allow_dangerous=opts["allow_dangerous"],
        )

        elapsed = time.monotonic() - build_start
        _print_result(repo_path, result, elapsed, initial_incomplete)

        if result.success:
            logger.info("Build completed successfully. %s", result.message)
        else:
            logger.error("Build failed: %s", result.message)
            sys.exit(1)

    except KeyboardInterrupt:
        global _shutdown_requested
        _shutdown_requested = True
        elapsed = time.monotonic() - build_start
        logger.warning("\nExecution interrupted by user after %.1fs.", elapsed)
        sys.exit(130)
    except Exception as e:
        logger.exception("Fatal unhandled error in Codelicious core: %s", e)
        sys.exit(1)


if __name__ == "__main__":
    main()
