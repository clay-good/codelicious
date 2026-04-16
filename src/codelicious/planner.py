"""Generates an ordered execution plan from parsed spec tasks."""

from __future__ import annotations

import json
import logging
import pathlib
import re
import urllib.parse
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

from codelicious.errors import (
    IntentRejectedError,
    InvalidPlanError,
    PlanningError,
    PromptInjectionError,
)
from codelicious.parser import Section

__all__ = [
    "DENIED_PATH_SEGMENTS",
    "Task",
    "_fully_decode_path",
    "classify_intent",
    "create_plan",
    "load_plan",
    "replan",
    "save_plan",
]

logger = logging.getLogger("codelicious")

_REQUIRED_TASK_KEYS: frozenset[str] = frozenset(
    {
        "id",
        "title",
        "description",
        "file_paths",
        "depends_on",
        "validation",
        "status",
    }
)

DENIED_PATH_SEGMENTS: frozenset[str] = frozenset({".git", ".env", "__pycache__", ".codelicious"})

_INJECTION_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    ("SYSTEM:", re.compile(r"SYSTEM:", re.IGNORECASE)),
    ("IGNORE PREVIOUS", re.compile(r"IGNORE\s+PREVIOUS", re.IGNORECASE)),
    ("FORGET", re.compile(r"\bFORGET\b", re.IGNORECASE)),
    ("NEW INSTRUCTIONS", re.compile(r"NEW\s+INSTRUCTIONS", re.IGNORECASE)),
    ("OVERRIDE", re.compile(r"\bOVERRIDE\b", re.IGNORECASE)),
    ("DISREGARD", re.compile(r"\bDISREGARD\b", re.IGNORECASE)),
]

_MAX_JSON_SIZE = 5 * 1024 * 1024  # 5 MB
_MAX_JSON_DEPTH = 50


def _check_json_depth(obj: Any, max_depth: int = _MAX_JSON_DEPTH, _current: int = 0) -> None:
    """Raise ValueError if JSON structure exceeds max nesting depth."""
    if _current > max_depth:
        raise ValueError(f"JSON nesting depth exceeds limit of {max_depth}")
    if isinstance(obj, dict):
        for v in obj.values():
            _check_json_depth(v, max_depth, _current + 1)
    elif isinstance(obj, list):
        for item in obj:
            _check_json_depth(item, max_depth, _current + 1)


def _safe_json_loads(text: str, max_size: int = _MAX_JSON_SIZE, max_depth: int = _MAX_JSON_DEPTH) -> Any:
    """Parse JSON with size and depth limits to prevent DoS."""
    if len(text) > max_size:
        raise ValueError(f"JSON payload size {len(text)} exceeds limit of {max_size}")
    data = json.loads(text)
    _check_json_depth(data, max_depth)
    return data


_SYSTEM_PROMPT: str = """\
You are a senior software architect. Your job is to decompose a \
software specification into an ordered list of implementation tasks.

Return ONLY a valid JSON array. No markdown fences, no commentary, \
no explanation. Just the JSON array.

Each task object must have these exact keys:
  "id": a unique string like "task_001",
  "title": short title,
  "description": detailed description of what to implement,
  "file_paths": list of file paths this task will create or modify,
  "depends_on": list of task IDs this task depends on (can be empty),
  "validation": description of how to verify the task is correct,
  "status": "pending"

Order tasks by dependency: a task must come after all tasks it \
depends on.

Example:
[
  {
    "id": "task_001",
    "title": "Create data model",
    "description": "Define the User dataclass with fields...",
    "file_paths": ["src/models.py"],
    "depends_on": [],
    "validation": "File exists and contains User class",
    "status": "pending"
  }
]
"""

_CLASSIFIER_SYSTEM_PROMPT: str = """\
You are a security classifier for a code generation system.
Determine whether a software specification describes legitimate software development.

Respond with exactly one word: ALLOW or REJECT

ALLOW if the spec describes any standard software application or development work.
REJECT if the spec describes: malware, credential harvesting, phishing tools,
DDoS tools, unauthorized access tools, software designed to harm or deceive users,
or content clearly illegal in most jurisdictions.

When in doubt: ALLOW. Only REJECT when the intent is unambiguous.
Do not explain. Respond with one word only.
"""

_REPLAN_SYSTEM_PROMPT: str = """\
You are a senior software architect. You are revising an existing \
implementation plan because some tasks have failed.

You will be given: completed tasks, failed tasks with error details, \
and remaining tasks from the original plan.

Create a REVISED plan for the remaining work only. Do not include \
tasks that are already completed. You may restructure, split, merge, \
or replace the failed and remaining tasks as needed.

Return ONLY a valid JSON array with the same task format. No \
markdown fences, no commentary. Just the JSON array.

Each task must have: "id", "title", "description", "file_paths", \
"depends_on", "validation", "status" (set to "pending").

Use new task IDs (e.g., "replan_001") to avoid conflicts with \
existing task IDs.
"""


