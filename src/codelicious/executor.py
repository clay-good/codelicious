"""Executes LLM-generated code by writing files through the sandbox."""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from typing import Callable

from codelicious.context_manager import ContextBudget, build_fix_prompt, build_task_prompt
from codelicious.errors import (
    ExecutionError,
    LLMAuthenticationError,
    LLMClientError,
    LLMProviderError,
    LLMRateLimitError,
    LLMResponseError,
    LLMTimeoutError,
    SandboxViolationError,
)
from codelicious.planner import Task
from codelicious.sandbox import Sandbox

__all__ = ["ExecutionResult", "execute_fix", "execute_task", "parse_llm_response"]

logger = logging.getLogger("codelicious.executor")

_CODE_SYSTEM_PROMPT: str = """\
You are an expert software developer. Generate code for the given task.

Return the code using this format for EACH file:

--- FILE: path/to/file.py ---
<file content here>
--- END FILE ---

You may alternatively use markdown fenced code blocks with the \
filepath in the info string:

```python path/to/file.py
<file content here>
```

Generate complete file contents. Do not use placeholder comments \
like "# rest of code here". Write production-ready code.
"""


@dataclass(frozen=True)
class ExecutionResult:
    """Result of executing a single task."""

    task_id: str
    success: bool
    files_written: list[str]
    error: str | None = None
    skipped_count: int = 0


def _normalize_file_path(raw: str) -> str:
    """Normalize a file path extracted from LLM response.

    Strip whitespace, convert backslashes to forward slashes, collapse
    multiple slashes, remove leading ./, strip leading/trailing slashes,
    and reject paths containing .. (raises SandboxViolationError).

    Returns a clean relative path string.
    """
    from codelicious.errors import SandboxViolationError

    path = raw.strip().replace("\\", "/")
    # Collapse multiple slashes
    while "//" in path:
        path = path.replace("//", "/")
    # Remove leading ./
    while path.startswith("./"):
        path = path[2:]
    # Strip leading/trailing slashes
    path = path.strip("/")
    # Reject traversal
    if ".." in path.split("/"):
        raise SandboxViolationError(f"Path traversal detected: {raw!r}")
    logger.debug("Path normalized: %r -> %r", raw, path)
    return path


# Legacy alias for compatibility during transition
_strip_and_unify_slashes = _normalize_file_path
_normalize_path = _normalize_file_path


_MAX_RESPONSE_LENGTH = 2_000_000  # 2 MB


def parse_llm_response(
    response: str,
    expected_files: list[str] | None = None,
) -> list[tuple[str, str]]:
    """Extract file path and content pairs from an LLM response.

    Uses a cascade of extraction strategies with backtracking. Each strategy
    is tried and the one that extracts the most files wins. If a strategy
    extracts all expected files, it returns immediately without trying
    remaining strategies.
    """
    if len(response) > _MAX_RESPONSE_LENGTH:
        logger.warning(
            "LLM response exceeds %d chars, truncating for parsing",
            _MAX_RESPONSE_LENGTH,
        )
        response = response[:_MAX_RESPONSE_LENGTH]

    logger.debug(
        "Parsing LLM response (%d chars, expected_files=%s)",
        len(response),
        expected_files,
    )

    # Track the best result across all strategies
    best_result: list[tuple[str, str]] = []
    best_strategy: str = ""
    expected_count = len(expected_files) if expected_files else 0

    # Strategy 1: Strict format (--- FILE: ... --- / --- END FILE ---)
    logger.debug("Trying strategy: %s", "strict_format")
    results = _parse_strict_format(response)
    if len(results) > len(best_result):
        best_result = results
        best_strategy = "strict_format"
        logger.debug("Strategy %s matched %d files (new best)", "strict_format", len(results))
        # If we got all expected files, return immediately
        if expected_count > 0 and len(best_result) >= expected_count:
            logger.debug(
                "Strategy %s extracted all %d expected files, returning immediately",
                best_strategy,
                expected_count,
            )
            return best_result

    # Strategy 2: Markdown with filename in info string
    logger.debug("Trying strategy: %s", "markdown_with_filename")
    results = _parse_markdown_with_filename(response)
    if len(results) > len(best_result):
        best_result = results
        best_strategy = "markdown_with_filename"
        logger.debug(
            "Strategy %s matched %d files (new best)", "markdown_with_filename", len(results)
        )
        if expected_count > 0 and len(best_result) >= expected_count:
            logger.debug(
                "Strategy %s extracted all %d expected files, returning immediately",
                best_strategy,
                expected_count,
            )
            return best_result

    # Strategy 3: Markdown preceded by a path line
    logger.debug("Trying strategy: %s", "markdown_preceded_by_path")
    results = _parse_markdown_preceded_by_path(response)
    if len(results) > len(best_result):
        best_result = results
        best_strategy = "markdown_preceded_by_path"
        logger.debug(
            "Strategy %s matched %d files (new best)",
            "markdown_preceded_by_path",
            len(results),
        )
        if expected_count > 0 and len(best_result) >= expected_count:
            logger.debug(
                "Strategy %s extracted all %d expected files, returning immediately",
                best_strategy,
                expected_count,
            )
            return best_result

    # Strategy 4: Single file fallback
    if expected_files and len(expected_files) == 1:
        logger.debug("Trying strategy: %s", "single_file_fallback")
        results = _parse_single_file_fallback(response, expected_files[0])
        if len(results) > len(best_result):
            best_result = results
            best_strategy = "single_file_fallback"
            logger.debug(
                "Strategy %s matched %d files (new best)", "single_file_fallback", len(results)
            )

    # If we have any results, return the best one
    if best_result:
        logger.debug(
            "Returning best result: strategy=%s, extracted=%d files",
            best_strategy,
            len(best_result),
        )
        return best_result

    # No results from any strategy - provide helpful error with response context
    response_len = len(response)
    if response_len == 0:
        preview_info = "(empty response)"
    elif response_len <= 200:
        preview_info = f"Full response ({response_len} chars): {response!r}"
    else:
        preview_info = f"Preview ({response_len} chars total): {response[:200]!r}..."
    raise ExecutionError(
        f"Could not extract any files from LLM response "
        f"(tried: strict_format, markdown_with_filename, markdown_preceded_by_path"
        f"{', single_file_fallback' if expected_files and len(expected_files) == 1 else ''}). "
        f"{preview_info}"
    )


