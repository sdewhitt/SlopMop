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
_WIKI_SEARCH_LIMIT = 10
_WIKI_MIN_SCORE_WITH_HINT = 2.8
_WIKI_MIN_SCORE_NO_HINT = 4.2

_STOPWORDS = frozenset(
    {
        "the",
        "a",
        "an",
        "and",
        "or",
        "but",
        "in",
        "on",
        "at",
        "to",
        "for",
        "of",
        "as",
        "by",
        "with",
        "from",
        "is",
        "are",
        "was",
        "were",
        "been",
        "be",
        "have",
        "has",
        "had",
        "do",
        "does",
        "did",
        "will",
        "would",
        "could",
        "should",
        "may",
        "might",
        "must",
        "shall",
        "can",
        "this",
        "that",
        "these",
        "those",
        "it",
        "its",
        "they",
        "them",
        "their",
        "there",
        "than",
        "then",
        "into",
        "over",
        "after",
        "before",
        "between",
        "about",
        "under",
        "above",
        "not",
        "no",
        "also",
        "just",
        "only",
        "very",
        "such",
        "more",
        "most",
        "some",
        "any",
        "all",
        "each",
        "other",
        "another",
    }
)

# https://meta.wikimedia.org/wiki/User-Agent_policy — must identify the app + contact/URL or requests may get 403.
WIKI_USER_AGENT = "SlopMop/1.0 (educational; +https://github.com/SlopMop/SlopMop) httpx"

CLASSIFIER_PROMPT = """Analyze the user's text (e.g. social media post).

Respond with ONE JSON object only. No markdown fences, no commentary before or after the JSON.

Required keys:
- "classification": string, exactly "opinion" or "factual"
- "reason": one short sentence (if opinion, why it is not a verifiable fact)
- "claims": JSON array (max """ + str(MAX_CLAIMS) + """ items). Use [] for opinion.

Each item in "claims" must be an object with these string keys:
- "query_text": short verbatim excerpt from the user's text for this claim
- "claim": one concise factual assertion (who/what/when/where/number)
- "wikipedia_query": 2-8 words naming the Wikipedia topic for the SUBJECT (person, law, event, org, place). Title-like fragment, not the full claim. Use "" if there is no good topic. Avoid generic words alone.
- "assessment": one sentence on plausibility or what would need checking

Rules:
- "opinion" for mainly subjective views, jokes, greetings, or no specific checkable fact.
- "factual" only with at least one specific checkable claim; else "opinion" and claims [].
- Do not output keys other than classification, reason, claims, and the four keys inside each claim object.

Valid minimal example (structure only):
{"classification":"factual","reason":"Contains a dated event.","claims":[{"query_text":"They said it in 2020.","claim":"X happened in 2020.","wikipedia_query":"Event Name","assessment":"Timeline should be verified."}]}"""


def _strip_code_fence(s: str) -> str:
    s = s.strip()
    if s.startswith("```"):
        s = re.sub(r"^```(?:json)?\s*", "", s, flags=re.IGNORECASE)
        s = re.sub(r"\s*```\s*$", "", s)
    return s.strip()


