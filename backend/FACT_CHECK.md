# Fact check integration (Google Fact Check Tools)

## Chosen API

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
