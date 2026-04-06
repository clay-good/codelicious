"""Tests for the scaffolder module."""

from __future__ import annotations

import os
import pathlib
from unittest.mock import patch

import pytest

from codelicious.scaffolder import (
    _MANAGED_BLOCK,
    _SENTINEL_END,
    _SENTINEL_START,
    scaffold,
)

# -- create new CLAUDE.md ----------------------------------------------------


def test_creates_claude_md_when_missing(tmp_path: pathlib.Path) -> None:
    scaffold(tmp_path)
    claude_md = tmp_path / "CLAUDE.md"
    assert claude_md.is_file()
    content = claude_md.read_text(encoding="utf-8")
    assert _SENTINEL_START in content
    assert _SENTINEL_END in content


# -- append to existing CLAUDE.md -------------------------------------------


def test_appends_to_existing_without_sentinel(tmp_path: pathlib.Path) -> None:
    claude_md = tmp_path / "CLAUDE.md"
    claude_md.write_text("# My Project\n\nExisting instructions.\n", encoding="utf-8")
    scaffold(tmp_path)
    content = claude_md.read_text(encoding="utf-8")
    assert content.startswith("# My Project")
    assert _SENTINEL_START in content
    assert _SENTINEL_END in content


# -- replaces managed block when sentinel present ----------------------------


def test_replaces_managed_block_when_sentinel_present(tmp_path: pathlib.Path) -> None:
    claude_md = tmp_path / "CLAUDE.md"
    original = f"# Existing\n\n{_SENTINEL_START}\nold content\n{_SENTINEL_END}\n"
    claude_md.write_text(original, encoding="utf-8")
    scaffold(tmp_path)
    content = claude_md.read_text(encoding="utf-8")
    # Managed block was replaced with current version
    assert "# Existing" in content
    assert _SENTINEL_START in content
    assert _SENTINEL_END in content
    assert "old content" not in content
    assert "Git & PR Policy" in content  # new policy section present


# -- idempotent double-run --------------------------------------------------


def test_idempotent_double_run(tmp_path: pathlib.Path) -> None:
    scaffold(tmp_path)
    first = (tmp_path / "CLAUDE.md").read_text(encoding="utf-8")
    scaffold(tmp_path)
    second = (tmp_path / "CLAUDE.md").read_text(encoding="utf-8")
    assert first == second


# -- dry-run mode ------------------------------------------------------------


def test_dry_run_does_not_create_file(tmp_path: pathlib.Path) -> None:
    scaffold(tmp_path, dry_run=True)
    assert not (tmp_path / "CLAUDE.md").exists()


def test_dry_run_does_not_modify_existing(tmp_path: pathlib.Path) -> None:
    claude_md = tmp_path / "CLAUDE.md"
    original = "# Existing\n"
    claude_md.write_text(original, encoding="utf-8")
    scaffold(tmp_path, dry_run=True)
    assert claude_md.read_text(encoding="utf-8") == original


# -- managed block content ---------------------------------------------------


def test_managed_block_contains_git_policy() -> None:
    assert "Git & PR Policy" in _MANAGED_BLOCK
    assert "orchestrator owns all git operations" in _MANAGED_BLOCK
    assert "NEVER push to main" in _MANAGED_BLOCK


def test_managed_block_contains_test_instruction() -> None:
    assert "verify-all" in _MANAGED_BLOCK


def test_managed_block_mentions_state_md() -> None:
    assert "STATE.md" in _MANAGED_BLOCK


def test_managed_block_mentions_build_complete() -> None:
    assert "BUILD_COMPLETE" in _MANAGED_BLOCK


def test_managed_block_has_sentinels() -> None:
    """Managed block must begin with the start sentinel and contain the end sentinel."""
    assert _MANAGED_BLOCK.startswith(_SENTINEL_START)
    assert _SENTINEL_END in _MANAGED_BLOCK


