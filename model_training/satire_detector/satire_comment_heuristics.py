"""
Torch-free satire comment heuristics.

This module is intentionally lightweight so unit tests and backend comment-consensus logic
can run without importing training dependencies (torch/transformers/datasets).
"""

from __future__ import annotations

import re
from typing import List, NamedTuple, Optional, Set


# ── Keyword dictionary (keep in sync with training if edited) ──────────────────
SATIRE_KEYWORDS: List[str] = [
    "satire",
    "parody",
    "shit post",
    "shitpost",
    "shitposting",
    "sarcasm",
    "sarcastic",
    "joke",
    "satirical",
    "humor",
    "comedic",
    "tongue-in-cheek",
    "not serious",
    "for laughs",
    "meme",
    "satire post",
    "parody post",
]


def _build_keyword_pattern() -> re.Pattern:
    escaped = [re.escape(kw) for kw in SATIRE_KEYWORDS]
    return re.compile(r"\b(" + "|".join(escaped) + r")\b", re.IGNORECASE)


_SATIRE_PATTERN = _build_keyword_pattern()


def extract_satire_keywords(text: str) -> List[str]:
    if not text or not isinstance(text, str):
        return []
    return list(set(m.group(0).lower() for m in _SATIRE_PATTERN.finditer(text)))


# canonical tags first (#satire, #shitpost, #meme), then compound tags like #my-shitpost-joke.
_HASHTAG_SATIRE = re.compile(
    r"(?:"
    r"#(?:satire|shitpost|meme)\b"
    r"|"
    r"#[\w-]*(?:satire|parody|sarcasm|shitpost|shitposts|meme|joke)\b"
    r")",
    re.IGNORECASE,
)
_HASHTAG_SHIT_POST = re.compile(r"#\s*shit[\s_-]*post\b", re.IGNORECASE)
_REDDIT_SLASH_MARKERS = re.compile(
    r"(?:^|[\s>])(/(?:satire|shitpost|meme|s))(?:\s|$|[.,!?])",
    re.IGNORECASE,
)


class SatireKeywordScanResult(NamedTuple):
    keywords: List[str]
    source: Optional[str]  # "post", "comment", or None if no match
    comment_index: Optional[int]
    consensus_reason: Optional[str] = None


def extract_satire_markers_regex(text: str) -> List[str]:
    if not text or not isinstance(text, str):
        return []
    found: Set[str] = set(m.lower() for m in extract_satire_keywords(text))
    for m in _HASHTAG_SATIRE.finditer(text):
        found.add(m.group(0).lower())
    for m in _HASHTAG_SHIT_POST.finditer(text):
        found.add(re.sub(r"\s+", "", m.group(0).lower()))
    for m in _REDDIT_SLASH_MARKERS.finditer(text):
        found.add(m.group(1).lower())
    return sorted(found)


_RE_THIS_POST_SATIRE = re.compile(
    r"(?i)(?:^|[.!?\n]\s*|\s)"
    r"(?:this|that|it|the post|the op|this post|thread|here)\s+"
    r"(?:is|isn't|is not|was|wasn't|must be|has to be|looks like|seems|reads like|ain't)\s+"
    r"(?:satire|a joke|parody|sarcasm|sarcastic|shitpost|shit post|trolling|fake|humor)\b",
)
_RE_IS_THIS_SATIRE_Q = re.compile(
    r"(?i)\b(?:is this|is it|isn't this|isn't it)\s+(?:satire|a joke|parody|sarcastic|serious|real)\b",
)
_RE_ARROW_SATIRE_ANSWER = re.compile(
    r"(?i)(?:this\s+is\s+)?(?:satire|a joke|parody|sarcasm|shitpost)\s*(?:->|→|—|:)\s*(yes|no)\b",
)
_RE_AFFIRM_WORDS = re.compile(
    r"(?i)\b(?:yes|yeah|yep|yup|definitely|absolutely|sure|correct|exactly|it is|this is|for sure|100%)\b",
)
_RE_DENY_AFTER_SATIRE_Q = re.compile(
    r"(?i)(?:satire|parody|joke|sarcasm|shitpost)\s*\?[^\n]{0,25}\bno\b",
)


def _comment_discusses_post_satire(cmt: str) -> bool:
    if not cmt or not isinstance(cmt, str):
        return False
    if _RE_THIS_POST_SATIRE.search(cmt):
        return True
    if _RE_IS_THIS_SATIRE_Q.search(cmt):
        return True
    if _RE_ARROW_SATIRE_ANSWER.search(cmt):
        return True
    if extract_satire_markers_regex(cmt) and re.search(r"(?i)\b(?:this|that|it|post|op|thread|here|your)\b", cmt):
        return True
    return False


