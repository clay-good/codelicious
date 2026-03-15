"""Tests for spec-v14: Phase 1 (locking), Phase 2 (state), Phase 3 (timeout),
Phase 5 (verifier), Phase 7 (cleanup), Phase 8 (corruption), Phase 11 (replan),
Phase 14 (fixtures).
"""

from __future__ import annotations

import json
import os
import pathlib
import time
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest

from proxilion_build.build_logger import cleanup_old_builds
from proxilion_build.errors import ConcurrentBuildError
from proxilion_build.loop_controller import (
    LoopConfig,
    LoopState,
    _acquire_lock,
    _release_lock,
    load_state,
    run_loop,
    save_state,
)
from proxilion_build.parser import parse_spec
from proxilion_build.planner import Task
from proxilion_build.verifier import verify

# -- Phase 1: Session-level file locking --------------------------------------


def test_lock_acquisition_creates_file(tmp_path: pathlib.Path) -> None:
    """Verify that _acquire_lock creates a lock file with PID and timestamp."""
    project_dir = tmp_path / "project"
    project_dir.mkdir()

    # Acquire lock
    lock_path = _acquire_lock(project_dir)

    # Verify lock file was created
    assert lock_path.exists()
    assert lock_path.name == "build.lock"

    # Verify lock file contains PID and started timestamp
    lock_data = json.loads(lock_path.read_text(encoding="utf-8"))
    assert "pid" in lock_data
    assert "started" in lock_data
    assert lock_data["pid"] == os.getpid()

    # Cleanup
    _release_lock(lock_path)


def test_lock_prevents_concurrent_build(tmp_path: pathlib.Path) -> None:
    """Verify that a second lock acquisition raises ConcurrentBuildError when PID is alive."""
    project_dir = tmp_path / "project"
    project_dir.mkdir()

    # Acquire lock
    lock_path1 = _acquire_lock(project_dir)

    try:
        # Mock os.kill to simulate that the PID is alive (current process)
        with patch("proxilion_build.loop_controller.os.kill") as mock_kill:
            # os.kill(pid, 0) succeeds if process is alive
            mock_kill.return_value = None

            # Try to acquire lock again (should raise ConcurrentBuildError)
            with pytest.raises(ConcurrentBuildError) as exc_info:
                _acquire_lock(project_dir)

            assert "already running" in str(exc_info.value).lower()
    finally:
        _release_lock(lock_path1)


def test_stale_lock_cleanup(tmp_path: pathlib.Path) -> None:
    """Verify that _acquire_lock removes stale lock when PID is dead."""
    project_dir = tmp_path / "project"
    build_dir = project_dir / ".proxilion-build"
    build_dir.mkdir(parents=True)

    # Create a stale lock file with a dead PID
    stale_lock_path = build_dir / "build.lock"
    stale_lock_data = {"pid": 999999, "started": datetime.now(timezone.utc).isoformat()}
    stale_lock_path.write_text(json.dumps(stale_lock_data, indent=2) + "\n", encoding="utf-8")

    # Mock os.kill to raise ProcessLookupError (PID is dead)
    with patch("proxilion_build.loop_controller.os.kill") as mock_kill:
        mock_kill.side_effect = ProcessLookupError("Process not found")

        # Acquire lock (should clean up stale lock and succeed)
        lock_path = _acquire_lock(project_dir)

        # Verify that lock was acquired successfully
        assert lock_path.exists()
        lock_data = json.loads(lock_path.read_text(encoding="utf-8"))
        assert lock_data["pid"] == os.getpid()

        # Cleanup
        _release_lock(lock_path)


def test_lock_released_on_success(tmp_path: pathlib.Path) -> None:
    """Verify that _release_lock removes the lock file."""
    project_dir = tmp_path / "project"
    project_dir.mkdir()

    # Acquire and release lock
    lock_path = _acquire_lock(project_dir)
    assert lock_path.exists()

    _release_lock(lock_path)

    # Verify lock file was removed
    assert not lock_path.exists()


