from __future__ import annotations

import ipaddress
import json
import os
import socket
import ssl
import time
import urllib.parse
import urllib.request
import urllib.error
import logging
from typing import List, Dict, Any

from codelicious.errors import ConfigurationError
from codelicious.logger import sanitize_message

logger = logging.getLogger("codelicious.llm")

# Default models on SambaNova via HuggingFace Router
# DeepSeek-V3: best open-weight model for planning, orchestration, tool use
# Qwen3-235B: largest available Qwen3 MoE — strongest open-weight coder
_DEFAULT_PLANNER_MODEL = "DeepSeek-V3-0324"
_DEFAULT_CODER_MODEL = "Qwen3-235B"
_DEFAULT_ENDPOINT = "https://router.huggingface.co/sambanova/v1/chat/completions"


# Known-good endpoint base URLs that bypass DNS resolution checks (S20-P1-1)
_ALLOWED_ENDPOINT_BASES: frozenset[str] = frozenset(
    {
        "https://router.huggingface.co/",
        "https://api-inference.huggingface.co/",
    }
)


def _validate_endpoint_url(url: str) -> None:
    """Validate the LLM endpoint URL against SSRF risk (S20-P1-1).

    Rules:
    - Only HTTPS is accepted.
    - Known-good endpoints (allowlisted) skip DNS resolution checks.
    - For other endpoints, the hostname is resolved and checked against
      private (RFC-1918), loopback, and link-local IP ranges.

    Raises:
        ConfigurationError: If the URL fails validation.
    """
    try:
        parsed = urllib.parse.urlparse(url)
    except Exception as exc:
        raise ConfigurationError(f"Unparseable LLM endpoint URL: {url!r}") from exc

    scheme = parsed.scheme.lower()
    if scheme != "https":
        raise ConfigurationError(f"Insecure LLM endpoint scheme: {scheme!r} in {url!r}. Only HTTPS URLs are permitted.")

    # Known-good endpoints bypass DNS resolution checks
    if any(url.startswith(base) for base in _ALLOWED_ENDPOINT_BASES):
        return

    hostname = parsed.hostname
    if not hostname:
        raise ConfigurationError(f"LLM endpoint URL has no hostname: {url!r}")

    # Resolve hostname to IP addresses and check each one
    try:
        addrinfo = socket.getaddrinfo(hostname, None)
    except socket.gaierror as exc:
        raise ConfigurationError(f"Cannot resolve LLM endpoint hostname: {hostname!r}") from exc

    for _family, _type, _proto, _canonname, sockaddr in addrinfo:
        ip_str = sockaddr[0]
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError:
            continue

        if ip.is_loopback:
            raise ConfigurationError(
                f"LLM endpoint resolves to loopback address: {hostname} -> {ip}. "
                "Only public HTTPS endpoints are permitted."
            )
        if ip.is_link_local:
            raise ConfigurationError(
                f"LLM endpoint resolves to link-local address: {hostname} -> {ip}. "
                "Only public HTTPS endpoints are permitted."
            )
        if ip.is_private:
            raise ConfigurationError(
                f"LLM endpoint resolves to private IP address: {hostname} -> {ip}. "
                "Only public HTTPS endpoints are permitted."
            )


