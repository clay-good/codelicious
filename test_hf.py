import urllib.request
import json

model = "meta-llama/Llama-3.2-3B-Instruct"
urls = [
    f"https://router.huggingface.co/hf-inference/models/{model}/v1/chat/completions",
    f"https://api-inference.huggingface.co/models/{model}/v1/chat/completions",
    f"https://api-inference.huggingface.co/models/{model}/v1/chat/completions",
]

payload = {
    "model": model,
    "messages": [{"role": "user", "content": "hi"}],
    "max_tokens": 10
}

for url in urls:
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            print(f"SUCCESS {url}: {response.getcode()}")
    except Exception as e:
        print(f"FAILED {url}: {e}")
