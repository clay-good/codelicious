from __future__ import annotations

import dataclasses
import json
import logging
import os
import re
import subprocess
import time as _time_mod
from pathlib import Path

from codelicious.errors import GitOperationError


@dataclasses.dataclass(frozen=True)
class PushResult:
    """Structured result from ``push_to_origin()`` (spec-27 Phase 0.4).

    Replaces the old ``bool`` return so callers can inspect *why* a push
    failed and act accordingly (e.g. don't retry auth failures).
    """

    success: bool
    error_type: str | None = None  # "auth", "conflict", "transient", "unknown", or None on success
    message: str = ""


@dataclasses.dataclass(frozen=True)
class CommitResult:
    """Result of ``commit_chunk()`` (spec-27 Phase 2.2).

    Contains the commit SHA on success so callers can reference it.
    """

    success: bool
    sha: str = ""  # Short commit SHA, empty on failure
    message: str = ""


# Stderr patterns used to classify push failures (spec-27 Phase 0.4).
_AUTH_FAILURE_PATTERNS: tuple[str, ...] = (
    "permission denied",
    "authentication failed",
    "could not read username",
    "invalid credentials",
    "authorization failed",
)

_CONFLICT_PATTERNS: tuple[str, ...] = (
    "rejected",
    "non-fast-forward",
    "fetch first",
    "failed to push some refs",
)

_TRANSIENT_PATTERNS: tuple[str, ...] = (
    "connection reset",
    "connection timed out",
    "could not resolve host",
    "ssl",
    "tls",
    "broken pipe",
    "network is unreachable",
    "connection refused",
    "502",
    "503",
    "504",
)


def _classify_push_error(stderr: str) -> str:
    """Classify a git push stderr message into an error category.

    Transient patterns are checked first so that messages like
    "fatal: unable to access ... Connection timed out" are correctly
    classified as transient rather than auth.
    """
    lower = stderr.lower()
    # Check transient FIRST — they overlap with auth patterns
    # (e.g. "fatal: unable to access ... Connection timed out")
    for pattern in _TRANSIENT_PATTERNS:
        if pattern in lower:
            return "transient"
    for pattern in _AUTH_FAILURE_PATTERNS:
        if pattern in lower:
            return "auth"
    for pattern in _CONFLICT_PATTERNS:
        if pattern in lower:
            return "conflict"
    return "unknown"


logger = logging.getLogger("codelicious.git")

# Maximum allowed size for .codelicious/config.json (Finding 32)
_CONFIG_MAX_BYTES: int = 100_000  # 100 KB

