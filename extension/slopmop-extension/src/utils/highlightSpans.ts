import type { HighlightSpan } from '@src/types/domain';

/** Same rules as PostExtractor.normalizeText — keeps DOM plain text aligned with API offsets. */
export function normalizePlainText(raw: string): string {
    if (!raw) return '';
    let text = raw;
    text = text.replace(/[ \t]+/g, ' ');
    text = text.replace(/\n{2,}/g, '\n\n');
    text = text.replace(/\n /g, '\n');
    return text.trim();
}

export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function sanitizeHighlightSpans(spans: HighlightSpan[], textLen: number): HighlightSpan[] {
    if (textLen <= 0 || spans.length === 0) return [];
    const valid = spans.filter(
        (s) =>
            Number.isFinite(s.start) &&
            Number.isFinite(s.end) &&
            Number.isFinite(s.score) &&
            s.start >= 0 &&
            s.end <= textLen &&
            s.start < s.end &&
            Number.isInteger(s.start) &&
            Number.isInteger(s.end),
    );
    if (valid.length === 0) return [];
    valid.sort((a, b) => a.start - b.start || b.end - b.end);
    const merged: HighlightSpan[] = [];
    let cur = { ...valid[0] };
    for (let i = 1; i < valid.length; i++) {
        const s = valid[i];
        if (s.start <= cur.end) {
            cur.end = Math.max(cur.end, s.end);
            cur.score = Math.max(cur.score, s.score);
        } else {
            merged.push(cur);
            cur = { ...s };
        }
    }
    merged.push(cur);
    return merged;
}

export function buildHighlightedHtml(plainText: string, spans: HighlightSpan[]): string {
    if (plainText.length === 0) return '';
    const merged = sanitizeHighlightSpans(spans, plainText.length);
    if (merged.length === 0) return escapeHtml(plainText);

    let html = '';
    let cursor = 0;
    for (const sp of merged) {
        if (sp.start > cursor) {
            html += escapeHtml(plainText.slice(cursor, sp.start));
        }
        html +=
            '<mark class="slopmop-highlight">' +
            escapeHtml(plainText.slice(sp.start, sp.end)) +
            '</mark>';
        cursor = sp.end;
    }
    if (cursor < plainText.length) {
        html += escapeHtml(plainText.slice(cursor));
    }
    return html;
}

/** Avoid replacing complex post bodies (links, media) where innerHTML would strip structure. */
export function canApplyInnerHtmlHighlights(el: HTMLElement): boolean {
    if (el.querySelector('a, button, img, video, iframe, svg')) {
        return false;
    }
    return true;
}
