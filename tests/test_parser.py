"""Tests for the spec parser module."""

from __future__ import annotations

import pathlib

import pytest

from codelicious.errors import (
    EmptySpecError,
    FileEncodingError,
    FileTooLargeError,
    SpecFileNotFoundError,
)
from codelicious.parser import Section, parse_spec

FIXTURES = pathlib.Path(__file__).parent / "fixtures"


# -- sample_spec.md --------------------------------------------------------


def test_sample_spec_returns_four_sections() -> None:
    sections = parse_spec(FIXTURES / "sample_spec.md")
    assert len(sections) == 4


def test_sample_spec_first_section() -> None:
    sections = parse_spec(FIXTURES / "sample_spec.md")
    s = sections[0]
    assert s.level == 1
    assert s.title == "Project Name"
    assert s.body == "A sample project."
    assert s.line_number == 1


def test_sample_spec_features_section() -> None:
    sections = parse_spec(FIXTURES / "sample_spec.md")
    s = sections[1]
    assert s.level == 2
    assert s.title == "Features"
    assert "Feature one" in s.body
    assert "Feature two" in s.body


def test_sample_spec_tech_stack_section() -> None:
    sections = parse_spec(FIXTURES / "sample_spec.md")
    s = sections[2]
    assert s.level == 2
    assert s.title == "Tech Stack"
    assert "Python 3.10" in s.body


def test_sample_spec_sub_section() -> None:
    sections = parse_spec(FIXTURES / "sample_spec.md")
    s = sections[3]
    assert s.level == 3
    assert s.title == "Sub-section"
    assert "Details here." in s.body


# -- malformed_spec.md -----------------------------------------------------


def test_malformed_spec_returns_preamble() -> None:
    sections = parse_spec(FIXTURES / "malformed_spec.md")
    assert len(sections) == 1
    s = sections[0]
    assert s.level == 0
    assert s.title == ""
    assert "plain text" in s.body


# -- minimal_spec.md -------------------------------------------------------


def test_minimal_spec_returns_one_section() -> None:
    sections = parse_spec(FIXTURES / "minimal_spec.md")
    assert len(sections) == 1
    s = sections[0]
    assert s.level == 1
    assert s.title == "Hello"
    assert s.body == "World."


# -- error cases -----------------------------------------------------------


def test_missing_file_raises_spec_file_not_found() -> None:
    with pytest.raises(SpecFileNotFoundError):
        parse_spec(pathlib.Path("/nonexistent/file.md"))


def test_oversized_file_raises_file_too_large(tmp_path: pathlib.Path) -> None:
    big = tmp_path / "big.md"
    big.write_text("# Title\n" + "x" * (1_048_577), encoding="utf-8")
    with pytest.raises(FileTooLargeError):
        parse_spec(big)


def test_non_utf8_file_raises_file_encoding_error(
    tmp_path: pathlib.Path,
) -> None:
    bad = tmp_path / "bad.md"
    bad.write_bytes(b"\x80\x81\x82\x83")
    with pytest.raises(FileEncodingError):
        parse_spec(bad)


def test_empty_file_raises_empty_spec_error(tmp_path: pathlib.Path) -> None:
    empty = tmp_path / "empty.md"
    empty.write_text("", encoding="utf-8")
    with pytest.raises(EmptySpecError):
        parse_spec(empty)


def test_whitespace_only_raises_empty_spec_error(
    tmp_path: pathlib.Path,
) -> None:
    ws = tmp_path / "ws.md"
    ws.write_text("   \n\n  \n", encoding="utf-8")
    with pytest.raises(EmptySpecError):
        parse_spec(ws)


# -- path traversal --------------------------------------------------------


def test_path_traversal_rejected_with_base_dir(
    tmp_path: pathlib.Path,
) -> None:
    outside = tmp_path.parent / "outside.md"
    outside.write_text("# Outside", encoding="utf-8")
    try:
        with pytest.raises(SpecFileNotFoundError):
            parse_spec(outside, base_dir=tmp_path)
    finally:
        if outside.exists():
            outside.unlink()


# -- edge cases ------------------------------------------------------------


def test_hashtag_not_treated_as_heading(tmp_path: pathlib.Path) -> None:
    f = tmp_path / "hashtag.md"
    f.write_text("#hashtag is not a heading\n#neither_is_this\n", encoding="utf-8")
    sections = parse_spec(f)
    assert len(sections) == 1
    assert sections[0].level == 0
    assert "#hashtag" in sections[0].body


def test_heading_with_no_body(tmp_path: pathlib.Path) -> None:
    f = tmp_path / "no_body.md"
    f.write_text("# First\n## Second\n", encoding="utf-8")
    sections = parse_spec(f)
    assert len(sections) == 2
    assert sections[0].body == ""
    assert sections[1].body == ""


def test_section_is_frozen() -> None:
    s = Section(level=1, title="Test", body="body", line_number=1)
    with pytest.raises(AttributeError):
        s.title = "changed"  # type: ignore[misc]


