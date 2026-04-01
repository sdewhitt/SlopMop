/**
 * Reads the API base URL from Vite env and validates it.
 * Must be called from extension context as vite injects env at build time.
 */

import type { HighlightSpan } from '@src/types/domain';
/** First attempt plus this many retries before surfacing an error to the user. */
const DETECTION_MAX_RETRIES = 10;
const RETRY_DELAY_MS = 150;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

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

// expected response from POST /detect
export interface DetectResponse {
    confidence: number;
    label: string;
    explanation: string;
    highlights?: HighlightSpan[];
}

<<<<<<< main
/*
* Sends text to backend API and returns detection result.
* @param includeSpans If false, requests `/detect?include_spans=false` (faster, no highlight spans).
*/
export async function detectText(
    text: string,
    includeSpans: boolean = true,
): Promise<DetectResponse> {
const baseUrl: string = getBaseUrl();

// remove extra spaces before sending to server
const cleanedText: string = text.trim();

=======
async function detectTextOnce(baseUrl: string, cleanedText: string): Promise<DetectResponse> {
>>>>>>> jack
const requestBody = {
    text: cleanedText
};

const detectUrl =
    baseUrl +
    '/detect?include_spans=' +
    (includeSpans ? 'true' : 'false');

const response = await fetch(detectUrl, {
    method: "POST",
    headers: {
    "Content-Type": "application/json"
    },
    body: JSON.stringify(requestBody)
});

// check if request succeeded (status 200–299)
if (response.ok === false) {
    // default error message if backend doesn't send one
    let message: string = "HTTP " + response.status;

    try {
    // try reading JSON error from backend
    const data = await response.json();

    // checking step by step instead of optional chaining
    if (data !== null && data !== undefined) {
        if (typeof data.detail === "string") {
        message = data.detail;
        }
    }
    } catch (error) {
    // when response is not JSON (server error page)
    // we just keep the default message
    }

    throw new Error(message);
}

// parse successful response
const result: DetectResponse = await response.json();

return result;
}

/*
* Sends text to backend API and returns detection result.
* On failure, retries up to DETECTION_MAX_RETRIES times (11 attempts total) before throwing.
*/
export async function detectText(text: string): Promise<DetectResponse> {
    const baseUrl: string = getBaseUrl();
    const cleanedText: string = text.trim();
    let lastError: unknown;
    const maxAttempts = 1 + DETECTION_MAX_RETRIES;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await detectTextOnce(baseUrl, cleanedText);
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
}

async function detectImageOnce(
    baseUrl: string,
    imageBase64: string,
    mimeType: string,
): Promise<DetectImageResponse> {
    const requestBody = {
        image_base64: imageBase64,
        mime_type: mimeType,
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

/*
* Sends a base64-encoded image to backend API and returns image detection result.
* On failure, retries up to DETECTION_MAX_RETRIES times (11 attempts total) before throwing.
*/
export async function detectImage(
    imageBase64: string,
    mimeType: string = "image/jpeg",
): Promise<DetectImageResponse> {
    const baseUrl: string = getBaseUrl();
    let lastError: unknown;
    const maxAttempts = 1 + DETECTION_MAX_RETRIES;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await detectImageOnce(baseUrl, imageBase64, mimeType);
        } catch (e) {
            lastError = e;
            if (attempt < maxAttempts) {
                await sleep(RETRY_DELAY_MS);
            }
        }
    }
    throw lastError;
}
