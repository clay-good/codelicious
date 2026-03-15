import json
import os
import urllib.request
import urllib.error
import logging
from typing import List, Dict, Any

logger = logging.getLogger("codelicious.llm")

class LLMClient:
    """
    Zero-dependency HTTP client interacting with Hugging Face Inference Endpoints
    (TGI/vLLM) using the standard OpenAI-compatible /v1/chat/completions API format.
    """
    def __init__(self, endpoint_url: str = None, api_key: str = None, model: str = None):
        self.endpoint_url = endpoint_url or os.environ.get("LLM_ENDPOINT", "https://api-inference.huggingface.co/v1/chat/completions")
        self.api_key = api_key or os.environ.get("LLM_API_KEY", "")
        self.model = model or os.environ.get("MODEL_PLANNER", "deepseek-ai/DeepSeek-V3")
        
        if not self.api_key:
            logger.warning("No LLM_API_KEY provided. API calls will likely fail.")

    def chat_completion(self, messages: List[Dict[str, str]], tools: List[Dict] = None) -> Dict[str, Any]:
        """
        Executes a synchronous POST request to the inference endpoint.
        Format must be OpenAI compatible (used by vLLM/TGI).
        """
        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.2, # Low temperature for more deterministic coding output
            "max_tokens": 8192
        }
        
        # Inject standard JSON schema tool definitions if provided
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"
            
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}"
        }
        
        req = urllib.request.Request(
            self.endpoint_url,
            data=json.dumps(payload).encode("utf-8"),
            headers=headers,
            method="POST"
        )
        
        try:
            with urllib.request.urlopen(req, timeout=120) as response:
                result = json.loads(response.read().decode("utf-8"))
                return result
        except urllib.error.HTTPError as e:
            error_body = e.read().decode('utf-8')
            logger.error(f"HTTPError {e.code}: {error_body}")
            raise RuntimeError(f"LLM API Error: {e.code} - {error_body}")
        except Exception as e:
            logger.error(f"Failed to connect to LLM API: {e}")
            raise RuntimeError(f"LLM Connection Error: {e}")
            
    def parse_tool_calls(self, completion_response: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Extracts tool execution requests cleanly from the OpenAI-compatible response.
        """
        try:
            message = completion_response["choices"][0]["message"]
            if "tool_calls" in message and message["tool_calls"]:
                return message["tool_calls"]
            return []
        except (KeyError, IndexError):
            return []
            
    def parse_content(self, completion_response: Dict[str, Any]) -> str:
        """
        Extracts the plaintext conversational thought/reasoning token stream.
        """
        try:
            return completion_response["choices"][0]["message"].get("content", "")
        except (KeyError, IndexError):
            return ""
