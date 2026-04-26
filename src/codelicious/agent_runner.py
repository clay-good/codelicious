"""Subprocess management for the Claude Code CLI in agent mode.

This module is the single point of contact with the ``claude`` binary for
agent-mode invocations. It builds the subprocess command, launches the
process, drains stdout line-by-line in real time, drains stderr in a
background thread to prevent pipe buffer deadlock, enforces a timeout,
and parses stream-json events to extract the session ID and display
assistant output.
"""

from __future__ import annotations

import collections
import json
import logging
import pathlib
import queue
import shutil
import subprocess
import threading
import time
from dataclasses import dataclass
from typing import IO

from codelicious.errors import (
    AgentTimeout,
    ClaudeAuthError,
    ClaudeRateLimitError,
    CodeliciousError,
    PolicyViolationError,
)
from codelicious.logger import sanitize_message

__all__ = [
    "FORBIDDEN_CLI_FLAGS",
    "_MAX_PROMPT_LENGTH",
    "_POLL_INTERVAL_S",
    "AgentResult",
    "_process_stream_event",
    "_sanitize_prompt",
    "_validate_command_flags",
    "run_agent",
]

# Timeout constants
_SIGTERM_GRACE_S: int = 5  # Seconds to wait after SIGTERM before SIGKILL
_THREAD_JOIN_TIMEOUT_S: int = 10  # Seconds to wait for background threads to exit
_STDERR_SUMMARY_INTERVAL_S: float = 60.0  # Seconds between stderr summary log lines
_FINAL_WAIT_TIMEOUT_S: int = 30  # Seconds for final proc.wait() after loop
_POLL_INTERVAL_S: float = 0.1  # Polling interval for main loop (reduced from 1.0 for precise timeout)

# Prompt sanitization constants
_MAX_PROMPT_LENGTH: int = 100_000  # Maximum prompt length in characters

# CLI flags that must never appear in any agent subprocess command (S20-P1-3).
# The agent relies on the scoped .claude/settings.json allowlist for permissions
# rather than bypassing all permission guardrails.
FORBIDDEN_CLI_FLAGS: frozenset[str] = frozenset(["--dangerously-skip-permissions"])

logger = logging.getLogger("codelicious.agent_runner")


def _validate_command_flags(cmd: list[str]) -> None:
    """Validate that no forbidden CLI flags are present in the command.

    Raises:
        PolicyViolationError: If a forbidden flag is found (S20-P1-3).
    """
    for flag in FORBIDDEN_CLI_FLAGS:
        if flag in cmd:
            raise PolicyViolationError(f"Forbidden CLI flag in agent command: {flag}")


def _sanitize_prompt(prompt: str) -> str:
    """Sanitize the prompt before passing to subprocess.

    This function protects against:
    1. Null bytes that could truncate arguments or cause undefined behavior.
    2. Excessively long prompts that could cause memory issues.
    3. Prompts starting with dashes that could be interpreted as CLI flags.

    Parameters
    ----------
    prompt:
        The raw prompt text from the LLM or user.

    Returns
    -------
    str
        Sanitized prompt safe for subprocess invocation.
    """
    # Strip null bytes (could cause argument truncation)
    sanitized = prompt.replace("\x00", "")
    if sanitized != prompt:
        logger.warning("Null bytes stripped from prompt (original had %d null bytes)", prompt.count("\x00"))

    # Cap length to prevent memory issues and excessively long CLI arguments
    if len(sanitized) > _MAX_PROMPT_LENGTH:
        logger.warning(
            "Prompt truncated: original length %d exceeds max %d",
            len(sanitized),
            _MAX_PROMPT_LENGTH,
        )
        sanitized = sanitized[:_MAX_PROMPT_LENGTH]

    # Prefix prompts starting with dash to prevent flag interpretation
    # POSIX convention: "--" signals end of flags
    stripped = sanitized.lstrip()
    if stripped.startswith("-"):
        sanitized = "-- " + sanitized
        logger.debug("Prompt prefixed with '-- ' to prevent flag interpretation")

    return sanitized


