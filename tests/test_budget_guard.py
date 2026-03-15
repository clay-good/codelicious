"""Tests for BudgetGuard and related loop_controller integration."""

from __future__ import annotations

import pathlib
from unittest.mock import MagicMock, patch

import pytest

from proxilion_build.budget_guard import BudgetGuard
from proxilion_build.errors import BudgetExhaustedError
from proxilion_build.loop_controller import LoopConfig, LoopState, run_loop

# ---------------------------------------------------------------------------
# BudgetGuard unit tests
# ---------------------------------------------------------------------------


class TestBudgetGuardInputValidation:
    def test_budget_guard_rejects_negative_max_calls(self):
        with pytest.raises(ValueError, match="max_calls must be >= 1"):
            BudgetGuard(max_calls=-1)

    def test_budget_guard_rejects_zero_max_calls(self):
        with pytest.raises(ValueError, match="max_calls must be >= 1"):
            BudgetGuard(max_calls=0)

    def test_budget_guard_rejects_zero_cost(self):
        with pytest.raises(ValueError, match="max_cost_usd must be > 0"):
            BudgetGuard(max_cost_usd=0)

    def test_budget_guard_rejects_negative_cost(self):
        with pytest.raises(ValueError, match="max_cost_usd must be > 0"):
            BudgetGuard(max_cost_usd=-1)

    def test_invalid_cost_env_fallback(self, monkeypatch):
        """PROXILION_MAX_BUILD_COST_USD set to non-numeric falls back to default."""
        monkeypatch.setenv("PROXILION_MAX_BUILD_COST_USD", "not_a_number")
        guard = BudgetGuard()
        # Should use default instead of crashing
        assert guard.max_cost_usd == 3.00  # _DEFAULT_MAX_COST_USD

    def test_negative_cost_env_fallback(self, monkeypatch):
        """PROXILION_MAX_BUILD_COST_USD set to negative falls back to default."""
        monkeypatch.setenv("PROXILION_MAX_BUILD_COST_USD", "-10")
        guard = BudgetGuard()
        assert guard.max_cost_usd == 3.00  # _DEFAULT_MAX_COST_USD

    def test_zero_cost_env_fallback(self, monkeypatch):
        """PROXILION_MAX_BUILD_COST_USD set to zero falls back to default."""
        monkeypatch.setenv("PROXILION_MAX_BUILD_COST_USD", "0")
        guard = BudgetGuard()
        assert guard.max_cost_usd == 3.00  # _DEFAULT_MAX_COST_USD


class TestBudgetGuardRaisesAtLimit:
    def test_raises_exactly_at_limit(self):
        guard = BudgetGuard(max_calls=3)
        guard.record()
        guard.record()
        guard.record()
        with pytest.raises(BudgetExhaustedError) as exc_info:
            guard.check()
        assert exc_info.value.calls_made == 3

    def test_does_not_raise_below_limit(self):
        guard = BudgetGuard(max_calls=5)
        for _ in range(4):
            guard.record()
        guard.check()  # should not raise

    def test_raises_after_exceeding_limit(self):
        guard = BudgetGuard(max_calls=1)
        guard.record()
        with pytest.raises(BudgetExhaustedError):
            guard.check()


class TestBudgetGuardRecordsCalls:
    def test_record_increments_calls_made(self):
        guard = BudgetGuard(max_calls=10)
        assert guard.calls_made == 0
        guard.record()
        assert guard.calls_made == 1
        guard.record()
        assert guard.calls_made == 2

    def test_record_accumulates_cost(self):
        guard = BudgetGuard(max_calls=10, max_cost_usd=100.0)
        # Provide known prompt + response to get deterministic cost
        guard.record(prompt="a" * 4000, response="b" * 4000)
        # Uses estimate_tokens from context_manager: 4000 chars / 4 * 1.1 = 1100 tokens
        # input: 1100 / 1e6 * 3.00 = 0.0033, output: 1100 / 1e6 * 15.00 = 0.0165
        assert guard.estimated_cost_usd == pytest.approx(0.0198, abs=1e-6)


class TestBudgetGuardCallsRemaining:
    def test_calls_remaining_counts_down(self):
        guard = BudgetGuard(max_calls=5)
        assert guard.calls_remaining == 5
        guard.record()
        assert guard.calls_remaining == 4
        guard.record()
        assert guard.calls_remaining == 3

    def test_calls_remaining_never_goes_negative(self):
        guard = BudgetGuard(max_calls=2)
        guard.record()
        guard.record()
        guard.record()  # over limit — remaining must be 0, not -1
        assert guard.calls_remaining == 0


