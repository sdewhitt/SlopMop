import type { HighlightSpan } from '@src/types/domain';

/** Shared by PostExtractor, highlight gate, and rich DOM mapping — keeps plain text aligned with API offsets. */
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

const WORD_CHAR_RE = /^[\p{L}\p{N}\p{M}_]$/u;
const HAS_ALNUM_RE = /[\p{L}\p{N}]/u;

function isWordChar(ch: string): boolean {
    return ch.length === 1 && WORD_CHAR_RE.test(ch);
}

function spanContainsLetterOrNumber(plain: string, start: number, end: number): boolean {
    return HAS_ALNUM_RE.test(plain.slice(start, end));
}

/** Expand [start, end) to include full words (Unicode letters / numbers / marks / _). */
function expandSpanToWordBounds(plain: string, start: number, end: number): { start: number; end: number } {
    const textLen = plain.length;
    let s = Math.max(0, Math.min(start, textLen));
    let e = Math.max(0, Math.min(end, textLen));
    if (s >= e) return { start: s, end: e };
    while (s > 0 && isWordChar(plain[s - 1]!)) s--;
    while (e < textLen && isWordChar(plain[e]!)) e++;
    return { start: s, end: e };
}

/** Merge regions separated by exactly one ASCII space so the gap is highlighted too. */
function bridgeSingleAsciiSpaceGaps(plain: string, spans: HighlightSpan[]): HighlightSpan[] {
    if (spans.length <= 1) return spans;
    const out: HighlightSpan[] = [];
    let cur = { ...spans[0]! };
    for (let i = 1; i < spans.length; i++) {
        const next = spans[i]!;
        const gapLen = next.start - cur.end;
        if (gapLen === 1 && plain[cur.end] === ' ') {
            cur.end = next.end;
            cur.score = Math.max(cur.score, next.score);
        } else {
            out.push(cur);
            cur = { ...next };
        }
    }
    out.push(cur);
    return out;
}

/**
 * Single pipeline for on-page highlights: validate/merge API spans, snap to whole words,
 * drop punctuation-only noise, re-merge, then bridge single-space gaps between words.
 */
export function prepareHighlightSpans(plainText: string, spans: HighlightSpan[]): HighlightSpan[] {
    const base = sanitizeHighlightSpans(spans, plainText.length);
    if (base.length === 0) return [];

    const expanded: HighlightSpan[] = [];
    for (const sp of base) {
        const { start, end } = expandSpanToWordBounds(plainText, sp.start, sp.end);
        if (start >= end || !spanContainsLetterOrNumber(plainText, start, end)) continue;
        expanded.push({ start, end, score: sp.score });
    }

    const merged = sanitizeHighlightSpans(expanded, plainText.length);
    return bridgeSingleAsciiSpaceGaps(plainText, merged);
}

