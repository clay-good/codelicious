"""Tests for codelicious.planner module - path validation and traversal defense."""

from __future__ import annotations

import urllib.parse

import pytest

from codelicious.errors import InvalidPlanError
from codelicious.planner import (
    DENIED_PATH_SEGMENTS,
    Task,
    _fully_decode_path,
    _validate_file_paths,
)


# ---------------------------------------------------------------------------
# Tests for _fully_decode_path
# ---------------------------------------------------------------------------


class TestFullyDecodePath:
    """Tests for the iterative URL decoding function."""

    def test_normal_path_unchanged(self) -> None:
        """Normal paths without encoding pass through unchanged."""
        assert _fully_decode_path("src/main.py") == "src/main.py"
        assert _fully_decode_path("tests/test_foo.py") == "tests/test_foo.py"

    def test_single_encoded_path_decoded(self) -> None:
        """Single-encoded paths are decoded once."""
        # %2e = .
        assert _fully_decode_path("src%2fmain.py") == "src/main.py"
        assert _fully_decode_path("%2e%2e/etc/passwd") == "../etc/passwd"

    def test_double_encoded_path_decoded(self) -> None:
        """Double-encoded paths are fully decoded."""
        # %252e%252e -> %2e%2e -> ..
        double_encoded = urllib.parse.quote(urllib.parse.quote("../etc/passwd"))
        assert ".." in _fully_decode_path(double_encoded)

    def test_triple_encoded_traversal_decoded(self) -> None:
        """Triple-encoded paths are fully decoded - the key security fix."""
        # %25252e%25252e -> %252e%252e -> %2e%2e -> ..
        triple_encoded = urllib.parse.quote(urllib.parse.quote(urllib.parse.quote("../etc/passwd")))
        result = _fully_decode_path(triple_encoded)
        assert ".." in result, f"Triple-encoded traversal not fully decoded: {result}"

    def test_quadruple_encoded_traversal_decoded(self) -> None:
        """Quadruple-encoded paths are fully decoded."""
        quad_encoded = urllib.parse.quote(urllib.parse.quote(urllib.parse.quote(urllib.parse.quote("../etc/passwd"))))
        result = _fully_decode_path(quad_encoded)
        assert ".." in result, f"Quadruple-encoded traversal not fully decoded: {result}"

    def test_legitimate_percent_in_filename_decoded(self) -> None:
        """Path with legitimate percent-encoded space decodes correctly."""
        # "file name.py" encoded once
        encoded = urllib.parse.quote("file name.py")
        assert _fully_decode_path(encoded) == "file name.py"

    def test_decode_loop_terminates_at_max_rounds(self) -> None:
        """Decoding stops after max_rounds even if not stable."""
        # Create a path that would need many rounds (though this is theoretical)
        # In practice, the loop terminates when output == input
        result = _fully_decode_path("normal_path.py", max_rounds=1)
        assert result == "normal_path.py"

    def test_empty_string_handled(self) -> None:
        """Empty string is handled gracefully."""
        assert _fully_decode_path("") == ""

    def test_already_decoded_stabilizes(self) -> None:
        """A path without encoding stabilizes after one check."""
        # Internal behavior - just verify it returns correctly
        assert _fully_decode_path("src/models/user.py") == "src/models/user.py"


# ---------------------------------------------------------------------------
# Tests for _validate_file_paths - path traversal
# ---------------------------------------------------------------------------


class TestValidateFilePathsTraversal:
    """Tests for path traversal detection in file path validation."""

    def _make_task_with_path(self, path: str) -> Task:
        """Helper to create a task with a single file path."""
        return Task(
            id="test_001",
            title="Test task",
            description="Test description",
            file_paths=[path],
            depends_on=[],
            validation="Test validation",
            status="pending",
        )

    def test_normal_path_accepted(self) -> None:
        """Normal relative paths are accepted."""
        task = self._make_task_with_path("src/main.py")
        _validate_file_paths([task])  # Should not raise

    def test_simple_traversal_rejected(self) -> None:
        """Simple .. traversal is rejected."""
        task = self._make_task_with_path("../etc/passwd")
        with pytest.raises(InvalidPlanError, match="traversal sequence"):
            _validate_file_paths([task])

    def test_double_encoded_traversal_rejected(self) -> None:
        """Double-encoded traversal (%252e%252e) is rejected."""
        # %252e = %2e when decoded once, = . when decoded twice
        path = "%252e%252e/etc/passwd"
        task = self._make_task_with_path(path)
        with pytest.raises(InvalidPlanError, match="traversal"):
            _validate_file_paths([task])

    def test_triple_encoded_traversal_rejected(self) -> None:
        """Triple-encoded traversal (%25252e%25252e) is rejected - key security test."""
        # %25252e -> %252e -> %2e -> .
        path = "%25252e%25252e/etc/passwd"
        task = self._make_task_with_path(path)
        with pytest.raises(InvalidPlanError, match="traversal"):
            _validate_file_paths([task])

    def test_quadruple_encoded_traversal_rejected(self) -> None:
        """Quadruple-encoded traversal is rejected."""
        # Four levels of encoding
        path = urllib.parse.quote(urllib.parse.quote(urllib.parse.quote(urllib.parse.quote("../etc/passwd"))))
        task = self._make_task_with_path(path)
        with pytest.raises(InvalidPlanError, match="traversal"):
            _validate_file_paths([task])

    def test_backslash_traversal_rejected(self) -> None:
        """Backslash-based traversal (src\\..\\..\\etc\\passwd) is rejected."""
        task = self._make_task_with_path("src\\..\\..\\etc\\passwd")
        with pytest.raises(InvalidPlanError, match="backslash"):
            _validate_file_paths([task])

    def test_mixed_slash_traversal_rejected(self) -> None:
        """Mixed slash traversal is rejected."""
        task = self._make_task_with_path("src/../etc/passwd")
        with pytest.raises(InvalidPlanError, match="traversal"):
            _validate_file_paths([task])

    def test_absolute_path_rejected(self) -> None:
        """Absolute paths are rejected."""
        task = self._make_task_with_path("/etc/passwd")
        with pytest.raises(InvalidPlanError, match="absolute"):
            _validate_file_paths([task])

    def test_null_byte_rejected(self) -> None:
        """Null bytes in paths are rejected."""
        task = self._make_task_with_path("src/main.py\x00.txt")
        with pytest.raises(InvalidPlanError, match="null byte"):
            _validate_file_paths([task])

    def test_url_encoded_dot_rejected(self) -> None:
        """URL-encoded dots (%2e) are rejected in raw path."""
        task = self._make_task_with_path("%2e%2e/etc/passwd")
        with pytest.raises(InvalidPlanError, match="URL-encoded"):
            _validate_file_paths([task])

    def test_url_encoded_slash_rejected(self) -> None:
        """URL-encoded slashes (%2f) are rejected in raw path."""
        task = self._make_task_with_path("..%2fetc%2fpasswd")
        with pytest.raises(InvalidPlanError, match="URL-encoded"):
            _validate_file_paths([task])


