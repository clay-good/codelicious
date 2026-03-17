"""Tests for the code executor module."""

from __future__ import annotations

import pathlib
import time

import pytest

from codelicious.errors import ExecutionError, LLMClientError
from codelicious.executor import (
    _normalize_path,
    _parse_strict_format,
    execute_fix,
    execute_task,
    parse_llm_response,
)
from codelicious.planner import Task
from codelicious.sandbox import Sandbox


def _make_task(
    file_paths: list[str] | None = None,
    task_id: str = "task_001",
) -> Task:
    return Task(
        id=task_id,
        title="Test Task",
        description="Do something.",
        file_paths=file_paths or ["src/main.py"],
        depends_on=[],
        validation="File exists",
        status="pending",
    )


# -- parse_llm_response: strict format ------------------------------------


def test_parse_strict_format_multi_file() -> None:
    response = (
        "--- FILE: src/main.py ---\n"
        "print('hello')\n"
        "--- END FILE ---\n"
        "\n"
        "--- FILE: src/utils.py ---\n"
        "def helper():\n"
        "    pass\n"
        "--- END FILE ---\n"
    )
    result = parse_llm_response(response)
    assert len(result) == 2
    assert result[0][0] == "src/main.py"
    assert "print('hello')" in result[0][1]
    assert result[1][0] == "src/utils.py"
    assert "def helper():" in result[1][1]


# -- parse_llm_response: markdown format -----------------------------------


def test_parse_markdown_with_filename() -> None:
    response = "Here is the code:\n\n```python src/main.py\nprint('hello')\n```\n"
    result = parse_llm_response(response)
    assert len(result) == 1
    assert result[0][0] == "src/main.py"
    assert "print('hello')" in result[0][1]


# -- parse_llm_response: single file fallback ------------------------------


def test_parse_single_file_fallback() -> None:
    response = "Here is the implementation:\n\n```\nprint('hello')\n```\n"
    result = parse_llm_response(response, expected_files=["main.py"])
    assert len(result) == 1
    assert result[0][0] == "main.py"
    assert "print('hello')" in result[0][1]


# -- parse_llm_response: empty response -----------------------------------


def test_parse_empty_response_raises() -> None:
    with pytest.raises(ExecutionError, match="Could not extract"):
        parse_llm_response("No code here at all.")


# -- parse_llm_response: preceded by path ----------------------------------


def test_parse_markdown_preceded_by_path() -> None:
    response = "src/main.py\n```python\nprint('hello')\n```\n"
    result = parse_llm_response(response)
    assert len(result) == 1
    assert result[0][0] == "src/main.py"


# -- execute_task: writes files via sandbox --------------------------------


def test_execute_task_writes_files(tmp_path: pathlib.Path) -> None:
    sandbox = Sandbox(tmp_path)
    task = _make_task(file_paths=["main.py"])

    llm_response = "--- FILE: main.py ---\nprint('hello')\n--- END FILE ---\n"

    result = execute_task(
        task=task,
        llm_call=lambda _s, _u: llm_response,
        sandbox=sandbox,
    )

    assert result.success is True
    assert "main.py" in result.files_written
    assert (tmp_path / "main.py").read_text(encoding="utf-8") == "print('hello')"


# -- execute_task: dry_run -------------------------------------------------


def test_execute_task_dry_run(tmp_path: pathlib.Path) -> None:
    sandbox = Sandbox(tmp_path, dry_run=True)
    task = _make_task(file_paths=["main.py"])

    llm_response = "--- FILE: main.py ---\nprint('hello')\n--- END FILE ---\n"

    result = execute_task(
        task=task,
        llm_call=lambda _s, _u: llm_response,
        sandbox=sandbox,
        dry_run=True,
    )

    assert result.success is True
    assert not (tmp_path / "main.py").exists()


# -- execute_task: skips unexpected files ----------------------------------


