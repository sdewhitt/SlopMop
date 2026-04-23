import { describe, expect, it } from 'vitest';
import { buildHighlightedHtml, prepareHighlightSpans } from '@src/utils/highlightSpans';

describe('prepareHighlightSpans', () => {
  it('expands a partial word to the full word (Unicode letters)', () => {
    const plain = 'Hello world today.';
    const got = prepareHighlightSpans(plain, [{ start: 7, end: 10, score: 0.9 }]);
    expect(got).toEqual([{ start: 6, end: 11, score: 0.9 }]);
    expect(plain.slice(got[0]!.start, got[0]!.end)).toBe('world');
  });

  it('merges two highlights separated by exactly one ASCII space (space is included)', () => {
    const plain = 'Hello world today.';
    const got = prepareHighlightSpans(plain, [
      { start: 6, end: 11, score: 0.9 },
      { start: 12, end: 17, score: 0.8 },
    ]);
    expect(got).toHaveLength(1);
    expect(plain.slice(got[0]!.start, got[0]!.end)).toBe('world today');
    expect(got[0]!.score).toBe(0.9);
  });

  it('when bridging, keeps the higher of the two scores', () => {
    const plain = 'Hello world today.';
    const got = prepareHighlightSpans(plain, [
      { start: 6, end: 11, score: 0.5 },
      { start: 12, end: 17, score: 0.95 },
    ]);
    expect(got).toHaveLength(1);
    expect(got[0]!.score).toBe(0.95);
  });

  it('merges overlapping API spans after each is expanded to full words', () => {
    const plain = 'the quick brown';
    const got = prepareHighlightSpans(plain, [
      { start: 5, end: 7, score: 0.5 },
      { start: 6, end: 8, score: 0.8 },
    ]);
    expect(got).toEqual([{ start: 4, end: 9, score: 0.8 }]);
    expect(plain.slice(4, 9)).toBe('quick');
  });

  it('treats underscore as part of a word (snake_case)', () => {
    const plain = 'use snake_case here';
    const got = prepareHighlightSpans(plain, [{ start: 5, end: 10, score: 1 }]);
    expect(got).toHaveLength(1);
    expect(plain.slice(got[0]!.start, got[0]!.end)).toBe('snake_case');
  });

  it('does not bridge when the gap is two spaces', () => {
    const plain = 'Hello  world';
    const got = prepareHighlightSpans(plain, [
      { start: 0, end: 5, score: 0.5 },
      { start: 7, end: 12, score: 0.6 },
    ]);
    expect(got).toHaveLength(2);
  });

  it('drops spans that contain no letters or numbers after snapping', () => {
    const plain = 'Hi --- there';
    const got = prepareHighlightSpans(plain, [{ start: 3, end: 6, score: 1 }]);
    expect(got).toEqual([]);
  });
});

describe('buildHighlightedHtml (uses prepareHighlightSpans)', () => {
  it('emits a single mark whose text includes the space between bridged words', () => {
    const plain = 'Hello world today.';
    const html = buildHighlightedHtml(plain, [
      { start: 6, end: 11, score: 0.9 },
      { start: 12, end: 17, score: 0.7 },
    ]);
    expect(html).toContain('mark class="slopmop-highlight">world today</mark>');
    expect(html).toMatch(/^Hello /);
    expect(html.endsWith('.')).toBe(true);
  });

  it('snaps partial-word API spans before wrapping in mark', () => {
    const plain = 'Hello world today.';
    const html = buildHighlightedHtml(plain, [{ start: 7, end: 10, score: 0.85 }]);
    expect(html).toContain('mark class="slopmop-highlight">world</mark>');
  });
});