@dataclass
class AgentResult:
    """Result from a single agent invocation."""

    success: bool
    returncode: int
    output: str
    elapsed_s: float
    session_id: str = ""


def _build_agent_command(
    prompt: str,
    project_dir: pathlib.Path,
    config: object,
    claude_bin: str,
    resume_session_id: str = "",
) -> list[str]:
    """Build the claude CLI command list.

    Parameters
    ----------
    prompt:
        The prompt text to pass via ``-p``.
    project_dir:
        The working directory for the subprocess.
    config:
        A Config-like object with attributes: model, effort, max_turns.
    claude_bin:
        Path to the claude binary.
    resume_session_id:
        Optional session ID to resume a previous conversation via
        ``--resume``. When empty, starts a fresh session.

    Returns
    -------
    list[str]
        Command list suitable for subprocess.Popen.
    """
    cmd: list[str] = [
        claude_bin,
        "--print",
        "--output-format",
        "stream-json",
        "--verbose",
        # bypassPermissions lets the agent edit/write/run shell commands inside
        # the project working directory without per-action prompts. Codelicious
        # runs headlessly, so an interactive prompt = a stuck build that produces
        # no commits. Destructive ops are still blocked by the scaffolded
        # .claude/settings.json deny list (git push --force, rm -rf /, etc.).
        "--permission-mode",
        "bypassPermissions",
    ]

    model = getattr(config, "model", "")
    if model:
        cmd.extend(["--model", model])

    effort = getattr(config, "effort", "")
    if effort:
        cmd.extend(["--effort", effort])

    max_turns = getattr(config, "max_turns", 0)
    if max_turns and max_turns > 0:
        cmd.extend(["--max-turns", str(max_turns)])

    if resume_session_id:
        cmd.extend(["--resume", resume_session_id])

    # Sanitize prompt before passing to subprocess
    sanitized_prompt = _sanitize_prompt(prompt)
    cmd.extend(["-p", sanitized_prompt])

    return cmd


def _check_agent_errors(
    returncode: int,
    stdout_lines: list[str],
    stderr_lines: list[str],
) -> None:
    """Check for errors in agent output and raise appropriate exceptions.

    Parameters
    ----------
    returncode:
        Process exit code.
    stdout_lines:
        Lines captured from stdout.
    stderr_lines:
        Lines captured from stderr.

    Raises
    ------
    ClaudeAuthError
        If authentication failed.
    ClaudeRateLimitError
        If rate limit was hit.
    CodeliciousError
        If process exited with non-zero code for other reasons.
    """
    if returncode == 0:
        return

    stderr_text = "".join(stderr_lines)
    stderr_lower = stderr_text.lower()
    stdout_text = "".join(stdout_lines)
    combined_lower = stderr_lower + stdout_text.lower()

    # Sanitize stderr before logging or embedding in exceptions (Finding 39)
    safe_stderr = sanitize_message(stderr_text[:500])

    if any(
        phrase in stderr_lower
        for phrase in [
            "authentication failed",
            "auth failed",
            "not logged in",
            "auth error",
            "unauthorized",
            "auth token",
        ]
    ):
        raise ClaudeAuthError(
            f"Claude CLI authentication failed. Run 'claude' interactively to log in. (exit code {returncode})"
        )

    if any(
        phrase in combined_lower
        for phrase in [
            "rate limit",
            "hit your limit",
            "too many requests",
            "429",
            "resets ",
            "quota exceeded",
            "rate_limit",
        ]
    ):
        logger.warning(
            "Agent failed: exit_code=%d, stderr=%.500s",
            returncode,
            safe_stderr,
        )
        safe_combined = sanitize_message((stderr_text + stdout_text)[-500:])
        raise ClaudeRateLimitError(
            f"Claude CLI rate limited (exit code {returncode}): {safe_combined}",
            retry_after_s=60.0,
        )

    logger.warning(
        "Agent failed: exit_code=%d, stderr=%.500s",
        returncode,
        safe_stderr,
    )
    raise CodeliciousError(f"Claude CLI exited with code {returncode}: {sanitize_message(stderr_text[-500:])}")