def test_execute_task_skips_unexpected_files(tmp_path: pathlib.Path) -> None:
    sandbox = Sandbox(tmp_path)
    task = _make_task(file_paths=["main.py"])

    llm_response = (
        "--- FILE: main.py ---\n"
        "print('hello')\n"
        "--- END FILE ---\n"
        "--- FILE: extra.py ---\n"
        "print('extra')\n"
        "--- END FILE ---\n"
    )

    result = execute_task(
        task=task,
        llm_call=lambda _s, _u: llm_response,
        sandbox=sandbox,
    )

    assert result.success is True
    assert "main.py" in result.files_written
    assert "extra.py" not in result.files_written
    assert not (tmp_path / "extra.py").exists()


# -- execute_task: sandbox violation returns failure -----------------------


def test_execute_task_sandbox_violation(tmp_path: pathlib.Path) -> None:
    sandbox = Sandbox(tmp_path, max_file_size=10)
    task = _make_task(file_paths=["main.py"])

    llm_response = "--- FILE: main.py ---\n" + "x" * 100 + "\n--- END FILE ---\n"

    result = execute_task(
        task=task,
        llm_call=lambda _s, _u: llm_response,
        sandbox=sandbox,
    )

    assert result.success is False
    assert "Sandbox violation" in (result.error or "")


# -- execute_fix: includes error in prompt ---------------------------------


def test_execute_fix_includes_error(tmp_path: pathlib.Path) -> None:
    sandbox = Sandbox(tmp_path)
    task = _make_task(file_paths=["main.py"])

    captured_prompts: list[str] = []

    def mock_llm(_sys: str, user: str) -> str:
        captured_prompts.append(user)
        return "--- FILE: main.py ---\nprint('fixed')\n--- END FILE ---\n"

    result = execute_fix(
        task=task,
        error_output="NameError: name 'foo' is not defined",
        previous_code={"main.py": "print(foo)"},
        llm_call=mock_llm,
        sandbox=sandbox,
    )

    assert result.success is True
    assert "main.py" in result.files_written
    # The error should appear in the prompt sent to the LLM
    assert "NameError" in captured_prompts[0]


# -- execute_task: LLM call failure ----------------------------------------


def test_execute_task_llm_failure(tmp_path: pathlib.Path) -> None:
    sandbox = Sandbox(tmp_path)
    task = _make_task()

    def failing_llm(_s: str, _u: str) -> str:
        raise LLMClientError("API down")

    result = execute_task(
        task=task,
        llm_call=failing_llm,
        sandbox=sandbox,
    )

    assert result.success is False
    assert "LLM call failed" in (result.error or "")


# -- Phase 2: skipped_count on ExecutionResult -----------------------------


def test_execution_result_skipped_count(tmp_path: pathlib.Path) -> None:
    sandbox = Sandbox(tmp_path)
    task = _make_task(file_paths=["main.py"])

    # LLM returns two files but task only expects main.py; extra.py should be skipped
    llm_response = "--- FILE: main.py ---\nx = 1\n--- END FILE ---\n--- FILE: extra.py ---\ny = 2\n--- END FILE ---\n"

    result = execute_task(
        task=task,
        llm_call=lambda _s, _u: llm_response,
        sandbox=sandbox,
    )

    assert result.success is True
    assert "main.py" in result.files_written
    assert result.skipped_count == 1


# -- Phase 6: Executor Response Parsing Hardening -------------------------


def test_file_marker_in_content_does_not_split() -> None:
    """The string '--- FILE: foo ---' inside file content must not trigger a split."""
    response = "--- FILE: main.py ---\n# This file references --- FILE: other.py ---\nx = 1\n--- END FILE ---\n"
    result = parse_llm_response(response)
    # Should produce exactly one file, not two
    assert len(result) == 1
    assert result[0][0] == "main.py"
    assert "--- FILE: other.py ---" in result[0][1]