@dataclass(frozen=True)
class Task:
    """A single implementation task in the execution plan."""

    id: str
    title: str
    description: str
    file_paths: list[str]
    depends_on: list[str]
    validation: str
    status: str

    def to_dict(self) -> dict[str, Any]:
        """Serialize this task to a dictionary."""
        return {
            "id": self.id,
            "title": self.title,
            "description": self.description,
            "file_paths": list(self.file_paths),
            "depends_on": list(self.depends_on),
            "validation": self.validation,
            "status": self.status,
        }

    @classmethod
    def from_dict(cls, data: Any) -> Task:
        """Deserialize a task from a dictionary, validating required keys."""
        if not isinstance(data, dict):
            raise InvalidPlanError(f"Task must be a dict, got {type(data).__name__}")

        missing = _REQUIRED_TASK_KEYS - set(data.keys())
        if missing:
            raise InvalidPlanError(f"Task missing required keys: {', '.join(sorted(missing))}")

        if not isinstance(data["id"], str):
            raise InvalidPlanError("Task 'id' must be a string")
        if not re.fullmatch(r"[a-zA-Z0-9_-]+", data["id"]):
            raise InvalidPlanError(f"Task 'id' must match [a-zA-Z0-9_-]+, got {data['id']!r}")
        if not isinstance(data["title"], str):
            raise InvalidPlanError("Task 'title' must be a string")
        if not isinstance(data["description"], str):
            raise InvalidPlanError("Task 'description' must be a string")
        if not isinstance(data["file_paths"], list):
            raise InvalidPlanError("Task 'file_paths' must be a list")
        if not isinstance(data["depends_on"], list):
            raise InvalidPlanError("Task 'depends_on' must be a list")
        if not isinstance(data["validation"], str):
            raise InvalidPlanError("Task 'validation' must be a string")
        if not isinstance(data["status"], str):
            raise InvalidPlanError("Task 'status' must be a string")

        return cls(
            id=data["id"],
            title=data["title"],
            description=data["description"],
            file_paths=data["file_paths"],
            depends_on=data["depends_on"],
            validation=data["validation"],
            status=data["status"],
        )


def _check_injection(spec_text: str) -> None:
    """Reject specs with prompt injection patterns.

    Always checks ALL patterns to prevent timing side-channel (REV-P2-5).
    """
    logger.debug("Scanning for injection patterns (%d patterns)", len(_INJECTION_PATTERNS))
    matches = []
    for label, pattern in _INJECTION_PATTERNS:
        if pattern.search(spec_text):
            matches.append(label)

    if matches:
        raise PromptInjectionError(f"Build rejected — spec contains adversarial content: {', '.join(matches)}")
    logger.debug("No injection patterns detected")


def classify_intent(spec_text: str, llm_call: Callable[[str, str], str]) -> bool:
    """Return True if safe to build, False if rejected.

    Uses sampling from the spec to handle large specs - checks beginning,
    middle, and end sections. Fails CLOSED by default on all errors except
    json.JSONDecodeError (S20-P3-1).
    """
    logger.info("Running intent classification on spec (%d chars)", len(spec_text))

    # Sample strategy: if short enough, use all; otherwise sample beginning, middle, end
    spec_len = len(spec_text)
    if spec_len <= 8000:
        combined_sample = spec_text
    else:
        # Sample: first 4000 + middle 2000 + last 2000
        first_part = spec_text[:4000]
        middle_start = (spec_len - 2000) // 2
        middle_part = spec_text[middle_start : middle_start + 2000]
        last_part = spec_text[-2000:]
        combined_sample = "\n---\n".join([first_part, middle_part, last_part])

    logger.info(
        "Intent classification: spec=%d chars, sample=%d chars",
        len(spec_text),
        len(combined_sample),
    )

    # S20-P3-1: Fail-closed by default.  The only exception that fails OPEN
    # is json.JSONDecodeError (we got an LLM response but could not parse the
    # classification).  Every other exception — including KeyError, ValueError,
    # AttributeError, RuntimeError, and unexpected programming errors — results
    # in rejecting the spec.  This prevents a broken or compromised classifier
    # from silently allowing a malicious spec through.
    try:
        response = llm_call(_CLASSIFIER_SYSTEM_PROMPT, combined_sample)
        result = response.strip().upper() != "REJECT"
        logger.info("Intent classification result: %s", "ALLOW" if result else "REJECT")
        return result
    except json.JSONDecodeError as exc:
        # Fail OPEN: we got a response but could not parse it as JSON.
        # The LLM likely returned plain text — treat as non-rejection.
        logger.warning("Intent classifier JSON parse error, allowing build: %s", exc)
        return True
    except Exception as exc:
        # Fail CLOSED: all other errors → reject the spec as a precaution.
        logger.error("Intent classifier failed, rejecting build: %s: %s", type(exc).__name__, exc)
        return False


