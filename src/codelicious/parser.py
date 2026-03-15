"""Parses spec files into structured task representations."""

from __future__ import annotations

import logging
import pathlib
from dataclasses import dataclass

from proxilion_build.errors import (
    EmptySpecError,
    FileEncodingError,
    FileTooLargeError,
    ParseError,
    SpecFileNotFoundError,
)

__all__ = ["MAX_FILE_SIZE", "Section", "parse_spec"]

logger = logging.getLogger("proxilion_build.parser")

MAX_FILE_SIZE: int = 1_048_576  # 1 MB


@dataclass(frozen=True)
class Section:
    """A single section extracted from a markdown spec file."""

    level: int
    title: str
    body: str
    line_number: int


def parse_spec(
    path: pathlib.Path | str,
    base_dir: pathlib.Path | str | None = None,
) -> list[Section]:
    """Parse a markdown spec file into a list of Section objects."""
    logger.info("Parsing spec: path=%s", path)
    if not isinstance(path, (pathlib.Path, str)):
        raise TypeError(f"path must be a pathlib.Path or str, got {type(path).__name__}")
    path = pathlib.Path(path)

    if base_dir is not None:
        if not isinstance(base_dir, (pathlib.Path, str)):
            raise TypeError(
                f"base_dir must be a pathlib.Path or str, got {type(base_dir).__name__}"
            )
        base_dir = pathlib.Path(base_dir)
        if not base_dir.is_dir():
            raise ValueError(f"base_dir is not a directory: {base_dir}")

    resolved = path.resolve()

    if base_dir is not None:
        resolved_base = base_dir.resolve()
        try:
            resolved.relative_to(resolved_base)
        except ValueError:
            raise SpecFileNotFoundError(
                f"Path {resolved} is outside base directory {resolved_base}",
                path=str(path),
            )

    if not resolved.exists() or not resolved.is_file():
        raise SpecFileNotFoundError(
            f"Spec file not found: {resolved}",
            path=str(path),
        )

    file_size = resolved.stat().st_size
    logger.debug("Spec file size: %d bytes", file_size)
    if file_size > MAX_FILE_SIZE:
        raise FileTooLargeError(
            f"File size {file_size} exceeds limit {MAX_FILE_SIZE}",
            path=str(path),
        )

    try:
        content = resolved.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        raise FileEncodingError(
            f"File is not valid UTF-8: {exc}",
            path=str(path),
        ) from exc

    # Reject files with null bytes which could cause downstream issues
    if "\x00" in content:
        raise ParseError(
            "Spec file contains null bytes which are not allowed",
            path=str(path),
        )

    if not content.strip():
        raise EmptySpecError(
            "Spec file is empty or contains only whitespace",
            path=str(path),
        )

    sections = _split_sections(content)
    logger.info("Parsed %d sections from spec", len(sections))
    logger.debug("Sections: %s", [(s.level, s.title, s.line_number) for s in sections])
    return sections


def _split_sections(content: str) -> list[Section]:
    """Split markdown content into sections based on headings."""
    # Normalize line endings (CRLF and CR → LF) for cross-platform compatibility
    content = content.replace("\r\n", "\n").replace("\r", "\n")
    lines = content.splitlines()
    logger.debug("Processing %d lines", len(lines))
    sections: list[Section] = []
    current_level: int = 0
    current_title: str = ""
    current_body_lines: list[str] = []
    current_line_number: int = 1
    in_code_fence: bool = False
    fence_char: str = ""  # Track which fence character opened the block

    for i, line in enumerate(lines, start=1):
        # Track fenced code blocks (``` or ~~~); headings inside are not parsed
        # Ensure closing fence matches opening fence character
        stripped_line = line.strip()
        if not in_code_fence:
            if stripped_line.startswith("```"):
                in_code_fence = True
                fence_char = "`"
            elif stripped_line.startswith("~~~"):
                in_code_fence = True
                fence_char = "~"
        else:
            # Only close with matching fence type
            if fence_char == "`" and stripped_line.startswith("```"):
                in_code_fence = False
                fence_char = ""
            elif fence_char == "~" and stripped_line.startswith("~~~"):
                in_code_fence = False
                fence_char = ""

        heading_level = 0 if in_code_fence else _heading_level(line)

        if heading_level > 0:
            # Flush the previous section if there is accumulated content
            # or if we already saw at least one heading.
            if current_body_lines or sections or current_title:
                sections.append(
                    Section(
                        level=current_level,
                        title=current_title,
                        body="\n".join(current_body_lines).strip(),
                        line_number=current_line_number,
                    )
                )

            current_level = heading_level
            current_title = line.lstrip("#").strip()
            current_body_lines = []
            current_line_number = i
        else:
            if not sections and current_level == 0 and not current_title:
                # We are in the preamble (before first heading)
                if not current_body_lines and line.strip():
                    current_line_number = i
                elif not current_body_lines and not line.strip():
                    # Skip leading blank lines for preamble line_number
                    continue
            current_body_lines.append(line)

    # Flush the last section
    if current_body_lines or current_title:
        sections.append(
            Section(
                level=current_level,
                title=current_title,
                body="\n".join(current_body_lines).strip(),
                line_number=current_line_number,
            )
        )

    return sections


def _heading_level(line: str) -> int:
    """Return the heading level (1-6) if the line is a markdown heading, else 0."""
    stripped = line.lstrip()
    if not stripped.startswith("#"):
        return 0

    hashes = 0
    for ch in stripped:
        if ch == "#":
            hashes += 1
        else:
            break

    # The character after all hashes must be a space (or end-of-line) to be valid
    if len(stripped) <= hashes:
        # Line is only hashes with no space/text after
        return 0
    if stripped[hashes] != " ":
        return 0

    # Cap heading depth at 6 (levels beyond 6 are not standard markdown)
    return min(hashes, 6)
