"""Tests for config.py live code.

Covers:
- _validate_endpoint_url()
- load_project_config()
- PROVIDER_DEFAULTS dict
- API_KEY_ENV_VARS dict
"""

from __future__ import annotations

import json
import pathlib

import pytest

from codelicious.config import API_KEY_ENV_VARS, PROVIDER_DEFAULTS, _validate_endpoint_url, load_project_config

# ---------------------------------------------------------------------------
# _validate_endpoint_url unit tests
# ---------------------------------------------------------------------------


class TestValidateEndpointUrl:
    """Unit tests for the _validate_endpoint_url helper."""

    def test_https_url_is_accepted(self) -> None:
        """Standard HTTPS URL passes validation without raising."""
        assert _validate_endpoint_url("https://api.example.com/v1/completions") is None

    def test_empty_string_is_accepted(self) -> None:
        """An empty string is accepted (feature may be disabled)."""
        assert _validate_endpoint_url("") is None

    def test_http_localhost_is_accepted(self) -> None:
        """HTTP to localhost is accepted for local development."""
        assert _validate_endpoint_url("http://localhost:8080/v1") is None

    def test_http_127_0_0_1_is_accepted(self) -> None:
        """HTTP to 127.0.0.1 is accepted for local development."""
        assert _validate_endpoint_url("http://127.0.0.1:9000/api") is None

    def test_http_loopback_ipv6_is_accepted(self) -> None:
        """HTTP to ::1 (IPv6 loopback) is accepted for local development."""
        assert _validate_endpoint_url("http://[::1]:8080/v1") is None

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
# PROVIDER_DEFAULTS and API_KEY_ENV_VARS sanity checks
# ---------------------------------------------------------------------------


class TestProviderDefaults:
    """Sanity checks for the PROVIDER_DEFAULTS dict."""

    def test_anthropic_has_default_model(self) -> None:
        """anthropic provider has a default model string."""
        assert "anthropic" in PROVIDER_DEFAULTS
        assert PROVIDER_DEFAULTS["anthropic"]

    def test_openai_has_default_model(self) -> None:
        """openai provider has a default model string."""
        assert "openai" in PROVIDER_DEFAULTS
        assert PROVIDER_DEFAULTS["openai"]

    def test_claude_has_default_model(self) -> None:
        """claude provider has a default model string."""
        assert "claude" in PROVIDER_DEFAULTS
        assert PROVIDER_DEFAULTS["claude"]


class TestApiKeyEnvVars:
    """Sanity checks for the API_KEY_ENV_VARS dict."""

    def test_anthropic_key_var_name(self) -> None:
        """anthropic maps to the expected env var name."""
        assert API_KEY_ENV_VARS["anthropic"] == "ANTHROPIC_API_KEY"

    def test_openai_key_var_name(self) -> None:
        """openai maps to the expected env var name."""
        assert API_KEY_ENV_VARS["openai"] == "OPENAI_API_KEY"

    def test_claude_provider_has_no_api_key_var(self) -> None:
        """claude provider does not have an API key env var (uses CLI auth)."""
        assert "claude" not in API_KEY_ENV_VARS


# ---------------------------------------------------------------------------
# load_project_config unit tests
# ---------------------------------------------------------------------------


class TestLoadProjectConfig:
    """Unit tests for load_project_config()."""

    def test_missing_file_returns_empty_dict(self, tmp_path: pathlib.Path) -> None:
        """When config.json does not exist, returns {}."""
        assert load_project_config(tmp_path) == {}

    def test_valid_config_returns_filtered_keys(self, tmp_path: pathlib.Path) -> None:
        """Only allowed keys are returned from a valid config file."""
        cfg_dir = tmp_path / ".codelicious"
        cfg_dir.mkdir()
        (cfg_dir / "config.json").write_text(
            json.dumps(
                {
                    "default_reviewers": "alice,bob",
                    "max_calls_per_iteration": 50,
                    "verify_command": "pytest",
                    "evil_key": "should_be_filtered",
                }
            ),
            encoding="utf-8",
        )
        result = load_project_config(tmp_path)
        assert result == {
            "default_reviewers": "alice,bob",
            "max_calls_per_iteration": 50,
            "verify_command": "pytest",
        }
        assert "evil_key" not in result

    def test_oversized_file_returns_empty_dict(self, tmp_path: pathlib.Path) -> None:
        """Files over 100KB are rejected."""
        cfg_dir = tmp_path / ".codelicious"
        cfg_dir.mkdir()
        (cfg_dir / "config.json").write_text("x" * 200_000, encoding="utf-8")
        assert load_project_config(tmp_path) == {}

    def test_malformed_json_returns_empty_dict(self, tmp_path: pathlib.Path) -> None:
        """Malformed JSON returns {}."""
        cfg_dir = tmp_path / ".codelicious"
        cfg_dir.mkdir()
        (cfg_dir / "config.json").write_text("{not valid json", encoding="utf-8")
        assert load_project_config(tmp_path) == {}

    def test_non_dict_json_returns_empty_dict(self, tmp_path: pathlib.Path) -> None:
        """A JSON array at root level returns {}."""
        cfg_dir = tmp_path / ".codelicious"
        cfg_dir.mkdir()
        (cfg_dir / "config.json").write_text("[1, 2, 3]", encoding="utf-8")
        assert load_project_config(tmp_path) == {}

    def test_deprecated_allowlisted_commands_removed(self, tmp_path: pathlib.Path, caplog) -> None:
        """allowlisted_commands triggers a warning and is excluded from result."""
        cfg_dir = tmp_path / ".codelicious"
        cfg_dir.mkdir()
        (cfg_dir / "config.json").write_text(
            json.dumps({"allowlisted_commands": ["echo"], "verify_command": "pytest"}),
            encoding="utf-8",
        )
        import logging

        with caplog.at_level(logging.WARNING, logger="codelicious.config"):
            result = load_project_config(tmp_path)
        assert "allowlisted_commands" not in result
        assert result["verify_command"] == "pytest"
        assert any("deprecated" in r.message for r in caplog.records)

    def test_max_calls_clamped_to_range(self, tmp_path: pathlib.Path) -> None:
        """max_calls_per_iteration is clamped to [10, 100]."""
        cfg_dir = tmp_path / ".codelicious"
        cfg_dir.mkdir()

        # Below minimum
        (cfg_dir / "config.json").write_text(json.dumps({"max_calls_per_iteration": 1}), encoding="utf-8")
        assert load_project_config(tmp_path)["max_calls_per_iteration"] == 10

        # Above maximum
        (cfg_dir / "config.json").write_text(json.dumps({"max_calls_per_iteration": 999}), encoding="utf-8")
        assert load_project_config(tmp_path)["max_calls_per_iteration"] == 100

        # Within range
        (cfg_dir / "config.json").write_text(json.dumps({"max_calls_per_iteration": 42}), encoding="utf-8")
        assert load_project_config(tmp_path)["max_calls_per_iteration"] == 42

    def test_empty_config_returns_empty_dict(self, tmp_path: pathlib.Path) -> None:
        """An empty JSON object returns {}."""
        cfg_dir = tmp_path / ".codelicious"
        cfg_dir.mkdir()
        (cfg_dir / "config.json").write_text("{}", encoding="utf-8")
        assert load_project_config(tmp_path) == {}


