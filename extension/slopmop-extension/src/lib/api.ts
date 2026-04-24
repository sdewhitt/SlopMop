/**
 * Reads the API base URL from Vite env and validates it.
 * Must be called from extension context as vite injects env at build time.
 */

import type { FactCheckItem, HighlightSpan } from '@src/types/domain';
import type { SatireSignal } from '@src/types/domain';
import type { SatireCheckApiShape } from '@src/utils/factCheckSatire';

/** Extra attempts after the first try (1 + this = total attempts). */
const DETECTION_MAX_RETRIES = 10;
const RETRY_DELAY_MS = 1000;

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

const getBaseUrl = (): string => {
    const url = import.meta.env.VITE_API_BASE_URL as string | undefined;

    // make sure the env variable exists
    if (!url || url.trim() === '') {
        throw new Error(
            'Missing VITE_API_BASE_URL in .env. Needs to be added in .env file'
        );
    }

    // remove trailing slash so endpoint paths are added cleanly
    return url.replace(/\/$/, '');
};

const getWebsiteBaseUrl = (): string => {
    const url = import.meta.env.VITE_WEBSITE_BASE_URL as string | undefined;

    if (!url || url.trim() === '') {
        throw new Error(
            'Missing VITE_WEBSITE_BASE_URL in .env. Needs to be added in .env file'
        );
    }

    return url.replace(/\/$/, '');
};

export type ExtensionReportType = 'incorrect_detection' | 'bug' | 'other';

export interface SubmitExtensionReportPayload {
    type: ExtensionReportType;
    message: string;
    pageUrl?: string;
    reporterEmail?: string;
    userAgent?: string;
}

export interface SubmitExtensionReportResponse {
    ok: boolean;
    reportId: string;
    notificationScheduledFor: 'immediate' | 'daily' | 'weekly';
}

/**
 * Sends an extension report to the website endpoint (`/api/reports`).
 * Accepts an optional Firebase bearer token so signed-in users are linked to the report.
 */
export async function submitExtensionReport(
    payload: SubmitExtensionReportPayload,
    authToken?: string,
): Promise<SubmitExtensionReportResponse> {
    const websiteBaseUrl = getWebsiteBaseUrl();
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };

    if (authToken && authToken.trim() !== '') {
        headers.Authorization = `Bearer ${authToken}`;
    }

    const response = await fetch(websiteBaseUrl + '/api/reports', {
        method: 'POST',
        headers,
        body: JSON.stringify({
            type: payload.type,
            source: 'extension',
            message: payload.message,
            pageUrl: payload.pageUrl,
            reporterEmail: payload.reporterEmail,
            userAgent: payload.userAgent,
        }),
    });

    if (response.ok === false) {
        let message = 'HTTP ' + response.status;

        if (response.status === 404) {
            message =
                'Report API route not found at ' +
                websiteBaseUrl +
                '/api/reports. Set VITE_WEBSITE_BASE_URL to the Next.js website host (not the FastAPI backend).';
        }

        try {
            const data = await response.json();
            if (data !== null && data !== undefined) {
                if (typeof data.error === 'string') {
                    message = data.error;
                } else if (typeof data.detail === 'string') {
                    message = data.detail;
                }
            }
        } catch {
            // keep default HTTP message when non-JSON response is returned
        }

        throw new Error(message);
    }

    return response.json() as Promise<SubmitExtensionReportResponse>;
}

// expected response from POST /detect
export interface DetectResponse {
    confidence: number;
    label: string;
    explanation: string;
    highlights?: HighlightSpan[];
    detect_ms?: number;
    fact_check_ms?: number;
    total_server_ms?: number;
    satire_score?: number;
    satire_label?: string;
}

/**
 * Single HTTP attempt to POST /detect.
 * @param includeSpans If false, requests `/detect?include_spans=false` (faster, no highlight spans).
 */
async function detectTextOnce(
    baseUrl: string,
    cleanedText: string,
    includeSpans: boolean,
    commentTexts?: string[],
    subreddit?: string,
): Promise<DetectResponse> {
    const requestBody: { text: string; comment_texts?: string[]; subreddit?: string } = {
        text: cleanedText,
    };
    // add the comment texts to the request body if they are provided
    if (commentTexts !== undefined && commentTexts.length > 0) {
        requestBody.comment_texts = commentTexts;
    }
    if (subreddit && subreddit.trim()) {
        requestBody.subreddit = subreddit.trim();
    }

    const detectUrl =
        baseUrl +
        '/detect?include_spans=' +
        (includeSpans ? 'true' : 'false');

    const response = await fetch(detectUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
    });

    if (response.ok === false) {
        let message: string = 'HTTP ' + response.status;

        try {
            const data = await response.json();
            if (data !== null && data !== undefined) {
                if (typeof data.detail === 'string') {
                    message = data.detail;
                }
            }
        } catch {
            // response is not JSON, keep default message
        }

        throw new Error(message);
    }

    const result: DetectResponse = await response.json();
    return result;
}

/**
 * Sends text to backend API and returns detection result.
 * On failure, retries up to DETECTION_MAX_RETRIES times (11 attempts total) before throwing.
 * @param includeSpans If false, requests `/detect?include_spans=false` (faster, no highlight spans).
 */
