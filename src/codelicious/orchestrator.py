"""Phase-based orchestrator for parallel agent workflows.

This module implements the conflict-free parallelization strategy:

    Phase 1: BUILD   — one builder per spec, each in an isolated git worktree
    Phase 2: MERGE   — deterministic serial merge of worktree branches
    Phase 3: REVIEW  — N read-only reviewer agents in parallel (security, QA, perf, …)
    Phase 4: FIX     — single fixer agent applies triaged findings serially

The key invariant: **two writers never touch the same working tree at the
same time**.  Builders get worktree isolation.  Reviewers are read-only.
The fixer is the only writer during Phase 4.

Usage from the engine::

    orch = Orchestrator(repo_path, git_manager, config)
    result = orch.run(specs=[...], reviewers=["security", "qa", "performance"])
"""

from __future__ import annotations

import concurrent.futures
import json
import logging
import pathlib
import re
import subprocess
import sys
import threading
import time
from dataclasses import dataclass, field

logger = logging.getLogger("codelicious.orchestrator")

__all__ = [
    "REVIEWER_PROMPTS",
    "Finding",
    "Orchestrator",
    "OrchestratorResult",
    "ReviewRole",
    "V2Orchestrator",
]


# ---------------------------------------------------------------------------
# Reviewer roles and prompts
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ReviewRole:
    """A named reviewer role with a system prompt."""

    name: str
    prompt: str


REVIEWER_PROMPTS: dict[str, str] = {
    "security": """\
You are a **security engineer** reviewing {{project_name}}.

GUARDRAILS: Do NOT modify any files. Read only.

Perform a thorough security audit:
- OWASP Top 10 vulnerabilities (injection, XSS, SSRF, IDOR, etc.)
- Hardcoded secrets, API keys, tokens in source code
- Unsafe deserialization, eval(), exec(), shell=True
- Path traversal, symlink attacks, TOCTOU races
- Authentication and authorization gaps
- Cryptographic misuse (weak algorithms, hardcoded IVs)

For every finding:
- Cite the exact file path and line number
- Rate severity: P1 (critical), P2 (important), P3 (minor)
- Describe the attack scenario
- Suggest the fix

Write ALL findings as JSON to `.codelicious/review_security.json`:
```json
[{"severity": "P1", "file": "src/foo.py", "line": 42, "title": "...", "description": "...", "fix": "..."}]
```

""",
    "qa": """\
You are a **QA engineer** reviewing {{project_name}}.

GUARDRAILS: Do NOT modify any files. Read only.

Run the full test suite and analyze coverage:
- Identify untested code paths and edge cases
- Check for flaky tests (non-deterministic, order-dependent)
- Verify error handling paths are tested
- Look for missing boundary condition tests
- Check that test assertions are meaningful (not just "assert True")
- Verify mocks match real interfaces

For every finding, cite file:line and severity (P1/P2/P3).

Write ALL findings as JSON to `.codelicious/review_qa.json`:
```json
[{"severity": "P2", "file": "tests/test_foo.py", "line": 10, "title": "...", "description": "...", "fix": "..."}]
```

""",
    "performance": """\
You are a **performance engineer** reviewing {{project_name}}.

GUARDRAILS: Do NOT modify any files. Read only.

Analyze for performance issues:
- O(n^2) or worse algorithms where O(n) would work
- Unnecessary memory allocations or copies
- Missing caching opportunities
- Unbounded data structures (lists that grow without limit)
- Regex catastrophic backtracking (ReDoS)
- Blocking I/O in hot paths
- N+1 query patterns

For every finding, cite file:line and severity (P1/P2/P3).

Write ALL findings as JSON to `.codelicious/review_performance.json`:
```json
[{"severity": "P2", "file": "src/foo.py", "line": 99, "title": "...", "description": "...", "fix": "..."}]
```

""",
    "reliability": """\
You are a **reliability engineer** reviewing {{project_name}}.

GUARDRAILS: Do NOT modify any files. Read only.

Analyze for reliability issues:
- Race conditions and thread safety problems
- Resource leaks (file handles, connections, threads)
- Missing timeouts on I/O operations
- Unhandled exceptions that crash the process
- Missing retry logic for transient failures
- Deadlock potential in concurrent code
- State corruption from partial failures

For every finding, cite file:line and severity (P1/P2/P3).

Write ALL findings as JSON to `.codelicious/review_reliability.json`:
```json
[{"severity": "P1", "file": "src/foo.py", "line": 55, "title": "...", "description": "...", "fix": "..."}]
```

""",
}


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------


@dataclass
class Finding:
    """A single finding from a reviewer agent."""

    role: str
    severity: str  # P1, P2, P3
    file: str
    line: int
    title: str
    description: str
    fix: str

    def to_dict(self) -> dict:
        return {
            "role": self.role,
            "severity": self.severity,
            "file": self.file,
            "line": self.line,
            "title": self.title,
            "description": self.description,
            "fix": self.fix,
        }


@dataclass
class OrchestratorResult:
    """Result from a full orchestrator run."""

    success: bool
    message: str = ""
    findings: list[Finding] = field(default_factory=list)
    elapsed_s: float = 0.0
    cycles_completed: int = 0


# ---------------------------------------------------------------------------
# Worktree helpers
# ---------------------------------------------------------------------------

_WORKTREE_TIMEOUT_S: int = 120  # Max seconds for worktree subprocess operations
_MERGE_ABORT_TIMEOUT_S: int = 30  # Max seconds for git merge --abort


