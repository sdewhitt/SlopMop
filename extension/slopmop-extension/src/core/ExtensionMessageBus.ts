import { ContentToBackgroundMessage, DetectionResponse, NormalizedPostContent } from "@src/types/domain";




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
}