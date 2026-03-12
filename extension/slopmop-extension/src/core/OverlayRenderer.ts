import { DetectionResponse, ImageDetectionResult, PostId } from "@src/types/domain";
import type { DetectionSettings } from "@src/utils/userSettings";
import { getPatternReasons } from "@src/utils/aiTextPatterns";
import type { SiteAdapter } from "./adapters/SiteAdapter";
 


export class OverlayRenderer {

    // map each postId to the overlay element we create for it 
    private mapToOverlay = new Map<PostId, HTMLElement>()
    // map each postId to its DetectionResponse so the tooltip can read it later
    private mapToResponse = new Map<PostId, DetectionResponse>()
    // map each postId to the original plain text that was analyzed.
    // needed so createTooltip can slice out highlighted spans using start/end offsets
    private mapToPostText = new Map<PostId, string>()
    // map each postId to latest error text so detailed mode can show it in tooltip.
    private mapToErrorMessage = new Map<PostId, string>()
    // used to get DOM node from postId
    private adapter: SiteAdapter;
    private settings: DetectionSettings;


    constructor(adapter: SiteAdapter, settings: DetectionSettings) {
        this.adapter = adapter;
        this.settings = settings;
    }

    protected getBadgePosition(): Record<string, string> {
        return { bottom: "8px", right: "8px" };
    }

    protected getTooltipPosition(): Record<string, string> {
        return { bottom: "calc(100% + 8px)", right: "0" };
    }


    // render DetectionResponse as a badge on the page
    // for now, start with basic appearance, then we can match the UI mockups
    renderResult(postId: PostId, res: DetectionResponse): void {
        const overlay = this.mapToOverlay.get(postId);
        if (!overlay) return;

        this.mapToResponse.set(postId, res);
        this.resetOverlayInteractions(overlay);
        overlay.style.whiteSpace = "normal";

        const isSimple = this.settings.uiMode === "simple";

        const colorMap: Record<DetectionResponse["verdict"], string> = {
            likely_ai: "#ef4444",
            likely_human: "#22c55e",
            unknown: "#6b7280",
        };
        overlay.style.backgroundColor = colorMap[res.verdict];
        overlay.style.cursor = "pointer";

        if (isSimple) {
            overlay.style.fontSize = "14px";
            overlay.style.padding = "6px 12px";
        }

        const textLabel = `${res.verdict} (${Math.round(res.confidence * 100)}%)`;
        if (res.imageResult) {
            overlay.textContent = `Text: ${textLabel} · Img: ${res.imageResult.verdict} (${Math.round(res.imageResult.confidence * 100)}%)`;
        } else {
            overlay.textContent = textLabel;
        }

        let tooltip: HTMLElement | null = null;
        const postText = this.mapToPostText.get(postId) ?? "";
        overlay.onmouseenter = () => {
            if (tooltip) return;
            tooltip = isSimple
                ? this.createSimpleTooltip(res)
                : this.createTooltip(res, postText);
            overlay.appendChild(tooltip);
        };

        overlay.onmouseleave = () => {
            tooltip?.remove();
            tooltip = null;
        };
    }

