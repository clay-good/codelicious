"""Tests for the configuration module."""

from __future__ import annotations

import argparse

import pytest

from proxilion_build.config import (
    PROVIDER_DEFAULTS,
    Config,
    build_config,
)


def _namespace(**kwargs: object) -> argparse.Namespace:
    """Build an argparse.Namespace with sensible defaults."""
    defaults = {
        "provider": None,
        "model": None,
        "patience": None,
        "dry_run": None,
        "stop_on_failure": None,
        "verbose": None,
        "project_dir": ".",
        "verification_timeout": None,
        "max_context_tokens": None,
        "verify_command": None,
        "replan_after_failures": None,
    }
    defaults.update(kwargs)
    return argparse.Namespace(**defaults)


# -- defaults --------------------------------------------------------------


def test_default_config_values() -> None:
    cfg = Config()
    assert cfg.provider == "anthropic"
    assert cfg.model == ""
    assert cfg.patience == 3
    assert cfg.dry_run is False
    assert cfg.verbose is False
    assert cfg.max_context_tokens == 100_000
    assert cfg.verify_command is None
    assert cfg.replan_after_failures == 2


def test_build_config_defaults() -> None:
    cfg = build_config(_namespace())
    assert cfg.provider == "anthropic"
    assert cfg.patience == 3


# -- CLI args override env vars --------------------------------------------


def test_cli_provider_overrides_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PROXILION_BUILD_PROVIDER", "openai")
    cfg = build_config(_namespace(provider="anthropic"))
    assert cfg.provider == "anthropic"


def test_cli_model_overrides_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PROXILION_BUILD_MODEL", "env-model")
    cfg = build_config(_namespace(model="cli-model"))
    assert cfg.model == "cli-model"


def test_cli_patience_overrides_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PROXILION_BUILD_PATIENCE", "10")
    cfg = build_config(_namespace(patience=5))
    assert cfg.patience == 5


# -- env vars override defaults --------------------------------------------


def test_env_provider_overrides_default(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("PROXILION_BUILD_PROVIDER", "openai")
    cfg = build_config(_namespace())
    assert cfg.provider == "openai"


def test_env_model_overrides_default(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("PROXILION_BUILD_MODEL", "custom-model")
    cfg = build_config(_namespace())
    assert cfg.model == "custom-model"


def test_env_patience_overrides_default(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("PROXILION_BUILD_PATIENCE", "7")
    cfg = build_config(_namespace())
    assert cfg.patience == 7


def test_env_max_context_tokens(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PROXILION_BUILD_MAX_CONTEXT_TOKENS", "50000")
    cfg = build_config(_namespace())
    assert cfg.max_context_tokens == 50_000


def test_env_verify_command(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PROXILION_BUILD_VERIFY_COMMAND", "npm test")
    cfg = build_config(_namespace())
    assert cfg.verify_command == "npm test"


# -- validation errors -----------------------------------------------------


def test_invalid_provider_raises() -> None:
    with pytest.raises(ValueError, match="Unknown provider"):
        build_config(_namespace(provider="unknown"))


def test_negative_patience_raises() -> None:
    with pytest.raises(ValueError, match="positive integer"):
        build_config(_namespace(patience=0))


def test_nonexistent_project_dir_raises() -> None:
    with pytest.raises(ValueError, match="does not exist"):
        build_config(_namespace(project_dir="/nonexistent/path"))


# -- model defaults per provider -------------------------------------------


def test_effective_model_anthropic() -> None:
    cfg = Config(provider="anthropic")
    assert cfg.get_effective_model() == PROVIDER_DEFAULTS["anthropic"]


def test_effective_model_openai() -> None:
    cfg = Config(provider="openai")
    assert cfg.get_effective_model() == PROVIDER_DEFAULTS["openai"]


def test_effective_model_explicit() -> None:
    cfg = Config(provider="anthropic", model="my-custom-model")
    assert cfg.get_effective_model() == "my-custom-model"


# -- API key env var -------------------------------------------------------


def test_api_key_env_var_anthropic() -> None:
    cfg = Config(provider="anthropic")
    assert cfg.get_api_key_env_var() == "ANTHROPIC_API_KEY"


def test_api_key_env_var_openai() -> None:
    cfg = Config(provider="openai")
    assert cfg.get_api_key_env_var() == "OPENAI_API_KEY"


def test_api_key_loaded_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test-key-12345")
    cfg = build_config(_namespace())
    assert cfg.api_key == "sk-test-key-12345"


# -- Phase 0 hardening tests -----------------------------------------------


def test_patience_zero_raises() -> None:
    with pytest.raises(ValueError, match="positive integer"):
        build_config(_namespace(patience=0))


def test_verify_timeout_zero_raises() -> None:
    with pytest.raises(ValueError, match="verification_timeout"):
        build_config(_namespace(verification_timeout=0))


def test_max_context_tokens_too_small_raises() -> None:
    with pytest.raises(ValueError, match="max_context_tokens"):
        build_config(_namespace(max_context_tokens=999))


def test_env_patience_non_numeric_raises(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("PROXILION_BUILD_PATIENCE", "abc")
    with pytest.raises(ValueError, match="Invalid value for PROXILION_BUILD_PATIENCE"):
        build_config(_namespace())


def test_env_max_context_tokens_non_numeric_raises(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("PROXILION_BUILD_MAX_CONTEXT_TOKENS", "not-a-number")
    with pytest.raises(ValueError, match="Invalid value for PROXILION_BUILD_MAX_CONTEXT_TOKENS"):
        build_config(_namespace())


def test_api_key_whitespace_stripped(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ANTHROPIC_API_KEY", "  sk-trimmed  ")
    cfg = build_config(_namespace())
    assert cfg.api_key == "sk-trimmed"


# -- Phase 13: Config Boundary Conditions ----------------------------------


def test_patience_exactly_one_valid(monkeypatch: pytest.MonkeyPatch) -> None:
    """PROXILION_BUILD_PATIENCE=1 is accepted."""
    monkeypatch.setenv("PROXILION_BUILD_PATIENCE", "1")
    cfg = build_config(_namespace())
    assert cfg.patience == 1


def test_max_context_tokens_exactly_1000_valid(monkeypatch: pytest.MonkeyPatch) -> None:
    """PROXILION_BUILD_MAX_CONTEXT_TOKENS=1000 is accepted."""
    monkeypatch.setenv("PROXILION_BUILD_MAX_CONTEXT_TOKENS", "1000")
    cfg = build_config(_namespace())
    assert cfg.max_context_tokens == 1000


def test_verify_timeout_exactly_one_valid() -> None:
    """verification_timeout=1 via CLI arg is accepted."""
    cfg = build_config(_namespace(verification_timeout=1))
    assert cfg.verification_timeout == 1


# -- Claude provider -------------------------------------------------------


def test_claude_provider_accepted() -> None:
    """'claude' is a valid provider choice."""
    cfg = build_config(_namespace(provider="claude"))
    assert cfg.provider == "claude"


def test_effective_model_claude() -> None:
    cfg = Config(provider="claude")
    assert cfg.get_effective_model() == PROVIDER_DEFAULTS["claude"]


def test_api_key_env_var_claude_empty() -> None:
    """claude provider has no API key env var."""
    cfg = Config(provider="claude")
    assert cfg.get_api_key_env_var() == ""


def test_claude_provider_no_api_key_loaded() -> None:
    """claude provider does not try to load an API key."""
    cfg = build_config(_namespace(provider="claude"))
    assert cfg.api_key == ""
