import { describe, it, expect, vi, afterEach } from 'vitest';
import { FactCheckApiError, satireCheckText } from '@src/lib/api';

describe('satireCheckText (unit)', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns payload on 200 JSON', async () => {
    const payload = {
      satire_score: 0.82,
      label: 'satire',
      explanation: 'SlopMop satire classifier: 82% satire-likelihood.',
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => payload,
    }) as unknown as typeof fetch;

    await expect(satireCheckText('Some post text.')).resolves.toEqual(payload);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toContain('/satire-check');
    expect((init as RequestInit).method).toBe('POST');
  });

  it('throws FactCheckApiError on 503 without retrying', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ detail: 'Satire model is not available' }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(satireCheckText('text')).rejects.toMatchObject({
      name: 'FactCheckApiError',
      status: 503,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries on 502 then succeeds (transient)', async () => {
    const okPayload = {
      satire_score: 0.12,
      label: 'non_satire',
      explanation: 'ok',
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        json: async () => ({ detail: 'Bad gateway' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => okPayload,
      });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(satireCheckText('text')).resolves.toEqual(okPayload);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  }, 20_000);
});