def test_empty_file_content_written(tmp_path: pathlib.Path) -> None:
    """A FILE block with zero content should produce an empty file, not be skipped."""
    response = "--- FILE: __init__.py ---\n--- END FILE ---\n"
    result = parse_llm_response(response, expected_files=["__init__.py"])
    assert len(result) == 1
    assert result[0][0] == "__init__.py"
    assert result[0][1] == ""

    # Also verify it actually gets written through sandbox
    sandbox = Sandbox(tmp_path)
    task = _make_task(file_paths=["__init__.py"])
    exec_result = execute_task(
        task=task,
        llm_call=lambda _s, _u: response,
        sandbox=sandbox,
    )
    assert exec_result.success is True
    assert "__init__.py" in exec_result.files_written
    assert (tmp_path / "__init__.py").read_text(encoding="utf-8") == ""


def test_file_path_whitespace_stripped() -> None:
    """Leading/trailing whitespace in extracted file paths should be stripped."""
    # Build a response where the path has surrounding spaces
    response = "--- FILE:  main.py  ---\nx = 1\n--- END FILE ---\n"
    # The strict format pattern should strip the path
    result = parse_llm_response(response)
    assert len(result) == 1
    assert result[0][0] == "main.py"


def test_all_strategies_fail_includes_preview() -> None:
    """Error message must include tried strategies and a response preview."""
    bad_response = "No files here at all -- just plain text content."
    with pytest.raises(ExecutionError) as exc_info:
        parse_llm_response(bad_response)
    msg = str(exc_info.value)
    assert "strict_format" in msg
    assert "No files here at all" in msg


def test_backslash_paths_normalized() -> None:
    """Windows-style backslash paths in LLM output should be normalized to forward slashes."""
    response = "--- FILE: src\\utils\\helper.py ---\nx = 1\n--- END FILE ---\n"
    result = parse_llm_response(response)
    assert len(result) == 1
    assert result[0][0] == "src/utils/helper.py"


# -- Phase 15: LLM Response Adversarial Tests ------------------------------


def test_parse_response_with_nested_code_blocks() -> None:
    """Nested markdown code blocks inside file content are handled without crash."""
    response = '```python\n# main.py\ndef f():\n    """\n    ```nested```\n    """\n    pass\n```\n'
    # May succeed or return empty; must not raise an unhandled exception
    result = parse_llm_response(response, expected_files=["main.py"])
    assert isinstance(result, list)


def test_parse_response_extremely_large() -> None:
    """A response larger than 1 MB is parsed without crashing."""
    # Use the strict format so the parser has something to match
    large_content = "x = 1\n" * 200_000  # ~1.4 MB
    response = "--- FILE: big.py ---\n" + large_content + "--- END FILE ---\n"
    result = parse_llm_response(response)
    assert isinstance(result, list)
    if result:
        assert result[0][0] == "big.py"
        assert len(result[0][1]) > 0


def test_parse_response_binary_content() -> None:
    """A response with non-UTF-8 content handled without unhandled exception."""
    # Simulate a response that contains replacement characters (U+FFFD)
    response = "--- FILE: data.py ---\n\ufffd\ufffd\ufffd\n--- END FILE ---\n"
    result = parse_llm_response(response)
    assert isinstance(result, list)


def test_parse_response_conflicting_formats() -> None:
    """A response mixing strict and markdown formats is parsed deterministically."""
    # Strict format block takes priority
    response = "--- FILE: strict.py ---\nx = 1\n--- END FILE ---\n```python\n# markdown.py\ny = 2\n```\n"
    result = parse_llm_response(response)
    assert isinstance(result, list)
    assert len(result) >= 1
    # Strict format must win (first strategy tried)
    assert any(path == "strict.py" for path, _ in result)


# -- Phase 3: Exception Handling Tightening Tests --------------------------


