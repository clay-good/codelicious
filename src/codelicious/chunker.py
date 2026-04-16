"""Spec decomposition into commit-sized work chunks (spec-27 Phase 2.1).

Parses a markdown spec into ``WorkChunk`` objects — each one becomes
exactly one commit.  This is what makes PRs reviewable by human
engineers.

Public API:
    WorkChunk   — frozen dataclass describing one unit of work
    chunk_spec  — deterministic chunking from spec checkboxes / sections
"""

from __future__ import annotations

import dataclasses
import logging
import pathlib
import re

from codelicious.parser import Section, parse_spec

logger = logging.getLogger("codelicious.chunker")

_MAX_CHUNKS_PER_SPEC = 100

# Matches a markdown checkbox line, capturing the text after the box.
_CHECKBOX_LINE_RE = re.compile(r"^\s*-\s*\[\s*\]\s*(.+)", re.MULTILINE)

# Matches a phase/section number in a heading like "Phase 2" or "2.3:"
_PHASE_NUMBER_RE = re.compile(r"(?:phase|step|part)?\s*(\d+(?:\.\d+)?)", re.IGNORECASE)


@dataclasses.dataclass(frozen=True)
class WorkChunk:
    """One commit-sized unit of work derived from a spec.

    Each chunk becomes exactly one commit.  The orchestrator feeds chunks
    to the engine one at a time, commits the result, then moves on.
    """

    id: str  # e.g. "spec-27-chunk-03"
    spec_path: pathlib.Path  # Source spec file
    title: str  # Short description (becomes commit message prefix)
    description: str  # Full instructions for the engine
    depends_on: list[str]  # IDs of chunks that must complete first
    estimated_files: list[str]  # Files likely to be touched (hint)
    validation: str  # How to verify this chunk is done

    # Override __hash__ and __eq__ to allow use in sets/dicts despite list fields
    def __hash__(self) -> int:
        return hash(self.id)

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, WorkChunk):
            return NotImplemented
        return self.id == other.id


def chunk_spec(
    spec_path: pathlib.Path,
    repo_path: pathlib.Path,
) -> list[WorkChunk]:
    """Decompose a spec into commit-sized ``WorkChunk`` objects.

    Strategy:
    1. Parse the spec into sections via ``parser.parse_spec``.
    2. Within each section, each ``- [ ]`` checkbox becomes one chunk.
    3. If a section has no checkboxes, the entire section body becomes
       one chunk (prose-only specs still produce work).
    4. Dependency order is inferred from section ordering — chunks in
       Phase 2 depend on the last chunk of Phase 1, etc.

    Raises ``ValueError`` if the spec decomposes into more than 100 chunks.
    """
    sections = parse_spec(spec_path, base_dir=repo_path)

    # Derive the spec-id from the filename (e.g. "27" from "27_codelicious_v2_rewrite.md")
    spec_id = _spec_id_from_path(spec_path)
    spec_content = spec_path.read_text(encoding="utf-8", errors="replace")

    chunks: list[WorkChunk] = []
    prev_section_last_chunk_id: str = ""

    for section in sections:
        if not section.body.strip():
            continue

        # Find checkbox items in this section
        checkbox_matches = list(_CHECKBOX_LINE_RE.finditer(section.body))

        if checkbox_matches:
            first_chunk_of_section = True
            for match in checkbox_matches:
                task_text = match.group(1).strip()
                chunk_num = len(chunks) + 1
                chunk_id = f"spec-{spec_id}-chunk-{chunk_num:02d}"

                # Dependency: first chunk of a section depends on the last
                # chunk of the previous section (sequential phases).
                depends: list[str] = []
                if first_chunk_of_section and prev_section_last_chunk_id:
                    depends = [prev_section_last_chunk_id]
                    first_chunk_of_section = False

                chunk = WorkChunk(
                    id=chunk_id,
                    spec_path=spec_path,
                    title=_truncate(task_text, 72),
                    description=_build_chunk_description(
                        task_text=task_text,
                        section=section,
                        full_spec=spec_content,
                    ),
                    depends_on=depends,
                    estimated_files=_extract_file_hints(task_text + " " + section.body),
                    validation=_extract_validation(task_text),
                )
                chunks.append(chunk)

            if chunks:
                prev_section_last_chunk_id = chunks[-1].id
        else:
            # No checkboxes — treat the whole section as one chunk
            if section.level == 0 and not section.title:
                # Skip the preamble (frontmatter / intro before first heading)
                continue

            chunk_num = len(chunks) + 1
            chunk_id = f"spec-{spec_id}-chunk-{chunk_num:02d}"

            depends = []
            if prev_section_last_chunk_id:
                depends = [prev_section_last_chunk_id]

            chunk = WorkChunk(
                id=chunk_id,
                spec_path=spec_path,
                title=_truncate(section.title or "Implement section", 72),
                description=_build_chunk_description(
                    task_text=section.title,
                    section=section,
                    full_spec=spec_content,
                ),
                depends_on=depends,
                estimated_files=_extract_file_hints(section.body),
                validation="",
            )
            chunks.append(chunk)
            prev_section_last_chunk_id = chunk_id

    if len(chunks) > _MAX_CHUNKS_PER_SPEC:
        raise ValueError(
            f"Spec {spec_path.name} decomposes into {len(chunks)} chunks, "
            f"exceeding the {_MAX_CHUNKS_PER_SPEC}-chunk limit. "
            f"Break the spec into smaller files."
        )

    logger.info("Chunked %s into %d work chunk(s).", spec_path.name, len(chunks))
    for c in chunks:
        deps = f" (depends on {c.depends_on})" if c.depends_on else ""
        logger.debug("  %s: %s%s", c.id, c.title, deps)

    return chunks