class LLMClient:
    """
    Zero-dependency HTTP client for HuggingFace Inference API.

    Supports dual-model architecture:
      - Planner model (DeepSeek-V3): finds specs, plans tasks, orchestrates
      - Coder model (Qwen3-32B): writes and modifies code

    Both use the same endpoint and API key. The caller chooses which model
    to use per-request via the model_override parameter.
    """

    def __init__(
        self,
        endpoint_url: str = None,
        api_key: str = None,
        planner_model: str = None,
        coder_model: str = None,
    ):
        self.api_key = api_key or os.environ.get("LLM_API_KEY", "") or os.environ.get("HF_TOKEN", "")
        self.planner_model = planner_model or os.environ.get("MODEL_PLANNER", _DEFAULT_PLANNER_MODEL)
        self.coder_model = coder_model or os.environ.get("MODEL_CODER", _DEFAULT_CODER_MODEL)

        # HuggingFace Router — SambaNova provider (fast, free tier)
        # Override with LLM_ENDPOINT env var for other providers:
        #   Together:  https://router.huggingface.co/together/v1/chat/completions
        #   SambaNova: https://router.huggingface.co/sambanova/v1/chat/completions
        self.endpoint_url = endpoint_url or os.environ.get("LLM_ENDPOINT", _DEFAULT_ENDPOINT)

        # Validate endpoint URL to prevent SSRF via user-supplied configuration (Finding 43)
        _validate_endpoint_url(self.endpoint_url)

        # Warn when a non-default endpoint is in use so operators are aware
        if self.endpoint_url != _DEFAULT_ENDPOINT:
            logger.warning(
                "Non-default LLM endpoint configured: %s — ensure this is intentional.",
                self.endpoint_url,
            )

        if not self.api_key:
            raise RuntimeError(
                "No HuggingFace API token found.\n\n"
                "  Set one of these environment variables (use single quotes!):\n\n"
                "    export HF_TOKEN='hf_your_token_here'\n"
                "    export LLM_API_KEY='hf_your_token_here'\n\n"
                "  Get a token at: https://huggingface.co/settings/tokens\n"
                "  Tip: Add the export to your ~/.zshrc for persistence."
            )

        logger.info("LLM Planner: %s | Coder: %s", self.planner_model, self.coder_model)
        logger.info("LLM Endpoint: %s", self.endpoint_url)

    # HTTP status codes that are transient and should be retried
    _RETRYABLE_HTTP_CODES: frozenset[int] = frozenset({429, 502, 503, 504})
    # Maximum number of retries for transient errors
    _MAX_RETRIES: int = 3
    # Exponential backoff base in seconds (1s, 2s, 4s)
    _BACKOFF_BASE_S: float = 1.0

    def chat_completion(
        self,
        messages: List[Dict[str, str]],
        tools: List[Dict] = None,
        role: str = "planner",
    ) -> Dict[str, Any]:
        """Executes a synchronous POST to the inference endpoint.

        Retries up to _MAX_RETRIES times with exponential backoff (1s, 2s, 4s)
        for transient HTTP errors (429, 502, 503, 504). Permanent errors are
        re-raised immediately without retrying.

        Args:
            messages: OpenAI-compatible message list.
            tools: Optional tool definitions for function calling.
            role: "planner" uses DeepSeek-V3, "coder" uses Qwen3-32B.
        """
        model = self.coder_model if role == "coder" else self.planner_model

        payload = {
            "model": model,
            "messages": messages,
            "temperature": 0.2,
            "max_tokens": 8192,
        }

        # Inject standard JSON schema tool definitions if provided
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"

        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }

        logger.debug("Calling %s (%s)...", model, role)

        last_error: Exception | None = None
        for attempt in range(self._MAX_RETRIES + 1):
            req = urllib.request.Request(
                self.endpoint_url,
                data=json.dumps(payload).encode("utf-8"),
                headers=headers,
                method="POST",
            )
            try:
                _call_start = time.monotonic()
                with urllib.request.urlopen(req, timeout=120) as response:
                    # Read with size cap to prevent OOM from large responses (Finding 20)
                    _MAX_RESPONSE_SIZE = 10_000_000  # 10 MB
                    data = response.read(_MAX_RESPONSE_SIZE + 1)
                    if len(data) > _MAX_RESPONSE_SIZE:
                        raise RuntimeError(f"LLM response too large: >{_MAX_RESPONSE_SIZE} bytes")
                    result = json.loads(data.decode("utf-8"))
                    _call_elapsed = time.monotonic() - _call_start
                    logger.info("LLM API call completed in %.2fs (model=%s)", _call_elapsed, model)
                    return result
            except urllib.error.HTTPError as e:
                error_body = e.read(10_000).decode("utf-8", errors="replace")
                # Sanitize error body before logging - API providers may echo back
                # credentials or other sensitive data in error responses (P1-7 fix)
                sanitized_body = sanitize_message(error_body)
                logger.debug("LLM API error body (status %s): %s", e.code, sanitized_body)

                if e.code in self._RETRYABLE_HTTP_CODES and attempt < self._MAX_RETRIES:
                    backoff = self._BACKOFF_BASE_S * (2**attempt)
                    logger.warning(
                        "Transient HTTP %d from LLM API (%s); retrying in %.0fs (attempt %d/%d).",
                        e.code,
                        model,
                        backoff,
                        attempt + 1,
                        self._MAX_RETRIES,
                    )
                    time.sleep(backoff)
                    last_error = e
                    continue

                # Permanent error — raise immediately
                raise RuntimeError("LLM API Error (%s): HTTP %s - see debug logs for details" % (model, e.code))
            except (urllib.error.URLError, socket.timeout, ssl.SSLError, ConnectionResetError, OSError) as e:
                if attempt < self._MAX_RETRIES:
                    backoff = self._BACKOFF_BASE_S * (2**attempt)
                    logger.warning(
                        "Transient network error from LLM API (%s): %s; retrying in %.0fs (attempt %d/%d).",
                        model,
                        type(e).__name__,
                        backoff,
                        attempt + 1,
                        self._MAX_RETRIES,
                    )
                    time.sleep(backoff)
                    last_error = e
                    continue

                # Retries exhausted — raise as connection error
                logger.error("Failed to connect to LLM API after %d retries: %s", self._MAX_RETRIES, e)
                raise RuntimeError("LLM Connection Error: %s" % sanitize_message(str(e)))
            except Exception as e:
                logger.error("Failed to connect to LLM API: %s", e)
                raise RuntimeError("LLM Connection Error: %s" % sanitize_message(str(e)))

        # All retries exhausted
        raise RuntimeError(
            "LLM API Error (%s): exceeded %d retries for transient error: %s" % (model, self._MAX_RETRIES, last_error)
        )

    def parse_tool_calls(self, completion_response: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Extracts tool execution requests from the OpenAI-compatible response."""
        try:
            message = completion_response["choices"][0]["message"]
            if "tool_calls" in message and message["tool_calls"]:
                return message["tool_calls"]
            return []
        except (KeyError, IndexError):
            return []

    def parse_content(self, completion_response: Dict[str, Any]) -> str:
        """Extracts the plaintext content from the response."""
        try:
            return completion_response["choices"][0]["message"].get("content", "")
        except (KeyError, IndexError):
            return ""