def _parse_classifier_json_blob(raw: str) -> dict[str, Any] | None:
    """Parse Gemini output: strict JSON, then optionally a {...} substring."""
    s = _strip_code_fence((raw or "").strip())
    if not s:
        return None
    try:
        out = json.loads(s)
        return out if isinstance(out, dict) else None
    except json.JSONDecodeError:
        pass
    start = s.find("{")
    if start < 0:
        return None
    depth = 0
    in_str = False
    esc = False
    q = '"'
    for i in range(start, len(s)):
        ch = s[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == q:
                in_str = False
            continue
        if ch in ('"', "'"):
            in_str = True
            q = ch
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                chunk = s[start : i + 1]
                try:
                    out = json.loads(chunk)
                    return out if isinstance(out, dict) else None
                except json.JSONDecodeError:
                    return None
    return None


def _wiki_article_url(title: str) -> str:
    t = title.strip().replace(" ", "_")
    if not t:
        return ""
    return "https://en.wikipedia.org/wiki/" + quote(t, safe="/():!%'")


def _significant_tokens(text: str) -> set[str]:
    words = re.findall(r"[a-z0-9']+", (text or "").lower())
    return {w for w in words if len(w) >= 3 and w not in _STOPWORDS}


def _strip_wiki_snippet_html(snippet: str) -> str:
    return re.sub(r"<[^>]+>", " ", snippet or "")


def _count_token_word_matches(lowercased_text: str, tokens: set[str]) -> int:
    if not lowercased_text or not tokens:
        return 0
    n = 0
    for t in tokens:
        if re.search(rf"(?<!\w){re.escape(t)}(?!\w)", lowercased_text):
            n += 1
    return n


def _fallback_search_phrase(claim: str) -> str:
    """Short query from the claim when the model omits wikipedia_query."""
    toks = _significant_tokens(claim)
    if not toks:
        w = claim.split()[:10]
        return " ".join(w).strip()[:120]
    # Preserve order of first appearances in the claim
    words = re.findall(r"[A-Za-z][A-Za-z0-9']*|[0-9]{4}", claim)
    out: list[str] = []
    have: set[str] = set()
    for raw in words:
        key = re.sub(r"'s$", "", raw.lower())
        if len(key) < 3 or key in _STOPWORDS:
            continue
        if key not in toks:
            continue
        if key in have:
            continue
        have.add(key)
        out.append(raw if raw[:1].isupper() else raw.lower())
        if len(out) >= 6:
            break
    if not out:
        return " ".join(claim.split()[:8])[:120].strip()
    return " ".join(out)[:120].strip()


def _wiki_disambiguation_title(title: str) -> bool:
    t = (title or "").lower()
    return "disambiguation" in t or t.endswith("(disambiguation)")


def _wiki_relevance_score(
    *,
    claim: str,
    wiki_hint: str,
    title: str,
    snippet: str,
    rank: int,
) -> tuple[float, int, int, int]:
    claim_t = _significant_tokens(claim)
    hint_t = _significant_tokens(wiki_hint) if wiki_hint else set()
    title_l = title.lower()
    snip_l = _strip_wiki_snippet_html(snippet).lower()

    mt = _count_token_word_matches(title_l, claim_t)
    ms = _count_token_word_matches(snip_l, claim_t)
    mth = _count_token_word_matches(title_l, hint_t) if hint_t else 0
    msh = _count_token_word_matches(snip_l, hint_t) if hint_t else 0

    # Hint alignment (model’s intended topic) matters most; pure snippet hits are weaker.
    score = (
        5.0 * mth
        + 2.0 * msh
        + 2.5 * mt
        + 0.9 * ms
        + max(0.0, 1.1 - rank * 0.1)
    )
    if _wiki_disambiguation_title(title):
        score -= 4.0
    return score, mt, ms, mth


def _wiki_passes_threshold(
    *,
    wiki_hint: str,
    score: float,
    mt: int,
    ms: int,
    mth: int,
) -> bool:
    if score < 0:
        return False
    if wiki_hint.strip():
        if score < _WIKI_MIN_SCORE_WITH_HINT:
            return False
        # Hint must tie the result to the intended topic, not a random mention.
        return mth >= 1 or (mt >= 2 and ms >= 1)
    if score < _WIKI_MIN_SCORE_NO_HINT:
        return False
    return mt >= 2 or (mt >= 1 and ms >= 3)


async def _wikipedia_search_hits(client: httpx.AsyncClient, search_query: str) -> list[dict[str, Any]]:
    q = (search_query or "").strip()[:300]
    if not q:
        return []
    params = {
        "action": "query",
        "list": "search",
        "srsearch": q,
        "srlimit": str(_WIKI_SEARCH_LIMIT),
        "srprop": "snippet",
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
        return []
    if r.status_code >= 400:
        return []
    try:
        data = r.json()
    except Exception:
        return []
    search = (data.get("query") or {}).get("search") if isinstance(data, dict) else None
    return search if isinstance(search, list) else []


def _pick_best_wikipedia_hit(
    claim: str,
    wiki_query_hint: str,
    search: list[dict[str, Any]],
) -> tuple[str, float]:
    best_title = ""
    best_score = -1e9
    for rank, hit in enumerate(search):
        if not isinstance(hit, dict):
            continue
        title = hit.get("title")
        if not isinstance(title, str) or not title.strip():
            continue
        snippet = hit.get("snippet") if isinstance(hit.get("snippet"), str) else ""
        score, mt, ms, mth = _wiki_relevance_score(
            claim=claim,
            wiki_hint=wiki_query_hint,
            title=title,
            snippet=snippet,
            rank=rank,
        )
        if not _wiki_passes_threshold(
            wiki_hint=wiki_query_hint,
            score=score,
            mt=mt,
            ms=ms,
            mth=mth,
        ):
            continue
        if score > best_score:
            best_score = score
            best_title = title.strip()
    return best_title, best_score


async def wikipedia_best_link_for_claim(
    client: httpx.AsyncClient,
    claim: str,
    wiki_query_hint: str,
) -> tuple[str, str]:
    """
    Search English Wikipedia and pick the best-ranked title/snippet pair that
    actually overlaps the claim (and optional model-provided wikipedia_query).
    Tries the model hint first, then a claim-derived query, and keeps the
    strongest passing result across both.
    """
    hint = (wiki_query_hint or "").strip()
    queries: list[str] = []
    if hint:
        queries.append(hint[:300])
    fb = _fallback_search_phrase(claim)[:300].strip()
    if fb and fb not in queries:
        queries.append(fb)
    if not queries:
        return "", ""

    best_title = ""
    best_score = -1e9
    for raw_q in queries:
        hits = await _wikipedia_search_hits(client, raw_q)
        title, score = _pick_best_wikipedia_hit(claim, wiki_query_hint, hits)
        if title and score > best_score:
            best_score = score
            best_title = title

    if not best_title:
        return "", ""

    return _wiki_article_url(best_title), best_title


def _extract_gemini_text(data: dict[str, Any]) -> str | None:
    """Concatenate all text parts (Gemini may split long JSON across parts)."""
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
        if not isinstance(parts, list) or not parts:
            return None
        chunks: list[str] = []
        for p in parts:
            if isinstance(p, dict) and isinstance(p.get("text"), str):
                chunks.append(p["text"])
        if not chunks:
            return None
        return "".join(chunks)
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

    model = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash").strip() or "gemini-2.5-flash"
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
            "maxOutputTokens": 4096,
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

            parsed = _parse_classifier_json_blob(content)
            if parsed is None:
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
                wq = c.get("wikipedia_query")
                wiki_hint = (
                    wq.strip()
                    if isinstance(wq, str) and wq.strip()
                    else ""
                )

                wiki_url, wiki_title = await wikipedia_best_link_for_claim(
                    client, claim.strip(), wiki_hint
                )
                if wiki_url:
                    verdict = (
                        assessment
                        or "Wikipedia article matched for claim topic (context only; not a verdict on truth)."
                    )
                    source = f"Wikipedia: {wiki_title}"
                    link = wiki_url
                else:
                    verdict = (
                        assessment
                        or "No Wikipedia article passed relevance checks for this claim (try other sources)."
                    )
                    source = "Gemini + Wikipedia (no strong match)"
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
