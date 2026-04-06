from __future__ import annotations

import json
import logging
import os
import re
import subprocess
from pathlib import Path

from codelicious.errors import GitOperationError

logger = logging.getLogger("codelicious.git")

# Maximum allowed size for .codelicious/config.json (Finding 32)
_CONFIG_MAX_BYTES: int = 100_000  # 100 KB

# Only these keys are accepted from config.json; unknown keys are stripped
# to prevent config injection attacks (Finding 32).
_ALLOWED_CONFIG_KEYS: frozenset[str] = frozenset(
    {
        "allowlisted_commands",
        "default_reviewers",
        "max_calls_per_iteration",
        "verify_command",
    }
)

# Patterns that indicate potentially sensitive files
SENSITIVE_PATTERNS: frozenset[str] = frozenset(
    {
        ".env",
        ".pem",
        ".key",
        ".p12",
        ".pfx",
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
        "aws/credentials",
        "docker-config",
    }
)


def spec_branch_name(spec_path: Path | str) -> str:
    """Derive a deterministic branch name from a spec file path.

    Extracts the leading digits from the filename (the spec number) and
    returns ``codelicious/spec-{number}``.  For files without a leading
    number (e.g. ``ROADMAP.md``), returns ``codelicious/spec-{stem}``.

    Examples::

        spec_branch_name(Path("16_reliability_test_coverage_v1.md"))
        # → "codelicious/spec-16"

        spec_branch_name(Path("docs/specs/22_pr_dedup.md"))
        # → "codelicious/spec-22"

        spec_branch_name(Path("ROADMAP.md"))
        # → "codelicious/spec-ROADMAP"
    """
    p = Path(spec_path)
    m = re.match(r"^(\d+)", p.stem)
    if m:
        return f"codelicious/spec-{m.group(1)}"
    return f"codelicious/spec-{p.stem}"


