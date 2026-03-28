"""Tests for config.py build_config validation error paths.

Finding 80: build_config validation error paths had 0% coverage.
Finding 41: PolicyConfig endpoint URL validation.
Covers:
- ValueError for each invalid parameter
- Env var precedence over defaults
- CLI arg precedence over env vars
"""

from __future__ import annotations

import argparse
import pathlib

import pytest

from codelicious.config import PolicyConfig, _validate_endpoint_url, build_config


# ---------------------------------------------------------------------------
# Helper to create a minimal argparse.Namespace
# ---------------------------------------------------------------------------


def _minimal_ns(**kwargs) -> argparse.Namespace:
    """Return an argparse.Namespace with a real project_dir and all other
    fields set to None by default so build_config falls through to defaults."""
    defaults = {
        "provider": None,
        "model": None,
        "patience": None,
        "max_context_tokens": None,
        "verify_command": None,
        "task_timeout": None,
        "test_timeout": None,
        "lint_timeout": None,
        "dry_run": None,
        "stop_on_failure": None,
        "verbose": None,
        "project_dir": ".",
        "verification_timeout": None,
        "replan_after_failures": None,
        "coverage_threshold": None,
        "agent_timeout_s": None,
        "effort": None,
        "max_turns": None,
        "iterations": None,
        "no_reflect": None,
        "verify_passes": None,
        "push_pr": None,
        "pr_base_branch": None,
        "ci_fix_passes": None,
        "auto": None,
        "spec": None,
    }
    defaults.update(kwargs)
    return argparse.Namespace(**defaults)


# ---------------------------------------------------------------------------
# Provider validation
# ---------------------------------------------------------------------------


