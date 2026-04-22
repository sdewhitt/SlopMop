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
    // Reddit projects post bodies through custom elements like
    // `<shreddit-post-rtjson-content>`; LinkedIn / X have similar
    // `faceplate-*` / `<shreddit-*>` wrappers. Their shadow DOM + CSS depend
    // on that element structure, so replacing innerHTML with our flattened
    // `<mark>...</mark>text` string keeps the text in the DOM but leaves it
    // visually invisible. Custom elements always have a hyphen in the tag
    // name, so bail whenever we see one and let the rich-DOM path (or a
    // silent no-op) handle the post instead. We also bail when `el` itself
    // is the custom element — on modern Reddit the `slot="text-body"`
    // attribute sits directly on `<shreddit-post-rtjson-content>` (no plain
    // `<div>` wrapper), so a descendants-only check misses it.
    if (el.tagName.includes('-')) return false;
    const descendants = el.querySelectorAll('*');
    for (const node of descendants) {
        if (node.tagName.includes('-')) return false;
    }
    return true;
}

/** Same collapse rules as normalizePlainText but no final trim — prefix slices align with full normalization. */
function normalizePlainTextNoTrim(raw: string): string {
    if (!raw) return '';
    let text = raw;
    text = text.replace(/[ \t]+/g, ' ');
    text = text.replace(/\n{2,}/g, '\n\n');
    text = text.replace(/\n /g, '\n');
    return text;
}

/**
 * Smallest j in [0, raw.length] such that normalizePlainTextNoTrim(raw.slice(0, j)) === noTrim.slice(0, k).
 * Used to map indices in the normalized (trimmed) plain string back to raw character offsets.
 */
function minJForNoTrimPrefix(raw: string, noTrim: string, k: number): number | null {
    if (k <= 0) return 0;
    if (k > noTrim.length) return null;
    const target = noTrim.slice(0, k);
    for (let j = 0; j <= raw.length; j++) {
        if (normalizePlainTextNoTrim(raw.slice(0, j)) === target) return j;
    }
    return null;
}

type TextSeg = { node: Text; rawStart: number; rawEnd: number };

/**
 * Build a string from text nodes + `<br>` as `\n` (common LinkedIn / rich-inline layout).
 * Must normalize to the same `plain` the API used.
 */
function collectTextNodesWithBr(root: Element): { raw: string; textSegments: TextSeg[] } {
    const textSegments: TextSeg[] = [];
    let raw = '';

    const walk = (n: Node): void => {
        if (n.nodeType === Node.TEXT_NODE) {
            const t = n as Text;
            const s = t.nodeValue ?? '';
            const rs = raw.length;
            raw += s;
            textSegments.push({ node: t, rawStart: rs, rawEnd: raw.length });
            return;
        }
        if (n.nodeType !== Node.ELEMENT_NODE) return;
        const el = n as Element;
        if (el.tagName === 'BR') {
            raw += '\n';
            return;
        }
        for (const c of n.childNodes) {
            walk(c);
        }
    };
    walk(root);
    return { raw, textSegments };
}

type WrapOp = { rawEnd: number; node: Text; start: number; end: number };

function mapPlainSpanToRawRange(
    raw: string,
    noTrim: string,
    lead: number,
    start: number,
    end: number,
): [number, number] | null {
    const j0 = minJForNoTrimPrefix(raw, noTrim, lead + start);
    const j1 = minJForNoTrimPrefix(raw, noTrim, lead + end);
    if (j0 === null || j1 === null) return null;
    return [j0, j1];
}

function buildWrapOpsForRawRange(
    rawA: number,
    rawB: number,
    textSegments: TextSeg[],
): WrapOp[] {
    const ops: WrapOp[] = [];
    for (const seg of textSegments) {
        const lo = Math.max(seg.rawStart, rawA);
        const hi = Math.min(seg.rawEnd, rawB);
        if (lo >= hi) continue;
        ops.push({
            rawEnd: hi,
            node: seg.node,
            start: lo - seg.rawStart,
            end: hi - seg.rawStart,
        });
    }
    return ops;
}

/**
 * Apply `<mark class="slopmop-highlight">` around API span ranges while preserving links and markup.
 * Use when `canApplyInnerHtmlHighlights` is false (e.g. LinkedIn hashtags / mentions as `<a>`).
 */
export function applyRichDomHighlightSpans(root: HTMLElement, plain: string, spans: HighlightSpan[]): boolean {
    const merged = sanitizeHighlightSpans(spans, plain.length);
    if (merged.length === 0) return true;

    if (normalizePlainText(root.innerText ?? '') !== plain) return false;

    const { raw, textSegments } = collectTextNodesWithBr(root);
    const noTrim = normalizePlainTextNoTrim(raw);
    if (noTrim.trim() !== plain) return false;
    if (normalizePlainText(raw) !== plain) return false;

    const lead = noTrim.length - noTrim.trimStart().length;

    const allOps: WrapOp[] = [];
    for (const sp of merged) {
        const mapped = mapPlainSpanToRawRange(raw, noTrim, lead, sp.start, sp.end);
        if (!mapped) return false;
        const [rawA, rawB] = mapped;
        if (rawA >= rawB) continue;
        allOps.push(...buildWrapOpsForRawRange(rawA, rawB, textSegments));
    }
    if (allOps.length === 0) return true;

    allOps.sort((a, b) => b.rawEnd - a.rawEnd);

    for (const op of allOps) {
        const range = document.createRange();
        range.setStart(op.node, op.start);
        range.setEnd(op.node, op.end);
        const mark = document.createElement('mark');
        mark.className = 'slopmop-highlight';
        range.surroundContents(mark);
    }
    return true;
}
