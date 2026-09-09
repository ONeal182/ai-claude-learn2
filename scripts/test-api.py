#!/usr/bin/env python3
"""
Simple test script to diagnose API format.
"""

import os
import sys
import json

try:
    import requests
except ImportError:
    print("Error: requests package is required.")
    print("Install it with: pip install requests")
    sys.exit(1)

api_key = os.getenv("ANTHROPIC_API_KEY")
base_url = os.getenv("ANTHROPIC_BASE_URL", "https://api.anthropic.com")
model = os.getenv("MODEL", "sonnet")

if not api_key:
    print("Error: ANTHROPIC_API_KEY is required")
    sys.exit(1)

print("Testing API endpoints...\n")

# Test 1: Anthropic format, non-streaming
print("=" * 60)
print("Test 1: Anthropic /v1/messages (no stream)")
print("=" * 60)
url1 = f"{base_url.rstrip('/')}/v1/messages"
headers1 = {
    "x-api-key": api_key,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
}
payload1 = {
    "model": model,
    "max_tokens": 50,
    "messages": [{"role": "user", "content": "Say 'Hello'"}],
    "stream": False
}
print(f"URL: {url1}")
print(f"Headers: {json.dumps({k: '***' if 'key' in k.lower() else v for k, v in headers1.items()}, indent=2)}")
print(f"Payload: {json.dumps(payload1, indent=2)}")

try:
    resp1 = requests.post(url1, headers=headers1, json=payload1, timeout=30)
    print(f"Status: {resp1.status_code}")
    print(f"Response: {resp1.text[:500]}")
except Exception as e:
    print(f"Error: {e}")

# Test 2: OpenAI format, non-streaming
print("\n" + "=" * 60)
print("Test 2: OpenAI /v1/chat/completions (no stream)")
print("=" * 60)
url2 = f"{base_url.rstrip('/')}/v1/chat/completions"
headers2 = {
    "Authorization": f"Bearer {api_key}",
    "content-type": "application/json",
}
payload2 = {
    "model": model,
    "max_tokens": 50,
    "messages": [{"role": "user", "content": "Say 'Hello'"}],
    "stream": False
}
print(f"URL: {url2}")
print(f"Headers: {json.dumps({k: '***' if 'auth' in k.lower() else v for k, v in headers2.items()}, indent=2)}")
print(f"Payload: {json.dumps(payload2, indent=2)}")

try:
    resp2 = requests.post(url2, headers=headers2, json=payload2, timeout=30)
    print(f"Status: {resp2.status_code}")
    print(f"Response: {resp2.text[:500]}")
except Exception as e:
    print(f"Error: {e}")

# Test 3: Try without max_tokens
print("\n" + "=" * 60)
print("Test 3: Anthropic without max_tokens")
print("=" * 60)
payload3 = {
    "model": model,
    "messages": [{"role": "user", "content": "Say 'Hello'"}],
}
print(f"Payload: {json.dumps(payload3, indent=2)}")

try:
    resp3 = requests.post(url1, headers=headers1, json=payload3, timeout=30)
    print(f"Status: {resp3.status_code}")
    print(f"Response: {resp3.text[:500]}")
except Exception as e:
    print(f"Error: {e}")

print("\n" + "=" * 60)
print("Diagnosis complete")
print("=" * 60)
