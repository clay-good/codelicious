"""Subprocess management for the Claude Code CLI in agent mode.

This module is the single point of contact with the ``claude`` binary for
agent-mode invocations. It builds the subprocess command, launches the
process, drains stdout line-by-line in real time, drains stderr in a
background thread to prevent pipe buffer deadlock, enforces a timeout,
and parses stream-json events to extract the session ID and display
assistant output.
"""

from __future__ import annotations

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
)

__all__ = ["AgentResult", "run_agent"]

# Timeout constants
_SIGTERM_GRACE_S: int = 5  # Seconds to wait after SIGTERM before SIGKILL
_THREAD_JOIN_TIMEOUT_S: int = 10  # Seconds to wait for background threads to exit
_STDERR_SUMMARY_INTERVAL_S: float = 60.0  # Seconds between stderr summary log lines
_FINAL_WAIT_TIMEOUT_S: int = 30  # Seconds for final proc.wait() after loop

logger = logging.getLogger("codelicious.agent_runner")


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
        "--dangerously-skip-permissions",
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

    cmd.extend(["-p", prompt])

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

    if "auth" in stderr_lower:
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
            stderr_text[:500],
        )
        raise ClaudeRateLimitError(
            f"Claude CLI rate limited (exit code {returncode}): {(stderr_text + stdout_text)[-500:]}",
            retry_after_s=60.0,
        )

    logger.warning(
        "Agent failed: exit_code=%d, stderr=%.500s",
        returncode,
        stderr_text[:500],
    )
    raise CodeliciousError(f"Claude CLI exited with code {returncode}: {stderr_text[-500:]}")


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
    logger.debug("Full command: %s", " ".join(cmd))

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

    def _drain_stderr() -> None:
        assert proc.stderr is not None
        try:
            for line in proc.stderr:
                stderr_lines.append(line)
        except (OSError, ValueError):
            pass  # Pipe closed or subprocess terminated
        logger.debug("stderr drainer: collected %d lines", len(stderr_lines))

    def _drain_stdout() -> None:
        assert proc.stdout is not None
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

    output_lines: list[str] = []
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
                new_lines = len(stderr_lines) - _last_stderr_count
                if new_lines > 0:
                    last_line = stderr_lines[-1].strip()[:200]
                    logger.info(
                        "Agent stderr summary: %d new lines. Last: %s",
                        new_lines,
                        last_line,
                    )
                _last_stderr_count = len(stderr_lines)
                _last_stderr_check = time.monotonic()

            # Wait for line with short timeout to allow periodic timeout checks
            try:
                line = stdout_queue.get(timeout=1.0)
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
        if stderr_thread.is_alive():
            logger.warning("stderr drainer thread did not exit within 10s (daemon, will be cleaned up)")
        stdout_thread.join(timeout=_THREAD_JOIN_TIMEOUT_S)
        if stdout_thread.is_alive():
            logger.warning("stdout drainer thread did not exit within 10s (daemon, will be cleaned up)")

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

    # Parse output and check for errors using helper
    result = _parse_agent_output(output_lines, stderr_lines, proc.returncode)
    result.elapsed_s = elapsed_s

    # session_id is already extracted by _parse_agent_output, but we may have
    # extracted it earlier in the loop for logging. Use whichever we found.
    if session_id and not result.session_id:
        result.session_id = session_id

    return result


def _process_stream_event(event: dict) -> tuple[str, str]:
    """Process a single stream-json event.

    Returns (session_id, display_text). Either or both may be empty.
    """
    session_id = ""
    display = ""

    event_type = event.get("type", "")
    logger.debug("Stream event: type=%s", event_type)

    # Extract session ID from system init event
    if event_type == "system" and event.get("subtype") == "init":
        session_id = event.get("session_id", "")

    # Extract assistant text and tool use from assistant events
    if event_type == "assistant":
        message = event.get("message", {})
        content = message.get("content", [])
        parts = []
        for block in content:
            if isinstance(block, dict):
                if block.get("type") == "text":
                    parts.append(block.get("text", ""))
                elif block.get("type") == "tool_use":
                    tool_name = block.get("name", "unknown")
                    parts.append(f"[tool_use: {tool_name}]")
        display = "\n".join(parts)

    return session_id, display