# Only these keys are accepted from config.json; unknown keys are stripped
# to prevent config injection attacks (Finding 32).
_ALLOWED_CONFIG_KEYS: frozenset[str] = frozenset(
    {
        "allowlisted_commands",
        "chunk_strategy",
        "default_engine",
        "default_reviewers",
        "max_calls_per_iteration",
        "max_commits_per_pr",
        "platform",
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
        self._platform: str | None = None  # Cached platform detection

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

    def verify_git_identity(self) -> None:
        """Check that git user.name and user.email are configured (spec-27 Phase 0.2).

        Checks local repo config first, then global config.  If either is
        unset after both checks, prints an actionable error and exits.
        Logs the identity that will be used for commits.
        """
        if not self._has_git():
            return

        def _get_config(key: str) -> str:
            """Try local then global git config for *key*."""
            # Local (repo-level) config
            try:
                value = self._run_cmd(["git", "config", "--local", key], check=False)
                if value:
                    return value
            except (OSError, RuntimeError):
                pass
            # Global fallback
            try:
                value = self._run_cmd(["git", "config", "--global", key], check=False)
                if value:
                    return value
            except (OSError, RuntimeError):
                pass
            return ""

        name = _get_config("user.name")
        email = _get_config("user.email")

        missing = []
        if not name:
            missing.append("user.name")
        if not email:
            missing.append("user.email")

        if missing:
            import sys

            keys = " and ".join(missing)
            print(
                f"Error: git {keys} not configured. Commits require an identity.\n"
                f"  Set them with:\n"
                f'    git config --global user.name "Your Name"\n'
                f'    git config --global user.email "you@example.com"',
                file=sys.stderr,
            )
            sys.exit(1)

        logger.info("Git identity: %s <%s>", name, email)

    def detect_platform(self) -> str:
        """Detect whether the repo's origin remote points to GitHub or GitLab (spec-27 Phase 5.2).

        Returns ``"github"``, ``"gitlab"``, or ``"unknown"``.  Caches the result.
        """
        if self._platform is not None:
            return self._platform

        try:
            result = subprocess.run(
                ["git", "remote", "get-url", "origin"],
                cwd=self.repo_path,
                capture_output=True,
                text=True,
                timeout=10,
            )
            if result.returncode == 0:
                url = result.stdout.strip().lower()
                if "gitlab" in url:
                    self._platform = "gitlab"
                elif "github" in url:
                    self._platform = "github"
                else:
                    self._platform = "unknown"
            else:
                self._platform = "unknown"
        except (subprocess.TimeoutExpired, OSError):
            self._platform = "unknown"

        return self._platform

    def _check_cli_auth(self) -> tuple[str, bool]:
        """Check whether the platform CLI (gh/glab) is authenticated (spec-27 Phase 5.1).

        Returns ``(cli_tool, authenticated)`` where ``cli_tool`` is ``"gh"``,
        ``"glab"``, or ``""`` if neither is available.
        """
        import shutil

        _TIMEOUT = 15
        platform = self.detect_platform()

        if platform == "gitlab":
            if shutil.which("glab") is None:
                logger.warning("GitLab remote detected but `glab` CLI not installed. Skipping MR operations.")
                return ("", False)
            try:
                result = subprocess.run(["glab", "auth", "status"], capture_output=True, text=True, timeout=_TIMEOUT)
                return ("glab", result.returncode == 0)
            except (subprocess.TimeoutExpired, OSError):
                return ("glab", False)

        # Default: GitHub
        if shutil.which("gh") is None:
            logger.warning("GitHub CLI (`gh`) not installed. Skipping PR operations.")
            return ("", False)
        try:
            result = subprocess.run(["gh", "auth", "status"], capture_output=True, text=True, timeout=_TIMEOUT)
            return ("gh", result.returncode == 0)
        except (subprocess.TimeoutExpired, OSError):
            return ("gh", False)

    @property
    def current_branch(self) -> str:
        """Return the current git branch name."""
        if not self._has_git():
            return "unknown"
        try:
            return self._run_cmd(["git", "branch", "--show-current"])
        except (OSError, RuntimeError):
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

    def push_to_origin(self) -> PushResult:
        """Push the current branch to origin if there are unpushed commits.

        Returns a ``PushResult`` with structured error information instead
        of a plain ``bool`` (spec-27 Phase 0.4).  Callers MUST inspect
        ``result.success`` and ``result.error_type``.

        Error classification:
        - ``"auth"``: credential / permission issue — do NOT retry.
        - ``"conflict"``: non-fast-forward — needs rebase, do NOT retry.
        - ``"transient"``: network / server glitch — retried automatically.
        - ``"unknown"``: unclassified failure.
        """
        if not self._has_git():
            return PushResult(success=False, error_type="unknown", message="Not a git repository.")

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
                return PushResult(success=True, message="Nothing to push.")

            logger.info("Pushing %s to origin.", current_branch)

            _PUSH_MAX_RETRIES = 3
            last_stderr = ""
            last_error_type = "unknown"

            for _push_attempt in range(_PUSH_MAX_RETRIES):
                push_result = subprocess.run(
                    ["git", "push", "--set-upstream", "origin", current_branch],
                    cwd=self.repo_path,
                    capture_output=True,
                    text=True,
                    timeout=120,
                )
                if push_result.returncode == 0:
                    return PushResult(success=True, message="Push succeeded.")

                last_stderr = push_result.stderr.strip()
                last_error_type = _classify_push_error(last_stderr)

                # Auth and conflict errors will never succeed on retry — fail fast
                if last_error_type == "auth":
                    logger.error(
                        "git push failed — authentication/permission error:\n%s\n"
                        "Fix: run `gh auth login` (GitHub) or `glab auth login` (GitLab) "
                        "and try again.",
                        last_stderr,
                    )
                    return PushResult(success=False, error_type="auth", message=last_stderr)

                if last_error_type == "conflict":
                    logger.error(
                        "git push rejected — remote has diverged:\n%s\nFix: run `git pull --rebase` and try again.",
                        last_stderr,
                    )
                    return PushResult(success=False, error_type="conflict", message=last_stderr)

                # Transient or unknown — retry with backoff
                if _push_attempt < _PUSH_MAX_RETRIES - 1:
                    _time_mod.sleep(5 * (_push_attempt + 1))
                    logger.warning(
                        "git push failed (attempt %d/%d, exit %d, type=%s): %s — retrying",
                        _push_attempt + 1,
                        _PUSH_MAX_RETRIES,
                        push_result.returncode,
                        last_error_type,
                        last_stderr,
                    )
                else:
                    logger.error(
                        "git push failed after %d attempts (exit %d, type=%s): %s",
                        _PUSH_MAX_RETRIES,
                        push_result.returncode,
                        last_error_type,
                        last_stderr,
                    )

            return PushResult(success=False, error_type=last_error_type, message=last_stderr)

        except Exception as e:
            logger.error("Push failed with exception: %s", e)
            return PushResult(success=False, error_type="unknown", message=str(e))

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
        return any(pattern in filename_lower for pattern in SENSITIVE_PATTERNS)

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
                err_str = str(commit_err).lower()
                # spec-27 Phase 0.3: GPG signing fallback — retry unsigned
                if "gpg failed" in err_str or "signing failed" in err_str:
                    logger.warning(
                        "GPG signing unavailable — committing unsigned. "
                        "Configure GPG signing or set `commit.gpgsign=false` to suppress this warning."
                    )
                    try:
                        self._run_cmd(["git", "commit", "--no-gpg-sign", "-m", commit_message])
                        logger.info("Committed changes (unsigned): %s", commit_message)
                    except RuntimeError as unsigned_err:
                        logger.error("Unsigned commit also failed: %s — unstaging changes.", unsigned_err)
                        try:
                            self._run_cmd(["git", "reset", "HEAD"])
                        except RuntimeError as reset_err:
                            logger.error("Failed to unstage after commit failure: %s", reset_err)
                        raise
                else:
                    # Non-GPG commit failure — unstage all staged changes so the working
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

    def ensure_draft_pr_exists(
        self,
        spec_id: str = "",
        spec_summary: str = "",
        part: int = 0,
        prev_pr_url: str = "",
        chunk_summaries: list[str] | None = None,
    ) -> int | None:
        """Ensure exactly one PR/MR exists for the current spec (spec-27 Phase 5).

        Supports both GitHub (``gh``) and GitLab (``glab``) by detecting the
        platform from the remote URL.  Uses ``gh auth status`` / ``glab auth
        status`` instead of just checking the binary version.

        Parameters
        ----------
        part:
            When > 0, this is a continuation PR (spec-27 Phase 2.3).
        prev_pr_url:
            URL of the previous part's PR (for linking in the body).
        chunk_summaries:
            Short descriptions of chunks included in this PR.

        Returns the PR/MR number on success, or ``None`` on failure / skip.
        """
        if not self._has_git():
            return None

        _TIMEOUT_S = 30

        # spec-27 Phase 5.1: validate auth, not just binary presence
        cli_tool, authenticated = self._check_cli_auth()
        if not cli_tool:
            logger.warning("No PR/MR CLI tool available. Skipping PR creation. Commits still work.")
            return None
        if not authenticated:
            logger.warning(
                "%s is installed but not authenticated. Run `%s auth login` to enable PR creation.",
                cli_tool,
                cli_tool,
            )
            return None

        platform = self.detect_platform()
        current_branch = self.current_branch
        if current_branch in self.forbidden_branches or current_branch == "unknown":
            logger.warning("Cannot create PR/MR from branch %s.", current_branch)
            return None

        # ── Search for existing PR/MR by spec-id title prefix ─────────
        if spec_id:
            prefix = f"[spec-{spec_id}]"
            existing = self._find_existing_pr(cli_tool, platform, prefix, current_branch, _TIMEOUT_S)
            if existing is not None:
                return existing
        else:
            existing = self._find_existing_pr_by_branch(cli_tool, platform, current_branch, _TIMEOUT_S)
            if existing is not None:
                return existing

        # ── No PR/MR exists — create one ──────────────────────────────
        logger.info("No PR/MR found for spec-%s on branch %s. Creating draft.", spec_id or "?", current_branch)

        if spec_id:
            title = f"[spec-{spec_id}] {spec_summary}".strip() if spec_summary else f"[spec-{spec_id}] {current_branch}"
        else:
            title = spec_summary or f"codelicious: {current_branch}"
        if part > 0:
            title = f"{title} (part {part})"
        title = title.replace("\n", " ").replace("\r", " ").replace("\x00", "")[:70]

        body = self._build_pr_body(spec_id, chunk_summaries, prev_pr_url)

        if platform == "gitlab":
            return self._create_gitlab_mr(cli_tool, title, body, _TIMEOUT_S)
        return self._create_github_pr(cli_tool, title, body, _TIMEOUT_S)

    def _build_pr_body(
        self,
        spec_id: str,
        chunk_summaries: list[str] | None,
        prev_pr_url: str,
    ) -> str:
        """Build the PR/MR body with spec link, chunk summary, and part links."""
        parts = [
            "## Summary\n",
            f"Autonomous implementation by Codelicious (spec-{spec_id}).\n",
        ]
        if chunk_summaries:
            parts.append("### Chunks in this PR\n")
            for cs in chunk_summaries[:50]:
                parts.append(f"- {cs}")
            parts.append("")
        if prev_pr_url:
            parts.append(f"**Previous part:** {prev_pr_url}\n")
        parts.append("This PR updates automatically as new commits are pushed.\n")
        parts.append("---\n*Built by [Codelicious](https://github.com/clay-good/codelicious)*")
        return "\n".join(parts)

    def _find_existing_pr(
        self, cli_tool: str, platform: str, prefix: str, current_branch: str, timeout: int
    ) -> int | None:
        """Search for an existing PR/MR by title prefix."""
        if platform == "gitlab":
            # glab's --output json includes source_branch; no extra flag needed.
            cmd = ["glab", "mr", "list", "--state", "opened", "--output", "json"]
        else:
            cmd = ["gh", "pr", "list", "--state", "open", "--json", "number,title,headRefName", "--limit", "100"]

        try:
            result = subprocess.run(cmd, cwd=self.repo_path, capture_output=True, text=True, timeout=timeout)
        except subprocess.TimeoutExpired:
            logger.warning("%s list timed out; skipping.", cli_tool)
            return None

        if result.returncode == 0 and result.stdout.strip() not in ("", "[]"):
            try:
                prs = json.loads(result.stdout)
                for pr in prs:
                    pr_title = pr.get("title", "")
                    if not pr_title.startswith(prefix):
                        continue
                    # An existing PR with the same spec-id prefix only counts as
                    # the one for THIS branch if its headRefName matches.
                    # Otherwise we'd return PR #1 (on auto-build) when called
                    # from a continuation branch, and the orchestrator would
                    # never open the part-N PR.
                    pr_head = pr.get("headRefName") or pr.get("source_branch") or ""
                    if pr_head and pr_head != current_branch:
                        continue
                    # GitLab uses "iid" for project-scoped MR numbers
                    pr_num = pr.get("number") or pr.get("iid")
                    if pr_num:
                        logger.info(
                            "PR/MR #%s already exists for %s on %s. Commits appended via push.",
                            pr_num,
                            prefix,
                            current_branch,
                        )
                        return int(pr_num)
            except (json.JSONDecodeError, ValueError, TypeError):
                pass
        return None

    def _find_existing_pr_by_branch(
        self, cli_tool: str, platform: str, current_branch: str, timeout: int
    ) -> int | None:
        """Search for an existing PR/MR by branch head (legacy path)."""
        if platform == "gitlab":
            cmd = ["glab", "mr", "list", "--source-branch", current_branch, "--state", "opened", "--output", "json"]
        else:
            cmd = [
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
            ]

        try:
            result = subprocess.run(cmd, cwd=self.repo_path, capture_output=True, text=True, timeout=timeout)
        except subprocess.TimeoutExpired:
            return None

        if result.returncode == 0 and result.stdout.strip() not in ("", "[]"):
            try:
                prs = json.loads(result.stdout)
                if prs:
                    pr_num = prs[0].get("number") or prs[0].get("iid")
                    if pr_num:
                        logger.info("PR/MR #%s exists for branch %s.", pr_num, current_branch)
                        return int(pr_num)
            except (json.JSONDecodeError, ValueError, TypeError):
                pass
        return None

    def _create_github_pr(self, cli_tool: str, title: str, body: str, timeout: int) -> int | None:
        """Create a draft GitHub PR."""
        try:
            result = subprocess.run(
                ["gh", "pr", "create", "--draft", "--title", title, "--body", body],
                cwd=self.repo_path,
                capture_output=True,
                text=True,
                timeout=timeout,
            )
        except subprocess.TimeoutExpired:
            logger.warning("gh pr create timed out.")
            return None

        if result.returncode == 0:
            pr_url = result.stdout.strip()
            logger.info("Created draft PR: %s", pr_url)
            try:
                return int(pr_url.rstrip("/").rsplit("/", 1)[-1])
            except (ValueError, IndexError):
                return None
        logger.warning("Failed to create PR: %s", result.stderr.strip())
        return None

    def _create_gitlab_mr(self, cli_tool: str, title: str, body: str, timeout: int) -> int | None:
        """Create a draft GitLab MR."""
        try:
            result = subprocess.run(
                ["glab", "mr", "create", "--draft", "--title", title, "--description", body, "--yes"],
                cwd=self.repo_path,
                capture_output=True,
                text=True,
                timeout=timeout,
            )
        except subprocess.TimeoutExpired:
            logger.warning("glab mr create timed out.")
            return None

        if result.returncode == 0:
            mr_url = result.stdout.strip()
            logger.info("Created draft MR: %s", mr_url)
            # glab outputs URL like https://gitlab.com/.../merge_requests/42
            try:
                return int(mr_url.rstrip("/").rsplit("/", 1)[-1])
            except (ValueError, IndexError):
                return None
        logger.warning("Failed to create MR: %s", result.stderr.strip())
        return None

    def transition_pr_to_review(self, spec_id: str = ""):
        """Transition a draft PR/MR to ready-for-review (spec-27 Phase 5.3).

        Steps:
        1. Final push to ensure all commits are on remote
        2. Mark PR/MR as ready (``gh pr ready`` / ``glab mr ready``)
        3. Assign reviewers if configured in ``.codelicious/config.json``

        Supports both GitHub and GitLab.  Reviewer assignment failures are
        logged as warnings but do not fail the build.
        """
        if not self._has_git():
            return

        _TIMEOUT_S = 30
        platform = self.detect_platform()

        # Step 1: Final push
        push = self.push_to_origin()
        if not push.success:
            logger.warning("Final push before PR transition failed: %s", push.message)

        cli_tool, authenticated = self._check_cli_auth()
        if not cli_tool or not authenticated:
            logger.warning("CLI tool not available or not authenticated. Skipping PR transition.")
            return

        logger.info("Transitioning PR/MR to ready-for-review.")

        # Find the PR/MR number by spec-id title prefix
        pr_number: str | None = None
        if spec_id:
            prefix = f"[spec-{spec_id}]"
            existing = self._find_existing_pr(cli_tool, platform, prefix, self.current_branch, _TIMEOUT_S)
            if existing is not None:
                pr_number = str(existing)

        # Step 2: Mark as ready
        try:
            if platform == "gitlab":
                ready_cmd = ["glab", "mr", "ready"]
            else:
                ready_cmd = ["gh", "pr", "ready"]
            if pr_number:
                ready_cmd.append(pr_number)
            subprocess.run(ready_cmd, cwd=self.repo_path, capture_output=True, timeout=_TIMEOUT_S)
            logger.info("PR/MR marked as ready for review.")
        except subprocess.TimeoutExpired:
            logger.warning("%s ready timed out.", cli_tool)

        # Step 3: Assign reviewers (failures are warnings, not errors — spec-27 Phase 5.3)
        reviewers = self.config.get("default_reviewers", [])
        if reviewers:
            logger.info("Requesting reviews from: %s", reviewers)
            _user_re = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9\-_.]{0,38}$")
            reviewer_args = []
            for r in reviewers:
                if not isinstance(r, str) or not _user_re.match(r):
                    logger.warning("Skipping invalid reviewer name: %r", r)
                    continue
                reviewer_args.extend(["--reviewer", r])

            if reviewer_args:
                if platform == "gitlab":
                    edit_cmd = ["glab", "mr", "update"]
                else:
                    edit_cmd = ["gh", "pr", "edit"]
                if pr_number:
                    edit_cmd.append(pr_number)
                edit_cmd.extend(reviewer_args)
                try:
                    result = subprocess.run(edit_cmd, cwd=self.repo_path, capture_output=True, timeout=_TIMEOUT_S)
                    if result.returncode != 0:
                        logger.warning("Reviewer assignment failed (non-fatal): %s", result.stderr.strip()[:200])
                except subprocess.TimeoutExpired:
                    logger.warning("Reviewer assignment timed out (non-fatal).")

        logger.info("PR/MR transition complete.")

    # ------------------------------------------------------------------
    # spec-27 Phase 2.2: Chunk-level commit discipline
    # ------------------------------------------------------------------

    def commit_chunk(self, chunk_id: str, chunk_title: str, files: list[str]) -> CommitResult:
        """Commit exactly one chunk's changes (spec-27 Phase 2.2).

        Stages only *files*, runs the sensitive-file check, and commits
        with a structured message.  Uses GPG fallback from Phase 0.3.

        Returns a ``CommitResult`` with the short SHA on success.
        """
        if not self._has_git():
            return CommitResult(success=False, message="Not a git repository.")

        # Build commit message
        subject = f"[{chunk_id}] {chunk_title}"
        subject = subject.replace("\x00", "").replace("\n", " ")
        if len(subject) > 200:
            subject = subject[:197] + "..."

        body_lines = [
            f"Chunk: {chunk_id}",
            f"Files: {', '.join(files[:20])}" + (" ..." if len(files) > 20 else ""),
        ]
        full_message = subject + "\n\n" + "\n".join(body_lines)

        try:
            # Stage only the specified files
            for filepath in files:
                if "\n" in filepath or "\r" in filepath:
                    raise GitOperationError(f"Filename contains newline character: {filepath!r}")
                try:
                    self._run_cmd(["git", "add", filepath])
                except RuntimeError as e:
                    logger.warning("Failed to stage file %s: %s", filepath, e)

            # Sensitive file check
            self._check_staged_files_for_sensitive_patterns()

            # Check if there's anything staged
            status = self._run_cmd(["git", "diff", "--cached", "--name-only"])
            if not status:
                logger.info("No changes staged for chunk %s. Skipping commit.", chunk_id)
                return CommitResult(success=True, sha="", message="Nothing to commit.")

            # Attempt commit with GPG fallback (Phase 0.3 pattern)
            try:
                self._run_cmd(["git", "commit", "-m", full_message])
            except RuntimeError as commit_err:
                err_str = str(commit_err).lower()
                if "gpg failed" in err_str or "signing failed" in err_str:
                    logger.warning("GPG signing unavailable for chunk %s — committing unsigned.", chunk_id)
                    self._run_cmd(["git", "commit", "--no-gpg-sign", "-m", full_message])
                else:
                    raise

            # Get the short SHA of the commit we just made
            sha = self._run_cmd(["git", "rev-parse", "--short", "HEAD"])
            logger.info("Committed chunk %s: %s (%s)", chunk_id, chunk_title, sha)
            return CommitResult(success=True, sha=sha, message=subject)

        except Exception as e:
            logger.error("Failed to commit chunk %s: %s", chunk_id, e)
            # Unstage to leave clean state
            try:
                self._run_cmd(["git", "reset", "HEAD"])
            except RuntimeError:
                pass
            return CommitResult(success=False, message=str(e))

    def get_pr_commit_count(self, pr_number: int) -> int:
        """Count commits on the current branch relative to the base (spec-27 Phase 2.2).

        Uses ``gh pr view`` to get the commit count for the given PR.
        Falls back to counting ``git log`` commits on the branch if ``gh``
        is unavailable.

        Returns 0 on any failure (safe default — won't trigger PR splits).
        """
        _GH_TIMEOUT_S = 30

        # Try gh first — most accurate for PR commit count
        try:
            result = subprocess.run(
                ["gh", "pr", "view", str(pr_number), "--json", "commits", "--jq", ".commits | length"],
                cwd=self.repo_path,
                capture_output=True,
                text=True,
                timeout=_GH_TIMEOUT_S,
            )
            if result.returncode == 0 and result.stdout.strip().isdigit():
                count = int(result.stdout.strip())
                logger.debug("PR #%d has %d commits.", pr_number, count)
                return count
        except (subprocess.TimeoutExpired, OSError):
            pass

        # Fallback: count log entries between merge-base and HEAD
        try:
            current = self._run_cmd(["git", "branch", "--show-current"])
            # Find merge-base with main/master
            for base in ("main", "master"):
                try:
                    merge_base = self._run_cmd(["git", "merge-base", base, "HEAD"])
                    log_output = self._run_cmd(
                        ["git", "log", "--oneline", f"{merge_base}..HEAD"],
                        timeout=15,
                    )
                    count = len(log_output.splitlines()) if log_output else 0
                    logger.debug("Branch %s has %d commits since %s.", current, count, base)
                    return count
                except RuntimeError:
                    continue
        except (RuntimeError, OSError):
            pass

        return 0

    def get_pr_diff_loc(self, pr_number: int) -> int:
        """Total lines changed (additions + deletions) on the current branch
        relative to its merge base with ``main`` or ``master`` (spec 28 Phase 2.1).

        Used as an advisory cap: when the cumulative diff grows past a
        threshold, the orchestrator splits the PR. ``pr_number`` is accepted
        for symmetry with :meth:`get_pr_commit_count` and future use; the
        current implementation operates on the local branch.

        Returns 0 on any failure — the cap is advisory and must never raise.
        """
        del pr_number  # accepted for API symmetry; not currently needed
        _DIFF_TIMEOUT_S = 30

        if not self._has_git():
            return 0

        merge_base = ""
        for base in ("main", "master"):
            try:
                merge_base = self._run_cmd(
                    ["git", "merge-base", base, "HEAD"],
                    timeout=_DIFF_TIMEOUT_S,
                )
                if merge_base:
                    break
            except RuntimeError:
                continue

        if not merge_base:
            logger.warning("get_pr_diff_loc: could not determine merge base; returning 0.")
            return 0

        try:
            shortstat = self._run_cmd(
                ["git", "diff", "--shortstat", f"{merge_base}..HEAD"],
                timeout=_DIFF_TIMEOUT_S,
            )
        except (RuntimeError, OSError) as e:
            logger.warning("get_pr_diff_loc: git diff failed (%s); returning 0.", e)
            return 0

        if not shortstat.strip():
            return 0

        # Parse output like: " 3 files changed, 42 insertions(+), 7 deletions(-)"
        total = 0
        for match in re.finditer(r"(\d+)\s+(insertion|deletion)", shortstat):
            try:
                total += int(match.group(1))
            except ValueError:
                continue
        logger.debug("PR diff LOC: %d (shortstat=%r)", total, shortstat.strip())
        return total

    def revert_chunk_changes(self) -> bool:
        """Discard all unstaged and staged changes in the working tree (spec-27 Phase 2.2).

        Used when a chunk's verification fails — reverts everything so
        the next chunk starts from a clean state.

        Returns True if the revert succeeded.
        """
        if not self._has_git():
            return False

        try:
            # Unstage everything
            self._run_cmd(["git", "reset", "HEAD"], check=False)
            # Discard working tree changes for tracked files
            self._run_cmd(["git", "checkout", "--", "."])
            # Remove untracked files created by the failed chunk
            self._run_cmd(["git", "clean", "-fd"], check=False)
            logger.info("Reverted working tree to last commit.")
            return True
        except Exception as e:
            logger.error("Failed to revert chunk changes: %s", e)
            return False

    def create_continuation_branch(self, spec_id: str, part: int) -> str:
        """Create a new branch for the next part of a split PR (spec-27 Phase 2.3).

        Returns the new branch name.
        """
        branch_name = f"codelicious/spec-{spec_id}-part-{part}"
        try:
            self._run_cmd(["git", "checkout", "-b", branch_name])
            logger.info("Created continuation branch: %s", branch_name)
        except RuntimeError:
            # Branch might already exist
            self._run_cmd(["git", "checkout", branch_name])
            logger.info("Checked out existing continuation branch: %s", branch_name)
        return branch_name
