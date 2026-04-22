import { describe, it, expect } from 'vitest';
import type { FactCheckItem } from '@src/types/domain';
import {
  SATIRE_SCORE_SOFTEN_THRESHOLD,
  softenFactCheckVerdictDisplay,
  sortFactCheckItemsForSatire,
  satireSignalFromApiResponse,
} from '@src/utils/factCheckSatire';

describe('factCheckSatire utils', () => {
  it('satireSignalFromApiResponse clamps score and maps label', () => {
    const s = satireSignalFromApiResponse(
      { satire_score: 0.9, label: 'satire', explanation: 'e' },
      'model',
    );
    expect(s.score).toBe(0.9);
    expect(s.label).toBe('satire');
    expect(s.source).toBe('model');
    expect(s.computedAtMs).toBeGreaterThan(0);
  });

  it('sortFactCheckItemsForSatire deprioritizes harsh verdicts when score is high', () => {
    const items: FactCheckItem[] = [
      { query_text: '', claim: 'a', verdict: 'False', source: 's', url: 'u1' },
      { query_text: '', claim: 'b', verdict: 'Mostly true', source: 's', url: 'u2' },
    ];
    const sorted = sortFactCheckItemsForSatire(items, SATIRE_SCORE_SOFTEN_THRESHOLD + 0.01);
    expect(sorted[0].verdict).toBe('Mostly true');
    expect(sorted[1].verdict).toBe('False');
  });

  it('softenFactCheckVerdictDisplay leaves benign verdicts unchanged', () => {
    expect(softenFactCheckVerdictDisplay('Mostly true', 0.99)).toBe('Mostly true');
  });

  it('softenFactCheckVerdictDisplay softens strong negative verdicts when satire is high', () => {
    const out = softenFactCheckVerdictDisplay('False', SATIRE_SCORE_SOFTEN_THRESHOLD + 0.01);
    expect(out).toContain('satire');
    expect(out).toContain('False');
  });
});
