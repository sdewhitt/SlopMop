import {
    ContentToBackgroundMessage,
    DetectionResponse,
    DetectionLanguageUnsupportedPayload,
    FactCheckResultPayload,
    NormalizedPostContent,
    PostId,
} from "@src/types/domain";




export class ExtensionMessageBus {
    // no constructor
    async sendAnalyze(post: NormalizedPostContent): Promise <void> {
        try {
            const envelope: ContentToBackgroundMessage = {
                type: "ANALYZE_POST",
                payload: post,
            }
            // send envelope message to background service via chrome runtime
            // we will have to add firefox support later then
            await chrome.runtime.sendMessage(envelope);
        } catch (error) {
            // background script isn't listening
            console.log('Background script not listening for messages; couldn\'t send post for analysis');
        }
        
    }
    // register handler function responseListener with chrome  
    onDetectionResponse(handler: (res: DetectionResponse) => void): void {
        const listener = (message: any) => { // listener is closure function, which outlives outer function, so listener exists in registry forever
            if (message.type === "DETECTION_RESULT") {
                handler(message.payload);
            }
        };
        chrome.runtime.onMessage.addListener(listener);
    }

    onDetectionError(handler: (payload: { postId: PostId; message: string }) => void): void {
        const listener = (message: any) => {
            if (message.type === "DETECTION_ERROR") {
                handler(message.payload);
            }
        };
        chrome.runtime.onMessage.addListener(listener);
    }

    onDetectionLanguageUnsupported(handler: (payload: DetectionLanguageUnsupportedPayload) => void): void {
        const listener = (message: any) => {
            if (message.type === "DETECTION_LANGUAGE_UNSUPPORTED") {
                handler(message.payload);
            }
        };
        chrome.runtime.onMessage.addListener(listener);
    }

    async sendFactCheck(
        postId: PostId,
        text: string,
        opts?: { site?: string; contentFingerprint?: string },
    ): Promise<void> {
        try {
            await chrome.runtime.sendMessage({
                type: "SLOPMOP_FACT_CHECK",
                postId,
                text,
                ...(opts?.site ? { site: opts.site } : {}),
                ...(opts?.contentFingerprint ? { contentFingerprint: opts.contentFingerprint } : {}),
            });
        } catch {
            console.log("[SlopMop] Could not send fact-check request to background.");
        }
    }

    onFactCheckResult(handler: (payload: FactCheckResultPayload) => void): void {
        const listener = (message: any) => {
            if (message.type === "FACT_CHECK_RESULT") {
                handler(message.payload);
            }
        };
        chrome.runtime.onMessage.addListener(listener);
    }

    onFactCheckError(
        handler: (payload: { postId: PostId; message: string; code?: string }) => void,
    ): void {
        const listener = (message: any) => {
            if (message.type === "FACT_CHECK_ERROR") {
                handler(message.payload);
            }
        };
        chrome.runtime.onMessage.addListener(listener);
    }
}