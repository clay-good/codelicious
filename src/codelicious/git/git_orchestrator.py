import subprocess
import json
from pathlib import Path
import logging

from codelicious.errors import GitOperationError

logger = logging.getLogger("codelicious.git")

# Patterns that indicate potentially sensitive files
SENSITIVE_PATTERNS: frozenset[str] = frozenset(
    {
        ".env",
        ".pem",
        ".key",
        "secret",
        "credential",
        "token",
        "id_rsa",
        "id_ed25519",
        "password",
        "private",
        # Additional patterns (Finding 42)
        ".npmrc",
        ".pypirc",
        ".netrc",
        "kubeconfig",
        "service-account",
        "aws-credentials",
        "docker-config",
    }
)


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
                self.config = json.loads(config_path.read_text(encoding="utf-8"))
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

    def _run_cmd(self, args: list[str], check: bool = True, timeout: int = 60) -> str:
        """Runs an arbitrary command in the repo root safely.

        Args:
            args: Command and arguments to run.
            check: If True, raise on non-zero exit code.
            timeout: Maximum seconds to wait for the command (default 60).

        Raises:
            GitOperationError: If the command times out.
            RuntimeError: If check is True and the command exits non-zero.
        """
        try:
            res = subprocess.run(args, cwd=self.repo_path, capture_output=True, text=True, timeout=timeout)
        except subprocess.TimeoutExpired as exc:
            raise GitOperationError(f"Command {' '.join(args)} timed out after {timeout}s") from exc
        if check and res.returncode != 0:
            raise RuntimeError(f"Command {' '.join(args)} failed: {res.stderr}")
        return res.stdout.strip()

    def push_to_origin(self) -> bool:
        """Push the current branch to origin if there are unpushed commits.

        Returns True if the push succeeded (or nothing to push),
        False on failure.
        """
        if not self._has_git():
            return False

        try:
            current_branch = self._run_cmd(["git", "branch", "--show-current"])

            # Check if there are commits to push
            result = subprocess.run(
                ["git", "log", f"origin/{current_branch}..HEAD", "--oneline"],
                cwd=self.repo_path,
                capture_output=True,
                text=True,
                timeout=15,
            )
            # If the remote branch doesn't exist yet, or there are unpushed commits
            has_unpushed = result.returncode != 0 or bool(result.stdout.strip())

            if not has_unpushed:
                logger.debug("No unpushed commits on %s.", current_branch)
                return True

            logger.info("Pushing %s to origin.", current_branch)
            push_result = subprocess.run(
                ["git", "push", "--set-upstream", "origin", current_branch],
                cwd=self.repo_path,
                capture_output=True,
                text=True,
                timeout=120,
            )
            if push_result.returncode != 0:
                logger.warning("git push failed (exit %d): %s", push_result.returncode, push_result.stderr.strip())
                return False
            return True
        except Exception as e:
            logger.warning("Push failed: %s", e)
            return False

    def assert_safe_branch(self, spec_name: str = ""):
        """Ensures the agent never executes against main/master directly.

        If on a forbidden branch (main/master/production), checks out a
        deterministic feature branch derived from spec_name. If no spec_name
        is provided, falls back to 'codelicious/auto-build'.

        The branch name is always 'codelicious/{spec_name}' so that
        repeated runs for the same spec reuse the same branch and PR.
        """
        if not self._has_git():
            logger.warning(
                "A .git folder was not found so no git orchestration will occur. USER: Please add a .git or change directory to build within a repository."
            )
            return

        try:
            branch = self._run_cmd(["git", "branch", "--show-current"])
            if branch in self.forbidden_branches:
                feature_branch = self.branch_for_spec(spec_name)
                logger.info(
                    "Current branch is %s. Codelicious requires an isolated feature branch. Checking out %s.",
                    branch,
                    feature_branch,
                )
                self.checkout_or_create_feature_branch(feature_branch)
            else:
                logger.info("Operating on safe feature branch: %s", branch)
        except Exception as e:
            logger.error("Failed to verify safe git branch: %s", e)

    @staticmethod
    def branch_for_spec(spec_name: str) -> str:
        """Return a deterministic branch name for a spec.

        Strips file extensions and path components so that
        ``branch_for_spec("docs/specs/spec-v3.md")`` returns
        ``"codelicious/spec-v3"``.
        """
        if not spec_name:
            return "codelicious/auto-build"
        stem = Path(spec_name).stem  # "spec-v3.md" → "spec-v3"
        return f"codelicious/{stem}"

    def checkout_or_create_feature_branch(self, branch_name: str):
        """Checkout feature branch, creating it if it doesn't exist."""
        try:
            self._run_cmd(["git", "checkout", branch_name])
            logger.info("Checked out existing branch %s", branch_name)
        except RuntimeError:
            logger.info("Branch %s not found locally. Creating it.", branch_name)
            self._run_cmd(["git", "checkout", "-b", branch_name])

    def _is_sensitive_file(self, filename: str) -> bool:
        """Check if a filename matches any sensitive pattern."""
        filename_lower = filename.lower()
        for pattern in SENSITIVE_PATTERNS:
            if pattern in filename_lower:
                return True
        return False

    def _check_staged_files_for_sensitive_patterns(self) -> list[str]:
        """
        Check staged files for sensitive patterns.

        Returns the list of sensitive file paths found in the staging area.
        The caller is responsible for unstaging them before committing.
        """
        sensitive_files = []
        try:
            staged_output = self._run_cmd(["git", "diff", "--cached", "--name-only"])
            if staged_output:
                for filepath in staged_output.splitlines():
                    if self._is_sensitive_file(filepath):
                        sensitive_files.append(filepath)
                        logger.warning("Potentially sensitive file staged: %s", filepath)
        except RuntimeError:
            pass
        return sensitive_files

    def _unstage_sensitive_files(self, sensitive_files: list[str]) -> None:
        """Unstage files that were detected as potentially sensitive.

        Uses 'git reset HEAD <file>' to remove each file from the staging
        area so it cannot be accidentally committed.
        """
        for filepath in sensitive_files:
            try:
                self._run_cmd(["git", "reset", "HEAD", filepath])
                logger.warning(
                    "Unstaged sensitive file to prevent accidental commit: %s",
                    filepath,
                )
            except RuntimeError as e:
                logger.error("Failed to unstage sensitive file %s: %s", filepath, e)

    def commit_verified_changes(self, commit_message: str, files_to_stage: list[str] | None = None) -> bool:
        """Stage changes and commit them.  Does NOT push.

        Use ``push_to_origin()`` separately to push commits to the remote.
        This separation avoids double-pushes and lets callers control
        when pushing happens (e.g. after multiple merge commits).

        Sensitive files (keys, .env, credentials, etc.) are automatically
        unstaged before the commit so they can never be accidentally committed.

        Args:
            commit_message: The commit message to use.
            files_to_stage: Optional list of specific file paths to stage.
                           If None or empty, uses 'git add .' with automatic
                           unstaging of any sensitive files detected.

        Returns:
            True if the commit succeeded or there was nothing to commit.
            False if an error prevented the commit from completing.
        """
        if not self._has_git():
            return True

        try:
            # Stage files
            if files_to_stage:
                # Stage only the specified files
                for filepath in files_to_stage:
                    try:
                        self._run_cmd(["git", "add", filepath])
                    except RuntimeError as e:
                        logger.warning("Failed to stage file %s: %s", filepath, e)
            else:
                # Fall back to git add . with sensitive file warnings
                self._run_cmd(["git", "add", "."])

            # Pre-commit safety check - detect and automatically unstage sensitive files
            sensitive = self._check_staged_files_for_sensitive_patterns()
            if sensitive:
                self._unstage_sensitive_files(sensitive)

            # Check if there's anything to commit
            status = self._run_cmd(["git", "status", "--porcelain"])
            if not status:
                logger.info("Working directory clean. Nothing to commit.")
                return True

            try:
                self._run_cmd(["git", "commit", "-m", commit_message])
                logger.info("Committed changes: %s", commit_message)
            except RuntimeError as commit_err:
                # Commit failed — unstage all staged changes so the working
                # tree is left in a clean state and callers can safely retry.
                logger.error("Commit failed: %s — unstaging changes.", commit_err)
                try:
                    self._run_cmd(["git", "reset", "HEAD"])
                except RuntimeError as reset_err:
                    logger.error("Failed to unstage after commit failure: %s", reset_err)
                raise

        except Exception as e:
            logger.error("Failed to commit: %s", e)
            return False

        return True

    def ensure_draft_pr_exists(self, spec_summary: str = ""):
        """Ensure exactly one PR exists for the current branch.

        Uses ``gh pr list --head <branch>`` to check for existing PRs
        (including closed/merged) before creating. This prevents duplicate
        PRs when the same spec is run multiple times.
        """
        if not self._has_git():
            return

        _GH_TIMEOUT_S = 60  # Max seconds for gh CLI calls

        # Check if gh CLI is installed
        try:
            gh_check = subprocess.run(["gh", "--version"], capture_output=True, timeout=_GH_TIMEOUT_S)
        except subprocess.TimeoutExpired:
            logger.warning("gh --version timed out. Skipping PR creation.")
            return
        if gh_check.returncode != 0:
            logger.warning("GitHub CLI (`gh`) not found. Skipping PR creation.")
            return

        current_branch = self.current_branch
        if current_branch in self.forbidden_branches or current_branch == "unknown":
            logger.warning("Cannot create PR from branch %s.", current_branch)
            return

        # Check if a PR already exists for this exact branch (any state)
        try:
            pr_check = subprocess.run(
                [
                    "gh",
                    "pr",
                    "list",
                    "--head",
                    current_branch,
                    "--state",
                    "all",
                    "--json",
                    "number,url,state",
                    "--limit",
                    "1",
                ],
                cwd=self.repo_path,
                capture_output=True,
                text=True,
                timeout=_GH_TIMEOUT_S,
            )
        except subprocess.TimeoutExpired:
            logger.warning("gh pr list timed out for branch %s; skipping PR creation.", current_branch)
            return

        if pr_check.returncode == 0 and pr_check.stdout.strip() not in ("", "[]"):
            try:
                prs = json.loads(pr_check.stdout)
                if prs:
                    logger.info(
                        "PR already exists for branch %s: %s (state: %s). Commits appended via push.",
                        current_branch,
                        prs[0].get("url", ""),
                        prs[0].get("state", ""),
                    )
                    return
            except json.JSONDecodeError:
                pass

        # No PR exists — create one
        logger.info("No PR found for branch %s. Creating draft PR.", current_branch)
        title = spec_summary or f"codelicious: {current_branch}"
        body = "## Summary\n\nAutonomous implementation by codelicious.\n\nThis PR updates automatically as new commits are pushed."

        try:
            result = subprocess.run(
                ["gh", "pr", "create", "--draft", "--title", title, "--body", body],
                cwd=self.repo_path,
                capture_output=True,
                text=True,
                timeout=_GH_TIMEOUT_S,
            )
        except subprocess.TimeoutExpired:
            logger.warning("gh pr create timed out for branch %s.", current_branch)
            return

        if result.returncode == 0:
            logger.info("Created draft PR: %s", result.stdout.strip())
        else:
            logger.warning("Failed to create PR: %s", result.stderr.strip())

    def transition_pr_to_review(self):
        """
        Called when the entire spec loop passes verification.
        Drops the 'Draft' flag and requests reviewers explicitly from config.json.
        """
        if not self._has_git():
            return

        _GH_TIMEOUT_S = 60  # Max seconds for gh CLI calls

        logger.info("Loop Completed. Transitioning Pull Request from Draft to Active.")

        try:
            gh_check = subprocess.run(["gh", "--version"], capture_output=True, timeout=_GH_TIMEOUT_S)
        except subprocess.TimeoutExpired:
            logger.warning("gh --version timed out. Skipping PR transition.")
            return
        if gh_check.returncode != 0:
            return

        try:
            subprocess.run(["gh", "pr", "ready"], cwd=self.repo_path, capture_output=True, timeout=_GH_TIMEOUT_S)
        except subprocess.TimeoutExpired:
            logger.warning("gh pr ready timed out.")

        reviewers = self.config.get("default_reviewers", [])
        if reviewers:
            logger.info("Requesting urgent human reviews from: %s", reviewers)
            reviewer_args = []
            for r in reviewers:
                reviewer_args.extend(["--reviewer", r])
            try:
                subprocess.run(
                    ["gh", "pr", "edit"] + reviewer_args,
                    cwd=self.repo_path,
                    capture_output=True,
                    timeout=_GH_TIMEOUT_S,
                )
            except subprocess.TimeoutExpired:
                logger.warning("gh pr edit (reviewer assignment) timed out.")

        logger.info("Successfully transitioned outcome to 'Outcome as a Service' completion queue.")
