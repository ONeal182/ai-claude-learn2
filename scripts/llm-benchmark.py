#!/usr/bin/env python3
"""
LLM Benchmark - standalone script for measuring LLM API performance.

Measures:
- TTFT (Time to First Token)
- Total request time
- Generation time (after first token)
- Input/output tokens
- Tokens per second

Usage:
    export MODEL="claude-sonnet-4"
    export ANTHROPIC_API_KEY="your-api-key"
    export ANTHROPIC_BASE_URL="https://your-proxy.com"  # optional
    export DEBUG=1  # optional, enable debug logging
    python3 scripts/llm-benchmark.py
"""

import os
import sys
import time
import json
import statistics
from typing import List, Dict, Optional

try:
    import requests
except ImportError:
    print("Error: requests package is required.")
    print("Install it with: pip install requests")
    sys.exit(1)


# Configuration
DEFAULT_RUNS = 5
DEFAULT_MAX_TOKENS = 1200
REQUEST_TIMEOUT = 120  # seconds
DEBUG = os.getenv("DEBUG", "0") == "1"

# Test prompt designed to generate ~800-1200 tokens
TEST_PROMPT = """Подробно объясни архитектуру Redis и его применение в веб-приложениях.
Включи следующие аспекты:

1. Основные структуры данных Redis (strings, lists, sets, sorted sets, hashes, streams)
2. Паттерны использования для кэширования
3. Реализация очередей задач (task queues) на Redis
4. Pub/Sub механизм и его применение
5. Персистентность данных (RDB и AOF)
6. Репликация и высокая доступность (Redis Sentinel)
7. Кластеризация Redis
8. Сравнение с другими решениями (Memcached, in-memory кэш приложения)
9. Лучшие практики и типичные ошибки
10. Примеры реальных сценариев использования в production

Объясни максимально подробно, с примерами команд и архитектурными диаграммами."""


def debug_log(message: str) -> None:
    """Print debug message if DEBUG is enabled."""
    if DEBUG:
        print(f"[DEBUG] {message}")


class BenchmarkResult:
    """Store results of a single benchmark run."""

    def __init__(
        self,
        ttft: float,
        total_time: float,
        input_tokens: int,
        output_tokens: int,
    ):
        self.ttft = ttft  # Time to first token
        self.total_time = total_time
        self.input_tokens = input_tokens
        self.output_tokens = output_tokens
        self.generation_time = total_time - ttft
        self.tokens_per_sec = output_tokens / self.generation_time if self.generation_time > 0 else 0


def run_benchmark_anthropic(
    api_key: str,
    base_url: str,
    model: str,
    max_tokens: int
) -> Optional[BenchmarkResult]:
    """Run benchmark using Anthropic API format."""

    url = f"{base_url.rstrip('/')}/v1/messages"
    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }

    payload = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": [
            {
                "role": "user",
                "content": TEST_PROMPT
            }
        ],
        "stream": True
    }

    return _run_anthropic_stream(url, headers, payload)


def run_benchmark_openai(
    api_key: str,
    base_url: str,
    model: str,
    max_tokens: int
) -> Optional[BenchmarkResult]:
    """Run benchmark using OpenAI-compatible API format."""

    url = f"{base_url.rstrip('/')}/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "content-type": "application/json",
    }

    payload = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": [
            {
                "role": "user",
                "content": TEST_PROMPT
            }
        ],
        "stream": True
    }

    return _run_openai_stream(url, headers, payload)


