"""Defines all custom exception classes for the codelicious project."""

import warnings  # noqa: F401 — re-exported for convenience

__all__ = [
    "APIKeyMissingError",
    "AgentTimeout",
    "BuildTimeoutError",
    "BudgetExhaustedError",
    "CICheckError",
    "ClaudeAuthError",
    "ClaudeRateLimitError",
    "ConcurrentBuildError",
    "ContextBudgetError",
    "DeniedPathError",
    "DisallowedExtensionError",
    "EmptySpecError",
    "ExecutionError",
    "FileCountLimitError",
    "FileEncodingError",
    "FileReadError",
    "FileSizeLimitError",
    "FileTooLargeError",
    "FileWriteError",
    "GitOperationError",
    "IntentRejectedError",
    "InvalidPlanError",
    "LLMAuthenticationError",
    "LLMClientError",
    "LLMProviderError",
    "LLMRateLimitError",
    "LLMResponseError",
    "LLMResponseFormatError",
    "LLMResponseTooLargeError",
    "LLMTimeoutError",
    "LoopError",
    "PRCreationError",
    "ParseError",
    "PathTraversalError",
    "PatienceExhaustedError",
    "PlanningError",
    "PolicyViolationError",
    "PromptInjectionWarning",
    "CodeliciousError",
    "ReplanningError",
    "SandboxViolationError",
    "SpecFileNotFoundError",
    "UnsafePathError",
    "VerificationError",
]

# ---------------------------------------------------------------------------
# Base
# ---------------------------------------------------------------------------


class CodeliciousError(Exception):
    """Base exception for all codelicious errors."""

    def __init__(self, message: str, *, path: str | None = None) -> None:
        super().__init__(message)
        self.message: str = message
        self.path: str | None = path


# ---------------------------------------------------------------------------
# Parser errors
# ---------------------------------------------------------------------------


class SpecFileNotFoundError(CodeliciousError):
    """Raised when the spec file does not exist."""


class FileReadError(CodeliciousError):
    """Raised when a file cannot be read."""


class FileTooLargeError(CodeliciousError):
    """Raised when a file exceeds the maximum allowed size."""


class FileEncodingError(CodeliciousError):
    """Raised when a file cannot be decoded as UTF-8."""


class EmptySpecError(CodeliciousError):
    """Raised when the spec file is empty or contains only whitespace."""


class ParseError(CodeliciousError):
    """Raised when the spec file cannot be parsed."""


# ---------------------------------------------------------------------------
# Planner errors
# ---------------------------------------------------------------------------


class PlanningError(CodeliciousError):
    """Raised when the planner fails to generate a plan."""


class InvalidPlanError(CodeliciousError):
    """Raised when a generated plan is structurally invalid."""


# ---------------------------------------------------------------------------
# LLM client errors
# ---------------------------------------------------------------------------


class LLMClientError(CodeliciousError):
    """Base exception for LLM client errors."""


class LLMAuthenticationError(LLMClientError):
    """Raised when LLM authentication fails."""


class LLMRateLimitError(LLMClientError):
    """Raised when the LLM rate limit is exceeded."""


class LLMTimeoutError(LLMClientError):
    """Raised when an LLM request times out."""


class LLMResponseError(LLMClientError):
    """Raised when the LLM response is malformed or unusable."""


class LLMResponseTooLargeError(LLMClientError):
    """Raised when the LLM response exceeds the maximum allowed size."""


class LLMResponseFormatError(LLMClientError):
    """Raised when the LLM response is not the expected type (e.g., not a dict)."""


class LLMProviderError(LLMClientError):
    """Raised when the LLM provider returns a server error."""


class APIKeyMissingError(LLMClientError):
    """Raised when the required API key is not configured."""


# ---------------------------------------------------------------------------
# Context manager errors
# ---------------------------------------------------------------------------


class ContextBudgetError(CodeliciousError):
    """Raised when the prompt exceeds the context window budget."""


# ---------------------------------------------------------------------------
# Executor errors
# ---------------------------------------------------------------------------


class ExecutionError(CodeliciousError):
    """Raised when code execution fails."""


class FileWriteError(CodeliciousError):
    """Raised when a file cannot be written."""


class UnsafePathError(CodeliciousError):
    """Raised when a file path is deemed unsafe."""


# ---------------------------------------------------------------------------
# Verifier errors
# ---------------------------------------------------------------------------


class VerificationError(CodeliciousError):
    """Raised when verification checks fail."""


# ---------------------------------------------------------------------------
# Loop controller errors
# ---------------------------------------------------------------------------


class LoopError(CodeliciousError):
    """Raised for general loop controller failures."""


class PatienceExhaustedError(CodeliciousError):
    """Raised when the maximum number of retries is exceeded."""


class ReplanningError(CodeliciousError):
    """Raised when mid-loop re-planning fails."""


class ConcurrentBuildError(CodeliciousError):
    """Raised when another codelicious instance is already running in the same project."""


# ---------------------------------------------------------------------------
# Sandbox errors
# ---------------------------------------------------------------------------


class SandboxViolationError(CodeliciousError):
    """Base exception for sandbox access violations."""


class PathTraversalError(SandboxViolationError):
    """Raised when a path attempts to escape the project directory."""


class DisallowedExtensionError(SandboxViolationError):
    """Raised when a file has a disallowed extension."""


class DeniedPathError(SandboxViolationError):
    """Raised when a write targets an explicitly denied path."""


class FileSizeLimitError(SandboxViolationError):
    """Raised when a file exceeds the per-file size limit."""


class FileCountLimitError(SandboxViolationError):
    """Raised when the per-run file count limit is exceeded."""


# ---------------------------------------------------------------------------
# Budget and timeout errors
# ---------------------------------------------------------------------------


class BudgetExhaustedError(CodeliciousError):
    """Raised when the LLM call budget or cost ceiling is exceeded."""

    def __init__(self, message: str, calls_made: int = 0) -> None:
        super().__init__(message)
        self.calls_made = calls_made


class BuildTimeoutError(CodeliciousError):
    """Raised when a build exceeds the maximum allowed wall-clock time."""


class AgentTimeout(CodeliciousError):
    """Raised when a Claude Code agent subprocess exceeds its time limit."""

    def __init__(self, message: str, elapsed_s: float = 0.0) -> None:
        super().__init__(message)
        self.elapsed_s = elapsed_s


class ClaudeAuthError(CodeliciousError):
    """Raised when the claude CLI binary is missing or authentication fails."""


class ClaudeRateLimitError(CodeliciousError):
    """Raised when the Claude CLI hits an API rate limit."""

    def __init__(self, message: str, retry_after_s: float = 60.0) -> None:
        super().__init__(message)
        self.retry_after_s = retry_after_s


class IntentRejectedError(CodeliciousError):
    """Raised when the intent classifier determines the spec is not legitimate."""


class PolicyViolationError(CodeliciousError):
    """Raised when a policybind policy check blocks an LLM call."""


# ---------------------------------------------------------------------------
# Git / PR errors
# ---------------------------------------------------------------------------


class GitOperationError(CodeliciousError):
    """Raised when a git subprocess operation (commit, push, branch) fails."""


class PRCreationError(CodeliciousError):
    """Raised when PR/MR creation via gh or glab fails."""


class CICheckError(CodeliciousError):
    """Raised when CI/CD check polling fails or times out."""


# ---------------------------------------------------------------------------
# Warnings
# ---------------------------------------------------------------------------


class PromptInjectionWarning(UserWarning):
    """Warning issued when potential prompt injection is detected."""
