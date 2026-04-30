import { describe, expect, it } from 'vitest';
import { formatDetectionFetchError } from '@src/utils/detectionFetchErrors';

describe('formatDetectionFetchError', () => {
  it('maps plain 502 errors to an actionable message', () => {
    const message = formatDetectionFetchError(new Error('HTTP 502'));
    expect(message).toContain('502');
    expect(message).toContain('upstream');
  });

  it('maps plain 503 errors to an actionable message', () => {
    const message = formatDetectionFetchError(new Error('HTTP 503 Service Unavailable'));
    expect(message).toContain('503');
    expect(message).toContain('model is unavailable');
  });

  it('maps plain 500 errors to an actionable message', () => {
    const message = formatDetectionFetchError(new Error('HTTP 500'));
    expect(message).toContain('500');
    expect(message).toContain('internal error');
  });

  it('preserves detailed backend messages', () => {
    const detailed = 'Full image model is not available on this backend instance.';
    expect(formatDetectionFetchError(new Error(detailed))).toBe(detailed);
  });

  it('normalizes fetch-level network errors', () => {
    const message = formatDetectionFetchError(new Error('Failed to fetch'));
    expect(message).toBe('network error while contacting detection API');
  });
});
