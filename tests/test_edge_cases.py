"""Tests for edge case closure (spec-19 Phase 4: EC-1 through EC-4)."""

from __future__ import annotations

import pathlib

import pytest

from codelicious.errors import FileReadError, SandboxViolationError
from codelicious.executor import _normalize_file_path
from codelicious.verifier import _strip_string_literals


# -- EC-1: executor.py _normalize_file_path rejects triple-dot and UNC paths --


class TestNormalizeFilePathEdgeCases:
    """Verify triple-dot and UNC path rejection."""

    def test_rejects_triple_dot_component(self) -> None:
        """Path component '...' (three dots) should be rejected."""
        with pytest.raises(SandboxViolationError, match="not allowed"):
            _normalize_file_path("src/.../main.py")

    def test_rejects_quad_dot_component(self) -> None:
        """Path component '....' (four dots) should also be rejected."""
        with pytest.raises(SandboxViolationError, match="not allowed"):
            _normalize_file_path("src/..../main.py")

    def test_rejects_unc_path_forward_slashes(self) -> None:
        """UNC paths starting with // should be rejected."""
        with pytest.raises(SandboxViolationError, match="UNC"):
            _normalize_file_path("//server/share/file.py")

    def test_rejects_unc_path_backslashes(self) -> None:
        r"""UNC paths starting with \\ should be rejected."""
        with pytest.raises(SandboxViolationError, match="UNC"):
            _normalize_file_path("\\\\server\\share\\file.py")

    def test_allows_single_dot_component(self) -> None:
        """Single dot is fine (stripped by normalization)."""
        result = _normalize_file_path("./src/main.py")
        assert result == "src/main.py"

    def test_allows_dotfile_names(self) -> None:
        """Dotfiles like .gitignore should not be rejected."""
        result = _normalize_file_path(".gitignore")
        assert result == ".gitignore"

    def test_allows_ellipsis_in_filename(self) -> None:
        """Triple dots as part of a filename (not a standalone component) are OK."""
        result = _normalize_file_path("src/data...csv")
        assert result == "src/data...csv"


# -- EC-2: context_manager.py estimate_tokens docstring accuracy ----------------


class TestEstimateTokensDocstring:
    """Verify the docstring documents approximation and unicode behavior."""

    def test_docstring_mentions_approximate(self) -> None:
        from codelicious.context_manager import estimate_tokens

        doc = estimate_tokens.__doc__ or ""
        assert "approximate" in doc.lower() or "Approximate" in doc

    def test_docstring_mentions_unicode(self) -> None:
        from codelicious.context_manager import estimate_tokens

        doc = estimate_tokens.__doc__ or ""
        assert "unicode" in doc.lower() or "Unicode" in doc

    def test_returns_int_for_emoji(self) -> None:
        """estimate_tokens should handle emoji text without crashing."""
        from codelicious.context_manager import estimate_tokens

        result = estimate_tokens("Hello 🌍🎉 world")
        assert isinstance(result, int)
        assert result > 0


# -- EC-3: verifier.py _strip_string_literals handles bytes and f-strings ------


class TestStripStringLiterals:
    """Verify bytes literal and f-string handling."""

    def test_bytes_literal_double_quote(self) -> None:
        """b\"secret\" should be stripped like a regular string."""
        result = _strip_string_literals('x = b"secret_value"')
        assert "secret_value" not in result
        assert "x = " in result

    def test_bytes_literal_single_quote(self) -> None:
        """b'secret' should be stripped like a regular string."""
        result = _strip_string_literals("x = b'secret_value'")
        assert "secret_value" not in result

    def test_bytes_literal_with_escape(self) -> None:
        r"""b\"hello\\nworld\" — escapes should be handled."""
        result = _strip_string_literals('x = b"hello\\nworld"')
        assert "hello" not in result

    def test_raw_bytes_literal(self) -> None:
        """rb\"...\" and br\"...\" should be treated as raw (no escape processing)."""
        result = _strip_string_literals('x = rb"raw\\nvalue"')
        assert "raw" not in result

    def test_fstring_preserves_expression(self) -> None:
        """f\"text {expr} text\" should preserve the {expr} part."""
        result = _strip_string_literals('x = f"hello {name} world"')
        assert "name" in result
        assert "hello" not in result
        assert "world" not in result

    def test_fstring_preserves_complex_expression(self) -> None:
        """f\"{obj.method()}\" should preserve the expression."""
        result = _strip_string_literals('x = f"{obj.method()}"')
        assert "obj.method()" in result

    def test_regular_string_still_works(self) -> None:
        """Regular strings should still be stripped as before."""
        result = _strip_string_literals('x = "secret" + y')
        assert "secret" not in result
        assert "x = " in result
        assert " + y" in result

    def test_raw_string_still_works(self) -> None:
        """r\"...\" should still be stripped."""
        result = _strip_string_literals('pattern = r"\\d+"')
        assert "\\d+" not in result

    def test_code_outside_strings_preserved(self) -> None:
        """Code outside strings must not be altered."""
        result = _strip_string_literals("eval(user_input)")
        assert "eval(user_input)" in result


# -- EC-4: sandbox.py read_file catches UnicodeDecodeError ---------------------


class TestReadFileBinaryHandling:
    """Verify read_file returns a clear error for binary files."""

    def test_binary_file_raises_file_read_error(self, tmp_path: pathlib.Path) -> None:
        """Reading a binary file should raise FileReadError, not UnicodeDecodeError."""
        from codelicious.sandbox import Sandbox

        sb = Sandbox(tmp_path)
        binary_file = tmp_path / "image.py"
        binary_file.write_bytes(b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\xff\xfe")

        with pytest.raises(FileReadError, match="Cannot read"):
            sb.read_file("image.py")

    def test_binary_file_error_mentions_filename(self, tmp_path: pathlib.Path) -> None:
        """The error message should include the filename."""
        from codelicious.sandbox import Sandbox

        sb = Sandbox(tmp_path)
        binary_file = tmp_path / "data.py"
        binary_file.write_bytes(b"\xff\xfe\x00\x01\x02\x03")

        with pytest.raises(FileReadError, match="data.py"):
            sb.read_file("data.py")

    def test_utf8_file_reads_normally(self, tmp_path: pathlib.Path) -> None:
        """Valid UTF-8 files should read without error."""
        from codelicious.sandbox import Sandbox

        sb = Sandbox(tmp_path)
        utf8_file = tmp_path / "hello.py"
        utf8_file.write_text("print('héllo wörld')", encoding="utf-8")

        content = sb.read_file("hello.py")
        assert "héllo wörld" in content