# ---------------------------------------------------------------------------
# spec-27 Phase 6.3 — New v2 config key validation
# ---------------------------------------------------------------------------


class TestV2ConfigValidation:
    """spec-27 Phase 6.3: Validate max_commits_per_pr, platform, chunk_strategy."""

    def _write_config(self, tmp_path: pathlib.Path, data: dict) -> None:
        cfg_dir = tmp_path / ".codelicious"
        cfg_dir.mkdir(exist_ok=True)
        (cfg_dir / "config.json").write_text(json.dumps(data), encoding="utf-8")

    def test_max_commits_per_pr_valid(self, tmp_path: pathlib.Path) -> None:
        self._write_config(tmp_path, {"max_commits_per_pr": 75})
        assert load_project_config(tmp_path)["max_commits_per_pr"] == 75

    def test_max_commits_per_pr_clamped_high(self, tmp_path: pathlib.Path) -> None:
        self._write_config(tmp_path, {"max_commits_per_pr": 200})
        assert load_project_config(tmp_path)["max_commits_per_pr"] == 100

    def test_max_commits_per_pr_clamped_low(self, tmp_path: pathlib.Path) -> None:
        self._write_config(tmp_path, {"max_commits_per_pr": 0})
        assert load_project_config(tmp_path)["max_commits_per_pr"] == 1

    def test_max_commits_per_pr_invalid_type_removed(self, tmp_path: pathlib.Path) -> None:
        self._write_config(tmp_path, {"max_commits_per_pr": "not-a-number"})
        assert "max_commits_per_pr" not in load_project_config(tmp_path)

    def test_platform_valid_values(self, tmp_path: pathlib.Path) -> None:
        for val in ("auto", "github", "gitlab"):
            self._write_config(tmp_path, {"platform": val})
            assert load_project_config(tmp_path)["platform"] == val

    def test_platform_invalid_defaults_to_auto(self, tmp_path: pathlib.Path) -> None:
        self._write_config(tmp_path, {"platform": "bitbucket"})
        assert load_project_config(tmp_path)["platform"] == "auto"

    def test_chunk_strategy_valid_values(self, tmp_path: pathlib.Path) -> None:
        for val in ("auto", "checkbox", "llm"):
            self._write_config(tmp_path, {"chunk_strategy": val})
            assert load_project_config(tmp_path)["chunk_strategy"] == val

    def test_chunk_strategy_invalid_defaults_to_auto(self, tmp_path: pathlib.Path) -> None:
        self._write_config(tmp_path, {"chunk_strategy": "random"})
        assert load_project_config(tmp_path)["chunk_strategy"] == "auto"

    def test_default_engine_valid_values(self, tmp_path: pathlib.Path) -> None:
        for val in ("auto", "claude", "huggingface"):
            self._write_config(tmp_path, {"default_engine": val})
            assert load_project_config(tmp_path)["default_engine"] == val

    def test_default_engine_invalid_defaults_to_auto(self, tmp_path: pathlib.Path) -> None:
        self._write_config(tmp_path, {"default_engine": "gemini"})
        assert load_project_config(tmp_path)["default_engine"] == "auto"

    def test_new_keys_accepted(self, tmp_path: pathlib.Path) -> None:
        """All new v2 keys are in the allowed list and pass through."""
        self._write_config(
            tmp_path,
            {
                "max_commits_per_pr": 50,
                "platform": "github",
                "default_reviewers": ["alice"],
                "default_engine": "claude",
                "verify_command": "pytest",
                "chunk_strategy": "checkbox",
            },
        )
        result = load_project_config(tmp_path)
        assert result["max_commits_per_pr"] == 50
        assert result["platform"] == "github"
        assert result["default_reviewers"] == ["alice"]
        assert result["default_engine"] == "claude"
        assert result["verify_command"] == "pytest"
        assert result["chunk_strategy"] == "checkbox"
