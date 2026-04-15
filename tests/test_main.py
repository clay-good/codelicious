"""Tests for codelicious.__main__ entry point."""

from __future__ import annotations

import importlib
import runpy
from unittest.mock import patch


def test_main_module_calls_cli_main() -> None:
    """Executing __main__ via runpy calls codelicious.cli.main and passes its return value to sys.exit."""
    with patch("codelicious.cli.main", return_value=0) as mock_main, patch("sys.exit") as mock_exit:
        runpy.run_module("codelicious", run_name="__main__", alter_sys=False)

    mock_main.assert_called_once()
    mock_exit.assert_called_once_with(0)


def test_main_module_importable() -> None:
    """Importing codelicious.__main__ does not crash when cli.main and sys.exit are mocked."""
    with patch("codelicious.cli.main", return_value=0), patch("sys.exit"):
        module = importlib.import_module("codelicious.__main__")

    # The module must define __all__
    assert hasattr(module, "__all__")
