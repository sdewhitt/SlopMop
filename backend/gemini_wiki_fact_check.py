"""
Gemini (Google AI Studio) + Wikipedia search — free-tier friendly path with real links.

1. Gemini classifies text as opinion vs contains checkable factual claim(s).
2. If opinion only → one row with verdict "Opinion detected".
3. If factual → up to 4 claims; each gets a best-effort en.wikipedia.org URL from the MediaWiki API.
"""

from __future__ import annotations

import json
import os
import re
from typing import Any
from urllib.parse import quote

import httpx

GEMINI_GENERATE_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
)
WIKI_API = "https://en.wikipedia.org/w/api.php"
REQUEST_TIMEOUT_SEC = 60.0
MAX_INPUT_CHARS = 8000
MAX_CLAIMS = 4

# https://meta.wikimedia.org/wiki/User-Agent_policy
WIKI_USER_AGENT = "SlopMopFactCheck/1.0 (educational project; local development)"

CLASSIFIER_PROMPT = """Analyze the user's text (e.g. social media post).

Return ONLY valid JSON with this exact shape:
{
  "classification": "opinion" | "factual",
  "reason": "one short sentence; if opinion, why it is opinion/subjective/not a verifiable fact",
  "claims": [
    {
      "query_text": "short verbatim excerpt from the user's text supporting this claim",
      "claim": "one concise factual assertion that could be verified (who/what/when/where/number)",
      "assessment": "one sentence: plausibility or what would need checking (you cannot browse the web)"
    }
  ]
}

Rules:
- Use "opinion" when the text is mainly subjective views, questions without factual assertions, jokes, greetings, or rhetoric with **no** specific checkable factual content.
- Use "factual" only if there is at least one **specific** claim (dates, statistics, "X happened", medical/legal assertions, quoted events). Otherwise use "opinion" and set "claims" to [].
- At most """ + str(MAX_CLAIMS) + """ entries in "claims".
- Do not include markdown or extra keys."""


def _strip_code_fence(s: str) -> str:
    s = s.strip()
    if s.startswith("```"):
        s = re.sub(r"^```(?:json)?\s*", "", s, flags=re.IGNORECASE)
        s = re.sub(r"\s*```\s*$", "", s)
    return s.strip()


def _wiki_article_url(title: str) -> str:
    t = title.strip().replace(" ", "_")
    if not t:
        return ""
    return "https://en.wikipedia.org/wiki/" + quote(t, safe="/():!%'")


async def wikipedia_best_link(
    client: httpx.AsyncClient,
    search_query: str,
) -> tuple[str, str]:
    """
    Returns (article_url, article_title) using English Wikipedia search.
    Empty strings if no result.
    """
    q = (search_query or "").strip()[:300]
    if not q:
        return "", ""

    params = {
        "action": "query",
        "list": "search",
        "srsearch": q,
        "srlimit": "1",
        "format": "json",
        "formatversion": "2",
    }
    try:
        r = await client.get(
            WIKI_API,
            params=params,
            headers={"User-Agent": WIKI_USER_AGENT},
            timeout=20.0,
        )
    except (httpx.TimeoutException, httpx.RequestError):
        return "", ""

    if r.status_code >= 400:
        return "", ""

    try:
        data = r.json()
    except Exception:
        return "", ""

    search = (data.get("query") or {}).get("search") if isinstance(data, dict) else None
    if not isinstance(search, list) or len(search) == 0:
        return "", ""

    first = search[0]
    if not isinstance(first, dict):
        return "", ""

    title = first.get("title")
    if not isinstance(title, str) or not title.strip():
        return "", ""

    return _wiki_article_url(title), title


def _extract_gemini_text(data: dict[str, Any]) -> str | None:
    try:
        cands = data.get("candidates")
        if not isinstance(cands, list) or not cands:
            return None
        cand = cands[0]
        if not isinstance(cand, dict):
            return None
        content = cand.get("content")
        if not isinstance(content, dict):
            return None
        parts = content.get("parts")
        if not isinstance(parts, list) or not parts or not isinstance(parts[0], dict):
            return None
        t = parts[0].get("text")
        return t if isinstance(t, str) else None
    except (KeyError, IndexError, TypeError):
        return None