def _run_anthropic_stream(
    url: str,
    headers: Dict[str, str],
    payload: Dict
) -> Optional[BenchmarkResult]:
    """Process Anthropic-style streaming response."""

    debug_log(f"Request URL: {url}")
    debug_log(f"Request headers: {json.dumps({k: v if k != 'x-api-key' else '***' for k, v in headers.items()}, indent=2)}")
    debug_log(f"Request payload: {json.dumps({**payload, 'messages': [{'role': 'user', 'content': f'{TEST_PROMPT[:100]}...'}]}, indent=2)}")

    start_time = time.time()
    first_token_time = None
    input_tokens = 0
    output_tokens = 0

    try:
        response = requests.post(
            url,
            headers=headers,
            json=payload,
            stream=True,
            timeout=REQUEST_TIMEOUT
        )

        debug_log(f"Response status: {response.status_code}")

        if response.status_code != 200:
            error_text = response.text
            debug_log(f"Error response: {error_text}")
            print(f"Anthropic format failed with HTTP {response.status_code}: {error_text}")
            return None

        # Process streaming response
        for line in response.iter_lines():
            if not line:
                continue

            line_text = line.decode('utf-8')

            # Skip if not a data line
            if not line_text.startswith('data: '):
                continue

            data_str = line_text[6:]  # Remove 'data: ' prefix

            # Skip ping events
            if data_str.strip() == '[DONE]':
                continue

            try:
                data = json.loads(data_str)

                # Record first token time
                if first_token_time is None and data.get('type') == 'content_block_delta':
                    first_token_time = time.time()
                    debug_log(f"First token received at {first_token_time - start_time:.3f}s")

                # Extract usage information from message_start event
                if data.get('type') == 'message_start':
                    usage = data.get('message', {}).get('usage', {})
                    input_tokens = usage.get('input_tokens', 0)
                    debug_log(f"Input tokens: {input_tokens}")

                # Extract final usage from message_delta event
                if data.get('type') == 'message_delta':
                    usage = data.get('usage', {})
                    output_tokens = usage.get('output_tokens', 0)
                    debug_log(f"Output tokens: {output_tokens}")

            except json.JSONDecodeError as e:
                debug_log(f"Failed to parse JSON: {e}, line: {data_str[:100]}")
                continue

        end_time = time.time()

        if first_token_time is None:
            print("Warning: No tokens received in stream")
            return None

        if output_tokens == 0:
            print("Warning: No output tokens counted")
            return None

        ttft = first_token_time - start_time
        total_time = end_time - start_time

        return BenchmarkResult(
            ttft=ttft,
            total_time=total_time,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
        )

    except requests.exceptions.Timeout:
        print(f"Request timed out after {REQUEST_TIMEOUT}s")
        return None
    except requests.exceptions.RequestException as e:
        print(f"Request error: {e}")
        return None
    except Exception as e:
        print(f"Unexpected error: {e}")
        if DEBUG:
            import traceback
            traceback.print_exc()
        return None


def _run_openai_stream(
    url: str,
    headers: Dict[str, str],
    payload: Dict
) -> Optional[BenchmarkResult]:
    """Process OpenAI-style streaming response."""

    debug_log(f"Request URL: {url}")
    debug_log(f"Request headers: {json.dumps({k: v if 'Authorization' not in k else k + ': ***' for k, v in headers.items()}, indent=2)}")
    debug_log(f"Request payload: {json.dumps({**payload, 'messages': [{'role': 'user', 'content': f'{TEST_PROMPT[:100]}...'}]}, indent=2)}")

    start_time = time.time()
    first_token_time = None
    input_tokens = 0
    output_tokens = 0
    completion_tokens = 0
    prompt_tokens = 0

    try:
        response = requests.post(
            url,
            headers=headers,
            json=payload,
            stream=True,
            timeout=REQUEST_TIMEOUT
        )

        debug_log(f"Response status: {response.status_code}")

        if response.status_code != 200:
            error_text = response.text
            debug_log(f"Error response: {error_text}")
            print(f"OpenAI format failed with HTTP {response.status_code}: {error_text}")
            return None

        # Process streaming response
        for line in response.iter_lines():
            if not line:
                continue

            line_text = line.decode('utf-8')

            # Skip if not a data line
            if not line_text.startswith('data: '):
                continue

            data_str = line_text[6:]  # Remove 'data: ' prefix

            # Skip done marker
            if data_str.strip() == '[DONE]':
                continue

            try:
                data = json.loads(data_str)

                # Record first token time when we get first content
                if first_token_time is None:
                    choices = data.get('choices', [])
                    if choices and choices[0].get('delta', {}).get('content'):
                        first_token_time = time.time()
                        debug_log(f"First token received at {first_token_time - start_time:.3f}s")

                # Extract usage information (usually in the last chunk)
                usage = data.get('usage', {})
                if usage:
                    prompt_tokens = usage.get('prompt_tokens', 0)
                    completion_tokens = usage.get('completion_tokens', 0)
                    debug_log(f"Prompt tokens: {prompt_tokens}, Completion tokens: {completion_tokens}")

            except json.JSONDecodeError as e:
                debug_log(f"Failed to parse JSON: {e}, line: {data_str[:100]}")
                continue

        end_time = time.time()

        if first_token_time is None:
            print("Warning: No tokens received in stream")
            return None

        if completion_tokens == 0:
            print("Warning: No completion tokens counted")
            return None

        ttft = first_token_time - start_time
        total_time = end_time - start_time

        return BenchmarkResult(
            ttft=ttft,
            total_time=total_time,
            input_tokens=prompt_tokens,
            output_tokens=completion_tokens,
        )

    except requests.exceptions.Timeout:
        print(f"Request timed out after {REQUEST_TIMEOUT}s")
        return None
    except requests.exceptions.RequestException as e:
        print(f"Request error: {e}")
        return None
    except Exception as e:
        print(f"Unexpected error: {e}")
        if DEBUG:
            import traceback
            traceback.print_exc()
        return None