def chunk_spec_with_llm(
    spec_path: pathlib.Path,
    repo_path: pathlib.Path,
    llm_client: object,
) -> list[WorkChunk]:
    """Decompose a spec into chunks using an LLM for complex specs (spec-27 Phase 2.1).

    For specs where the checkbox-based ``chunk_spec`` would produce suboptimal
    chunks (e.g. prose-only specs, or specs with very large checkbox items),
    this function asks the LLM to suggest the decomposition.

    The LLM output is validated: no circular deps, no path traversal in
    file hints, and chunk count capped at 100.

    Falls back to ``chunk_spec`` on any LLM error.

    Parameters
    ----------
    spec_path:
        Path to the spec file.
    repo_path:
        Root of the repository.
    llm_client:
        An ``LLMClient`` instance with a ``chat_completion`` method.
    """
    import json

    spec_id = _spec_id_from_path(spec_path)

    try:
        spec_content = spec_path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        logger.warning("Cannot read spec %s for LLM chunking; falling back.", spec_path)
        return chunk_spec(spec_path, repo_path)

    # Build the prompt
    prompt = (
        "You are a software architect. Given the following spec, decompose it into "
        "independent, commit-sized units of work. Each chunk should:\n"
        "- Touch a small number of files\n"
        "- Be independently testable\n"
        "- Have a clear title (under 72 chars)\n"
        "- List which files it likely modifies\n"
        "- Specify dependencies on other chunks (by index)\n\n"
        f"Respond ONLY with a JSON array. Each element must have:\n"
        '  {{"title": "...", "description": "...", "files": ["..."], '
        '"depends_on_indices": [], "validation": "..."}}\n\n'
        f"## Spec\n{spec_content[:5000]}\n"
    )

    messages = [
        {
            "role": "system",
            "content": "You decompose specs into commit-sized work chunks. Respond only with valid JSON.",
        },
        {"role": "user", "content": prompt},
    ]

    try:
        response = llm_client.chat_completion(messages, tools=[], role="planner")
        content = ""
        choices = response.get("choices") or []
        if choices and isinstance(choices[0], dict):
            msg = choices[0].get("message", {})
            content = msg.get("content", "") if isinstance(msg, dict) else ""
    except Exception as e:
        logger.warning("LLM chunking failed: %s; falling back to deterministic.", e)
        return chunk_spec(spec_path, repo_path)

    # Parse the JSON response
    try:
        # Extract JSON array from the response (may be wrapped in markdown code block)
        json_str = content.strip()
        if json_str.startswith("```"):
            # Strip markdown code fences
            lines = json_str.splitlines()
            lines = [ln for ln in lines if not ln.strip().startswith("```")]
            json_str = "\n".join(lines)

        raw_chunks = json.loads(json_str)
        if not isinstance(raw_chunks, list):
            raise ValueError("LLM response is not a JSON array")
    except (json.JSONDecodeError, ValueError) as e:
        logger.warning("LLM returned invalid JSON: %s; falling back.", e)
        return chunk_spec(spec_path, repo_path)

    # Validate and convert to WorkChunk objects
    chunks: list[WorkChunk] = []
    for i, raw in enumerate(raw_chunks):
        if not isinstance(raw, dict):
            continue

        chunk_num = i + 1
        chunk_id = f"spec-{spec_id}-chunk-{chunk_num:02d}"

        title = str(raw.get("title", f"Chunk {chunk_num}"))[:72]
        description = str(raw.get("description", title))
        files = raw.get("files", [])
        if not isinstance(files, list):
            files = []
        # Validate file paths — no path traversal
        safe_files = [str(f) for f in files if isinstance(f, str) and ".." not in f and not str(f).startswith("/")]

        dep_indices = raw.get("depends_on_indices", [])
        if not isinstance(dep_indices, list):
            dep_indices = []
        depends_on = []
        for idx in dep_indices:
            if isinstance(idx, int) and 0 <= idx < len(raw_chunks) and idx != i:
                depends_on.append(f"spec-{spec_id}-chunk-{idx + 1:02d}")

        validation = str(raw.get("validation", ""))

        chunks.append(
            WorkChunk(
                id=chunk_id,
                spec_path=spec_path,
                title=title,
                description=_build_chunk_description(
                    task_text=description,
                    section=Section(level=0, title="", body=description, line_number=0),
                    full_spec=spec_content,
                ),
                depends_on=depends_on,
                estimated_files=safe_files,
                validation=validation,
            )
        )

    if len(chunks) > _MAX_CHUNKS_PER_SPEC:
        raise ValueError(f"LLM decomposed spec into {len(chunks)} chunks (max {_MAX_CHUNKS_PER_SPEC}).")

    # Validate no circular dependencies
    if _has_circular_deps(chunks):
        logger.warning("LLM produced circular dependencies; falling back to deterministic.")
        return chunk_spec(spec_path, repo_path)

    if not chunks:
        logger.warning("LLM returned empty chunk list; falling back to deterministic.")
        return chunk_spec(spec_path, repo_path)

    logger.info("LLM chunked %s into %d work chunk(s).", spec_path.name, len(chunks))
    return chunks


