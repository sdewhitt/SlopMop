import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyRichDomHighlightSpans } from '@src/utils/highlightSpans';
import { modelPreprocessText } from '@src/utils/modelPreprocessText';

function mockInnerText(el: HTMLElement, value: string): void {
  Object.defineProperty(el, 'innerText', {
    configurable: true,
    get: () => value,
  });
}

describe('applyRichDomHighlightSpans', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('wraps spans across plain text that includes an inline link (LinkedIn-style)', () => {
    const root = document.createElement('div');
    root.innerHTML =
      'Hello <a href="https://example.com/tag">world</a> today.';
    document.body.appendChild(root);
    const plain = 'Hello world today.';
    mockInnerText(root, plain);

    const ok = applyRichDomHighlightSpans(root, modelPreprocessText(plain), [{ start: 6, end: 11, score: 0.9 }]);
    expect(ok).toBe(true);

    const mark = root.querySelector('mark.slopmop-highlight');
    expect(mark).not.toBeNull();
    expect(mark?.textContent).toBe('world');
    expect(root.querySelector('a')?.contains(mark ?? null)).toBe(true);
    root.remove();
  });

  it('inserts newlines between block sibling divs (X/Twitter-style) so raw matches innerText', () => {
    const root = document.createElement('div');
    root.innerHTML = '<div><span>First</span></div><div><span>Second</span></div>';
    document.body.appendChild(root);
    // Browsers report a newline between block siblings; jsdom innerText is often empty/incomplete.
    const plain = 'First\nSecond';
    mockInnerText(root, plain);

    const ok = applyRichDomHighlightSpans(root, modelPreprocessText(plain), [{ start: 0, end: 5, score: 0.5 }]);
    expect(ok).toBe(true);
    expect(root.querySelector('mark')?.textContent).toBe('First');
    root.remove();
  });

  it('inserts newlines between display:block sibling spans (LinkedIn-style line stacks)', () => {
    const root = document.createElement('div');
    root.innerHTML = '<span>First</span><span>Second</span>';
    document.body.appendChild(root);
    const plain = 'First\nSecond';
    mockInnerText(root, plain);

    const orig = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element, pseudoElt?: string | null) => {
      if (pseudoElt == null && el instanceof HTMLElement && el.tagName === 'SPAN' && root.contains(el)) {
        return { display: 'block', flexDirection: 'row' } as CSSStyleDeclaration;
      }
      return orig(el, pseudoElt);
    });

    const ok = applyRichDomHighlightSpans(root, modelPreprocessText(plain), [{ start: 6, end: 12, score: 0.5 }]);
    expect(ok).toBe(true);
    expect(root.querySelector('mark')?.textContent).toBe('Second');
    root.remove();
  });

  it('maps line breaks from <br> to the same normalized plain as innerText', () => {
    const root = document.createElement('div');
    root.innerHTML = 'Line one<br>Line two';
    document.body.appendChild(root);
    const plain = 'Line one\nLine two';
    mockInnerText(root, plain);

    const ok = applyRichDomHighlightSpans(root, modelPreprocessText(plain), [{ start: 0, end: 8, score: 0.5 }]);
    expect(ok).toBe(true);
    expect(root.querySelector('mark')?.textContent).toBe('Line one');
    root.remove();
  });

  it('returns false when plain does not match normalized body text', () => {
    const root = document.createElement('div');
    root.textContent = 'alpha';
    document.body.appendChild(root);
    mockInnerText(root, 'alpha');
    const ok = applyRichDomHighlightSpans(root, modelPreprocessText('beta'), [{ start: 0, end: 1, score: 0.1 }]);
    expect(ok).toBe(false);
    root.remove();
  });

  it('prepareHighlightSpans: partial-word API span snaps to full word inside <a>', () => {
    const root = document.createElement('div');
    root.innerHTML = 'Hello <a href="https://example.com/x">world</a> today.';
    document.body.appendChild(root);
    const plain = 'Hello world today.';
    mockInnerText(root, plain);

    const ok = applyRichDomHighlightSpans(root, modelPreprocessText(plain), [{ start: 7, end: 10, score: 0.85 }]);
    expect(ok).toBe(true);

    const mark = root.querySelector('mark.slopmop-highlight');
    expect(mark).not.toBeNull();
    expect(mark?.textContent).toBe('world');
    expect(root.querySelector('a')?.contains(mark ?? null)).toBe(true);
    root.remove();
  });
});