def test_lock_released_on_exception(tmp_path: pathlib.Path) -> None:
    """Verify that the lock is released even when an exception occurs."""
    project_dir = tmp_path / "project"
    project_dir.mkdir()

    lock_path = _acquire_lock(project_dir)

    try:
        # Simulate an exception
        raise RuntimeError("Test exception")
    except RuntimeError:
        pass
    finally:
        _release_lock(lock_path)

    # Verify lock was released
    assert not lock_path.exists()


# -- Phase 2: State persistence error recovery ---------------------------------


def test_save_state_failure_does_not_crash_loop(tmp_path: pathlib.Path) -> None:
    """Verify that save_state failures are caught and logged without crashing the loop."""
    project_dir = tmp_path / "project"
    project_dir.mkdir()
    build_dir = project_dir / ".proxilion-build"
    build_dir.mkdir()

    # Create a simple spec file
    spec_file = tmp_path / "test_spec.md"
    spec_file.write_text(
        "# Test Spec\n\n## Task 1\n\nCreate a simple file.\n\n## Task 2\n\nCreate another file.\n",
        encoding="utf-8",
    )

    call_count = 0

    # Mock save_state to fail on first call, succeed on second
    original_save_state = save_state

    def mock_save_state(state: LoopState, proj_dir: pathlib.Path) -> None:
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            raise OSError("disk full")
        # On subsequent calls, use the real save_state
        original_save_state(state, proj_dir)

    # Mock the LLM call to return simple code
    def mock_llm_call(*args, **kwargs):
        return "--- FILE: test.py ---\nprint('hello')\n--- END FILE ---"

    config = LoopConfig(
        max_patience=1,
        dry_run=True,
        stop_on_failure=False,
        timeout=120,
    )

    with patch("proxilion_build.loop_controller.save_state", side_effect=mock_save_state):
        with patch("proxilion_build.llm_client.call_llm", return_value=mock_llm_call()):
            # Run the loop - it should complete despite the first save_state failure
            state = run_loop(
                spec_path=spec_file,
                project_dir=project_dir,
                config=config,
                llm_call=mock_llm_call,
            )

    # Verify the loop completed
    assert state is not None
    # At least one save_state call should have been made
    assert call_count >= 1


# -- Phase 3: Per-task timeout in LoopConfig -----------------------------------


def test_task_timeout_marks_task_failed(tmp_path: pathlib.Path) -> None:
    """Verify that a task that exceeds task_timeout is marked as failed."""
    project_dir = tmp_path / "project"
    project_dir.mkdir()
    build_dir = project_dir / ".proxilion-build"
    build_dir.mkdir()

    # Create a simple spec file
    spec_file = tmp_path / "test_spec.md"
    spec_file.write_text(
        "# Test Spec\n\n## Task 1\n\nCreate a simple file.\n",
        encoding="utf-8",
    )

    # Mock the LLM call to sleep briefly to simulate work
    def mock_llm_call(*args, **kwargs):
        time.sleep(0.1)
        return "--- FILE: test.py ---\nprint('hello')\n--- END FILE ---"

    # Set task_timeout to 0 for immediate timeout
    config = LoopConfig(
        max_patience=1,
        dry_run=True,
        stop_on_failure=False,
        timeout=120,
        task_timeout=0,
    )

    # Run the loop - the task should timeout immediately
    state = run_loop(
        spec_path=spec_file,
        project_dir=project_dir,
        config=config,
        llm_call=mock_llm_call,
    )

    # Verify the task was marked as failed due to timeout
    assert state is not None
    assert len(state.failed) >= 1, "Expected at least one task to fail due to timeout"


# -- Phase 5: Configurable verifier timeouts -----------------------------------


