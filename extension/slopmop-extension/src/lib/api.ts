/**
 * Reads the API base URL from Vite env and validates it.
 * Must be called from extension context as vite injects env at build time.
 */

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
}

/*
* Sends text to backend API and returns detection result.
*/
export async function detectText(text: string): Promise<DetectResponse> {
const baseUrl: string = getBaseUrl();

// remove extra spaces before sending to server
const cleanedText: string = text.trim();

const requestBody = {
    text: cleanedText
};

const response = await fetch(baseUrl + "/detect", {
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