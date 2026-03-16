"""Handles configuration loading from environment variables and config files."""

from __future__ import annotations

import argparse
import logging
import os
import pathlib
from dataclasses import dataclass, field
from typing import List

__all__ = [
    "API_KEY_ENV_VARS",
    "Config",
    "PROVIDER_DEFAULTS",
    "PolicyConfig",
    "build_config",
]

logger = logging.getLogger("codelicious.config")


# ---------------------------------------------------------------------------
# Environment variable parsing helpers
# ---------------------------------------------------------------------------


def _parse_env_int(var_name: str, default: int, min_val: int | None = None) -> int:
    """Parse an integer environment variable with fallback to default."""
    raw = os.environ.get(var_name)
    if raw is None:
        return default
    try:
        val = int(raw)
    except ValueError:
        logger.warning(
            "%s=%r is not a valid integer, using default %d", var_name, raw, default
        )
        return default
    if min_val is not None and val < min_val:
        logger.warning(
            "%s=%d is below minimum %d, using default %d",
            var_name,
            val,
            min_val,
            default,
        )
        return default
    return val


def _parse_env_float(
    var_name: str, default: float, min_val: float | None = None
) -> float:
    """Parse a float environment variable with fallback to default."""
    raw = os.environ.get(var_name)
    if raw is None:
        return default
    try:
        val = float(raw)
    except ValueError:
        logger.warning(
            "%s=%r is not a valid float, using default %.2f", var_name, raw, default
        )
        return default
    if min_val is not None and val < min_val:
        logger.warning(
            "%s=%.2f is below minimum %.2f, using default %.2f",
            var_name,
            val,
            min_val,
            default,
        )
        return default
    return val


def _parse_env_bool(var_name: str, default: bool) -> bool:
    """Parse a boolean environment variable with fallback to default."""
    raw = os.environ.get(var_name)
    if raw is None:
        return default
    return raw.lower() in ("1", "true", "yes", "on")


