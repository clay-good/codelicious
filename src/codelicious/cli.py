import sys
import logging
import time
from pathlib import Path

# Codelicious internal imports
from codelicious.git.git_orchestrator import GitManager
from codelicious.context.cache_engine import CacheManager
from codelicious.engines import select_engine
from codelicious.engines.claude_engine import _discover_incomplete_specs, _walk_for_specs, _CHECKED_RE, _UNCHECKED_RE


def setup_logger():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
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
        rel = lambda p: p.relative_to(repo_path) if p.is_relative_to(repo_path) else p
        print("  Specs to build:")
        for i, s in enumerate(incomplete_specs, 1):
            print(f"    {i}. {rel(s)}")
        print()
    print("=" * 64)
    print()


def _print_result(repo_path: Path, result, elapsed: float, initial_incomplete: int):
    """Print a verbose completion summary."""
    # Re-scan to see what's left
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
    built_this_run = initial_incomplete - len(remaining)

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
        rel = lambda p: p.relative_to(repo_path) if p.is_relative_to(repo_path) else p
        print("  Remaining specs:")
        for i, s in enumerate(remaining, 1):
            print(f"    {i}. {rel(s)}")
        print()
    if result.message:
        print(f"  Status: {result.message}")
        print()
    print("=" * 64)
    print()


def main():
    logger = setup_logger()

    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        print("Usage: codelicious <repo_path>")
        print()
        print("Point codelicious at a repo and it builds every spec to completion.")
        print("Auto-loops, parallel builds in worktrees, parallel reviewers,")
        print("pushes commits, creates PR. One command. That's it.")
        sys.exit(0 if sys.argv[1:] == ["--help"] or sys.argv[1:] == ["-h"] else 2)

    repo_path = Path(sys.argv[1]).resolve()
    if not repo_path.is_dir():
        logger.error("Repository path %s does not exist or is not a directory.", repo_path)
        sys.exit(1)

    logger.info("Starting Codelicious workflow in %s", repo_path)

    # 1. Select build engine (auto-detect)
    try:
        engine = select_engine("auto")
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
    all_specs = _walk_for_specs(repo_path)
    incomplete_specs = _discover_incomplete_specs(repo_path)

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
        # 5. Run the build cycle — everything ON by default
        result = engine.run_build_cycle(
            repo_path=repo_path,
            git_manager=git_manager,
            cache_manager=cache_manager,
            spec_filter=None,
            model="",
            agent_timeout_s=1800,
            verify_passes=3,
            reflect=True,
            push_pr=True,
            resume_session_id="",
            dry_run=False,
            effort="",
            max_turns=0,
            auto_mode=True,
            max_cycles=50,
            parallel=3,
            orchestrate=True,
            reviewers="",
            build_workers=3,
            review_workers=4,
            max_iterations=50,
        )

        elapsed = time.monotonic() - build_start
        _print_result(repo_path, result, elapsed, initial_incomplete)

        if result.success:
            logger.info("Build completed successfully. %s", result.message)
        else:
            logger.error("Build failed: %s", result.message)
            sys.exit(1)

    except KeyboardInterrupt:
        elapsed = time.monotonic() - build_start
        logger.warning("\nExecution interrupted by user after %.1fs.", elapsed)
        sys.exit(130)
    except Exception as e:
        logger.exception("Fatal unhandled error in Codelicious core: %s", e)
        sys.exit(1)


if __name__ == "__main__":
    main()