def _parse_strict_format(response: str) -> list[tuple[str, str]]:
    """Extract files using --- FILE: path --- / --- END FILE --- markers.

    Only lines whose entire content matches the marker pattern are treated as
    headers; occurrences of the substring inside file content are ignored.

    Uses line-by-line parsing with string checks (no regex) to avoid
    catastrophic backtracking on malformed input with many dashes.
    """
    results: list[tuple[str, str]] = []
    lines = response.splitlines(keepends=True)
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        # Check for header: --- FILE: path ---
        if line.startswith("--- FILE:") and line.endswith("---"):
            path = line[len("--- FILE:") : -len("---")].strip()
            content_lines: list[str] = []
            i += 1
            while i < len(lines):
                end_line = lines[i].strip()
                if end_line.startswith("--- END FILE") and end_line.endswith("---"):
                    break
                content_lines.append(lines[i])
                i += 1
            content = "".join(content_lines).strip("\n")
            results.append((_strip_and_unify_slashes(path), content))
        i += 1
    return results


def _parse_markdown_with_filename(response: str) -> list[tuple[str, str]]:
    """Extract files from ```lang filepath blocks."""
    pattern = re.compile(
        r"^```\w*\s+(\S+.*?)\s*$\n(.*?)^```\s*$",
        re.MULTILINE | re.DOTALL,
    )
    matches = pattern.findall(response)
    if not matches:
        return []

    results: list[tuple[str, str]] = []
    for info, content in matches:
        # The info string might be just a path or "lang path"
        path = _strip_and_unify_slashes(info)
        # If it looks like a file path (has extension), use it
        if "." in path.split("/")[-1]:
            results.append((path, content.strip("\n")))

    return results


def _parse_markdown_preceded_by_path(response: str) -> list[tuple[str, str]]:
    """Extract files from code blocks preceded by a line with a file path."""
    # Look for lines ending with a file extension, followed by a code block
    pattern = re.compile(
        r"^(\S+\.\w+)\s*$\n```\w*\s*$\n(.*?)^```\s*$",
        re.MULTILINE | re.DOTALL,
    )
    matches = pattern.findall(response)
    if not matches:
        return []
    return [(_strip_and_unify_slashes(path), content.strip("\n")) for path, content in matches]


def _parse_single_file_fallback(response: str, expected_file: str) -> list[tuple[str, str]]:
    """Extract a single code block when exactly one file is expected."""
    pattern = re.compile(
        r"^```\w*\s*$\n(.*?)^```\s*$",
        re.MULTILINE | re.DOTALL,
    )
    matches = pattern.findall(response)
    if len(matches) == 1:
        return [(_strip_and_unify_slashes(expected_file), matches[0].strip("\n"))]
    return []


