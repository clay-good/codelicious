import argparse
import sys
import logging
from pathlib import Path

# Codelicious internal imports
from codelicious.git.git_orchestrator import GitManager
from codelicious.context.cache_engine import CacheManager
from codelicious.loop_controller import BuildLoop

def setup_logger():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s"
    )
    return logging.getLogger("codelicious")

def main():
    parser = argparse.ArgumentParser(description="Codelicious: Headless Agentic Developer")
    parser.add_argument("repo_path", type=str, help="Path to the repository to process")
    parser.add_argument("--spec", type=str, help="Optional: Path to a specific markdown spec to run")
    
    args = parser.parse_args()
    logger = setup_logger()
    
    repo_path = Path(args.repo_path).resolve()
    if not repo_path.is_dir():
        logger.error(f"Repository path {repo_path} does not exist or is not a directory.")
        sys.exit(1)
        
    logger.info(f"Starting Codelicious workflow in {repo_path}")
    
    # 1. Initialize Git Orchestration (Branch enforcement)
    git_manager = GitManager(repo_path)
    git_manager.assert_safe_branch()
    
    # 2. Hydrate centralized cache context
    cache_manager = CacheManager(repo_path)
    session_cache = cache_manager.load_cache()
    
    # 3. Initialize the deterministic execution loop
    loop = BuildLoop(
        repo_path=repo_path,
        git_manager=git_manager,
        cache_manager=cache_manager,
        spec_filter=args.spec
    )
    
    try:
        # 4. Run the end-to-end outcome-as-a-service loop
        success = loop.run_continuous_cycle()
        
        if success:
            logger.info("Build cycle completed successfully. 100% Green.")
            git_manager.transition_pr_to_review()
        else:
            logger.error("Build cycle exhausted patience threshold with failing verification checks.")
            sys.exit(1)
            
    except KeyboardInterrupt:
        logger.warning("\nExecution interrupted by user.")
        sys.exit(130)
    except Exception as e:
        logger.exception(f"Fatal unhandled error in Codelicious core: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