# ---------------------------------------------------------------------------
# run_loop integration tests
# ---------------------------------------------------------------------------


def _make_spec(tmp_path: pathlib.Path) -> pathlib.Path:
    spec = tmp_path / "spec.md"
    spec.write_text("# Build\n\n## Task 1\nDo something.\n", encoding="utf-8")
    return spec


def _make_plan_task():
    from proxilion_build.planner import Task

    return Task(
        id="t1",
        title="Task 1",
        description="Do something.",
        file_paths=["out.py"],
        depends_on=[],
        validation=None,
        status="pending",
    )


class TestRunLoopStopsOnBudgetExhaustion:
    def test_state_budget_exhausted_set(self, tmp_path):
        spec = _make_spec(tmp_path)
        project_dir = tmp_path / "proj"
        project_dir.mkdir()

        # Budget guard already exhausted before the loop body runs
        guard = BudgetGuard(max_calls=1)
        guard.record()  # Exhaust the single allowed call

        plan_task = _make_plan_task()

        with (
            patch("proxilion_build.loop_controller.load_state", return_value=None),
            patch("proxilion_build.loop_controller.parse_spec", return_value=[]),
            patch("proxilion_build.loop_controller.create_plan", return_value=[plan_task]),
            patch("proxilion_build.loop_controller.save_state"),
        ):
            llm_call = MagicMock(return_value="response text")
            config = LoopConfig()
            state = run_loop(spec, project_dir, llm_call, config, budget_guard=guard)

        assert state.budget_exhausted is True
        assert state.timed_out is False


class TestRunLoopStopsOnCostCeiling:
    def test_state_budget_exhausted_set_on_cost_ceiling(self, tmp_path):
        spec = _make_spec(tmp_path)
        project_dir = tmp_path / "proj"
        project_dir.mkdir()

        # Set a vanishingly small cost ceiling so it trips immediately
        guard = BudgetGuard(max_calls=150, max_cost_usd=0.001)
        # Pre-accumulate some cost so ceiling is already exceeded
        guard.record(prompt="x" * 4000, response="y" * 4000)

        plan_task = _make_plan_task()

        with (
            patch("proxilion_build.loop_controller.load_state", return_value=None),
            patch("proxilion_build.loop_controller.parse_spec", return_value=[]),
            patch("proxilion_build.loop_controller.create_plan", return_value=[plan_task]),
            patch("proxilion_build.loop_controller.save_state"),
        ):
            llm_call = MagicMock(return_value="response text")
            config = LoopConfig()
            state = run_loop(spec, project_dir, llm_call, config, budget_guard=guard)

        assert state.budget_exhausted is True


class TestRunLoopStopsOnTimeout:
    def test_state_timed_out_set(self, tmp_path):
        spec = _make_spec(tmp_path)
        project_dir = tmp_path / "proj"
        project_dir.mkdir()

        plan_task = _make_plan_task()

        with (
            patch("proxilion_build.loop_controller.load_state", return_value=None),
            patch("proxilion_build.loop_controller.parse_spec", return_value=[]),
            patch("proxilion_build.loop_controller.create_plan", return_value=[plan_task]),
            patch("proxilion_build.loop_controller.save_state"),
            patch("proxilion_build.loop_controller.time") as mock_time,
        ):
            # Make monotonic() return a value past the 1-hour limit
            mock_time.monotonic.side_effect = [0.0, 3601.0]

            llm_call = MagicMock(return_value="response text")
            config = LoopConfig()
            state = run_loop(spec, project_dir, llm_call, config)

        assert state.timed_out is True
        assert state.budget_exhausted is False


class TestLoopStateBudgetExhaustedField:
    def test_budget_exhausted_defaults_to_false(self):
        state = LoopState()
        assert state.budget_exhausted is False

    def test_budget_exhausted_round_trips_through_dict(self):
        state = LoopState(budget_exhausted=True)
        d = state.to_dict()
        assert d["budget_exhausted"] is True
        restored = LoopState.from_dict(d)
        assert restored.budget_exhausted is True


class TestLoopStateTimedOutField:
    def test_timed_out_defaults_to_false(self):
        state = LoopState()
        assert state.timed_out is False

    def test_timed_out_round_trips_through_dict(self):
        state = LoopState(timed_out=True)
        d = state.to_dict()
        assert d["timed_out"] is True
        restored = LoopState.from_dict(d)
        assert restored.timed_out is True
