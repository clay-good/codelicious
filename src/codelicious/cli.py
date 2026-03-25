import sys
import logging
from pathlib import Path

# Codelicious internal imports
from codelicious.git.git_orchestrator import GitManager
from codelicious.context.cache_engine import CacheManager
from codelicious.engines import select_engine


def setup_logger():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
    return logging.getLogger("codelicious")


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

    # 4. Print startup banner
    logger.info("Engine: %s", engine.name)
    logger.info("Project: %s", repo_path)
    logger.info("Branch: %s", git_manager.current_branch)

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

        if result.success:
            logger.info("Build completed successfully. %s", result.message)
        else:
            logger.error("Build failed: %s", result.message)
            sys.exit(1)

    except KeyboardInterrupt:
        logger.warning("\nExecution interrupted by user.")
        sys.exit(130)
    except Exception as e:
        logger.exception("Fatal unhandled error in Codelicious core: %s", e)
        sys.exit(1)


if __name__ == "__main__":
    main()
