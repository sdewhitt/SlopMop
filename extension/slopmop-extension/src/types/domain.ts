// establish types for communication between classes, server/client, etc

export type PostId = string; 
export type SiteId = string; // website base URL like reddit.com
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
    contentType: ContentType;
    text: {
      plain: string;
      languageHint: string;
    };
    images: Array<{
      imageId: string;
      bytesBase64: string;
      srcUrl: string;
      mimeType: string;
    }>;
    domContext: {
      authorHandle: string;
      timestampText: string;
    };
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
    }>; 
    clientHints: {
        extensionVersion: string;
        platform: string;
    }
}

export type Verdict = "likely_ai" | "likely_human" | "unknown";

export interface ImageDetectionResult {
    verdict: Verdict;
    confidence: number;
    summary: string;
    model: { name: string; version: string };
    timingMs: number;
}

export interface DetectionResponse {
    requestId: string;
    postId: PostId;
    verdict: Verdict;
    confidence: number;
    explanation: {
        summary: string;
        highlights?: Array<{
            start: number;
            end: number;
            reason: string;
        }>;
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
}

// similar idea, but from background script to content script
export type BackgroundToContentMessage =
    | { type: "DETECTION_RESULT"; payload: DetectionResponse }
    | { type: "DETECTION_ERROR"; payload: { postId: PostId; message: string } }
    | { type: "DETECTION_LANGUAGE_UNSUPPORTED"; payload: DetectionLanguageUnsupportedPayload };
  