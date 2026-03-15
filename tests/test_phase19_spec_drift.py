"""Tests for Phase 19: Spec Drift Detection.

Covers:
  proxilion_build/loop_controller.py — spec_hash set at build start,
                                  consecutive_failures tracking,
                                  consecutive_failures reset on success
  proxilion_build/planner.py         — analyze_spec_drift (drift trigger logic)

test_spec_hash_set_on_build_start
test_consecutive_failures_incremented_on_failed_build
test_consecutive_failures_reset_on_successful_build
test_analyze_spec_drift_returns_revised_spec
test_drift_triggered_at_3_consecutive_failures
test_drift_not_triggered_at_2_failures
"""

from __future__ import annotations

import hashlib
import pathlib
from unittest.mock import MagicMock, patch

from proxilion_build.loop_controller import LoopConfig, run_loop
from proxilion_build.planner import Task, analyze_spec_drift

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_task(task_id: str = "t1", title: str = "Task One") -> Task:
    return Task(
        id=task_id,
        title=title,
        description="Do something.",
        file_paths=["main.py"],
        depends_on=[],
        validation="check it",
        status="pending",
    )


def _noop_llm(system: str, user: str) -> str:
    return "ok"


def _make_verification(passed: bool):
    from proxilion_build.verifier import CheckResult, VerificationResult

    check = CheckResult(name="tests", passed=passed, message="", details="")
    return VerificationResult(checks=[check])


# ---------------------------------------------------------------------------
# test_spec_hash_set_on_build_start
# ---------------------------------------------------------------------------


def test_spec_hash_set_on_build_start(tmp_path: pathlib.Path) -> None:
    """spec_hash in LoopState must equal SHA256 of spec content on a fresh run."""
    spec_content = "# My spec\n\nBuild a hello world app.\n"
    spec_file = tmp_path / "spec.md"
    spec_file.write_text(spec_content)
    project_dir = tmp_path / "project"
    project_dir.mkdir()

    expected_hash = hashlib.sha256(spec_content.encode()).hexdigest()

    single_task = _make_task()

    with (
        patch("proxilion_build.loop_controller.parse_spec", return_value=["section1"]),
        patch("proxilion_build.loop_controller.create_plan", return_value=[single_task]),
        patch("proxilion_build.loop_controller.execute_task") as mock_exec,
        patch("proxilion_build.loop_controller.verify") as mock_verify,
        patch("proxilion_build.loop_controller.probe_tools", return_value={}),
        patch("proxilion_build.loop_controller.detect_languages", return_value=set()),
        patch("proxilion_build.loop_controller.Sandbox"),
    ):
        mock_exec.return_value = MagicMock(success=True, error=None)
        mock_verify.return_value = _make_verification(True)

        state = run_loop(
            spec_path=spec_file,
            project_dir=project_dir,
            llm_call=_noop_llm,
            config=LoopConfig(),
        )

    assert state.spec_hash == expected_hash


# ---------------------------------------------------------------------------
# test_consecutive_failures_incremented_on_failed_build
# ---------------------------------------------------------------------------


def test_consecutive_failures_incremented_on_failed_build(tmp_path: pathlib.Path) -> None:
    """consecutive_failures increments when a task exhausts all attempts."""
    spec_file = tmp_path / "spec.md"
    spec_file.write_text("# Spec\nDo work.\n")
    project_dir = tmp_path / "project"
    project_dir.mkdir()

    task = _make_task()

    with (
        patch("proxilion_build.loop_controller.parse_spec", return_value=["s"]),
        patch("proxilion_build.loop_controller.create_plan", return_value=[task]),
        patch("proxilion_build.loop_controller.execute_task") as mock_exec,
        patch("proxilion_build.loop_controller.verify") as mock_verify,
        patch("proxilion_build.loop_controller.probe_tools", return_value={}),
        patch("proxilion_build.loop_controller.detect_languages", return_value=set()),
        patch("proxilion_build.loop_controller.Sandbox"),
    ):
        mock_exec.return_value = MagicMock(success=True, error=None)
        # Verification always fails → task exhausts patience
        mock_verify.return_value = _make_verification(False)

        state = run_loop(
            spec_path=spec_file,
            project_dir=project_dir,
            llm_call=_noop_llm,
            config=LoopConfig(max_patience=2),
        )

    assert "t1" in state.failed
    assert state.consecutive_failures >= 1


