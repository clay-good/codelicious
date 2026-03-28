"""Tests for BudgetGuard env var parsing and core enforcement logic.

Finding 79: BudgetGuard env var parsing and core enforcement logic had 0% coverage.
Covers:
- Env var parsing (valid float, invalid string, negative float)
- check() raises BudgetExhaustedError at boundary
- record() increments counters correctly
"""

from __future__ import annotations

import pytest

from codelicious.budget_guard import BudgetGuard, _DEFAULT_MAX_COST_USD
from codelicious.errors import BudgetExhaustedError


# ---------------------------------------------------------------------------
# Env var parsing
# ---------------------------------------------------------------------------


class TestEnvVarParsing:
    """Tests for CODELICIOUS_MAX_BUILD_COST_USD env var parsing."""

    def test_valid_float_env_var_is_used(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """A valid positive float in the env var sets max_cost_usd correctly."""
        monkeypatch.setenv("CODELICIOUS_MAX_BUILD_COST_USD", "7.50")
        guard = BudgetGuard()
        assert guard.max_cost_usd == 7.50

    def test_invalid_string_env_var_falls_back_to_default(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """A non-numeric env var value falls back to the default cost ceiling."""
        monkeypatch.setenv("CODELICIOUS_MAX_BUILD_COST_USD", "not-a-number")
        guard = BudgetGuard()
        assert guard.max_cost_usd == _DEFAULT_MAX_COST_USD

    def test_negative_float_env_var_falls_back_to_default(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """A negative value in the env var falls back to the default cost ceiling."""
        monkeypatch.setenv("CODELICIOUS_MAX_BUILD_COST_USD", "-5.0")
        guard = BudgetGuard()
        assert guard.max_cost_usd == _DEFAULT_MAX_COST_USD

    def test_zero_env_var_falls_back_to_default(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Zero in the env var (non-positive) falls back to the default cost ceiling."""
        monkeypatch.setenv("CODELICIOUS_MAX_BUILD_COST_USD", "0.0")
        guard = BudgetGuard()
        assert guard.max_cost_usd == _DEFAULT_MAX_COST_USD

    def test_env_var_absent_uses_default(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """When env var is not set, the default cost ceiling is used."""
        monkeypatch.delenv("CODELICIOUS_MAX_BUILD_COST_USD", raising=False)
        guard = BudgetGuard()
        assert guard.max_cost_usd == _DEFAULT_MAX_COST_USD

    def test_explicit_max_cost_usd_overrides_env_var(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Explicit max_cost_usd parameter takes precedence over env var."""
        monkeypatch.setenv("CODELICIOUS_MAX_BUILD_COST_USD", "99.99")
        guard = BudgetGuard(max_cost_usd=1.50)
        assert guard.max_cost_usd == 1.50


# ---------------------------------------------------------------------------
# Constructor validation
# ---------------------------------------------------------------------------


class TestConstructorValidation:
    """Tests for BudgetGuard constructor parameter validation."""

    def test_max_calls_zero_raises_value_error(self) -> None:
        """max_calls=0 must raise ValueError."""
        with pytest.raises(ValueError, match="max_calls must be >= 1"):
            BudgetGuard(max_calls=0)

    def test_max_calls_negative_raises_value_error(self) -> None:
        """Negative max_calls must raise ValueError."""
        with pytest.raises(ValueError, match="max_calls must be >= 1"):
            BudgetGuard(max_calls=-1)

    def test_max_cost_usd_zero_raises_value_error(self) -> None:
        """max_cost_usd=0 must raise ValueError."""
        with pytest.raises(ValueError, match="max_cost_usd must be > 0"):
            BudgetGuard(max_cost_usd=0.0)

    def test_max_cost_usd_negative_raises_value_error(self) -> None:
        """Negative max_cost_usd must raise ValueError."""
        with pytest.raises(ValueError, match="max_cost_usd must be > 0"):
            BudgetGuard(max_cost_usd=-1.0)


# ---------------------------------------------------------------------------
# check() boundary enforcement
# ---------------------------------------------------------------------------


class TestCheckBoundary:
    """Tests for BudgetGuard.check() at call and cost ceilings."""

    def test_check_raises_when_call_limit_reached(self) -> None:
        """check() raises BudgetExhaustedError exactly at the call limit."""
        guard = BudgetGuard(max_calls=3, max_cost_usd=100.0)
        # Manually set the call counter to the limit
        guard._calls_made = 3
        with pytest.raises(BudgetExhaustedError, match="call limit"):
            guard.check()

    def test_check_raises_when_call_limit_exceeded(self) -> None:
        """check() raises BudgetExhaustedError when calls exceed the limit."""
        guard = BudgetGuard(max_calls=3, max_cost_usd=100.0)
        guard._calls_made = 10
        with pytest.raises(BudgetExhaustedError):
            guard.check()

    def test_check_does_not_raise_below_call_limit(self) -> None:
        """check() does not raise when calls are below the limit."""
        guard = BudgetGuard(max_calls=5, max_cost_usd=100.0)
        guard._calls_made = 4
        guard.check()  # Should not raise

    def test_check_raises_when_cost_ceiling_reached(self) -> None:
        """check() raises BudgetExhaustedError exactly at the cost ceiling."""
        guard = BudgetGuard(max_calls=1000, max_cost_usd=1.0)
        guard._estimated_cost_usd = 1.0
        with pytest.raises(BudgetExhaustedError, match="ceiling"):
            guard.check()

    def test_check_raises_when_cost_exceeds_ceiling(self) -> None:
        """check() raises BudgetExhaustedError when cost exceeds the ceiling."""
        guard = BudgetGuard(max_calls=1000, max_cost_usd=1.0)
        guard._estimated_cost_usd = 1.5
        with pytest.raises(BudgetExhaustedError):
            guard.check()

    def test_check_does_not_raise_below_cost_ceiling(self) -> None:
        """check() does not raise when cost is below the ceiling."""
        guard = BudgetGuard(max_calls=1000, max_cost_usd=1.0)
        guard._estimated_cost_usd = 0.99
        guard.check()  # Should not raise

    def test_budget_exhausted_error_carries_calls_made(self) -> None:
        """BudgetExhaustedError.calls_made reflects the count at raise time."""
        guard = BudgetGuard(max_calls=2, max_cost_usd=100.0)
        guard._calls_made = 2
        with pytest.raises(BudgetExhaustedError) as exc_info:
            guard.check()
        assert exc_info.value.calls_made == 2


# ---------------------------------------------------------------------------
# record() counter increments
# ---------------------------------------------------------------------------


class TestRecordCounters:
    """Tests for BudgetGuard.record() incrementing counters."""

    def test_record_increments_calls_made(self) -> None:
        """Each record() call increments calls_made by one."""
        guard = BudgetGuard(max_calls=100, max_cost_usd=100.0)
        assert guard.calls_made == 0
        guard.record(prompt="hello", response="world")
        assert guard.calls_made == 1
        guard.record(prompt="second", response="call")
        assert guard.calls_made == 2

    def test_record_accumulates_estimated_cost(self) -> None:
        """record() accumulates estimated cost based on token counts."""
        guard = BudgetGuard(max_calls=100, max_cost_usd=100.0)
        assert guard.estimated_cost_usd == 0.0
        # Record with non-empty text — cost must increase
        guard.record(prompt="x" * 100, response="y" * 100)
        assert guard.estimated_cost_usd > 0.0

    def test_record_cost_is_cumulative(self) -> None:
        """Repeated record() calls accumulate cost monotonically."""
        guard = BudgetGuard(max_calls=100, max_cost_usd=100.0)
        guard.record(prompt="a" * 50, response="b" * 50)
        cost_after_first = guard.estimated_cost_usd
        guard.record(prompt="c" * 50, response="d" * 50)
        cost_after_second = guard.estimated_cost_usd
        assert cost_after_second > cost_after_first

    def test_record_empty_strings_increments_calls_only(self) -> None:
        """record() with empty strings still increments calls_made."""
        guard = BudgetGuard(max_calls=100, max_cost_usd=100.0)
        guard.record(prompt="", response="")
        assert guard.calls_made == 1

    def test_calls_remaining_decrements_with_each_record(self) -> None:
        """calls_remaining decreases after each record() call."""
        guard = BudgetGuard(max_calls=5, max_cost_usd=100.0)
        assert guard.calls_remaining == 5
        guard.record()
        assert guard.calls_remaining == 4
        guard.record()
        assert guard.calls_remaining == 3

    def test_calls_remaining_clamps_at_zero(self) -> None:
        """calls_remaining never goes negative even if over limit."""
        guard = BudgetGuard(max_calls=2, max_cost_usd=100.0)
        guard._calls_made = 10
        assert guard.calls_remaining == 0
