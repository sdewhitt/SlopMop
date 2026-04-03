# unit tests: visible comment text can trigger satire heuristics and lower the post's AI-like probability (same path as backend TextDetectors + satire_detector)

from __future__ import annotations

import os
import sys
from typing import List

import pytest
import torch

_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
_REPO_ROOT = os.path.normpath(os.path.join(_BACKEND_DIR, ".."))
_SATIRE_DIR = os.path.join(_REPO_ROOT, "model_training", "satire_detector")
_TEXT_MODEL_DIR = os.path.join(_REPO_ROOT, "model_training", "text_model")
_SATIRE_WEIGHTS = os.path.join(_SATIRE_DIR, "best_satire_detector.pt")

for _p in (_SATIRE_DIR, _TEXT_MODEL_DIR):
    if _p not in sys.path:
        sys.path.insert(0, _p)

from satire_detector import (  # noqa: E402  # pyright: ignore[reportMissingImports]
    SatireDetector,
    extract_satire_keywords_post_then_comments,
    extract_satire_markers_regex,
)
from text_detector import TextDetectors  # noqa: E402  # pyright: ignore[reportMissingImports]

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



# post with satire markers
_POST_KEYWORDS_AND_SATIRICAL = (
    "BREAKING: City Council Votes To Replace All Roads With Meme References. "
    "This parody of urban planning is peak satire and pure shitpost energy."
)

# post with satire markers but not satire
_POST_KEYWORDS_BUT_NOT_SATIRICAL = (
    "Regulation 12(b) defines permissible use of the satire exception. "
    "Parody is addressed in section 14. References to meme stocks and shitposting "
    "were removed from the final draft."
)

# neutral post with no satire markers
_CONTROL_NEUTRAL_NO_KEYWORDS = (
    "Quarterly sales were flat. We will revisit the forecast next week."
)


# check if the post has satire markers
def _has_satire_parody_meme_and_shitpost_markers(text: str) -> None:
    # get the satire markers
    hits = set(m.lower() for m in extract_satire_markers_regex(text))
    assert {"satire", "parody", "meme"}.issubset(hits), f"expected keyword hits, got {hits}"
    assert hits & {"shitpost", "shitposting", "shit post"}, f"expected shit-post style hit, got {hits}"


# pytest fixture for the neural satire detector
@pytest.fixture(scope="module")
def neural_satire_detector():
    # check if the satire weights file exists
    if not os.path.isfile(_SATIRE_WEIGHTS):
        # skip the test if the satire weights file does not exist
        pytest.skip(f"Missing satire weights: {_SATIRE_WEIGHTS}")
    os.environ["SLOPMOP_SATIRE_LOGIT_INDEX"] = "1"
    sd = SatireDetector()
    state = torch.load(_SATIRE_WEIGHTS, map_location=sd.device, weights_only=False)
    sd.model.load_state_dict(state, strict=True)
    sd.model.eval()
    return sd

# post with satire markers is identified as satire
def test_neural_post_with_keywords_is_identified_as_satire(neural_satire_detector) -> None:
    _has_satire_parody_meme_and_shitpost_markers(_POST_KEYWORDS_AND_SATIRICAL)
    label, p = neural_satire_detector.predict(_POST_KEYWORDS_AND_SATIRICAL, return_prob=True)
    assert label == "satire"
    assert p >= 0.5


# post with satire markers but not satire is identified as non-satire
def test_neural_post_with_keywords_but_non_satirical_register_is_not_satire(
    neural_satire_detector,
) -> None:
    _has_satire_parody_meme_and_shitpost_markers(_POST_KEYWORDS_BUT_NOT_SATIRICAL)
    label, p = neural_satire_detector.predict(_POST_KEYWORDS_BUT_NOT_SATIRICAL, return_prob=True)
    assert label == "non_satire"
    assert p < 0.5


# neutral post with no satire markers is identified as non-satire
def test_neural_control_neutral_post_without_keywords_is_not_satire(
    neural_satire_detector,
) -> None:
    assert extract_satire_markers_regex(_CONTROL_NEUTRAL_NO_KEYWORDS) == []
    label, p = neural_satire_detector.predict(_CONTROL_NEUTRAL_NO_KEYWORDS, return_prob=True)
    assert label == "non_satire"
    assert p < 0.5
