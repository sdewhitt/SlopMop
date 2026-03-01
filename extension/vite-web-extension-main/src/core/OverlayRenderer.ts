import { DetectionResponse, PostId, UserSettings} from "@src/types/domain"
import type { SiteAdapter } from "./adapters/SiteAdapter";
 


export class OverlayRenderer {

    // map each postId to the overlay element we create for it 
    private mapToOverlay = new Map<PostId, HTMLElement>()
    // used to get DOM node from postId
    private adapter: SiteAdapter;
    private settings: UserSettings;


    constructor(adapter: SiteAdapter, settings: UserSettings) {
        this.adapter = adapter;
        this.settings = settings;
    }


    // render DetectionResponse as a badge on the page
    // for now, start with basic appearance, then we can match the UI mockups
    renderResult(postId: PostId, res: DetectionResponse): void {
        // case1: assume renderPending created an overlay earlier 
        const overlay = this.mapToOverlay.get(postId); // returns undefined if no postId
        if (!overlay) return; // this might cause trouble
        const colorMap: Record<DetectionResponse["verdict"], string> = {
            likely_ai: "#ef4444", // red, check with https://www.peekcolor.app/
            likely_human: "#22c55e", // green
            unknown: "#6b7280", // grey
        };
        overlay.style.backgroundColor = colorMap[res.verdict];

        // display verdict text
        overlay.textContent = `${res.verdict} (${Math.round(res.confidence * 100)}%)`;

        // if detailed mode on, show explanation
        if (this.settings.uiMode === "detailed") {
            overlay.textContent += ` — ${res.explanation.summary}`;
        }

       
        

    }
    // renders Pending badge for the user
    renderPending(postId: PostId): void {
        const postNode = this.findPostNode(postId);
        if (postNode === null) return;
        const overlay = document.createElement("div");
        postNode.style.position = "relative";
        postNode.appendChild(overlay);
        // style the overlay object
        Object.assign(overlay.style, {
            position: "absolute", // places it on the post
            top: "8px",
            right: "8px",
            padding: "4px 8px",
            borderRadius: "4px",
            fontSize: "12px",
            zIndex: "9999",
            backgroundColor: "#6b7280",
            color: "#fff",
        });
        overlay.textContent = "Scanning...";
        this.mapToOverlay.set(postId, overlay);


    }
    renderError(postId: PostId, message: string): void {
        const overlay = this.mapToOverlay.get(postId);
        if (!overlay) return;
        overlay.style.backgroundColor = "#f59e0b"; // amber yellow like a yield sign
        overlay.textContent = `Error - ${message}`;

    }
    // removes a DOM element and its entry from mapToOverlay
    clear(postId: PostId): void {
        const overlay = this.mapToOverlay.get(postId);
        if (!overlay) return;
        overlay.remove();
        this.mapToOverlay.delete(postId);
    }

    // scan DOM tree for the postNode given a postId. 
    // returns the postNode, or null if not found
    private findPostNode(postId: PostId): HTMLElement | null {
        for (const node of this.adapter.findPostNodes(document)) {
            if (this.adapter.getStablePostId(node) === postId) return node as HTMLElement;
        }
        return null;
    }
}