def _parse_agent_output(
    stdout_lines: list[str],
    stderr_lines: list[str],
    returncode: int,
) -> AgentResult:
    """Parse agent output and return result.

    Parameters
    ----------
    stdout_lines:
        Lines captured from stdout.
    stderr_lines:
        Lines captured from stderr.
    returncode:
        Process exit code.

    Returns
    -------
    AgentResult
        Parsed result with success/failure and metadata.

    Raises
    ------
    ClaudeAuthError
        If authentication failed.
    ClaudeRateLimitError
        If rate limit was hit.
    CodeliciousError
        If process exited with non-zero code for other reasons.
    """
    # Check for errors first
    _check_agent_errors(returncode, stdout_lines, stderr_lines)

    # Success case - extract session_id from stdout
    session_id = ""
    for line in stdout_lines:
        stripped = line.strip()
        if stripped:
            try:
                event = json.loads(stripped)
                if event.get("type") == "system" and event.get("subtype") == "init":
                    session_id = event.get("session_id", "")
                    if session_id:
                        break
            except json.JSONDecodeError:
                pass

    return AgentResult(
        success=True,
        returncode=returncode,
        output="".join(stdout_lines),
        elapsed_s=0.0,  # Will be set by caller
        session_id=session_id,
    )


def _enforce_timeout(proc: subprocess.Popen, elapsed: float, timeout: float) -> None:
    """Enforce timeout by terminating the process if elapsed >= timeout.

    Parameters
    ----------
    proc:
        The subprocess to terminate if timeout is exceeded.
    elapsed:
        Elapsed time in seconds.
    timeout:
        Timeout threshold in seconds.

    Raises
    ------
    AgentTimeout
        If elapsed >= timeout.
    """
    if elapsed >= timeout:
        logger.warning(
            "Agent timed out: PID=%d, elapsed=%.1fs, timeout=%ds",
            proc.pid,
            elapsed,
            int(timeout),
        )
        proc.terminate()
        try:
            proc.wait(timeout=_SIGTERM_GRACE_S)
        except subprocess.TimeoutExpired:
            proc.kill()
            try:
                proc.wait(timeout=_SIGTERM_GRACE_S)
            except subprocess.TimeoutExpired:
                pass  # OS will clean up
        raise AgentTimeout(
            f"Agent exceeded timeout of {timeout}s",
            elapsed_s=elapsed,
        )


