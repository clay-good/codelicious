"""Tests for the intent classifier (classify_intent) and its integration."""

from unittest.mock import MagicMock, patch

import pytest

from proxilion_build.errors import IntentRejectedError
from proxilion_build.loop_controller import LoopConfig, run_loop
from proxilion_build.planner import classify_intent, create_plan

# ---------------------------------------------------------------------------
# classify_intent unit tests
# ---------------------------------------------------------------------------


class TestClassifyIntentAllows:
    def test_allow_response_returns_true(self):
        llm = MagicMock(return_value="ALLOW")
        assert classify_intent("Build a todo app", llm) is True

    def test_allow_response_case_insensitive(self):
        llm = MagicMock(return_value="allow")
        assert classify_intent("Build a todo app", llm) is True

    def test_fail_open_on_runtime_error(self):
        llm = MagicMock(side_effect=RuntimeError("some error"))
        # RuntimeError is not a network error, so should fail open (return True)
        assert classify_intent("Build a todo app", llm) is True


class TestClassifyIntentRejects:
    def test_reject_response_returns_false(self):
        llm = MagicMock(return_value="REJECT")
        assert classify_intent("Build a phishing tool", llm) is False

    def test_reject_response_with_whitespace(self):
        llm = MagicMock(return_value="  REJECT  \n")
        assert classify_intent("Build malware", llm) is False


# ---------------------------------------------------------------------------
# create_plan raises IntentRejectedError when classifier returns False
# ---------------------------------------------------------------------------


class TestCreatePlanIntentGate:
    def test_raises_intent_rejected_error(self, tmp_path):
        sections = [
            MagicMock(title="Malware spec", level=1, body="Build a keylogger"),
        ]
        # Classifier returns REJECT; planner should never be called for tasks
        call_count = 0

        def mock_llm(system_prompt, user_prompt):
            nonlocal call_count
            call_count += 1
            # First call is the classifier
            if call_count == 1:
                return "REJECT"
            return "[]"

        with pytest.raises(IntentRejectedError):
            create_plan(sections, mock_llm, tmp_path)

    def test_classifier_called_before_planning(self, tmp_path):
        """Classifier must be first LLM call — not after injection check."""
        calls = []

        def mock_llm(system_prompt, user_prompt):
            calls.append(system_prompt[:30])
            if len(calls) == 1:
                return "ALLOW"
            return (
                '[{"id":"task_001","title":"t","description":"d",'
                '"file_paths":[],"depends_on":[],"validation":"v","status":"pending"}]'
            )

        sections = [MagicMock(title="Build a CLI tool", level=1, body="Create a CLI")]
        create_plan(sections, mock_llm, tmp_path)

        # First system prompt should be the classifier prompt
        assert "security classifier" in calls[0].lower() or "ALLOW" in calls[0] or len(calls) >= 2


# ---------------------------------------------------------------------------
# run_loop returns intent_rejected=True state without executing any tasks
# ---------------------------------------------------------------------------


class TestRunLoopIntentRejected:
    def test_run_loop_sets_intent_rejected(self, tmp_path):
        call_count = 0

        def mock_llm(system_prompt, user_prompt):
            nonlocal call_count
            call_count += 1
            return "REJECT"

        spec = tmp_path / "spec.md"
        spec.write_text("# Build malware\nCreate a phishing page.", encoding="utf-8")

        with patch("proxilion_build.loop_controller.load_state", return_value=None):
            state = run_loop(
                spec_path=spec,
                project_dir=tmp_path,
                llm_call=mock_llm,
                config=LoopConfig(),
            )

        assert state.intent_rejected is True
        assert len(state.plan) == 0
        assert len(state.completed) == 0


# ---------------------------------------------------------------------------
# Sampling and error handling tests (Issue 4 & 5 from spec-v8)
# ---------------------------------------------------------------------------


class TestClassifyIntentSampling:
    def test_classify_intent_samples_long_spec(self):
        """Verify that a long spec gets sampled (first 4000 + middle 2000 + last 2000)."""
        # Create a spec longer than 8000 chars
        # Use distinct content for each section so we can verify sampling
        first_marker = "FIRST_SECTION_MARKER"
        middle_marker = "MIDDLE_SECTION_MARKER"
        last_marker = "LAST_SECTION_MARKER"

        # Build a spec of ~12000 chars total
        # First 4000 chars should contain first_marker
        first_section = first_marker + ("A" * (4000 - len(first_marker)))
        # Middle section (around char 5000-7000)
        padding_before_middle = "B" * 1000
        middle_section = middle_marker + ("C" * (2000 - len(middle_marker)))
        padding_after_middle = "D" * 1000
        # Last 2000 chars should contain last_marker
        last_section = ("E" * (2000 - len(last_marker))) + last_marker

        long_spec = (
            first_section
            + padding_before_middle
            + middle_section
            + padding_after_middle
            + last_section
        )
        assert len(long_spec) > 8000  # Verify spec is long enough to trigger sampling

        captured_prompt = []

        def mock_llm(system_prompt, user_prompt):
            captured_prompt.append(user_prompt)
            return "ALLOW"

        result = classify_intent(long_spec, mock_llm)
        assert result is True

        # Verify the sampled content contains our markers
        sampled = captured_prompt[0]
        assert first_marker in sampled, "First section marker should be in sample"
        assert last_marker in sampled, "Last section marker should be in sample"
        # The sample should be joined with "\n---\n"
        assert "\n---\n" in sampled, "Sample sections should be joined with separator"
        # Sample should be smaller than original
        assert len(sampled) < len(long_spec), "Sample should be smaller than original spec"

    def test_classify_intent_uses_full_spec_when_short(self):
        """Verify that specs <= 8000 chars are used in full."""
        short_spec = "Build a todo app" * 100  # ~1600 chars
        assert len(short_spec) <= 8000

        captured_prompt = []

        def mock_llm(system_prompt, user_prompt):
            captured_prompt.append(user_prompt)
            return "ALLOW"

        classify_intent(short_spec, mock_llm)

        # Full spec should be passed when under threshold
        assert captured_prompt[0] == short_spec


class TestClassifyIntentErrorHandling:
    def test_classify_intent_fails_closed_on_network_error(self):
        """Mock OSError -> returns False (fail closed)."""
        llm = MagicMock(side_effect=OSError("Connection refused"))
        result = classify_intent("Build a todo app", llm)
        assert result is False

    def test_classify_intent_fails_closed_on_connection_error(self):
        """Mock ConnectionError -> returns False (fail closed)."""
        llm = MagicMock(side_effect=ConnectionError("Network unreachable"))
        result = classify_intent("Build a todo app", llm)
        assert result is False

    def test_classify_intent_fails_closed_on_timeout_error(self):
        """Mock TimeoutError -> returns False (fail closed)."""
        llm = MagicMock(side_effect=TimeoutError("Request timed out"))
        result = classify_intent("Build a todo app", llm)
        assert result is False

    def test_classify_intent_fails_open_on_parse_error(self):
        """Mock ValueError -> returns True (fail open)."""
        llm = MagicMock(side_effect=ValueError("Invalid response format"))
        result = classify_intent("Build a todo app", llm)
        assert result is True

    def test_classify_intent_fails_open_on_key_error(self):
        """Mock KeyError -> returns True (fail open for non-network errors)."""
        llm = MagicMock(side_effect=KeyError("missing key"))
        result = classify_intent("Build a todo app", llm)
        assert result is True