def execute_task(
    task: Task,
    llm_call: Callable[[str, str], str],
    sandbox: Sandbox,
    completed_tasks: list[Task] | None = None,
    context_budget: ContextBudget | None = None,
    dry_run: bool = False,
) -> ExecutionResult:
    """Execute a task by generating code via LLM and writing through sandbox."""
    logger.info("Executing task %s: %s", task.id, task.title)
    logger.debug("Task file_paths: %s", task.file_paths)
    if context_budget is None:
        context_budget = ContextBudget()

    # Gather existing file contents
    existing_contents: dict[str, str] = {}
    for fp in task.file_paths:
        try:
            existing_contents[fp] = sandbox.read_file(fp)
        except FileNotFoundError:
            pass
    logger.debug("Existing file contents available for %d files", len(existing_contents))

    # Build prompt within budget
    file_tree = sandbox.list_files()
    logger.debug("File tree contains %d entries", len(file_tree))
    system_prompt, user_prompt = build_task_prompt(
        task=task,
        system_prompt=_CODE_SYSTEM_PROMPT,
        existing_file_contents=existing_contents,
        completed_tasks=completed_tasks or [],
        project_file_tree=file_tree,
        budget=context_budget,
    )

    try:
        response = llm_call(system_prompt, user_prompt)
    except (
        LLMClientError,
        LLMResponseError,
        LLMRateLimitError,
        LLMAuthenticationError,
        LLMTimeoutError,
        LLMProviderError,
        OSError,
        ValueError,
        json.JSONDecodeError,
    ) as exc:
        return ExecutionResult(
            task_id=task.id,
            success=False,
            files_written=[],
            error=f"LLM call failed: {exc}",
        )
    logger.debug("LLM response received: %d chars", len(response))

    try:
        file_pairs = parse_llm_response(response, task.file_paths)
    except ExecutionError as exc:
        return ExecutionResult(
            task_id=task.id,
            success=False,
            files_written=[],
            error=str(exc),
        )
    logger.info("Extracted %d file(s) from LLM response", len(file_pairs))
    for path, content in file_pairs:
        logger.debug("  Extracted: %s (%d chars)", path, len(content))

    return _write_files(task, file_pairs, sandbox)


def execute_fix(
    task: Task,
    error_output: str,
    previous_code: dict[str, str],
    llm_call: Callable[[str, str], str],
    sandbox: Sandbox,
    context_budget: ContextBudget | None = None,
) -> ExecutionResult:
    """Re-execute a task with error context for fix/retry attempts."""
    logger.info("Executing fix for task %s (error context: %d chars)", task.id, len(error_output))
    logger.debug("Previous code available for %d files", len(previous_code))
    if context_budget is None:
        context_budget = ContextBudget()

    system_prompt, user_prompt = build_fix_prompt(
        task=task,
        error_output=error_output,
        previous_code=previous_code,
        system_prompt=_CODE_SYSTEM_PROMPT,
        budget=context_budget,
    )

    try:
        response = llm_call(system_prompt, user_prompt)
    except (
        LLMClientError,
        LLMResponseError,
        LLMRateLimitError,
        LLMAuthenticationError,
        LLMTimeoutError,
        LLMProviderError,
        OSError,
        ValueError,
        json.JSONDecodeError,
    ) as exc:
        return ExecutionResult(
            task_id=task.id,
            success=False,
            files_written=[],
            error=f"LLM call failed: {exc}",
        )
    logger.debug("Fix response received: %d chars", len(response))

    try:
        file_pairs = parse_llm_response(response, task.file_paths)
    except ExecutionError as exc:
        return ExecutionResult(
            task_id=task.id,
            success=False,
            files_written=[],
            error=str(exc),
        )

    return _write_files(task, file_pairs, sandbox)


def _write_files(
    task: Task,
    file_pairs: list[tuple[str, str]],
    sandbox: Sandbox,
) -> ExecutionResult:
    """Write extracted files through the sandbox."""
    files_written: list[str] = []
    skipped_count: int = 0

    # Normalize task.file_paths for comparison
    normalized_task_paths = {_normalize_path(fp) for fp in task.file_paths}

    try:
        for path, content in file_pairs:
            normalized = _normalize_path(path)
            logger.debug(
                "Path comparison: extracted=%r, normalized=%r, expected=%s",
                path,
                normalized,
                normalized_task_paths,
            )
            if normalized not in normalized_task_paths:
                logger.warning("Skipping unexpected file '%s' not in task.file_paths", path)
                skipped_count += 1
                continue
            sandbox.write_file(normalized, content)
            logger.info("Writing file: %s (%d chars)", normalized, len(content))
            files_written.append(normalized)
    except SandboxViolationError as exc:
        return ExecutionResult(
            task_id=task.id,
            success=False,
            files_written=files_written,
            error=f"Sandbox violation: {exc}",
            skipped_count=skipped_count,
        )
    logger.info("Write complete: %d written, %d skipped", len(files_written), skipped_count)

    return ExecutionResult(
        task_id=task.id,
        success=True,
        files_written=files_written,
        skipped_count=skipped_count,
    )