def _create_worktree(repo_path: pathlib.Path, branch_name: str) -> pathlib.Path:
    """Create a git worktree for isolated building.

    Returns the path to the new worktree directory.
    """
    # Sanitize branch_name to prevent path traversal (Finding 30)
    safe_branch = re.sub(r"[^a-zA-Z0-9_\-/]", "_", branch_name)
    safe_branch = safe_branch.replace("..", "_")
    worktree_dir = repo_path / ".codelicious" / "worktrees" / safe_branch
    worktrees_root = (repo_path / ".codelicious" / "worktrees").resolve()
    if not worktree_dir.resolve().is_relative_to(worktrees_root):
        raise RuntimeError(f"Worktree path escapes allowed directory: {branch_name}")
    worktree_dir.parent.mkdir(parents=True, exist_ok=True)

    # Clean up stale worktree if it exists
    if worktree_dir.exists():
        try:
            subprocess.run(
                ["git", "worktree", "remove", "--force", str(worktree_dir)],
                cwd=str(repo_path),
                capture_output=True,
                timeout=_WORKTREE_TIMEOUT_S,
            )
        except subprocess.TimeoutExpired:
            logger.warning("Timed out removing stale worktree %s; proceeding anyway.", worktree_dir)

    # Create the worktree with a new branch
    try:
        result = subprocess.run(
            ["git", "worktree", "add", "-b", safe_branch, str(worktree_dir)],
            cwd=str(repo_path),
            capture_output=True,
            text=True,
            timeout=_WORKTREE_TIMEOUT_S,
        )
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f"Timed out creating worktree for branch {branch_name}") from exc

    if result.returncode != 0:
        # Branch might already exist — try without -b
        try:
            result = subprocess.run(
                ["git", "worktree", "add", str(worktree_dir), safe_branch],
                cwd=str(repo_path),
                capture_output=True,
                text=True,
                timeout=_WORKTREE_TIMEOUT_S,
            )
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError(f"Timed out creating worktree (fallback) for branch {branch_name}") from exc
        if result.returncode != 0:
            raise RuntimeError(f"Failed to create worktree: {result.stderr}")

    logger.info("Created worktree at %s (branch: %s)", worktree_dir, branch_name)
    return worktree_dir


def _remove_worktree(repo_path: pathlib.Path, worktree_dir: pathlib.Path) -> None:
    """Remove a git worktree."""
    try:
        subprocess.run(
            ["git", "worktree", "remove", "--force", str(worktree_dir)],
            cwd=str(repo_path),
            capture_output=True,
            timeout=_WORKTREE_TIMEOUT_S,
        )
    except subprocess.TimeoutExpired:
        logger.warning("Timed out removing worktree %s; it may need manual cleanup.", worktree_dir)
        return
    logger.info("Removed worktree: %s", worktree_dir)


def _commit_worktree_changes(worktree_dir: pathlib.Path, spec_name: str) -> bool:
    """Stage and commit all changes in a worktree.

    The build agent is forbidden from running git commands, so the
    orchestrator must commit changes on the agent's behalf before the
    worktree is removed.  Without this commit, changes would be lost.

    Excludes ``.codelicious/`` from the commit to prevent merge conflicts
    when multiple worktrees modify STATE.md or BUILD_COMPLETE.

    Attempts a GPG-signed commit first. Falls back to ``--no-gpg-sign``
    only when GPG-related errors are detected in stderr (e.g. no GPG agent
    is available in the worktree environment).

    Returns True if a commit was created, False if the worktree was clean.
    """
    # Stage everything EXCEPT .codelicious/ (which causes merge conflicts)
    try:
        subprocess.run(
            ["git", "add", "--all", "--", ".", ":!.codelicious/"],
            cwd=str(worktree_dir),
            capture_output=True,
            timeout=_WORKTREE_TIMEOUT_S,
        )
    except subprocess.TimeoutExpired:
        logger.warning("Timed out staging changes in worktree %s.", worktree_dir)
        return False

    # Check if there's anything staged
    try:
        status = subprocess.run(
            ["git", "diff", "--cached", "--quiet"],
            cwd=str(worktree_dir),
            capture_output=True,
            timeout=_WORKTREE_TIMEOUT_S,
        )
    except subprocess.TimeoutExpired:
        logger.warning("Timed out checking staged diff in worktree %s.", worktree_dir)
        return False

    if status.returncode == 0:
        logger.debug("Worktree %s has no staged changes — nothing to commit.", worktree_dir)
        return False

    # Try a signed commit first (Finding 42: honour GPG signing policy)
    try:
        result = subprocess.run(
            ["git", "commit", "-m", f"codelicious: build {spec_name}"],
            cwd=str(worktree_dir),
            capture_output=True,
            text=True,
            timeout=_WORKTREE_TIMEOUT_S,
        )
    except subprocess.TimeoutExpired:
        logger.warning("Timed out committing worktree changes for %s.", spec_name)
        return False

    if result.returncode != 0:
        stderr_lower = result.stderr.lower()
        gpg_related = any(kw in stderr_lower for kw in ("gpg", "signing", "sign", "secret key"))
        if gpg_related:
            logger.warning(
                "GPG signing unavailable in worktree (no GPG agent); falling back to unsigned commit. stderr: %s",
                result.stderr.strip(),
            )
            try:
                result = subprocess.run(
                    ["git", "commit", "--no-gpg-sign", "-m", f"codelicious: build {spec_name}"],
                    cwd=str(worktree_dir),
                    capture_output=True,
                    text=True,
                    timeout=_WORKTREE_TIMEOUT_S,
                )
            except subprocess.TimeoutExpired:
                logger.warning("Timed out committing (unsigned) worktree changes for %s.", spec_name)
                return False
        if result.returncode != 0:
            logger.warning("Failed to commit worktree changes: %s", result.stderr.strip())
            return False

    logger.info("Committed agent changes in worktree for %s", spec_name)
    return True


