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

function makeResponse(
  postId: string,
  highlightedSpans?: DetectionResponse['explanation']['highlightedSpans'],
): DetectionResponse {
  return {
    requestId: 'req-1',
    postId,
    verdict: 'likely_ai',
    confidence: 0.9,
    explanation: {
      summary: 'Synthetic span test',
      ...(highlightedSpans !== undefined ? { highlightedSpans } : {}),
      model: { name: 't', version: '1' },
      cache: { hit: false, ttlRemainingMs: 0 },
      timing: { totalMs: 1, inferenceMs: 1 },
    },
  };
}

function setupPendingHighlightCase(
  postId: string,
  plain: string,
  textBody: HTMLElement,
  host: HTMLElement,
  preserveBodyDom?: boolean,
) {
  host.style.position = 'relative';
  if (!preserveBodyDom) {
    textBody.textContent = plain;
  }
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
  return { renderer, detectSurface };
}

/** In-post highlights run through prepareHighlightSpans (word snap + single-space bridge) before innerHTML or rich DOM. */
describe('OverlayRenderer + highlightedSpans', () => {
  const postId = 'post-highlight-1';

  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('innerHTML path: full-word range unchanged; verdict text on detect badge', () => {
    const plain = 'Hello world today.';
    const host = document.createElement('div');
    const textBody = document.createElement('div');
    const { renderer, detectSurface } = setupPendingHighlightCase(postId, plain, textBody, host);
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

  it('rich DOM path (<a> in body): full-word span wraps link text; verdict badge unchanged', () => {
    const plain = 'Hello world today.';
    const host = document.createElement('div');
    const textBody = document.createElement('div');
    textBody.innerHTML = 'Hello <a href="https://example.com/x">world</a> today.';
    mockInnerText(textBody, plain);
    const { renderer, detectSurface } = setupPendingHighlightCase(postId, plain, textBody, host, true);

    const res = makeResponse(postId, [{ start: 6, end: 11, score: 0.88 }]);
    renderer.renderResult(postId, res);

    const mark = textBody.querySelector('mark.slopmop-highlight');
    expect(mark).not.toBeNull();
    expect(mark?.textContent).toBe('world');
    expect(textBody.querySelector('a')?.contains(mark ?? null)).toBe(true);

    expect(detectSurface.textContent).toContain('likely_ai');
    expect(detectSurface.textContent).toContain('90%');
  });

  it('no highlightedSpans (omitted or empty): verdict/confidence only; no mark; no throw', () => {
    const plain = 'Alpha beta gamma.';

    for (const res of [makeResponse('post-no-span-omit'), makeResponse('post-no-span-empty', [])]) {
      const host = document.createElement('div');
      const textBody = document.createElement('div');
      const { renderer, detectSurface } = setupPendingHighlightCase(res.postId, plain, textBody, host);
      const bodyHtmlAfterPending = textBody.innerHTML;

      expect(() => renderer.renderResult(res.postId, res)).not.toThrow();
      expect(textBody.querySelectorAll('mark.slopmop-highlight')).toHaveLength(0);
      expect(textBody.querySelector('mark')).toBeNull();
      expect(textBody.innerHTML).toBe(bodyHtmlAfterPending);
      expect(detectSurface.textContent).toContain('likely_ai');
      expect(detectSurface.textContent).toContain('90%');

      host.remove();
    }
  });

  it('invalid spans are ignored; valid span still applied; no throw', () => {
    const plain = 'Hello world today.';
    const host = document.createElement('div');
    const textBody = document.createElement('div');
    const pid = 'post-invalid-mix';
    const { renderer, detectSurface } = setupPendingHighlightCase(pid, plain, textBody, host);

    const spans = [
      { start: -2, end: 3, score: 1 },
      { start: 100, end: 200, score: 1 },
      { start: 11, end: 6, score: 1 },
      { start: 6, end: 11, score: 0.9 },
    ];

    const res = makeResponse(pid, spans);
    expect(() => renderer.renderResult(pid, res)).not.toThrow();

    const mark = textBody.querySelector('mark.slopmop-highlight');
    expect(mark).not.toBeNull();
    expect(mark?.textContent).toBe('world');
    expect(detectSurface.textContent).toContain('likely_ai');
  });

  it('partial-word span snaps to full word in innerHTML path', () => {
    const plain = 'Hello world today.';
    const host = document.createElement('div');
    const textBody = document.createElement('div');
    const pid = 'post-partial-word';
    const { renderer } = setupPendingHighlightCase(pid, plain, textBody, host);

    const res = makeResponse(pid, [{ start: 7, end: 10, score: 0.85 }]);
    renderer.renderResult(pid, res);

    const mark = textBody.querySelector('mark.slopmop-highlight');
    expect(mark).not.toBeNull();
    expect(mark?.textContent).toBe('world');
  });

  it('two adjacent words with one space between become one continuous highlight', () => {
    const plain = 'Hello world today.';
    const host = document.createElement('div');
    const textBody = document.createElement('div');
    const pid = 'post-bridge-space';
    const { renderer } = setupPendingHighlightCase(pid, plain, textBody, host);

    const res = makeResponse(pid, [
      { start: 6, end: 11, score: 0.9 },
      { start: 12, end: 17, score: 0.7 },
    ]);
    renderer.renderResult(pid, res);

    const marks = textBody.querySelectorAll('mark.slopmop-highlight');
    expect(marks).toHaveLength(1);
    expect(marks[0]?.textContent).toBe('world today');
  });

  it('only invalid spans: no marks; no throw', () => {
    const plain = 'Short.';
    const host = document.createElement('div');
    const textBody = document.createElement('div');
    const pid = 'post-invalid-only';
    const { renderer, detectSurface } = setupPendingHighlightCase(pid, plain, textBody, host);
    const htmlBefore = textBody.innerHTML;

    const res = makeResponse(pid, [
      { start: -1, end: 2, score: 1 },
      { start: 3, end: 1, score: 1 },
      { start: 0, end: 99, score: 1 },
    ]);
    expect(() => renderer.renderResult(pid, res)).not.toThrow();
    expect(textBody.querySelectorAll('mark.slopmop-highlight')).toHaveLength(0);
    expect(textBody.innerHTML).toBe(htmlBefore);
    expect(detectSurface.textContent).toContain('likely_ai');
  });
});