_MAX_TASK_COUNT: int = 100


def _validate_task_count(tasks: list[Task]) -> None:
    """Reject plans with more than 100 tasks."""
    if len(tasks) > _MAX_TASK_COUNT:
        raise InvalidPlanError(f"Plan has {len(tasks)} tasks, which exceeds the limit of {_MAX_TASK_COUNT}")


def _validate_unique_task_ids(tasks: list[Task]) -> None:
    """Reject plans with duplicate task IDs."""
    seen: set[str] = set()
    duplicates: list[str] = []
    for task in tasks:
        if task.id in seen:
            duplicates.append(task.id)
        seen.add(task.id)
    if duplicates:
        raise InvalidPlanError(f"Duplicate task IDs found: {', '.join(sorted(set(duplicates)))}")


def _validate_dependency_references(tasks: list[Task]) -> None:
    """Reject plans where depends_on references a nonexistent task ID."""
    task_ids = {task.id for task in tasks}
    for task in tasks:
        for dep_id in task.depends_on:
            if dep_id not in task_ids:
                raise InvalidPlanError(f"Task '{task.id}' depends on '{dep_id}' which does not exist in the plan")


def _validate_no_circular_dependencies(tasks: list[Task]) -> None:
    """Detect circular dependencies using DFS cycle detection."""
    adjacency: dict[str, list[str]] = {task.id: list(task.depends_on) for task in tasks}

    # DFS states: 0 = unvisited, 1 = in progress, 2 = done
    state: dict[str, int] = {task.id: 0 for task in tasks}
    stack: list[str] = []

    def dfs(node: str) -> None:
        state[node] = 1
        stack.append(node)
        for neighbor in adjacency.get(node, []):
            if state.get(neighbor, 2) == 1:
                # Found a cycle — extract the cycle portion from the stack
                cycle_start = stack.index(neighbor)
                cycle = [*stack[cycle_start:], neighbor]
                raise InvalidPlanError(f"Circular dependency detected: {' -> '.join(cycle)}")
            if state.get(neighbor, 2) == 0:
                dfs(neighbor)
        stack.pop()
        state[node] = 2

    for task in tasks:
        if state[task.id] == 0:
            dfs(task.id)


def _validate_replan_ids(new_tasks: list[Task], completed_ids: set[str]) -> None:
    """Reject replan if new task IDs collide with completed task IDs."""
    conflicts = [task.id for task in new_tasks if task.id in completed_ids]
    if conflicts:
        raise InvalidPlanError(f"Replan task IDs conflict with completed task IDs: {', '.join(sorted(conflicts))}")


def _validate_topological_order(tasks: list[Task]) -> None:
    """Warn if tasks are not in topological order (dependencies before dependents).

    This is a soft validation - the loop_controller will re-sort anyway, but
    detecting misordered tasks can help catch LLM output issues.
    """
    seen_ids: set[str] = set()
    misordered: list[tuple[str, str]] = []
    for task in tasks:
        for dep_id in task.depends_on:
            if dep_id not in seen_ids:
                misordered.append((task.id, dep_id))
        seen_ids.add(task.id)
    if misordered:
        logger.warning(
            "%d task(s) appear before their dependencies — loop_controller will re-sort: %s",
            len(misordered),
            ", ".join(f"{tid}→{dep}" for tid, dep in misordered[:5]),
        )


_MAX_DECODE_ROUNDS: int = 10


def _fully_decode_path(raw_path: str, max_rounds: int = _MAX_DECODE_ROUNDS) -> str:
    """Decode a path repeatedly until stable, to defeat multi-layer encoding attacks.

    This handles triple-encoding (%25252e%25252e), quadruple-encoding, etc.
    Stops when the output equals the input or after max_rounds iterations.
    """
    decoded = raw_path
    for _ in range(max_rounds):
        try:
            next_decoded = urllib.parse.unquote(decoded)
        except (ValueError, TypeError):
            # If decoding fails, stop with current value
            break
        if next_decoded == decoded:
            # Stable - no more decoding needed
            break
        decoded = next_decoded
    return decoded