async def run_gemini_wiki_fact_check(text: str) -> tuple[list[dict[str, str]], str | None]:
    key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not key:
        return [], "Gemini fact check is not configured (missing GEMINI_API_KEY)."

    stripped = (text or "").strip()
    if not stripped:
        return [], "No text to fact-check."

    user_block = stripped[:MAX_INPUT_CHARS]
    if len(stripped) > MAX_INPUT_CHARS:
        user_block += "\n\n[... truncated ...]"

    model = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash").strip() or "gemini-2.0-flash"
    url = GEMINI_GENERATE_URL.format(model=model) + f"?key={quote(key, safe='')}"

    payload: dict[str, Any] = {
        "contents": [
            {
                "role": "user",
                "parts": [
                    {"text": CLASSIFIER_PROMPT + "\n\n--- USER TEXT ---\n" + user_block + "\n--- END ---"},
                ],
            }
        ],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": 2048,
            "responseMimeType": "application/json",
        },
    }

    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SEC) as client:
            resp = await client.post(url, json=payload)
            if resp.status_code == 429:
                return [], "Gemini rate limit reached. Wait and try again."
            if resp.status_code in (401, 403):
                return [], "Gemini authentication failed. Check GEMINI_API_KEY (Google AI Studio)."
            if resp.status_code >= 400:
                try:
                    body = resp.json()
                    err = body.get("error") if isinstance(body, dict) else None
                    msg = err.get("message") if isinstance(err, dict) else None
                except Exception:
                    msg = None
                return [], msg or f"Gemini API error (HTTP {resp.status_code})."

            try:
                outer = resp.json()
            except Exception:
                return [], "Invalid JSON from Gemini API."

            content = _extract_gemini_text(outer)
            if not content:
                return [], "Empty response from Gemini."

            try:
                parsed = json.loads(_strip_code_fence(content))
            except json.JSONDecodeError:
                return [], "Gemini returned non-JSON content."

            classification = parsed.get("classification") if isinstance(parsed, dict) else None
            cls_norm = str(classification).strip().lower() if classification is not None else ""
            reason = parsed.get("reason") if isinstance(parsed.get("reason"), str) else ""
            claims_raw = parsed.get("claims") if isinstance(parsed, dict) else None
            if not isinstance(claims_raw, list):
                claims_raw = []

            excerpt = user_block[:400] + ("…" if len(user_block) > 400 else "")

            if cls_norm == "opinion" or len(claims_raw) == 0:
                verdict = "Opinion detected"
                if reason.strip():
                    verdict = f"Opinion detected — {reason.strip()[:280]}"
                row = {
                    "query_text": excerpt,
                    "claim": "No checkable factual claim was identified in this text.",
                    "verdict": verdict,
                    "source": "Gemini (classification)",
                    "url": "",
                }
                return [row], None

            rows: list[dict[str, str]] = []
            for c in claims_raw[:MAX_CLAIMS]:
                if not isinstance(c, dict):
                    continue
                claim = c.get("claim")
                if not isinstance(claim, str) or not claim.strip():
                    continue
                qt = c.get("query_text") if isinstance(c.get("query_text"), str) else ""
                query_text = qt.strip() if qt.strip() else excerpt
                assessment = (
                    c.get("assessment") if isinstance(c.get("assessment"), str) else ""
                ).strip()

                wiki_url, wiki_title = await wikipedia_best_link(client, claim)
                if wiki_url:
                    verdict = assessment or "Related Wikipedia article found (search match; not a full fact verdict)."
                    source = f"Wikipedia: {wiki_title}"
                    link = wiki_url
                else:
                    verdict = assessment or "No matching Wikipedia article in search (claim may still need other sources)."
                    source = "Gemini + Wikipedia (no search hit)"
                    link = ""

                rows.append(
                    {
                        "query_text": query_text[:500],
                        "claim": claim.strip()[:2000],
                        "verdict": verdict[:1500],
                        "source": source[:500],
                        "url": link,
                    }
                )

            if not rows:
                row = {
                    "query_text": excerpt,
                    "claim": "No checkable factual claim was identified in this text.",
                    "verdict": "Opinion detected — " + (reason.strip()[:200] or "nothing to verify."),
                    "source": "Gemini (classification)",
                    "url": "",
                }
                return [row], None

            return rows, None

    except httpx.TimeoutException:
        return [], "Gemini fact check request timed out. Try again."
    except httpx.RequestError as e:
        return [], f"Gemini network error: {e!s}"
