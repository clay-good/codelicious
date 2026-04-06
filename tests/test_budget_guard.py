"""Tests for BudgetGuard env var parsing and core enforcement logic.

Finding 79: BudgetGuard env var parsing and core enforcement logic had 0% coverage.
Covers:
- Env var parsing (valid float, invalid string, negative float)
- check() raises BudgetExhaustedError at boundary
- record() increments counters correctly
"""

from __future__ import annotations

import pytest

from codelicious.budget_guard import (
    BudgetGuard,
    _DEFAULT_MAX_CALLS,
    _DEFAULT_MAX_COST_USD,
    _INPUT_RATE_PER_MTOK,
    _OUTPUT_RATE_PER_MTOK,
)
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
        assert guard.check() is None

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
        assert guard.check() is None

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

    def test_record_none_prompt(self) -> None:
        """record() with prompt=None is handled defensively.

        estimate_tokens() treats None as falsy and returns 0, so no
        TypeError is raised.  The call is still counted and cost stays
        at zero (no tokens to charge for).
        """
        guard = BudgetGuard(max_calls=100, max_cost_usd=100.0)
        guard.record(prompt=None)  # type: ignore[arg-type]
        assert guard.calls_made == 1
        assert guard.estimated_cost_usd == 0.0

    def test_record_accumulates_until_check_raises_budget_exhausted(self) -> None:
        """End-to-end: repeated record() calls accumulate cost until check() raises BudgetExhaustedError.

        Creates a guard with a very low max_cost_usd ceiling.  Large prompt/response
        strings generate enough tokens to exceed the ceiling after a small number of
        record() calls, at which point check() must raise BudgetExhaustedError.
        """
        # Ceiling of $0.000001 — any non-trivial text will exceed this quickly.
        guard = BudgetGuard(max_calls=10_000, max_cost_usd=0.000001)

        # Accumulate cost with large text until the ceiling is hit.
        # Use a generous iteration cap to avoid an infinite loop if cost estimation
        # behaviour changes; in practice the ceiling is exceeded on the first call.
        ceiling_hit = False
        for _ in range(100):
            guard.record(prompt="x" * 500, response="y" * 500)
            if guard.estimated_cost_usd >= guard.max_cost_usd:
                ceiling_hit = True
                break

        assert ceiling_hit, "expected cost ceiling to be reached within 100 record() calls"

        with pytest.raises(BudgetExhaustedError, match="ceiling"):
            guard.check()


# ---------------------------------------------------------------------------
# spec-22 Phase 6: BudgetGuard thread safety
# ---------------------------------------------------------------------------


class TestBudgetGuardThreadSafety:
    """BudgetGuard.record must be safe under concurrent calls (spec-22 Phase 6)."""

    def test_concurrent_record_calls_produce_accurate_count(self):
        """10 threads each calling record() 10 times must yield exactly 100 calls_made."""
        import concurrent.futures

        guard = BudgetGuard(max_calls=200)

        def worker():
            for _ in range(10):
                guard.record(prompt="hello", response="world")

        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
            futures = [pool.submit(worker) for _ in range(10)]
            for f in futures:
                f.result()

        assert guard.calls_made == 100, f"Expected 100 calls, got {guard.calls_made}"

    def test_concurrent_record_cost_is_positive(self):
        """After concurrent calls, estimated_cost_usd must be positive and non-zero."""
        import concurrent.futures

        guard = BudgetGuard(max_calls=200)

        def worker():
            for _ in range(5):
                guard.record(prompt="x" * 100, response="y" * 100)

        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
            futures = [pool.submit(worker) for _ in range(5)]
            for f in futures:
                f.result()

        assert guard.calls_made == 25
        assert guard.estimated_cost_usd > 0


# ---------------------------------------------------------------------------
# spec-20 Phase 9: Additional BudgetGuard thread safety tests (S20-P2-5)
# ---------------------------------------------------------------------------


class TestBudgetGuardThreadSafetyS20:
    """Additional thread safety tests for S20-P2-5."""

    def test_budget_guard_lock_exists(self) -> None:
        """BudgetGuard must have a threading.Lock instance."""
        import threading

        guard = BudgetGuard(max_calls=10)
        assert hasattr(guard, "_lock")
        assert isinstance(guard._lock, type(threading.Lock()))

    def test_budget_guard_no_lost_increments(self) -> None:
        """100 threads x 100 records must yield exactly 10,000 calls with no lost increments."""
        import concurrent.futures

        guard = BudgetGuard(max_calls=20_000)

        def worker():
            for _ in range(100):
                guard.record(prompt="a", response="b")

        with concurrent.futures.ThreadPoolExecutor(max_workers=100) as pool:
            futures = [pool.submit(worker) for _ in range(100)]
            for f in futures:
                f.result()

        assert guard.calls_made == 10_000, f"Expected 10000, got {guard.calls_made}"

    def test_budget_guard_concurrent_check_and_record(self) -> None:
        """Concurrent check() and record() must not raise unexpected exceptions."""
        import concurrent.futures

        guard = BudgetGuard(max_calls=500)

        def recorder():
            for _ in range(50):
                guard.record(prompt="x", response="y")

        def checker():
            for _ in range(50):
                try:
                    guard.check()
                except Exception:
                    pass  # BudgetExhaustedError is expected if limit hit

        with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
            futures = []
            for _ in range(5):
                futures.append(pool.submit(recorder))
                futures.append(pool.submit(checker))
            for f in futures:
                f.result()  # Should not raise any unexpected exception

        assert guard.calls_made == 250


# ---------------------------------------------------------------------------
# spec-21 Phase 12: Test Coverage -- budget_guard.py
# ---------------------------------------------------------------------------


class TestBudgetGuardCoverageS21:
    """Additional tests for spec-21 Phase 12 coverage gaps."""

    def test_budget_guard_fresh_state(self) -> None:
        """A new BudgetGuard instance must have zero calls and zero cost."""
        guard = BudgetGuard()
        assert guard.calls_made == 0
        assert guard.estimated_cost_usd == 0.0
        assert guard.calls_remaining == _DEFAULT_MAX_CALLS

    def test_default_limits(self) -> None:
        """Default max_calls and max_cost_usd match module constants."""
        guard = BudgetGuard()
        assert guard.max_calls == _DEFAULT_MAX_CALLS
        assert guard.max_cost_usd == _DEFAULT_MAX_COST_USD

    def test_cost_calculation_formula(self) -> None:
        """Cost must equal (input_tokens * INPUT_RATE + output_tokens * OUTPUT_RATE) / 1_000_000."""
        from codelicious.context_manager import estimate_tokens

        guard = BudgetGuard(max_calls=10)
        prompt = "hello world"
        response = "goodbye"
        guard.record(prompt=prompt, response=response)

        input_tokens = estimate_tokens(prompt)
        output_tokens = estimate_tokens(response)
        expected_cost = round(
            input_tokens * _INPUT_RATE_PER_MTOK / 1_000_000 + output_tokens * _OUTPUT_RATE_PER_MTOK / 1_000_000,
            6,
        )
        assert guard.estimated_cost_usd == expected_cost
