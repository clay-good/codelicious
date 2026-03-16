"""Tests for scaffold_claude_dir (spec-v9)."""

from __future__ import annotations

import json
import pathlib

from codelicious.scaffolder import (
    _build_permissions,
    _detect_conventions,
    scaffold,
    scaffold_claude_dir,
)

# -- scaffold_claude_dir creates full directory structure -------------------


def test_scaffold_claude_dir_creates_directory_structure(tmp_path: pathlib.Path) -> None:
    files = scaffold_claude_dir(tmp_path)
    assert len(files) >= 11
    # Check key files exist
    assert (tmp_path / ".claude" / "settings.json").is_file()
    assert (tmp_path / ".claude" / "agents" / "builder" / "SKILL.md").is_file()
    assert (tmp_path / ".claude" / "agents" / "tester" / "SKILL.md").is_file()
    assert (tmp_path / ".claude" / "agents" / "reviewer" / "SKILL.md").is_file()
    assert (tmp_path / ".claude" / "agents" / "explorer" / "SKILL.md").is_file()
    assert (tmp_path / ".claude" / "skills" / "run-tests" / "SKILL.md").is_file()
    assert (tmp_path / ".claude" / "skills" / "lint-fix" / "SKILL.md").is_file()
    assert (tmp_path / ".claude" / "skills" / "verify-all" / "SKILL.md").is_file()
    assert (tmp_path / ".claude" / "skills" / "update-state" / "SKILL.md").is_file()
    assert (tmp_path / ".claude" / "rules" / "conventions.md").is_file()
    assert (tmp_path / ".claude" / "rules" / "security.md").is_file()


# -- idempotent double-run ------------------------------------------------


def test_scaffold_claude_dir_idempotent(tmp_path: pathlib.Path) -> None:
    files1 = scaffold_claude_dir(tmp_path)
    files2 = scaffold_claude_dir(tmp_path)
    # Second run should write zero files (all match)
    assert files2 == []
    # First run should have written all files
    assert len(files1) >= 11


# -- dry run ---------------------------------------------------------------


def test_scaffold_claude_dir_dry_run(tmp_path: pathlib.Path) -> None:
    files = scaffold_claude_dir(tmp_path, dry_run=True)
    # dry_run reports what would be written, but doesn't create files
    assert len(files) >= 11
    assert not (tmp_path / ".claude").exists()


# -- returns file list -----------------------------------------------------


def test_scaffold_claude_dir_returns_file_list(tmp_path: pathlib.Path) -> None:
    files = scaffold_claude_dir(tmp_path)
    # All paths should be relative
    for f in files:
        assert not f.startswith("/"), f"Expected relative path, got {f}"
        assert f.startswith(".claude/")


# -- SKILL.md files have valid frontmatter ---------------------------------


def test_agent_skill_files_valid_yaml_frontmatter(tmp_path: pathlib.Path) -> None:
    scaffold_claude_dir(tmp_path)
    for agent in ("builder", "tester", "reviewer", "explorer"):
        skill_md = tmp_path / ".claude" / "agents" / agent / "SKILL.md"
        content = skill_md.read_text(encoding="utf-8")
        assert content.startswith("---"), f"{agent} SKILL.md missing YAML frontmatter"
        # Check frontmatter has name and description
        assert f"name: {agent}" in content
        assert "description:" in content


# -- settings.json is valid ------------------------------------------------


def test_settings_json_valid(tmp_path: pathlib.Path) -> None:
    scaffold_claude_dir(tmp_path)
    settings = tmp_path / ".claude" / "settings.json"
    data = json.loads(settings.read_text(encoding="utf-8"))
    assert "permissions" in data
    assert "allow" in data["permissions"]
    assert "deny" in data["permissions"]
    assert isinstance(data["permissions"]["allow"], list)
    assert isinstance(data["permissions"]["deny"], list)


# -- settings includes detected test command -------------------------------


def test_settings_permissions_include_bash_wildcard(tmp_path: pathlib.Path) -> None:
    scaffold_claude_dir(tmp_path, test_command="python3 -m pytest tests/")
    settings = tmp_path / ".claude" / "settings.json"
    data = json.loads(settings.read_text(encoding="utf-8"))
    allow = data["permissions"]["allow"]
    assert "Bash(*)" in allow


# -- rules have paths frontmatter -----------------------------------------


def test_rules_have_paths_frontmatter(tmp_path: pathlib.Path) -> None:
    scaffold_claude_dir(tmp_path)
    for rule in ("conventions.md", "security.md"):
        rule_file = tmp_path / ".claude" / "rules" / rule
        content = rule_file.read_text(encoding="utf-8")
        assert "paths:" in content
        assert "**/*.py" in content


# -- conventions detection for Python projects ----------------------------


def test_conventions_detection_python(tmp_path: pathlib.Path) -> None:
    pyproject = tmp_path / "pyproject.toml"
    pyproject.write_text(
        '[tool.ruff]\nline-length = 99\n\n[tool.ruff.format]\nquote-style = "double"\n',
        encoding="utf-8",
    )
    result = _detect_conventions(tmp_path)
    assert "99" in result
    assert "double" in result


# -- conventions detection with no config ----------------------------------


def test_conventions_detection_no_config(tmp_path: pathlib.Path) -> None:
    result = _detect_conventions(tmp_path)
    # Should return empty string or minimal defaults
    assert isinstance(result, str)


# -- managed block references skills --------------------------------------


def test_managed_block_references_skills(tmp_path: pathlib.Path) -> None:
    scaffold(tmp_path)
    content = (tmp_path / "CLAUDE.md").read_text(encoding="utf-8")
    assert "/verify-all" in content
    assert "builder" in content


# -- scaffold preserves existing .claude/ files ----------------------------


def test_scaffold_preserves_existing_claude_dir_files(tmp_path: pathlib.Path) -> None:
    # Create a user file in .claude/
    user_dir = tmp_path / ".claude" / "my-custom"
    user_dir.mkdir(parents=True)
    user_file = user_dir / "config.md"
    user_file.write_text("my custom config", encoding="utf-8")

    scaffold_claude_dir(tmp_path)

    # User's file should still be there
    assert user_file.is_file()
    assert user_file.read_text(encoding="utf-8") == "my custom config"


# -- _build_permissions includes deny list ---------------------------------


def test_build_permissions_deny_list() -> None:
    perms = _build_permissions("pytest", "ruff check", "ruff format")
    assert "Bash(git push --force*)" in perms["deny"]
    assert "Bash(git checkout main*)" in perms["deny"]
    assert "Bash(sudo *)" in perms["deny"]


def test_build_permissions_includes_bash_wildcard() -> None:
    perms = _build_permissions("python3 -m pytest tests/", "", "")
    assert "Bash(*)" in perms["allow"]
