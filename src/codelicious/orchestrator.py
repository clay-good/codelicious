"""Chunk-based orchestrator for codelicious v2 (spec-27 Phase 4.1).

Runs the simplified workflow::

    for each spec:
        chunk the spec → for each chunk:
            execute → verify → fix → commit → push
        transition PR to review

No worktree isolation.  Each spec gets a branch.  Chunks are executed
serially.  One commit per chunk.

Usage::

    from codelicious.orchestrator import Orchestrator

    orch = Orchestrator(repo_path, git_manager, engine)
    result = orch.run(specs=[Path("docs/specs/01_feature.md")])
"""

from __future__ import annotations

import logging
import pathlib
import re
import subprocess
import time
from dataclasses import dataclass, field

logger = logging.getLogger("codelicious.orchestrator")

__all__ = [
    "ChunkOutcome",
    "Finding",
    "Orchestrator",
    "OrchestratorResult",
    "V2Orchestrator",
]


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


# Keep a public alias so callers that import ChunkOutcome don't break.
ChunkOutcome = OrchestratorResult


# ═══════════════════════════════════════════════════════════════════════
# spec-27 Phase 4: Orchestrator — chunk-based serial loop
# ═══════════════════════════════════════════════════════════════════════


_INTERNAL_PREFIXES = (".codelicious/", ".codelicious")


def _filter_internal_files(files: list[str]) -> list[str]:
    """Drop codelicious-internal state files from a path list.

    Internal cache/state under .codelicious/ should never be committed to
    the user's repo or counted as agent-produced work.
    """
    return [f for f in files if not f.startswith(_INTERNAL_PREFIXES)]


def _ensure_codelicious_gitignored(repo_path: pathlib.Path) -> None:
    """Append `.codelicious/` to the repo's .gitignore if it isn't there.

    Without this, the orchestrator's own cache/state can leak into the
    user's diff and produce empty commits that look like progress.
    """
    gitignore = repo_path / ".gitignore"
    needle = ".codelicious/"
    try:
        existing = gitignore.read_text(encoding="utf-8") if gitignore.exists() else ""
        lines = {line.strip() for line in existing.splitlines()}
        if needle in lines or ".codelicious" in lines:
            return
        new = existing + ("\n" if existing and not existing.endswith("\n") else "") + needle + "\n"
        gitignore.write_text(new, encoding="utf-8")
        logger.info("Added .codelicious/ to .gitignore")
    except OSError as e:
        logger.warning("Could not update .gitignore: %s", e)


