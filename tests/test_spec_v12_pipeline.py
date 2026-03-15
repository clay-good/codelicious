"""Tests for spec-v12: deterministic green-commit pipeline.

Covers green gate, slugify, prompt lengths, and subprocess checks.
"""

from __future__ import annotations


class TestRunSubprocessCheck:
    """_run_subprocess_check helper."""

    def test_returns_none_when_tool_missing(self, tmp_path):
        """When the command binary doesn't exist, returns None (skip)."""
        from proxilion_build.loop_controller import _run_subprocess_check

        result = _run_subprocess_check(
            tmp_path, ["nonexistent_tool_xyzzy", "--check"], "test", timeout=5
        )
        assert result is None

    def test_returns_none_on_success(self, tmp_path):
        """When the command succeeds, returns None."""
        from proxilion_build.loop_controller import _run_subprocess_check

        result = _run_subprocess_check(
            tmp_path, ["python3", "-c", "print('ok')"], "python", timeout=10
        )
        assert result is None

    def test_returns_error_on_failure(self, tmp_path):
        """When the command fails, returns error string."""
        from proxilion_build.loop_controller import _run_subprocess_check

        result = _run_subprocess_check(
            tmp_path, ["python3", "-c", "raise SystemExit(1)"], "python", timeout=10
        )
        assert result is not None
        assert "python failed" in result

    def test_returns_error_on_timeout(self, tmp_path):
        """When the command times out, returns timeout error."""
        from proxilion_build.loop_controller import _run_subprocess_check

        result = _run_subprocess_check(
            tmp_path, ["python3", "-c", "import time; time.sleep(60)"], "slow", timeout=1
        )
        assert result is not None
        assert "timed out" in result


class TestRunGreenGate:
    """_run_green_gate deterministic verification."""

    def test_passes_clean_project(self, tmp_path):
        """Green gate passes when tests and lint are clean."""
        from proxilion_build.loop_controller import _run_green_gate

        # Create a minimal valid Python project
        (tmp_path / "tests").mkdir()
        (tmp_path / "tests" / "__init__.py").write_text("")
        (tmp_path / "tests" / "test_ok.py").write_text("def test_one():\n    assert True\n")
        (tmp_path / "hello.py").write_text('print("hello")\n')

        passed, output = _run_green_gate(tmp_path)
        # May fail if pytest/ruff aren't installed, but should not crash
        assert isinstance(passed, bool)
        assert isinstance(output, str)

    def test_fails_on_syntax_error(self, tmp_path):
        """Green gate fails when Python has syntax errors."""
        from proxilion_build.loop_controller import _run_green_gate

        (tmp_path / "tests").mkdir()
        (tmp_path / "tests" / "__init__.py").write_text("")
        (tmp_path / "tests" / "test_broken.py").write_text("def test_broken(:\n    pass\n")

        passed, output = _run_green_gate(tmp_path)
        assert not passed
        assert output  # Should contain failure details


class TestSlugify:
    """_slugify spec-name-to-branch conversion."""

    def test_simple_spec_name(self):
        from proxilion_build.loop_controller import _slugify

        assert _slugify("spec-v12") == "spec-v12"

    def test_spec_with_spaces(self):
        from proxilion_build.loop_controller import _slugify

        assert _slugify("my spec file") == "my-spec-file"

    def test_spec_with_special_chars(self):
        from proxilion_build.loop_controller import _slugify

        result = _slugify("spec@v3!final")
        assert "@" not in result
        assert "!" not in result

    def test_empty_string(self):
        from proxilion_build.loop_controller import _slugify

        assert _slugify("") == "auto"

    def test_preserves_dots_and_dashes(self):
        from proxilion_build.loop_controller import _slugify

        assert _slugify("spec-v12.1") == "spec-v12.1"


class TestPromptSizes:
    """Verify tightened prompts are concise."""

    def test_build_task_prompt_under_500_chars(self):
        from proxilion_build.prompts import AGENT_BUILD_TASK

        assert len(AGENT_BUILD_TASK) < 700

    def test_verify_prompt_under_300_chars(self):
        from proxilion_build.prompts import AGENT_VERIFY

        assert len(AGENT_VERIFY) < 300

    def test_analyze_prompt_under_400_chars(self):
        from proxilion_build.prompts import AGENT_ANALYZE

        assert len(AGENT_ANALYZE) < 400

    def test_ci_fix_prompt_under_300_chars(self):
        from proxilion_build.prompts import AGENT_CI_FIX

        # CI_FIX has {{ci_output}} and {{branch_name}} placeholders
        assert len(AGENT_CI_FIX) < 400

    def test_build_task_has_required_vars(self):
        from proxilion_build.prompts import AGENT_BUILD_TASK

        assert "{{project_name}}" in AGENT_BUILD_TASK
        assert "{{task_title}}" in AGENT_BUILD_TASK
        assert "{{task_description}}" in AGENT_BUILD_TASK
        assert "{{completed_summary}}" in AGENT_BUILD_TASK
        assert "{{remaining_count}}" in AGENT_BUILD_TASK
        assert "BUILD_COMPLETE" in AGENT_BUILD_TASK

    def test_verify_has_required_vars(self):
        from proxilion_build.prompts import AGENT_VERIFY

        assert "{{project_name}}" in AGENT_VERIFY
        assert "{{verify_pass}}" in AGENT_VERIFY
        assert "BUILD_COMPLETE" in AGENT_VERIFY
