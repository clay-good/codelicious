"""Integration tests for spec-v11: sample data and pipeline exercises.

Tests 32-37 from spec-v11 Phase 13.
"""

from __future__ import annotations

import json
import pathlib

_FIXTURES = pathlib.Path(__file__).parent / "fixtures"


class TestParserIntegration:
    """Exercise the parser with sample spec data."""

    def test_parser_handles_sample_spec(self):
        """Parse sample_spec_v11.md and verify 2 sections."""
        from codelicious.parser import parse_spec

        spec_path = _FIXTURES / "sample_spec_v11.md"
        sections = parse_spec(spec_path)

        # Should have the top-level heading + 2 phase headings
        titled = [s for s in sections if s.title]
        assert len(titled) >= 2
        titles = [s.title for s in titled]
        assert any("hello.py" in t.lower() for t in titles)
        assert any("test_hello" in t.lower() for t in titles)


class TestPlanJsonSchema:
    """Validate the sample plan JSON structure."""

    def test_plan_json_matches_schema(self):
        """Load sample_plan_v11.json and verify required fields."""
        plan_path = _FIXTURES / "sample_plan_v11.json"
        data = json.loads(plan_path.read_text(encoding="utf-8"))

        assert isinstance(data, list)
        assert len(data) == 2

        required_keys = {
            "id",
            "title",
            "description",
            "file_paths",
            "depends_on",
            "validation",
            "status",
        }
        for task in data:
            assert isinstance(task, dict)
            assert required_keys.issubset(set(task.keys())), f"Missing keys: {required_keys - set(task.keys())}"
            assert isinstance(task["file_paths"], list)
            assert isinstance(task["depends_on"], list)
            assert task["status"] == "pending"

    def test_plan_json_can_be_loaded_as_tasks(self):
        """The sample plan can be deserialized into Task objects."""
        from codelicious.planner import Task

        plan_path = _FIXTURES / "sample_plan_v11.json"
        data = json.loads(plan_path.read_text(encoding="utf-8"))

        tasks = [Task.from_dict(t) for t in data]
        assert len(tasks) == 2
        assert tasks[0].id == "task_001"
        assert tasks[1].depends_on == ["task_001"]


class TestExecutorResponseStrategies:
    """Test all 4 response parsing strategies with canned data."""

    def test_strict_format(self):
        """Strategy 1: --- FILE: path --- / --- END FILE ---."""
        from codelicious.executor import parse_llm_response

        response = '--- FILE: hello.py ---\nprint("Hello, World!")\n--- END FILE ---\n'
        results = parse_llm_response(response)
        assert len(results) == 1
        assert results[0][0] == "hello.py"
        assert "Hello, World!" in results[0][1]

    def test_markdown_with_filename(self):
        """Strategy 2: ```lang filepath blocks."""
        from codelicious.executor import parse_llm_response

        response = '```python hello.py\nprint("Hello, World!")\n```\n'
        results = parse_llm_response(response)
        assert len(results) == 1
        assert results[0][0] == "hello.py"

    def test_markdown_preceded_by_path(self):
        """Strategy 3: path on line before code block."""
        from codelicious.executor import parse_llm_response

        response = 'hello.py\n```python\nprint("Hello, World!")\n```\n'
        results = parse_llm_response(response)
        assert len(results) == 1
        assert results[0][0] == "hello.py"

    def test_single_file_fallback(self):
        """Strategy 4: single code block with expected file hint."""
        from codelicious.executor import parse_llm_response

        response = '```\nprint("Hello, World!")\n```\n'
        results = parse_llm_response(response, expected_files=["hello.py"])
        assert len(results) == 1
        assert results[0][0] == "hello.py"


class TestVerifierOnFixtures:
    """Syntax check on valid and invalid Python files."""

    def test_verifier_on_valid_python(self, tmp_path):
        """Syntax check passes for valid Python."""
        from codelicious.verifier import check_syntax

        valid = tmp_path / "valid.py"
        valid.write_text('def greet():\n    return "hello"\n')

        result = check_syntax(tmp_path)
        assert result.passed

    def test_verifier_on_invalid_python(self, tmp_path):
        """Syntax check fails for invalid Python."""
        from codelicious.verifier import check_syntax

        invalid = tmp_path / "broken.py"
        invalid.write_text("def greet(\n    return\n")

        result = check_syntax(tmp_path)
        assert not result.passed

    def test_verifier_security_scan_clean_file(self, tmp_path):
        """Security scan passes for a clean file."""
        from codelicious.verifier import check_security

        clean = tmp_path / "clean.py"
        clean.write_text("import pathlib\n\ndef read(p):\n    return pathlib.Path(p).read_text()\n")

        result = check_security(tmp_path)
        assert result.passed

    def test_verifier_on_empty_directory(self, tmp_path):
        """check_syntax on a directory with no Python files returns a passing result.

        When no .py files are found, the verifier should return a passed CheckResult
        with the message 'No Python files found' rather than raising or returning an error.
        """
        from codelicious.verifier import check_syntax

        # tmp_path has no files at all — verify check_syntax handles this gracefully
        result = check_syntax(tmp_path)

        assert result.passed is True
        assert result.name == "syntax"
        assert "no python files found" in result.message.lower()