class GitManager:
    """
    Deterministically handles all git branching, committing, and API PR/MR orchestration
    outside the LLM's control flow to guarantee safe isolation.
    """

    def __init__(self, repo_path: Path, spec_id: str | None = None):
        self.repo_path = repo_path
        self.spec_id = spec_id
        self.forbidden_branches = frozenset({"main", "master", "production", "develop", "release", "staging", "trunk"})

        # Load local configurations with size limit and schema validation
        # (Finding 32: config.json loaded without validation).
        config_path = self.repo_path / ".codelicious" / "config.json"

        self.config: dict = {}
        if config_path.exists():
            try:
                config_size = os.path.getsize(str(config_path))
                if config_size > _CONFIG_MAX_BYTES:
                    logger.error(
                        "config.json is too large (%d bytes > %d byte limit); skipping.",
                        config_size,
                        _CONFIG_MAX_BYTES,
                    )
                else:
                    raw_config = json.loads(config_path.read_text(encoding="utf-8"))
                    if not isinstance(raw_config, dict):
                        logger.error("config.json does not contain a JSON object; skipping.")
                    else:
                        # Strip unknown keys so malicious or unexpected entries are ignored
                        unknown_keys = set(raw_config.keys()) - _ALLOWED_CONFIG_KEYS
                        if unknown_keys:
                            logger.warning(
                                "config.json contains unknown keys %s; they will be ignored.",
                                sorted(unknown_keys),
                            )
                        self.config = {k: v for k, v in raw_config.items() if k in _ALLOWED_CONFIG_KEYS}
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
            # Only include binary and subcommand to avoid leaking secrets (Finding 36)
            safe_cmd = " ".join(args[:2])
            raise GitOperationError(f"Command {safe_cmd} timed out after {timeout}s") from exc
        if check and res.returncode != 0:
            safe_cmd = " ".join(args[:2])
            raise RuntimeError(f"Command {safe_cmd} failed: {res.stderr[:200]}")
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
            # Retry push up to 3 times with backoff for transient failures (Finding 22)
            _PUSH_MAX_RETRIES = 3
            for _push_attempt in range(_PUSH_MAX_RETRIES):
                push_result = subprocess.run(
                    ["git", "push", "--set-upstream", "origin", current_branch],
                    cwd=self.repo_path,
                    capture_output=True,
                    text=True,
                    timeout=120,
                )
                if push_result.returncode == 0:
                    return True
                if _push_attempt < _PUSH_MAX_RETRIES - 1:
                    import time as _time

                    _time.sleep(5 * (_push_attempt + 1))
                    logger.warning(
                        "git push failed (attempt %d/%d, exit %d): %s — retrying",
                        _push_attempt + 1,
                        _PUSH_MAX_RETRIES,
                        push_result.returncode,
                        push_result.stderr.strip()[:200],
                    )
                else:
                    logger.warning(
                        "git push failed after %d attempts (exit %d): %s",
                        _PUSH_MAX_RETRIES,
                        push_result.returncode,
                        push_result.stderr.strip()[:200],
                    )
            return False
        except Exception as e:
            logger.warning("Push failed: %s", e)
            return False

    def assert_safe_branch(self, spec_name: str = "", spec_id: str | None = None):
        """Ensures the agent never executes against main/master directly.

        If on a forbidden branch (main/master/production), checks out a
        deterministic feature branch.  The branch name is derived from:

        1. ``spec_id`` — if provided, uses ``spec_branch_name`` to produce
           ``codelicious/spec-{id}`` (new deterministic mapping).
        2. ``spec_name`` — legacy fallback via ``branch_for_spec``.
        3. Neither — falls back to ``codelicious/auto-build``.
        """
        if not self._has_git():
            logger.warning(
                "A .git folder was not found so no git orchestration will occur. USER: Please add a .git or change directory to build within a repository."
            )
            return

        # Allow instance-level spec_id to be overridden by the call-site
        effective_spec_id = spec_id or self.spec_id

        try:
            branch = self._run_cmd(["git", "branch", "--show-current"])
            if branch in self.forbidden_branches:
                if effective_spec_id:
                    feature_branch = f"codelicious/spec-{effective_spec_id}"
                else:
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

        Strips file extensions. When the spec_name includes a parent directory,
        it is included to prevent collisions between specs with the same filename
        in different directories (Finding 29).

        ``branch_for_spec("spec-v3.md")`` → ``"codelicious/spec-v3"``
        ``branch_for_spec("docs/specs/spec-v3.md")`` → ``"codelicious/specs-spec-v3"``
        """
        if not spec_name:
            return "codelicious/auto-build"
        p = Path(spec_name)
        stem = p.stem  # "spec-v3.md" → "spec-v3"
        # Include parent directory name to disambiguate specs with same filename
        parent_name = p.parent.name
        if parent_name and parent_name != ".":
            return f"codelicious/{parent_name}-{stem}"
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

    def _check_staged_files_for_sensitive_patterns(self) -> None:
        """Check staged files for sensitive patterns and abort if any are found.

        Raises:
            GitOperationError: If any staged file matches a sensitive pattern
                (S20-P1-2: hard abort instead of warning-only).
        """
        try:
            staged_output = self._run_cmd(["git", "diff", "--cached", "--name-only"])
            if staged_output:
                for filepath in staged_output.splitlines():
                    if self._is_sensitive_file(filepath):
                        raise GitOperationError(f"Refusing to commit sensitive file: {filepath}")
        except GitOperationError:
            raise
        except RuntimeError:
            pass

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

        Sensitive files (keys, .env, credentials, etc.) cause a hard abort —
        the commit is refused and a ``GitOperationError`` is raised (S20-P1-2).

        Args:
            commit_message: The commit message to use.
            files_to_stage: Optional list of specific file paths to stage.
                           If None or empty, uses ``git add -u`` to stage only
                           tracked files (S20-P1-2: never ``git add .``).

        Returns:
            True if the commit succeeded or there was nothing to commit.
            False if an error prevented the commit from completing.
        """
        if not self._has_git():
            return True

        try:
            # Stage files
            if files_to_stage:
                # Validate and stage only the specified files (S20-P2-1)
                for filepath in files_to_stage:
                    if "\n" in filepath or "\r" in filepath:
                        raise GitOperationError(f"Filename contains newline character: {filepath!r}")
                    try:
                        self._run_cmd(["git", "add", filepath])
                    except RuntimeError as e:
                        logger.warning("Failed to stage file %s: %s", filepath, e)
            else:
                # Stage only tracked files — never use 'git add .' which
                # would stage untracked secrets (S20-P1-2).
                self._run_cmd(["git", "add", "-u"])

            # Pre-commit safety check — abort if any sensitive file is staged.
            # Called exactly once after all staging is complete (S20-P2-7).
            self._check_staged_files_for_sensitive_patterns()

            # Check if there's anything to commit
            status = self._run_cmd(["git", "status", "--porcelain"])
            if not status:
                logger.info("Working directory clean. Nothing to commit.")
                return True

            # Sanitize commit message (Finding 38)
            commit_message = commit_message.replace("\x00", "")  # strip null bytes
            # Limit subject line to 500 chars
            if len(commit_message) > 500:
                commit_message = commit_message[:497] + "..."

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

    def ensure_draft_pr_exists(self, spec_id: str = "", spec_summary: str = "") -> int | None:
        """Ensure exactly one PR exists for the current spec.

        Searches ALL open PRs for a title starting with ``[spec-{spec_id}]``
        so that duplicate PRs are prevented even across different branches.

        When ``spec_id`` is empty, falls back to matching by the current
        branch name (legacy behavior).

        Returns the PR number on success, or ``None`` on failure / skip.
        """
        if not self._has_git():
            return None

        _GH_TIMEOUT_S = 30  # Max seconds for gh CLI calls (spec-22)

        # Check if gh CLI is installed
        try:
            gh_check = subprocess.run(["gh", "--version"], capture_output=True, timeout=_GH_TIMEOUT_S)
        except subprocess.TimeoutExpired:
            logger.warning("gh --version timed out. Skipping PR creation.")
            return None
        if gh_check.returncode != 0:
            logger.warning("GitHub CLI (`gh`) not found. Skipping PR creation.")
            return None

        current_branch = self.current_branch
        if current_branch in self.forbidden_branches or current_branch == "unknown":
            logger.warning("Cannot create PR from branch %s.", current_branch)
            return None

        # ── Search for existing PR by spec-id title prefix ────────────
        if spec_id:
            prefix = f"[spec-{spec_id}]"
            try:
                pr_list = subprocess.run(
                    ["gh", "pr", "list", "--state", "open", "--json", "number,title,headRefName", "--limit", "100"],
                    cwd=self.repo_path,
                    capture_output=True,
                    text=True,
                    timeout=_GH_TIMEOUT_S,
                )
            except subprocess.TimeoutExpired:
                logger.warning("gh pr list timed out; skipping PR creation.")
                return None

            if pr_list.returncode == 0 and pr_list.stdout.strip() not in ("", "[]"):
                try:
                    prs = json.loads(pr_list.stdout)
                    for pr in prs:
                        if pr.get("title", "").startswith(prefix):
                            pr_num = pr["number"]
                            logger.info(
                                "PR #%d already exists for spec-%s (%s). Commits appended via push.",
                                pr_num,
                                spec_id,
                                pr.get("headRefName", ""),
                            )
                            return pr_num
                except json.JSONDecodeError:
                    pass
        else:
            # Legacy path: check by branch head
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
                return None

            if pr_check.returncode == 0 and pr_check.stdout.strip() not in ("", "[]"):
                try:
                    prs = json.loads(pr_check.stdout)
                    if prs:
                        pr_num = prs[0].get("number")
                        logger.info(
                            "PR already exists for branch %s: #%s (state: %s). Commits appended via push.",
                            current_branch,
                            pr_num,
                            prs[0].get("state", ""),
                        )
                        return pr_num
                except json.JSONDecodeError:
                    pass

        # ── No PR exists — create one ─────────────────────────────────
        logger.info("No PR found for spec-%s on branch %s. Creating draft PR.", spec_id or "?", current_branch)
        if spec_id:
            title = f"[spec-{spec_id}] {spec_summary}".strip() if spec_summary else f"[spec-{spec_id}] {current_branch}"
        else:
            title = spec_summary or f"codelicious: {current_branch}"
        # Sanitize PR title (Finding 39)
        title = title.replace("\n", " ").replace("\r", " ").replace("\x00", "")
        title = title[:70]  # Keep PR titles concise
        body = (
            f"## Summary\n\n"
            f"Autonomous implementation by Codelicious (spec-{spec_id}).\n\n"
            f"This PR updates automatically as new commits are pushed.\n\n"
            f"---\n*Built by [Codelicious](https://github.com/clay-good/codelicious)*"
        )

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
            return None

        if result.returncode == 0:
            pr_url = result.stdout.strip()
            logger.info("Created draft PR: %s", pr_url)
            # Extract PR number from URL (format: .../pull/123)
            try:
                return int(pr_url.rstrip("/").rsplit("/", 1)[-1])
            except (ValueError, IndexError):
                return None
        else:
            logger.warning("Failed to create PR: %s", result.stderr.strip())
            return None

    def transition_pr_to_review(self, spec_id: str = ""):
        """Transition a draft PR to ready-for-review.

        When ``spec_id`` is provided, finds the PR by ``[spec-{id}]`` title
        prefix and marks that specific PR as ready.  Otherwise falls back to
        ``gh pr ready`` on the current branch (legacy behavior).

        Also requests configured reviewers if ``default_reviewers`` is set
        in ``.codelicious/config.json``.
        """
        if not self._has_git():
            return

        _GH_TIMEOUT_S = 30  # Max seconds for gh CLI calls (spec-22)

        logger.info("Loop Completed. Transitioning Pull Request from Draft to Active.")

        try:
            gh_check = subprocess.run(["gh", "--version"], capture_output=True, timeout=_GH_TIMEOUT_S)
        except subprocess.TimeoutExpired:
            logger.warning("gh --version timed out. Skipping PR transition.")
            return
        if gh_check.returncode != 0:
            return

        # Find the PR number by spec-id title prefix (spec-22 Phase 4)
        pr_number: str | None = None
        if spec_id:
            prefix = f"[spec-{spec_id}]"
            try:
                pr_list = subprocess.run(
                    ["gh", "pr", "list", "--state", "open", "--json", "number,title", "--limit", "100"],
                    cwd=self.repo_path,
                    capture_output=True,
                    text=True,
                    timeout=_GH_TIMEOUT_S,
                )
                if pr_list.returncode == 0:
                    try:
                        prs = json.loads(pr_list.stdout)
                        for pr in prs:
                            if pr.get("title", "").startswith(prefix):
                                pr_number = str(pr["number"])
                                break
                    except json.JSONDecodeError:
                        pass
            except subprocess.TimeoutExpired:
                logger.warning("gh pr list timed out during transition.")

        try:
            ready_cmd = ["gh", "pr", "ready"]
            if pr_number:
                ready_cmd.append(pr_number)
            subprocess.run(ready_cmd, cwd=self.repo_path, capture_output=True, timeout=_GH_TIMEOUT_S)
        except subprocess.TimeoutExpired:
            logger.warning("gh pr ready timed out.")

        reviewers = self.config.get("default_reviewers", [])
        if reviewers:
            logger.info("Requesting urgent human reviews from: %s", reviewers)
            _gh_user_re = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$")
            reviewer_args = []
            for r in reviewers:
                if not isinstance(r, str) or not _gh_user_re.match(r):
                    logger.warning("Skipping invalid reviewer name: %r", r)
                    continue
                reviewer_args.extend(["--reviewer", r])
            edit_cmd = ["gh", "pr", "edit"]
            if pr_number:
                edit_cmd.append(pr_number)
            edit_cmd.extend(reviewer_args)
            try:
                subprocess.run(
                    edit_cmd,
                    cwd=self.repo_path,
                    capture_output=True,
                    timeout=_GH_TIMEOUT_S,
                )
            except subprocess.TimeoutExpired:
                logger.warning("gh pr edit (reviewer assignment) timed out.")

        logger.info("Successfully transitioned outcome to 'Outcome as a Service' completion queue.")
