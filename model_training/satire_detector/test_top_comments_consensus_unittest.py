import os
import sys
import unittest
from typing import List, Tuple

# Avoid OpenMP shared-memory issues in constrained environments.
os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")
os.environ.setdefault("OMP_NUM_THREADS", "1")


_HERE = os.path.dirname(os.path.abspath(__file__))
if _HERE not in sys.path:
    sys.path.insert(0, _HERE)

from satire_comment_heuristics import extract_satire_keywords_post_then_comments  # type: ignore


class TestTopCommentsSatireConsensus(unittest.TestCase):
    def test_top3_two_of_three_confirms_satire(self) -> None:
        post = "Quarterly sales were flat. We will revisit the forecast next week."
        comments = [
            "This is satire.",
            "Is this satire? yes.",
            "lol",
        ]
        r = extract_satire_keywords_post_then_comments(post, comments)
        self.assertEqual(getattr(r, "consensus_reason", None), "top3_2of3")
        self.assertIn("satire_comment_top3_consensus", r.keywords)

    def test_top3_one_of_three_does_not_confirm(self) -> None:
        post = "Quarterly sales were flat. We will revisit the forecast next week."
        comments = [
            "This is satire.",
            "No idea what you're talking about.",
            "wow",
        ]
        r = extract_satire_keywords_post_then_comments(post, comments)
        self.assertNotEqual(getattr(r, "consensus_reason", None), "top3_2of3")

    def test_accuracy_at_least_65_percent_on_mini_set(self) -> None:
        """
        Accuracy check for the *comment-verification* rule only.
        This is a unit-style guardrail: if we break top-3 consensus detection, this should fail.
        """
        # Must not contain the literal word "satire" (otherwise the post-text scan triggers).
        post = "Neutral post body without markers."

        # (comment_texts, expected_confirmed)
        cases: List[Tuple[List[str], bool]] = [
            (["Is this satire? yes.", "this post is satire", "lol"], True),
            (["satire -> yes", "This is satire.", "ok"], True),
            (["This is satire.", "Is this satire? yes.", ""], True),
            (["this post is parody", "is this satire? yeah", "nice"], True),
            # requires 2/3 explicit confirmations; a single "satire" token is not enough
            (["is this a joke? yes", "this is satire", "cool"], True),
            (["this is satire", "is it satire? yes", "not sure"], True),
            # explicit negation in top 3 should block the 2/3 threshold
            (["not satire", "this is satire", "is this satire? yes"], False),
            (["this is satire", "no", "maybe"], False),
            (["no idea", "probably real", "wow"], False),
            (["is this satire? -> no", "no", "no"], False),
            (["satire?", "maybe", "idk"], False),
            (["parody? no", "nah", "stop"], False),
            (["this is satire", "nah it's real", "no"], False),
            (["/s", "lol", "ok"], False),  # markers exist but not explicit 2/3 confirmation
            (["this is satire", "", ""], False),
            ([], False),
        ]

        correct = 0
        for comment_texts, expected in cases:
            r = extract_satire_keywords_post_then_comments(post, comment_texts)
            got = getattr(r, "consensus_reason", None) == "top3_2of3"
            if got == expected:
                correct += 1

        acc = correct / max(1, len(cases))
        self.assertGreaterEqual(
            acc,
            0.65,
            msg=f"top-comments satire verification accuracy too low: {acc:.2%}",
        )


if __name__ == "__main__":
    unittest.main()