    // renders Pending badge for the user.
    // plainText is the extracted post text from PostExtractor.
    // we store it so createTooltip can slice out highlighted spans later
    renderPending(postId: PostId, plainText: string, onDetectNow?: () => void): void {
        this.mapToPostText.set(postId, plainText);
        const postNode = this.findPostNode(postId);
        if (postNode === null) return;
        const overlay = document.createElement("div");
        postNode.style.position = "relative";
        postNode.appendChild(overlay);
        // style the overlay object
        const isSimple = this.settings.uiMode === "simple";
        Object.assign(overlay.style, {
            position: "absolute",
            ...this.getBadgePosition(),
            padding: isSimple ? "6px 12px" : "4px 8px",
            borderRadius: "4px",
            fontSize: isSimple ? "14px" : "12px",
            zIndex: "9999",
            backgroundColor: "#6b7280",
            color: "#fff",
        });
        if (!onDetectNow) {
            overlay.textContent = "Scanning...";
            this.mapToOverlay.set(postId, overlay);
            return;
        }

        // manual mode: show a Detect Now button instead of scanning immediately.
        // this keeps noisy pages readable when users prefer click-to-scan behavior.
        const detectNowButton = document.createElement("button");
        detectNowButton.type = "button";
        detectNowButton.textContent = "Detect Now";
        Object.assign(detectNowButton.style, {
            border: "none",
            borderRadius: "4px",
            padding: "6px 10px",
            fontSize: isSimple ? "14px" : "12px",
            fontWeight: "600",
            color: "#fff",
            backgroundColor: "#6b7280",
            cursor: "pointer",
        });
        detectNowButton.onclick = () => {
            this.showScanningState(overlay);
            onDetectNow();
        };
        overlay.appendChild(detectNowButton);
        this.mapToOverlay.set(postId, overlay);


    }
    renderError(postId: PostId, message: string, onRetry?: () => void): void {
        const overlay = this.mapToOverlay.get(postId);
        if (!overlay) return;
        console.error("[OverlayRenderer] detection error", { postId, message });
        this.mapToErrorMessage.set(postId, message);
        this.resetOverlayInteractions(overlay);
        overlay.style.backgroundColor = "#f59e0b"; // amber
        overlay.style.whiteSpace = "normal";

        const isSimple = this.settings.uiMode === "simple";
        overlay.textContent = "Error";

        if (onRetry) {
            const retryButton = document.createElement("button");
            retryButton.type = "button";
            retryButton.textContent = " · Retry";
            Object.assign(retryButton.style, {
                border: "none",
                background: "transparent",
                color: "#fff",
                padding: "0",
                margin: "0",
                fontSize: isSimple ? "14px" : "12px",
                fontWeight: "600",
                cursor: "pointer",
            });
            retryButton.onclick = (event) => {
                event.stopPropagation();
                this.showScanningState(overlay);
                onRetry();
            };
            overlay.appendChild(retryButton);
        }

        if (isSimple) {
            overlay.style.cursor = "default";
            return;
        }

        // detailed mode keeps the badge compact and pushes the full message into tooltip.
        overlay.style.cursor = onRetry ? "default" : "pointer";
        let tooltip: HTMLElement | null = null;
        overlay.onmouseenter = () => {
            if (tooltip) return;
            const errorMessage = this.mapToErrorMessage.get(postId) || "Unknown error";
            tooltip = this.createErrorTooltip(errorMessage);
            overlay.appendChild(tooltip);
        };
        overlay.onmouseleave = () => {
            tooltip?.remove();
            tooltip = null;
        };

    }
    // timeout has a dedicated badge text so users can tell this was network-related.
    renderTimeout(postId: PostId): void {
        const overlay = this.mapToOverlay.get(postId);
        if (!overlay) return;
        this.resetOverlayInteractions(overlay);
        overlay.style.whiteSpace = "normal";
        overlay.style.backgroundColor = "#f59e0b";
        overlay.textContent = "network timeout";
    }
    // removes a DOM element and its entry from all three maps
    clear(postId: PostId): void {
        const overlay = this.mapToOverlay.get(postId);
        if (!overlay) return;
        overlay.remove();
        this.mapToOverlay.delete(postId);
        this.mapToResponse.delete(postId);
        this.mapToPostText.delete(postId);
        this.mapToErrorMessage.delete(postId);
    }

    private createSimpleTooltip(res: DetectionResponse): HTMLElement {
        const verdictLabel: Record<DetectionResponse["verdict"], string> = {
            likely_ai: "Likely AI-generated",
            likely_human: "Likely human-written",
            unknown: "Inconclusive",
        };

        const tip = document.createElement("div");
        Object.assign(tip.style, {
            position: "absolute",
            ...this.getTooltipPosition(),
            minWidth: "200px",
            maxWidth: "300px",
            padding: "14px",
            borderRadius: "8px",
            backgroundColor: "#1f2937",
            color: "#f3f4f6",
            fontSize: "14px",
            lineHeight: "1.5",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            zIndex: "10000",
            pointerEvents: "none",
        });

        const header = document.createElement("div");
        Object.assign(header.style, {
            fontWeight: "700",
            fontSize: "16px",
            marginBottom: "8px",
        });
        header.textContent = `${Math.round(res.confidence * 100)}% — ${verdictLabel[res.verdict]}`;
        if (res.imageResult) {
            header.textContent = `Text: ${Math.round(res.confidence * 100)}% — ${verdictLabel[res.verdict]}`;
        }
        tip.appendChild(header);

        const summary = document.createElement("div");
        Object.assign(summary.style, { fontSize: "14px" });
        summary.textContent = res.explanation.summary;
        tip.appendChild(summary);

        if (res.imageResult) {
            this.appendImageSection(tip, res.imageResult, "16px", "14px");
        }

        return tip;
    }

