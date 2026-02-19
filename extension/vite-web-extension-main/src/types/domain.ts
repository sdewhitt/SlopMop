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
  