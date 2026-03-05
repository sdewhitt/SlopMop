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

export interface UserSettings {
    enabled: boolean;
    whitelist: SiteId[];
    retainHistoryHours: number; // default 24hours
    cacheTtlHours: number; // default 24hours
    scanText: boolean; // default true
    scanImages: boolean; // default False during Sprint 1
    scanComments: "off" | "user_triggered" | "auto_top_n";
    uiMode: "simple" | "detailed";
    accessibility: {
        highContrast: boolean;
        largeText: boolean;
    };
    privacy: {
        sendRawText: boolean;
        sendImages: boolean;
        allowTelemetry: boolean;
    };
    rateLimit: {
        maxRequestsPerMinute: number;
    };
} 

export const DEFAULT_SETTINGS: UserSettings = {
    enabled: true,
    whitelist: [],                    // empty = allow all sites
    retainHistoryHours: 24,
    cacheTtlHours: 24,
    scanText: true,
    scanImages: false,                // phase 1: text only
    scanComments: "auto_top_n",
    uiMode: "simple",
    accessibility: {
      highContrast: false,
      largeText: false,
    },
    privacy: {
      sendRawText: true,
      sendImages: false,
      allowTelemetry: false,
    },
    rateLimit: {
      maxRequestsPerMinute: 10,
    },
  };

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

export interface DetectionResponse {
    requestId: string;
    postId: PostId;
    verdict: "likely_ai" | "likely_human" | "unknown";
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
    }
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
/** Payload when detection is skipped because language is not supported (Story 39). */
export interface DetectionLanguageUnsupportedPayload {
    postId: PostId;
    message: string;
}

// similar idea, but from background script to content script
export type BackgroundToContentMessage =
    | { type: "DETECTION_RESULT"; payload: DetectionResponse }
    | { type: "DETECTION_LANGUAGE_UNSUPPORTED"; payload: DetectionLanguageUnsupportedPayload };
  