    private createTooltip(res: DetectionResponse, postText: string): HTMLElement {
        const highlights = res.explanation.highlights ?? [];
        // if there are highlights to show, use a wider tooltip to fit quoted excerpts.
        // otherwise keep it compact. height is always auto so it grows with content
        const hasHighlights = highlights.length > 0 && postText.length > 0;

        const tip = document.createElement("div");
        // style the tooltip container.
        // minWidth/maxWidth instead of fixed width so it scales with content volume.
        // maxHeight + overflowY: "auto" prevents it from growing taller than the viewport
        Object.assign(tip.style, {
            position: "absolute",
            ...this.getTooltipPosition(),
            minWidth: hasHighlights ? "320px" : "240px",
            maxWidth: hasHighlights ? "420px" : "300px",
            maxHeight: "400px",
            overflowY: "auto", // scroll if the highlights make the tooltip very tall
            padding: "12px",
            borderRadius: "8px",
            backgroundColor: "#1f2937", // dark slate
            color: "#f3f4f6", // near white text
            fontSize: "12px",
            lineHeight: "1.5",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            zIndex: "10000", // one layer above the badge's 9999
            pointerEvents: "none",
        });

        // header row: confidence and verdict label 
        // human readable labels instead of the raw enum values
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
        header.textContent = res.imageResult
            ? `Text: ${Math.round(res.confidence * 100)}% — ${verdictLabel[res.verdict]}`
            : `${Math.round(res.confidence * 100)}% — ${verdictLabel[res.verdict]}`;
        tip.appendChild(header);

        // confidence progress bar
        const pct = Math.round(res.confidence * 100);
        const barColor = pct >= 70 ? "#ef4444" : pct >= 40 ? "#f59e0b" : "#22c55e";
        const track = document.createElement("div");
        Object.assign(track.style, {
            width: "100%",
            height: "6px",
            backgroundColor: "#374151",
            borderRadius: "3px",
            marginBottom: "8px",
            overflow: "hidden",
        });
        const fill = document.createElement("div");
        Object.assign(fill.style, {
            width: `${pct}%`,
            height: "100%",
            backgroundColor: barColor,
            borderRadius: "3px",
            transition: "width 0.3s ease",
        });
        track.appendChild(fill);
        tip.appendChild(track);

        // pattern-based reasons first (em dashes, common AI phrases) when present — main "why" for the user
        const tooltipPatternReasons = getPatternReasons(postText);
        if (tooltipPatternReasons.length > 0) {
            const patternEl = document.createElement("div");
            Object.assign(patternEl.style, {
                marginBottom: "8px",
                fontWeight: "500",
                fontSize: "12px",
                color: "#e5e7eb",
            });
            patternEl.textContent = "Patterns observed: " + tooltipPatternReasons.join("; ");
            tip.appendChild(patternEl);
        }

        // model summary (generic explanation from backend/fake)
        const summary = document.createElement("div");
        Object.assign(summary.style, {
            marginBottom: "8px",
            fontSize: tooltipPatternReasons.length > 0 ? "11px" : "12px",
            color: tooltipPatternReasons.length > 0 ? "#9ca3af" : "#e5e7eb",
        });
        summary.textContent = res.explanation.summary;
        tip.appendChild(summary);

        // highlights section 
        // each highlight has start/end character offsets into postText and a reason.
        // we slice the original text to show the flagged excerpt, then show the reason below it
        if (hasHighlights) {
            const highlightsContainer = document.createElement("div");
            Object.assign(highlightsContainer.style, {
                borderTop: "1px solid #374151", // subtle divider above highlights
                paddingTop: "8px",
                marginBottom: "8px",
                display: "flex",
                flexDirection: "column",
                gap: "8px", // space between each highlight entry
            });

            for (const hl of highlights) {
                const entry = document.createElement("div");

                // slice the flagged text span using the start/end offsets.
                // clamp to postText.length so a bad offset doesn't throw
                const excerpt = postText.slice(
                    Math.max(0, hl.start),
                    Math.min(postText.length, hl.end),
                );

                // quoted excerpt: the actual text the model flagged.
                const quoteEl = document.createElement("div");
                Object.assign(quoteEl.style, {
                    backgroundColor: "rgba(245, 158, 11, 0.15)", // amber tint ,semi transparent
                    borderLeft: "3px solid #f59e0b", // amber left border like a blockquote
                    padding: "4px 8px",
                    borderRadius: "2px",
                    fontStyle: "italic",
                    fontSize: "11px",
                    color: "#fbbf24", // amber text for the excerpt
                    wordBreak: "break-word", // wrap long unbroken strings
                });
                // show up to 200 chars of the excerpt. if longer, truncate with ellipsis
                quoteEl.textContent = excerpt.length > 200
                    ? `"${excerpt.slice(0, 200)}…"`
                    : `"${excerpt}"`;
                entry.appendChild(quoteEl);

                // reason: the model's explanation for why this span was flagged
                const reasonEl = document.createElement("div");
                Object.assign(reasonEl.style, {
                    fontSize: "11px",
                    color: "#d1d5db", // light grey, slightly dimmer than body text
                    marginTop: "2px",
                });
                reasonEl.textContent = hl.reason;
                entry.appendChild(reasonEl);

                highlightsContainer.appendChild(entry);
            }

            tip.appendChild(highlightsContainer);
        }

        // footer: model name, version, timing, cache hit 
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

        if (res.imageResult) {
            this.appendImageSection(tip, res.imageResult, "13px", "11px");
        }

        return tip;
    }