export async function detectText(
    text: string,
    includeSpans: boolean = true,
    commentTexts?: string[],
    subreddit?: string,
): Promise<DetectResponse> {
    const baseUrl: string = getBaseUrl();
    const cleanedText: string = text.trim();
    let lastError: unknown;
    const maxAttempts = 1 + DETECTION_MAX_RETRIES;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await detectTextOnce(baseUrl, cleanedText, includeSpans, commentTexts, subreddit);
        } catch (e) {
            lastError = e;
            if (attempt < maxAttempts) {
                await sleep(RETRY_DELAY_MS);
            }
        }
    }
    throw lastError;
}

// expected response from POST /detect-image
export interface DetectImageResponse {
    confidence: number;
    label: string;
    explanation: string;
    model_variant?: ImageModelVariant;
    detect_ms?: number;
    fact_check_ms?: number;
    total_server_ms?: number;
}

export type ImageModelVariant = 'mini' | 'full';

async function detectImageOnce(
    baseUrl: string,
    imageBase64: string,
    mimeType: string,
    modelVariant: ImageModelVariant,
): Promise<DetectImageResponse> {
    const requestBody = {
        image_base64: imageBase64,
        mime_type: mimeType,
        model_variant: modelVariant,
    };

    const response = await fetch(baseUrl + "/detect-image", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
    });

    if (response.ok === false) {
        let message: string = "HTTP " + response.status;

        try {
            const data = await response.json();
            if (data !== null && data !== undefined) {
                if (typeof data.detail === "string") {
                    message = data.detail;
                }
            }
        } catch (error) {
            // response is not JSON, keep default message
        }

        throw new Error(message);
    }

    const result: DetectImageResponse = await response.json();

    return result;
}

export interface FactCheckResponse {
    items: FactCheckItem[];
    fact_check_ms?: number;
    total_server_ms?: number;
}

export interface SatireCheckResponse extends SatireCheckApiShape {}

export class FactCheckApiError extends Error {
    readonly status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = 'FactCheckApiError';
        this.status = status;
    }
}

/**
 * POST /fact-check — two-sentence chunking and Google Claim Search on the server.
 */
export async function factCheckText(text: string): Promise<FactCheckResponse> {
    const baseUrl: string = getBaseUrl();
    const cleanedText: string = text.trim();
    const response = await fetch(baseUrl + '/fact-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleanedText }),
    });

    if (response.ok === false) {
        let message: string = 'HTTP ' + response.status;
        try {
            const data = await response.json();
            if (data !== null && data !== undefined && typeof data.detail === 'string') {
                message = data.detail;
            }
        } catch {
            /* keep default */
        }
        throw new FactCheckApiError(message, response.status);
    }

    return response.json() as Promise<FactCheckResponse>;
}

/**
 * POST /satire-check — returns a satire probability used to soften fact-check UX.
 * Failure should be treated as non-fatal by callers.
 */
export async function satireCheckText(text: string): Promise<SatireCheckResponse> {
    const baseUrl: string = getBaseUrl();
    const cleanedText: string = text.trim();
    let lastError: unknown;
    const maxAttempts = 1 + DETECTION_MAX_RETRIES;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            const response = await fetch(baseUrl + '/satire-check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: cleanedText }),
            });

            if (response.ok === false) {
                let message: string = 'HTTP ' + response.status;
                try {
                    const data = await response.json();
                    if (data !== null && data !== undefined && typeof data.detail === 'string') {
                        message = data.detail;
                    }
                } catch {
                    /* keep default */
                }

                // Do not retry "model unavailable" style errors.
                if (response.status === 503) {
                    throw new FactCheckApiError(message, response.status);
                }

                // Retry transient upstream errors (e.g., 502) like detectText does.
                const err = new FactCheckApiError(message, response.status);
                if (response.status === 502 && attempt < maxAttempts) {
                    await sleep(RETRY_DELAY_MS);
                    continue;
                }
                throw err;
            }

            return response.json() as Promise<SatireCheckResponse>;
        } catch (e) {
            lastError = e;
            // If we got here via a thrown FactCheckApiError(503), don't retry.
            if (e instanceof FactCheckApiError && e.status === 503) {
                throw e;
            }
            if (attempt < maxAttempts) {
                await sleep(RETRY_DELAY_MS);
            }
        }
    }
    throw lastError;
}
/*
* Sends a base64-encoded image to backend API and returns image detection result.
* On failure, retries up to DETECTION_MAX_RETRIES times (11 attempts total) before throwing.
*/
export async function detectImage(
    imageBase64: string,
    mimeType: string = "image/jpeg",
    modelVariant: ImageModelVariant = 'mini',
): Promise<DetectImageResponse> {
    const baseUrl: string = getBaseUrl();
    let lastError: unknown;
    const maxAttempts = 1 + DETECTION_MAX_RETRIES;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await detectImageOnce(baseUrl, imageBase64, mimeType, modelVariant);
        } catch (e) {
            lastError = e;
            if (
                e instanceof Error
                && /full image model is not available/i.test(e.message)
            ) {
                break;
            }
            if (attempt < maxAttempts) {
                await sleep(RETRY_DELAY_MS);
            }
        }
    }
    throw lastError;
}