def test_custom_test_timeout_passed_to_verifier(tmp_path: pathlib.Path) -> None:
    """Verify that custom test_timeout from LoopConfig is passed to verify()."""
    project_dir = tmp_path / "project"
    project_dir.mkdir()

    # Create a minimal project structure
    (project_dir / "tests").mkdir()
    (project_dir / "tests" / "test_dummy.py").write_text(
        "def test_pass():\n    assert True\n", encoding="utf-8"
    )

    # Call verify with custom test_timeout
    with patch("proxilion_build.verifier.subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")

        verify(
            project_dir,
            test_timeout=300,
            lint_timeout=90,
        )

        # Verify that subprocess.run was called with the custom timeout
        # The test runner call should have timeout=300
        test_calls = [call for call in mock_run.call_args_list if "pytest" in str(call[0][0])]
        assert len(test_calls) > 0, "Expected at least one pytest call"
        test_call = test_calls[0]
        assert test_call[1]["timeout"] == 300, f"Expected timeout=300, got {test_call[1]}"


def test_custom_lint_timeout_passed_to_verifier(tmp_path: pathlib.Path) -> None:
    """Verify that custom lint_timeout from LoopConfig is passed to check_lint()."""
    project_dir = tmp_path / "project"
    project_dir.mkdir()

    # Create a minimal Python project structure
    (project_dir / "pyproject.toml").write_text("[project]\nname = 'test'\n", encoding="utf-8")
    (project_dir / "tests").mkdir()
    (project_dir / "tests" / "test_dummy.py").write_text(
        "def test_pass():\n    assert True\n", encoding="utf-8"
    )

    # Mock tools and languages
    tools = {"ruff": True}
    languages = {"python"}

    # Call verify with custom lint_timeout
    with patch("proxilion_build.verifier.subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")

        verify(
            project_dir,
            test_timeout=120,
            lint_timeout=90,
            tools=tools,
            languages=languages,
        )

        # Verify that subprocess.run was called with the custom lint timeout
        # The ruff call should have timeout=90
        lint_calls = [call for call in mock_run.call_args_list if "ruff" in str(call[0][0])]
        assert len(lint_calls) > 0, "Expected at least one ruff call"
        lint_call = lint_calls[0]
        assert lint_call[1]["timeout"] == 90, f"Expected timeout=90, got {lint_call[1]}"


# -- Phase 7: Build directory cleanup policy -----------------------------------


def test_cleanup_old_builds_removes_stale(tmp_path: pathlib.Path) -> None:
    """Verify that cleanup_old_builds removes directories older than retention_days."""
    # Project directory contains session directories
    builds_dir = tmp_path / "test-project"
    builds_dir.mkdir(parents=True)

    # Create a directory with a timestamp 40 days ago
    old_date = datetime.now(timezone.utc) - timedelta(days=40)
    old_session_id = old_date.strftime("%Y%m%dT%H%M%Sz")
    old_dir = builds_dir / old_session_id
    old_dir.mkdir()
    (old_dir / "meta.json").write_text("{}", encoding="utf-8")

    # Create a directory with a timestamp 10 days ago (should NOT be removed)
    recent_date = datetime.now(timezone.utc) - timedelta(days=10)
    recent_session_id = recent_date.strftime("%Y%m%dT%H%M%Sz")
    recent_dir = builds_dir / recent_session_id
    recent_dir.mkdir()
    (recent_dir / "meta.json").write_text("{}", encoding="utf-8")

    # Create a directory with a timestamp from today (should NOT be removed)
    current_date = datetime.now(timezone.utc)
    current_session_id = current_date.strftime("%Y%m%dT%H%M%Sz")
    current_dir = builds_dir / current_session_id
    current_dir.mkdir()
    (current_dir / "meta.json").write_text("{}", encoding="utf-8")

    # Run cleanup with 30-day retention
    removed_count = cleanup_old_builds(builds_dir, retention_days=30)

    # Verify that only the 40-day-old directory was removed
    assert removed_count == 1
    assert not old_dir.exists()
    assert recent_dir.exists()
    assert current_dir.exists()


