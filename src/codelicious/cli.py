import argparse
import sys
import logging
from pathlib import Path

# Codelicious internal imports
from codelicious.git.git_orchestrator import GitManager
from codelicious.context.cache_engine import CacheManager
from codelicious.engines import select_engine


def setup_logger():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s"
    )
    return logging.getLogger("codelicious")


def main():
    parser = argparse.ArgumentParser(description="Codelicious: Headless Agentic Developer")
    parser.add_argument("repo_path", type=str, help="Path to the repository to process")
    parser.add_argument("--spec", type=str, help="Path to a specific markdown spec to run")
    parser.add_argument(
        "--engine",
        type=str,
        choices=["auto", "claude", "huggingface"],
        default="auto",
        help="Build engine to use (default: auto-detect)",
    )
    parser.add_argument("--model", type=str, default="", help="Model override (e.g. claude-sonnet-4-6)")
    parser.add_argument("--agent-timeout", type=int, default=1800, help="Claude engine timeout in seconds (default: 1800)")
    parser.add_argument("--resume", type=str, default="", help="Resume a previous Claude Code session by ID")
    parser.add_argument("--verify-passes", type=int, default=3, help="Number of verification passes (default: 3)")
    parser.add_argument("--no-reflect", action="store_true", help="Skip the reflect/review phase")
    parser.add_argument("--push-pr", action="store_true", help="Push changes and create/update PR")
    parser.add_argument("--max-iterations", type=int, default=50, help="Max iterations for HF engine (default: 50)")
    parser.add_argument("--dry-run", action="store_true", help="Log what would happen without executing")

    args = parser.parse_args()
    logger = setup_logger()

    repo_path = Path(args.repo_path).resolve()
    if not repo_path.is_dir():
        logger.error(f"Repository path {repo_path} does not exist or is not a directory.")
        sys.exit(1)

    logger.info(f"Starting Codelicious workflow in {repo_path}")

    # 1. Select build engine
    try:
        engine = select_engine(args.engine)
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
    logger.info(f"Engine: {engine.name}")
    logger.info(f"Project: {repo_path}")
    logger.info(f"Branch: {git_manager.current_branch}")

    try:
        # 5. Run the build cycle
        result = engine.run_build_cycle(
            repo_path=repo_path,
            git_manager=git_manager,
            cache_manager=cache_manager,
            spec_filter=args.spec,
            # Claude engine kwargs
            model=args.model,
            agent_timeout_s=args.agent_timeout,
            verify_passes=args.verify_passes,
            reflect=not args.no_reflect,
            push_pr=args.push_pr,
            resume_session_id=args.resume,
            dry_run=args.dry_run,
            effort="",
            max_turns=0,
            # HF engine kwargs
            max_iterations=args.max_iterations,
        )

        if result.success:
            logger.info("Build cycle completed successfully. %s", result.message)
            if args.push_pr:
                try:
                    git_manager.transition_pr_to_review()
                except Exception:
                    pass  # Already handled in engine
        else:
            logger.error("Build cycle failed: %s", result.message)
            sys.exit(1)

    except KeyboardInterrupt:
        logger.warning("\nExecution interrupted by user.")
        sys.exit(130)
    except Exception as e:
        logger.exception(f"Fatal unhandled error in Codelicious core: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
