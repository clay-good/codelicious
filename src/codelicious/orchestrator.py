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
import subprocess
import sys
import time
from dataclasses import dataclass, field

logger = logging.getLogger("codelicious.orchestrator")

__all__ = [
    "Finding",
    "Orchestrator",
    "OrchestratorResult",
    "ReviewRole",
    "REVIEWER_PROMPTS",
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

Then write "DONE" to .codelicious/BUILD_COMPLETE
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

Then write "DONE" to .codelicious/BUILD_COMPLETE
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

Then write "DONE" to .codelicious/BUILD_COMPLETE
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

Then write "DONE" to .codelicious/BUILD_COMPLETE
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


def _create_worktree(repo_path: pathlib.Path, branch_name: str) -> pathlib.Path:
    """Create a git worktree for isolated building.

    Returns the path to the new worktree directory.
    """
    worktree_dir = repo_path / ".codelicious" / "worktrees" / branch_name
    worktree_dir.parent.mkdir(parents=True, exist_ok=True)

    # Clean up stale worktree if it exists
    if worktree_dir.exists():
        subprocess.run(
            ["git", "worktree", "remove", "--force", str(worktree_dir)],
            cwd=str(repo_path),
            capture_output=True,
        )

    # Create the worktree with a new branch
    result = subprocess.run(
        ["git", "worktree", "add", "-b", branch_name, str(worktree_dir)],
        cwd=str(repo_path),
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        # Branch might already exist — try without -b
        result = subprocess.run(
            ["git", "worktree", "add", str(worktree_dir), branch_name],
            cwd=str(repo_path),
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            raise RuntimeError(f"Failed to create worktree: {result.stderr}")

    logger.info("Created worktree at %s (branch: %s)", worktree_dir, branch_name)
    return worktree_dir


def _remove_worktree(repo_path: pathlib.Path, worktree_dir: pathlib.Path) -> None:
    """Remove a git worktree."""
    subprocess.run(
        ["git", "worktree", "remove", "--force", str(worktree_dir)],
        cwd=str(repo_path),
        capture_output=True,
    )
    logger.info("Removed worktree: %s", worktree_dir)


def _merge_worktree_branch(repo_path: pathlib.Path, branch_name: str) -> bool:
    """Merge a worktree branch back into the current branch.

    Returns True on success, False on merge conflict.
    """
    result = subprocess.run(
        ["git", "merge", "--no-ff", "-m", f"codelicious: merge {branch_name}", branch_name],
        cwd=str(repo_path),
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        logger.error("Merge conflict for branch %s: %s", branch_name, result.stderr)
        # Abort the merge to leave repo in clean state
        subprocess.run(["git", "merge", "--abort"], cwd=str(repo_path), capture_output=True)
        return False

    logger.info("Merged branch %s successfully.", branch_name)
    return True


def _delete_branch(repo_path: pathlib.Path, branch_name: str) -> None:
    """Delete a local branch after merge."""
    subprocess.run(
        ["git", "branch", "-d", branch_name],
        cwd=str(repo_path),
        capture_output=True,
    )


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

## Triaged Findings (ordered by severity)

{{findings_text}}

## Instructions

Fix the findings above, starting with P1 (most critical).
For each fix:
1. Read the file cited in the finding
2. Apply the suggested fix (or a better one if you see one)
3. Run tests after each fix to ensure no regressions

When all fixable findings are addressed, run /verify-all.
Commit the fixes with a descriptive message.
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

        Returns (branch_name, success).
        """
        from codelicious.prompts import AGENT_BUILD_SPEC, render

        branch_name = f"codelicious/build-{spec_path.stem}"
        worktree_dir: pathlib.Path | None = None

        try:
            worktree_dir = _create_worktree(self.repo_path, branch_name)

            build_prompt = render(
                AGENT_BUILD_SPEC,
                project_name=self.project_name,
                spec_filter=str(spec_path),
            )

            result = self._run_agent(build_prompt, worktree_dir)
            logger.info(
                "Build for %s complete: success=%s",
                spec_path.name,
                result.success,
            )
            return branch_name, result.success

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
        if not specs:
            return []

        workers = min(max_workers, len(specs))
        logger.info(
            "PHASE 1 BUILD: %d specs across %d workers",
            len(specs),
            workers,
        )

        results: list[tuple[str, bool]] = []

        if workers <= 1:
            # Serial fallback
            for spec in specs:
                results.append(self._build_spec_in_worktree(spec))
        else:
            with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
                futures = {pool.submit(self._build_spec_in_worktree, spec): spec for spec in specs}
                for future in concurrent.futures.as_completed(futures):
                    spec = futures[future]
                    try:
                        results.append(future.result())
                    except Exception as e:
                        logger.error("Worker for %s raised: %s", spec.name, e)
                        results.append((f"codelicious/build-{spec.stem}", False))

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
        from codelicious.prompts import render, clear_build_complete

        prompt_template = REVIEWER_PROMPTS.get(role)
        if not prompt_template:
            logger.warning("Unknown reviewer role: %s", role)
            return []

        clear_build_complete(self.repo_path)
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
                for future in concurrent.futures.as_completed(futures):
                    role = futures[future]
                    try:
                        all_findings.extend(future.result())
                    except Exception as e:
                        logger.error("Reviewer %s raised: %s", role, e)

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

        from codelicious.prompts import clear_build_complete, check_build_complete

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
        push_pr: bool = False,
    ) -> OrchestratorResult:
        """Run the full 4-phase orchestrated pipeline.

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
        push_pr:
            Whether to push and create/update PR after completion.
        """
        if reviewers is None:
            reviewers = list(REVIEWER_PROMPTS.keys())

        start = time.monotonic()
        logger.info(
            "ORCHESTRATOR: %d specs, %d reviewers, build_workers=%d, review_workers=%d",
            len(specs),
            len(reviewers),
            max_build_workers,
            max_review_workers,
        )

        # ── Phase 1: BUILD ─────────────────────────────────────────
        build_results = self._phase_build(specs, max_build_workers)
        successful_builds = sum(1 for _, ok in build_results if ok)
        logger.info("Phase 1 complete: %d/%d specs built successfully.", successful_builds, len(specs))

        if successful_builds == 0 and specs:
            return OrchestratorResult(
                success=False,
                message="All builds failed.",
                elapsed_s=time.monotonic() - start,
            )

        # ── Phase 2: MERGE ─────────────────────────────────────────
        merged = self._phase_merge(build_results)
        logger.info("Phase 2 complete: %d branches merged.", merged)

        # ── Phase 3: REVIEW ────────────────────────────────────────
        findings = self._phase_review(reviewers, max_review_workers)

        # ── Phase 4: FIX ──────────────────────────────────────────
        fix_ok = self._phase_fix(findings)

        # ── Commit & PR ────────────────────────────────────────────
        try:
            self.git_manager.commit_verified_changes(
                commit_message=f"codelicious: orchestrated build of {self.project_name}"
            )
        except Exception as e:
            logger.warning("Post-orchestration commit failed: %s", e)

        if push_pr:
            try:
                self.git_manager.ensure_draft_pr_exists(
                    f"Orchestrated build: {len(specs)} specs, {len(findings)} findings"
                )
            except Exception as e:
                logger.warning("PR creation failed: %s", e)

        elapsed = time.monotonic() - start
        return OrchestratorResult(
            success=fix_ok,
            message=(
                f"Orchestrated: {successful_builds}/{len(specs)} specs built, "
                f"{merged} merged, {len(findings)} findings, "
                f"fix={'OK' if fix_ok else 'FAILED'} "
                f"in {elapsed:.1f}s"
            ),
            findings=findings,
            elapsed_s=elapsed,
            cycles_completed=1,
        )
