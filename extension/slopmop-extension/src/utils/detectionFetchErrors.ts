/**
 * Convert unknown fetch/runtime errors into concise, user-facing detection errors.
 */
export function formatDetectionFetchError(err: unknown): string {
  if (err instanceof Error) {
    const message = err.message?.trim();
    if (!message) return 'detection request failed';

    const lower = message.toLowerCase();
    if (lower === 'http 502' || lower.startsWith('http 502 ')) {
      return 'detection backend returned 502 (bad gateway): upstream model/service failed or was unreachable';
    }
    if (lower === 'http 503' || lower.startsWith('http 503 ')) {
      return 'detection backend returned 503 (service unavailable): backend is starting, overloaded, or model is unavailable';
    }
    if (lower.includes('failed to fetch') || lower.includes('networkerror')) {
      return 'network error while contacting detection API';
    }
    if (lower.includes('aborted')) {
      return 'detection request timed out';
    }

    return message;
  }

  if (typeof err === 'string' && err.trim()) {
    return err.trim();
  }

  return 'detection request failed';
}
