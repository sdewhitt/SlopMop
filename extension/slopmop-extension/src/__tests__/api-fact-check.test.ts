import { describe, it, expect, vi, afterEach } from 'vitest';
import { FactCheckApiError, factCheckText } from '@src/lib/api';

describe('factCheckText (unit)', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns items on 200 JSON', async () => {
    const payload = {
      items: [
        {
          claim: 'Test claim',
          verdict: 'True',
          source: 'Example Org',
          url: 'https://example.com/fact',
        },
      ],
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => payload,
    }) as unknown as typeof fetch;

    await expect(factCheckText('Some post text.')).resolves.toEqual(payload);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toContain('/fact-check');
    expect((init as RequestInit).method).toBe('POST');
  });

  it('throws FactCheckApiError on 500 without retrying', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ detail: 'Internal error' }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(factCheckText('text')).rejects.toMatchObject({
      name: 'FactCheckApiError',
      status: 500,
      message: 'Internal error',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws on network failure (e.g. timeout) with a single fetch attempt', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('The operation was aborted'));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(factCheckText('text')).rejects.toThrow('The operation was aborted');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('429: FactCheckApiError with status 429 and no repeated fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ detail: 'Rate limited. Try again later.' }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    try {
      await factCheckText('text');
      expect.fail('should throw');
    } catch (e) {
      expect(e).toBeInstanceOf(FactCheckApiError);
      expect((e as FactCheckApiError).status).toBe(429);
      expect((e as Error).message).toContain('Rate limited');
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
