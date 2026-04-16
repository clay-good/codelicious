"""Spec file discovery for codelicious (spec-27 Phase 1.2).

Extracted from ``engines/claude_engine.py`` so both engines (and the CLI)
share a single discovery implementation.  The module is engine-agnostic —
it only reads the filesystem, never invokes an LLM.

Public API:
    walk_for_specs(repo_path) -> list[Path]
    discover_incomplete_specs(repo_path, all_specs=None) -> list[Path]
    UNCHECKED_RE / CHECKED_RE  — compiled patterns for checkbox detection
"""

from __future__ import annotations

import logging
import os
import pathlib
import re

logger = logging.getLogger("codelicious.spec_discovery")

# ---------------------------------------------------------------------------
# Compiled patterns
# ---------------------------------------------------------------------------

# Filename patterns that indicate a spec/task file (case-insensitive match).
SPEC_FILENAME_RE = re.compile(
    r"(^spec[\w\-]*\.md$"  # spec.md, spec-v1.md, spec_foo.md
    r"|\.spec\.md$"  # foo.spec.md
    r"|^roadmap\.md$"  # ROADMAP.md
    r"|^todo\.md$)",  # TODO.md
    re.IGNORECASE,
)

UNCHECKED_RE = re.compile(r"^\s*-\s*\[\s*\]", re.MULTILINE)
CHECKED_RE = re.compile(r"^\s*-\s*\[[xX]\]", re.MULTILINE)

# Directories that should never be searched (even if not in .gitignore).
SKIP_DIRS: frozenset[str] = frozenset(
    {
        ".git",
        ".hg",
        ".svn",
        "node_modules",
        "__pycache__",
        ".venv",
        "venv",
        "env",
        ".tox",
        ".mypy_cache",
        ".pytest_cache",
        "dist",
        "build",
        "target",
        ".next",
        ".nuxt",
        ".codelicious",
        ".claude",
    }
)

# Filenames that should never be treated as specs, even inside a specs/ directory.
SPEC_EXCLUDE_NAMES: frozenset[str] = frozenset(
    {
        "readme.md",
        "changelog.md",
        "contributing.md",
        "code_of_conduct.md",
        "license.md",
        "claude.md",
        "memory.md",
    }
)


# ---------------------------------------------------------------------------
# Discovery functions
# ---------------------------------------------------------------------------


def walk_for_specs(repo_path: pathlib.Path) -> list[pathlib.Path]:
    """Walk the repo tree and return files that look like spec/task files.

    Uses a two-tier approach:
    - Inside any directory named ``specs`` (e.g. ``docs/specs/``): every ``.md``
      file is considered a spec (matches HuggingFace engine and README docs).
    - Elsewhere: only files matching ``SPEC_FILENAME_RE`` (``spec*.md``,
      ``roadmap.md``, ``todo.md``) are considered specs.

    Untracked files are included — a user who creates a spec and immediately
    runs codelicious (before ``git add``) should see it discovered.
    """
    matches: list[pathlib.Path] = []

    for dirpath_str, dirnames, filenames in os.walk(repo_path):
        # Prune skipped directories in-place
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS and not d.startswith(".")]

        dirpath = pathlib.Path(dirpath_str)
        inside_specs_dir = dirpath.name == "specs"

        for fname in filenames:
            if not fname.lower().endswith(".md"):
                continue
            if fname.lower() in SPEC_EXCLUDE_NAMES:
                continue

            if inside_specs_dir or SPEC_FILENAME_RE.search(fname):
                matches.append((dirpath / fname).resolve())

    return sorted(matches)


def discover_incomplete_specs(
    repo_path: pathlib.Path,
    all_specs: list[pathlib.Path] | None = None,
) -> list[pathlib.Path]:
    """Find spec files anywhere in the repo that still need work.

    A spec is *incomplete* when it has unchecked ``- [ ]`` checkboxes or
    no checkboxes at all. A spec is *complete* only when every checkbox
    is checked.

    Parameters
    ----------
    repo_path:
        Root of the repository to scan.
    all_specs:
        Optional pre-computed list of spec paths from ``walk_for_specs``.
        When provided the repository walk is skipped entirely, avoiding a
        duplicate filesystem traversal on startup.
    """
    if all_specs is None:
        all_specs = walk_for_specs(repo_path)
    incomplete: list[pathlib.Path] = []
    complete: list[pathlib.Path] = []

    for path in all_specs:
        try:
            content = path.read_text(encoding="utf-8", errors="replace")
            has_unchecked = bool(UNCHECKED_RE.search(content))
            has_checked = bool(CHECKED_RE.search(content))

            if has_unchecked or not has_checked:
                incomplete.append(path)
            else:
                complete.append(path)
        except OSError:
            pass

    # Log discovery summary
    total = len(all_specs)
    if total:

        def rel(p: pathlib.Path) -> pathlib.Path:
            return p.relative_to(repo_path) if p.is_relative_to(repo_path) else p

        logger.info(
            "Spec discovery: found %d spec file(s) — %d incomplete, %d complete.",
            total,
            len(incomplete),
            len(complete),
        )
        for s in incomplete:
            logger.info("  [incomplete] %s", rel(s))
        for s in complete:
            logger.info("  [complete]   %s", rel(s))
    else:
        logger.warning("Spec discovery: no spec files found in %s", repo_path)

    return incomplete


def mark_chunk_complete(spec_path: pathlib.Path, chunk_title: str) -> bool:
    """Mark the first matching unchecked checkbox in the spec as complete (spec-27 Phase 4.2).

    Finds the first ``- [ ]`` line whose text contains *chunk_title* (case-insensitive
    substring match) and changes it to ``- [x]``.  If no match is found, falls back
    to marking the first unchecked box.

    Returns True if a checkbox was updated, False otherwise.
    """
    try:
        content = spec_path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        logger.warning("Cannot read spec for marking: %s", spec_path)
        return False

    lines = content.splitlines(keepends=True)
    title_lower = chunk_title.lower().strip()

    # First pass: find exact match by title
    target_idx: int | None = None
    first_unchecked_idx: int | None = None

    for i, line in enumerate(lines):
        if UNCHECKED_RE.match(line.strip()):
            if first_unchecked_idx is None:
                first_unchecked_idx = i
            # Check if this line's text matches the chunk title
            line_text = line.strip().lstrip("-").strip().lstrip("[ ]").lstrip("[]").strip()
            if title_lower and title_lower in line_text.lower():
                target_idx = i
                break

    # Fallback: mark the first unchecked box
    if target_idx is None:
        target_idx = first_unchecked_idx

    if target_idx is None:
        logger.debug("No unchecked checkbox found in %s for '%s'.", spec_path.name, chunk_title)
        return False

    # Replace - [ ] with - [x] on the target line
    old_line = lines[target_idx]
    # Use regex to handle varying whitespace inside [ ]
    new_line = re.sub(r"-\s*\[\s*\]", "- [x]", old_line, count=1)
    if new_line == old_line:
        return False

    lines[target_idx] = new_line

    try:
        spec_path.write_text("".join(lines), encoding="utf-8")
        logger.info("Marked checkbox complete in %s: %s", spec_path.name, old_line.strip()[:80])
        return True
    except OSError as e:
        logger.warning("Failed to update spec %s: %s", spec_path, e)
        return False
