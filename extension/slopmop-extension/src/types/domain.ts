// establish types for communication between classes, server/client, etc

export type PostId = string; 
export type SiteId = string; // website base URL like reddit.com
export type MediaType = "image" | "video" | "gif";
export enum ContentType {
    TEXT = "TEXT",
    IMAGE = "IMAGE",
    MIXED = "MIXED", 
    UNSUPPORTED = "UNSUPPORTED",
}
export enum DetectionMode {
    FAST = "FAST",
    ACCURATE = "ACCURATE",
}

export interface NormalizedPostContent {
    site: SiteId;
    postId: PostId;
    url: string;
    capturedAtMs: number;
    contentType: ContentType | string;
    text: {
      plain: string;
      languageHint: string;
    };
    images: Array<{
      imageId: string;
      bytesBase64: string;
      srcUrl: string;
      mimeType: string;
      mediaType?: MediaType;
    }>;
    domContext: {
      authorHandle: string;
      timestampText: string;
    };
    // visible comment bodies under this post (feed analysis) — sent to /detect for satire heuristics on the main score.
    commentTexts?: string[];
  }

export interface DetectionRequest {
    installId: string;
    requestId: string;
    site: SiteId;
    postId: PostId;
    contentType: ContentType;
    mode: DetectionMode;
    text: {
        plain: string;
    };
    images: Array<{
        imageId: string;
        bytesBase64: string;
        srcUrl: string;
        mimeType: string;
      mediaType?: MediaType;
    }>; 
    clientHints: {
        extensionVersion: string;
        platform: string;
    }
}

export type Verdict = "likely_ai" | "likely_human" | "unknown";

export interface HighlightSpan {
  start: number;
  end: number;
  score: number;
}

export interface ImageDetectionResult {
    verdict: Verdict;
    confidence: number;
    summary: string;
    model: { name: string; version: string };
    timingMs: number;
  mediaType?: MediaType;
}

export interface DetectionResponse {
    requestId: string;
    postId: PostId;
    verdict: Verdict;
    confidence: number;
    // false for preliminary updates that should not stop timeout/finalization handling.
    isFinal?: boolean;
  detectionSource?: "text" | MediaType;
    explanation: {
        summary: string;
        highlights?: Array<{
            start: number;
            end: number;
            reason: string;
        }>;
        highlightedSpans?: HighlightSpan[];
        model: {
            name: string;
            version: string;
        };
        cache: {
            hit: boolean;
            ttlRemainingMs: number;
        };
        timing: {
            totalMs: number;
            inferenceMs: number;
        }
    };
    imageResult?: ImageDetectionResult;
}
export interface FeedbackReport {
    installId: string;
    reportId: string;
    postId: PostId;
    site: SiteId;
    shownVerdict: "likely_ai" | "likely_human" | "unknown";
    userLabel: "ai" | "human" | "not_sure";
    notes: string;
    submittedAtMs: number;
    consent: {
      allowStoreContentSnippet: boolean;
    };
    contentSnippet: string;
  }
// standardized message from content script to background script. used by ExtensionMessageBus.ts
export type ContentToBackgroundMessage = // union type
    | { type: "ANALYZE_POST"; payload: NormalizedPostContent } 
    | { type: "SUBMIT_FEEDBACK"; payload: FeedbackReport };
    // add more message types here as needed
// When language is not supported (feed badge; popup uses storage)
export interface DetectionLanguageUnsupportedPayload {
  postId: PostId;
  message: string;
  /** ISO 639-3 from franc (e.g. spa for Spanish; not the same as BCP 47 es). */
  detectedCode: string;
  /** Top guess confidence 0–1 from francAll. */
  confidence: number;
  /** Human-readable name for feed tooltip, e.g. "German". */
  detectedLanguageName: string;
  /** Native `title` on the language badge (simple UI). */
  hoverSimple: string;
  /** Detailed tooltip header (detailed UI). */
  hoverTooltipTitle: string;
  /** Detailed tooltip body (detailed UI). */
  hoverTooltipBody: string;
}

/** One row from POST /fact-check (Google Claim Search–backed). */
export interface FactCheckItem {
    query_text: string;
    claim: string;
    verdict: string;
    source: string;
    url: string;
}

/**
 * Satire signal used to *downrank* or *soften* fact-check / misinformation UX.
 * This should never hard-block results; treat as a probabilistic hint.
 */
export type SatireLabel = 'satire' | 'non_satire' | 'unknown';
export type SatireSignalSource = 'model' | 'heuristic' | 'none' | 'unknown';

export interface SatireSignal {
  /** Probability in [0, 1] that the text is satire/parody. */
  score: number;
  /** Discrete label derived from `score` (and/or model output). */
  label: SatireLabel;
  /** Where this signal came from (neural model vs keyword / crowd heuristic). */
  source: SatireSignalSource;
  /** Optional: which markers contributed (e.g., "/s", "satire"). */
  markers?: string[];
  /** Optional: short explanation for UI/debugging. */
  explanation?: string;
  /** Optional: model descriptor when source is `model`. */
  model?: { name: string; version: string };
  /** Milliseconds since epoch when computed. */
  computedAtMs: number;
}

/**
 * Fact-check result envelope stored in `browser.storage.local.lastFactCheckResult`
 * and optionally pushed over the message bus to the active tab.
 */
export interface FactCheckResultPayload {
  postId: PostId;
  items: FactCheckItem[];
  /** Optional satire context to reduce false positives in UX. */
  satire?: SatireSignal;
  /** Optional: stable text-only fingerprint used for caching/replay debugging. */
  contentFingerprint?: string;
  /** Optional: platform hostname used for caching/debug. */
  site?: SiteId;
  updatedAtMs?: number;
}

// similar idea, but from background script to content script
export type BackgroundToContentMessage =
    | { type: "DETECTION_RESULT"; payload: DetectionResponse }
    | { type: "DETECTION_ERROR"; payload: { postId: PostId; message: string } }
    | { type: "DETECTION_LANGUAGE_UNSUPPORTED"; payload: DetectionLanguageUnsupportedPayload }
    | { type: "FACT_CHECK_RESULT"; payload: FactCheckResultPayload }
    | { type: "FACT_CHECK_ERROR"; payload: { postId: PostId; message: string; code?: string } };
  