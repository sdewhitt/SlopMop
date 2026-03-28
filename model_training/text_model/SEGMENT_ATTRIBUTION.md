# Segment Attribution (Token Masking)

This document describes how we attribute AI detection scores to specific character spans in the input text.

## Method: Token Masking

We use **token masking** to compute per-token contributions to the model's AI probability:

1. **Tokenize** the text with `return_offsets_mapping=True` to get character offsets for each token.
2. **Baseline inference**: Run the model on the full input and record the AI probability.
3. **Per-token masking**: For each token (up to `max_tokens_to_evaluate`, default 64):
   - Replace the token with `[MASK]`.
   - Re-run inference.
   - Compute `contribution = baseline_prob - masked_prob`.
4. **Map to character spans**: Use `offset_mapping` from the tokenizer to convert token indices to `(start, end)` character offsets.
5. **Return top-k spans**: Sort by contribution and return the top 8 spans as `[(start, end, score), ...]`.

## Token→Character Mapping

- HuggingFace tokenizers return `offset_mapping` when `return_offsets_mapping=True`.
- For a single sequence, `offset_mapping[0]` is a list of `(start, end)` tuples, one per token.
- `(0, 0)` indicates special tokens (`[CLS]`, `[SEP]`, `[PAD]`) that we skip.
- Offsets are **character indices** in the original (preprocessed) text: `start` inclusive, `end` exclusive.

## Assumptions

- The model uses a BERT-style tokenizer (e.g., DistilBERT) with `[MASK]` support.
- If `mask_token_id` is `None`, we fall back to `pad_token_id`.
- We skip special tokens and `(0, 0)` offsets to avoid attributing to non-content.
- Contribution scores are clamped to `>= 0`; spans with contribution `< 0.001` are dropped.
- The same LLM metadata adjustment used in `calculate_confidence` is applied to the final confidence.

## Performance

- **O(n) inference calls** per request, where n = number of tokens evaluated (capped at 64).
- For longer texts, only the first 64 tokens are evaluated to bound latency.

## Implementation

- `TextDetectors.score_text_with_spans()` in `text_detector.py`
- `_get_raw_prob()` returns the raw model probability without LLM metadata adjustment