def test_system_exit_not_caught(tmp_path: pathlib.Path) -> None:
    """SystemExit from LLM call should propagate, not be swallowed."""
    sandbox = Sandbox(tmp_path)
    task = _make_task()

    def llm_raises_system_exit(_s: str, _u: str) -> str:
        raise SystemExit(1)

    with pytest.raises(SystemExit):
        execute_task(
            task=task,
            llm_call=llm_raises_system_exit,
            sandbox=sandbox,
        )


def test_keyboard_interrupt_not_caught(tmp_path: pathlib.Path) -> None:
    """KeyboardInterrupt from LLM call should propagate, not be swallowed."""
    sandbox = Sandbox(tmp_path)
    task = _make_task()

    def llm_raises_keyboard_interrupt(_s: str, _u: str) -> str:
        raise KeyboardInterrupt()

    with pytest.raises(KeyboardInterrupt):
        execute_task(
            task=task,
            llm_call=llm_raises_keyboard_interrupt,
            sandbox=sandbox,
        )


def test_execute_fix_system_exit_not_caught(tmp_path: pathlib.Path) -> None:
    """SystemExit from LLM call in execute_fix should propagate."""
    sandbox = Sandbox(tmp_path)
    task = _make_task()

    def llm_raises_system_exit(_s: str, _u: str) -> str:
        raise SystemExit(1)

    with pytest.raises(SystemExit):
        execute_fix(
            task=task,
            error_output="some error",
            previous_code={"main.py": "x = 1"},
            llm_call=llm_raises_system_exit,
            sandbox=sandbox,
        )


def test_execute_fix_keyboard_interrupt_not_caught(tmp_path: pathlib.Path) -> None:
    """KeyboardInterrupt from LLM call in execute_fix should propagate."""
    sandbox = Sandbox(tmp_path)
    task = _make_task()

    def llm_raises_keyboard_interrupt(_s: str, _u: str) -> str:
        raise KeyboardInterrupt()

    with pytest.raises(KeyboardInterrupt):
        execute_fix(
            task=task,
            error_output="some error",
            previous_code={"main.py": "x = 1"},
            llm_call=llm_raises_keyboard_interrupt,
            sandbox=sandbox,
        )


def test_unexpected_exception_propagates(tmp_path: pathlib.Path) -> None:
    """RuntimeError from LLM call should propagate, not be caught."""
    sandbox = Sandbox(tmp_path)
    task = _make_task()

    def llm_raises_runtime_error(_s: str, _u: str) -> str:
        raise RuntimeError("unexpected failure")

    with pytest.raises(RuntimeError, match="unexpected failure"):
        execute_task(
            task=task,
            llm_call=llm_raises_runtime_error,
            sandbox=sandbox,
        )


def test_execute_fix_unexpected_exception_propagates(tmp_path: pathlib.Path) -> None:
    """RuntimeError from LLM call in execute_fix should propagate."""
    sandbox = Sandbox(tmp_path)
    task = _make_task()

    def llm_raises_runtime_error(_s: str, _u: str) -> str:
        raise RuntimeError("unexpected failure")

    with pytest.raises(RuntimeError, match="unexpected failure"):
        execute_fix(
            task=task,
            error_output="some error",
            previous_code={"main.py": "x = 1"},
            llm_call=llm_raises_runtime_error,
            sandbox=sandbox,
        )


# -- Regex DoS vulnerability tests (spec-v8 Phase 2) ------------------------


def test_parse_strict_format_large_input() -> None:
    """A 1 MB response with proper markers parses quickly (< 1 second)."""
    # Generate ~1 MB of content (each line is 6 chars: "x = 1\n")
    large_content = "x = 1\n" * 170_000  # ~1.02 MB
    response = f"--- FILE: big.py ---\n{large_content}--- END FILE ---\n"
    assert len(response) > 1_000_000, "Test input should be > 1 MB"

    start = time.perf_counter()
    result = _parse_strict_format(response)
    elapsed = time.perf_counter() - start

    assert elapsed < 1.0, f"Parsing took {elapsed:.2f}s, expected < 1s"
    assert len(result) == 1
    assert result[0][0] == "big.py"
    assert len(result[0][1]) > 0


