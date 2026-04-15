"""Handles configuration loading from environment variables and config files."""

from __future__ import annotations

import json
import logging
import pathlib
import urllib.parse

__all__ = [
    "API_KEY_ENV_VARS",
    "PROVIDER_DEFAULTS",
    "_validate_endpoint_url",
    "load_project_config",
]

logger = logging.getLogger("codelicious.config")

# Keys that .codelicious/config.json is allowed to set.
# Must match git_orchestrator._ALLOWED_CONFIG_KEYS.
_ALLOWED_CONFIG_KEYS: frozenset[str] = frozenset(
    {
        "allowlisted_commands",
        "chunk_strategy",
        "default_engine",
        "default_reviewers",
        "max_calls_per_iteration",
        "max_commits_per_pr",
        "platform",
        "verify_command",
    }
)

_CONFIG_MAX_BYTES: int = 100_000


def load_project_config(repo_path: pathlib.Path) -> dict:
    """Load and validate .codelicious/config.json.

    Returns a dict filtered to allowed keys with values clamped to safe ranges.
    Returns an empty dict on any error (missing file, malformed JSON, too large).
    """
    config_path = repo_path / ".codelicious" / "config.json"
    if not config_path.exists():
        return {}

    try:
        config_size = config_path.stat().st_size
        if config_size > _CONFIG_MAX_BYTES:
            logger.error("config.json too large (%d bytes); skipping.", config_size)
            return {}

        loaded = json.loads(config_path.read_text())
        if not isinstance(loaded, dict):
            return {}

        # Filter to allowed keys only (prevent config injection)
        result = {k: v for k, v in loaded.items() if k in _ALLOWED_CONFIG_KEYS}

        # Deprecation warning for allowlisted_commands
        if "allowlisted_commands" in result:
            logger.warning(
                "Config key 'allowlisted_commands' is deprecated and ignored. "
                "Command restrictions are hardcoded in security_constants.py."
            )
            del result["allowlisted_commands"]

        # Clamp max_calls_per_iteration to safe range
        if "max_calls_per_iteration" in result:
            result["max_calls_per_iteration"] = max(10, min(100, int(result["max_calls_per_iteration"])))

        # spec-27 Phase 6.3: validate new v2 config keys
        if "max_commits_per_pr" in result:
            try:
                val = int(result["max_commits_per_pr"])
                if not (1 <= val <= 100):
                    logger.warning("max_commits_per_pr=%d out of range [1,100]; clamping.", val)
                    val = max(1, min(100, val))
                result["max_commits_per_pr"] = val
            except (ValueError, TypeError):
                logger.warning("max_commits_per_pr is not a valid integer; removing.")
                del result["max_commits_per_pr"]

        if "platform" in result and result["platform"] not in ("auto", "github", "gitlab"):
            logger.warning("platform=%r not in (auto, github, gitlab); defaulting to auto.", result["platform"])
            result["platform"] = "auto"

        if "chunk_strategy" in result and result["chunk_strategy"] not in ("auto", "checkbox", "llm"):
            logger.warning(
                "chunk_strategy=%r not in (auto, checkbox, llm); defaulting to auto.",
                result["chunk_strategy"],
            )
            result["chunk_strategy"] = "auto"

        if "default_engine" in result and result["default_engine"] not in ("auto", "claude", "huggingface"):
            logger.warning(
                "default_engine=%r not in (auto, claude, huggingface); defaulting to auto.",
                result["default_engine"],
            )
            result["default_engine"] = "auto"

        return result
    except (json.JSONDecodeError, ValueError, OSError):
        return {}


def _validate_endpoint_url(url: str, var_name: str = "endpoint") -> None:
    """Validate an endpoint URL to prevent SSRF via user-supplied configuration.

    Rules:
    - Only HTTPS is accepted, except for localhost/127.0.0.1/::1 which may use
      plain HTTP for local development proxies.
    - Any other scheme (http to a remote host, ftp, file, …) is rejected.
    - An empty string is allowed (feature may be disabled).

    Args:
        url: The URL string to validate.
        var_name: The environment variable name to include in the error message.

    Raises:
        ValueError: If the URL fails validation.
    """
    if not url:
        return

    try:
        parsed = urllib.parse.urlparse(url)
    except Exception as exc:
        raise ValueError(f"Unparseable URL in {var_name}: {url!r}") from exc

    scheme = parsed.scheme.lower()
    hostname = (parsed.hostname or "").lower()

    is_localhost = hostname in ("localhost", "127.0.0.1", "::1")

    if scheme == "https":
        return

    if scheme == "http" and is_localhost:
        # Plain HTTP is allowed only for local development endpoints.
        return

    raise ValueError(
        f"Insecure or disallowed URL in {var_name}: {url!r}. "
        "Only HTTPS URLs are permitted (or HTTP to localhost for development)."
    )


PROVIDER_DEFAULTS: dict[str, str] = {
    "anthropic": "claude-sonnet-4-20250514",
    "openai": "gpt-4o",
    "claude": "sonnet",
}

API_KEY_ENV_VARS: dict[str, str] = {
    "anthropic": "ANTHROPIC_API_KEY",
    "openai": "OPENAI_API_KEY",
    # "claude" provider uses the claude CLI's own auth — no API key env var
}
