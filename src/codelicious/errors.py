"""Defines all custom exception classes for the proxilion-build project."""

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
    "LLMTimeoutError",
    "LoopError",
    "PRCreationError",
    "ParseError",
    "PathTraversalError",
    "PatienceExhaustedError",
    "PlanningError",
    "PolicyViolationError",
    "PromptInjectionWarning",
    "ProxilionBuildError",
    "ReplanningError",
    "SandboxViolationError",
    "SpecFileNotFoundError",
    "UnsafePathError",
    "VerificationError",
]

# ---------------------------------------------------------------------------
# Base
# ---------------------------------------------------------------------------


class ProxilionBuildError(Exception):
    """Base exception for all proxilion-build errors."""

    def __init__(self, message: str, *, path: str | None = None) -> None:
        super().__init__(message)
        self.message: str = message
        self.path: str | None = path


# ---------------------------------------------------------------------------
# Parser errors
# ---------------------------------------------------------------------------


class SpecFileNotFoundError(ProxilionBuildError):
    """Raised when the spec file does not exist."""


class FileReadError(ProxilionBuildError):
    """Raised when a file cannot be read."""


class FileTooLargeError(ProxilionBuildError):
    """Raised when a file exceeds the maximum allowed size."""


class FileEncodingError(ProxilionBuildError):
    """Raised when a file cannot be decoded as UTF-8."""


class EmptySpecError(ProxilionBuildError):
    """Raised when the spec file is empty or contains only whitespace."""


class ParseError(ProxilionBuildError):
    """Raised when the spec file cannot be parsed."""


# ---------------------------------------------------------------------------
# Planner errors
# ---------------------------------------------------------------------------


class PlanningError(ProxilionBuildError):
    """Raised when the planner fails to generate a plan."""


class InvalidPlanError(ProxilionBuildError):
    """Raised when a generated plan is structurally invalid."""


# ---------------------------------------------------------------------------
# LLM client errors
# ---------------------------------------------------------------------------


class LLMClientError(ProxilionBuildError):
    """Base exception for LLM client errors."""


class LLMAuthenticationError(LLMClientError):
    """Raised when LLM authentication fails."""


class LLMRateLimitError(LLMClientError):
    """Raised when the LLM rate limit is exceeded."""


class LLMTimeoutError(LLMClientError):
    """Raised when an LLM request times out."""


class LLMResponseError(LLMClientError):
    """Raised when the LLM response is malformed or unusable."""


class LLMProviderError(LLMClientError):
    """Raised when the LLM provider returns a server error."""


class APIKeyMissingError(LLMClientError):
    """Raised when the required API key is not configured."""


# ---------------------------------------------------------------------------
# Context manager errors
# ---------------------------------------------------------------------------


class ContextBudgetError(ProxilionBuildError):
    """Raised when the prompt exceeds the context window budget."""


# ---------------------------------------------------------------------------
# Executor errors
# ---------------------------------------------------------------------------


class ExecutionError(ProxilionBuildError):
    """Raised when code execution fails."""


class FileWriteError(ProxilionBuildError):
    """Raised when a file cannot be written."""


class UnsafePathError(ProxilionBuildError):
    """Raised when a file path is deemed unsafe."""


# ---------------------------------------------------------------------------
# Verifier errors
# ---------------------------------------------------------------------------


class VerificationError(ProxilionBuildError):
    """Raised when verification checks fail."""


# ---------------------------------------------------------------------------
# Loop controller errors
# ---------------------------------------------------------------------------


class LoopError(ProxilionBuildError):
    """Raised for general loop controller failures."""


class PatienceExhaustedError(ProxilionBuildError):
    """Raised when the maximum number of retries is exceeded."""


class ReplanningError(ProxilionBuildError):
    """Raised when mid-loop re-planning fails."""


class ConcurrentBuildError(ProxilionBuildError):
    """Raised when another proxilion-build instance is already running in the same project."""


# ---------------------------------------------------------------------------
# Sandbox errors
# ---------------------------------------------------------------------------


class SandboxViolationError(ProxilionBuildError):
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


class BudgetExhaustedError(ProxilionBuildError):
    """Raised when the LLM call budget or cost ceiling is exceeded."""

    def __init__(self, message: str, calls_made: int = 0) -> None:
        super().__init__(message)
        self.calls_made = calls_made


class BuildTimeoutError(ProxilionBuildError):
    """Raised when a build exceeds the maximum allowed wall-clock time."""


class AgentTimeout(ProxilionBuildError):
    """Raised when a Claude Code agent subprocess exceeds its time limit."""

    def __init__(self, message: str, elapsed_s: float = 0.0) -> None:
        super().__init__(message)
        self.elapsed_s = elapsed_s


class ClaudeAuthError(ProxilionBuildError):
    """Raised when the claude CLI binary is missing or authentication fails."""


class ClaudeRateLimitError(ProxilionBuildError):
    """Raised when the Claude CLI hits an API rate limit."""

    def __init__(self, message: str, retry_after_s: float = 60.0) -> None:
        super().__init__(message)
        self.retry_after_s = retry_after_s


class IntentRejectedError(ProxilionBuildError):
    """Raised when the intent classifier determines the spec is not legitimate."""


class PolicyViolationError(ProxilionBuildError):
    """Raised when a policybind policy check blocks an LLM call."""


# ---------------------------------------------------------------------------
# Git / PR errors
# ---------------------------------------------------------------------------


class GitOperationError(ProxilionBuildError):
    """Raised when a git subprocess operation (commit, push, branch) fails."""


class PRCreationError(ProxilionBuildError):
    """Raised when PR/MR creation via gh or glab fails."""


class CICheckError(ProxilionBuildError):
    """Raised when CI/CD check polling fails or times out."""


# ---------------------------------------------------------------------------
# Warnings
# ---------------------------------------------------------------------------


class PromptInjectionWarning(UserWarning):
    """Warning issued when potential prompt injection is detected."""
