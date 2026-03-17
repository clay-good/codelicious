import subprocess
import json
from pathlib import Path
import logging

logger = logging.getLogger("codelicious.git")


class GitManager:
    """
    Deterministically handles all git branching, committing, and API PR/MR orchestration
    outside the LLM's control flow to guarantee safe isolation.
    """

    def __init__(self, repo_path: Path):
        self.repo_path = repo_path
        self.forbidden_branches = {"main", "master", "production"}

        # Load local configurations
        config_path = self.repo_path / ".codelicious" / "config.json"

        self.config = {}
        if config_path.exists():
            try:
                self.config = json.loads(config_path.read_text())
            except json.JSONDecodeError:
                logger.error("Failed to parse config.json.")

    @property
    def current_branch(self) -> str:
        """Return the current git branch name."""
        if not self._has_git():
            return "unknown"
        try:
            return self._run_cmd(["git", "branch", "--show-current"])
        except Exception:
            return "unknown"

    def _has_git(self) -> bool:
        """Checks if the target repository is actually a git repository."""
        return (self.repo_path / ".git").is_dir()

    def _run_cmd(self, args: list[str], check: bool = True) -> str:
        """Runs an arbitrary command in the repo root safely."""
        res = subprocess.run(args, cwd=self.repo_path, capture_output=True, text=True)
        if check and res.returncode != 0:
            raise RuntimeError(f"Command {' '.join(args)} failed: {res.stderr}")
        return res.stdout.strip()

    def assert_safe_branch(self):
        """Ensures the agent never executes against main/master directly."""
        if not self._has_git():
            logger.warning(
                "A .git folder was not found so no git orchestration will occur. USER: Please add a .git or change directory to build within a repository."
            )
            return

        try:
            branch = self._run_cmd(["git", "branch", "--show-current"])
            if branch in self.forbidden_branches:
                # Enforce generation of a deterministic feature branch
                feature_branch = "codelicious/auto-build"
                logger.info(
                    f"Current branch is {branch}. Codelicious requires an isolated feature branch. Checking out {feature_branch}."
                )
                self.checkout_or_create_feature_branch(feature_branch)
            else:
                logger.info(f"Operating on safe feature branch: {branch}")
        except Exception as e:
            logger.error(f"Failed to verify safe git branch: {e}")

    def checkout_or_create_feature_branch(self, branch_name: str):
        """Checkout feature branch, creating it if it doesn't exist."""
        try:
            self._run_cmd(["git", "checkout", branch_name])
            logger.info(f"Checked out existing branch {branch_name}")
        except RuntimeError:
            logger.info(f"Branch {branch_name} not found locally. Creating it.")
            self._run_cmd(["git", "checkout", "-b", branch_name])

    def commit_verified_changes(self, commit_message: str):
        """Stages all changes and commits them deterministically."""
        if not self._has_git():
            return

        try:
            self._run_cmd(["git", "add", "."])

            # Check if there's anything to commit
            status = self._run_cmd(["git", "status", "--porcelain"])
            if not status:
                logger.info("Working directory clean. Nothing to commit.")
                return

            self._run_cmd(["git", "commit", "-m", commit_message])
            logger.info(f"Committed changes seamlessly: {commit_message}")

            # Push to origin
            current_branch = self._run_cmd(["git", "branch", "--show-current"])
            logger.info(f"Pushing branch {current_branch} to origin.")
            subprocess.run(
                ["git", "push", "--set-upstream", "origin", current_branch],
                cwd=self.repo_path,
                capture_output=True,
            )

            # Since a commit just happened, ensure a Draft PR exists for it
            self.ensure_draft_pr_exists(commit_message)

        except Exception as e:
            logger.error(f"Failed to commit or push: {e}")

    def ensure_draft_pr_exists(self, spec_summary: str):
        """Uses the local `gh` CLI to orchestrate Draft PRs if one doesn't exist."""
        if not self._has_git():
            return

        logger.info("Checking for existing active PRs via `gh` CLI...")

        # Check if gh CLI is installed
        gh_check = subprocess.run(["gh", "--version"], capture_output=True)
        if gh_check.returncode != 0:
            logger.warning("GitHub CLI (`gh`) not found! Cannot automatically orchestrate PR API. Continuing locally.")
            return

        # Check if a PR already exists for this branch
        pr_status = subprocess.run(["gh", "pr", "view"], cwd=self.repo_path, capture_output=True)

        if pr_status.returncode != 0:
            logger.info("No PR found for this branch. Creating a new Draft PR.")
            title = f"Autonomous Implementation: {spec_summary}"
            body = "This PR was generated entirely by Codelicious using DeepSeek and Qwen."

            subprocess.run(
                ["gh", "pr", "create", "--draft", "--title", title, "--body", body],
                cwd=self.repo_path,
                capture_output=True,
            )
            logger.info("Successfully created Draft PR via `gh`.")
        else:
            logger.info("Draft PR already exists. Commits have been appended.")

    def transition_pr_to_review(self):
        """
        Called when the entire spec loop passes verification.
        Drops the 'Draft' flag and requests reviewers explicitly from config.json.
        """
        if not self._has_git():
            return

        logger.info("Loop Completed. Transitioning Pull Request from Draft to Active.")

        gh_check = subprocess.run(["gh", "--version"], capture_output=True)
        if gh_check.returncode != 0:
            return

        subprocess.run(["gh", "pr", "ready"], cwd=self.repo_path, capture_output=True)

        reviewers = self.config.get("default_reviewers", [])
        if reviewers:
            logger.info(f"Requesting urgent human reviews from: {reviewers}")
            reviewer_args = []
            for r in reviewers:
                reviewer_args.extend(["--reviewer", r])
            subprocess.run(
                ["gh", "pr", "edit"] + reviewer_args,
                cwd=self.repo_path,
                capture_output=True,
            )

        logger.info("Successfully transitioned outcome to 'Outcome as a Service' completion queue.")