# -- Phase 0 hardening tests -----------------------------------------------


def test_parse_spec_rejects_non_path_input() -> None:
    with pytest.raises(TypeError, match="pathlib.Path or str"):
        parse_spec(12345)  # type: ignore[arg-type]


def test_parse_spec_rejects_nonexistent_base_dir(
    tmp_path: pathlib.Path,
) -> None:
    f = tmp_path / "spec.md"
    f.write_text("# Hello\nWorld.", encoding="utf-8")
    with pytest.raises(ValueError, match="not a directory"):
        parse_spec(f, base_dir=tmp_path / "nonexistent")


# -- Phase 4 hardening tests -----------------------------------------------


def test_crlf_line_endings_parsed_correctly(tmp_path: pathlib.Path) -> None:
    """CRLF line endings are normalized so sections parse identically to LF."""
    content_lf = "# Section One\nBody one.\n\n# Section Two\nBody two.\n"
    content_crlf = content_lf.replace("\n", "\r\n")

    f_lf = tmp_path / "spec_lf.md"
    f_crlf = tmp_path / "spec_crlf.md"
    f_lf.write_bytes(content_lf.encode("utf-8"))
    f_crlf.write_bytes(content_crlf.encode("utf-8"))

    sections_lf = parse_spec(f_lf)
    sections_crlf = parse_spec(f_crlf)

    assert len(sections_lf) == len(sections_crlf)
    for s_lf, s_crlf in zip(sections_lf, sections_crlf):
        assert s_lf.title == s_crlf.title
        assert s_lf.body == s_crlf.body
        assert s_lf.level == s_crlf.level


def test_heading_inside_code_block_not_treated_as_heading(
    tmp_path: pathlib.Path,
) -> None:
    """A # line inside a fenced code block is body text, not a new section."""
    content = "# Real Heading\nSome intro.\n```\n# This is code, not a heading\nx = 1\n```\nMore body.\n"
    f = tmp_path / "spec.md"
    f.write_text(content, encoding="utf-8")

    sections = parse_spec(f)

    # Only one real section — the fake heading is inside the code fence
    assert len(sections) == 1
    assert sections[0].title == "Real Heading"
    assert "# This is code" in sections[0].body


def test_heading_level_capped_at_six(tmp_path: pathlib.Path) -> None:
    """A heading with 7+ # signs is parsed as level 6, not discarded."""
    content = "####### Deep Heading\nSome body.\n"
    f = tmp_path / "spec.md"
    f.write_text(content, encoding="utf-8")

    sections = parse_spec(f)

    assert len(sections) == 1
    assert sections[0].level == 6
    assert sections[0].title == "Deep Heading"


def test_duplicate_section_titles_are_distinct(tmp_path: pathlib.Path) -> None:
    """Two sections with the same title are kept as separate Section objects."""
    content = "# Setup\nFirst setup.\n\n# Setup\nSecond setup.\n"
    f = tmp_path / "spec.md"
    f.write_text(content, encoding="utf-8")

    sections = parse_spec(f)

    assert len(sections) == 2
    assert sections[0].title == sections[1].title == "Setup"
    # Distinguished by line_number
    assert sections[0].line_number != sections[1].line_number
    assert sections[0].body != sections[1].body


# -- Phase 14: Spec Corruption Recovery Tests ------------------------------


def test_parse_spec_binary_file_raises(tmp_path: pathlib.Path) -> None:
    """parse_spec raises FileEncodingError for a binary (non-UTF-8) file."""
    spec = tmp_path / "spec.md"
    spec.write_bytes(b"\xff\xfe\x00\x01binary garbage")
    with pytest.raises(FileEncodingError):
        parse_spec(spec)


def test_parse_spec_null_bytes_in_content(tmp_path: pathlib.Path) -> None:
    """parse_spec on a file with null bytes either succeeds or raises cleanly."""
    spec = tmp_path / "spec.md"
    # Null bytes are valid UTF-8 bytes individually but unusual in text
    spec.write_bytes(b"# Title\n\x00\nBody\n")
    try:
        sections = parse_spec(spec)
        # If it succeeds, sections must be a list
        assert isinstance(sections, list)
    except Exception as exc:
        # Any exception raised must be a CodeliciousError subclass (no bare exceptions)
        from codelicious.errors import CodeliciousError

        assert isinstance(exc, CodeliciousError), (
            f"Unexpected exception type: {type(exc)}"
        )


def test_parse_spec_extremely_long_line(tmp_path: pathlib.Path) -> None:
    """parse_spec on a file with a very long line does not crash."""
    spec = tmp_path / "spec.md"
    long_line = "x" * 100_000
    spec.write_text(f"# Title\n{long_line}\n", encoding="utf-8")
    sections = parse_spec(spec)
    assert isinstance(sections, list)
    assert len(sections) >= 1
