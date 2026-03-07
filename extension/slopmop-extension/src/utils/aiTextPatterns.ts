/**
 * Detects common AI-writing patterns in text to give users specific reasons
 * alongside confidence (e.g. "Frequent em dashes", "Common AI transition phrases").
 * Used to make explanations less generic when the backend doesn't provide them.
 */

/** Minimum number of em dashes in text to flag as a pattern */
const EM_DASH_THRESHOLD = 2;

/** Em dash character and common ASCII stand-in */
const EM_DASH = '\u2014';
const DOUBLE_HYPHEN = '--';

/** Phrases often seen in AI-generated text (case-insensitive substring match) */
const AI_PHRASES: Array<{ phrase: string; reason: string }> = [
  { phrase: "it's worth noting", reason: "Common AI phrase: \"it's worth noting\"" },
  { phrase: "it's important to note", reason: "Common AI phrase: \"it's important to note\"" },
  { phrase: "dive into", reason: "Common AI phrase: \"dive into\"" },
  { phrase: "in conclusion", reason: "Common AI phrase: \"in conclusion\"" },
  { phrase: "in today's world", reason: "Common AI phrase: \"in today's world\"" },
  { phrase: "digital landscape", reason: "Common AI phrase: \"digital landscape\"" },
  { phrase: "in the realm of", reason: "Common AI phrase: \"in the realm of\"" },
  { phrase: "nuanced", reason: "Common AI word: \"nuanced\"" },
  { phrase: "leverage", reason: "Common AI word: \"leverage\" (as verb)" },
  { phrase: "utilize", reason: "Common AI word: \"utilize\" (vs \"use\")" },
  { phrase: "furthermore", reason: "Common AI transition: \"furthermore\"" },
  { phrase: "moreover", reason: "Common AI transition: \"moreover\"" },
  { phrase: "comprehensive", reason: "Common AI word: \"comprehensive\"" },
  { phrase: "it's crucial", reason: "Common AI phrase: \"it's crucial\"" },
  { phrase: "plays a vital role", reason: "Common AI phrase: \"plays a vital role\"" },
];

/**
 * Returns human-readable reasons based on patterns found in the text.
 * Empty array if no patterns detected or text is too short.
 */
export function getPatternReasons(text: string): string[] {
  if (!text || typeof text !== 'string') return [];
  const trimmed = text.trim();
  if (trimmed.length < 20) return [];

  const reasons: string[] = [];
  const lower = trimmed.toLowerCase();

  // Em dashes: count Unicode em dash and double-hyphen
  const emDashCount = (trimmed.match(new RegExp(EM_DASH.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
  const doubleHyphenCount = (trimmed.match(/--/g) || []).length;
  const totalDashes = emDashCount + doubleHyphenCount;
  if (totalDashes >= EM_DASH_THRESHOLD) {
    reasons.push(`Frequent use of em dashes (${totalDashes} in text)`);
  }

  // AI phrases: first match wins per phrase to avoid duplicate reasons
  for (const { phrase, reason } of AI_PHRASES) {
    if (lower.includes(phrase)) {
      reasons.push(reason);
      break; // one phrase-based reason is enough to avoid clutter
    }
  }

  return reasons;
}

/**
 * Formats pattern reasons for display (e.g. in popup or tooltip).
 * Returns empty string if no reasons.
 */
export function formatPatternReasons(reasons: string[]): string {
  if (!reasons.length) return '';
  return `Patterns observed: ${reasons.join('; ')}.`;
}
