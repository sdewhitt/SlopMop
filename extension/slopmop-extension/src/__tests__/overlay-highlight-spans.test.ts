import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OverlayRenderer } from '../core/OverlayRenderer';
import type { DetectionResponse } from '../types/domain';
import { defaultUserSettings } from '../utils/userSettings';

function mockInnerText(el: HTMLElement, value: string): void {
  Object.defineProperty(el, 'innerText', {
    configurable: true,
    get: () => value,
  });
}

function makeResponse(postId: string, highlightedSpans: DetectionResponse['explanation']['highlightedSpans']): DetectionResponse {
  return {
    requestId: 'req-1',
    postId,
    verdict: 'likely_ai',
    confidence: 0.9,
    explanation: {
      summary: 'Synthetic span test',
      highlightedSpans: highlightedSpans ?? [],
      model: { name: 't', version: '1' },
      cache: { hit: false, ttlRemainingMs: 0 },
      timing: { totalMs: 1, inferenceMs: 1 },
    },
  };
}

describe('OverlayRenderer + valid highlightedSpans', () => {
  const postId = 'post-highlight-1';

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('innerHTML path: wraps exact range in post body and keeps verdict text on detect badge', () => {
    const plain = 'Hello world today.';
    const host = document.createElement('div');
    host.style.position = 'relative';
    const textBody = document.createElement('div');
    textBody.textContent = plain;
    mockInnerText(textBody, plain);
    host.appendChild(textBody);
    document.body.appendChild(host);

    const renderer = new OverlayRenderer({
      ...defaultUserSettings.settings,
      highlightSegments: true,
      uiMode: 'simple',
    });

    renderer.renderPending(postId, host, plain, () => {}, textBody);

    const detectSurface = host.querySelector('[data-slopmop-overlay="1"]') as HTMLElement;
    expect(detectSurface).not.toBeNull();
    expect(detectSurface.textContent).toContain('Detect Now');

    const res = makeResponse(postId, [{ start: 6, end: 11, score: 0.9 }]);
    renderer.renderResult(postId, res);

    const mark = textBody.querySelector('mark.slopmop-highlight');
    expect(mark).not.toBeNull();
    expect(mark?.textContent).toBe('world');
    expect(textBody.textContent).toContain('world');

    expect(detectSurface.textContent).toContain('likely_ai');
    expect(detectSurface.textContent).toContain('90%');
    expect(detectSurface.textContent).not.toContain('Detect Now');
  });

  it('rich DOM path (<a> in body): highlight targets correct range; verdict badge unchanged', () => {
    const plain = 'Hello world today.';
    const host = document.createElement('div');
    host.style.position = 'relative';
    const textBody = document.createElement('div');
    textBody.innerHTML = 'Hello <a href="https://example.com/x">world</a> today.';
    mockInnerText(textBody, plain);
    host.appendChild(textBody);
    document.body.appendChild(host);

    const renderer = new OverlayRenderer({
      ...defaultUserSettings.settings,
      highlightSegments: true,
      uiMode: 'simple',
    });

    renderer.renderPending(postId, host, plain, () => {}, textBody);

    const detectSurface = host.querySelector('[data-slopmop-overlay="1"]') as HTMLElement;
    expect(detectSurface).not.toBeNull();

    const res = makeResponse(postId, [{ start: 6, end: 11, score: 0.88 }]);
    renderer.renderResult(postId, res);

    const mark = textBody.querySelector('mark.slopmop-highlight');
    expect(mark).not.toBeNull();
    expect(mark?.textContent).toBe('world');
    expect(textBody.querySelector('a')?.contains(mark ?? null)).toBe(true);

    expect(detectSurface.textContent).toContain('likely_ai');
    expect(detectSurface.textContent).toContain('90%');
  });
});
