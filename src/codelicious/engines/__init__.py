"""Engine selection and base class for codelicious build engines."""

from __future__ import annotations

import logging
import os
import shutil

from codelicious.engines.base import BuildEngine, BuildResult, ChunkResult, EngineContext

logger = logging.getLogger("codelicious.engines")

__all__ = ["BuildEngine", "BuildResult", "ChunkResult", "EngineContext", "select_engine"]


def select_engine(engine_preference: str = "auto") -> BuildEngine:
    """Select and return the appropriate build engine.

    Parameters
    ----------
    engine_preference:
        One of ``"auto"``, ``"claude"``, ``"huggingface"``.

        - ``"auto"``: prefer Claude Code CLI if available, else HuggingFace.
        - ``"claude"``: force Claude Code CLI (error if not available).
        - ``"huggingface"``: force HuggingFace Inference API.

        Future engine slots (not yet implemented):
        - ``"anthropic-api"``: Anthropic API direct
        - ``"openai"``: OpenAI/Codex API
        - ``"gemini"``: Google Gemini API

    Returns
    -------
    BuildEngine
        An initialized engine instance.

    Raises
    ------
    RuntimeError
        If the requested engine is not available.
    """
    from codelicious.engines.claude_engine import ClaudeCodeEngine
    from codelicious.engines.huggingface_engine import HuggingFaceEngine

    claude_available = shutil.which("claude") is not None
    hf_available = bool(os.environ.get("HF_TOKEN") or os.environ.get("LLM_API_KEY"))

    if engine_preference == "claude":
        if not claude_available:
            raise RuntimeError(
                "Claude Code CLI not found on PATH. Install it or use --engine huggingface.\n"
                "  Install: https://docs.anthropic.com/en/docs/claude-code"
            )
        return ClaudeCodeEngine()

    if engine_preference == "huggingface":
        if not hf_available:
            raise RuntimeError("HuggingFace token not found. Set HF_TOKEN or LLM_API_KEY, or use --engine claude.")
        return HuggingFaceEngine()

    # Auto-detect: prefer Claude, fall back to HuggingFace
    if claude_available:
        logger.info("Auto-detected: Claude Code CLI available — using Claude engine.")
        return ClaudeCodeEngine()

    if hf_available:
        logger.info("Auto-detected: HF_TOKEN set — using HuggingFace engine.")
        return HuggingFaceEngine()

    raise RuntimeError(
        "No build engine available. Either:\n"
        "  1. Install Claude Code CLI: https://docs.anthropic.com/en/docs/claude-code\n"
        "  2. Set HF_TOKEN=hf_... for HuggingFace Inference API"
    )
