"""Integration tests: sample data and pipeline exercises."""

from __future__ import annotations

import json
import pathlib

_FIXTURES = pathlib.Path(__file__).parent / "fixtures"


class TestParserIntegration:
    """Exercise the parser with sample spec data."""

    def test_parser_handles_sample_spec(self):
        """Parse sample_spec_integration.md and verify 2 sections."""
        from codelicious.parser import parse_spec

        spec_path = _FIXTURES / "sample_spec_integration.md"
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
        """Load sample_plan.json and verify required fields."""
        plan_path = _FIXTURES / "sample_plan.json"
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

        plan_path = _FIXTURES / "sample_plan.json"
        data = json.loads(plan_path.read_text(encoding="utf-8"))

        tasks = [Task.from_dict(t) for t in data]
        assert len(tasks) == 2
        assert tasks[0].id == "task_001"
        assert tasks[1].depends_on == ["task_001"]
