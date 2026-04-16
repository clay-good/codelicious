"""Tests for PushResult and push failure classification (spec-27 Phase 7.1)."""

from __future__ import annotations

import pytest

from codelicious.git.git_orchestrator import PushResult, _classify_push_error


class TestClassifyPushError:
    """_classify_push_error classifies stderr into error categories."""

    @pytest.mark.parametrize(
        "stderr,expected",
        [
            ("Permission denied (publickey)", "auth"),
            ("fatal: Authentication failed for 'https://github.com'", "auth"),
            ("could not read Username", "auth"),
            ("invalid credentials", "auth"),
            ("Authorization failed", "auth"),
            ("! [rejected] main -> main (non-fast-forward)", "conflict"),
            ("error: failed to push some refs", "conflict"),
            ("Updates were rejected because the remote contains work", "conflict"),
            ("fetch first", "conflict"),
            ("Connection reset by peer", "transient"),
            ("Connection timed out", "transient"),
            ("Could not resolve host github.com", "transient"),
            ("SSL certificate problem", "transient"),
            ("TLS handshake failed", "transient"),
            ("Broken pipe", "transient"),
            ("Network is unreachable", "transient"),
            ("Connection refused", "transient"),
            ("502 Bad Gateway", "transient"),
            ("503 Service Unavailable", "transient"),
            ("504 Gateway Timeout", "transient"),
            ("something totally unknown", "unknown"),
            ("", "unknown"),
        ],
    )
    def test_classification(self, stderr: str, expected: str) -> None:
        assert _classify_push_error(stderr) == expected

    def test_transient_checked_before_auth(self) -> None:
        """Transient patterns take priority when both match (e.g. 'unable to access: Connection timed out')."""
        stderr = "fatal: unable to access 'https://github.com/': Connection timed out"
        assert _classify_push_error(stderr) == "transient"


class TestPushResult:
    """PushResult dataclass."""

    def test_success_defaults(self) -> None:
        r = PushResult(success=True)
        assert r.success is True
        assert r.error_type is None
        assert r.message == ""

    def test_failure_with_type(self) -> None:
        r = PushResult(success=False, error_type="auth", message="denied")
        assert r.success is False
        assert r.error_type == "auth"
        assert r.message == "denied"

    def test_frozen(self) -> None:
        r = PushResult(success=True)
        with pytest.raises(AttributeError):
            r.success = False  # type: ignore[misc]
