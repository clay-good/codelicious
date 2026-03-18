import json
import os
import urllib.request
import urllib.error
import logging
from typing import List, Dict, Any

logger = logging.getLogger("codelicious.llm")

# Default models on SambaNova via HuggingFace Router
# DeepSeek-V3: best open-weight model for planning, orchestration, tool use
# Qwen3-235B: largest available Qwen3 MoE — strongest open-weight coder
_DEFAULT_PLANNER_MODEL = "DeepSeek-V3-0324"
_DEFAULT_CODER_MODEL = "Qwen3-235B"
_DEFAULT_ENDPOINT = "https://router.huggingface.co/sambanova/v1/chat/completions"


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

    def chat_completion(
        self,
        messages: List[Dict[str, str]],
        tools: List[Dict] = None,
        role: str = "planner",
    ) -> Dict[str, Any]:
        """
        Executes a synchronous POST to the inference endpoint.

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

        req = urllib.request.Request(
            self.endpoint_url,
            data=json.dumps(payload).encode("utf-8"),
            headers=headers,
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=120) as response:
                result = json.loads(response.read().decode("utf-8"))
                return result
        except urllib.error.HTTPError as e:
            error_body = e.read().decode("utf-8")
            logger.debug("LLM API error body (status %s): %s", e.code, error_body)
            raise RuntimeError("LLM API Error (%s): HTTP %s - see debug logs for details" % (model, e.code))
        except Exception as e:
            logger.error("Failed to connect to LLM API: %s", e)
            raise RuntimeError("LLM Connection Error: %s" % e)

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
