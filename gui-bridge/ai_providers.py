"""
LLM provider adapters. Each yields text chunks from a streaming chat completion.
API keys are passed per-request (never stored server-side).
"""
from __future__ import annotations

import json
import logging
from collections.abc import AsyncGenerator
from typing import Any

import httpx

logger = logging.getLogger(__name__)

CADQUERY_SYSTEM_PROMPT = """\
You are an expert CadQuery assistant embedded in DCQ, a browser-based CAD IDE.

The user is editing a CadQuery (Python) script. The current code is provided below.
When the user asks you to modify the code, return the COMPLETE updated script
inside a single fenced Python code block (```python ... ```).
Do NOT return partial snippets; always give the full replacement script so the
user can apply it in one click.

Keep explanations concise. Focus on working CadQuery code.
"""


def _build_messages(
    user_messages: list[dict[str, str]],
    current_code: str,
) -> list[dict[str, str]]:
    system_content = CADQUERY_SYSTEM_PROMPT
    if current_code.strip():
        system_content += f"\n\nCurrent editor code:\n```python\n{current_code}\n```"

    messages: list[dict[str, str]] = [{"role": "system", "content": system_content}]
    for msg in user_messages:
        if msg["role"] in ("user", "assistant"):
            messages.append({"role": msg["role"], "content": msg["content"]})
    return messages


# ─── OpenAI / OpenRouter (OpenAI-compatible) ─────────────────────────────

async def _stream_openai(
    messages: list[dict[str, str]],
    model: str,
    api_key: str,
    base_url: str,
) -> AsyncGenerator[str, None]:
    headers: dict[str, str] = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    if "openrouter.ai" in base_url:
        headers["HTTP-Referer"] = "http://localhost:5173"
        headers["X-Title"] = "DCQ CAD IDE"

    body = {
        "model": model,
        "messages": messages,
        "stream": True,
    }

    timeout = httpx.Timeout(connect=30, read=300, write=30, pool=30)
    async with httpx.AsyncClient(timeout=timeout) as client:
        async with client.stream(
            "POST",
            f"{base_url.rstrip('/')}/chat/completions",
            headers=headers,
            json=body,
        ) as resp:
            if resp.status_code != 200:
                error_body = await resp.aread()
                raise RuntimeError(
                    f"Provider returned {resp.status_code}: {error_body.decode()}"
                )
            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                payload = line[6:]
                if payload.strip() == "[DONE]":
                    return
                try:
                    chunk = json.loads(payload)
                    delta = chunk["choices"][0].get("delta", {})
                    text = delta.get("content")
                    if text:
                        yield text
                except (json.JSONDecodeError, KeyError, IndexError):
                    continue


# ─── Anthropic ────────────────────────────────────────────────────────────

async def _stream_anthropic(
    messages: list[dict[str, str]],
    model: str,
    api_key: str,
    base_url: str,
) -> AsyncGenerator[str, None]:
    system_text = ""
    chat_messages: list[dict[str, str]] = []
    for msg in messages:
        if msg["role"] == "system":
            system_text += msg["content"] + "\n"
        else:
            chat_messages.append(msg)

    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
    }
    body: dict[str, Any] = {
        "model": model,
        "max_tokens": 8192,
        "stream": True,
        "messages": chat_messages,
    }
    if system_text.strip():
        body["system"] = system_text.strip()

    api_url = f"{base_url.rstrip('/')}/v1/messages"

    timeout = httpx.Timeout(connect=30, read=300, write=30, pool=30)
    async with httpx.AsyncClient(timeout=timeout) as client:
        async with client.stream(
            "POST", api_url, headers=headers, json=body
        ) as resp:
            if resp.status_code != 200:
                error_body = await resp.aread()
                raise RuntimeError(
                    f"Anthropic returned {resp.status_code}: {error_body.decode()}"
                )
            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                try:
                    chunk = json.loads(line[6:])
                    if chunk.get("type") == "content_block_delta":
                        text = chunk.get("delta", {}).get("text", "")
                        if text:
                            yield text
                except json.JSONDecodeError:
                    continue


# ─── Google Gemini ────────────────────────────────────────────────────────

async def _stream_gemini(
    messages: list[dict[str, str]],
    model: str,
    api_key: str,
    base_url: str,
) -> AsyncGenerator[str, None]:
    contents: list[dict[str, Any]] = []
    system_instruction: str | None = None

    for msg in messages:
        if msg["role"] == "system":
            system_instruction = msg["content"]
        else:
            role = "user" if msg["role"] == "user" else "model"
            contents.append({
                "role": role,
                "parts": [{"text": msg["content"]}],
            })

    body: dict[str, Any] = {"contents": contents}
    if system_instruction:
        body["system_instruction"] = {"parts": [{"text": system_instruction}]}

    url = (
        f"{base_url.rstrip('/')}/models/{model}:streamGenerateContent"
        f"?alt=sse&key={api_key}"
    )

    timeout = httpx.Timeout(connect=30, read=300, write=30, pool=30)
    async with httpx.AsyncClient(timeout=timeout) as client:
        async with client.stream("POST", url, json=body) as resp:
            if resp.status_code != 200:
                error_body = await resp.aread()
                raise RuntimeError(
                    f"Gemini returned {resp.status_code}: {error_body.decode()}"
                )
            async for line in resp.aiter_lines():
                if not line.startswith("data: "):
                    continue
                try:
                    chunk = json.loads(line[6:])
                    for candidate in chunk.get("candidates", []):
                        for part in candidate.get("content", {}).get("parts", []):
                            text = part.get("text", "")
                            if text:
                                yield text
                except json.JSONDecodeError:
                    continue


# ─── Dispatcher ───────────────────────────────────────────────────────────

PROVIDER_STREAMERS = {
    "openai": _stream_openai,
    "openrouter": _stream_openai,
    "custom": _stream_openai,
    "anthropic": _stream_anthropic,
    "gemini": _stream_gemini,
}

DEFAULT_BASE_URLS = {
    "openai": "https://api.openai.com/v1",
    "anthropic": "https://api.anthropic.com",
    "gemini": "https://generativelanguage.googleapis.com/v1beta",
    "openrouter": "https://openrouter.ai/api/v1",
    "custom": "http://localhost:11434/v1",
}


async def stream_chat(
    provider: str,
    user_messages: list[dict[str, str]],
    current_code: str,
    model: str,
    api_key: str,
    base_url: str | None = None,
) -> AsyncGenerator[str, None]:
    streamer = PROVIDER_STREAMERS.get(provider)
    if not streamer:
        raise ValueError(f"Unknown provider: {provider}")

    resolved_base = base_url or DEFAULT_BASE_URLS.get(provider, "")
    messages = _build_messages(user_messages, current_code)

    async for chunk in streamer(messages, model, api_key, resolved_base):
        yield chunk
