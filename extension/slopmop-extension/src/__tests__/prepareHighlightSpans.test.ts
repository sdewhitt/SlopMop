import { describe, expect, it } from 'vitest';
import { prepareHighlightSpans } from '@src/utils/highlightSpans';

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