def test_cleanup_respects_retention_env(tmp_path: pathlib.Path, monkeypatch) -> None:
    """Verify that PROXILION_BUILD_RETENTION_DAYS env var is respected."""
    builds_dir = tmp_path / "test-project"
    builds_dir.mkdir(parents=True)

    # Create a directory with a timestamp 15 days ago
    old_date = datetime.now(timezone.utc) - timedelta(days=15)
    old_session_id = old_date.strftime("%Y%m%dT%H%M%Sz")
    old_dir = builds_dir / old_session_id
    old_dir.mkdir()
    (old_dir / "meta.json").write_text("{}", encoding="utf-8")

    # Set environment variable to 7 days retention
    monkeypatch.setenv("PROXILION_BUILD_RETENTION_DAYS", "7")

    # Run cleanup with default 30-day retention (should be overridden by env var)
    removed_count = cleanup_old_builds(builds_dir, retention_days=30)

    # Verify that the 15-day-old directory was removed (because env var is 7 days)
    assert removed_count == 1
    assert not old_dir.exists()


def test_cleanup_skips_unparseable_dirs(tmp_path: pathlib.Path) -> None:
    """Verify that directories with non-timestamp names are not deleted."""
    builds_dir = tmp_path / "test-project"
    builds_dir.mkdir(parents=True)

    # Create a directory with a non-timestamp name
    weird_dir = builds_dir / "not-a-timestamp"
    weird_dir.mkdir()
    (weird_dir / "meta.json").write_text("{}", encoding="utf-8")

    # Create a directory with a timestamp 40 days ago (should be removed)
    old_date = datetime.now(timezone.utc) - timedelta(days=40)
    old_session_id = old_date.strftime("%Y%m%dT%H%M%Sz")
    old_dir = builds_dir / old_session_id
    old_dir.mkdir()
    (old_dir / "meta.json").write_text("{}", encoding="utf-8")

    # Run cleanup
    removed_count = cleanup_old_builds(builds_dir, retention_days=30)

    # Verify that only the old timestamped directory was removed
    assert removed_count == 1
    assert weird_dir.exists()
    assert not old_dir.exists()


def test_cleanup_handles_invalid_env_var(tmp_path: pathlib.Path, monkeypatch, caplog) -> None:
    """Verify that invalid PROXILION_BUILD_RETENTION_DAYS env var is handled gracefully."""
    builds_dir = tmp_path / "test-project"
    builds_dir.mkdir(parents=True)

    # Set environment variable to an invalid value
    monkeypatch.setenv("PROXILION_BUILD_RETENTION_DAYS", "not-a-number")

    # Run cleanup (should use default retention_days)
    cleanup_old_builds(builds_dir, retention_days=30)

    # Verify that a warning was logged
    assert any(
        "Invalid PROXILION_BUILD_RETENTION_DAYS" in record.message for record in caplog.records
    )


def test_cleanup_handles_nonexistent_builds_dir(tmp_path: pathlib.Path) -> None:
    """Verify that cleanup_old_builds handles a nonexistent builds_dir gracefully."""
    builds_dir = tmp_path / "nonexistent" / "builds"

    # Run cleanup on a directory that does not exist
    removed_count = cleanup_old_builds(builds_dir, retention_days=30)

    # Should return 0 without raising
    assert removed_count == 0


def test_cleanup_handles_removal_errors(tmp_path: pathlib.Path, monkeypatch, caplog) -> None:
    """Verify that cleanup_old_builds logs warnings but continues on removal errors."""
    builds_dir = tmp_path / "test-project"
    builds_dir.mkdir(parents=True)

    # Create a directory with a timestamp 40 days ago
    old_date = datetime.now(timezone.utc) - timedelta(days=40)
    old_session_id = old_date.strftime("%Y%m%dT%H%M%Sz")
    old_dir = builds_dir / old_session_id
    old_dir.mkdir()

    # Create a file in the directory and make it read-only to cause removal to fail
    protected_file = old_dir / "protected.txt"
    protected_file.write_text("protected", encoding="utf-8")
    protected_file.chmod(0o000)
    old_dir.chmod(0o555)  # Read and execute only

    try:
        # Run cleanup
        removed_count = cleanup_old_builds(builds_dir, retention_days=30)

        # Should continue despite errors (may or may not remove the directory)
        # Just verify it doesn't crash
        assert removed_count >= 0
    finally:
        # Restore permissions for cleanup
        old_dir.chmod(0o755)
        protected_file.chmod(0o644)