    private createErrorTooltip(message: string): HTMLElement {
        const tip = document.createElement("div");
        Object.assign(tip.style, {
            position: "absolute",
            ...this.getTooltipPosition(),
            minWidth: "240px",
            maxWidth: "320px",
            padding: "12px",
            borderRadius: "8px",
            backgroundColor: "#1f2937",
            color: "#f3f4f6",
            fontSize: "12px",
            lineHeight: "1.5",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            zIndex: "10000",
            pointerEvents: "none",
            wordBreak: "break-word",
        });

        const header = document.createElement("div");
        Object.assign(header.style, {
            fontWeight: "700",
            fontSize: "13px",
            marginBottom: "6px",
            color: "#fbbf24",
        });
        header.textContent = "Detection error";
        tip.appendChild(header);

        const body = document.createElement("div");
        body.textContent = message;
        tip.appendChild(body);

        return tip;
    }

    private appendImageSection(
        container: HTMLElement,
        imgRes: ImageDetectionResult,
        headerSize: string,
        bodySize: string,
    ): void {
        const verdictLabel: Record<ImageDetectionResult["verdict"], string> = {
            likely_ai: "Likely AI-generated",
            likely_human: "Likely authentic",
            unknown: "Inconclusive",
        };

        const section = document.createElement("div");
        Object.assign(section.style, {
            borderTop: "1px solid #374151",
            paddingTop: "8px",
            marginTop: "8px",
        });

        const imgHeader = document.createElement("div");
        Object.assign(imgHeader.style, {
            fontWeight: "700",
            fontSize: headerSize,
            marginBottom: "4px",
        });
        imgHeader.textContent = `Image: ${Math.round(imgRes.confidence * 100)}% — ${verdictLabel[imgRes.verdict]}`;
        section.appendChild(imgHeader);

        const pct = Math.round(imgRes.confidence * 100);
        const barColor = pct >= 70 ? "#ef4444" : pct >= 40 ? "#f59e0b" : "#22c55e";
        const track = document.createElement("div");
        Object.assign(track.style, {
            width: "100%",
            height: "5px",
            backgroundColor: "#374151",
            borderRadius: "3px",
            marginBottom: "6px",
            overflow: "hidden",
        });
        const fill = document.createElement("div");
        Object.assign(fill.style, {
            width: `${pct}%`,
            height: "100%",
            backgroundColor: barColor,
            borderRadius: "3px",
        });
        track.appendChild(fill);
        section.appendChild(track);

        const imgSummary = document.createElement("div");
        Object.assign(imgSummary.style, { fontSize: bodySize, color: "#d1d5db" });
        imgSummary.textContent = imgRes.summary;
        section.appendChild(imgSummary);

        const imgMeta = document.createElement("div");
        Object.assign(imgMeta.style, {
            fontSize: "10px",
            color: "#9ca3af",
            marginTop: "4px",
        });
        imgMeta.textContent = `Model: ${imgRes.model.name} v${imgRes.model.version} · ${imgRes.timingMs}ms`;
        section.appendChild(imgMeta);

        container.appendChild(section);
    }

    private resetOverlayInteractions(overlay: HTMLElement): void {
        overlay.replaceChildren();
        overlay.onmouseenter = null;
        overlay.onmouseleave = null;
        overlay.onclick = null;
    }

    private showScanningState(overlay: HTMLElement): void {
        this.resetOverlayInteractions(overlay);
        overlay.style.whiteSpace = "normal";
        overlay.style.backgroundColor = "#6b7280";
        overlay.style.cursor = "default";
        overlay.textContent = "Scanning...";
    }

    // scan DOM tree for the postNode given a postId. 
    // returns the postNode, or null if not found
    private findPostNode(postId: PostId): HTMLElement | null {
        // check posts
        for (const node of this.adapter.findPostNodes(document)) {
            if (this.adapter.getStablePostId(node) === postId) return node as HTMLElement;
        }
        // check comments
        for (const node of this.adapter.findVisibleCommentNodes(document)) {
            if (this.adapter.getCommentId(node) === postId) return node as HTMLElement;
        }
        return null;
    }
}