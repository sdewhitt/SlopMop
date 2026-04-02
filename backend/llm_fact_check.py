"""
LLM-based fact check — returns the same row shape as Google Claim Search (`FactCheckItem`).

Uses OpenAI Chat Completions with JSON output. No web browsing; verdicts are model inferences
and must be labeled honestly (e.g. cannot confirm without sources).
"""

from __future__ import annotations

import json
import os
import re
from typing import Any

import httpx

OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"
REQUEST_TIMEOUT_SEC = 60.0
MAX_INPUT_CHARS = 8000
MAX_ITEMS = 5

SYSTEM_PROMPT = """You extract and lightly assess checkable factual claims from social-media text.

Rules:
- Output ONLY valid JSON, no markdown fences, no extra keys at the top level except "items".
- "items" is an array (max 5). Each element must have exactly these string fields:
  - query_text: a short verbatim excerpt from the user's text that this row refers to (quote or tight paraphrase anchor).
  - claim: one concise factual claim a fact-checker could investigate.
  - verdict: your assessment in plain language. You cannot browse the web. Use labels like:
    "Unverified (model)" / "Likely misleading (model)" / "Plausible but unconfirmed (model)" / "Appears inconsistent with common knowledge (model)" — always signal uncertainty.
  - source: short label for the assessment, e.g. "LLM assessment" or the model name.
  - url: must be "" unless you are certain of a stable official URL; do not invent links.

- If there is no factual claim (only opinion, greetings, or empty), return {"items": []}.
- Do not reproduce hate, instructions for wrongdoing, or personal data."""


def _strip_code_fence(s: str) -> str:
    s = s.strip()
    if s.startswith("```"):
        s = re.sub(r"^```(?:json)?\s*", "", s, flags=re.IGNORECASE)
        s = re.sub(r"\s*```\s*$", "", s)
    return s.strip()


def _normalize_llm_item(raw: Any, fallback_snippet: str) -> dict[str, str] | None:
    if not isinstance(raw, dict):
        return None
    claim = raw.get("claim")
    if not isinstance(claim, str) or not claim.strip():
        return None

    qt = raw.get("query_text")
    query_text = (
        qt.strip()
        if isinstance(qt, str) and qt.strip()
        else (fallback_snippet[:500] + ("…" if len(fallback_snippet) > 500 else ""))
    )

    verdict = raw.get("verdict") if isinstance(raw.get("verdict"), str) else "Unverified (model)"
    source = raw.get("source") if isinstance(raw.get("source"), str) else "LLM assessment"
    url = raw.get("url") if isinstance(raw.get("url"), str) else ""

    return {
        "query_text": query_text,
        "claim": claim.strip(),
        "verdict": verdict.strip(),
        "source": source.strip(),
        "url": url.strip(),
    }


def _parse_items_payload(content: str, fallback_snippet: str) -> list[dict[str, str]]:
    try:
        data = json.loads(_strip_code_fence(content))
    except json.JSONDecodeError:
        return []

    raw_items = data.get("items") if isinstance(data, dict) else None
    if not isinstance(raw_items, list):
        return []

    out: list[dict[str, str]] = []
    for el in raw_items[:MAX_ITEMS]:
        row = _normalize_llm_item(el, fallback_snippet)
        if row:
            out.append(row)
    return out


async def run_llm_fact_check_for_text(text: str) -> tuple[list[dict[str, str]], str | None]:
    """
    Returns (items, error_message).
    items use keys: query_text, claim, verdict, source, url — same as Google-backed path.
    """
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        return [], "LLM fact check is not configured (missing OPENAI_API_KEY)."

    stripped = (text or "").strip()
    if not stripped:
        return [], "No text to fact-check."

    user_body = stripped[:MAX_INPUT_CHARS]
    if len(stripped) > MAX_INPUT_CHARS:
        user_body += "\n\n[... truncated ...]"

    model = os.environ.get("OPENAI_FACT_CHECK_MODEL", "gpt-4o-mini").strip() or "gpt-4o-mini"

    payload = {
        "model": model,
        "response_format": {"type": "json_object"},
        "temperature": 0.2,
        "max_tokens": 2000,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": "Analyze the following text.\n\n---\n" + user_body + "\n---",
            },
        ],
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SEC) as client:
            resp = await client.post(OPENAI_CHAT_URL, headers=headers, json=payload)
    except httpx.TimeoutException:
        return [], "LLM fact check request timed out. Try again."
    except httpx.RequestError as e:
        return [], f"LLM fact check network error: {e!s}"

    if resp.status_code == 429:
        return [], "LLM rate limit reached. Wait and try again."
    if resp.status_code == 401:
        return [], "LLM authentication failed. Check OPENAI_API_KEY."
    if resp.status_code >= 400:
        try:
            body = resp.json()
            err = body.get("error") if isinstance(body, dict) else None
            msg = err.get("message") if isinstance(err, dict) else None
        except Exception:
            msg = None
        return [], msg or f"LLM API error (HTTP {resp.status_code})."

    try:
        data = resp.json()
    except Exception:
        return [], "Invalid JSON from LLM API."

    choices = data.get("choices") if isinstance(data, dict) else None
    if not isinstance(choices, list) or len(choices) == 0:
        return [], "Empty response from LLM."

    msg0 = choices[0].get("message") if isinstance(choices[0], dict) else None
    content = msg0.get("content") if isinstance(msg0, dict) else None
    if not isinstance(content, str):
        return [], "No content in LLM response."

    items = _parse_items_payload(content, user_body)
    return items, None