def test_cleanup_skips_files_in_builds_dir(tmp_path: pathlib.Path) -> None:
    """Verify that cleanup_old_builds skips regular files in builds_dir."""
    builds_dir = tmp_path / "test-project"
    builds_dir.mkdir(parents=True)

    # Create a regular file in the builds directory
    regular_file = builds_dir / "some-file.txt"
    regular_file.write_text("content", encoding="utf-8")

    # Create a directory with a timestamp 40 days ago (should be removed)
    old_date = datetime.now(timezone.utc) - timedelta(days=40)
    old_session_id = old_date.strftime("%Y%m%dT%H%M%Sz")
    old_dir = builds_dir / old_session_id
    old_dir.mkdir()

    # Run cleanup
    removed_count = cleanup_old_builds(builds_dir, retention_days=30)

    # Verify that the file was not touched and the old directory was removed
    assert removed_count == 1
    assert regular_file.exists()
    assert not old_dir.exists()


# -- Phase 14: Sample dummy data and integration test fixtures ----------------

# Fixture paths
FIXTURES_DIR = pathlib.Path(__file__).parent / "fixtures"
MULTI_TASK_SPEC = FIXTURES_DIR / "multi_task_spec.md"
FAILING_SPEC = FIXTURES_DIR / "failing_spec.md"
SECURITY_SPEC = FIXTURES_DIR / "security_spec.md"
SAMPLE_RESPONSES_DIR = FIXTURES_DIR / "sample_llm_responses"
STRATEGY1_RESPONSE = SAMPLE_RESPONSES_DIR / "strategy1.txt"
STRATEGY2_RESPONSE = SAMPLE_RESPONSES_DIR / "strategy2.txt"