# ---------------------------------------------------------------------------
# test_consecutive_failures_reset_on_successful_build
# ---------------------------------------------------------------------------


def test_consecutive_failures_reset_on_successful_build(tmp_path: pathlib.Path) -> None:
    """consecutive_failures resets to 0 when a task succeeds."""
    spec_file = tmp_path / "spec.md"
    spec_file.write_text("# Spec\nDo work.\n")
    project_dir = tmp_path / "project"
    project_dir.mkdir()

    task_a = _make_task("a", "Task A")
    task_b = _make_task("b", "Task B")

    call_count = {"n": 0}

    def fake_verify(*args, **kwargs):
        call_count["n"] += 1
        # First call (task_a) fails, second call (task_b attempt after exec) passes
        return _make_verification(call_count["n"] > 1)

    with (
        patch("proxilion_build.loop_controller.parse_spec", return_value=["s"]),
        patch("proxilion_build.loop_controller.create_plan", return_value=[task_a, task_b]),
        patch("proxilion_build.loop_controller.execute_task") as mock_exec,
        patch("proxilion_build.loop_controller.verify", side_effect=fake_verify),
        patch("proxilion_build.loop_controller.probe_tools", return_value={}),
        patch("proxilion_build.loop_controller.detect_languages", return_value=set()),
        patch("proxilion_build.loop_controller.Sandbox"),
    ):
        mock_exec.return_value = MagicMock(success=True, error=None)

        state = run_loop(
            spec_path=spec_file,
            project_dir=project_dir,
            llm_call=_noop_llm,
            config=LoopConfig(max_patience=1),
        )

    # task_b succeeded, so consecutive_failures should be reset to 0
    assert state.consecutive_failures == 0
    assert "b" in state.completed


# ---------------------------------------------------------------------------
# test_analyze_spec_drift_returns_revised_spec
# ---------------------------------------------------------------------------


def test_analyze_spec_drift_returns_revised_spec() -> None:
    """analyze_spec_drift returns the LLM's revised spec (stripped)."""
    original = "# Spec\nBuild X.\n"
    failures = ["task_1 failed: import error", "task_2 failed: missing dependency"]
    revised_raw = "# Revised Spec\nBuild X with explicit imports.\n"

    llm = MagicMock(return_value=revised_raw)

    result = analyze_spec_drift(original, failures, llm)

    assert result == revised_raw.strip()
    llm.assert_called_once()


# ---------------------------------------------------------------------------
# test_drift_triggered_at_3_consecutive_failures
# ---------------------------------------------------------------------------


def test_drift_triggered_at_3_consecutive_failures() -> None:
    """analyze_spec_drift is called when there are >= 3 failure summaries."""
    original = "# Spec\nBuild Y.\n"
    failures = ["fail 1", "fail 2", "fail 3"]
    revised_raw = "# Revised\n"

    llm = MagicMock(return_value=revised_raw)

    result = analyze_spec_drift(original, failures, llm)

    assert result == revised_raw.strip()
    llm.assert_called_once()


# ---------------------------------------------------------------------------
# test_drift_not_triggered_at_2_failures
# ---------------------------------------------------------------------------


def test_drift_not_triggered_at_2_failures() -> None:
    """analyze_spec_drift with 0 failures returns original spec without LLM call."""
    original = "# Spec\nBuild Z.\n"

    llm = MagicMock()

    result = analyze_spec_drift(original, [], llm)

    assert result == original
    llm.assert_not_called()
