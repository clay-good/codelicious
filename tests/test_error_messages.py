"""Tests for error message quality improvements (spec-19 Phase 2: EM-1 through EM-5)."""

import pathlib
import unittest.mock

import pytest

from codelicious.errors import PathTraversalError
from codelicious.sandbox import Sandbox

# -- EM-1 / EM-2: sandbox.py error messages include paths and distinguish symlink vs direct --


class TestSandboxErrorMessages:
    """Verify PathTraversalError messages contain resolved path and project root."""

    @pytest.fixture
    def sandbox(self, tmp_path: pathlib.Path) -> Sandbox:
        return Sandbox(tmp_path)

    def test_path_escape_includes_project_root(self, sandbox: Sandbox, tmp_path: pathlib.Path) -> None:
        """EM-1: Error message should include the project root."""
        # Create a symlink that escapes the sandbox
        escape_link = tmp_path / "escape_link.py"
        escape_link.symlink_to("/tmp/outside.py")
        with pytest.raises(PathTraversalError, match=str(tmp_path)):
            sandbox.resolve_path("escape_link.py")

    def test_direct_path_escape_says_path_traversal(self, tmp_path: pathlib.Path) -> None:
        """EM-2: Direct path escape should say 'Path traversal:'."""
        sandbox = Sandbox(tmp_path)
        with pytest.raises(PathTraversalError, match="Path traversal"):
            sandbox.resolve_path("../etc/passwd")

    def test_symlink_escape_says_symlink_resolution(self, tmp_path: pathlib.Path) -> None:
        """EM-2: Symlink-based escape should say 'Symlink resolution:'."""
        sandbox = Sandbox(tmp_path)
        escape_link = tmp_path / "link.py"
        escape_link.symlink_to("/tmp/outside.py")
        with pytest.raises(PathTraversalError, match="Symlink resolution"):
            sandbox.resolve_path("link.py")

    def test_check_denied_outside_includes_path(self, tmp_path: pathlib.Path) -> None:
        """EM-1: _check_denied error for outside paths includes project root."""
        sandbox = Sandbox(tmp_path)
        outside = pathlib.Path("/completely/outside")
        with pytest.raises(PathTraversalError, match=str(tmp_path)):
            sandbox._check_denied(outside)


# -- EM-4: verifier.py tool-not-found messages include install guidance --


class TestVerifierInstallGuidance:
    """Verify tool-not-found messages include install commands."""

    def test_lint_not_available_includes_install(self, tmp_path: pathlib.Path) -> None:
        """EM-4: Lint not-available message includes install guidance."""
        from codelicious.verifier import check_lint

        result = check_lint(tmp_path, language="python", tool_available=False)
        assert "pip install" in result.message

    def test_lint_not_found_includes_install(self, tmp_path: pathlib.Path) -> None:
        """EM-4: Lint FileNotFoundError message includes install guidance."""
        from codelicious.verifier import check_lint

        with unittest.mock.patch("codelicious.verifier._run_with_pgroup_kill", side_effect=FileNotFoundError):
            result = check_lint(tmp_path, language="python", tool_available=True)
        assert "pip install ruff" in result.message

    def test_pytest_not_installed_includes_install(self, tmp_path: pathlib.Path) -> None:
        """EM-4: pytest not-installed message includes install guidance."""
        from codelicious.verifier import check_tests

        tests_dir = tmp_path / "tests"
        tests_dir.mkdir()
        with unittest.mock.patch("codelicious.verifier._run_with_pgroup_kill", side_effect=FileNotFoundError):
            result = check_tests(tmp_path)
        assert "pip install pytest" in result.message

    def test_pip_audit_not_installed_includes_install(self, tmp_path: pathlib.Path) -> None:
        """EM-4: pip-audit not-installed message includes install guidance."""
        from codelicious.verifier import check_pip_audit

        result = check_pip_audit(tmp_path, tool_available=False)
        assert "pip install pip-audit" in result.message

    def test_playwright_not_installed_includes_install(self, tmp_path: pathlib.Path) -> None:
        """EM-4: playwright not-installed message includes install guidance."""
        from codelicious.verifier import check_playwright

        result = check_playwright(tmp_path, tool_available=False, is_final_attempt=True)
        assert "pip install playwright" in result.message

    def test_coverage_not_available_includes_install(self, tmp_path: pathlib.Path) -> None:
        """EM-4: coverage tool not-available message includes install guidance."""
        from codelicious.verifier import check_coverage

        result = check_coverage(tmp_path, language="python", threshold=80, tool_available=False)
        assert "pip install pytest-cov" in result.message

    def test_custom_command_not_found_includes_guidance(self, tmp_path: pathlib.Path) -> None:
        """EM-4: Custom command not-found message includes guidance."""
        from codelicious.verifier import check_custom_command

        with unittest.mock.patch("codelicious.verifier._run_with_pgroup_kill", side_effect=FileNotFoundError):
            result = check_custom_command(tmp_path, "nonexistent-tool --check")
        assert "not found" in result.message.lower()


# -- EM-5: cli.py exception handling (verified already fixed by spec-16 Phase 4) --


class TestCliExceptionHandling:
    """Verify cli.py does not silently swallow exceptions."""

    def test_main_logs_fatal_exception(self) -> None:
        """EM-5: main() logs exceptions rather than silently swallowing."""
        # Verify the except block at the end of main() calls logger.exception
        import inspect

        from codelicious import cli

        source = inspect.getsource(cli.main)
        assert "logger.exception" in source
        # Ensure there's no bare 'except Exception: pass'
        assert "except Exception: pass" not in source.replace(" ", "").replace("\n", "")