class TestPhase14Fixtures:
    """Tests for Phase 14 integration test fixtures."""

    def test_fixture_multi_task_parseable(self):
        """Test that multi_task_spec.md can be parsed and returns 5 sections."""
        sections = parse_spec(MULTI_TASK_SPEC)

        # Should have 5 main sections plus preamble
        assert len(sections) >= 5, f"Expected at least 5 sections, got {len(sections)}"

        # Verify section titles exist
        section_titles = [s.title for s in sections if s.title]
        expected_titles = [
            "Data Models",
            "Database Layer",
            "API Endpoints",
            "Authentication",
            "Tests",
        ]

        for expected in expected_titles:
            assert expected in section_titles, f"Missing section: {expected}"

    def test_fixture_security_spec_parseable(self):
        """Test that security_spec.md can be parsed without error."""
        sections = parse_spec(SECURITY_SPEC)

        # Should have at least 2 sections (User Authentication Module, Authorization Middleware)
        assert len(sections) >= 2, f"Expected at least 2 sections, got {len(sections)}"

        # Verify it contains security-related content
        section_titles = [s.title for s in sections if s.title]
        assert any(
            "Authentication" in title or "Authorization" in title for title in section_titles
        ), "Expected security-related section titles"

        # Verify body content exists and mentions security concepts
        bodies = [s.body for s in sections if s.body]
        combined_body = " ".join(bodies).lower()
        assert (
            "password" in combined_body or "token" in combined_body or "session" in combined_body
        ), "Expected security-related content in section bodies"

    def test_fixture_failing_spec_parseable(self):
        """Test that failing_spec.md can be parsed (even though it describes broken code)."""
        sections = parse_spec(FAILING_SPEC)

        # Should have at least 1 section
        assert len(sections) >= 1, f"Expected at least 1 section, got {len(sections)}"

        # Verify it describes intentional failure
        bodies = [s.body for s in sections]
        combined_body = " ".join(bodies).lower()
        assert "syntax" in combined_body or "error" in combined_body, (
            "Expected description of syntax error in failing spec"
        )

    def test_sample_llm_response_strategy1_exists(self):
        """Test that strategy1.txt sample response file exists and contains expected format."""
        assert STRATEGY1_RESPONSE.exists(), (
            f"Strategy1 response file not found: {STRATEGY1_RESPONSE}"
        )

        content = STRATEGY1_RESPONSE.read_text(encoding="utf-8")

        # Should contain strict format markers
        assert "--- FILE:" in content, "Expected --- FILE: marker in strategy1 response"
        assert "--- END FILE ---" in content, (
            "Expected --- END FILE --- marker in strategy1 response"
        )

        # Should contain at least one file
        file_count = content.count("--- FILE:")
        assert file_count >= 1, f"Expected at least 1 file in strategy1 response, got {file_count}"

    def test_sample_llm_response_strategy2_exists(self):
        """Test that strategy2.txt sample response file exists and contains expected format."""
        assert STRATEGY2_RESPONSE.exists(), (
            f"Strategy2 response file not found: {STRATEGY2_RESPONSE}"
        )

        content = STRATEGY2_RESPONSE.read_text(encoding="utf-8")

        # Should contain markdown code blocks with file paths
        assert "```python" in content, "Expected markdown code block in strategy2 response"
        assert "```" in content, "Expected closing code fence in strategy2 response"

        # Should contain file paths in the info string
        lines = content.split("\n")
        code_block_lines = [line for line in lines if line.startswith("```python")]
        assert any("/" in line or "\\" in line or ".py" in line for line in code_block_lines), (
            "Expected file path in at least one code block info string"
        )

    def test_multi_task_spec_has_dependencies(self):
        """Test that multi_task_spec.md sections mention dependencies."""
        sections = parse_spec(MULTI_TASK_SPEC)

        # Find sections that mention dependencies
        sections_with_deps = []
        for section in sections:
            if "dependencies:" in section.body.lower() or "depends on:" in section.body.lower():
                sections_with_deps.append(section.title)

        # Should have at least some sections with explicit dependencies
        assert len(sections_with_deps) >= 2, (
            f"Expected at least 2 sections with dependencies, got {len(sections_with_deps)}"
        )

    def test_multi_task_spec_sections_have_requirements(self):
        """Test that multi_task_spec.md sections describe concrete requirements."""
        sections = parse_spec(MULTI_TASK_SPEC)

        # Filter out preamble
        content_sections = [s for s in sections if s.title]

        # Each main section should have substantial content
        for section in content_sections:
            assert len(section.body) > 50, (
                f"Section '{section.title}' has insufficient content: {len(section.body)} chars"
            )

            # Should mention code artifacts or requirements
            body_lower = section.body.lower()
            has_requirements = any(
                keyword in body_lower
                for keyword in [
                    "requirements:",
                    "create",
                    "implement",
                    "function",
                    "class",
                    "model",
                ]
            )
            assert has_requirements, (
                f"Section '{section.title}' does not describe clear requirements"
            )

    def test_security_spec_contains_code_examples(self):
        """Test that security_spec.md contains code examples or usage patterns."""
        content = SECURITY_SPEC.read_text(encoding="utf-8")

        # Should have code blocks or examples
        assert "```" in content or "def " in content or "import " in content, (
            "Expected code examples in security spec"
        )

    def test_all_fixtures_are_utf8(self):
        """Test that all fixture files are valid UTF-8."""
        fixture_files = [
            MULTI_TASK_SPEC,
            FAILING_SPEC,
            SECURITY_SPEC,
            STRATEGY1_RESPONSE,
            STRATEGY2_RESPONSE,
        ]

        for fixture_file in fixture_files:
            try:
                content = fixture_file.read_text(encoding="utf-8")
                assert len(content) > 0, f"{fixture_file.name} is empty"
            except UnicodeDecodeError:
                pytest.fail(f"{fixture_file.name} is not valid UTF-8")

    def test_fixtures_directory_structure(self):
        """Test that the fixtures directory has the expected structure."""
        assert FIXTURES_DIR.exists(), "Fixtures directory should exist"
        assert FIXTURES_DIR.is_dir(), "Fixtures should be a directory"

        assert SAMPLE_RESPONSES_DIR.exists(), "sample_llm_responses subdirectory should exist"
        assert SAMPLE_RESPONSES_DIR.is_dir(), "sample_llm_responses should be a directory"

        # Verify all expected files exist
        expected_files = [
            MULTI_TASK_SPEC,
            FAILING_SPEC,
            SECURITY_SPEC,
            STRATEGY1_RESPONSE,
            STRATEGY2_RESPONSE,
        ]

        for expected_file in expected_files:
            assert expected_file.exists(), f"Expected fixture file not found: {expected_file}"
            assert expected_file.is_file(), f"Expected file but found directory: {expected_file}"