def test_parse_strict_format_malformed_no_hang() -> None:
    """Response with many dashes but no proper markers returns empty list quickly."""
    # Create a pathological input with many dashes that could cause backtracking
    malformed_input = "---" * 10_000 + " FILE " + "---" * 10_000
    assert len(malformed_input) > 50_000, "Test input should have many dashes"

    start = time.perf_counter()
    result = _parse_strict_format(malformed_input)
    elapsed = time.perf_counter() - start

    assert elapsed < 1.0, f"Parsing took {elapsed:.2f}s, expected < 1s"
    assert result == []


# -- _normalize_path tests (spec-v8 Phase 4, Issue 15) ----------------------


def test_normalize_path_leading_dot_slash() -> None:
    """Leading ./ prefix should be stripped."""
    result = _normalize_path("./src/main.py")
    assert result == "src/main.py"


def test_normalize_path_double_slash() -> None:
    """Consecutive slashes should be collapsed to a single slash."""
    result = _normalize_path("src//main.py")
    assert result == "src/main.py"


def test_normalize_path_backslash() -> None:
    """Backslashes should be converted to forward slashes."""
    result = _normalize_path("src\\main.py")
    assert result == "src/main.py"


# -- _write_files path normalization (spec-v8 Phase 5, Issue 21) -------------


def test_write_files_normalizes_path_comparison(tmp_path: pathlib.Path) -> None:
    """task.file_paths=["./src/main.py"], extracted="src/main.py" -> matches."""
    sandbox = Sandbox(tmp_path)
    # Task declares file with ./ prefix
    task = _make_task(file_paths=["./src/main.py"])

    # LLM returns file without ./ prefix
    llm_response = "--- FILE: src/main.py ---\nprint('hello')\n--- END FILE ---\n"

    result = execute_task(
        task=task,
        llm_call=lambda _s, _u: llm_response,
        sandbox=sandbox,
    )

    assert result.success is True
    # The normalized path should be in files_written
    assert "src/main.py" in result.files_written
    assert result.skipped_count == 0
    # Verify file was actually written
    assert (tmp_path / "src" / "main.py").read_text(encoding="utf-8") == "print('hello')"


# -- spec-v14 Phase 4: Executor response parsing backtracking -----------------


def test_partial_extraction_tries_next_strategy() -> None:
    """When strategy 1 extracts fewer files than strategy 2, strategy 2 wins.

    This tests the backtracking behavior: if strategy 1 partially succeeds
    (extracts 1 file) but strategy 2 extracts more files (3 files), the
    executor should return the result from strategy 2.
    """
    # Create a response where:
    # - Strategy 1 (strict format) will extract only 1 file
    # - Strategy 2 (markdown with filename) will extract 3 files
    response = (
        # This matches strategy 1 (strict format) - extracts 1 file
        "--- FILE: file1.py ---\n"
        "x = 1\n"
        "--- END FILE ---\n"
        "\n"
        # These match strategy 2 (markdown with filename) - extracts 3 files total
        "```python file1.py\n"
        "x = 1\n"
        "```\n"
        "\n"
        "```python file2.py\n"
        "y = 2\n"
        "```\n"
        "\n"
        "```python file3.py\n"
        "z = 3\n"
        "```\n"
    )

    # Expected files list (3 files)
    expected_files = ["file1.py", "file2.py", "file3.py"]

    # Parse the response
    result = parse_llm_response(response, expected_files=expected_files)

    # Strategy 1 would extract 1 file, but strategy 2 extracts 3 files
    # The backtracking logic should select strategy 2's result
    assert len(result) == 3, f"Expected 3 files, got {len(result)}"

    # Verify all three files are present
    file_paths = [path for path, _ in result]
    assert "file1.py" in file_paths
    assert "file2.py" in file_paths
    assert "file3.py" in file_paths
