"""
Google Fact Check Tools API (Claim Search) — server-side only.

Chunks input text into groups of two sentences; each group is one API query.
See FACT_CHECK.md for setup.
"""

from __future__ import annotations

import os
import re
from urllib.parse import quote_plus

import httpx

GOOGLE_CLAIMS_SEARCH_URL = "https://factchecktools.googleapis.com/v1alpha1/claims:search"

# Cap outbound requests per user post to control quota.
MAX_FACT_CHECK_QUERIES = 10
REQUEST_TIMEOUT_SEC = 25.0


def split_sentences(text: str) -> list[str]:
    text = (text or "").strip()
    if not text:
        return []
    parts = re.split(r"(?<=[.!?…])\s+", text)
    out = [p.strip() for p in parts if p.strip()]
    return out if out else [text]


def two_sentence_chunks(sentences: list[str]) -> list[str]:
    chunks: list[str] = []
    for i in range(0, len(sentences), 2):
        piece = " ".join(sentences[i : i + 2]).strip()
        if piece:
            chunks.append(piece)
    return chunks


def _normalize_items(claims_payload: object) -> list[dict[str, str]]:
    """Flatten Google claims:search JSON into our response rows."""
    if not isinstance(claims_payload, list):
        return []
    rows: list[dict[str, str]] = []
    for c in claims_payload:
        if not isinstance(c, dict):
            continue
        claim_text = c.get("text")
        if not isinstance(claim_text, str):
            continue
        reviews = c.get("claimReview")
        if not isinstance(reviews, list) or len(reviews) == 0:
            continue
        r0 = reviews[0]
        if not isinstance(r0, dict):
            continue
        pub = r0.get("publisher")
        source = ""
        if isinstance(pub, dict) and isinstance(pub.get("name"), str):
            source = pub["name"]
        url = r0.get("url")
        rating = r0.get("textualRating")
        verdict = rating if isinstance(rating, str) else ""
        link = url if isinstance(url, str) else ""
        rows.append(
            {
                "claim": claim_text.strip(),
                "verdict": verdict,
                "source": source,
                "url": link,
            }
        )
    return rows


async def search_claims(
    client: httpx.AsyncClient,
    api_key: str,
    query: str,
    *,
    language_code: str = "en-US",
    page_size: int = 5,
) -> tuple[list[dict[str, str]], int | None, str | None]:
    """
    Returns (items, http_status, error_message).
    items may be non-empty even on partial failures; error_message set on hard failure.
    """
    q = query.strip()
    if not q:
        return [], None, None
    url = (
        f"{GOOGLE_CLAIMS_SEARCH_URL}"
        f"?query={quote_plus(q)}"
        f"&languageCode={quote_plus(language_code)}"
        f"&pageSize={page_size}"
        f"&key={quote_plus(api_key)}"
    )
    try:
        resp = await client.get(url)
    except httpx.TimeoutException:
        return [], None, "Fact check request timed out. Try again."
    except httpx.RequestError as e:
        return [], None, f"Fact check network error: {e!s}"

    if resp.status_code == 429:
        return [], 429, "Fact check rate limit reached. Wait and try again."
    if resp.status_code >= 400:
        try:
            body = resp.json()
            err = body.get("error") if isinstance(body, dict) else None
            msg = err.get("message") if isinstance(err, dict) else None
        except Exception:
            msg = None
        return [], resp.status_code, msg or f"Fact check API error (HTTP {resp.status_code})."

    try:
        data = resp.json()
    except Exception:
        return [], resp.status_code, "Invalid response from fact check service."

    claims = data.get("claims") if isinstance(data, dict) else None
    return _normalize_items(claims), resp.status_code, None


async def run_fact_check_for_text(
    text: str,
    *,
    api_key: str | None,
) -> tuple[list[dict[str, str]], str | None]:
    """
    Returns (items, error_message).
    error_message is set only when the whole operation should fail (e.g. no key, all chunks failed fatally).
    Items may be empty without error (no database matches).
    """
    if not api_key or not api_key.strip():
        return [], "Fact check is not configured on the server (missing API key)."

    stripped = text.strip()
    if not stripped:
        return [], "No text to fact-check."

    sentences = split_sentences(stripped)
    chunks = two_sentence_chunks(sentences)[:MAX_FACT_CHECK_QUERIES]
    if not chunks:
        return [], "No text to fact-check."

    aggregated: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    fatal_error: str | None = None

    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SEC) as client:
        for chunk in chunks:
            items, status, err = await search_claims(client, api_key.strip(), chunk)
            if err and status == 429:
                return [], err
            if err and status and status >= 500:
                fatal_error = err
                break
            if err:
                fatal_error = err
                continue
            for it in items:
                key = (it.get("url", ""), it.get("claim", ""))
                if key in seen:
                    continue
                seen.add(key)
                row = {
                    "query_text": chunk,
                    **it,
                }
                aggregated.append(row)

    if fatal_error and not aggregated:
        return [], fatal_error
    return aggregated, None