def print_result(run_num: int, result: BenchmarkResult) -> None:
    """Print results of a single run."""
    print(f"\nRun {run_num}")
    print(f"TTFT: {result.ttft:.2f} s")
    print(f"Input tokens: {result.input_tokens}")
    print(f"Output tokens: {result.output_tokens}")
    print(f"Generation time: {result.generation_time:.2f} s")
    print(f"Speed: {result.tokens_per_sec:.2f} tok/s")
    print(f"Total time: {result.total_time:.2f} s")


def print_summary(results: List[BenchmarkResult]) -> None:
    """Print summary statistics."""
    if not results:
        print("\nNo successful runs to summarize")
        return

    ttfts = [r.ttft for r in results]
    speeds = [r.tokens_per_sec for r in results]
    total_times = [r.total_time for r in results]

    print("\n" + "="*50)
    print("SUMMARY")
    print("="*50)
    print(f"Successful runs: {len(results)}")
    print(f"\nMedian TTFT: {statistics.median(ttfts):.2f} s")
    print(f"Average TTFT: {statistics.mean(ttfts):.2f} s")
    print(f"Min TTFT: {min(ttfts):.2f} s")
    print(f"Max TTFT: {max(ttfts):.2f} s")
    print(f"\nMedian speed: {statistics.median(speeds):.2f} tok/s")
    print(f"Average speed: {statistics.mean(speeds):.2f} tok/s")
    print(f"Min speed: {min(speeds):.2f} tok/s")
    print(f"Max speed: {max(speeds):.2f} tok/s")
    print(f"\nMedian total time: {statistics.median(total_times):.2f} s")
    print(f"Average total time: {statistics.mean(total_times):.2f} s")


def main():
    """Main benchmark execution."""

    # Read configuration from environment
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        print("Error: ANTHROPIC_API_KEY environment variable is required")
        sys.exit(1)

    model = os.getenv("MODEL")
    if not model:
        print("Error: MODEL environment variable is required")
        sys.exit(1)

    base_url = os.getenv("ANTHROPIC_BASE_URL", "https://api.anthropic.com")

    # API format: anthropic, openai, or auto (default)
    api_format = os.getenv("API_FORMAT", "auto").lower()

    # Parse optional parameters
    try:
        num_runs = int(os.getenv("RUNS", str(DEFAULT_RUNS)))
    except ValueError:
        num_runs = DEFAULT_RUNS

    try:
        max_tokens = int(os.getenv("MAX_TOKENS", str(DEFAULT_MAX_TOKENS)))
    except ValueError:
        max_tokens = DEFAULT_MAX_TOKENS

    # Print configuration (without exposing API key)
    print("="*50)
    print("LLM BENCHMARK")
    print("="*50)
    print(f"Model: {model}")
    print(f"Runs: {num_runs}")
    print(f"Max tokens: {max_tokens}")
    print(f"Base URL: {base_url}")
    print(f"API format: {api_format}")
    if DEBUG:
        print("Debug mode: ENABLED")
    print("="*50)

    # Determine which formats to try
    formats_to_try = []
    if api_format == "auto":
        # Try OpenAI first (more common for proxies), then Anthropic
        formats_to_try = ["openai", "anthropic"]
    elif api_format in ["openai", "anthropic"]:
        formats_to_try = [api_format]
    else:
        print(f"Error: Invalid API_FORMAT '{api_format}'. Use 'anthropic', 'openai', or 'auto'")
        sys.exit(1)

    # Run benchmarks
    results: List[BenchmarkResult] = []
    successful_format = None

    for i in range(1, num_runs + 1):
        print(f"\nStarting run {i}/{num_runs}...")

        result = None

        # If we already found a working format, use it
        if successful_format:
            if successful_format == "openai":
                result = run_benchmark_openai(api_key, base_url, model, max_tokens)
            else:
                result = run_benchmark_anthropic(api_key, base_url, model, max_tokens)
        else:
            # Try each format until one works
            for fmt in formats_to_try:
                if fmt == "openai":
                    print(f"Trying OpenAI-compatible format...")
                    result = run_benchmark_openai(api_key, base_url, model, max_tokens)
                else:
                    print(f"Trying Anthropic format...")
                    result = run_benchmark_anthropic(api_key, base_url, model, max_tokens)

                if result:
                    successful_format = fmt
                    print(f"✓ {fmt.capitalize()} format works!")
                    break

            if not result and api_format == "auto":
                print("Both formats failed. Please check your API configuration.")

        if result:
            results.append(result)
            print_result(i, result)
        else:
            print(f"Run {i} failed")

    # Print summary
    print_summary(results)


if __name__ == "__main__":
    main()