def _validate_file_paths(tasks: list[Task]) -> None:
    """Reject unsafe file paths in tasks."""
    for task in tasks:
        for fp in task.file_paths:
            logger.debug("Validating file path: %s", fp)

            # Fully decode URL-encoded paths iteratively to catch any level of encoding
            # (%252e%252e → %2e%2e → .. after 2 rounds)
            # (%25252e%25252e → %252e%252e → %2e%2e → .. after 3 rounds)
            fully_decoded = _fully_decode_path(fp)

            # Check for URL-encoded separators in raw path (before full decode)
            lower_fp = fp.lower()
            if "%2e" in lower_fp or "%2f" in lower_fp:
                raise InvalidPlanError(
                    f"File path contains URL-encoded traversal: {fp}",
                    path=fp,
                )

            # Check for backslash-based traversal in raw or decoded path
            if "\\" in fp or "\\" in fully_decoded:
                raise InvalidPlanError(f"File path contains backslash: {fp}", path=fp)

            # Check for traversal in both raw and fully decoded paths
            # Use split on both / and \ to catch platform-specific traversal
            for path_variant in (fp, fully_decoded):
                # Check for ".." segments in both forward and backslash paths
                posix_parts = path_variant.split("/")
                windows_parts = path_variant.split("\\")
                if ".." in posix_parts or ".." in windows_parts:
                    raise InvalidPlanError(
                        f"File path contains traversal sequence: {fp}",
                        path=fp,
                    )

                # Check for absolute paths
                if path_variant.startswith("/"):
                    raise InvalidPlanError(f"File path is absolute: {fp}", path=fp)

                # Check for null bytes
                if "\x00" in path_variant:
                    raise InvalidPlanError(f"File path contains null byte: {fp!r}", path=fp)

                # Check for denied path segments
                for part in pathlib.PurePosixPath(path_variant).parts:
                    if part in DENIED_PATH_SEGMENTS:
                        raise InvalidPlanError(
                            f"Task '{task.id}' references denied path segment '{part}' in file path: {fp}"
                        )


def _parse_json_response(response: str) -> list[dict[str, Any]]:
    """Extract a JSON array from an LLM response."""
    text = response.strip()

    # Strip markdown fences if present
    if text.startswith("```"):
        lines = text.splitlines()
        # Remove first and last lines (fences)
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()

    data = _safe_json_loads(text)
    if not isinstance(data, list):
        raise ValueError("Response is not a JSON array")
    return data


def _ensure_build_state_dir(project_dir: pathlib.Path) -> pathlib.Path:
    """Create the .codelicious directory with restricted permissions."""
    build_state_dir = project_dir / ".codelicious"
    build_state_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
    return build_state_dir


def create_plan(
    sections: list[Section],
    llm_call: Callable[[str, str], str],
    project_dir: pathlib.Path,
) -> list[Task]:
    """Create an execution plan from parsed spec sections using the LLM."""
    # Concatenate sections into a spec string
    spec_parts: list[str] = []
    for section in sections:
        if section.title:
            heading = "#" * section.level + " " + section.title
            spec_parts.append(heading)
        if section.body:
            spec_parts.append(section.body)
    spec_text = "\n\n".join(spec_parts)

    logger.info("Creating plan from %d sections (%d total chars)", len(sections), len(spec_text))

    # Intent classification — must pass before any LLM planning calls
    if not classify_intent(spec_text, llm_call):
        raise IntentRejectedError("Spec rejected by intent classifier.")

    # Check for prompt injection
    _check_injection(spec_text)

    # Try up to 3 times to get valid JSON
    errors: list[str] = []
    for attempt in range(3):
        logger.debug("Plan creation attempt %d/3", attempt + 1)
        response = llm_call(_SYSTEM_PROMPT, spec_text)

        try:
            raw_tasks = _parse_json_response(response)
            logger.debug("LLM returned %d raw task objects", len(raw_tasks))
        except (json.JSONDecodeError, ValueError) as exc:
            msg = f"attempt {attempt + 1}: {exc}"
            logger.warning("JSON parse failed (%s)", msg)
            errors.append(msg)
            continue

        try:
            tasks = [Task.from_dict(t) for t in raw_tasks]
            if len(tasks) == 0:
                raise InvalidPlanError("LLM returned an empty plan with zero tasks")
            _validate_task_count(tasks)
            _validate_unique_task_ids(tasks)
            _validate_dependency_references(tasks)
            _validate_no_circular_dependencies(tasks)
            _validate_topological_order(tasks)
            _validate_file_paths(tasks)
        except InvalidPlanError:
            raise
        except Exception as exc:
            msg = f"attempt {attempt + 1}: {exc}"
            logger.warning("Task validation failed (%s)", msg)
            errors.append(msg)
            continue

        # Success - log validation results and save
        total_deps = sum(len(t.depends_on) for t in tasks)
        logger.info("Plan validated: %d tasks, %d total dependencies", len(tasks), total_deps)
        for t in tasks:
            logger.debug(
                "  Task %s: %s (files: %s, deps: %s)",
                t.id,
                t.title,
                t.file_paths,
                t.depends_on,
            )
        build_state_dir = _ensure_build_state_dir(project_dir)
        _write_plan_file(tasks, build_state_dir / "plan.json")
        return tasks

    raise PlanningError(f"Failed to parse LLM response after 3 attempts: {'; '.join(errors)}")


