import { DetectionResponse } from "@src/types/domain";

// register listener with chrome
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "ANALYZE_POST") {
        const post = message.payload;
        const tabId = sender.tab?.id;
        if (!tabId) {return} // check for no tabId
        // declare fakeResponse, "let" means we can change value
        let fakeResponse: DetectionResponse | undefined;

        // build fakeResponse
        const roll = Math.random();
        if (roll < 0.4) {
            fakeResponse = {
                requestId: "debug-req",
                postId: post.postId,
                verdict: "likely_ai",
                confidence: 0.92,
                explanation: {
                    summary: "Repetitive phrasing and low perplexity",
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
                    model: { name: "debug", version: "0.0" },
                    cache: { hit: false, ttlRemainingMs: 0 },
                    timing: { totalMs: 0, inferenceMs: 0 },
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
            return
        }

        chrome.tabs.sendMessage(tabId, {
            type: "DETECTION_RESULT",
            payload: fakeResponse,
        });
    }
});
// TODO add firefox support