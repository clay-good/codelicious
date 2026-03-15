"""Per-build LLM call budget and cost ceiling guard."""

from __future__ import annotations

import logging
import os

from proxilion_build.context_manager import estimate_tokens
from proxilion_build.errors import BudgetExhaustedError

__all__ = ["BudgetGuard"]

logger = logging.getLogger("proxilion_build.budget_guard")

# Model pricing constants (USD per million tokens)
_INPUT_RATE_PER_MTOK: float = 3.00
_OUTPUT_RATE_PER_MTOK: float = 15.00

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
            env_cost = os.environ.get("PROXILION_MAX_BUILD_COST_USD")
            if env_cost is not None:
                try:
                    resolved_cost = float(env_cost)
                    if resolved_cost <= 0:
                        logger.warning(
                            "PROXILION_MAX_BUILD_COST_USD=%s is not positive, using default %.2f",
                            env_cost,
                            _DEFAULT_MAX_COST_USD,
                        )
                        resolved_cost = _DEFAULT_MAX_COST_USD
                except ValueError:
                    logger.warning(
                        "PROXILION_MAX_BUILD_COST_USD=%r is not a valid float, using default %.2f",
                        env_cost,
                        _DEFAULT_MAX_COST_USD,
                    )
                    resolved_cost = _DEFAULT_MAX_COST_USD
            else:
                resolved_cost = _DEFAULT_MAX_COST_USD

        self.max_cost_usd = resolved_cost
        self._calls_made: int = 0
        self._estimated_cost_usd: float = 0.0
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
        logger.debug(
            "Budget check: calls=%d/%d, cost=$%.4f/$%.2f",
            self._calls_made,
            self.max_calls,
            self._estimated_cost_usd,
            self.max_cost_usd,
        )
        if self._calls_made >= self.max_calls:
            raise BudgetExhaustedError(
                f"LLM call limit {self.max_calls} reached. Build stopped.",
                calls_made=self._calls_made,
            )
        if self._estimated_cost_usd >= self.max_cost_usd:
            raise BudgetExhaustedError(
                f"Estimated cost ${self._estimated_cost_usd:.4f} reached ceiling "
                f"${self.max_cost_usd:.2f}. Build stopped.",
                calls_made=self._calls_made,
            )

    def record(self, prompt: str = "", response: str = "") -> None:
        """Record one completed LLM call and accumulate estimated cost."""
        self._calls_made += 1
        input_tokens = estimate_tokens(prompt)
        output_tokens = estimate_tokens(response)
        self._estimated_cost_usd = round(
            self._estimated_cost_usd
            + input_tokens * _INPUT_RATE_PER_MTOK / 1_000_000
            + output_tokens * _OUTPUT_RATE_PER_MTOK / 1_000_000,
            6,
        )
        logger.debug(
            "Budget record: call #%d, input=%d tokens, output=%d tokens, cumulative_cost=$%.4f",
            self._calls_made,
            input_tokens,
            output_tokens,
            self._estimated_cost_usd,
        )

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def calls_made(self) -> int:
        return self._calls_made

    @property
    def calls_remaining(self) -> int:
        return max(0, self.max_calls - self._calls_made)

    @property
    def estimated_cost_usd(self) -> float:
        return self._estimated_cost_usd
