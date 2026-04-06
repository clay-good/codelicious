"""Shared environment variable parsing utilities.

Centralises the pattern of reading an env var, parsing it to a typed
value, validating constraints, and falling back to a default with a
warning log.  All functions are pure (no side effects beyond logging)
and depend only on the standard library.

Extracted in spec-19 Phase 9 (CD-1) to eliminate duplicated parsing in
config.py, budget_guard.py, verifier.py, sandbox.py, and progress.py.
"""

from __future__ import annotations

import logging
import os
from typing import Callable

__all__ = [
    "parse_env_csv",
    "parse_env_float",
    "parse_env_int",
    "parse_env_str",
]

logger = logging.getLogger("codelicious.env")


def parse_env_int(
    name: str,
    default: int,
    min_val: int | None = None,
    max_val: int | None = None,
) -> int:
    """Parse an integer environment variable with fallback to *default*.

    Logs at DEBUG when an override is active, WARNING on invalid values.
    """
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        val = int(raw)
    except ValueError:
        logger.warning("%s=%r is not a valid integer, using default %d", name, raw, default)
        return default
    if min_val is not None and val < min_val:
        logger.warning("%s=%d is below minimum %d, using default %d", name, val, min_val, default)
        return default
    if max_val is not None and val > max_val:
        logger.warning("%s=%d is above maximum %d, using default %d", name, val, max_val, default)
        return default
    logger.debug("%s override active: %d", name, val)
    return val


def parse_env_float(
    name: str,
    default: float,
    min_val: float | None = None,
    max_val: float | None = None,
) -> float:
    """Parse a float environment variable with fallback to *default*.

    Logs at DEBUG when an override is active, WARNING on invalid values.
    """
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        val = float(raw)
    except ValueError:
        logger.warning("%s=%r is not a valid float, using default %.2f", name, raw, default)
        return default
    if min_val is not None and val < min_val:
        logger.warning("%s=%.2f is below minimum %.2f, using default %.2f", name, val, min_val, default)
        return default
    if max_val is not None and val > max_val:
        logger.warning("%s=%.2f is above maximum %.2f, using default %.2f", name, val, max_val, default)
        return default
    logger.debug("%s override active: %.4f", name, val)
    return val


def parse_env_str(name: str, default: str) -> str:
    """Parse a string environment variable with fallback to *default*.

    Returns the raw value (stripped) or *default* if unset or empty.
    """
    raw = os.environ.get(name)
    if raw is None:
        return default
    val = raw.strip()
    if not val:
        return default
    logger.debug("%s override active: %s", name, val)
    return val


def parse_env_csv(
    name: str,
    default: frozenset[str],
    validator: Callable[[str], bool] | None = None,
) -> frozenset[str]:
    """Parse a comma-separated environment variable, merging with *default*.

    Each item is stripped.  Empty items are skipped.  If *validator* is
    provided, items that fail validation are logged at WARNING and skipped.
    Returns ``default | valid_extras``.
    """
    raw = os.environ.get(name)
    if not raw:
        return default
    extras: set[str] = set()
    for item in raw.split(","):
        item = item.strip()
        if not item:
            continue
        if validator is not None and not validator(item):
            logger.warning("Ignoring invalid item %r from %s", item, name)
            continue
        extras.add(item)
    if extras:
        logger.debug("%s: merged %d extra items", name, len(extras))
        return default | frozenset(extras)
    return default
