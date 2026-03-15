"""Tests for Phase 6: policybind token integration.

All tests must pass with policybind NOT installed.
"""

import sys
from unittest.mock import MagicMock

from proxilion_build.config import PolicyConfig
from proxilion_build.llm_client import create_policy_guarded_llm

# ---------------------------------------------------------------------------
# test_policy_config_disabled_by_default
# ---------------------------------------------------------------------------


class TestPolicyConfigDisabledByDefault:
    def test_disabled_by_default(self):
        cfg = PolicyConfig()
        assert cfg.enabled is False

    def test_defaults(self):
        cfg = PolicyConfig()
        assert cfg.policybind_endpoint == ""
        assert cfg.org_id == ""
        assert cfg.daily_budget_usd == 50.0
        assert cfg.allowed_models == []
        assert cfg.token_ttl_seconds == 3600

    def test_from_env_disabled_when_env_not_set(self, monkeypatch):
        monkeypatch.delenv("PROXILION_POLICY_ENABLED", raising=False)
        cfg = PolicyConfig.from_env()
        assert cfg.enabled is False

    def test_from_env_enabled_when_set_to_true(self, monkeypatch):
        monkeypatch.setenv("PROXILION_POLICY_ENABLED", "true")
        monkeypatch.setenv("PROXILION_POLICYBIND_ENDPOINT", "https://policy.example.com")
        cfg = PolicyConfig.from_env()
        assert cfg.enabled is True
        assert cfg.policybind_endpoint == "https://policy.example.com"

    def test_from_env_parses_allowed_models(self, monkeypatch):
        monkeypatch.setenv("PROXILION_POLICY_ENABLED", "1")
        monkeypatch.setenv("PROXILION_POLICY_ALLOWED_MODELS", "gpt-4,claude-sonnet-4-6")
        cfg = PolicyConfig.from_env()
        assert cfg.allowed_models == ["gpt-4", "claude-sonnet-4-6"]

    def test_from_env_parses_daily_budget(self, monkeypatch):
        monkeypatch.setenv("PROXILION_POLICY_ENABLED", "1")
        monkeypatch.setenv("PROXILION_POLICY_DAILY_BUDGET", "100.5")
        cfg = PolicyConfig.from_env()
        assert cfg.daily_budget_usd == 100.5


# ---------------------------------------------------------------------------
# test_create_policy_guarded_llm_returns_original_when_disabled
# ---------------------------------------------------------------------------


class TestCreatePolicyGuardedLlmDisabled:
    def test_returns_original_call_when_disabled(self):
        original = MagicMock(return_value="response")
        cfg = PolicyConfig(enabled=False)
        guarded = create_policy_guarded_llm(original, cfg)
        # Must be the exact same callable
        assert guarded is original

    def test_original_is_called_through(self):
        original = MagicMock(return_value="hello")
        cfg = PolicyConfig(enabled=False)
        guarded = create_policy_guarded_llm(original, cfg)
        result = guarded("sys", "user")
        assert result == "hello"
        original.assert_called_once_with("sys", "user")


# ---------------------------------------------------------------------------
# test_create_policy_guarded_llm_fails_open_when_not_installed
# ---------------------------------------------------------------------------


class TestCreatePolicyGuardedLlmNotInstalled:
    def test_returns_original_when_policybind_not_installed(self, monkeypatch):
        """When policybind is not installed, return the original llm_call unchanged."""
        # Ensure policybind is not importable in this test
        monkeypatch.setitem(sys.modules, "policybind", None)  # type: ignore

        original = MagicMock(return_value="ok")
        cfg = PolicyConfig(enabled=True, policybind_endpoint="http://policy.test")
        guarded = create_policy_guarded_llm(original, cfg)
        # Should fail open — return original callable
        assert guarded is original

    def test_original_still_callable_when_policybind_missing(self, monkeypatch):
        """Direct call still works when policybind import fails."""
        monkeypatch.setitem(sys.modules, "policybind", None)  # type: ignore

        original = MagicMock(return_value="direct response")
        cfg = PolicyConfig(enabled=True)
        guarded = create_policy_guarded_llm(original, cfg)
        result = guarded("system", "prompt")
        assert result == "direct response"
