"""Per-build LLM call budget and cost ceiling guard."""

from __future__ import annotations

import logging
import os
import threading

from codelicious._env import parse_env_float
from codelicious.context_manager import estimate_tokens
from codelicious.errors import BudgetExhaustedError

__all__ = ["BudgetGuard"]

logger = logging.getLogger("codelicious.budget_guard")

# Model pricing constants (USD per million tokens)
# Overridable via CODELICIOUS_INPUT_RATE_PER_MTOK / CODELICIOUS_OUTPUT_RATE_PER_MTOK
_DEFAULT_INPUT_RATE: float = 3.00
_DEFAULT_OUTPUT_RATE: float = 15.00

_INPUT_RATE_PER_MTOK: float = parse_env_float("CODELICIOUS_INPUT_RATE_PER_MTOK", _DEFAULT_INPUT_RATE, min_val=0.0)
_OUTPUT_RATE_PER_MTOK: float = parse_env_float("CODELICIOUS_OUTPUT_RATE_PER_MTOK", _DEFAULT_OUTPUT_RATE, min_val=0.0)

_DEFAULT_MAX_CALLS: int = 150
_DEFAULT_MAX_COST_USD: float = 3.00


class BudgetGuard:
    """Enforces a hard cap on LLM calls and estimated cost per build."""

    def __init__(
        self,
        max_calls: int = _DEFAULT_MAX_CALLS,
        max_cost_usd: float | None = None,
    ) -> None:
        # Single consolidated check for max_calls - must be at least 1
        if max_calls < 1:
            raise ValueError(f"max_calls must be >= 1, got {max_calls}")

        # Explicit max_cost_usd parameter validation (if provided)
        if max_cost_usd is not None and max_cost_usd <= 0:
            raise ValueError(f"max_cost_usd must be > 0, got {max_cost_usd}")

        self.max_calls = max_calls

        # Resolve cost from parameter or environment variable
        resolved_cost: float
        if max_cost_usd is not None:
            resolved_cost = max_cost_usd
        else:
            env_cost = os.environ.get("CODELICIOUS_MAX_BUILD_COST_USD")
            if env_cost is not None:
                try:
                    resolved_cost = float(env_cost)
                    if resolved_cost <= 0:
                        logger.warning(
                            "CODELICIOUS_MAX_BUILD_COST_USD=%s is not positive, using default %.2f",
                            env_cost,
                            _DEFAULT_MAX_COST_USD,
                        )
                        resolved_cost = _DEFAULT_MAX_COST_USD
                except ValueError:
                    logger.warning(
                        "CODELICIOUS_MAX_BUILD_COST_USD=%r is not a valid float, using default %.2f",
                        env_cost,
                        _DEFAULT_MAX_COST_USD,
                    )
                    resolved_cost = _DEFAULT_MAX_COST_USD
            else:
                resolved_cost = _DEFAULT_MAX_COST_USD

        self.max_cost_usd = resolved_cost
        self._calls_made: int = 0
        self._estimated_cost_usd: float = 0.0
        self._lock = threading.Lock()
        logger.debug(
            "BudgetGuard initialized: max_calls=%d, max_cost=$%.2f",
            max_calls,
            self.max_cost_usd,
        )

    # ------------------------------------------------------------------
    # Public interface
    # ------------------------------------------------------------------

    def check(self) -> None:
        """Raise BudgetExhaustedError if any limit has already been hit."""
        with self._lock:
            calls = self._calls_made
            cost = self._estimated_cost_usd
        logger.debug(
            "Budget check: calls=%d/%d, cost=$%.4f/$%.2f",
            calls,
            self.max_calls,
            cost,
            self.max_cost_usd,
        )
        if calls >= self.max_calls:
            raise BudgetExhaustedError(
                f"LLM call limit {self.max_calls} reached. Build stopped.",
                calls_made=calls,
            )
        if cost >= self.max_cost_usd:
            raise BudgetExhaustedError(
                f"Estimated cost ${cost:.4f} reached ceiling ${self.max_cost_usd:.2f}. Build stopped.",
                calls_made=calls,
            )

    def record(self, prompt: str = "", response: str = "") -> None:
        """Record one completed LLM call and accumulate estimated cost.

        Thread-safe: acquires ``_lock`` around counter updates (spec-22 Phase 6).
        """
        input_tokens = estimate_tokens(prompt)
        output_tokens = estimate_tokens(response)
        with self._lock:
            self._calls_made += 1
            self._estimated_cost_usd = round(
                self._estimated_cost_usd
                + input_tokens * _INPUT_RATE_PER_MTOK / 1_000_000
                + output_tokens * _OUTPUT_RATE_PER_MTOK / 1_000_000,
                6,
            )
            calls = self._calls_made
            cost = self._estimated_cost_usd
        logger.debug(
            "Budget record: call #%d, input=%d tokens, output=%d tokens, cumulative_cost=$%.4f",
            calls,
            input_tokens,
            output_tokens,
            cost,
        )

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def calls_made(self) -> int:
        with self._lock:
            return self._calls_made

    @property
    def calls_remaining(self) -> int:
        with self._lock:
            return max(0, self.max_calls - self._calls_made)

    @property
    def estimated_cost_usd(self) -> float:
        with self._lock:
            return self._estimated_cost_usd