export function buildHighlightedHtml(plainText: string, spans: HighlightSpan[]): string {
    if (plainText.length === 0) return '';
    const merged = prepareHighlightSpans(plainText, spans);
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
 * Tags whose layout matches browser `innerText` block boundaries (newline before next block sibling).
 * X/Twitter stacks lines as sibling <div>s; Reddit often uses flatter text — both must flatten the same way.
 */
const INNER_TEXT_BLOCK_TAGS = new Set<string>([
    'ADDRESS',
    'ARTICLE',
    'ASIDE',
    'BLOCKQUOTE',
    'DIV',
    'DD',
    'DL',
    'DT',
    'FIELDSET',
    'FIGCAPTION',
    'FIGURE',
    'FOOTER',
    'FORM',
    'H1',
    'H2',
    'H3',
    'H4',
    'H5',
    'H6',
    'HEADER',
    'HR',
    'LI',
    'MAIN',
    'NAV',
    'OL',
    'P',
    'PRE',
    'SECTION',
    'TABLE',
    'TD',
    'TH',
    'TR',
    'UL',
]);

function isInnerTextBlockElement(el: Element): boolean {
    return INNER_TEXT_BLOCK_TAGS.has(el.tagName);
}

/** Inline-by-default tags that feeds often set to `display:block` for line breaks (e.g. LinkedIn). */
const INNER_TEXT_BLOCKISH_INLINE_TAGS = new Set<string>(['SPAN', 'A']);

/**
 * `innerText` inserts line breaks before siblings that layout as block-level boxes.
 * Tag names miss CSS-driven blocks (LinkedIn stacks lines as `display:block` `<span>`s).
 * Only treat computed `display:block` on inline-default tags: flex-row items often compute
 * as `block` but sit on one line — a newline would desync `raw` from `innerText`.
 */
function needsInnerTextNewlineBeforeElement(el: Element): boolean {
    if (el.tagName === 'BR') return false;
    if (isInnerTextBlockElement(el)) return true;
    if (!(el instanceof HTMLElement)) return false;
    if (!INNER_TEXT_BLOCKISH_INLINE_TAGS.has(el.tagName)) return false;
    try {
        const st = getComputedStyle(el);
        const d = st.display;
        if (d === 'block' || d === 'list-item' || d === 'flow-root') {
            return true;
        }
        if (d === 'flex' || d === 'inline-flex') {
            const dir = st.flexDirection;
            return dir === 'column' || dir === 'column-reverse';
        }
        if (d === 'grid') {
            return true;
        }
    } catch {
        /* detached / iframe edge */
    }
    return false;
}

/**
 * Build a string from text nodes + `<br>` as `\n`, and newlines between block-level siblings
 * (same convention as `innerText` for typical feed markup).
 * Must normalize to the same `plain` as `normalizePlainText(element.innerText)`.
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
        const children = Array.from(el.childNodes);
        for (let i = 0; i < children.length; i++) {
            const c = children[i]!;
            if (
                i > 0 &&
                c.nodeType === Node.ELEMENT_NODE &&
                needsInnerTextNewlineBeforeElement(c as Element) &&
                raw.length > 0 &&
                !raw.endsWith('\n')
            ) {
                raw += '\n';
            }
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

/** Map `/detect` spans (model-preprocessed string) onto `normalizePlainText(innerText)` for DOM walks. */
function remapHighlightSpansModelPlainToDisplayPlain(
    modelPlain: string,
    displayPlain: string,
    spans: HighlightSpan[],
): HighlightSpan[] {
    const base = sanitizeHighlightSpans(spans, modelPlain.length);
    if (base.length === 0) return [];

    const flexIndexOf = (haystack: string, needle: string, from: number): number => {
        if (!needle) return -1;
        const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const flex = escaped.replace(/\s+/g, '\\s+');
        let re: RegExp;
        try {
            re = new RegExp(flex, 'u');
        } catch {
            return -1;
        }
        const sub = haystack.slice(from);
        const m = sub.match(re);
        if (!m || m.index === undefined) return -1;
        return from + m.index;
    };

    const flexMatchLen = (haystack: string, needle: string, startIdx: number): number => {
        const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const flex = escaped.replace(/\s+/g, '\\s+');
        let re: RegExp;
        try {
            re = new RegExp(flex, 'u');
        } catch {
            return needle.length;
        }
        const m = haystack.slice(startIdx).match(re);
        return m ? m[0].length : needle.length;
    };

    const out: HighlightSpan[] = [];
    let searchFrom = 0;
    for (const s of base) {
        const frag = modelPlain.slice(s.start, s.end);
        if (!frag.trim()) continue;
        let idx = flexIndexOf(displayPlain, frag, searchFrom);
        if (idx < 0) idx = flexIndexOf(displayPlain, frag, 0);
        if (idx < 0) continue;
        const len = flexMatchLen(displayPlain, frag, idx);
        out.push({ start: idx, end: idx + len, score: s.score });
        searchFrom = idx + len;
    }
    return out;
}

/**
 * Apply `<mark class="slopmop-highlight">` around API span ranges while preserving links and markup.
 * Use when `canApplyInnerHtmlHighlights` is false (e.g. LinkedIn hashtags / mentions as `<a>`).
 *
 * @param modelPlain — `modelPreprocessText(innerText)` (same string sent to `/detect`); offsets are in this space.
 */
export function applyRichDomHighlightSpans(root: HTMLElement, modelPlain: string, spans: HighlightSpan[]): boolean {
    const displayPlain = normalizePlainText(root.innerText ?? '');
    const remapped = remapHighlightSpansModelPlainToDisplayPlain(modelPlain, displayPlain, spans);

    if (spans.length > 0 && remapped.length === 0) return false;

    let merged = prepareHighlightSpans(displayPlain, remapped);
    if (merged.length === 0) {
        merged = prepareHighlightSpans(displayPlain, sanitizeHighlightSpans(remapped, displayPlain.length));
    }
    if (merged.length === 0) {
        merged = sanitizeHighlightSpans(remapped, displayPlain.length);
    }
    if (merged.length === 0) return spans.length === 0;

    if (normalizePlainText(root.innerText ?? '') !== displayPlain) return false;

    const { raw, textSegments } = collectTextNodesWithBr(root);
    const noTrim = normalizePlainTextNoTrim(raw);
    if (noTrim.trim() !== displayPlain) return false;
    if (normalizePlainText(raw) !== displayPlain) return false;

    const lead = noTrim.length - noTrim.trimStart().length;

    const allOps: WrapOp[] = [];
    for (const sp of merged) {
        const mapped = mapPlainSpanToRawRange(raw, noTrim, lead, sp.start, sp.end);
        if (!mapped) return false;
        const [rawA, rawB] = mapped;
        if (rawA >= rawB) continue;
        allOps.push(...buildWrapOpsForRawRange(rawA, rawB, textSegments));
    }
    if (allOps.length === 0) return false;

    allOps.sort((a, b) => b.rawEnd - a.rawEnd);

    try {
        for (const op of allOps) {
            const range = document.createRange();
            range.setStart(op.node, op.start);
            range.setEnd(op.node, op.end);
            const mark = document.createElement('mark');
            mark.className = 'slopmop-highlight';
            range.surroundContents(mark);
        }
    } catch {
        return false;
    }
    return true;
}
