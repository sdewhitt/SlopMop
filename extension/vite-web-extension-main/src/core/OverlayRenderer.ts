import { DetectionResponse, PostId, UserSettings} from "@src/types/domain"
import type { SiteAdapter } from "./adapters/SiteAdapter";
 


export class OverlayRenderer {

    // map each postId to the overlay element we create for it 
    private mapToOverlay = new Map<PostId, HTMLElement>()
    // map each postId to its DetectionResponse so the tooltip can read it later
    private mapToResponse = new Map<PostId, DetectionResponse>()
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

        // store the response so the tooltip can access it on hover
        this.mapToResponse.set(postId, res);

        const colorMap: Record<DetectionResponse["verdict"], string> = {
            likely_ai: "#ef4444", // red, check with https://www.peekcolor.app/
            likely_human: "#22c55e", // green
            unknown: "#6b7280", // grey
        };
        overlay.style.backgroundColor = colorMap[res.verdict];
        // pointer cursor tells the user the badge is interactive
        overlay.style.cursor = "pointer";

        // display verdict text
        overlay.textContent = `${res.verdict} (${Math.round(res.confidence * 100)}%)`;

        // if detailed mode on, show explanation inline on the badge itself
        if (this.settings.uiMode === "detailed") {
            overlay.textContent += ` — ${res.explanation.summary}`;
        }

        // --- hover tooltip ---
        // tooltip is null when not visible. we track it in a closure
        // so mouseenter/mouseleave can create and destroy it
        let tooltip: HTMLElement | null = null;

        // mouseenter: build the tooltip and append it as a child of the badge.
        // because the badge is position:absolute, the tooltip positions relative to it
        overlay.addEventListener("mouseenter", () => {
            // guard: don't create a second tooltip if one already exists
            if (tooltip) return;
            tooltip = this.createTooltip(res);
            overlay.appendChild(tooltip);
        });

        // mouseleave: tear down the tooltip so it doesn't linger
        overlay.addEventListener("mouseleave", () => {
            tooltip?.remove(); // ?. optional chaining: if tooltip is null, skip
            tooltip = null;
        });
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
            bottom: "8px", // place on the bottom
            right: "8px", // place on the right side 8 px away from border
            padding: "4px 8px",
            borderRadius: "4px",
            fontSize: "12px",
            zIndex: "9999",
            backgroundColor: "#6b7280", // grey
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
    // removes a DOM element and its entry from mapToOverlay and mapToResponse
    clear(postId: PostId): void {
        const overlay = this.mapToOverlay.get(postId);
        if (!overlay) return;
        overlay.remove();
        this.mapToOverlay.delete(postId);
        this.mapToResponse.delete(postId);
    }

    // builds the tooltip DOM element that appears when the user hovers over a badge.
    // returns an HTMLElement positioned above the badge with the full explanation.
    // pointerEvents: "none" prevents the tooltip from stealing the mouse,
    // which would cause the badge's mouseleave to fire and flicker the tooltip
    private createTooltip(res: DetectionResponse): HTMLElement {
        const tip = document.createElement("div");
        // style the tooltip container
        Object.assign(tip.style, {
            position: "absolute",
            bottom: "calc(100% + 8px)", // float above the badge with 8px gap
            right: "0", // right-align with the badge so it doesn't overflow offscreen
            width: "280px",
            padding: "12px",
            borderRadius: "8px",
            backgroundColor: "#1f2937", // dark slate, check with https://www.peekcolor.app/
            color: "#f3f4f6", // near-white text
            fontSize: "12px",
            lineHeight: "1.5",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            zIndex: "10000", // one layer above the badge's 9999
            pointerEvents: "none", // see docstring above
        });

        // --- header row: confidence + verdict label ---
        // human-readable labels instead of the raw enum values
        const verdictLabel: Record<DetectionResponse["verdict"], string> = {
            likely_ai: "Likely AI-generated",
            likely_human: "Likely human-written",
            unknown: "Inconclusive",
        };
        const header = document.createElement("div");
        Object.assign(header.style, {
            fontWeight: "700",
            fontSize: "14px",
            marginBottom: "6px",
        });
        header.textContent = `${Math.round(res.confidence * 100)}% — ${verdictLabel[res.verdict]}`;
        tip.appendChild(header);

        // --- body: explanation summary from the model ---
        const summary = document.createElement("div");
        Object.assign(summary.style, { marginBottom: "8px" });
        summary.textContent = res.explanation.summary;
        tip.appendChild(summary);

        // --- footer: model name, version, timing, cache hit ---
        // separated from the body by a subtle border so it feels like metadata
        const meta = document.createElement("div");
        Object.assign(meta.style, {
            fontSize: "10px",
            color: "#9ca3af", // muted grey
            borderTop: "1px solid #374151", // subtle divider
            paddingTop: "6px",
        });
        meta.textContent =
            `Model: ${res.explanation.model.name} v${res.explanation.model.version}` +
            ` · ${res.explanation.timing.totalMs}ms`;
        // if the result came from cache, note that so the user knows it wasn't a fresh call
        if (res.explanation.cache.hit) {
            meta.textContent += " (cached)";
        }
        tip.appendChild(meta);

        return tip;
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