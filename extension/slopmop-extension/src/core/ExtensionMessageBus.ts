import {
  ContentToBackgroundMessage,
  DetectionResponse,
  DetectionLanguageUnsupportedPayload,
  NormalizedPostContent,
} from "@src/types/domain";

export class ExtensionMessageBus {
    async sendAnalyze(post: NormalizedPostContent): Promise<void> {
        try {
            const envelope: ContentToBackgroundMessage = {
                type: "ANALYZE_POST",
                payload: post,
            };
            await chrome.runtime.sendMessage(envelope);
        } catch (error) {
            console.log('Background script not listening for messages; couldn\'t send post for analysis');
        }
    }

    onDetectionResponse(handler: (res: DetectionResponse) => void): void {
        const listener = (message: { type?: string; payload?: unknown }) => {
            if (message.type === "DETECTION_RESULT") handler(message.payload as DetectionResponse);
        };
        chrome.runtime.onMessage.addListener(listener);
    }

    onDetectionLanguageUnsupported(handler: (payload: DetectionLanguageUnsupportedPayload) => void): void {
        const listener = (message: { type?: string; payload?: unknown }) => {
            if (message.type === "DETECTION_LANGUAGE_UNSUPPORTED") handler(message.payload as DetectionLanguageUnsupportedPayload);
        };
        chrome.runtime.onMessage.addListener(listener);
    }
}