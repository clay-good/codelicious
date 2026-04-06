"""Tests for shared environment variable parsing (spec-19 Phase 9: CD-1)."""

from __future__ import annotations

import pytest

from codelicious._env import parse_env_csv, parse_env_float, parse_env_int, parse_env_str


# -- parse_env_int -----------------------------------------------------------


class TestParseEnvInt:
    def test_returns_default_when_unset(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("TEST_INT", raising=False)
        assert parse_env_int("TEST_INT", 42) == 42

    def test_returns_override(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("TEST_INT", "99")
        assert parse_env_int("TEST_INT", 42) == 99

    def test_invalid_falls_back(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("TEST_INT", "not_a_number")
        assert parse_env_int("TEST_INT", 42) == 42

    def test_empty_falls_back(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("TEST_INT", "")
        assert parse_env_int("TEST_INT", 42) == 42

    def test_below_min_falls_back(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("TEST_INT", "0")
        assert parse_env_int("TEST_INT", 10, min_val=1) == 10

    def test_above_max_falls_back(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("TEST_INT", "200")
        assert parse_env_int("TEST_INT", 10, max_val=100) == 10

    def test_at_min_accepted(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("TEST_INT", "1")
        assert parse_env_int("TEST_INT", 10, min_val=1) == 1

    def test_at_max_accepted(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("TEST_INT", "100")
        assert parse_env_int("TEST_INT", 10, max_val=100) == 100


# -- parse_env_float ---------------------------------------------------------


class TestParseEnvFloat:
    def test_returns_default_when_unset(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("TEST_FLOAT", raising=False)
        assert parse_env_float("TEST_FLOAT", 3.14) == 3.14

    def test_returns_override(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("TEST_FLOAT", "2.5")
        assert parse_env_float("TEST_FLOAT", 3.14) == 2.5

    def test_invalid_falls_back(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("TEST_FLOAT", "abc")
        assert parse_env_float("TEST_FLOAT", 3.14) == 3.14

    def test_below_min_falls_back(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("TEST_FLOAT", "-1.0")
        assert parse_env_float("TEST_FLOAT", 5.0, min_val=0.0) == 5.0

    def test_above_max_falls_back(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("TEST_FLOAT", "999.0")
        assert parse_env_float("TEST_FLOAT", 5.0, max_val=100.0) == 5.0


# -- parse_env_str -----------------------------------------------------------


class TestParseEnvStr:
    def test_returns_default_when_unset(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("TEST_STR", raising=False)
        assert parse_env_str("TEST_STR", "hello") == "hello"

    def test_returns_override(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("TEST_STR", "world")
        assert parse_env_str("TEST_STR", "hello") == "world"

    def test_empty_falls_back(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("TEST_STR", "  ")
        assert parse_env_str("TEST_STR", "hello") == "hello"


# -- parse_env_csv -----------------------------------------------------------


class TestParseEnvCsv:
    def test_returns_default_when_unset(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.delenv("TEST_CSV", raising=False)
        default = frozenset({".py", ".md"})
        assert parse_env_csv("TEST_CSV", default) == default

    def test_merges_extras(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("TEST_CSV", ".rs,.go")
        default = frozenset({".py"})
        result = parse_env_csv("TEST_CSV", default)
        assert ".py" in result
        assert ".rs" in result
        assert ".go" in result

    def test_skips_empty_items(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("TEST_CSV", ".rs,,,.go,")
        default = frozenset({".py"})
        result = parse_env_csv("TEST_CSV", default)
        assert result == frozenset({".py", ".rs", ".go"})

    def test_validator_skips_invalid(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("TEST_CSV", ".rs,bad,/nope,.go")
        default = frozenset({".py"})
        result = parse_env_csv("TEST_CSV", default, validator=lambda x: x.startswith(".") and "/" not in x)
        assert ".rs" in result
        assert ".go" in result
        assert "bad" not in result
        assert "/nope" not in result

    def test_empty_string_returns_default(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("TEST_CSV", "")
        default = frozenset({".py"})
        assert parse_env_csv("TEST_CSV", default) == default

    def test_all_invalid_returns_default(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setenv("TEST_CSV", "bad,worse")
        default = frozenset({".py"})
        result = parse_env_csv("TEST_CSV", default, validator=lambda x: x.startswith("."))
        assert result == default
