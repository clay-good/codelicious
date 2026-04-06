"""Tests that validate edge case fixtures work correctly (spec-19 Phase 6: TF-1 through TF-4)."""

from __future__ import annotations

import pathlib
from typing import Any


# -- TF-1: edge_case_spec_path fixture variations ----------------------------


def test_edge_case_spec_path_is_file(edge_case_spec_path: pathlib.Path) -> None:
    """Each spec variation should produce an existing file."""
    assert edge_case_spec_path.is_file()


def test_edge_case_spec_path_is_readable(edge_case_spec_path: pathlib.Path) -> None:
    """Each spec variation should be readable as UTF-8 text."""
    content = edge_case_spec_path.read_text(encoding="utf-8")
    assert isinstance(content, str)


# -- TF-2: edge_case_plan fixture variations ---------------------------------


def test_edge_case_plan_is_list(edge_case_plan: list[dict[str, Any]]) -> None:
    """Each plan variation should be a list."""
    assert isinstance(edge_case_plan, list)


def test_edge_case_plan_tasks_have_id(edge_case_plan: list[dict[str, Any]]) -> None:
    """Every task in the plan should have an 'id' key."""
    for task in edge_case_plan:
        assert "id" in task


def test_edge_case_plan_tasks_have_file_paths(edge_case_plan: list[dict[str, Any]]) -> None:
    """Every task should have a 'file_paths' key (even if empty)."""
    for task in edge_case_plan:
        assert "file_paths" in task
        assert isinstance(task["file_paths"], list)


# -- TF-3: edge_case_code_response fixture variations ------------------------


def test_edge_case_code_response_is_string(edge_case_code_response: str) -> None:
    """Each code response variation should be a string."""
    assert isinstance(edge_case_code_response, str)


def test_edge_case_code_response_no_crash_on_len(edge_case_code_response: str) -> None:
    """Calling len() on each variation should not crash."""
    length = len(edge_case_code_response)
    assert length >= 0


# -- TF-4: unicode_filename_dir fixture --------------------------------------


def test_unicode_filename_dir_exists(unicode_filename_dir: pathlib.Path) -> None:
    """The unicode directory fixture should be a valid directory."""
    assert unicode_filename_dir.is_dir()


def test_unicode_filename_dir_has_accented_file(unicode_filename_dir: pathlib.Path) -> None:
    """Should contain a file with accented characters."""
    assert (unicode_filename_dir / "r\u00e9sum\u00e9.py").is_file()


def test_unicode_filename_dir_has_cjk_file(unicode_filename_dir: pathlib.Path) -> None:
    """Should contain a file with CJK characters."""
    assert (unicode_filename_dir / "\u6d4b\u8bd5.py").is_file()


def test_unicode_filename_dir_has_spanish_file(unicode_filename_dir: pathlib.Path) -> None:
    """Should contain a file with Spanish content."""
    assert (unicode_filename_dir / "datos.txt").is_file()


def test_unicode_filename_dir_file_count(unicode_filename_dir: pathlib.Path) -> None:
    """Should contain exactly 3 files."""
    files = list(unicode_filename_dir.iterdir())
    assert len(files) == 3


def test_unicode_filename_dir_files_readable(unicode_filename_dir: pathlib.Path) -> None:
    """All files in the unicode directory should be readable."""
    for f in unicode_filename_dir.iterdir():
        content = f.read_text(encoding="utf-8")
        assert len(content) > 0
