import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectImage } from '@src/lib/api';

describe('detectImage model variants (unit)', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('sends mini model_variant by default', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        confidence: 0.12,
        label: 'human',
        explanation: 'Nonescape-mini classified this image as authentic with 12.0% confidence.',
        model_variant: 'mini',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await detectImage('ZmFrZQ==', 'image/jpeg');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [_url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.model_variant).toBe('mini');
  });

  it('sends full model_variant when requested', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        confidence: 0.83,
        label: 'ai',
        explanation: 'Nonescape classified this image as AI-generated with 83.0% confidence.',
        model_variant: 'full',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await detectImage('ZmFrZQ==', 'image/jpeg', 'full');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [_url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(String(init.body));
    expect(body.model_variant).toBe('full');
  });

  it('does not retry when backend reports full model unavailable', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({
        detail: 'Full image model is not available on this backend instance.',
      }),
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(detectImage('ZmFrZQ==', 'image/jpeg', 'full')).rejects.toThrow(
      /full image model is not available/i,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
