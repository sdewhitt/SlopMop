import { describe, expect, it } from 'vitest';
import { applyRichDomHighlightSpans } from '@src/utils/highlightSpans';

function mockInnerText(el: HTMLElement, value: string): void {
  Object.defineProperty(el, 'innerText', {
    configurable: true,
    get: () => value,
  });
}

describe('applyRichDomHighlightSpans', () => {
  it('wraps spans across plain text that includes an inline link (LinkedIn-style)', () => {
    const root = document.createElement('div');
    root.innerHTML =
      'Hello <a href="https://example.com/tag">world</a> today.';
    document.body.appendChild(root);
    const plain = 'Hello world today.';
    mockInnerText(root, plain);

    const ok = applyRichDomHighlightSpans(root, plain, [{ start: 6, end: 11, score: 0.9 }]);
    expect(ok).toBe(true);

    const mark = root.querySelector('mark.slopmop-highlight');
    expect(mark).not.toBeNull();
    expect(mark?.textContent).toBe('world');
    expect(root.querySelector('a')?.contains(mark ?? null)).toBe(true);
    root.remove();
  });

  it('maps line breaks from <br> to the same normalized plain as innerText', () => {
    const root = document.createElement('div');
    root.innerHTML = 'Line one<br>Line two';
    document.body.appendChild(root);
    const plain = 'Line one\nLine two';
    mockInnerText(root, plain);

    const ok = applyRichDomHighlightSpans(root, plain, [{ start: 0, end: 8, score: 0.5 }]);
    expect(ok).toBe(true);
    expect(root.querySelector('mark')?.textContent).toBe('Line one');
    root.remove();
  });

  it('returns false when plain does not match normalized body text', () => {
    const root = document.createElement('div');
    root.textContent = 'alpha';
    document.body.appendChild(root);
    mockInnerText(root, 'alpha');
    const ok = applyRichDomHighlightSpans(root, 'beta', [{ start: 0, end: 1, score: 0.1 }]);
    expect(ok).toBe(false);
    root.remove();
  });

  it('prepareHighlightSpans: partial-word API span snaps to full word inside <a>', () => {
    const root = document.createElement('div');
    root.innerHTML = 'Hello <a href="https://example.com/x">world</a> today.';
    document.body.appendChild(root);
    const plain = 'Hello world today.';
    mockInnerText(root, plain);

    const ok = applyRichDomHighlightSpans(root, plain, [{ start: 7, end: 10, score: 0.85 }]);
    expect(ok).toBe(true);

    const mark = root.querySelector('mark.slopmop-highlight');
    expect(mark).not.toBeNull();
    expect(mark?.textContent).toBe('world');
    expect(root.querySelector('a')?.contains(mark ?? null)).toBe(true);
    root.remove();
  });
});