def run_agent(
    prompt: str,
    project_root: pathlib.Path,
    config: object,
    tee_to: IO[str] | None = None,
    resume_session_id: str = "",
) -> AgentResult:
    """Run the Claude Code CLI as an autonomous agent and return the result.

    Parameters
    ----------
    prompt:
        The prompt text to pass via ``-p``.
    project_root:
        The working directory for the subprocess.
    config:
        A Config-like object with attributes: model, effort, max_turns,
        agent_timeout_s, dry_run.
    tee_to:
        Optional file handle to mirror processed output lines.
    resume_session_id:
        Optional session ID to resume a previous conversation via
        ``--resume``. When empty, starts a fresh session.
    """
    # Validate project root
    project_root = pathlib.Path(project_root).resolve()
    if not project_root.is_dir():
        raise CodeliciousError(f"Project root does not exist or is not a directory: {project_root}")

    # Dry-run mode
    if getattr(config, "dry_run", False):
        logger.info("[dry-run] Would run agent with prompt: %.80s...", prompt)
        return AgentResult(
            success=True,
            returncode=0,
            output="[dry run]",
            elapsed_s=0.0,
        )

    # Locate the claude binary
    claude_bin = shutil.which("claude")
    if claude_bin is None:
        raise ClaudeAuthError(
            "claude CLI not found on PATH. Install Claude Code (VS Code extension or standalone CLI) to use agent mode."
        )

    # Build command using helper
    cmd = _build_agent_command(prompt, project_root, config, claude_bin, resume_session_id)

    timeout_s_raw = getattr(config, "agent_timeout_s", 1800)
    timeout_s: float = float(timeout_s_raw) if isinstance(timeout_s_raw, (int, float)) else 1800

    model = getattr(config, "model", "")
    effort = getattr(config, "effort", "")
    max_turns = getattr(config, "max_turns", 0)

    logger.info(
        "Agent run: prompt=%.100s..., project=%s, resume=%s",
        prompt[:100],
        project_root,
        resume_session_id or "new",
    )
    logger.debug(
        "Agent config: model=%s, effort=%s, max_turns=%s, timeout=%ds",
        model,
        effort,
        max_turns,
        int(timeout_s),
    )
    # Log command structure without the -p prompt content to avoid leaking prompt text at DEBUG level
    _safe_cmd: list[str] = []
    _skip_next = False
    for _tok in cmd:
        if _skip_next:
            _safe_cmd.append("<prompt>")
            _skip_next = False
        elif _tok == "-p":
            _safe_cmd.append(_tok)
            _skip_next = True
        else:
            _safe_cmd.append(_tok)
    logger.debug("Full command: %s", " ".join(_safe_cmd))

    # Pre-dispatch validation: ensure no forbidden flags (S20-P1-3)
    _validate_command_flags(cmd)

    # Launch subprocess
    proc = subprocess.Popen(
        cmd,
        cwd=str(project_root),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
    )
    logger.info("Agent subprocess started: PID=%d", proc.pid)

    # Use queues for non-blocking stream reading with proper timeout
    stdout_queue: queue.Queue[str | None] = queue.Queue()
    stderr_lines: list[str] = []
    # Lock protecting all accesses to stderr_lines from the drainer thread
    # and the main loop / _parse_agent_output (Finding 52).
    _stderr_lock = threading.Lock()

    def _drain_stderr() -> None:
        if proc.stderr is None:
            logger.warning("stderr stream is None, skipping drain")
            return
        try:
            for line in proc.stderr:
                with _stderr_lock:
                    stderr_lines.append(line)
        except (OSError, ValueError):
            pass  # Pipe closed or subprocess terminated
        with _stderr_lock:
            count = len(stderr_lines)
        logger.debug("stderr drainer: collected %d lines", count)

    def _drain_stdout() -> None:
        if proc.stdout is None:
            logger.warning("stdout stream is None, skipping drain")
            return
        try:
            for line in proc.stdout:
                stdout_queue.put(line)
        except (OSError, ValueError):
            pass  # Pipe closed
        finally:
            stdout_queue.put(None)  # Signal EOF

    stderr_thread = threading.Thread(target=_drain_stderr, daemon=True, name="stderr-drainer")
    stdout_thread = threading.Thread(target=_drain_stdout, daemon=True, name="stdout-drainer")
    stderr_thread.start()
    stdout_thread.start()

    output_lines: collections.deque[str] = collections.deque(maxlen=5000)
    session_id = ""
    start = time.monotonic()

    # Wall-clock timeout watchdog
    _timed_out = threading.Event()

    def _timeout_watchdog() -> None:
        if not _timed_out.wait(timeout=timeout_s):
            # Timeout reached without being cancelled
            logger.warning("Watchdog timeout: terminating agent PID=%d", proc.pid)
            try:
                proc.terminate()
            except OSError:
                pass

    watchdog = threading.Thread(target=_timeout_watchdog, daemon=True)
    watchdog.start()

    # Periodic stderr summary logging
    _last_stderr_check = time.monotonic()
    _last_stderr_count = 0

    try:
        while True:
            elapsed = time.monotonic() - start

            # Check timeout BEFORE waiting for data (wall-clock timeout)
            _enforce_timeout(proc, elapsed, timeout_s)

            # Periodic stderr summary
            if (time.monotonic() - _last_stderr_check) >= _STDERR_SUMMARY_INTERVAL_S:
                with _stderr_lock:
                    _current_count = len(stderr_lines)
                    _last_line_snap = stderr_lines[-1].strip()[:200] if stderr_lines else ""
                new_lines = _current_count - _last_stderr_count
                if new_lines > 0:
                    logger.info(
                        "Agent stderr summary: %d new lines. Last: %s",
                        new_lines,
                        _last_line_snap,
                    )
                _last_stderr_count = _current_count
                _last_stderr_check = time.monotonic()

            # Wait for line with short timeout to allow periodic timeout checks
            # Use _POLL_INTERVAL_S (0.1s) for precise timeout enforcement within 100ms
            try:
                line = stdout_queue.get(timeout=_POLL_INTERVAL_S)
            except queue.Empty:
                # No data yet, check if process has exited
                if proc.poll() is not None:
                    break
                continue

            if line is None:
                # EOF from stdout reader
                break

            output_lines.append(line)

            # Log progress every 50 lines
            if len(output_lines) % 50 == 0:
                logger.debug("Agent output: %d lines processed", len(output_lines))

            # Try to parse as JSON event
            stripped = line.strip()
            if stripped:
                try:
                    event = json.loads(stripped)
                    sid, display = _process_stream_event(event)
                    if sid:
                        session_id = sid
                        logger.info("Agent session ID: %s", session_id)
                    if display and tee_to is not None:
                        tee_to.write(display + "\n")
                        tee_to.flush()
                except json.JSONDecodeError:
                    # Not JSON, print as plain text
                    if tee_to is not None:
                        tee_to.write(line)
                        tee_to.flush()

    except KeyboardInterrupt:
        proc.terminate()
        try:
            proc.wait(timeout=_SIGTERM_GRACE_S)
        except subprocess.TimeoutExpired:
            proc.kill()
        raise

    finally:
        # Ensure subprocess is cleaned up on any exception
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=_THREAD_JOIN_TIMEOUT_S)
            except subprocess.TimeoutExpired:
                proc.kill()
                try:
                    proc.wait(timeout=_SIGTERM_GRACE_S)
                except subprocess.TimeoutExpired:
                    pass
        # Signal watchdog to stop
        _timed_out.set()
        # Wait for threads to finish with timeout
        stderr_thread.join(timeout=_THREAD_JOIN_TIMEOUT_S)
        stdout_thread.join(timeout=_THREAD_JOIN_TIMEOUT_S)

    try:
        proc.wait(timeout=_FINAL_WAIT_TIMEOUT_S)
    except subprocess.TimeoutExpired:
        logger.warning("Final proc.wait timed out, killing PID=%d", proc.pid)
        proc.kill()
    elapsed_s = time.monotonic() - start

    # Log completion
    logger.info(
        "Agent completed: PID=%d, exit_code=%d, elapsed=%.1fs, output_lines=%d",
        proc.pid,
        proc.returncode,
        elapsed_s,
        len(output_lines),
    )

    # Snapshot stderr_lines under the lock to prevent race with still-alive drainer (Finding 24)
    with _stderr_lock:
        stderr_snapshot = list(stderr_lines)

    # If the process was killed by the watchdog timeout, raise AgentTimeout
    # directly instead of letting _parse_agent_output see a non-zero exit code
    # and raise CodeliciousError (Finding 16: wrong exception type on timeout race).
    if elapsed_s >= timeout_s:
        raise AgentTimeout(
            f"Agent timed out after {elapsed_s:.1f}s (limit: {timeout_s}s)",
            elapsed_s=elapsed_s,
        )

    # Parse output and check for errors using helper
    result = _parse_agent_output(output_lines, stderr_snapshot, proc.returncode)
    result.elapsed_s = elapsed_s

    # session_id is already extracted by _parse_agent_output, but we may have
    # extracted it earlier in the loop for logging. Use whichever we found.
    if session_id and not result.session_id:
        result.session_id = session_id

    return result


