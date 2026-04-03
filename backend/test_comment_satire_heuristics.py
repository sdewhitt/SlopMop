# unit tests: visible comment text can trigger satire heuristics and lower the post's AI-like probability (same path as backend TextDetectors + satire_detector)

from __future__ import annotations

import os
import sys
from typing import List

import pytest

_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
_REPO_ROOT = os.path.normpath(os.path.join(_BACKEND_DIR, ".."))
_SATIRE_DIR = os.path.join(_REPO_ROOT, "model_training", "satire_detector")
_TEXT_MODEL_DIR = os.path.join(_REPO_ROOT, "model_training", "text_model")

for _p in (_SATIRE_DIR, _TEXT_MODEL_DIR):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from satire_detector import extract_satire_keywords_post_then_comments  # noqa: E402
from text_detector import TextDetectors  # noqa: E402

# neutral post body: no satire markers; comments supply the signal.
_NEUTRAL_POST = "Quarterly sales were flat. We will revisit the forecast next week."


def test_extract_keywords_empty_without_comments() -> None:
    r = extract_satire_keywords_post_then_comments(_NEUTRAL_POST, None)
    assert r.keywords == []
    assert r.source is None

    r2 = extract_satire_keywords_post_then_comments(_NEUTRAL_POST, [])
    assert r2.keywords == []


# comment asks if the post is satire and affirms — strong crowd signal
def test_extract_keywords_from_comment_yes_confirmation() -> None:
    comments: List[str] = ["Is this satire? Yes, absolutely."]
    r = extract_satire_keywords_post_then_comments(_NEUTRAL_POST, comments)
    assert r.keywords
    assert r.source == "comment"
    assert r.comment_index == 0
    assert getattr(r, "consensus_reason", None) == "yes_confirmation"


# first path when post is clean: any satire marker in a comment (e.g. /s)
def test_extract_keywords_from_comment_slash_s() -> None:
    r = extract_satire_keywords_post_then_comments(
        _NEUTRAL_POST,
        ["obvious joke lol /s"],
    )
    assert r.keywords
    assert r.source == "comment"
    assert r.comment_index == 0



# text detectors instance without running __init__ (no model load)
def _make_detector_for_heuristics():
    td = TextDetectors.__new__(TextDetectors)
    td._satire_heuristic_scan_fn = extract_satire_keywords_post_then_comments
    return td

# same raw AI probability: without comments the scan finds nothing; with meta-comments the heuristic applies a penalty (mirrors production)
def test_heuristic_lowers_ai_prob_only_when_comments_imply_satire(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("SLOPMOP_SATIRE_HEURISTIC", "1")
    monkeypatch.delenv("SLOPMOP_SATIRE_FORCE_WHEN_HUMAN", raising=False)
    strong = float(os.environ.get("SLOPMOP_SATIRE_HEURISTIC_PENALTY_STRONG", "0.35"))

    td = _make_detector_for_heuristics()
    human_max, ai_min = 0.40, 0.70
    raw = 0.85

    p0, _ = TextDetectors._adjust_prob_for_satire_heuristics(
        td, _NEUTRAL_POST, raw, human_max, ai_min, None
    )
    assert p0 == raw

    comments: List[str] = ["Is this satire? Yes, absolutely."]
    p1, _ = TextDetectors._adjust_prob_for_satire_heuristics(
        td, _NEUTRAL_POST, raw, human_max, ai_min, comments
    )
    assert p1 == pytest.approx(max(0.0, raw - strong), rel=0, abs=1e-9)
    assert p1 < p0

# heuristic is disabled: no penalty
def test_heuristic_skips_when_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SLOPMOP_SATIRE_HEURISTIC", "0")
    td = _make_detector_for_heuristics()
    raw = 0.85
    p, _ = TextDetectors._adjust_prob_for_satire_heuristics(
        td,
        _NEUTRAL_POST,
        raw,
        0.40,
        0.70,
        ["Is this satire? Yes."],
    )
    assert p == raw