class Orchestrator:
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
        max_commits_per_pr: int = 8,
        max_loc_per_pr: int = 250,
        model: str = "",
        progress_callback: object = None,
        no_resume: bool = False,
        engines: list[object] | None = None,
    ) -> None:
        self.repo_path = pathlib.Path(repo_path).resolve()
        self.git_manager = git_manager
        self.engine = engine
        # spec v30 Step 5: optional engine list for rate-limit fallover. The
        # primary ``engine`` argument stays first; additional engines tail it.
        # When an engine rate-limits we drop it and continue on the next one.
        if engines:
            self._engines: list[object] = list(engines)
        else:
            self._engines = [engine]
        self.max_commits_per_pr = max_commits_per_pr
        self.max_loc_per_pr = max_loc_per_pr
        self.model = model
        self.progress_callback = progress_callback
        # spec v30 Step 2: when True, ignore any persisted chunk-status ledger
        # and re-execute every chunk regardless of prior runs.
        self.no_resume = no_resume

    # ── spec v30 Step 2: chunk-status ledger helpers ─────────────────
    def _ledger_path(self, spec: pathlib.Path) -> pathlib.Path:
        slug = re.sub(r"[^A-Za-z0-9_-]+", "_", spec.stem)
        return self.repo_path / ".codelicious" / "state" / f"{slug}.json"

    def _load_ledger(self, spec: pathlib.Path) -> dict:
        if self.no_resume:
            return {"chunks": {}}
        path = self._ledger_path(spec)
        try:
            import json as _json

            data = _json.loads(path.read_text(encoding="utf-8"))
            if isinstance(data, dict) and isinstance(data.get("chunks"), dict):
                return data
        except (OSError, ValueError):
            pass
        return {"chunks": {}}

    def _save_ledger(self, spec: pathlib.Path, ledger: dict) -> None:
        import json as _json
        import os as _os

        path = self._ledger_path(spec)
        try:
            path.parent.mkdir(parents=True, exist_ok=True)
            tmp = path.with_suffix(path.suffix + ".tmp")
            tmp.write_text(_json.dumps(ledger, indent=2, sort_keys=True), encoding="utf-8")
            _os.replace(tmp, path)
        except OSError as exc:  # nosec B110
            logger.warning("Could not persist chunk ledger %s: %s", path, exc)

    def _ledger_set(self, ledger: dict, chunk_id: str, *, status: str, **fields: object) -> None:
        import datetime as _dt

        entry = ledger.setdefault("chunks", {}).get(chunk_id, {})
        entry["status"] = status
        entry["updated_at"] = _dt.datetime.now(_dt.timezone.utc).isoformat()
        for k, v in fields.items():
            entry[k] = v
        ledger["chunks"][chunk_id] = entry

    def _report(
        self,
        spec_idx: int,
        total_specs: int,
        chunk_idx: int,
        total_chunks: int,
        spec_name: str,
        chunk_title: str,
        state: str,
    ) -> None:
        cb = self.progress_callback
        if cb is None:
            return
        try:
            cb(spec_idx, total_specs, chunk_idx, total_chunks, spec_name, chunk_title, state)
        except Exception as e:  # nosec B110
            logger.debug("Progress callback raised: %s", e)

    def _split_pr_and_continue(
        self,
        spec_id_str: str,
        spec_title: str,
        pr_part: int,
    ) -> tuple[int, int | None]:
        """Transition the current PR to review, open a continuation branch,
        push it, and ensure a fresh draft PR exists (spec 28 Phase 2.2).

        Returns ``(new_pr_part, new_pr_number_or_None)``.
        """
        self.git_manager.transition_pr_to_review(spec_id=spec_id_str)
        new_part = pr_part + 1
        self.git_manager.create_continuation_branch(spec_id_str, new_part)
        push_result = self.git_manager.push_to_origin()
        new_pr_number: int | None = None
        if push_result.success:
            new_pr_number = self.git_manager.ensure_draft_pr_exists(
                spec_id=spec_id_str,
                spec_summary=spec_title,
                part=new_part,
                chunk_summaries=[],
            )
        return new_part, new_pr_number

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
        from codelicious.chunker import chunk_spec, enforce_token_budget
        from codelicious.engines.base import EngineContext
        from codelicious.scaffolder import scaffold_claude_dir
        from codelicious.spec_discovery import mark_chunk_complete

        start = time.monotonic()
        total_chunks_completed = 0
        total_chunks_failed = 0
        specs_completed = 0

        # Scaffold .claude/ (deny list, agents) and ensure .codelicious/ is
        # gitignored so internal state files never land in the user's PR.
        try:
            scaffold_claude_dir(self.repo_path)
        except Exception as e:  # nosec B110
            logger.warning("Failed to scaffold .claude/: %s", e)
        _ensure_codelicious_gitignored(self.repo_path)

        total_specs_in_run = len(specs)
        rate_limited_abort = False
        for spec_run_idx, spec in enumerate(specs, 1):
            if rate_limited_abort:
                logger.warning("[codelicious] Aborting remaining specs due to upstream rate limit.")
                break
            spec_id = re.match(r"^(\d+)", spec.stem)
            spec_id_str = spec_id.group(1) if spec_id else spec.stem

            # ── Chunk the spec ────────────────────────────────────
            try:
                chunks = chunk_spec(spec, self.repo_path)
            except Exception as e:
                logger.error("Failed to chunk spec %s: %s", spec.name, e)
                continue

            # spec v30 Step 6: split any chunk whose estimated token cost
            # exceeds the active engine's context window before dispatch.
            engine_name = getattr(self.engine, "name", "") or ""
            chunks = enforce_token_budget(chunks, self.repo_path, engines=[engine_name] if engine_name else None)

            if not chunks:
                logger.info("Spec %s has no chunks to build.", spec.name)
                specs_completed += 1
                continue

            total_chunks = len(chunks)
            logger.info("[codelicious] Spec: %s (%d chunks)", spec.name, total_chunks)

            # ── Ensure branch ─────────────────────────────────────
            self.git_manager.assert_safe_branch(spec_name=str(spec), spec_id=spec_id_str)

            # ── PR creation is deferred ───────────────────────────
            # Creating a draft PR before any commits exist fails with
            # "No commits between main and <branch>". We open the PR lazily
            # after the first successful chunk commit+push below.
            spec_title = spec.stem.replace("_", " ")
            pr_number = None
            pr_part = 0
            chunk_summaries: list[str] = []

            # ── Build context ─────────────────────────────────────
            try:
                spec_content = spec.read_text(encoding="utf-8", errors="replace")
            except OSError:
                spec_content = ""

            previous_chunks: list[str] = []

            # spec v30 Step 2: load chunk-status ledger so a re-run after a
            # mid-spec abort skips already-merged chunks.
            ledger = self._load_ledger(spec)

            # ── Execute each chunk ────────────────────────────────
            all_chunks_ok = True
            spec_chunks_failed = 0
            for chunk_idx, chunk in enumerate(chunks, 1):
                ledger_entry = ledger.get("chunks", {}).get(chunk.id, {})
                if ledger_entry.get("status") == "merged":
                    logger.info(
                        "Skipping already-merged chunk %s: %s",
                        chunk.id,
                        chunk.title,
                    )
                    previous_chunks.append(f"{chunk.id}: {chunk.title}")
                    continue
                # spec v29 Step 10: deadline gate before each chunk so an
                # expired budget never starts a fresh execute_chunk call.
                if deadline and time.monotonic() >= deadline:
                    logger.warning(
                        "Deadline reached after %d/%d chunks in spec %s; stopping early.",
                        chunk_idx - 1,
                        total_chunks,
                        spec.name,
                    )
                    all_chunks_ok = False
                    break

                logger.info("[codelicious] Chunk %d/%d: %s — executing...", chunk_idx, total_chunks, chunk.title)
                self._report(
                    spec_run_idx, total_specs_in_run, chunk_idx, total_chunks, spec.name, chunk.title, "executing"
                )

                # PR size caps: split when commit count OR diff LOC exceeds limit
                if push_pr and pr_number:
                    split_reason = ""
                    if self.max_commits_per_pr > 0:
                        commit_count = self.git_manager.get_pr_commit_count(pr_number)
                        if commit_count >= self.max_commits_per_pr:
                            split_reason = f"commits ({commit_count} >= cap {self.max_commits_per_pr})"
                    if not split_reason and self.max_loc_per_pr > 0:
                        diff_loc = self.git_manager.get_pr_diff_loc(pr_number)
                        if diff_loc >= self.max_loc_per_pr:
                            split_reason = f"LOC ({diff_loc} >= cap {self.max_loc_per_pr})"
                    if split_reason:
                        logger.info("PR #%d reached %s. Splitting.", pr_number, split_reason)
                        pr_part, pr_number = self._split_pr_and_continue(spec_id_str, spec_title, pr_part)
                        chunk_summaries = []

                context = EngineContext(
                    spec_path=spec,
                    spec_content=spec_content,
                    previous_chunks=list(previous_chunks),
                    deadline=deadline,
                    model=self.model,
                )

                # ── Execute ───────────────────────────────────────
                # spec v30 Step 5: try the primary engine, then fail over to
                # any remaining engines on a rate-limit signal.
                result = self.engine.execute_chunk(chunk, self.repo_path, context)
                while result.message and "Rate limited" in (result.message or "") and len(self._engines) > 1:
                    rate_limited = self._engines.pop(0)
                    next_engine = self._engines[0]
                    logger.warning(
                        "%s rate-limited; failing over to %s for the remainder of this spec.",
                        getattr(rate_limited, "name", "engine"),
                        getattr(next_engine, "name", "engine"),
                    )
                    self.engine = next_engine
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
                    files_str = _filter_internal_files(files_str)
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
                            files_str = _filter_internal_files(files_str)
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
                                    # Lazily open the draft PR now that at least one
                                    # commit exists between base and this branch.
                                    if pr_number is None:
                                        try:
                                            pr_number = self.git_manager.ensure_draft_pr_exists(
                                                spec_id=spec_id_str,
                                                spec_summary=spec_title,
                                                chunk_summaries=[c.title for c in chunks[:20]],
                                            )
                                        except Exception as e:  # nosec B110
                                            logger.warning("Deferred PR creation failed: %s", e)
                                else:
                                    logger.warning(
                                        "[codelicious] Push failed for chunk %d: %s",
                                        chunk_idx,
                                        push_result.message,
                                    )
                        else:
                            logger.info("[codelicious] Chunk %d/%d: nothing to commit.", chunk_idx, total_chunks)
                            files_str = []  # treat commit-failure as no-op for checkbox gating
                    else:
                        logger.warning(
                            "[codelicious] Chunk %d/%d: agent reported success but produced no source-file "
                            "changes. NOT marking checkbox complete — the spec task remains open.",
                            chunk_idx,
                            total_chunks,
                        )

                    # Only mark checkbox complete if real source-file work landed.
                    # A vacuous "success" with no diff is treated as a soft failure
                    # so the spec task stays open and the next run retries it.
                    if files_str:
                        mark_chunk_complete(spec, chunk.title)
                        previous_chunks.append(f"{chunk.id}: {chunk.title}")
                        total_chunks_completed += 1
                        self._ledger_set(
                            ledger,
                            chunk.id,
                            status="merged",
                            title=chunk.title,
                            pr_number=pr_number,
                        )
                        self._save_ledger(spec, ledger)
                        self._report(
                            spec_run_idx,
                            total_specs_in_run,
                            chunk_idx,
                            total_chunks,
                            spec.name,
                            chunk.title,
                            "committed",
                        )
                    else:
                        total_chunks_failed += 1
                        spec_chunks_failed += 1
                        all_chunks_ok = False
                        self._ledger_set(ledger, chunk.id, status="failed", title=chunk.title, reason="no-diff")
                        self._save_ledger(spec, ledger)
                        self._report(
                            spec_run_idx,
                            total_specs_in_run,
                            chunk_idx,
                            total_chunks,
                            spec.name,
                            chunk.title,
                            "failed",
                        )
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
                    self._ledger_set(
                        ledger,
                        chunk.id,
                        status="failed",
                        title=chunk.title,
                        reason=(result.message or "engine-failure")[:200],
                    )
                    self._save_ledger(spec, ledger)
                    self._report(
                        spec_run_idx,
                        total_specs_in_run,
                        chunk_idx,
                        total_chunks,
                        spec.name,
                        chunk.title,
                        "failed",
                    )
                    # Upstream rate-limit / quota exhaustion is not recoverable
                    # by retrying the next chunk — every subsequent agent call
                    # will fail the same way. Abort the run so we don't burn
                    # through the entire spec list spamming the API.
                    if result.message and "Rate limited" in result.message:
                        logger.error(
                            "[codelicious] Aborting build: Claude CLI is rate limited. Re-run after the quota resets."
                        )
                        rate_limited_abort = True
                        break

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


# Backward-compatibility alias — external imports of V2Orchestrator still work.
V2Orchestrator = Orchestrator
