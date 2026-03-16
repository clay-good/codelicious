"""Tests for ClaudeCodeEngine (spec-08 Phase 1).

Validates that BuildResult.success correctly reflects build outcome based on
the BUILD_COMPLETE sentinel file.
"""

from __future__ import annotations

import pathlib
from unittest import mock

import pytest

from codelicious.engines.claude_engine import ClaudeCodeEngine
from codelicious.engines.base import BuildResult


@pytest.fixture
def mock_config():
    """Create a minimal mock config object."""

    class MockConfig:
        model = ""
        effort = ""
        max_turns = 0
        agent_timeout_s = 30
        dry_run = True

    return MockConfig()


@pytest.fixture
def mock_git_manager():
    """Create a mock git manager that does nothing."""
    manager = mock.MagicMock()
    manager.commit_verified_changes.return_value = None
    manager.ensure_draft_pr_exists.return_value = None
    manager.transition_pr_to_review.return_value = None
    return manager


@pytest.fixture
def mock_cache_manager():
    """Create a mock cache manager."""
    return mock.MagicMock()


class TestBuildResultSuccess:
    """Tests for BuildResult.success correctness (spec-08 Phase 1)."""

    def test_success_false_when_build_complete_missing(
        self, tmp_path: pathlib.Path, mock_git_manager, mock_cache_manager
    ):
        """BuildResult.success is False when BUILD_COMPLETE is missing.

        This simulates the case where the agent never signals completion.
        """
        # Create the repo structure but no BUILD_COMPLETE file
        codelicious_dir = tmp_path / ".codelicious"
        codelicious_dir.mkdir()

        engine = ClaudeCodeEngine()

        # Mock all the heavy operations at their source modules
        with (
            mock.patch("codelicious.agent_runner.run_agent") as mock_run,
            mock.patch("codelicious.scaffolder.scaffold") as mock_scaffold,
            mock.patch("codelicious.scaffolder.scaffold_claude_dir"),
        ):
            # Mock run_agent to NOT write BUILD_COMPLETE (incomplete build)
            mock_run.return_value = mock.MagicMock(
                success=True, session_id="test-session", elapsed_s=1.0
            )
            mock_scaffold.return_value = None

            # Also mock the verifier to avoid ImportError
            with mock.patch("codelicious.verifier.verify") as mock_verify:
                mock_verify.return_value = mock.MagicMock(all_passed=True, checks=[])

                result = engine.run_build_cycle(
                    repo_path=tmp_path,
                    git_manager=mock_git_manager,
                    cache_manager=mock_cache_manager,
                    verify_passes=0,  # Skip verification
                    reflect=False,  # Skip reflection
                    push_pr=False,  # Skip PR
                )

        assert isinstance(result, BuildResult)
        assert result.success is False, (
            "BuildResult.success should be False when BUILD_COMPLETE is missing"
        )

    def test_success_true_when_build_complete_contains_done(
        self, tmp_path: pathlib.Path, mock_git_manager, mock_cache_manager
    ):
        """BuildResult.success is True when BUILD_COMPLETE contains 'DONE'.

        This simulates the case where the agent successfully completes and
        writes the BUILD_COMPLETE sentinel file.
        """
        # Create the repo structure
        codelicious_dir = tmp_path / ".codelicious"
        codelicious_dir.mkdir()

        engine = ClaudeCodeEngine()

        def write_build_complete(*args, **kwargs):
            """Side effect that simulates agent writing BUILD_COMPLETE."""
            build_file = codelicious_dir / "BUILD_COMPLETE"
            build_file.write_text("DONE", encoding="utf-8")
            return mock.MagicMock(
                success=True, session_id="test-session", elapsed_s=1.0
            )

        # Mock all the heavy operations at their source modules
        with (
            mock.patch(
                "codelicious.agent_runner.run_agent",
                side_effect=write_build_complete,
            ),
            mock.patch("codelicious.scaffolder.scaffold"),
            mock.patch("codelicious.scaffolder.scaffold_claude_dir"),
        ):
            result = engine.run_build_cycle(
                repo_path=tmp_path,
                git_manager=mock_git_manager,
                cache_manager=mock_cache_manager,
                verify_passes=0,
                reflect=False,
                push_pr=False,
            )

        assert isinstance(result, BuildResult)
        assert result.success is True, (
            "BuildResult.success should be True when BUILD_COMPLETE = 'DONE'"
        )

    def test_success_true_with_case_variations(
        self, tmp_path: pathlib.Path, mock_git_manager, mock_cache_manager
    ):
        """BuildResult.success is True with case variations of 'done'."""
        codelicious_dir = tmp_path / ".codelicious"
        codelicious_dir.mkdir()

        engine = ClaudeCodeEngine()

        def write_lowercase(*args, **kwargs):
            """Side effect that simulates agent writing lowercase 'done'."""
            build_file = codelicious_dir / "BUILD_COMPLETE"
            build_file.write_text("done", encoding="utf-8")
            return mock.MagicMock(
                success=True, session_id="test-session", elapsed_s=1.0
            )

        with (
            mock.patch(
                "codelicious.agent_runner.run_agent",
                side_effect=write_lowercase,
            ),
            mock.patch("codelicious.scaffolder.scaffold"),
            mock.patch("codelicious.scaffolder.scaffold_claude_dir"),
        ):
            result = engine.run_build_cycle(
                repo_path=tmp_path,
                git_manager=mock_git_manager,
                cache_manager=mock_cache_manager,
                verify_passes=0,
                reflect=False,
                push_pr=False,
            )

        assert result.success is True, (
            "BuildResult.success should be True with lowercase 'done'"
        )

    def test_success_false_with_invalid_content(
        self, tmp_path: pathlib.Path, mock_git_manager, mock_cache_manager
    ):
        """BuildResult.success is False when BUILD_COMPLETE has bad content."""
        codelicious_dir = tmp_path / ".codelicious"
        codelicious_dir.mkdir()

        engine = ClaudeCodeEngine()

        def write_invalid(*args, **kwargs):
            """Side effect that simulates agent writing invalid content."""
            build_file = codelicious_dir / "BUILD_COMPLETE"
            build_file.write_text("IN_PROGRESS", encoding="utf-8")
            return mock.MagicMock(
                success=True, session_id="test-session", elapsed_s=1.0
            )

        with (
            mock.patch(
                "codelicious.agent_runner.run_agent",
                side_effect=write_invalid,
            ),
            mock.patch("codelicious.scaffolder.scaffold"),
            mock.patch("codelicious.scaffolder.scaffold_claude_dir"),
        ):
            result = engine.run_build_cycle(
                repo_path=tmp_path,
                git_manager=mock_git_manager,
                cache_manager=mock_cache_manager,
                verify_passes=0,
                reflect=False,
                push_pr=False,
            )

        assert result.success is False, (
            "BuildResult.success should be False when BUILD_COMPLETE != 'DONE'"
        )