def replan(
    completed_tasks: list[Task],
    failed_tasks: list[Task],
    remaining_tasks: list[Task],
    failure_summary: str,
    llm_call: Callable[[str, str], str],
    project_dir: pathlib.Path,
) -> list[Task]:
    """Re-plan remaining work based on current state and failures."""
    logger.info(
        "Replanning: %d completed, %d failed, %d remaining",
        len(completed_tasks),
        len(failed_tasks),
        len(remaining_tasks),
    )

    context_parts: list[str] = []

    context_parts.append("## Completed tasks:")
    for t in completed_tasks:
        context_parts.append(f"- {t.id}: {t.title}")

    context_parts.append("\n## Failed tasks:")
    for t in failed_tasks:
        context_parts.append(f"- {t.id}: {t.title}")

    context_parts.append(f"\n## Failure details:\n{failure_summary}")

    context_parts.append("\n## Remaining tasks from original plan:")
    for t in remaining_tasks:
        context_parts.append(f"- {t.id}: {t.title} -- {t.description}")

    user_prompt = "\n".join(context_parts)

    errors: list[str] = []
    for attempt in range(3):
        response = llm_call(_REPLAN_SYSTEM_PROMPT, user_prompt)

        try:
            raw_tasks = _parse_json_response(response)
        except (json.JSONDecodeError, ValueError) as exc:
            msg = f"attempt {attempt + 1}: {exc}"
            logger.warning("Replan JSON parse failed (%s)", msg)
            errors.append(msg)
            continue

        try:
            new_tasks = [Task.from_dict(t) for t in raw_tasks]
            completed_ids = {t.id for t in completed_tasks}
            _validate_task_count(new_tasks)
            _validate_unique_task_ids(new_tasks)
            _validate_replan_ids(new_tasks, completed_ids)
            _validate_dependency_references(new_tasks)
            _validate_no_circular_dependencies(new_tasks)
            _validate_file_paths(new_tasks)
        except InvalidPlanError:
            raise
        except Exception as exc:
            msg = f"attempt {attempt + 1}: {exc}"
            logger.warning("Replan validation failed (%s)", msg)
            errors.append(msg)
            continue

        # Save the combined plan
        logger.info("Replan produced %d new tasks", len(new_tasks))
        build_state_dir = _ensure_build_state_dir(project_dir)
        all_tasks = list(completed_tasks) + new_tasks
        _write_plan_file(all_tasks, build_state_dir / "plan.json")
        return new_tasks

    raise PlanningError(f"Failed to parse replan response after 3 attempts: {'; '.join(errors)}")


def save_plan(tasks: list[Task], project_dir: pathlib.Path) -> None:
    """Save a task list to .codelicious/plan.json."""
    build_state_dir = _ensure_build_state_dir(project_dir)
    _write_plan_file(tasks, build_state_dir / "plan.json")


def load_plan(project_dir: pathlib.Path) -> list[Task]:
    """Load a task list from .codelicious/plan.json."""
    plan_file = project_dir / ".codelicious" / "plan.json"
    if not plan_file.is_file():
        raise PlanningError(f"Plan file not found: {plan_file}", path=str(plan_file))

    try:
        raw = plan_file.read_text(encoding="utf-8")
        data = _safe_json_loads(raw)
    except (json.JSONDecodeError, ValueError) as exc:
        raise PlanningError(f"Invalid plan JSON: {exc}", path=str(plan_file)) from exc

    if not isinstance(data, list):
        raise PlanningError("Plan file does not contain a JSON array")

    return [Task.from_dict(t) for t in data]


def _write_plan_file(tasks: list[Task], path: pathlib.Path) -> None:
    """Write tasks to a JSON file."""
    data = [t.to_dict() for t in tasks]
    path.write_text(
        json.dumps(data, indent=2) + "\n",
        encoding="utf-8",
    )