@dataclass
class PolicyConfig:
    """Optional policybind token integration configuration."""

    enabled: bool = False
    policybind_endpoint: str = ""
    org_id: str = ""
    daily_budget_usd: float = 50.0
    allowed_models: List[str] = field(default_factory=list)
    token_ttl_seconds: int = 3600

    @classmethod
    def from_env(cls) -> "PolicyConfig":
        """Build PolicyConfig from environment variables."""
        enabled_raw = os.environ.get("CODELICIOUS_POLICY_ENABLED", "").strip().lower()
        enabled = enabled_raw in ("1", "true", "yes")

        allowed_models_raw = os.environ.get(
            "CODELICIOUS_POLICY_ALLOWED_MODELS", ""
        ).strip()
        if allowed_models_raw:
            allowed_models = [
                m.strip() for m in allowed_models_raw.split(",") if m.strip()
            ]
        else:
            allowed_models = []

        daily_budget_usd = 50.0
        budget_raw = os.environ.get("CODELICIOUS_POLICY_DAILY_BUDGET", "").strip()
        if budget_raw:
            try:
                parsed_budget = float(budget_raw)
                if parsed_budget <= 0:
                    logger.warning(
                        "CODELICIOUS_POLICY_DAILY_BUDGET='%s' is not positive, using default $%.2f",
                        budget_raw,
                        50.0,
                    )
                else:
                    daily_budget_usd = parsed_budget
            except ValueError:
                logger.warning(
                    "Invalid CODELICIOUS_POLICY_DAILY_BUDGET value '%s', using default $%.2f",
                    budget_raw,
                    50.0,
                )

        endpoint = os.environ.get("CODELICIOUS_POLICYBIND_ENDPOINT", "").strip()
        org_id = os.environ.get("CODELICIOUS_POLICY_ORG_ID", "").strip()
        logger.debug(
            "PolicyConfig: enabled=%s, endpoint=%s, org_id=%s, budget=$%.2f, models=%s",
            enabled,
            endpoint,
            org_id,
            daily_budget_usd,
            allowed_models,
        )
        return cls(
            enabled=enabled,
            policybind_endpoint=endpoint,
            org_id=org_id,
            daily_budget_usd=daily_budget_usd,
            allowed_models=allowed_models,
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


@dataclass
class Config:
    """Runtime configuration for codelicious."""

    provider: str = "anthropic"
    model: str = ""
    api_key: str = ""
    patience: int = 3
    dry_run: bool = False
    stop_on_failure: bool = False
    verbose: bool = False
    project_dir: pathlib.Path = field(default_factory=lambda: pathlib.Path("."))
    verification_timeout: int = 120
    max_context_tokens: int = 100_000
    verify_command: str | None = None
    replan_after_failures: int = 2
    coverage_threshold: int = 0  # 0 = disabled; set to e.g. 60 to enforce 60% coverage
    task_timeout: int = 600
    test_timeout: int | None = None
    lint_timeout: int | None = None

    # Agent-mode fields
    agent_timeout_s: int = 7200  # 2 hours per invocation (big specs need time)
    effort: str = ""  # "", "low", "medium", "high", "max"
    max_turns: int = 0  # 0 = unlimited
    max_iterations: int = 10  # Max build→reflect cycles (legacy, kept for compat)
    reflect: bool = True  # Reflection after build (default on; --no-reflect disables)
    verify_passes: int = 3  # Max verify-fix passes after build
    push_pr: bool = False  # Push changes and create PR after successful build
    pr_base_branch: str = ""  # Base branch for PR (default: repo default branch)
    ci_fix_passes: int = 3  # Max CI fix attempts (0 = skip CI monitoring)
    auto_mode: bool = False  # Continuous build loop (one task per commit)
    spec_path: str = ""  # Path to spec file for auto mode
    log_dir: pathlib.Path = field(
        default_factory=lambda: pathlib.Path.home() / ".codelicious" / "builds"
    )

    def get_effective_model(self) -> str:
        """Return the model name, falling back to the provider default."""
        if self.model:
            return self.model
        return PROVIDER_DEFAULTS.get(self.provider, "")

    def get_api_key_env_var(self) -> str:
        """Return the environment variable name for this provider's API key."""
        return API_KEY_ENV_VARS.get(self.provider, "")


def build_config(cli_args: argparse.Namespace) -> Config:
    """Build a Config from CLI args and environment variables.

    Precedence: CLI args > env vars > defaults.
    """
    config = Config()

    # Provider
    env_provider = os.environ.get("CODELICIOUS_BUILD_PROVIDER")
    cli_provider = getattr(cli_args, "provider", None)
    provider_source = "default"
    if cli_provider:
        config.provider = cli_provider
        provider_source = "cli"
    elif env_provider:
        config.provider = env_provider
        provider_source = "env"

    if config.provider not in PROVIDER_DEFAULTS:
        raise ValueError(
            f"Unknown provider '{config.provider}'. "
            f"Supported: {', '.join(sorted(PROVIDER_DEFAULTS))}"
        )

    # Model
    env_model = os.environ.get("CODELICIOUS_BUILD_MODEL")
    cli_model = getattr(cli_args, "model", None)
    if cli_model:
        config.model = cli_model
    elif env_model:
        config.model = env_model

    # API key (from environment only, keyed by provider)
    api_key_var = config.get_api_key_env_var()
    if api_key_var:
        config.api_key = os.environ.get(api_key_var, "").strip()

    # Patience
    env_patience = os.environ.get("CODELICIOUS_BUILD_PATIENCE")
    cli_patience = getattr(cli_args, "patience", None)
    if cli_patience is not None:
        config.patience = cli_patience
    elif env_patience is not None:
        try:
            config.patience = int(env_patience)
        except ValueError:
            raise ValueError(
                f"Invalid value for CODELICIOUS_BUILD_PATIENCE: {env_patience}"
            )

    if config.patience < 1:
        raise ValueError(f"Patience must be a positive integer, got {config.patience}")

    # Max context tokens
    env_max_ctx = os.environ.get("CODELICIOUS_BUILD_MAX_CONTEXT_TOKENS")
    cli_max_ctx = getattr(cli_args, "max_context_tokens", None)
    if cli_max_ctx is not None:
        config.max_context_tokens = cli_max_ctx
    elif env_max_ctx is not None:
        try:
            config.max_context_tokens = int(env_max_ctx)
        except ValueError:
            raise ValueError(
                f"Invalid value for CODELICIOUS_BUILD_MAX_CONTEXT_TOKENS: {env_max_ctx}"
            )

    if config.max_context_tokens < 1000:
        raise ValueError(
            f"max_context_tokens must be >= 1000, got {config.max_context_tokens}"
        )

    # Verify command
    env_verify = os.environ.get("CODELICIOUS_BUILD_VERIFY_COMMAND")
    cli_verify = getattr(cli_args, "verify_command", None)
    if cli_verify is not None:
        config.verify_command = cli_verify
    elif env_verify is not None:
        config.verify_command = env_verify

    # Task timeout
    cli_task_timeout = getattr(cli_args, "task_timeout", None)
    if cli_task_timeout is not None:
        config.task_timeout = cli_task_timeout

    # Test timeout
    cli_test_timeout = getattr(cli_args, "test_timeout", None)
    if cli_test_timeout is not None:
        config.test_timeout = cli_test_timeout

    # Lint timeout
    cli_lint_timeout = getattr(cli_args, "lint_timeout", None)
    if cli_lint_timeout is not None:
        config.lint_timeout = cli_lint_timeout

    # Boolean flags (CLI only, no env override)
    cli_dry_run = getattr(cli_args, "dry_run", None)
    if cli_dry_run is not None:
        config.dry_run = cli_dry_run

    cli_stop = getattr(cli_args, "stop_on_failure", None)
    if cli_stop is not None:
        config.stop_on_failure = cli_stop

    cli_verbose = getattr(cli_args, "verbose", None)
    if cli_verbose is not None:
        config.verbose = cli_verbose

    # Project dir
    cli_project_dir = getattr(cli_args, "project_dir", None)
    if cli_project_dir is not None:
        config.project_dir = pathlib.Path(cli_project_dir)

    if not config.project_dir.is_dir():
        raise ValueError(f"Project directory does not exist: {config.project_dir}")

    # Verification timeout
    cli_timeout = getattr(cli_args, "verification_timeout", None)
    if cli_timeout is not None:
        config.verification_timeout = cli_timeout

    if config.verification_timeout < 1:
        raise ValueError(
            f"verification_timeout must be >= 1, got {config.verification_timeout}"
        )

    # Replan after failures
    cli_replan = getattr(cli_args, "replan_after_failures", None)
    if cli_replan is not None:
        config.replan_after_failures = cli_replan

    # Coverage threshold
    env_cov = os.environ.get("CODELICIOUS_BUILD_COVERAGE_THRESHOLD")
    cli_cov = getattr(cli_args, "coverage_threshold", None)
    if cli_cov is not None:
        config.coverage_threshold = cli_cov
    elif env_cov is not None:
        try:
            config.coverage_threshold = int(env_cov)
        except ValueError:
            raise ValueError(
                f"Invalid value for CODELICIOUS_BUILD_COVERAGE_THRESHOLD: {env_cov}"
            )

    if config.coverage_threshold < 0 or config.coverage_threshold > 100:
        raise ValueError(
            f"coverage_threshold must be between 0 and 100, got {config.coverage_threshold}"
        )

    # Agent timeout
    env_agent_timeout = os.environ.get("CODELICIOUS_BUILD_AGENT_TIMEOUT")
    cli_agent_timeout = getattr(cli_args, "agent_timeout_s", None)
    if cli_agent_timeout is not None:
        config.agent_timeout_s = cli_agent_timeout
    elif env_agent_timeout is not None:
        try:
            config.agent_timeout_s = int(env_agent_timeout)
        except ValueError:
            raise ValueError(
                f"Invalid value for CODELICIOUS_BUILD_AGENT_TIMEOUT: {env_agent_timeout}"
            )

    if config.agent_timeout_s < 60:
        raise ValueError(f"agent_timeout_s must be >= 60, got {config.agent_timeout_s}")

    # Effort
    _VALID_EFFORT_LEVELS = {"", "low", "medium", "high", "max"}
    env_effort = os.environ.get("CODELICIOUS_BUILD_EFFORT")
    cli_effort = getattr(cli_args, "effort", None)
    if cli_effort is not None:
        config.effort = cli_effort
    elif env_effort is not None:
        config.effort = env_effort

    if config.effort not in _VALID_EFFORT_LEVELS:
        raise ValueError(
            f"Invalid effort level '{config.effort}'. Valid values: low, medium, high, max"
        )

    # Max turns
    env_max_turns = os.environ.get("CODELICIOUS_BUILD_MAX_TURNS")
    cli_max_turns = getattr(cli_args, "max_turns", None)
    if cli_max_turns is not None:
        config.max_turns = cli_max_turns
    elif env_max_turns is not None:
        try:
            config.max_turns = int(env_max_turns)
        except ValueError:
            raise ValueError(
                f"Invalid value for CODELICIOUS_BUILD_MAX_TURNS: {env_max_turns}"
            )

    # Max iterations
    env_max_iter = os.environ.get("CODELICIOUS_BUILD_MAX_ITERATIONS")
    cli_max_iter = getattr(cli_args, "iterations", None)
    if cli_max_iter is not None:
        config.max_iterations = cli_max_iter
    elif env_max_iter is not None:
        try:
            config.max_iterations = int(env_max_iter)
        except ValueError:
            raise ValueError(
                f"Invalid value for CODELICIOUS_BUILD_MAX_ITERATIONS: {env_max_iter}"
            )

    if config.max_iterations < 1:
        raise ValueError(f"max_iterations must be >= 1, got {config.max_iterations}")

    # Reflect (--no-reflect disables; default is True)
    cli_no_reflect = getattr(cli_args, "no_reflect", None)
    if cli_no_reflect:
        config.reflect = False

    # Verify passes
    env_verify_passes = os.environ.get("CODELICIOUS_BUILD_VERIFY_PASSES")
    cli_verify_passes = getattr(cli_args, "verify_passes", None)
    if cli_verify_passes is not None:
        config.verify_passes = cli_verify_passes
    elif env_verify_passes is not None:
        try:
            config.verify_passes = int(env_verify_passes)
        except ValueError:
            raise ValueError(
                f"Invalid value for CODELICIOUS_BUILD_VERIFY_PASSES: {env_verify_passes}"
            )

    if config.verify_passes < 0:
        raise ValueError(f"verify_passes must be >= 0, got {config.verify_passes}")

    # Push PR
    cli_push_pr = getattr(cli_args, "push_pr", None)
    if cli_push_pr:
        config.push_pr = True

    # PR base branch
    cli_pr_base = getattr(cli_args, "pr_base_branch", None)
    if cli_pr_base:
        config.pr_base_branch = cli_pr_base

    # CI fix passes
    cli_ci_fix = getattr(cli_args, "ci_fix_passes", None)
    env_ci_fix = os.environ.get("CODELICIOUS_BUILD_CI_FIX_PASSES", "").strip()
    if cli_ci_fix is not None:
        config.ci_fix_passes = cli_ci_fix
    elif env_ci_fix:
        try:
            config.ci_fix_passes = int(env_ci_fix)
        except ValueError:
            logger.warning(
                "Invalid CODELICIOUS_BUILD_CI_FIX_PASSES value '%s', using default %d",
                env_ci_fix,
                config.ci_fix_passes,
            )

    # Auto mode
    cli_auto = getattr(cli_args, "auto", None)
    env_auto = os.environ.get("CODELICIOUS_BUILD_AUTO", "").strip().lower()
    if cli_auto:
        config.auto_mode = True
    elif env_auto in ("1", "true", "yes"):
        config.auto_mode = True

    # Spec path (for auto mode)
    cli_spec = getattr(cli_args, "spec", None)
    env_spec = os.environ.get("CODELICIOUS_BUILD_SPEC", "").strip()
    if cli_spec:
        config.spec_path = str(pathlib.Path(cli_spec).resolve())
    elif env_spec:
        config.spec_path = str(pathlib.Path(env_spec).resolve())

    # Log final configuration
    logger.debug("provider=%s (source: %s)", config.provider, provider_source)
    logger.info(
        "Config built: provider=%s, model=%s, verbose=%s, dry_run=%s",
        config.provider,
        config.get_effective_model(),
        config.verbose,
        config.dry_run,
    )

    return config