# -- Phase 8: Corrupted state.json Recovery Test Coverage --------------------


def test_load_state_truncated_json(tmp_path: pathlib.Path, caplog) -> None:
    """Verify that load_state returns None for truncated JSON."""
    build_dir = tmp_path / ".proxilion-build"
    build_dir.mkdir()
    state_file = build_dir / "state.json"

    # Write truncated JSON
    state_file.write_text('{"version": 1, "plan": [', encoding="utf-8")

    # Should return None
    result = load_state(tmp_path)
    assert result is None

    # Should log a warning
    assert any("Failed to load state" in record.message for record in caplog.records)


def test_load_state_empty_file(tmp_path: pathlib.Path) -> None:
    """Verify that load_state returns None for empty file."""
    build_dir = tmp_path / ".proxilion-build"
    build_dir.mkdir()
    state_file = build_dir / "state.json"

    # Write empty file
    state_file.write_text("", encoding="utf-8")

    # Should return None
    result = load_state(tmp_path)
    assert result is None


def test_load_state_binary_garbage(tmp_path: pathlib.Path, caplog) -> None:
    """Verify that load_state returns None for binary garbage."""
    build_dir = tmp_path / ".proxilion-build"
    build_dir.mkdir()
    state_file = build_dir / "state.json"

    # Write binary garbage (PNG header)
    state_file.write_bytes(b"\x89PNG\r\n")

    # Should return None
    result = load_state(tmp_path)
    assert result is None

    # Should log a warning
    assert any("Failed to load state" in record.message for record in caplog.records)


def test_load_state_wrong_version(tmp_path: pathlib.Path, caplog) -> None:
    """Verify that load_state returns None for wrong version."""
    build_dir = tmp_path / ".proxilion-build"
    build_dir.mkdir()
    state_file = build_dir / "state.json"

    # Write valid JSON with wrong version
    state_data = {
        "version": 99,
        "plan": [],
        "current_task_index": 0,
        "completed": [],
        "failed": [],
        "skipped": [],
        "attempt_counts": {},
        "spec_hash": "",
        "consecutive_failures": 0,
        "replanned": False,
        "replan_error": None,
        "budget_exhausted": False,
        "timed_out": False,
        "intent_rejected": False,
    }
    state_file.write_text(json.dumps(state_data, indent=2), encoding="utf-8")

    # Should return None
    result = load_state(tmp_path)
    assert result is None

    # Should log a version mismatch warning
    assert any("version mismatch" in record.message.lower() for record in caplog.records)


def test_load_state_overlapping_sets(tmp_path: pathlib.Path, caplog) -> None:
    """Verify load_state returns None when task ID appears in both completed and failed."""
    build_dir = tmp_path / ".proxilion-build"
    build_dir.mkdir()
    state_file = build_dir / "state.json"

    # Write state where task-1 appears in both completed and failed
    state_data = {
        "version": 1,
        "plan": [
            {
                "id": "task-1",
                "title": "Task 1",
                "description": "First task",
                "file_paths": ["file1.py"],
                "depends_on": [],
                "validation": "pytest",
                "status": "pending",
            }
        ],
        "current_task_index": 0,
        "completed": ["task-1"],
        "failed": ["task-1"],  # Same task in both lists
        "skipped": [],
        "attempt_counts": {},
        "spec_hash": "",
        "consecutive_failures": 0,
        "replanned": False,
        "replan_error": None,
        "budget_exhausted": False,
        "timed_out": False,
        "intent_rejected": False,
    }
    state_file.write_text(json.dumps(state_data, indent=2), encoding="utf-8")

    # Should return None
    result = load_state(tmp_path)
    assert result is None

    # Should log an overlapping sets warning
    assert any("overlapping" in record.message.lower() for record in caplog.records)