def _abort_merge(repo_path: pathlib.Path) -> None:
    """Abort an in-progress git merge, with timeout and error handling."""
    try:
        abort_result = subprocess.run(
            ["git", "merge", "--abort"],
            cwd=str(repo_path),
            capture_output=True,
            text=True,
            timeout=_MERGE_ABORT_TIMEOUT_S,
        )
        if abort_result.returncode != 0:
            logger.critical(
                "git merge --abort failed (exit %d): %s",
                abort_result.returncode,
                abort_result.stderr.strip(),
            )
        else:
            logger.info("Merge aborted successfully.")
    except subprocess.TimeoutExpired:
        logger.critical(
            "git merge --abort timed out after %ds — repository may be in a dirty state.",
            _MERGE_ABORT_TIMEOUT_S,
        )


def _merge_worktree_branch(repo_path: pathlib.Path, branch_name: str) -> bool:
    """Merge a worktree branch back into the current branch.

    Returns True on success, False on merge conflict or timeout.
    """
    try:
        result = subprocess.run(
            ["git", "merge", "--no-ff", "-m", f"codelicious: merge {branch_name}", branch_name],
            cwd=str(repo_path),
            capture_output=True,
            text=True,
            timeout=_WORKTREE_TIMEOUT_S,
        )
    except subprocess.TimeoutExpired:
        logger.error("Timed out merging branch %s; attempting abort.", branch_name)
        _abort_merge(repo_path)
        return False

    if result.returncode != 0:
        logger.error("Merge conflict for branch %s: %s", branch_name, result.stderr)
        # Abort the merge to leave repo in clean state
        _abort_merge(repo_path)
        return False

    logger.info("Merged branch %s successfully.", branch_name)
    return True


def _delete_branch(repo_path: pathlib.Path, branch_name: str) -> None:
    """Delete a local branch after merge."""
    try:
        result = subprocess.run(
            ["git", "branch", "-d", branch_name],
            cwd=str(repo_path),
            capture_output=True,
            text=True,
            timeout=_WORKTREE_TIMEOUT_S,
        )
    except subprocess.TimeoutExpired:
        logger.warning("Timed out deleting branch %s.", branch_name)
        return
    if result.returncode != 0:
        logger.warning("Failed to delete branch %s: %s", branch_name, result.stderr.strip())


# ---------------------------------------------------------------------------
# Review output parsing
# ---------------------------------------------------------------------------


def _collect_review_findings(repo_path: pathlib.Path, role: str) -> list[Finding]:
    """Read the JSON findings file written by a reviewer agent."""
    review_file = repo_path / ".codelicious" / f"review_{role}.json"
    if not review_file.is_file():
        logger.debug("No review file for role %s", role)
        return []

    try:
        data = json.loads(review_file.read_text(encoding="utf-8"))
        if not isinstance(data, list):
            logger.warning("Review file for %s is not a JSON array", role)
            return []
        findings = []
        for item in data:
            if isinstance(item, dict):
                findings.append(
                    Finding(
                        role=role,
                        severity=item.get("severity", "P3"),
                        file=item.get("file", ""),
                        line=item.get("line", 0),
                        title=item.get("title", ""),
                        description=item.get("description", ""),
                        fix=item.get("fix", ""),
                    )
                )
        return findings
    except (json.JSONDecodeError, OSError) as e:
        logger.warning("Failed to parse review findings for %s: %s", role, e)
        return []


def _triage_findings(findings: list[Finding]) -> list[Finding]:
    """Sort findings by severity (P1 first) and deduplicate by file+line."""
    severity_order = {"P1": 0, "P2": 1, "P3": 2}
    seen: set[tuple[str, int]] = set()
    deduped: list[Finding] = []
    for f in sorted(findings, key=lambda f: severity_order.get(f.severity, 9)):
        key = (f.file, f.line)
        if key not in seen:
            seen.add(key)
            deduped.append(f)
    return deduped


# ---------------------------------------------------------------------------
# Fix prompt generation
# ---------------------------------------------------------------------------

_FIX_PROMPT_TEMPLATE: str = """\
You are fixing issues in {{project_name}} identified by automated review.

## CRITICAL: Do NOT run git or gh commands

The codelicious orchestrator manages all git and GitHub operations.
You MUST NOT run git add, git commit, git push, gh pr create, or any
other git/gh commands. The orchestrator will commit your changes.

## Triaged Findings (ordered by severity)

{{findings_text}}

## Instructions

Fix the findings above, starting with P1 (most critical).
For each fix:
1. Read the file cited in the finding
2. Apply the suggested fix (or a better one if you see one)
3. Run tests after each fix to ensure no regressions

When all fixable findings are addressed, run /verify-all.
Then write "DONE" to .codelicious/BUILD_COMPLETE
"""


def _render_fix_prompt(project_name: str, findings: list[Finding]) -> str:
    """Render the fix prompt with the triaged findings."""
    lines = []
    for i, f in enumerate(findings, 1):
        lines.append(
            f"{i}. **[{f.severity}]** `{f.file}:{f.line}` — {f.title}\n"
            f"   {f.description}\n"
            f"   **Fix:** {f.fix}\n"
            f"   _(from: {f.role} reviewer)_\n"
        )
    findings_text = "\n".join(lines) if lines else "No findings to fix."

    result = _FIX_PROMPT_TEMPLATE
    result = result.replace("{{project_name}}", project_name)
    result = result.replace("{{findings_text}}", findings_text)
    return result


