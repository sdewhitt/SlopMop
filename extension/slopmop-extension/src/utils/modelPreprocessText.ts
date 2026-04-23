/**
 * Mirrors `model_training/text_model/text_detector.py` `preprocess_text`.
 * `/detect` runs attribution on this string; highlight offsets are only valid in this space.
 */

const URL_RE =
    /\b(?:https?:\/\/|www\.)?[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:\/[^\s]*[a-zA-Z0-9/_-])?/g;
const HTML_TAG_RE = /<[^>]*>/g;
const BRAILLE_RE = /[\u2800-\u28FF]+/g;
const DINGBATS_RE = /[\u2500-\u27BF]+/g;
const BOLD_THREE = '\u{1D7F9}';
const HEART_RE = new RegExp(
    `(^|\\s)</?\\s*[3${BOLD_THREE}]\\s*(?=\\s|$|[.,!?])`,
    'g',
);
const EMOTICON_RE =
    /(^|\s)(:3|:\)|:\)\)|:\(|:\(\(|:0|:-?[pdxo)(]|x-?d|;-?\))(?=\s|$|[.,!?])/gi;
const KATAKANA_FACE_RE =
    /[ツᴥꈍᴗꈊ・ω・｀ω´╥﹏╥⋆𝜗𝜚₊✩‧˚౨ৎ𓂃˖˳·ִֶָ𝟑ᐟ]+/g;
const EMPTY_BRACKETS_RE = /\(\s*\)|\[\s*\]|\{\s*\}/g;
const SHRUG_RE = /[\\_/<>\-¯]{2,}/g;
const HANDLE_RE = /@\w+/g;

function emojiRemoval(text: string): string {
    try {
        return text.replace(/\p{Extended_Pictographic}\uFE0F?/gu, '');
    } catch {
        return text;
    }
}

export function modelPreprocessText(raw: string): string {
    let text = raw;
    text = text.replace(URL_RE, '');
    text = text.replace(HTML_TAG_RE, '');
    text = text.replace(BRAILLE_RE, '');
    text = text.replace(DINGBATS_RE, '');
    text = text.replace(HEART_RE, '$1');
    text = text.replace(EMOTICON_RE, '$1');
    text = text.replace(KATAKANA_FACE_RE, '');
    text = text.replace(EMPTY_BRACKETS_RE, '');
    text = text.replace(SHRUG_RE, '');
    text = emojiRemoval(text);
    text = text.replace(HANDLE_RE, '');
    const cleanUp = text.replace(/\n+/g, ' ');
    return cleanUp.replace(/\s+/g, ' ').trim();
}