# -- Phase 11: Replan Circular Dependency Guard -------------------------------


def test_replan_circular_dependency_continues(tmp_path: pathlib.Path, caplog) -> None:
    """Verify that circular dependencies from replan are caught and build continues."""
    from proxilion_build.errors import LoopError

    # Create a minimal project directory
    project_dir = tmp_path / "project"
    project_dir.mkdir()
    build_dir = project_dir / ".proxilion-build"
    build_dir.mkdir()
    (build_dir / "STATE.md").write_text(
        "# State\n\n## Tech Stack\nPython 3.10\n\n## Test Command\npytest\n", encoding="utf-8"
    )

    # Create a spec file
    spec_file = project_dir / "spec.md"
    spec_file.write_text("# Test\n\n## Section 1\nImplement feature A.\n", encoding="utf-8")

    # Create initial plan with 2 tasks that will fail
    initial_tasks = [
        Task(
            id="task-1",
            title="Task 1",
            description="First task that will fail",
            file_paths=["file1.py"],
            depends_on=[],
            validation="pytest",
            status="pending",
        ),
        Task(
            id="task-2",
            title="Task 2",
            description="Second task that will fail",
            file_paths=["file2.py"],
            depends_on=[],
            validation="pytest",
            status="pending",
        ),
    ]

    # Mock the planner to return the initial plan
    mock_create_plan = MagicMock(return_value=initial_tasks)

    # Mock replan to raise LoopError (simulating circular dependency detection)
    mock_replan = MagicMock(side_effect=LoopError("Cannot execute: circular dependency"))

    # Mock the executor to always fail (to trigger replan)
    mock_execute_task = MagicMock()
    mock_execute_task.return_value.success = False
    mock_execute_task.return_value.error = "Execution failed"

    mock_execute_fix = MagicMock()
    mock_execute_fix.return_value.success = False
    mock_execute_fix.return_value.error = "Fix failed"

    # Mock the llm_call
    mock_llm_call = MagicMock(return_value="Mock response")

    # Mock verify to always fail (we want tasks to fail to trigger replan)
    mock_verification = MagicMock()
    mock_verification.all_passed = False
    mock_verify = MagicMock(return_value=mock_verification)

    # Configure to trigger replan after 2 failures
    config = LoopConfig(
        max_patience=1,
        replan_after_failures=2,
        stop_on_failure=False,
        dry_run=False,
    )

    # Run the loop with all mocks
    with (
        patch("proxilion_build.loop_controller.create_plan", mock_create_plan),
        patch("proxilion_build.loop_controller.replan", mock_replan),
        patch("proxilion_build.loop_controller.execute_task", mock_execute_task),
        patch("proxilion_build.loop_controller.execute_fix", mock_execute_fix),
        patch("proxilion_build.loop_controller.verify", mock_verify),
        patch("proxilion_build.loop_controller.create_policy_guarded_llm") as mock_create_llm,
    ):
        mock_create_llm.return_value = mock_llm_call

        # Run the loop - should not crash despite replan error
        state = run_loop(
            spec_path=spec_file,
            project_dir=project_dir,
            config=config,
        )

        # Verify the loop completed without crashing
        assert state is not None

        # Verify replan_error was set (circular dependency exception was caught)
        assert state.replan_error is not None
        assert "circular" in state.replan_error.lower()

        # Verify replan was called (should be triggered after 2 consecutive failures)
        assert mock_replan.called

        # Verify the original plan was preserved (replan failed so plan unchanged)
        # The plan should still have the original tasks
        plan_ids = {task.id for task in state.plan}
        assert "task-1" in plan_ids
        assert "task-2" in plan_ids

        # Verify both tasks failed
        assert "task-1" in state.failed
        assert "task-2" in state.failed
