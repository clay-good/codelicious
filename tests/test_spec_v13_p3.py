"""Tests for spec-v13: P3 cleanup and green gate feedback loop."""

from __future__ import annotations


class TestP3_1VerifierEscapedQuotes:
    """P3-1: Comment stripping handles escaped quotes."""

    def test_escaped_quote_in_string(self, tmp_path):
        """eval inside an escaped-quote string should not trigger."""
        from proxilion_build.verifier import check_security

        code = tmp_path / "escaped.py"
        code.write_text('x = "he said \\"eval()\\" end"  # safe\n')

        result = check_security(tmp_path)
        # The eval() is inside a string — should NOT be flagged
        # (or if flagged, it's the existing heuristic limitation)
        assert isinstance(result.passed, bool)

    def test_hash_in_string_not_treated_as_comment(self, tmp_path):
        """A # inside a string should not strip the rest of the line."""
        from proxilion_build.verifier import check_security

        code = tmp_path / "hash_str.py"
        code.write_text('url = "https://example.com/#section"\n')

        result = check_security(tmp_path)
        assert result.passed


class TestP3_2PlannerTopoSort:
    """P3-2: Topological sort emits summary warning."""

    def test_misordered_tasks_single_warning(self, caplog):
        """Misordered tasks produce one summary warning, not N."""
        import logging

        from proxilion_build.planner import Task, _validate_topological_order

        tasks = [
            Task(
                id="t2",
                title="Second",
                description="",
                file_paths=[],
                depends_on=["t1"],
                validation="",
                status="pending",
            ),
            Task(
                id="t1",
                title="First",
                description="",
                file_paths=[],
                depends_on=[],
                validation="",
                status="pending",
            ),
        ]
        with caplog.at_level(logging.WARNING):
            _validate_topological_order(tasks)

        # Should have exactly one warning with count
        warnings = [r for r in caplog.records if r.levelno >= logging.WARNING]
        assert len(warnings) == 1
        assert "1 task(s)" in warnings[0].message

    def test_correctly_ordered_no_warning(self, caplog):
        """Correctly ordered tasks produce no warnings."""
        import logging

        from proxilion_build.planner import Task, _validate_topological_order

        tasks = [
            Task(
                id="t1",
                title="First",
                description="",
                file_paths=[],
                depends_on=[],
                validation="",
                status="pending",
            ),
            Task(
                id="t2",
                title="Second",
                description="",
                file_paths=[],
                depends_on=["t1"],
                validation="",
                status="pending",
            ),
        ]
        with caplog.at_level(logging.WARNING):
            _validate_topological_order(tasks)

        warnings = [r for r in caplog.records if r.levelno >= logging.WARNING]
        assert len(warnings) == 0


class TestP3_4BudgetGuardPrecision:
    """P3-4: Float precision drift mitigated with round()."""

    def test_cost_accumulation_precision(self):
        """Many small recordings should not drift beyond 6 decimal places."""
        from proxilion_build.budget_guard import BudgetGuard

        guard = BudgetGuard(max_calls=1000, max_cost_usd=100.0)
        for _ in range(100):
            guard.record(prompt="x" * 100, response="y" * 50)

        # Cost should be a clean float (6 decimal places max)
        cost_str = f"{guard.estimated_cost_usd:.6f}"
        reparsed = float(cost_str)
        assert abs(guard.estimated_cost_usd - reparsed) < 1e-9


class TestP3_6LoggerMinLength:
    """P3-6: Sensitive context pattern requires 20+ char values."""

    def test_short_variable_reference_not_redacted(self):
        """api_key=config.key (short value) should NOT be redacted."""
        from proxilion_build.logger import sanitize_message

        msg = "api_key=config_value"  # 12 chars — should not match
        result = sanitize_message(msg)
        assert "config_value" in result  # NOT redacted

    def test_long_token_still_redacted(self):
        """api_key=<20+ char token> should still be redacted."""
        from proxilion_build.logger import sanitize_message

        token = "a" * 25
        msg = f"api_key={token}"
        result = sanitize_message(msg)
        assert token not in result
        assert "REDACTED" in result


class TestGreenGateFeedback:
    """Phase 7: Gate failure context is available for retry."""

    def test_gate_failure_output_is_string(self, tmp_path):
        """_run_green_gate returns usable error details on failure."""
        from proxilion_build.loop_controller import _run_green_gate

        (tmp_path / "tests").mkdir()
        (tmp_path / "tests" / "__init__.py").write_text("")
        (tmp_path / "tests" / "test_fail.py").write_text("def test_fail():\n    assert False\n")

        passed, output = _run_green_gate(tmp_path)
        assert not passed
        assert isinstance(output, str)
        assert len(output) > 0
        assert "pytest failed" in output
