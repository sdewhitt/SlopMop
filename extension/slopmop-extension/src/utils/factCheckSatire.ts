import type { FactCheckItem, SatireLabel, SatireSignal } from '@src/types/domain';

/**
 * Thresholds are intentionally conservative:
 * - soften (0.55): mild nudge once satire is more-likely-than-not, without hiding information.
 * - banner (0.72): only show prominent copy when satire is strongly indicated to avoid desensitizing users.
 */
export const SATIRE_SCORE_SOFTEN_THRESHOLD = 0.55;

/** Above this, show prominent “likely satire” banner copy. */
export const SATIRE_SCORE_HIGH_BANNER_THRESHOLD = 0.72;

export interface SatireCheckApiShape {
    satire_score: number;
    label: string;
    explanation: string;
}

function mapApiLabelToSatireLabel(label: string): SatireLabel {
    const l = (label ?? '').toLowerCase();
    if (l === 'satire') return 'satire';
    if (l === 'non_satire' || l === 'non-satire') return 'non_satire';
    return 'unknown';
}

export function satireSignalFromApiResponse(
    r: SatireCheckApiShape,
    source: SatireSignal['source'] = 'model',
): SatireSignal {
    const score = Math.min(1, Math.max(0, Number(r.satire_score)));
    return {
        score,
        label: mapApiLabelToSatireLabel(r.label),
        source,
        explanation: r.explanation,
        model: source === 'model' ? { name: 'satire-onnx', version: '1' } : undefined,
        computedAtMs: Date.now(),
    };
}

function negativeVerdictRank(it: FactCheckItem): number {
    const blob = `${it.verdict} ${it.claim}`.toLowerCase();
    if (
        /pants on fire|false|four pinocchios|incorrect|wrong|not true|debunked|fraudulent|hoax|fabricated/.test(
            blob,
        )
    ) {
        return 2;
    }
    if (/misleading|missing context|unproven|disputed|mixed|unclear|out of context/.test(blob)) {
        return 1;
    }
    return 0;
}

/** When satire is elevated, push harsh-looking index verdicts toward the end of the list. */
export function sortFactCheckItemsForSatire(items: FactCheckItem[], satireScore: number): FactCheckItem[] {
    if (satireScore < SATIRE_SCORE_SOFTEN_THRESHOLD || items.length <= 1) {
        return items;
    }
    return [...items].sort((a, b) => negativeVerdictRank(a) - negativeVerdictRank(b));
}

export function isStrongNegativeFactCheckVerdict(verdict: string): boolean {
    const v = (verdict ?? '').toLowerCase();
    return /pants on fire|false|four pinocchios|incorrect|wrong|not true|debunked|fraudulent|hoax|fabricated/.test(
        v,
    );
}

/** UI line for verdict row when satire is high — avoids reading index hits as “misinformation”. */
export function softenFactCheckVerdictDisplay(verdict: string, satireScore: number): string {
    const trimmed = (verdict ?? '').trim();
    if (!trimmed || satireScore < SATIRE_SCORE_SOFTEN_THRESHOLD) return trimmed;
    if (!isStrongNegativeFactCheckVerdict(trimmed)) return trimmed;
    return `${trimmed} · index match (may not apply if post is satire/parody)`;
}