# ---------------------------------------------------------------------------
# Orchestrator
# ---------------------------------------------------------------------------


class Orchestrator:
    """Phase-based orchestrator for parallel agent workflows.

    Usage::

        orch = Orchestrator(repo_path, git_manager, agent_config)
        result = orch.run(
            specs=[Path("spec-17.md"), Path("spec-18.md")],
            reviewers=["security", "qa", "performance"],
        )
    """

    def __init__(
        self,
        repo_path: pathlib.Path,
        git_manager: object,
        config: object,
    ) -> None:
        self.repo_path = pathlib.Path(repo_path).resolve()
        self.git_manager = git_manager
        self.config = config
        self.project_name = self.repo_path.name

    def _run_agent(self, prompt: str, project_root: pathlib.Path, session_id: str = "") -> object:
        """Run a Claude agent, returning the AgentResult."""
        from codelicious.agent_runner import run_agent

        return run_agent(
            prompt=prompt,
            project_root=project_root,
            config=self.config,
            tee_to=sys.stdout,
            resume_session_id=session_id,
        )

    # ------------------------------------------------------------------
    # Phase 1: BUILD (parallel, isolated worktrees)
    # ------------------------------------------------------------------

    def _build_spec_in_worktree(self, spec_path: pathlib.Path) -> tuple[str, bool]:
        """Build a single spec in an isolated git worktree.

        The agent is instructed to build ALL unchecked tasks in the
        assigned spec file, not just one.

        Returns (branch_name, success).
        """
        from codelicious.git.git_orchestrator import spec_branch_name
        from codelicious.prompts import AGENT_BUILD_SPEC, render

        branch_name = spec_branch_name(spec_path.name)
        worktree_dir: pathlib.Path | None = None

        try:
            worktree_dir = _create_worktree(self.repo_path, branch_name)

            # Resolve spec_path relative to the worktree so the agent
            # sees the correct file path in its working directory.
            try:
                rel = spec_path.relative_to(self.repo_path)
            except ValueError:
                # spec_path is not under repo_path — use just the filename
                # to avoid joining an absolute path (which discards the left operand)
                rel = pathlib.Path(spec_path.name)
                logger.warning(
                    "Spec %s is not under repo %s — using filename only.",
                    spec_path,
                    self.repo_path,
                )
            spec_in_worktree = worktree_dir / rel

            if not spec_in_worktree.is_file():
                logger.warning(
                    "Spec file %s not found in worktree %s. Agent will search for specs automatically.",
                    spec_in_worktree,
                    worktree_dir,
                )
                # Fall back to telling the agent to find the spec itself
                spec_filter_str = (
                    f"File not found at {spec_in_worktree}. Look for a spec file named '{spec_path.name}' in the repo."
                )
            else:
                spec_filter_str = str(spec_in_worktree)

            build_prompt = render(
                AGENT_BUILD_SPEC,
                project_name=self.project_name,
                spec_filter=spec_filter_str,
            )

            result = self._run_agent(build_prompt, worktree_dir)

            # Don't trust result.success alone — it only reflects subprocess
            # exit code (0 = success).  Check BUILD_COMPLETE in the worktree
            # to verify the agent actually finished building.
            from codelicious.prompts import check_build_complete

            agent_done = check_build_complete(worktree_dir)
            success = result.success and agent_done

            logger.info(
                "Build for %s complete: process_ok=%s, build_complete=%s",
                spec_path.name,
                result.success,
                agent_done,
            )

            # Commit the agent's changes in the worktree so they survive
            # worktree removal and can be merged back.  Agents are forbidden
            # from running git commands — the orchestrator owns all git ops.
            commit_ok = _commit_worktree_changes(worktree_dir, spec_path.name)

            # If the build succeeded but we couldn't commit its changes, mark the
            # overall result as failed and preserve the worktree so the changes are
            # not silently discarded.  The caller will see success=False and can
            # investigate the worktree directory for manual recovery.
            if not commit_ok and success:
                logger.error(
                    "Build for %s succeeded but committing worktree changes failed. "
                    "Preserving worktree at %s to prevent data loss.",
                    spec_path.name,
                    worktree_dir,
                )
                success = False
                # Signal the finally block to skip removal by clearing worktree_dir
                worktree_dir = None

            return branch_name, success

        except Exception as e:
            logger.error("Build for %s failed: %s", spec_path.name, e)
            return branch_name, False

        finally:
            if worktree_dir is not None:
                try:
                    _remove_worktree(self.repo_path, worktree_dir)
                except Exception as e:
                    logger.warning("Failed to clean up worktree %s: %s", worktree_dir, e)

    def _phase_build(
        self,
        specs: list[pathlib.Path],
        max_workers: int,
    ) -> list[tuple[str, bool]]:
        """Phase 1: Build specs in parallel worktrees.

        Returns list of (branch_name, success) tuples.
        """
        from codelicious.git.git_orchestrator import spec_branch_name

        if not specs:
            return []

        workers = min(max_workers, len(specs))
        logger.info(
            "PHASE 1 BUILD: %d specs across %d workers",
            len(specs),
            workers,
        )

        results: list[tuple[str, bool]] = []
        completed_count = 0
        count_lock = threading.Lock()

        def _log_spec_progress(spec: pathlib.Path, branch: str, ok: bool) -> None:
            nonlocal completed_count
            with count_lock:
                completed_count += 1
                count = completed_count
            status = "OK" if ok else "FAILED"
            logger.info(
                "  [%d/%d] %s — %s (branch: %s)",
                count,
                len(specs),
                spec.name,
                status,
                branch,
            )

        if workers <= 1:
            # Serial fallback
            for spec in specs:
                logger.info("  Building spec: %s ...", spec.name)
                branch, ok = self._build_spec_in_worktree(spec)
                _log_spec_progress(spec, branch, ok)
                results.append((branch, ok))
        else:
            with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
                futures = {pool.submit(self._build_spec_in_worktree, spec): spec for spec in specs}
                for spec in specs:
                    logger.info("  Queued spec: %s", spec.name)
                try:
                    for future in concurrent.futures.as_completed(futures):
                        spec = futures[future]
                        try:
                            branch, ok = future.result()
                            _log_spec_progress(spec, branch, ok)
                            results.append((branch, ok))
                        except Exception as e:
                            branch = spec_branch_name(spec.name)
                            with count_lock:
                                completed_count += 1
                                count = completed_count
                            logger.error(
                                "  [%d/%d] %s — ERROR: %s",
                                count,
                                len(specs),
                                spec.name,
                                e,
                            )
                            results.append((branch, False))
                except KeyboardInterrupt:
                    logger.warning("KeyboardInterrupt received — cancelling pending build futures.")
                    for f in futures:
                        f.cancel()
                    pool.shutdown(wait=False, cancel_futures=True)
                    raise

        return results

    # ------------------------------------------------------------------
    # Phase 2: MERGE (serial, deterministic)
    # ------------------------------------------------------------------

    def _phase_merge(self, build_results: list[tuple[str, bool]]) -> int:
        """Phase 2: Merge successful build branches back.

        Returns the number of successfully merged branches.
        """
        successful = [(branch, ok) for branch, ok in build_results if ok]
        if not successful:
            logger.warning("PHASE 2 MERGE: no successful builds to merge.")
            return 0

        logger.info("PHASE 2 MERGE: merging %d branches", len(successful))
        merged = 0

        for branch_name, _ in successful:
            if _merge_worktree_branch(self.repo_path, branch_name):
                _delete_branch(self.repo_path, branch_name)
                merged += 1
            else:
                logger.warning(
                    "Skipping branch %s due to merge conflict. Manual resolution required.",
                    branch_name,
                )

        return merged

    # ------------------------------------------------------------------
    # Phase 3: REVIEW (parallel, read-only)
    # ------------------------------------------------------------------

    def _run_reviewer(self, role: str) -> list[Finding]:
        """Run a single reviewer agent (read-only) and collect findings."""
        from codelicious.prompts import render

        prompt_template = REVIEWER_PROMPTS.get(role)
        if not prompt_template:
            logger.warning("Unknown reviewer role: %s", role)
            return []

        prompt = render(prompt_template, project_name=self.project_name)

        try:
            self._run_agent(prompt, self.repo_path)
        except Exception as e:
            logger.warning("Reviewer %s failed: %s", role, e)

        return _collect_review_findings(self.repo_path, role)

    def _phase_review(
        self,
        roles: list[str],
        max_workers: int,
    ) -> list[Finding]:
        """Phase 3: Run read-only reviewers in parallel.

        Returns all collected findings.
        """
        if not roles:
            return []

        workers = min(max_workers, len(roles))
        logger.info(
            "PHASE 3 REVIEW: %d reviewers across %d workers: %s",
            len(roles),
            workers,
            roles,
        )

        all_findings: list[Finding] = []

        if workers <= 1:
            for role in roles:
                all_findings.extend(self._run_reviewer(role))
        else:
            with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
                futures = {pool.submit(self._run_reviewer, role): role for role in roles}
                try:
                    for future in concurrent.futures.as_completed(futures):
                        role = futures[future]
                        try:
                            all_findings.extend(future.result())
                        except Exception as e:
                            logger.error("Reviewer %s raised: %s", role, e)
                except KeyboardInterrupt:
                    logger.warning("KeyboardInterrupt received — cancelling pending review futures.")
                    for f in futures:
                        f.cancel()
                    pool.shutdown(wait=False, cancel_futures=True)
                    raise

        triaged = _triage_findings(all_findings)
        logger.info(
            "PHASE 3 REVIEW: %d total findings, %d after triage (P1: %d, P2: %d, P3: %d)",
            len(all_findings),
            len(triaged),
            sum(1 for f in triaged if f.severity == "P1"),
            sum(1 for f in triaged if f.severity == "P2"),
            sum(1 for f in triaged if f.severity == "P3"),
        )
        return triaged

    # ------------------------------------------------------------------
    # Phase 4: FIX (serial, one agent)
    # ------------------------------------------------------------------

    def _phase_fix(self, findings: list[Finding]) -> bool:
        """Phase 4: Apply fixes for triaged findings.

        Only runs if there are P1 or P2 findings. P3s are logged but
        not auto-fixed.

        Returns True if the fix agent completed successfully.
        """
        actionable = [f for f in findings if f.severity in ("P1", "P2")]
        if not actionable:
            logger.info("PHASE 4 FIX: no P1/P2 findings to fix.")
            return True

        logger.info("PHASE 4 FIX: applying %d P1/P2 findings", len(actionable))

        from codelicious.prompts import check_build_complete, clear_build_complete

        clear_build_complete(self.repo_path)
        fix_prompt = _render_fix_prompt(self.project_name, actionable)

        try:
            self._run_agent(fix_prompt, self.repo_path)
        except Exception as e:
            logger.error("Fix agent failed: %s", e)
            return False

        return check_build_complete(self.repo_path)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def run(
        self,
        specs: list[pathlib.Path],
        reviewers: list[str] | None = None,
        max_build_workers: int = 3,
        max_review_workers: int = 4,
        max_build_cycles: int = 10,
        push_pr: bool = False,
        max_wall_clock_s: float = 7200,
    ) -> OrchestratorResult:
        """Run the full orchestrated pipeline.

        Build→merge cycles repeat until all specs are complete (no
        unchecked ``- [ ]`` items remain) or the cycle cap is reached.
        Review and fix run once at the end, after building is done.

        Parameters
        ----------
        specs:
            List of spec file paths to build.
        reviewers:
            List of reviewer role names (e.g. ["security", "qa"]).
            Defaults to all available roles.
        max_build_workers:
            Max concurrent builder agents.
        max_review_workers:
            Max concurrent reviewer agents.
        max_build_cycles:
            Max build→merge iterations before giving up.
        push_pr:
            Whether to push and create/update PR after completion.
        max_wall_clock_s:
            Hard wall-clock limit in seconds for the entire run (Finding 22).
            Defaults to 7200 (2 hours). The build loop is aborted if this
            limit is reached before all cycles complete.
        """
        from codelicious.prompts import scan_remaining_tasks_for_spec

        if reviewers is None:
            reviewers = list(REVIEWER_PROMPTS.keys())

        # Normalize all spec paths to absolute so comparisons are reliable
        specs = [s.resolve() if not s.is_absolute() else s for s in specs]

        start = time.monotonic()
        total_builds = 0
        total_merged = 0
        cycles = 0

        logger.info(
            "ORCHESTRATOR: %d specs, %d reviewers, build_workers=%d, review_workers=%d, max_build_cycles=%d",
            len(specs),
            len(reviewers),
            max_build_workers,
            max_review_workers,
            max_build_cycles,
        )

        # ── BUILD LOOP: repeat build→merge until all specs complete ──
        incomplete_specs = list(specs)
        consecutive_failures = 0

        for cycle in range(1, max_build_cycles + 1):
            # Wall-clock timeout guard (Finding 22)
            elapsed_so_far = time.monotonic() - start
            if elapsed_so_far >= max_wall_clock_s:
                logger.error(
                    "Wall-clock timeout reached after %.1fs (limit=%ss). Aborting build loop.",
                    elapsed_so_far,
                    max_wall_clock_s,
                )
                break

            # Cache scan_remaining_tasks_for_spec results keyed by spec path so
            # each spec is queried at most once per cycle (Finding 26).
            remaining_cache: dict[pathlib.Path, int] = {s: scan_remaining_tasks_for_spec(s) for s in incomplete_specs}
            # Check which specs still have unchecked tasks
            still_incomplete = [s for s, n in remaining_cache.items() if n > 0]
            if not still_incomplete:
                logger.info("All %d specs are complete after %d build cycle(s).", len(specs), cycles)
                break

            cycles = cycle
            logger.info("")
            logger.info(
                "══════ Build cycle %d/%d (%d specs remaining) ══════", cycle, max_build_cycles, len(still_incomplete)
            )

            # ── Phase 1: BUILD ────────────────────────────────────
            logger.info("---- BUILD ----")
            build_results = self._phase_build(still_incomplete, max_build_workers)
            successful = sum(1 for _, ok in build_results if ok)
            total_builds += successful
            logger.info("Build: %d/%d specs built successfully.", successful, len(still_incomplete))

            if successful == 0:
                consecutive_failures += 1
                logger.warning("No specs built in cycle %d (%d consecutive failures).", cycle, consecutive_failures)
                if consecutive_failures >= 3:
                    logger.error("Aborting: %d consecutive build cycles with zero progress.", consecutive_failures)
                    break
                continue
            else:
                consecutive_failures = 0

            # ── Phase 2: MERGE ────────────────────────────────────
            logger.info("---- MERGE ----")
            merged = self._phase_merge(build_results)
            total_merged += merged
            logger.info("Merge: %d branches merged.", merged)

            # Commit merged work and push before next cycle
            try:
                self.git_manager.commit_verified_changes(
                    commit_message=f"codelicious: build cycle {cycle} of {self.project_name}"
                )
            except Exception as e:
                logger.warning("Mid-cycle commit failed: %s", e)

            # Push even if commit_verified_changes found nothing new to
            # commit — merge commits need to be pushed too.
            push = self.git_manager.push_to_origin()
            if not push.success:
                logger.warning("Mid-cycle push failed (type=%s): %s", push.error_type, push.message)

            # Update incomplete list for next iteration
            incomplete_specs = still_incomplete

        # ── Check final completion status ─────────────────────────
        # Cache results to avoid calling scan_remaining_tasks_for_spec twice
        # for the same spec (Finding 26).
        final_remaining_cache: dict[pathlib.Path, int] = {s: scan_remaining_tasks_for_spec(s) for s in specs}
        final_incomplete = [s for s, n in final_remaining_cache.items() if n > 0]
        all_complete = len(final_incomplete) == 0

        if all_complete:
            logger.info("All specs complete. Proceeding to review phase.")
        else:
            remaining_tasks = sum(final_remaining_cache[s] for s in final_incomplete)
            logger.warning(
                "%d spec(s) still incomplete (%d unchecked tasks). Proceeding to review.",
                len(final_incomplete),
                remaining_tasks,
            )

        # ── REVIEW (once, after all building is done) ─────────────
        logger.info("")
        logger.info("---- REVIEW ----")
        findings = self._phase_review(reviewers, max_review_workers)

        # ── FIX (once, after review) ──────────────────────────────
        logger.info("")
        logger.info("---- FIX ----")
        fix_ok = self._phase_fix(findings)

        # ── Final commit, push & PR ───────────────────────────────
        try:
            self.git_manager.commit_verified_changes(
                commit_message=f"codelicious: orchestrated build of {self.project_name}"
            )
        except Exception as e:
            logger.warning("Post-orchestration commit failed: %s", e)

        # Always push — commit_verified_changes skips push when working
        # tree is clean, but merge commits still need to be pushed.
        push = self.git_manager.push_to_origin()
        if not push.success:
            logger.error("Final push failed (type=%s): %s", push.error_type, push.message)

        if push_pr:
            # Create/reuse one PR per successfully built spec (spec-22 Phase 4)
            for spec in specs:
                _m = re.match(r"^(\d+)", spec.stem)
                _sid = _m.group(1) if _m else spec.stem
                try:
                    self.git_manager.ensure_draft_pr_exists(
                        spec_id=_sid,
                        spec_summary=f"build {self.project_name}",
                    )
                except Exception as e:
                    logger.warning("PR creation for spec-%s failed: %s", _sid, e)

        elapsed = time.monotonic() - start
        return OrchestratorResult(
            success=all_complete and fix_ok,
            message=(
                f"Orchestrated: {total_builds} builds across {cycles} cycle(s), "
                f"{total_merged} merged, {len(final_incomplete)}/{len(specs)} specs still incomplete, "
                f"{len(findings)} findings, fix={'OK' if fix_ok else 'FAILED'} "
                f"in {elapsed:.1f}s"
            ),
            findings=findings,
            elapsed_s=elapsed,
            cycles_completed=cycles,
        )