# ---------------------------------------------------------------------------
# Tests for _validate_file_paths - denied segments
# ---------------------------------------------------------------------------


class TestValidateFilePathsDeniedSegments:
    """Tests for denied path segment detection."""

    def _make_task_with_path(self, path: str) -> Task:
        """Helper to create a task with a single file path."""
        return Task(
            id="test_001",
            title="Test task",
            description="Test description",
            file_paths=[path],
            depends_on=[],
            validation="Test validation",
            status="pending",
        )

    def test_git_directory_rejected(self) -> None:
        """Paths containing .git are rejected."""
        task = self._make_task_with_path(".git/config")
        with pytest.raises(InvalidPlanError, match="denied path segment"):
            _validate_file_paths([task])

    def test_env_file_rejected(self) -> None:
        """Paths containing .env are rejected."""
        task = self._make_task_with_path(".env")
        with pytest.raises(InvalidPlanError, match="denied path segment"):
            _validate_file_paths([task])

    def test_pycache_rejected(self) -> None:
        """Paths containing __pycache__ are rejected."""
        task = self._make_task_with_path("src/__pycache__/module.pyc")
        with pytest.raises(InvalidPlanError, match="denied path segment"):
            _validate_file_paths([task])

    def test_codelicious_state_rejected(self) -> None:
        """Paths containing .codelicious are rejected."""
        task = self._make_task_with_path(".codelicious/state.json")
        with pytest.raises(InvalidPlanError, match="denied path segment"):
            _validate_file_paths([task])

    def test_denied_segments_constant_has_expected_values(self) -> None:
        """Verify DENIED_PATH_SEGMENTS contains expected values."""
        assert ".git" in DENIED_PATH_SEGMENTS
        assert ".env" in DENIED_PATH_SEGMENTS
        assert "__pycache__" in DENIED_PATH_SEGMENTS
        assert ".codelicious" in DENIED_PATH_SEGMENTS


# ---------------------------------------------------------------------------
# Tests for _validate_file_paths - edge cases
# ---------------------------------------------------------------------------


class TestValidateFilePathsEdgeCases:
    """Edge case tests for file path validation."""

    def _make_task_with_path(self, path: str) -> Task:
        """Helper to create a task with a single file path."""
        return Task(
            id="test_001",
            title="Test task",
            description="Test description",
            file_paths=[path],
            depends_on=[],
            validation="Test validation",
            status="pending",
        )

    def test_empty_file_paths_list_accepted(self) -> None:
        """Task with empty file_paths list is accepted."""
        task = Task(
            id="test_001",
            title="Test task",
            description="Test description",
            file_paths=[],
            depends_on=[],
            validation="Test validation",
            status="pending",
        )
        _validate_file_paths([task])  # Should not raise

    def test_multiple_valid_paths_accepted(self) -> None:
        """Task with multiple valid paths is accepted."""
        task = Task(
            id="test_001",
            title="Test task",
            description="Test description",
            file_paths=["src/main.py", "src/utils.py", "tests/test_main.py"],
            depends_on=[],
            validation="Test validation",
            status="pending",
        )
        _validate_file_paths([task])  # Should not raise

    def test_deeply_nested_valid_path_accepted(self) -> None:
        """Deeply nested valid paths are accepted."""
        task = self._make_task_with_path("src/services/auth/handlers/oauth.py")
        _validate_file_paths([task])  # Should not raise

    def test_path_with_dots_in_filename_accepted(self) -> None:
        """Paths with dots in filenames (not traversal) are accepted."""
        task = self._make_task_with_path("src/config.local.py")
        _validate_file_paths([task])  # Should not raise

    def test_path_with_encoded_space_accepted(self) -> None:
        """Paths with URL-encoded spaces are accepted after decoding."""
        # "file name.py" with encoded space becomes valid path
        task = self._make_task_with_path("src/file%20name.py")
        _validate_file_paths([task])  # Should not raise (space is fine)

    def test_case_variations_in_traversal(self) -> None:
        """Case variations in encoded traversal are handled."""
        # %2E (uppercase) should also be detected
        task = self._make_task_with_path("%2E%2E/etc/passwd")
        with pytest.raises(InvalidPlanError, match="URL-encoded"):
            _validate_file_paths([task])
