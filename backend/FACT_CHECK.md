# Fact check integration

## Backend mode (`FACT_CHECK_MODE`)

| Value | Behavior |
|-------|----------|
| `google` (default) | [Google Claim Search](#chosen-google-api) — indexed ClaimReview only. |
| `llm` | [OpenAI JSON](#llm-mode-prototype) — structured claims + model verdicts; **no live sources**. |
| `gemini_wiki` | [Gemini + Wikipedia](#gemini--wikipedia-free-ish) — opinion vs factual + Wikipedia links. |

```env
FACT_CHECK_MODE=google
# or
FACT_CHECK_MODE=llm
OPENAI_API_KEY=sk-...
# optional:
OPENAI_FACT_CHECK_MODEL=gpt-4o-mini

# or (Google AI Studio key + free Wikipedia API)
FACT_CHECK_MODE=gemini_wiki
GEMINI_API_KEY=your_key_from_aistudio_google_com
# optional:
GEMINI_MODEL=gemini-2.0-flash
```

## Gemini + Wikipedia (“free-ish”)

**Plan**

1. **Gemini (Google AI Studio)** — Create an API key at [Google AI Studio](https://aistudio.google.com/). Generous free quotas for many models; check current [Gemini pricing](https://ai.google.dev/pricing) for your project.
2. **Classification** — One JSON call asks Gemini to label the post as **opinion** (subjective / no checkable fact) vs **factual** (at least one verifiable assertion). If opinion (or no claims parsed), the API returns a single row with **`verdict`: `Opinion detected`** (and optional reason), **`url`: empty** — same `FactCheckItem` shape the extension already expects.
3. **Wikipedia** — For each factual claim, the server calls the public **MediaWiki API** (`action=query&list=search`) with a proper **User-Agent** (required). No API key. The top article title becomes `https://en.wikipedia.org/wiki/...` as **`url`**; **`source`** like `Wikipedia: Article Title`. This is **context**, not a proof the claim is true.
4. **Limits** — English Wikipedia only; search can miss or surface tangentially related articles; Gemini can misclassify. Not for medical/legal decisions.

**Caveats**

- Wikipedia links are **search matches**, not ClaimReview-style fact verdicts.
- Keep **`GEMINI_API_KEY`** only on the server.

## Chosen Google API

- **Google Fact Check Tools — Claim Search** (`claims:search`): same index as [Fact Check Explorer](https://toolbox.google.com/factcheck/explorer).
- **Cost / limits:** Subject to [Google API](https://developers.google.com/fact-check/tools/api) quota; use server-side API key and monitor usage in Cloud Console.
- **Coverage:** Only claims that appear in publishers’ ClaimReview data; many social posts return **no** hits—expected.

## Server configuration

Set in `backend/.env` (local) or your host’s environment:

```env
GOOGLE_FACT_CHECK_API_KEY=your_key_here
```

Do **not** put this key in the browser extension; the extension calls `POST /fact-check` on the SlopMop backend only.

## Chunking

Post text is split into sentences, then **pairs of sentences** are sent as **one query** each (max 10 queries per request) to keep queries focused and quota use bounded.

## LLM mode (prototype)

- **Response shape** matches the extension: each row has `query_text`, `claim`, `verdict`, `source`, `url` (same as Google path).
- **Coverage**: The model infers checkable claims and gives **uncertainty-labeled** assessments. It does **not** browse the web; `url` is usually empty. Use for demos or when Claim Search has no index hits — not as legal/health “proof”.
- **Secrets**: Keep `OPENAI_API_KEY` only on the server (e.g. Render env), never in the extension.