# ═══════════════════════════════════════════════════════════════════════
# spec-27 Phase 4: V2 Orchestrator — chunk-based serial loop
# ═══════════════════════════════════════════════════════════════════════


class V2Orchestrator:
    """Chunk-based orchestrator for codelicious v2 (spec-27 Phase 4.1).

    Runs the simplified workflow::

        for each spec:
            chunk the spec → for each chunk:
                execute → verify → fix → commit → push
            transition PR to review

    No worktree isolation.  Each spec gets a branch.  Chunks are
    executed serially.  One commit per chunk.
    """

    def __init__(
        self,
        repo_path: pathlib.Path,
        git_manager: object,
        engine: object,
        max_commits_per_pr: int = 50,
        model: str = "",
    ) -> None:
        self.repo_path = pathlib.Path(repo_path).resolve()
        self.git_manager = git_manager
        self.engine = engine
        self.max_commits_per_pr = max_commits_per_pr
        self.model = model

    def run(
        self,
        specs: list[pathlib.Path],
        deadline: float = 0.0,
        push_pr: bool = True,
    ) -> OrchestratorResult:
        """Run the v2 chunk-based orchestration loop.

        Parameters
        ----------
        specs:
            List of incomplete spec file paths.
        deadline:
            Monotonic clock deadline (0 = no deadline).
        push_pr:
            Whether to create/update PRs on GitHub/GitLab.
        """
        from codelicious.chunker import chunk_spec
        from codelicious.engines.base import EngineContext
        from codelicious.spec_discovery import mark_chunk_complete

        start = time.monotonic()
        total_chunks_completed = 0
        total_chunks_failed = 0
        specs_completed = 0

        for spec in specs:
            spec_id = re.match(r"^(\d+)", spec.stem)
            spec_id_str = spec_id.group(1) if spec_id else spec.stem

            # ── Chunk the spec ────────────────────────────────────
            try:
                chunks = chunk_spec(spec, self.repo_path)
            except Exception as e:
                logger.error("Failed to chunk spec %s: %s", spec.name, e)
                continue

            if not chunks:
                logger.info("Spec %s has no chunks to build.", spec.name)
                specs_completed += 1
                continue

            total_chunks = len(chunks)
            logger.info("[codelicious] Spec: %s (%d chunks)", spec.name, total_chunks)

            # ── Ensure branch ─────────────────────────────────────
            self.git_manager.assert_safe_branch(spec_name=str(spec), spec_id=spec_id_str)

            # ── Ensure PR exists ──────────────────────────────────
            spec_title = spec.stem.replace("_", " ")
            pr_number = None
            pr_part = 0
            chunk_summaries: list[str] = []

            if push_pr:
                push_result = self.git_manager.push_to_origin()
                if push_result.success:
                    pr_number = self.git_manager.ensure_draft_pr_exists(
                        spec_id=spec_id_str,
                        spec_summary=spec_title,
                        chunk_summaries=[c.title for c in chunks[:20]],
                    )

            # ── Build context ─────────────────────────────────────
            try:
                spec_content = spec.read_text(encoding="utf-8", errors="replace")
            except OSError:
                spec_content = ""

            previous_chunks: list[str] = []

            # ── Execute each chunk ────────────────────────────────
            all_chunks_ok = True
            spec_chunks_failed = 0
            for chunk_idx, chunk in enumerate(chunks, 1):
                # Deadline check
                if deadline and time.monotonic() > deadline:
                    logger.warning("Build deadline reached during spec %s, chunk %d.", spec.name, chunk_idx)
                    all_chunks_ok = False
                    break

                logger.info("[codelicious] Chunk %d/%d: %s — executing...", chunk_idx, total_chunks, chunk.title)

                # PR commit cap check
                if push_pr and pr_number and self.max_commits_per_pr > 0:
                    commit_count = self.git_manager.get_pr_commit_count(pr_number)
                    if commit_count >= self.max_commits_per_pr:
                        logger.info(
                            "PR #%d reached %d commits (cap=%d). Splitting.",
                            pr_number,
                            commit_count,
                            self.max_commits_per_pr,
                        )
                        self.git_manager.transition_pr_to_review(spec_id=spec_id_str)
                        pr_part += 1
                        self.git_manager.create_continuation_branch(spec_id_str, pr_part)
                        push_result = self.git_manager.push_to_origin()
                        if push_result.success:
                            pr_number = self.git_manager.ensure_draft_pr_exists(
                                spec_id=spec_id_str,
                                spec_summary=spec_title,
                                part=pr_part,
                                chunk_summaries=[],
                            )
                        chunk_summaries = []

                context = EngineContext(
                    spec_path=spec,
                    spec_content=spec_content,
                    previous_chunks=list(previous_chunks),
                    deadline=deadline,
                    model=self.model,
                )

                # ── Execute ───────────────────────────────────────
                result = self.engine.execute_chunk(chunk, self.repo_path, context)

                # ── Verify ────────────────────────────────────────
                if result.success:
                    logger.info("[codelicious] Chunk %d/%d: %s — verifying...", chunk_idx, total_chunks, chunk.title)
                    verification = self.engine.verify_chunk(chunk, self.repo_path)
                    if not verification.success and verification.message:
                        logger.info("[codelicious] Chunk %d/%d: %s — fixing...", chunk_idx, total_chunks, chunk.title)
                        fix_result = self.engine.fix_chunk(chunk, self.repo_path, [verification.message])
                        if fix_result.success:
                            # Re-verify
                            verification = self.engine.verify_chunk(chunk, self.repo_path)
                            # Merge file lists
                            all_files = list(set(list(result.files_modified) + list(fix_result.files_modified)))
                            result = type(result)(
                                success=verification.success,
                                files_modified=all_files,
                                message=result.message,
                                retries_used=result.retries_used + 1,
                            )

                # ── Commit ────────────────────────────────────────
                if result.success:
                    files_str = [str(f) for f in result.files_modified] if result.files_modified else []
                    if not files_str:
                        # Collect any uncommitted changes
                        try:
                            diff_out = subprocess.run(
                                ["git", "diff", "--name-only"],
                                cwd=self.repo_path,
                                capture_output=True,
                                text=True,
                                timeout=10,
                            )
                            if diff_out.returncode == 0 and diff_out.stdout.strip():
                                files_str = diff_out.stdout.strip().splitlines()
                            # Also check untracked
                            untracked = subprocess.run(
                                ["git", "ls-files", "--others", "--exclude-standard"],
                                cwd=self.repo_path,
                                capture_output=True,
                                text=True,
                                timeout=10,
                            )
                            if untracked.returncode == 0 and untracked.stdout.strip():
                                files_str.extend(untracked.stdout.strip().splitlines())
                        except Exception:  # nosec B110
                            pass  # Untracked file listing is best-effort

                    if files_str:
                        commit_result = self.git_manager.commit_chunk(chunk.id, chunk.title, files_str)
                        if commit_result.success and commit_result.sha:
                            logger.info(
                                "[codelicious] Chunk %d/%d: %s — committed (%s)",
                                chunk_idx,
                                total_chunks,
                                chunk.title,
                                commit_result.sha,
                            )
                            chunk_summaries.append(f"{chunk.id}: {chunk.title}")

                            # Push
                            if push_pr:
                                push_result = self.git_manager.push_to_origin()
                                if push_result.success:
                                    logger.info(
                                        "[codelicious] Chunk %d/%d: %s — pushed", chunk_idx, total_chunks, chunk.title
                                    )
                                else:
                                    logger.warning(
                                        "[codelicious] Push failed for chunk %d: %s",
                                        chunk_idx,
                                        push_result.message,
                                    )
                        else:
                            logger.info("[codelicious] Chunk %d/%d: nothing to commit.", chunk_idx, total_chunks)
                    else:
                        logger.info("[codelicious] Chunk %d/%d: no files changed.", chunk_idx, total_chunks)

                    # Mark checkbox complete in spec
                    mark_chunk_complete(spec, chunk.title)
                    previous_chunks.append(f"{chunk.id}: {chunk.title}")
                    total_chunks_completed += 1
                else:
                    logger.warning(
                        "[codelicious] Chunk %d/%d: %s — FAILED: %s",
                        chunk_idx,
                        total_chunks,
                        chunk.title,
                        result.message,
                    )
                    # Revert failed chunk's changes
                    self.git_manager.revert_chunk_changes()
                    total_chunks_failed += 1
                    spec_chunks_failed += 1
                    all_chunks_ok = False

            # ── Transition PR to review ───────────────────────────
            if all_chunks_ok:
                specs_completed += 1
                if push_pr:
                    logger.info("[codelicious] Spec %s complete. Transitioning PR to review.", spec.name)
                    self.git_manager.transition_pr_to_review(spec_id=spec_id_str)
                else:
                    logger.info("[codelicious] Spec %s complete.", spec.name)
            else:
                logger.warning("[codelicious] Spec %s incomplete (%d chunks failed).", spec.name, spec_chunks_failed)

        elapsed = time.monotonic() - start
        all_ok = total_chunks_failed == 0 and specs_completed == len(specs)
        return OrchestratorResult(
            success=all_ok,
            message=(
                f"V2: {total_chunks_completed} chunks completed, {total_chunks_failed} failed, "
                f"{specs_completed}/{len(specs)} specs done in {elapsed:.1f}s"
            ),
            elapsed_s=elapsed,
            cycles_completed=1,
        )