def _has_circular_deps(chunks: list[WorkChunk]) -> bool:
    """Check for circular dependencies in a list of chunks using DFS."""
    ids = {c.id for c in chunks}
    adj: dict[str, list[str]] = {c.id: [d for d in c.depends_on if d in ids] for c in chunks}

    visited: set[str] = set()
    in_stack: set[str] = set()

    def dfs(node: str) -> bool:
        if node in in_stack:
            return True
        if node in visited:
            return False
        visited.add(node)
        in_stack.add(node)
        for dep in adj.get(node, []):
            if dfs(dep):
                return True
        in_stack.discard(node)
        return False

    return any(dfs(c.id) for c in chunks if c.id not in visited)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _spec_id_from_path(spec_path: pathlib.Path) -> str:
    """Extract a spec identifier from the filename.

    ``27_codelicious_v2_rewrite.md`` → ``"27"``
    ``ROADMAP.md`` → ``"ROADMAP"``
    """
    m = re.match(r"^(\d+)", spec_path.stem)
    return m.group(1) if m else spec_path.stem


def _truncate(text: str, max_len: int) -> str:
    """Truncate *text* to *max_len* characters, adding '...' if shortened."""
    text = text.replace("\n", " ").strip()
    if len(text) <= max_len:
        return text
    return text[: max_len - 3] + "..."


def _build_chunk_description(
    task_text: str,
    section: Section,
    full_spec: str,
) -> str:
    """Build the full description given to the engine for one chunk.

    Includes the specific task, the surrounding section context, and a
    trimmed version of the full spec for broader context.
    """
    parts = [
        f"## Task\n{task_text}",
        f"\n## Section Context ({section.title})\n{section.body}" if section.title else "",
    ]
    # Include a trimmed full spec (first 3000 chars) for broader context
    trimmed_spec = full_spec[:3000]
    if len(full_spec) > 3000:
        trimmed_spec += "\n\n[... spec truncated for context ...]"
    parts.append(f"\n## Full Spec Context\n{trimmed_spec}")
    return "\n".join(p for p in parts if p)


_FILE_HINT_RE = re.compile(
    r"(?:`([a-zA-Z0-9_/.\-]+\.[a-zA-Z0-9]+)`"  # backtick-quoted file paths
    r"|(?:File:\s*)(`?)([a-zA-Z0-9_/.\-]+\.[a-zA-Z0-9]+)\2)",  # "File: path" pattern
    re.IGNORECASE,
)


def _extract_file_hints(text: str) -> list[str]:
    """Extract likely file paths mentioned in the text."""
    hits: list[str] = []
    for m in _FILE_HINT_RE.finditer(text):
        path = m.group(1) or m.group(3)
        if path and path not in hits:
            hits.append(path)
    return hits


def _extract_validation(task_text: str) -> str:
    """Extract a validation hint from the task text, if present.

    Looks for patterns like "(verify: ...)" or "validate by ...".
    """
    # Simple heuristic — grab text after common validation keywords
    lower = task_text.lower()
    for kw in ("verify:", "validate:", "test:", "check:"):
        idx = lower.find(kw)
        if idx >= 0:
            return task_text[idx:].strip()
    return ""