def _comment_satire_claim_with_clear_yes(cmt: str) -> bool:
    if not cmt or not isinstance(cmt, str):
        return False
    if _RE_DENY_AFTER_SATIRE_Q.search(cmt):
        return False
    if re.search(r"(?i)(?:->|→)\s*no\b", cmt) and re.search(r"(?i)(?:satire|parody|joke|sarcasm|shitpost)\b", cmt):
        return False

    discusses = (
        _RE_THIS_POST_SATIRE.search(cmt) is not None
        or _RE_IS_THIS_SATIRE_Q.search(cmt) is not None
        or _RE_ARROW_SATIRE_ANSWER.search(cmt) is not None
        or (len(extract_satire_markers_regex(cmt)) > 0 and re.search(r"(?i)\b(?:this|that|it|post|op|thread)\b", cmt))
    )
    if not discusses:
        return False

    if _RE_AFFIRM_WORDS.search(cmt):
        return True
    m = _RE_ARROW_SATIRE_ANSWER.search(cmt)
    if m and m.group(1).lower() == "yes":
        return True
    if re.search(r"(?i)(?:satire|parody|joke|sarcasm|shitpost)\s*\?[^\n]{0,20}\b(?:yes|yeah|yep)\b", cmt):
        return True
    return False


def _count_satire_meta_comments(comment_texts: List[str]) -> int:
    return sum(1 for c in comment_texts if c and isinstance(c, str) and _comment_discusses_post_satire(c))


SATIRE_COMMENT_CROWD_THRESHOLD = 10


def _top_comments_confirm_satire(comment_texts: List[str], top_n: int = 3, required: int = 2) -> bool:
    n = 0
    for cmt in comment_texts[: max(0, top_n)]:
        if not cmt or not isinstance(cmt, str):
            continue
        if _comment_satire_claim_with_clear_yes(cmt) or _RE_THIS_POST_SATIRE.search(cmt):
            n += 1
    return n >= required


def _merge_comment_keywords_for_consensus(comment_texts: List[str], max_comments: int = 5) -> List[str]:
    seen: Set[str] = set()
    out: List[str] = []
    n = 0
    for cmt in comment_texts:
        if not cmt or not isinstance(cmt, str):
            continue
        if not _comment_discusses_post_satire(cmt):
            continue
        for kw in extract_satire_markers_regex(cmt):
            if kw not in seen:
                seen.add(kw)
                out.append(kw)
        n += 1
        if n >= max_comments:
            break
    return out


def extract_satire_keywords_post_then_comments(
    post_text: str,
    comment_texts: Optional[List[str]] = None,
) -> SatireKeywordScanResult:
    post_hits = extract_satire_markers_regex(post_text)
    if post_hits:
        return SatireKeywordScanResult(keywords=post_hits, source="post", comment_index=None)

    if not comment_texts:
        return SatireKeywordScanResult(keywords=[], source=None, comment_index=None)

    if _top_comments_confirm_satire(comment_texts, top_n=3, required=2):
        return SatireKeywordScanResult(
            keywords=["satire_comment_top3_consensus"],
            source="comment",
            comment_index=0,
            consensus_reason="top3_2of3",
        )

    for i, cmt in enumerate(comment_texts):
        if not cmt or not isinstance(cmt, str):
            continue
        if _comment_satire_claim_with_clear_yes(cmt):
            base = extract_satire_markers_regex(cmt)
            kws = sorted(set(base + ["satire_comment_yes_confirmation"]))
            return SatireKeywordScanResult(
                keywords=kws,
                source="comment",
                comment_index=i,
                consensus_reason="yes_confirmation",
            )

    if _count_satire_meta_comments(comment_texts) >= SATIRE_COMMENT_CROWD_THRESHOLD:
        merged = _merge_comment_keywords_for_consensus(comment_texts)
        kws = sorted(set(merged + ["satire_comment_crowd_signal"]))
        first_idx = next((j for j, c in enumerate(comment_texts) if c and _comment_discusses_post_satire(c)), 0)
        return SatireKeywordScanResult(
            keywords=kws,
            source="comment",
            comment_index=first_idx,
            consensus_reason="crowd_10",
        )

    for i, cmt in enumerate(comment_texts):
        if not cmt or not isinstance(cmt, str):
            continue
        hits = extract_satire_markers_regex(cmt)
        if hits:
            return SatireKeywordScanResult(keywords=hits, source="comment", comment_index=i)

    return SatireKeywordScanResult(keywords=[], source=None, comment_index=None)