class TestProviderValidation:
    """Tests for provider field validation in build_config."""

    def test_valid_anthropic_provider(self) -> None:
        """anthropic is a valid provider and does not raise."""
        cfg = build_config(_minimal_ns(provider="anthropic"))
        assert cfg.provider == "anthropic"

    def test_valid_openai_provider(self) -> None:
        """openai is a valid provider and does not raise."""
        cfg = build_config(_minimal_ns(provider="openai"))
        assert cfg.provider == "openai"

    def test_unknown_provider_raises_value_error(self) -> None:
        """An unknown provider name raises ValueError."""
        with pytest.raises(ValueError, match="Unknown provider"):
            build_config(_minimal_ns(provider="fakeai"))

    def test_env_provider_used_when_no_cli_provider(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """CODELICIOUS_BUILD_PROVIDER env var sets provider when CLI omits it."""
        monkeypatch.setenv("CODELICIOUS_BUILD_PROVIDER", "openai")
        cfg = build_config(_minimal_ns())
        assert cfg.provider == "openai"

    def test_cli_provider_overrides_env_provider(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """CLI provider arg takes precedence over CODELICIOUS_BUILD_PROVIDER."""
        monkeypatch.setenv("CODELICIOUS_BUILD_PROVIDER", "openai")
        cfg = build_config(_minimal_ns(provider="anthropic"))
        assert cfg.provider == "anthropic"


# ---------------------------------------------------------------------------
# Patience validation
# ---------------------------------------------------------------------------


class TestPatienceValidation:
    """Tests for patience field validation."""

    def test_patience_zero_raises_value_error(self) -> None:
        """patience=0 raises ValueError."""
        with pytest.raises(ValueError, match="Patience must be a positive integer"):
            build_config(_minimal_ns(patience=0))

    def test_patience_negative_raises_value_error(self) -> None:
        """Negative patience raises ValueError."""
        with pytest.raises(ValueError, match="Patience must be a positive integer"):
            build_config(_minimal_ns(patience=-1))

    def test_patience_one_is_valid(self) -> None:
        """patience=1 does not raise."""
        cfg = build_config(_minimal_ns(patience=1))
        assert cfg.patience == 1

    def test_env_patience_invalid_string_raises_value_error(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Invalid string in CODELICIOUS_BUILD_PATIENCE raises ValueError."""
        monkeypatch.setenv("CODELICIOUS_BUILD_PATIENCE", "not-an-int")
        with pytest.raises(ValueError, match="CODELICIOUS_BUILD_PATIENCE"):
            build_config(_minimal_ns())

    def test_cli_patience_overrides_env(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """CLI patience takes precedence over env var."""
        monkeypatch.setenv("CODELICIOUS_BUILD_PATIENCE", "10")
        cfg = build_config(_minimal_ns(patience=2))
        assert cfg.patience == 2


# ---------------------------------------------------------------------------
# max_context_tokens validation
# ---------------------------------------------------------------------------


class TestMaxContextTokensValidation:
    """Tests for max_context_tokens field validation."""

    def test_max_context_tokens_below_minimum_raises(self) -> None:
        """max_context_tokens < 1000 raises ValueError."""
        with pytest.raises(ValueError, match="max_context_tokens must be >= 1000"):
            build_config(_minimal_ns(max_context_tokens=500))

    def test_max_context_tokens_exactly_minimum_is_valid(self) -> None:
        """max_context_tokens=1000 does not raise."""
        cfg = build_config(_minimal_ns(max_context_tokens=1000))
        assert cfg.max_context_tokens == 1000

    def test_env_max_context_tokens_invalid_string(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Invalid string in CODELICIOUS_BUILD_MAX_CONTEXT_TOKENS raises ValueError."""
        monkeypatch.setenv("CODELICIOUS_BUILD_MAX_CONTEXT_TOKENS", "bad")
        with pytest.raises(ValueError, match="CODELICIOUS_BUILD_MAX_CONTEXT_TOKENS"):
            build_config(_minimal_ns())


# ---------------------------------------------------------------------------
# verification_timeout validation
# ---------------------------------------------------------------------------


class TestVerificationTimeoutValidation:
    """Tests for verification_timeout field validation."""

    def test_verification_timeout_zero_raises(self) -> None:
        """verification_timeout=0 raises ValueError."""
        with pytest.raises(ValueError, match="verification_timeout must be >= 1"):
            build_config(_minimal_ns(verification_timeout=0))

    def test_verification_timeout_one_is_valid(self) -> None:
        """verification_timeout=1 does not raise."""
        cfg = build_config(_minimal_ns(verification_timeout=1))
        assert cfg.verification_timeout == 1


# ---------------------------------------------------------------------------
# coverage_threshold validation
# ---------------------------------------------------------------------------


class TestCoverageThresholdValidation:
    """Tests for coverage_threshold field validation."""

    def test_coverage_threshold_negative_raises(self) -> None:
        """coverage_threshold < 0 raises ValueError."""
        with pytest.raises(ValueError, match="coverage_threshold must be between 0 and 100"):
            build_config(_minimal_ns(coverage_threshold=-1))

    def test_coverage_threshold_above_100_raises(self) -> None:
        """coverage_threshold > 100 raises ValueError."""
        with pytest.raises(ValueError, match="coverage_threshold must be between 0 and 100"):
            build_config(_minimal_ns(coverage_threshold=101))

    def test_coverage_threshold_zero_is_valid(self) -> None:
        """coverage_threshold=0 (disabled) is valid."""
        cfg = build_config(_minimal_ns(coverage_threshold=0))
        assert cfg.coverage_threshold == 0

    def test_coverage_threshold_100_is_valid(self) -> None:
        """coverage_threshold=100 is valid."""
        cfg = build_config(_minimal_ns(coverage_threshold=100))
        assert cfg.coverage_threshold == 100

    def test_env_coverage_threshold_invalid_string_raises(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Invalid string in CODELICIOUS_BUILD_COVERAGE_THRESHOLD raises ValueError."""
        monkeypatch.setenv("CODELICIOUS_BUILD_COVERAGE_THRESHOLD", "notanint")
        with pytest.raises(ValueError, match="CODELICIOUS_BUILD_COVERAGE_THRESHOLD"):
            build_config(_minimal_ns())


# ---------------------------------------------------------------------------
# agent_timeout_s validation
# ---------------------------------------------------------------------------


class TestAgentTimeoutValidation:
    """Tests for agent_timeout_s field validation."""

    def test_agent_timeout_below_60_raises(self) -> None:
        """agent_timeout_s < 60 raises ValueError."""
        with pytest.raises(ValueError, match="agent_timeout_s must be >= 60"):
            build_config(_minimal_ns(agent_timeout_s=59))

    def test_agent_timeout_exactly_60_is_valid(self) -> None:
        """agent_timeout_s=60 does not raise."""
        cfg = build_config(_minimal_ns(agent_timeout_s=60))
        assert cfg.agent_timeout_s == 60

    def test_env_agent_timeout_invalid_string_raises(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Invalid string in CODELICIOUS_BUILD_AGENT_TIMEOUT raises ValueError."""
        monkeypatch.setenv("CODELICIOUS_BUILD_AGENT_TIMEOUT", "fast")
        with pytest.raises(ValueError, match="CODELICIOUS_BUILD_AGENT_TIMEOUT"):
            build_config(_minimal_ns())


# ---------------------------------------------------------------------------
# effort validation
# ---------------------------------------------------------------------------


class TestEffortValidation:
    """Tests for effort field validation."""

    def test_invalid_effort_raises(self) -> None:
        """An unrecognised effort level raises ValueError."""
        with pytest.raises(ValueError, match="Invalid effort level"):
            build_config(_minimal_ns(effort="turbo"))

    def test_empty_effort_is_valid(self) -> None:
        """Empty string effort (default) does not raise."""
        cfg = build_config(_minimal_ns(effort=""))
        assert cfg.effort == ""

    @pytest.mark.parametrize("level", ["low", "medium", "high", "max"])
    def test_valid_effort_levels(self, level: str) -> None:
        """All documented effort levels are accepted."""
        cfg = build_config(_minimal_ns(effort=level))
        assert cfg.effort == level


# ---------------------------------------------------------------------------
# max_iterations validation
# ---------------------------------------------------------------------------


class TestMaxIterationsValidation:
    """Tests for max_iterations field validation."""

    def test_max_iterations_zero_raises(self) -> None:
        """max_iterations=0 raises ValueError."""
        with pytest.raises(ValueError, match="max_iterations must be >= 1"):
            build_config(_minimal_ns(iterations=0))

    def test_max_iterations_one_is_valid(self) -> None:
        """max_iterations=1 does not raise."""
        cfg = build_config(_minimal_ns(iterations=1))
        assert cfg.max_iterations == 1


# ---------------------------------------------------------------------------
# verify_passes validation
# ---------------------------------------------------------------------------


class TestVerifyPassesValidation:
    """Tests for verify_passes field validation."""

    def test_verify_passes_negative_raises(self) -> None:
        """verify_passes < 0 raises ValueError."""
        with pytest.raises(ValueError, match="verify_passes must be >= 0"):
            build_config(_minimal_ns(verify_passes=-1))

    def test_verify_passes_zero_is_valid(self) -> None:
        """verify_passes=0 (skip verification) does not raise."""
        cfg = build_config(_minimal_ns(verify_passes=0))
        assert cfg.verify_passes == 0


# ---------------------------------------------------------------------------
# project_dir validation
# ---------------------------------------------------------------------------


class TestProjectDirValidation:
    """Tests for project_dir field validation."""

    def test_nonexistent_project_dir_raises(self, tmp_path: pathlib.Path) -> None:
        """A project_dir that does not exist raises ValueError."""
        nonexistent = tmp_path / "does_not_exist"
        with pytest.raises(ValueError, match="Project directory does not exist"):
            build_config(_minimal_ns(project_dir=str(nonexistent)))

    def test_existing_project_dir_is_valid(self, tmp_path: pathlib.Path) -> None:
        """A project_dir that exists does not raise."""
        cfg = build_config(_minimal_ns(project_dir=str(tmp_path)))
        assert cfg.project_dir == tmp_path


# ---------------------------------------------------------------------------
# Model env var precedence
# ---------------------------------------------------------------------------


class TestModelEnvVarPrecedence:
    """Tests for model env var and CLI arg precedence."""

    def test_env_model_is_used_when_no_cli_model(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """CODELICIOUS_BUILD_MODEL env var sets model when CLI omits it."""
        monkeypatch.setenv("CODELICIOUS_BUILD_MODEL", "claude-test-model")
        cfg = build_config(_minimal_ns())
        assert cfg.model == "claude-test-model"

    def test_cli_model_overrides_env_model(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """CLI model arg takes precedence over CODELICIOUS_BUILD_MODEL."""
        monkeypatch.setenv("CODELICIOUS_BUILD_MODEL", "env-model")
        cfg = build_config(_minimal_ns(model="cli-model"))
        assert cfg.model == "cli-model"


# ---------------------------------------------------------------------------
# Finding 41: _validate_endpoint_url unit tests
# ---------------------------------------------------------------------------


class TestValidateEndpointUrl:
    """Unit tests for the _validate_endpoint_url helper (Finding 41)."""

    def test_https_url_is_accepted(self) -> None:
        """Standard HTTPS URL passes validation without raising."""
        _validate_endpoint_url("https://api.example.com/v1/completions")

    def test_empty_string_is_accepted(self) -> None:
        """An empty string is accepted (feature may be disabled)."""
        _validate_endpoint_url("")

    def test_http_localhost_is_accepted(self) -> None:
        """HTTP to localhost is accepted for local development."""
        _validate_endpoint_url("http://localhost:8080/v1")

    def test_http_127_0_0_1_is_accepted(self) -> None:
        """HTTP to 127.0.0.1 is accepted for local development."""
        _validate_endpoint_url("http://127.0.0.1:9000/api")

    def test_http_loopback_ipv6_is_accepted(self) -> None:
        """HTTP to ::1 (IPv6 loopback) is accepted for local development."""
        _validate_endpoint_url("http://[::1]:8080/v1")

    def test_http_remote_host_is_rejected(self) -> None:
        """Plain HTTP to a remote host raises ValueError."""
        with pytest.raises(ValueError, match="Insecure or disallowed URL"):
            _validate_endpoint_url("http://api.example.com/v1/completions")

    def test_ftp_scheme_is_rejected(self) -> None:
        """FTP scheme raises ValueError."""
        with pytest.raises(ValueError, match="Insecure or disallowed URL"):
            _validate_endpoint_url("ftp://files.example.com/model")

    def test_file_scheme_is_rejected(self) -> None:
        """file:// scheme raises ValueError."""
        with pytest.raises(ValueError, match="Insecure or disallowed URL"):
            _validate_endpoint_url("file:///etc/passwd")

    def test_var_name_appears_in_error_message(self) -> None:
        """The var_name parameter is included in the ValueError message."""
        with pytest.raises(ValueError, match="MY_VAR"):
            _validate_endpoint_url("http://remote.example.com/api", var_name="MY_VAR")


# ---------------------------------------------------------------------------
# Finding 41: PolicyConfig.from_env() endpoint validation integration tests
# ---------------------------------------------------------------------------


class TestPolicyConfigEndpointValidation:
    """Integration tests: PolicyConfig.from_env() validates CODELICIOUS_POLICYBIND_ENDPOINT."""

    def test_no_endpoint_env_var_builds_successfully(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """When the endpoint env var is absent, PolicyConfig builds with an empty endpoint."""
        monkeypatch.delenv("CODELICIOUS_POLICYBIND_ENDPOINT", raising=False)
        cfg = PolicyConfig.from_env()
        assert cfg.policybind_endpoint == ""

    def test_https_endpoint_is_stored(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """A valid HTTPS endpoint is accepted and stored on the config object."""
        monkeypatch.setenv("CODELICIOUS_POLICYBIND_ENDPOINT", "https://policy.example.com/bind")
        cfg = PolicyConfig.from_env()
        assert cfg.policybind_endpoint == "https://policy.example.com/bind"

    def test_localhost_http_endpoint_is_accepted(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """HTTP to localhost is accepted as a development endpoint."""
        monkeypatch.setenv("CODELICIOUS_POLICYBIND_ENDPOINT", "http://localhost:9999/bind")
        cfg = PolicyConfig.from_env()
        assert cfg.policybind_endpoint == "http://localhost:9999/bind"

    def test_insecure_remote_http_endpoint_raises(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """A plain HTTP remote endpoint raises ValueError during from_env()."""
        monkeypatch.setenv("CODELICIOUS_POLICYBIND_ENDPOINT", "http://policy.example.com/bind")
        with pytest.raises(ValueError, match="CODELICIOUS_POLICYBIND_ENDPOINT"):
            PolicyConfig.from_env()

    def test_ftp_endpoint_raises(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """An FTP endpoint raises ValueError during from_env()."""
        monkeypatch.setenv("CODELICIOUS_POLICYBIND_ENDPOINT", "ftp://files.example.com/bind")
        with pytest.raises(ValueError, match="Insecure or disallowed URL"):
            PolicyConfig.from_env()


# ---------------------------------------------------------------------------
# Finding 78 — PolicyConfig negative/invalid budget defaults to 50.0
# ---------------------------------------------------------------------------


class TestPolicyConfigDailyBudgetValidation:
    """Finding 78: negative and non-numeric CODELICIOUS_POLICY_DAILY_BUDGET falls back to 50.0."""

    def test_negative_budget_defaults_to_50(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Setting CODELICIOUS_POLICY_DAILY_BUDGET to a negative value must fall back to 50.0."""
        monkeypatch.setenv("CODELICIOUS_POLICY_DAILY_BUDGET", "-5")
        cfg = PolicyConfig.from_env()
        assert cfg.daily_budget_usd == 50.0

    def test_zero_budget_defaults_to_50(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Setting CODELICIOUS_POLICY_DAILY_BUDGET to '0' (not positive) must fall back to 50.0."""
        monkeypatch.setenv("CODELICIOUS_POLICY_DAILY_BUDGET", "0")
        cfg = PolicyConfig.from_env()
        assert cfg.daily_budget_usd == 50.0

    def test_non_numeric_budget_defaults_to_50(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Setting CODELICIOUS_POLICY_DAILY_BUDGET to a non-numeric string must fall back to 50.0."""
        monkeypatch.setenv("CODELICIOUS_POLICY_DAILY_BUDGET", "not-a-number")
        cfg = PolicyConfig.from_env()
        assert cfg.daily_budget_usd == 50.0

    def test_valid_positive_budget_is_used(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """A valid positive budget value must be stored as-is."""
        monkeypatch.setenv("CODELICIOUS_POLICY_DAILY_BUDGET", "100.0")
        cfg = PolicyConfig.from_env()
        assert cfg.daily_budget_usd == 100.0

    def test_negative_budget_logs_warning(
        self, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
    ) -> None:
        """A negative budget must log a warning at WARNING level."""
        monkeypatch.setenv("CODELICIOUS_POLICY_DAILY_BUDGET", "-5")
        with caplog.at_level("WARNING", logger="codelicious.config"):
            PolicyConfig.from_env()
        assert any("not positive" in r.message.lower() or "default" in r.message.lower() for r in caplog.records)

    def test_non_numeric_budget_logs_warning(
        self, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
    ) -> None:
        """A non-numeric budget must log a warning at WARNING level."""
        monkeypatch.setenv("CODELICIOUS_POLICY_DAILY_BUDGET", "not-a-number")
        with caplog.at_level("WARNING", logger="codelicious.config"):
            PolicyConfig.from_env()
        assert any("invalid" in r.message.lower() or "default" in r.message.lower() for r in caplog.records)


# ---------------------------------------------------------------------------
# Finding 79 — build_config raises ValueError for unknown provider
# ---------------------------------------------------------------------------


class TestBuildConfigUnknownProvider:
    """Finding 79: build_config raises ValueError when an unknown provider is supplied via CLI args."""

    def test_unknown_provider_via_cli_args_raises_value_error(self) -> None:
        """Passing provider='unknown_provider' in cli_args raises ValueError."""
        with pytest.raises(ValueError, match="Unknown provider"):
            build_config(_minimal_ns(provider="unknown_provider"))

    def test_error_message_names_unsupported_provider(self) -> None:
        """The ValueError message must include the invalid provider name."""
        with pytest.raises(ValueError) as exc_info:
            build_config(_minimal_ns(provider="badprovider"))
        assert "badprovider" in str(exc_info.value)

    def test_error_message_lists_supported_providers(self) -> None:
        """The ValueError message must list the supported providers."""
        with pytest.raises(ValueError) as exc_info:
            build_config(_minimal_ns(provider="unknown_provider"))
        error_text = str(exc_info.value).lower()
        # At least one of the valid providers must appear in the message
        assert any(p in error_text for p in ("anthropic", "openai", "claude"))

    def test_known_providers_do_not_raise(self) -> None:
        """All entries in PROVIDER_DEFAULTS must be accepted without raising."""
        from codelicious.config import PROVIDER_DEFAULTS

        for provider in PROVIDER_DEFAULTS:
            cfg = build_config(_minimal_ns(provider=provider))
            assert cfg.provider == provider
