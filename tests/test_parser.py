"""Tests for the spec parser module."""

from __future__ import annotations

import pathlib

import pytest

from codelicious.errors import (
    EmptySpecError,
    FileEncodingError,
    FileTooLargeError,
    ParseError,
    SpecFileNotFoundError,
)
from codelicious.parser import MAX_FILE_SIZE, Section, parse_spec

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


def test_file_exactly_at_max_size_does_not_raise(tmp_path: pathlib.Path) -> None:
    """A file whose size is exactly MAX_FILE_SIZE bytes must not raise FileTooLargeError.

    The parser check is ``file_size > MAX_FILE_SIZE`` (strictly greater-than),
    so a file at the boundary is allowed.
    """
    from codelicious.parser import MAX_FILE_SIZE

    boundary_file = tmp_path / "boundary.md"
    # Build content of exactly MAX_FILE_SIZE bytes encoded as UTF-8.
    # A heading prefix ensures the file is parseable.
    header = b"# Title\n"
    padding = b"x" * (MAX_FILE_SIZE - len(header))
    boundary_file.write_bytes(header + padding)
    assert boundary_file.stat().st_size == MAX_FILE_SIZE

    # Must not raise — file is at the limit, not over it
    sections = parse_spec(boundary_file)
    assert isinstance(sections, list)
    assert len(sections) >= 1


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


@pytest.mark.parametrize(
    "hashes,expected_level",
    [
        ("######", 6),  # exactly 6 hashes -> level 6, no capping needed
        ("#######", 6),  # 7 hashes -> capped at level 6
        ("########", 6),  # 8 hashes -> capped at level 6
    ],
)
def test_heading_level_capped_at_six(hashes: str, expected_level: int, tmp_path: pathlib.Path) -> None:
    """Headings with 6 hashes use level 6 (no cap); 7+ hashes are capped at level 6."""
    content = f"{hashes} Deep Heading\nSome body.\n"
    f = tmp_path / "spec.md"
    f.write_text(content, encoding="utf-8")

    sections = parse_spec(f)

    assert len(sections) == 1
    assert sections[0].level == expected_level
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
    """parse_spec raises ParseError when the file contains null bytes."""
    from codelicious.errors import ParseError

    spec = tmp_path / "spec.md"
    # Null bytes are explicitly rejected by parser.py (lines 86-90)
    spec.write_bytes(b"# Title\n\x00\nBody\n")
    with pytest.raises(ParseError, match="null bytes"):
        parse_spec(spec)


def test_parse_spec_extremely_long_line(tmp_path: pathlib.Path) -> None:
    """parse_spec on a file with a very long line parses the section correctly."""
    spec = tmp_path / "spec.md"
    long_line = "x" * 100_000
    spec.write_text(f"# Title\n{long_line}\n", encoding="utf-8")
    sections = parse_spec(spec)
    assert isinstance(sections, list)
    assert len(sections) == 1
    assert sections[0].title == "Title"
    assert long_line in sections[0].body


# -- Finding 77: Unclosed code fence edge case -----------------------------


def test_unclosed_code_fence_yields_one_section(tmp_path: pathlib.Path) -> None:
    """An unclosed opening code fence keeps the parser in fence mode for the
    rest of the file, so any '#' lines inside are not treated as headings.
    The entire content (title heading + unclosed fence body) must resolve to
    exactly one section.
    """
    content = "# Title\n```\n# This is inside\nno closing fence\n"
    spec = tmp_path / "unclosed_fence.md"
    spec.write_text(content, encoding="utf-8")

    sections = parse_spec(spec)

    assert len(sections) == 1, (
        f"Expected exactly 1 section for unclosed fence content, got {len(sections)}: "
        f"{[(s.level, s.title) for s in sections]}"
    )
    assert sections[0].title == "Title"
    # The content inside the unclosed fence must appear as body text
    assert "# This is inside" in sections[0].body
    assert "no closing fence" in sections[0].body


# ---------------------------------------------------------------------------
# spec-22 Phase 7: Parser reads file once (no TOCTOU)
# ---------------------------------------------------------------------------


def test_oversized_file_detected_via_read_not_stat(tmp_path: pathlib.Path) -> None:
    """FileTooLargeError is raised based on the actual bytes read, not stat().

    This verifies the TOCTOU fix: there is no window between stat and read
    where the file could be replaced with a larger one.
    """
    from codelicious.parser import MAX_FILE_SIZE

    spec = tmp_path / "big.md"
    spec.write_bytes(b"# Title\n" + b"x" * (MAX_FILE_SIZE + 1))
    with pytest.raises(FileTooLargeError):
        parse_spec(spec)


def test_file_at_exact_limit_is_accepted(tmp_path: pathlib.Path) -> None:
    """A file with exactly MAX_FILE_SIZE bytes is accepted."""
    from codelicious.parser import MAX_FILE_SIZE

    content = "# Title\n" + "x" * (MAX_FILE_SIZE - len("# Title\n"))
    spec = tmp_path / "exact.md"
    spec.write_text(content, encoding="utf-8")
    sections = parse_spec(spec)
    assert len(sections) >= 1


# ---------------------------------------------------------------------------
# spec-20 Phase 18: Spec Parser Input Validation (S20-P3-10)
# ---------------------------------------------------------------------------


class TestSpecParserInputValidation:
    """Tests for S20-P3-10: spec parser file size, encoding, and null byte validation."""

    def test_parser_rejects_oversized_spec(self, tmp_path: pathlib.Path) -> None:
        """A spec file exceeding MAX_FILE_SIZE must raise FileTooLargeError."""
        spec = tmp_path / "huge.md"
        spec.write_bytes(b"# Title\n" + b"x" * MAX_FILE_SIZE)
        with pytest.raises(FileTooLargeError):
            parse_spec(spec)

    def test_parser_rejects_binary_content(self, tmp_path: pathlib.Path) -> None:
        """A binary file (non-UTF-8) must raise FileEncodingError."""
        spec = tmp_path / "binary.md"
        spec.write_bytes(b"\x80\x81\x82\x83" * 100)
        with pytest.raises(FileEncodingError):
            parse_spec(spec)

    def test_parser_strips_null_bytes(self, tmp_path: pathlib.Path) -> None:
        """A file containing null bytes must raise ParseError."""
        spec = tmp_path / "nulls.md"
        spec.write_bytes(b"# Title\n\x00content with nulls\x00\n")
        with pytest.raises(ParseError, match="null bytes"):
            parse_spec(spec)

    def test_parser_accepts_valid_utf8(self, tmp_path: pathlib.Path) -> None:
        """A valid UTF-8 spec file must parse successfully."""
        spec = tmp_path / "valid.md"
        spec.write_text("# My Spec\n\nBuild a REST API.\n", encoding="utf-8")
        sections = parse_spec(spec)
        assert len(sections) >= 1
        assert sections[0].title == "My Spec"

    def test_parser_accepts_unicode_content(self, tmp_path: pathlib.Path) -> None:
        """A spec with unicode characters (emoji, CJK, accented) must parse."""
        spec = tmp_path / "unicode.md"
        spec.write_text("# Spécification 🚀\n\n中文内容 café\n", encoding="utf-8")
        sections = parse_spec(spec)
        assert len(sections) >= 1
        assert "Spécification" in sections[0].title

    def test_parser_size_limit_configurable(self) -> None:
        """MAX_FILE_SIZE must be importable and equal to 1 MB."""
        assert MAX_FILE_SIZE == 1_048_576
