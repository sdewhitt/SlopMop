import { DetectionResponse, NormalizedPostContent, DEFAULT_SETTINGS, UserSettings } from "@src/types/domain";

// TODO: replace settings with chrome.storage.local.get() once the options page can persist settings.
const settings: UserSettings = { ...DEFAULT_SETTINGS };

// max number of images to fetch concurrently.
// Promise.all on 20 images would fire 20 fetches simultaneously,
const IMAGE_FETCH_CONCURRENCY = 3;

// register listener with chrome
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "ANALYZE_POST") {
        const post: NormalizedPostContent = message.payload;
        const tabId = sender.tab?.id;
        if (!tabId) {return} // check for no tabId

        handleAnalyzePost(post, tabId);
        // return true tells Chrome to keep the message channel open.
        return true;
    }
});
// TODO add firefox support

async function handleAnalyzePost(post: NormalizedPostContent, tabId: number): Promise<void> {
    // safety-net: if the user has scanImages disabled, skip image fetching entirely.
    const shouldFetchImages = settings.scanImages && post.images.length > 0;

    let enrichedImages = post.images;
    if (shouldFetchImages) {
        // fetchImagesThrottled processes at most IMAGE_FETCH_CONCURRENCY at a time
        enrichedImages = await fetchImagesThrottled(post.images, IMAGE_FETCH_CONCURRENCY);
    } else {
        // user has scanImages off, or no images on the post.
        enrichedImages = post.images.map((img) => ({ ...img, bytesBase64: "" }));
    }

    // TODO: check total payload size before sending to API.
    // base64 inflates binary by ~33%, so a 3MB image becomes ~4MB as base64.
    // chrome.runtime.sendMessage has a 64MB limit

    // TODO: implement image size capping / resizing.
    // full res images can be 4000x3000+ pixels. the detection model will probably be smaller

    const enrichedPost = { ...post, images: enrichedImages };

    const fakeResponse = buildFakeResponse(enrichedPost); // placeholder until we have server up
    // send to content script
    chrome.tabs.sendMessage(tabId, {
        type: "DETECTION_RESULT",
        payload: fakeResponse,
    });
}

// fetches bytesBase64 for an array of images, with at most `concurrency` in flight at a time.
// processes images in batches: starts a batch of `concurrency` fetches,
// waits for the whole batch to finish, then starts the next batch.
// simpler than a sliding-window approach but still prevents 20 simultaneous fetches
async function fetchImagesThrottled(images: NormalizedPostContent["images"], concurrency: number): Promise<NormalizedPostContent["images"]> {
    const results: NormalizedPostContent["images"] = [];

    // step through the array in chunks of `concurrency`.
    for (let i = 0; i < images.length; i += concurrency) {
        // slice out the current batch. slice won't go past the end of the array
        const batch = images.slice(i, i + concurrency);

        // fetch all images in this batch concurrently.
        // Promise.all is fine here because the batch size is bounded by `concurrency`
        const batchResults = await Promise.all(
            batch.map(async (img) => {
                if (img.bytesBase64) return img; // already filled, skip refetch
                const base64 = await fetchImageAsBase64(img.srcUrl);
                return { ...img, bytesBase64: base64 };
            })
        );

        results.push(...batchResults);
    }

    return results;
}

// fetches a single image by URL and returns its contents as a base64 string.
// returns "" on any failure so the caller can treat missing images gracefully.
async function fetchImageAsBase64(srcUrl: string): Promise<string> {
    try {
        const response = await fetch(srcUrl);
        if (!response.ok) return "";
        const arrayBuffer = await response.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);

        // process in 32KB chunks to avoid blowing the call stack.
        // String.fromCharCode(...spread) puts arguments on the stack,
        const CHUNK = 0x8000;
        let binary = "";
        for (let i = 0; i < bytes.length; i += CHUNK) {
            binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK)); // convert bytes to chars
        }
        return btoa(binary); // converts ascii to base64
    } catch {
        return "";
    }
}

function buildFakeResponse(post: NormalizedPostContent): DetectionResponse | null {
    // declare fakeResponse, "let" means we can change value later
    let fakeResponse: DetectionResponse | undefined;

    // build fakeResponse
    // grab the plain text length so we can generate plausible highlight offsets.
    const textLen: number = post.text?.plain?.length ?? 0;
    const roll = Math.random();
    if (roll < 0.4) {
        fakeResponse = {
            requestId: "debug-req",
            postId: post.postId,
            verdict: "likely_ai",
            confidence: 0.92,
            explanation: {
                summary: "Repetitive phrasing and low perplexity",
                highlights: textLen > 20 ? [
                    {
                        start: 0,
                        end: Math.min(textLen, 45),
                        reason: "Opening follows a common AI template pattern",
                    },
                    {
                        start: Math.min(Math.floor(textLen * 0.4), textLen),
                        end: Math.min(Math.floor(textLen * 0.4) + 60, textLen),
                        reason: "Unusually low perplexity for this span",
                    },
                ] : [],
                model: { name: "debug", version: "0.0" },
                cache: { hit: false, ttlRemainingMs: 0 },
                timing: { totalMs: 0, inferenceMs: 0 },
            },
        };
    } else if (roll < 0.7) {
        fakeResponse = {
            requestId: "debug-req",
            postId: post.postId,
            verdict: "likely_human",
            confidence: 0.78,
            explanation: {
                summary: "Natural variance and typos detected",
                highlights: textLen > 30 ? [
                    {
                        start: Math.min(10, textLen),
                        end: Math.min(50, textLen),
                        reason: "Contains a natural typo / informal shorthand",
                    },
                ] : [],
                model: { name: "debug", version: "0.0" },
                cache: { hit: true, ttlRemainingMs: 45 },
                timing: { totalMs: 321, inferenceMs: 190 },
            },
        };
    } else if (roll < 0.9) {
        fakeResponse = {
            requestId: "debug-req",
            postId: post.postId,
            verdict: "unknown",
            confidence: 0.5,
            explanation: {
                summary: "Insufficient signal",
                model: { name: "debug", version: "0.0" },
                cache: { hit: false, ttlRemainingMs: 0 },
                timing: { totalMs: 0, inferenceMs: 0 },
            },
        };
    } else {
        // simulate network timeout by RETURNING NOTHING! haha
        return null;
    }
    return fakeResponse;
}