"""Tests for environment variable configuration overrides (spec-19 Phase 1).

Updated in Phase 9 to use shared _env module instead of module-private helpers.
"""

from __future__ import annotations

import pathlib

import pytest

from codelicious._env import parse_env_float, parse_env_int


class TestEnvFloatOverrides:
    """Verify CODELICIOUS_INPUT_RATE_PER_MTOK / OUTPUT_RATE_PER_MTOK env overrides."""

    def test_input_rate_override(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("CODELICIOUS_INPUT_RATE_PER_MTOK", "5.50")
        val = parse_env_float("CODELICIOUS_INPUT_RATE_PER_MTOK", 3.00, min_val=0.0)
        assert val == 5.50

    def test_output_rate_override(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("CODELICIOUS_OUTPUT_RATE_PER_MTOK", "20.0")
        val = parse_env_float("CODELICIOUS_OUTPUT_RATE_PER_MTOK", 15.00, min_val=0.0)
        assert val == 20.0

    def test_invalid_rate_falls_back(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("CODELICIOUS_INPUT_RATE_PER_MTOK", "notanumber")
        val = parse_env_float("CODELICIOUS_INPUT_RATE_PER_MTOK", 3.00, min_val=0.0)
        assert val == 3.00

    def test_negative_rate_falls_back(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("CODELICIOUS_INPUT_RATE_PER_MTOK", "-1.0")
        val = parse_env_float("CODELICIOUS_INPUT_RATE_PER_MTOK", 3.00, min_val=0.0)
        assert val == 3.00

    def test_zero_rate_allowed(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Zero is valid (free tier / testing)."""
        monkeypatch.setenv("CODELICIOUS_INPUT_RATE_PER_MTOK", "0.0")
        val = parse_env_float("CODELICIOUS_INPUT_RATE_PER_MTOK", 3.00, min_val=0.0)
        assert val == 0.0

    def test_empty_string_falls_back(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("CODELICIOUS_INPUT_RATE_PER_MTOK", "")
        val = parse_env_float("CODELICIOUS_INPUT_RATE_PER_MTOK", 3.00, min_val=0.0)
        assert val == 3.00


class TestVerifierTimeoutOverrides:
    """Verify CODELICIOUS_TIMEOUT_* env overrides."""

    def test_default_timeouts(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("CODELICIOUS_TIMEOUT_TEST", raising=False)
        assert parse_env_int("CODELICIOUS_TIMEOUT_TEST", 120, min_val=1) == 120

    def test_timeout_override(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("CODELICIOUS_TIMEOUT_TEST", "600")
        val = parse_env_int("CODELICIOUS_TIMEOUT_TEST", 120, min_val=1)
        assert val == 600

    def test_invalid_timeout_falls_back(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("CODELICIOUS_TIMEOUT_LINT", "abc")
        val = parse_env_int("CODELICIOUS_TIMEOUT_LINT", 60, min_val=1)
        assert val == 60

    def test_zero_timeout_falls_back(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("CODELICIOUS_TIMEOUT_TEST", "0")
        val = parse_env_int("CODELICIOUS_TIMEOUT_TEST", 120, min_val=1)
        assert val == 120

    def test_negative_timeout_falls_back(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("CODELICIOUS_TIMEOUT_SYNTAX", "-10")
        val = parse_env_int("CODELICIOUS_TIMEOUT_SYNTAX", 300, min_val=1)
        assert val == 300

    def test_empty_string_falls_back(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("CODELICIOUS_TIMEOUT_AUDIT", "")
        val = parse_env_int("CODELICIOUS_TIMEOUT_AUDIT", 120, min_val=1)
        assert val == 120


class TestSandboxExtensionOverrides:
    """Verify CODELICIOUS_EXTRA_EXTENSIONS env overrides."""

    def test_no_extra_extensions(self, tmp_path: pathlib.Path) -> None:
        from codelicious.sandbox import Sandbox

        sb = Sandbox(tmp_path)
        assert sb._allowed_extensions == Sandbox.ALLOWED_EXTENSIONS

    def test_extra_extensions_merged(self, monkeypatch: pytest.MonkeyPatch, tmp_path: pathlib.Path) -> None:
        monkeypatch.setenv("CODELICIOUS_EXTRA_EXTENSIONS", ".proto,.graphql")
        from codelicious.sandbox import Sandbox

        sb = Sandbox(tmp_path)
        assert ".proto" in sb._allowed_extensions
        assert ".graphql" in sb._allowed_extensions
        # Base extensions still present
        assert ".py" in sb._allowed_extensions

    def test_invalid_extension_no_dot_skipped(self, monkeypatch: pytest.MonkeyPatch, tmp_path: pathlib.Path) -> None:
        monkeypatch.setenv("CODELICIOUS_EXTRA_EXTENSIONS", "proto,.graphql")
        from codelicious.sandbox import Sandbox

        sb = Sandbox(tmp_path)
        assert "proto" not in sb._allowed_extensions
        assert ".graphql" in sb._allowed_extensions

    def test_extension_with_path_separator_skipped(
        self, monkeypatch: pytest.MonkeyPatch, tmp_path: pathlib.Path
    ) -> None:
        monkeypatch.setenv("CODELICIOUS_EXTRA_EXTENSIONS", ".ok,../bad,.also/bad")
        from codelicious.sandbox import Sandbox

        sb = Sandbox(tmp_path)
        assert ".ok" in sb._allowed_extensions
        assert "../bad" not in sb._allowed_extensions
        assert ".also/bad" not in sb._allowed_extensions

    def test_empty_string_no_change(self, monkeypatch: pytest.MonkeyPatch, tmp_path: pathlib.Path) -> None:
        monkeypatch.setenv("CODELICIOUS_EXTRA_EXTENSIONS", "")
        from codelicious.sandbox import Sandbox

        sb = Sandbox(tmp_path)
        assert sb._allowed_extensions == Sandbox.ALLOWED_EXTENSIONS

    def test_extra_extension_allows_write(self, monkeypatch: pytest.MonkeyPatch, tmp_path: pathlib.Path) -> None:
        """An extra extension should actually allow writing that file type."""
        monkeypatch.setenv("CODELICIOUS_EXTRA_EXTENSIONS", ".proto")
        from codelicious.sandbox import Sandbox

        sb = Sandbox(tmp_path)
        result = sb.write_file("schema.proto", 'syntax = "proto3";')
        assert result.exists()