def test_managed_block_contains_codelicious_heading() -> None:
    """Managed block must include the codelicious section heading."""
    assert "# codelicious" in _MANAGED_BLOCK


def test_managed_block_instructs_read_before_modify() -> None:
    """Managed block must instruct the agent to read existing files first."""
    assert "Read existing files before modifying them" in _MANAGED_BLOCK


def test_managed_block_references_agents() -> None:
    """Managed block must reference the builder, tester, and reviewer agents."""
    assert "builder" in _MANAGED_BLOCK
    assert "tester" in _MANAGED_BLOCK
    assert "reviewer" in _MANAGED_BLOCK


def test_managed_block_contains_no_force_push_rule() -> None:
    """Managed block must prohibit force-push and amending published commits."""
    assert "NEVER force-push" in _MANAGED_BLOCK


def test_managed_block_contains_no_git_commands_rule() -> None:
    """Managed block must instruct the agent not to run git or gh commands."""
    assert "MUST NOT run git" in _MANAGED_BLOCK


# -- path traversal protection -----------------------------------------------


def test_rejects_path_traversal(tmp_path: pathlib.Path) -> None:
    """scaffold should reject a project_root that would place CLAUDE.md outside it."""
    # Create a symlink named CLAUDE.md inside tmp_path that points to a file
    # outside tmp_path (e.g. /tmp itself or a sibling directory).
    # scaffold() resolves the final path and checks it stays inside project_root.
    outside_dir = tmp_path.parent / f"outside_{tmp_path.name}"
    outside_dir.mkdir(exist_ok=True)
    outside_target = outside_dir / "CLAUDE.md"
    outside_target.write_text("# Outside\n", encoding="utf-8")

    # Place a symlink at tmp_path/CLAUDE.md → outside_dir/CLAUDE.md
    symlink_path = tmp_path / "CLAUDE.md"
    try:
        os.symlink(str(outside_target), str(symlink_path))
    except NotImplementedError:
        pytest.skip("Symlinks not supported on this platform")

    # scaffold() must detect that the resolved path escapes project_root
    with pytest.raises(ValueError, match="escapes project root"):
        scaffold(tmp_path)


def test_valid_path_does_not_raise(tmp_path: pathlib.Path) -> None:
    """scaffold with a normal, non-symlinked path should succeed."""
    scaffold(tmp_path)  # should not raise
    assert (tmp_path / "CLAUDE.md").is_file()


# -- start sentinel present but end sentinel missing (Finding 54) ------------


def test_start_sentinel_without_end_sentinel(tmp_path: pathlib.Path) -> None:
    """CLAUDE.md with start sentinel but no end sentinel: scaffold inserts the full managed block.

    Case 4 of scaffold(): when _SENTINEL_START is present but _SENTINEL_END is absent,
    the code treats end_idx = len(existing), so everything from the start sentinel to
    EOF is replaced by the current _MANAGED_BLOCK.  The resulting file must contain
    both sentinels.
    """
    claude_md = tmp_path / "CLAUDE.md"
    # Write a file that has the start sentinel but is missing the end sentinel
    claude_md.write_text(
        f"# Preamble\n\n{_SENTINEL_START}\nincomplete managed content without end",
        encoding="utf-8",
    )
    scaffold(tmp_path)
    content = claude_md.read_text(encoding="utf-8")
    assert _SENTINEL_START in content
    assert _SENTINEL_END in content
    # The preamble before the start sentinel should be preserved
    assert "# Preamble" in content
    # The old incomplete content after the start sentinel should be replaced
    assert "incomplete managed content without end" not in content


# -- atomic_write_text raises OSError (Finding 55) ---------------------------


def test_scaffold_propagates_oserror_from_atomic_write(tmp_path: pathlib.Path) -> None:
    """When atomic_write_text raises OSError, scaffold() must propagate the exception."""
    with patch("codelicious.scaffolder.atomic_write_text", side_effect=OSError("disk full")):
        with pytest.raises(OSError, match="disk full"):
            scaffold(tmp_path)