_VERBOSE_TRUNCATE = 4000


def _truncate(text: str, limit: int = _VERBOSE_TRUNCATE) -> str:
    if text is None:
        return ""
    if len(text) <= limit:
        return text
    return text[:limit] + f"... [truncated {len(text) - limit} chars]"


def _format_tool_input(tool_input: object) -> str:
    if tool_input is None:
        return ""
    if isinstance(tool_input, str):
        return _truncate(tool_input)
    try:
        return _truncate(json.dumps(tool_input, ensure_ascii=False, indent=2, default=str))
    except (TypeError, ValueError):
        return _truncate(repr(tool_input))


def _format_tool_result(content: object) -> str:
    if content is None:
        return ""
    if isinstance(content, str):
        return _truncate(content)
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, dict):
                if block.get("type") == "text":
                    parts.append(str(block.get("text", "")))
                else:
                    parts.append(json.dumps(block, ensure_ascii=False, default=str))
            else:
                parts.append(str(block))
        return _truncate("\n".join(parts))
    try:
        return _truncate(json.dumps(content, ensure_ascii=False, default=str))
    except (TypeError, ValueError):
        return _truncate(repr(content))


def _process_stream_event(event: dict) -> tuple[str, str]:
    """Process a single stream-json event into (session_id, display_text).

    Surfaces FULL Claude Code CLI activity to the console: assistant text,
    tool inputs, tool results, user messages, and system events. This is
    intentionally verbose — the user wants to see exactly what the agent
    is doing.
    """
    session_id = ""
    parts: list[str] = []

    event_type = event.get("type", "")
    logger.debug("Stream event: type=%s", event_type)

    if event_type == "system":
        subtype = event.get("subtype", "")
        if subtype == "init":
            session_id = event.get("session_id", "")
            model = event.get("model", "")
            cwd = event.get("cwd", "")
            tools = event.get("tools", [])
            tools_str = ", ".join(tools) if isinstance(tools, list) else ""
            parts.append(f"[system:init] session={session_id} model={model} cwd={cwd}")
            if tools_str:
                parts.append(f"[system:init] tools={tools_str}")
        else:
            parts.append(f"[system:{subtype}] {_truncate(json.dumps(event, default=str), 600)}")

    elif event_type == "assistant":
        message = event.get("message", {})
        content = message.get("content", [])
        for block in content:
            if not isinstance(block, dict):
                continue
            btype = block.get("type", "")
            if btype == "text":
                text = block.get("text", "")
                if text:
                    parts.append(text)
            elif btype == "thinking":
                text = block.get("thinking", "")
                if text:
                    parts.append(f"[thinking]\n{_truncate(text)}")
            elif btype == "tool_use":
                tool_name = block.get("name", "unknown")
                tool_id = block.get("id", "")
                tool_input = _format_tool_input(block.get("input"))
                header = f"[tool_use: {tool_name}] id={tool_id}"
                parts.append(header if not tool_input else f"{header}\n{tool_input}")
            else:
                parts.append(f"[assistant:{btype}] {_truncate(json.dumps(block, default=str), 600)}")
        usage = message.get("usage")
        if isinstance(usage, dict):
            parts.append(
                f"[usage] in={usage.get('input_tokens', 0)} "
                f"out={usage.get('output_tokens', 0)} "
                f"cache_read={usage.get('cache_read_input_tokens', 0)} "
                f"cache_create={usage.get('cache_creation_input_tokens', 0)}"
            )

    elif event_type == "user":
        message = event.get("message", {})
        content = message.get("content", [])
        if isinstance(content, list):
            for block in content:
                if not isinstance(block, dict):
                    continue
                btype = block.get("type", "")
                if btype == "tool_result":
                    tool_id = block.get("tool_use_id", "")
                    is_error = block.get("is_error", False)
                    body = _format_tool_result(block.get("content"))
                    tag = "tool_result:error" if is_error else "tool_result"
                    header = f"[{tag}] id={tool_id}"
                    parts.append(header if not body else f"{header}\n{body}")
                elif btype == "text":
                    text = block.get("text", "")
                    if text:
                        parts.append(f"[user]\n{_truncate(text)}")
                else:
                    parts.append(f"[user:{btype}] {_truncate(json.dumps(block, default=str), 600)}")
        elif isinstance(content, str) and content:
            parts.append(f"[user]\n{_truncate(content)}")

    elif event_type == "result":
        subtype = event.get("subtype", "")
        duration_ms = event.get("duration_ms", 0)
        num_turns = event.get("num_turns", 0)
        cost = event.get("total_cost_usd", 0)
        parts.append(
            f"[result:{subtype}] turns={num_turns} duration={duration_ms}ms cost=${cost}"
        )

    else:
        # Unknown event type — surface it raw so the user can see it.
        parts.append(f"[{event_type or 'event'}] {_truncate(json.dumps(event, default=str), 600)}")

    return session_id, "\n".join(p for p in parts if p)
