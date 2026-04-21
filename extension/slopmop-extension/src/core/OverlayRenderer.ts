import { DetectionResponse, FactCheckItem, ImageDetectionResult, PostId } from "@src/types/domain";
import type { DetectionSettings } from "@src/utils/userSettings";
import { getPatternReasons } from "@src/utils/aiTextPatterns";
import {
    expandUserDetectionLanguages,
    getTooltipLanguageLine,
} from "@src/utils/languageSupport";
import {
    applyRichDomHighlightSpans,
    buildHighlightedHtml,
    canApplyInnerHtmlHighlights,
    normalizePlainText,
    prepareHighlightSpans,
} from "@src/utils/highlightSpans";
import {
    SATIRE_SCORE_HIGH_BANNER_THRESHOLD,
    SATIRE_SCORE_SOFTEN_THRESHOLD,
} from "@src/utils/factCheckSatire";
 

export class OverlayRenderer {
    private static readonly OVERLAY_ATTR = "data-slopmop-overlay";
    private static readonly BADGE_Z_INDEX = "9999";
    private static readonly ACTIVE_BADGE_Z_INDEX = "2147483646";
    private static readonly TOOLTIP_Z_INDEX = "2147483647";
    private static readonly TOOLTIP_HIDE_DELAY_MS = 450;

    // map each postId to the overlay element we create for it 
    private mapToOverlay = new Map<PostId, HTMLElement>()
    // map each postId to its DetectionResponse so the tooltip can read it later
    private mapToResponse = new Map<PostId, DetectionResponse>()
    // map each postId to the original plain text that was analyzed.
    // needed so createTooltip can slice out highlighted spans using start/end offsets
    private mapToPostText = new Map<PostId, string>()
    // map each postId to latest error text so detailed mode can show it in tooltip.
    private mapToErrorMessage = new Map<PostId, string>()
    /** Post/comment body element used for in-post <mark> highlights (adapter text node). */
    private mapToTextBody = new Map<PostId, HTMLElement>()
    /** Saved innerHTML before highlights so we can restore on clear / re-render / toggle off. */
    private mapToOriginalBodyHtml = new Map<PostId, string>()
    private mapToFactCheckUi = new Map<
        PostId,
        {
            factPanel: HTMLElement;
            runFactCheck: () => void;
            lastItems: FactCheckItem[] | null;
            lastError: string | null;
            /** Removes document capture listener used to dismiss pinned fact-check tooltips. */
            factCheckTooltipCleanup: (() => void) | null;
        }
    >();
    /** When set, detection badge / scanning / errors render here; fact panel stays a sibling. */
    private mapToDetectPanel = new Map<PostId, HTMLElement>();
    /** Tear-down for tooltips mounted on `document.body` (fixed position). */
    private tooltipCleanupByOverlay = new WeakMap<HTMLElement, () => void>();
    private settings: DetectionSettings;


    constructor(settings: DetectionSettings) {
        this.settings = settings;
    }

    private getEffectiveBadgeSize(): DetectionSettings["badgeSize"] {
        const requested = this.settings.badgeSize ?? "medium";
        if (this.settings.accessibilityMode && requested === "small") {
            return "medium";
        }
        return requested;
    }

    private getBadgeScale(target: "spacing" | "font"): number {
        const size = this.getEffectiveBadgeSize();
        if (this.settings.accessibilityMode) {
            const modeScale: Record<DetectionSettings["badgeSize"], number> =
                target === "font"
                    ? { small: 1, medium: 1.08, large: 1.18 }
                    : { small: 1, medium: 1.08, large: 1.18 };
            return modeScale[size];
        }
        const normalScale: Record<DetectionSettings["badgeSize"], number> =
            target === "font"
                ? { small: 0.9, medium: 1, large: 1.15 }
                : { small: 0.88, medium: 1, large: 1.2 };
        return normalScale[size];
    }

    protected scaleByBadgeSize(value: string, target: "spacing" | "font" = "spacing"): string {
        const scale = this.getBadgeScale(target);
        return value.replace(/(-?\d*\.?\d+)px/g, (_, num) => {
            const scaled = Math.max(1, Math.round(parseFloat(num) * scale * 100) / 100);
            return `${scaled}px`;
        });
    }

    /** Merge new settings and re-apply visible badges/tooltip wiring for completed scans. */
    updateSettings(settings: DetectionSettings): void {
        this.settings = settings;
        for (const [postId, res] of this.mapToResponse) {
            this.renderResult(postId, res);
        }
    }

    protected getBadgePosition(): Record<string, string> {
        return this.resolveBadgePosition({ top: "8px", right: "8px" });
    }

    protected getBadgePositionForHost(_hostNode: HTMLElement): Record<string, string> {
        return this.getBadgePosition();
    }

    protected resolveBadgePosition(base: Record<string, string>): Record<string, string> {
        const position = this.settings.badgePosition ?? "top_right";
        const top = base.top ?? base.bottom ?? "8px";
        const right = base.right ?? base.left ?? "8px";
        if (position === "top_left") {
            return { top, left: right };
        }
        if (position === "bottom_right") {
            return { bottom: top, right };
        }
        return { top, right };
    }

    protected getTooltipPosition(): Record<string, string> {
        return { bottom: "calc(100% + 8px)", right: "0" };
    }
    /** Padding/font for the pending badge container (before result). Subclasses may tighten for dense UIs. */
    protected getPendingBadgeContainerStyle(isSimple: boolean): Record<string, string> {
        return {
            padding: this.scaleByBadgeSize(isSimple ? "6px 12px" : "4px 8px", "spacing"),
            borderRadius: this.scaleByBadgeSize("4px", "spacing"),
            fontSize: this.scaleByBadgeSize(isSimple ? "14px" : "12px", "font"),
        };
    }


    protected getActionButtonStyle(_hostNode: HTMLElement, isSimple: boolean): Partial<CSSStyleDeclaration> {
        return {
            border: "none",
            borderRadius: this.scaleByBadgeSize("4px", "spacing"),
            padding: this.scaleByBadgeSize("6px 10px", "spacing"),
            fontSize: this.scaleByBadgeSize(isSimple ? "14px" : "12px", "font"),
            fontWeight: "600",
            color: "#fff",
            backgroundColor: this.getNeutralIndicatorColor(),
            cursor: "pointer",
        };
    }

    protected getSimpleVerdictBadgeFontSize(): string {
        return this.scaleByBadgeSize("14px", "font");
    }

    protected getSimpleVerdictBadgePadding(): string {
        return this.scaleByBadgeSize("6px 12px", "spacing");
    }

    protected getDetailedVerdictBadgeFontSize(): string {
        return this.scaleByBadgeSize("12px", "font");
    }

    protected getDetailedVerdictBadgePadding(): string {
        return this.scaleByBadgeSize("4px 8px", "spacing");
    }

    private getIndicatorTheme(): DetectionSettings["detectionTheme"] {
        return this.settings.detectionTheme ?? "default";
    }

    private getNeutralIndicatorColor(): string {
        const theme = this.getIndicatorTheme();
        if (theme === "high_contrast") return "#111827";
        if (theme === "minimal") return "#4b5563";
        return "#6b7280";
    }

    private getVerdictIndicatorColor(verdict: DetectionResponse["verdict"]): string {
        const theme = this.getIndicatorTheme();
        if (theme === "high_contrast") {
            const colorMap: Record<DetectionResponse["verdict"], string> = {
                likely_ai: "#ff1f1f",
                likely_human: "#00ff66",
                unknown: "#111827",
            };
            return colorMap[verdict];
        }
        if (theme === "minimal") {
            const colorMap: Record<DetectionResponse["verdict"], string> = {
                likely_ai: "#f87171",
                likely_human: "#86efac",
                unknown: "#4b5563",
            };
            return colorMap[verdict];
        }
        const colorMap: Record<DetectionResponse["verdict"], string> = {
            likely_ai: "#ef4444",
            likely_human: "#22c55e",
            unknown: "#6b7280",
        };
        return colorMap[verdict];
    }

    // render DetectionResponse as a badge on the page
    // for now, start with basic appearance, then we can match the UI mockups
    renderResult(postId: PostId, res: DetectionResponse): void {
        const surface = this.getDetectSurface(postId);
        if (!surface) return;

        this.restorePostBodyHtml(postId);
        this.mapToResponse.set(postId, res);
        this.resetOverlayInteractions(surface);
        surface.style.whiteSpace = "normal";

        const isSimple = this.settings.uiMode === "simple";

        surface.style.backgroundColor = this.getVerdictIndicatorColor(res.verdict);
        surface.style.cursor = "pointer";

        if (isSimple) {
            surface.style.fontSize = this.getSimpleVerdictBadgeFontSize();
            surface.style.padding = this.getSimpleVerdictBadgePadding();
        } else {
            surface.style.fontSize = this.getDetailedVerdictBadgeFontSize();
            surface.style.padding = this.getDetailedVerdictBadgePadding();
        }

        const textLabel = `${res.verdict} (${Math.round(res.confidence * 100)}%)`;
        const sourcePrefix = this.getPrimarySourceLabel(res);
        if (res.imageResult) {
            const mediaLabel = this.getMediaLabel(res.imageResult);
            surface.textContent = `Text: ${textLabel} · ${mediaLabel}: ${res.imageResult.verdict} (${Math.round(res.imageResult.confidence * 100)}%)`;
        } else {
            surface.textContent = sourcePrefix ? `${sourcePrefix}: ${textLabel}` : textLabel;
        }

        let tooltip: HTMLElement | null = null;
        let hideTooltipTimer: ReturnType<typeof setTimeout> | null = null;
        const postText = this.mapToPostText.get(postId) ?? "";
        const clearHideTimer = () => {
            if (!hideTooltipTimer) return;
            clearTimeout(hideTooltipTimer);
            hideTooltipTimer = null;
        };
        const removeTooltip = () => {
            tooltip?.remove();
            tooltip = null;
            surface.style.zIndex = OverlayRenderer.BADGE_Z_INDEX;
            this.setOverlayLayer(postId, false);
        };
        const scheduleHide = () => {
            clearHideTimer();
            hideTooltipTimer = setTimeout(() => {
                removeTooltip();
            }, OverlayRenderer.TOOLTIP_HIDE_DELAY_MS);
        };
        surface.onmouseenter = () => {
            clearHideTimer();
            if (tooltip) return;
            surface.style.zIndex = OverlayRenderer.ACTIVE_BADGE_Z_INDEX;
            this.setOverlayLayer(postId, true);
            tooltip = isSimple
                ? this.createSimpleTooltip(res, postText)
                : this.createTooltip(res, postText);
            this.mountTooltipOnBody(surface, tooltip);
        };

        surface.onmouseleave = () => {
            this.dismissTooltipForOverlay(surface);
            tooltip = null;
        };

        this.applyInPostHighlights(postId, res);
    }

    // renders Pending badge for the user.
    // plainText is the extracted post text from PostExtractor.
    // we store it so createTooltip can slice out highlighted spans later
    renderPending(
        postId: PostId,
        hostNode: HTMLElement,
        plainText: string,
        onDetectNow?: () => void,
        textContainer?: HTMLElement | null,
        onFactCheck?: () => void,
    ): void {
        this.mapToPostText.set(postId, plainText);
        if (textContainer) {
            this.mapToTextBody.set(postId, textContainer);
        } else {
            this.mapToTextBody.delete(postId);
        }

        // Instagram can rehydrate/reuse feed tiles, which may trigger multiple
        // pending renders on the same host node. Keep at most one overlay per tile.
        this.removeExistingHostOverlays(hostNode);

        const overlay = document.createElement("div");
        overlay.setAttribute(OverlayRenderer.OVERLAY_ATTR, "1");
        hostNode.style.position = "relative";
        hostNode.appendChild(overlay);
        const isSimple = this.settings.uiMode === "simple";
        Object.assign(overlay.style, {
            position: "absolute",
            ...this.getBadgePositionForHost(hostNode),
            ...this.getPendingBadgeContainerStyle(isSimple),
            zIndex: "9999",
            backgroundColor: this.getNeutralIndicatorColor(),
            color: "#fff",
        });
        if (!onDetectNow) {
            // automatic mode: single grey “Scanning…” pill.
            Object.assign(overlay.style, {
                padding: this.scaleByBadgeSize(isSimple ? "6px 12px" : "4px 8px", "spacing"),
                borderRadius: this.scaleByBadgeSize("4px", "spacing"),
                backgroundColor: this.getNeutralIndicatorColor(),
                color: "#fff",
            });
            overlay.textContent = "Scanning...";
            this.mapToOverlay.set(postId, overlay);
            this.mapToDetectPanel.set(postId, overlay);
            return;
        }

        const greyBoxStyle = (el: HTMLElement): void => {
            Object.assign(el.style, {
                position: "relative",
                padding: this.scaleByBadgeSize(isSimple ? "6px 12px" : "4px 8px", "spacing"),
                borderRadius: this.scaleByBadgeSize("4px", "spacing"),
                backgroundColor: this.getNeutralIndicatorColor(),
                color: "#fff",
                display: "flex",
                flexDirection: "column",
                gap: "6px",
                alignItems: "stretch",
                maxWidth: "min(92vw, 400px)",
            });
        };

        const buttonStyle: Partial<CSSStyleDeclaration> = this.getActionButtonStyle(hostNode, isSimple);

        // manual + Fact check: outer row with two grey boxes — fact panel persists after Detect runs.
        if (onFactCheck) {
            Object.assign(overlay.style, {
                padding: "0",
                backgroundColor: "transparent",
                color: "inherit",
                borderRadius: "0",
                boxShadow: "none",
                display: "flex",
                flexDirection: "row",
                flexWrap: "wrap",
                gap: "6px",
                justifyContent: "flex-end",
                alignItems: "flex-start",
            });

            const factPanel = document.createElement("div");
            factPanel.setAttribute("data-slopmop-fact-panel", "1");
            greyBoxStyle(factPanel);

            const factButton = document.createElement("button");
            factButton.type = "button";
            factButton.textContent = "Fact check";
            Object.assign(factButton.style, {
                ...buttonStyle,
                backgroundColor: this.getNeutralIndicatorColor(),
                width: "100%",
            });

            const run = () => {
                onFactCheck();
            };
            this.mapToFactCheckUi.set(postId, {
                factPanel,
                runFactCheck: run,
                lastItems: null,
                lastError: null,
                factCheckTooltipCleanup: null,
            });
            factButton.onclick = (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.showFactCheckingState(postId);
                run();
            };
            factPanel.appendChild(factButton);

            const detectPanel = document.createElement("div");
            detectPanel.setAttribute("data-slopmop-detect-panel", "1");
            greyBoxStyle(detectPanel);

            const detectNowButton = document.createElement("button");
            detectNowButton.type = "button";
            detectNowButton.textContent = "Detect Now";
            Object.assign(detectNowButton.style, {
                ...buttonStyle,
                backgroundColor: this.getNeutralIndicatorColor(),
                width: "100%",
            });
            detectNowButton.onclick = (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.showScanningStateForPost(postId);
                onDetectNow();
            };
            detectPanel.appendChild(detectNowButton);

            overlay.appendChild(factPanel);
            overlay.appendChild(detectPanel);
            this.mapToOverlay.set(postId, overlay);
            this.mapToDetectPanel.set(postId, detectPanel);
            return;
        }

        // manual, no fact check: original single grey box + Detect Now.
        Object.assign(overlay.style, {
            padding: this.scaleByBadgeSize(isSimple ? "6px 12px" : "4px 8px", "spacing"),
            borderRadius: this.scaleByBadgeSize("4px", "spacing"),
            fontSize: this.scaleByBadgeSize(isSimple ? "14px" : "12px", "font"),
            backgroundColor: this.getNeutralIndicatorColor(),
            color: "#fff",
        });
        const detectNowButton = document.createElement("button");
        detectNowButton.type = "button";
        detectNowButton.textContent = "Detect Now";
        Object.assign(detectNowButton.style, {
            backgroundColor: this.getNeutralIndicatorColor(),
            ...this.getActionButtonStyle(hostNode, isSimple),
        });
        detectNowButton.onclick = (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.showScanningStateForPost(postId);
            onDetectNow();
        };
        overlay.appendChild(detectNowButton);
        this.mapToOverlay.set(postId, overlay);
        this.mapToDetectPanel.set(postId, overlay);
    }

    private removeExistingHostOverlays(hostNode: HTMLElement): void {
        const existingOverlays = Array.from(hostNode.children).filter((child) =>
            (child as HTMLElement).getAttribute(OverlayRenderer.OVERLAY_ATTR) === "1",
        ) as HTMLElement[];
        if (existingOverlays.length === 0) return;

        const stale = new Set(existingOverlays);
        for (const [existingPostId, overlayEl] of this.mapToOverlay) {
            if (!stale.has(overlayEl)) continue;
            this.mapToOverlay.delete(existingPostId);
            this.mapToResponse.delete(existingPostId);
            this.mapToPostText.delete(existingPostId);
            this.mapToErrorMessage.delete(existingPostId);
            this.mapToTextBody.delete(existingPostId);
            this.mapToOriginalBodyHtml.delete(existingPostId);
            this.mapToFactCheckUi.delete(existingPostId);
            this.mapToDetectPanel.delete(existingPostId);
        }

        for (const overlay of existingOverlays) {
            overlay.remove();
        }
    }

    /**
     * Language blocked — compact “Unsupported language” badge; hover explains what was detected and settings.
     */
    renderLanguageUnsupported(
        postId: PostId,
        hover: { simpleTitle: string; tooltipTitle: string; tooltipBody: string },
    ): void {
        const surface = this.getDetectSurface(postId);
        if (!surface) return;
        this.restorePostBodyHtml(postId);
        this.mapToErrorMessage.delete(postId);
        this.resetOverlayInteractions(surface);
        surface.removeAttribute("title");
        surface.style.backgroundColor = "#f59e0b";
        surface.style.whiteSpace = "normal";

        surface.textContent = "Unsupported language";
        surface.style.cursor = "default";
        surface.removeAttribute("title");

        // Match Detect / verdict tooltips: same shell as createSimpleTooltip vs createTooltip, mounted on
        // document.body so feed overflow does not clip. Title/body carry "Unchecked in settings" vs
        // "Unsupported language" from getLanguageUnsupportedCopy.
        let tooltip: HTMLElement | null = null;
        surface.onmouseenter = () => {
            if (tooltip) return;
            surface.style.zIndex = OverlayRenderer.ACTIVE_BADGE_Z_INDEX;
            this.setOverlayLayer(postId, true);
            tooltip = this.createLanguageUnsupportedTooltip(hover.tooltipTitle, hover.tooltipBody);
            this.mountTooltipOnBody(surface, tooltip);
        };
        surface.onmouseleave = () => {
            this.dismissTooltipForOverlay(surface);
            tooltip = null;
            surface.style.zIndex = OverlayRenderer.BADGE_Z_INDEX;
            this.setOverlayLayer(postId, false);
        };
    }

    renderError(postId: PostId, message: string, onRetry?: () => void): void {
        const surface = this.getDetectSurface(postId);
        if (!surface) return;
        this.restorePostBodyHtml(postId);
        console.error("[OverlayRenderer] detection error", { postId, message });
        this.mapToErrorMessage.set(postId, message);
        surface.removeAttribute("title");
        this.resetOverlayInteractions(surface);
        surface.style.backgroundColor = "#f59e0b"; // amber
        surface.style.whiteSpace = "normal";

        const isSimple = this.settings.uiMode === "simple";
        surface.textContent = "Error";

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
                this.showScanningStateForPost(postId);
                onRetry();
            };
            surface.appendChild(retryButton);
        }

        surface.style.cursor = onRetry ? "default" : "pointer";
        let tooltip: HTMLElement | null = null;
        let hideTooltipTimer: ReturnType<typeof setTimeout> | null = null;
        const clearHideTimer = () => {
            if (!hideTooltipTimer) return;
            clearTimeout(hideTooltipTimer);
            hideTooltipTimer = null;
        };
        const removeTooltip = () => {
            tooltip?.remove();
            tooltip = null;
            surface.style.zIndex = OverlayRenderer.BADGE_Z_INDEX;
            this.setOverlayLayer(postId, false);
        };
        const scheduleHide = () => {
            clearHideTimer();
            hideTooltipTimer = setTimeout(() => {
                removeTooltip();
            }, OverlayRenderer.TOOLTIP_HIDE_DELAY_MS);
        };
        surface.onmouseenter = () => {
            clearHideTimer();
            if (tooltip) return;
            surface.style.zIndex = OverlayRenderer.ACTIVE_BADGE_Z_INDEX;
            this.setOverlayLayer(postId, true);
            const errorMessage = this.mapToErrorMessage.get(postId) || "Unknown error";
            tooltip = this.createErrorTooltip(errorMessage);
            this.mountTooltipOnBody(surface, tooltip);
        };
        surface.onmouseleave = () => {
            this.dismissTooltipForOverlay(surface);
            tooltip = null;
        };

    }
    // removes a DOM element and its entry from all three maps
    clear(postId: PostId): void {
        const overlay = this.mapToOverlay.get(postId);
        if (!overlay) return;
        this.restorePostBodyHtml(postId);
        this.dismissTooltipForOverlay(overlay);
        overlay.remove();
        this.mapToOverlay.delete(postId);
        this.mapToResponse.delete(postId);
        this.mapToPostText.delete(postId);
        this.mapToErrorMessage.delete(postId);
        this.mapToTextBody.delete(postId);
        this.clearFactCheckTooltipListeners(postId);
        this.mapToFactCheckUi.delete(postId);
        this.mapToDetectPanel.delete(postId);
    }

    private clearFactCheckTooltipListeners(postId: PostId): void {
        const ui = this.mapToFactCheckUi.get(postId);
        if (ui?.factCheckTooltipCleanup) {
            ui.factCheckTooltipCleanup();
            ui.factCheckTooltipCleanup = null;
        }
    }

    private restorePostBodyHtml(postId: PostId): void {
        const el = this.mapToTextBody.get(postId);
        const snapshot = this.mapToOriginalBodyHtml.get(postId);
        if (el && snapshot !== undefined) {
            el.innerHTML = snapshot;
        }
        this.mapToOriginalBodyHtml.delete(postId);
    }

    /** Fact panel becomes a verdict-style badge; details live in hover tooltips like AI detection. */
    renderFactCheckResult(postId: PostId, items: FactCheckItem[]): void {
        const ui = this.mapToFactCheckUi.get(postId);
        if (!ui) return;
        const { factPanel } = ui;
        ui.lastItems = items;
        ui.lastError = null;
        factPanel.removeAttribute("title");
        this.clearFactCheckTooltipListeners(postId);
        this.resetOverlayInteractions(factPanel);
        factPanel.style.whiteSpace = "normal";

        const isSimple = this.settings.uiMode === "simple";
        if (isSimple) {
            factPanel.style.fontSize = "14px";
            factPanel.style.padding = "6px 12px";
        } else {
            factPanel.style.fontSize = "12px";
            factPanel.style.padding = "4px 8px";
        }

        const hasHits = items.length > 0;
        factPanel.style.backgroundColor = hasHits
            ? this.getVerdictIndicatorColor("likely_human")
            : this.getNeutralIndicatorColor();
        factPanel.style.cursor = "pointer";
        factPanel.textContent = hasHits
            ? `${items.length} fact check${items.length !== 1 ? "s" : ""}`
            : "Not recognized";

        let tooltip: HTMLElement | null = null;
        let pinned = false;

        const removeDocDismiss = (): void => {
            if (ui.factCheckTooltipCleanup) {
                ui.factCheckTooltipCleanup();
                ui.factCheckTooltipCleanup = null;
            }
        };

        const hideTooltip = (): void => {
            this.dismissTooltipForOverlay(factPanel);
            tooltip = null;
            pinned = false;
            removeDocDismiss();
            this.setOverlayLayer(postId, false);
        };

        const showTooltip = (): void => {
            if (tooltip) return;
            this.setOverlayLayer(postId, true);
            tooltip = isSimple
                ? this.createSimpleFactCheckTooltip(items)
                : this.createFactCheckTooltipDetailed(items);
            this.mountTooltipOnBody(factPanel, tooltip);
        };

        const setPinned = (next: boolean): void => {
            pinned = next;
            removeDocDismiss();
            if (!next) return;
            const onDocClick = (e: MouseEvent): void => {
                if (!tooltip || !pinned) return;
                const t = e.target instanceof Node ? e.target : null;
                if (t && (factPanel.contains(t) || tooltip.contains(t))) return;
                hideTooltip();
            };
            document.addEventListener("click", onDocClick, true);
            ui.factCheckTooltipCleanup = (): void => {
                document.removeEventListener("click", onDocClick, true);
            };
        };

        factPanel.onmouseenter = (): void => {
            if (!tooltip) showTooltip();
        };
        factPanel.onmouseleave = (): void => {
            if (!pinned) hideTooltip();
        };
        factPanel.onclick = (e: MouseEvent): void => {
            e.stopPropagation();
            const t = e.target instanceof Node ? e.target : null;
            if (t && tooltip?.contains(t)) return;
            if (pinned && tooltip) {
                hideTooltip();
                return;
            }
            showTooltip();
            setPinned(true);
        };

        showTooltip();
        setPinned(true);
    }

    renderFactCheckError(postId: PostId, message: string): void {
        const ui = this.mapToFactCheckUi.get(postId);
        if (!ui) return;
        const { factPanel, runFactCheck } = ui;
        ui.lastError = message;
        ui.lastItems = null;
        factPanel.removeAttribute("title");
        this.clearFactCheckTooltipListeners(postId);
        this.resetOverlayInteractions(factPanel);
        factPanel.style.whiteSpace = "normal";
        factPanel.style.backgroundColor = "#f59e0b";
        const isSimple = this.settings.uiMode === "simple";
        if (isSimple) {
            factPanel.style.fontSize = "14px";
            factPanel.style.padding = "6px 12px";
        } else {
            factPanel.style.fontSize = "12px";
            factPanel.style.padding = "4px 8px";
        }
        factPanel.textContent = "Error";

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
            this.showFactCheckingState(postId);
            runFactCheck();
        };
        factPanel.appendChild(retryButton);

        if (isSimple) {
            factPanel.style.cursor = "default";
            return;
        }

        factPanel.style.cursor = "pointer";
        let tooltip: HTMLElement | null = null;
        let pinned = false;

        const removeDocDismiss = (): void => {
            if (ui.factCheckTooltipCleanup) {
                ui.factCheckTooltipCleanup();
                ui.factCheckTooltipCleanup = null;
            }
        };

        const hideTooltip = (): void => {
            this.dismissTooltipForOverlay(factPanel);
            tooltip = null;
            pinned = false;
            removeDocDismiss();
            this.setOverlayLayer(postId, false);
        };

        const showTooltip = (): void => {
            if (tooltip) return;
            this.setOverlayLayer(postId, true);
            tooltip = this.createFactCheckErrorTooltip(message);
            this.mountTooltipOnBody(factPanel, tooltip);
        };

        const setPinned = (next: boolean): void => {
            pinned = next;
            removeDocDismiss();
            if (!next) return;
            const onDocClick = (e: MouseEvent): void => {
                if (!tooltip || !pinned) return;
                const t = e.target instanceof Node ? e.target : null;
                if (t && (factPanel.contains(t) || tooltip.contains(t))) return;
                hideTooltip();
            };
            document.addEventListener("click", onDocClick, true);
            ui.factCheckTooltipCleanup = (): void => {
                document.removeEventListener("click", onDocClick, true);
            };
        };

        factPanel.onmouseenter = (): void => {
            if (!tooltip) showTooltip();
        };
        factPanel.onmouseleave = (): void => {
            if (!pinned) hideTooltip();
        };
        factPanel.onclick = (e: MouseEvent): void => {
            e.stopPropagation();
            const t = e.target instanceof Node ? e.target : null;
            if (t && tooltip?.contains(t)) return;
            if (pinned && tooltip) {
                hideTooltip();
                return;
            }
            showTooltip();
            setPinned(true);
        };

        showTooltip();
        setPinned(true);
    }

    private applyInPostHighlights(postId: PostId, res: DetectionResponse): void {
        if (!this.settings.highlightSegments) return;
        const spans = res.explanation.highlightedSpans;
        if (!spans || spans.length === 0) return;
        const plain = this.mapToPostText.get(postId) ?? "";
        const el = this.mapToTextBody.get(postId);
        if (!plain || !el) return;
        if (normalizePlainText(el.innerText ?? "") !== plain) return;

        const usable = prepareHighlightSpans(plain, spans);
        if (usable.length === 0) return;

        if (canApplyInnerHtmlHighlights(el)) {
            this.mapToOriginalBodyHtml.set(postId, el.innerHTML);
            el.innerHTML = buildHighlightedHtml(plain, usable);
            return;
        }

        this.mapToOriginalBodyHtml.set(postId, el.innerHTML);
        if (applyRichDomHighlightSpans(el, plain, usable)) {
            return;
        }
        this.mapToOriginalBodyHtml.delete(postId);
    }

    private findPostIdForOverlay(overlay: HTMLElement): PostId | null {
        for (const [pid, outer] of this.mapToOverlay) {
            if (overlay === outer || outer.contains(overlay)) return pid;
        }
        return null;
    }

    private setOverlayLayer(postId: PostId, active: boolean): void {
        const container = this.mapToOverlay.get(postId);
        if (!container) return;
        container.style.zIndex = active
            ? OverlayRenderer.ACTIVE_BADGE_Z_INDEX
            : OverlayRenderer.BADGE_Z_INDEX;
    }

    /** Element that shows AI detection state (badge / scanning). Fact panel is separate when present. */
    private getDetectSurface(postId: PostId): HTMLElement | null {
        return this.mapToDetectPanel.get(postId) ?? this.mapToOverlay.get(postId) ?? null;
    }

    private showScanningStateForPost(postId: PostId): void {
        this.restorePostBodyHtml(postId);
        const surface = this.mapToDetectPanel.get(postId) ?? this.mapToOverlay.get(postId);
        if (!surface) return;
        this.resetOverlayInteractions(surface);
        surface.style.whiteSpace = "normal";
        surface.style.backgroundColor = this.getNeutralIndicatorColor();
        surface.style.cursor = "default";
        surface.textContent = "Scanning...";
    }

    private showFactCheckingState(postId: PostId): void {
        const ui = this.mapToFactCheckUi.get(postId);
        if (!ui) return;
        const { factPanel } = ui;
        factPanel.removeAttribute("title");
        this.clearFactCheckTooltipListeners(postId);
        this.resetOverlayInteractions(factPanel);
        factPanel.style.whiteSpace = "normal";
        factPanel.style.backgroundColor = this.getNeutralIndicatorColor();
        factPanel.style.cursor = "default";
        factPanel.textContent = "Checking…";
    }

    private createSimpleFactCheckTooltip(items: FactCheckItem[]): HTMLElement {
        const tip = document.createElement("div");
        Object.assign(tip.style, {
            position: "absolute",
            ...this.getTooltipPosition(),
            minWidth: "200px",
            maxWidth: "320px",
            padding: "14px",
            borderRadius: "8px",
            backgroundColor: "#1f2937",
            color: "#f3f4f6",
            fontSize: "14px",
            lineHeight: "1.5",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            zIndex: OverlayRenderer.TOOLTIP_Z_INDEX,
            pointerEvents: "auto",
            wordBreak: "break-word",
        });
        tip.onclick = (e) => e.stopPropagation();

        const header = document.createElement("div");
        Object.assign(header.style, {
            fontWeight: "700",
            fontSize: "16px",
            marginBottom: "8px",
        });
        header.textContent = items.length === 0 ? "Not recognized" : `Fact checks (${items.length})`;
        tip.appendChild(header);

        if (items.length === 0) {
            const p = document.createElement("div");
            p.textContent =
                "Google’s fact-check index had no ClaimReview entries for these excerpts. " +
                "Index coverage depends on what publishers have reviewed.";
            tip.appendChild(p);
            return tip;
        }

        const body = document.createElement("div");
        body.textContent = items
            .map((it, i) => {
                const c = it.claim.length > 140 ? `${it.claim.slice(0, 140)}…` : it.claim;
                return `${i + 1}. ${c}${it.verdict ? ` — ${it.verdict}` : ""}`;
            })
            .join("\n\n");
        tip.appendChild(body);

        return tip;
    }

    private createFactCheckTooltipDetailed(items: FactCheckItem[]): HTMLElement {
        const tip = document.createElement("div");
        Object.assign(tip.style, {
            position: "absolute",
            ...this.getTooltipPosition(),
            minWidth: "260px",
            maxWidth: "380px",
            maxHeight: "400px",
            overflowY: "auto",
            padding: "12px",
            borderRadius: "8px",
            backgroundColor: "#1f2937",
            color: "#f3f4f6",
            fontSize: "12px",
            lineHeight: "1.5",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            zIndex: OverlayRenderer.TOOLTIP_Z_INDEX,
            pointerEvents: "auto",
            wordBreak: "break-word",
        });
        tip.onclick = (e) => e.stopPropagation();

        const header = document.createElement("div");
        Object.assign(header.style, {
            fontWeight: "700",
            fontSize: "14px",
            marginBottom: "6px",
        });
        header.textContent = items.length === 0 ? "No database match" : `ClaimReview (${items.length})`;
        tip.appendChild(header);

        if (items.length === 0) {
            const p = document.createElement("div");
            p.textContent =
                "No ClaimReview matches for these excerpts. Fact checks only exist for claims publishers have reviewed.";
            tip.appendChild(p);
            return tip;
        }

        items.forEach((it, idx) => {
            const block = document.createElement("div");
            if (idx > 0) {
                Object.assign(block.style, {
                    borderTop: "1px solid #374151",
                    paddingTop: "8px",
                    marginTop: "8px",
                });
            }
            this.appendFactCheckItemToTooltip(block, it);
            tip.appendChild(block);
        });

        return tip;
    }

    private appendFactCheckItemToTooltip(container: HTMLElement, it: FactCheckItem): void {
        const claimEl = document.createElement("div");
        Object.assign(claimEl.style, {
            fontWeight: "600",
            marginBottom: "4px",
            color: "#e5e7eb",
        });
        claimEl.textContent = it.claim;
        container.appendChild(claimEl);

        const meta = document.createElement("div");
        Object.assign(meta.style, {
            color: "#9ca3af",
            marginBottom: "6px",
            fontSize: "11px",
        });
        meta.textContent = [it.verdict, it.source].filter(Boolean).join(" · ");
        container.appendChild(meta);

        if (it.url) {
            const a = document.createElement("a");
            a.href = it.url;
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            a.textContent = "Open source article";
            Object.assign(a.style, {
                color: "#93c5fd",
                fontWeight: "600",
                textDecoration: "underline",
            });
            a.onclick = (ev) => ev.stopPropagation();
            container.appendChild(a);
        }
    }

    private createFactCheckErrorTooltip(message: string): HTMLElement {
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
            zIndex: OverlayRenderer.TOOLTIP_Z_INDEX,
            pointerEvents: "auto",
            wordBreak: "break-word",
        });
        tip.onclick = (e) => e.stopPropagation();

        const header = document.createElement("div");
        Object.assign(header.style, {
            fontWeight: "700",
            fontSize: "13px",
            marginBottom: "6px",
            color: "#fbbf24",
        });
        header.textContent = "Fact check error";
        tip.appendChild(header);

        const body = document.createElement("div");
        body.textContent = message;
        tip.appendChild(body);

        return tip;
    }

    /** True when the badge element is still in the document (virtualized lists may drop the host). */
    isBadgeDomAlive(postId: PostId): boolean {
        const el = this.mapToOverlay.get(postId);
        return Boolean(el?.isConnected);
    }

    getCachedDetectionResponse(postId: PostId): DetectionResponse | undefined {
        return this.mapToResponse.get(postId);
    }

    /**
     * Drop overlay map entry when the host was recycled; keep analysis maps so we can re-draw the verdict.
     */
    forgetDisconnectedBadge(postId: PostId): void {
        const el = this.mapToOverlay.get(postId);
        if (!el) return;
        if (el.isConnected) return;
        this.dismissTooltipForOverlay(el);
        this.mapToOverlay.delete(postId);
    }

    /**
     * After a virtualized tweet remounts, re-attach the result badge using cached detection data.
     */
    mountResultBadgeOnHost(
        postId: PostId,
        hostNode: HTMLElement,
        plainText: string,
        res: DetectionResponse,
        textContainer?: HTMLElement | null,
    ): void {
        this.mapToPostText.set(postId, plainText);
        if (textContainer) {
            this.mapToTextBody.set(postId, textContainer);
        } else {
            this.mapToTextBody.delete(postId);
        }
        const overlay = document.createElement("div");
        hostNode.style.position = "relative";
        hostNode.appendChild(overlay);
        const isSimple = this.settings.uiMode === "simple";
        Object.assign(overlay.style, {
            position: "absolute",
            ...this.getBadgePositionForHost(hostNode),
            ...this.getPendingBadgeContainerStyle(isSimple),
            zIndex: "9999",
            backgroundColor: this.getNeutralIndicatorColor(),
            color: "#fff",
        });
        this.mapToOverlay.set(postId, overlay);
        this.mapToResponse.set(postId, res);
        this.renderResult(postId, res);
    }

    private createSimpleTooltip(res: DetectionResponse, postText: string): HTMLElement {
        const verdictLabel: Record<DetectionResponse["verdict"], string> = {
            likely_ai: "Likely AI-generated",
            likely_human: "Likely human-written",
            unknown: "Inconclusive",
        };

        const tip = document.createElement("div");
        Object.assign(tip.style, {
            minWidth: "200px",
            maxWidth: "300px",
            padding: "14px",
            borderRadius: "8px",
            backgroundColor: "#1f2937",
            color: "#f3f4f6",
            fontSize: "14px",
            lineHeight: "1.5",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            zIndex: OverlayRenderer.TOOLTIP_Z_INDEX,
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
        } else {
            const sourcePrefix = this.getPrimarySourceLabel(res);
            if (sourcePrefix) {
                header.textContent = `${sourcePrefix}: ${Math.round(res.confidence * 100)}% — ${verdictLabel[res.verdict]}`;
            }
        }
        tip.appendChild(header);

        const langLineSimple = getTooltipLanguageLine(
            postText,
            expandUserDetectionLanguages(this.settings.detectionLanguages),
        );
        if (langLineSimple) {
            tip.appendChild(this.makeTooltipLanguageRow(langLineSimple, "13px", "#9ca3af"));
        }

        const satireScore = (res as any)?.satire_score;
        const satireLabelRaw = (res as any)?.satire_label;
        const satireLabel =
            typeof satireLabelRaw === "string" && satireLabelRaw.toLowerCase() === "satire"
                ? "satire"
                : typeof satireLabelRaw === "string" &&
                    (satireLabelRaw.toLowerCase() === "non_satire" ||
                        satireLabelRaw.toLowerCase() === "non-satire")
                    ? "non_satire"
                    : null;
        if (typeof satireScore === "number" || satireLabel !== null) {
            const line = document.createElement("div");
            Object.assign(line.style, {
                marginTop: "6px",
                marginBottom: "8px",
                fontSize: "12px",
                color: "#d1d5db",
                fontWeight: "600",
            });
            const pct = typeof satireScore === "number" ? ` (${Math.round(satireScore * 100)}%)` : "";
            line.textContent =
                "Satire: " +
                (satireLabel === "satire" ? "Yes" : satireLabel === "non_satire" ? "No" : "Unknown") +
                pct;
            tip.appendChild(line);
        }
        if (typeof satireScore === "number" && satireScore >= SATIRE_SCORE_SOFTEN_THRESHOLD) {
            const banner = document.createElement("div");
            Object.assign(banner.style, {
                marginTop: "8px",
                marginBottom: "8px",
                padding: "8px",
                borderRadius: "6px",
                backgroundColor: "rgba(251, 191, 36, 0.12)",
                border: "1px solid rgba(251, 191, 36, 0.45)",
                color: "#fde68a",
                fontSize: "12px",
                lineHeight: "1.45",
            });
            banner.textContent =
                satireScore >= SATIRE_SCORE_HIGH_BANNER_THRESHOLD
                    ? "Satire/parody detected. AI scores may be lowered on satirical posts to reduce false positives."
                    : "Satire signal is elevated — interpret AI scores cautiously for humorous/parody content.";
            tip.appendChild(banner);
        }

        const summary = document.createElement("div");
        Object.assign(summary.style, { fontSize: "14px", marginTop: "8px" });
        summary.textContent = res.explanation.summary;
        tip.appendChild(summary);

        if (res.imageResult) {
            this.appendImageSection(tip, res.imageResult, "16px", "14px");
        }

        return tip;
    }

    private createTooltip(res: DetectionResponse, postText: string): HTMLElement {
        const highlights = this.settings.highlightSegments
            ? (res.explanation.highlights ?? [])
            : [];
        // if there are highlights to show, use a wider tooltip to fit quoted excerpts.
        // otherwise keep it compact. height is always auto so it grows with content
        const hasHighlights = highlights.length > 0 && postText.length > 0;

        const tip = document.createElement("div");
        // style the tooltip container.
        // minWidth/maxWidth instead of fixed width so it scales with content volume.
        // maxHeight + overflowY: "auto" prevents it from growing taller than the viewport
        Object.assign(tip.style, {
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
            zIndex: OverlayRenderer.TOOLTIP_Z_INDEX,
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
        if (!res.imageResult) {
            const sourcePrefix = this.getPrimarySourceLabel(res);
            if (sourcePrefix) {
                header.textContent = `${sourcePrefix}: ${Math.round(res.confidence * 100)}% — ${verdictLabel[res.verdict]}`;
            }
        }
        tip.appendChild(header);

        const langLine = getTooltipLanguageLine(
            postText,
            expandUserDetectionLanguages(this.settings.detectionLanguages),
        );
        if (langLine) {
            tip.appendChild(this.makeTooltipLanguageRow(langLine, "12px", "#9ca3af"));
        }

        const satireScore = (res as any)?.satire_score;
        const satireLabelRaw = (res as any)?.satire_label;
        const satireLabel =
            typeof satireLabelRaw === "string" && satireLabelRaw.toLowerCase() === "satire"
                ? "satire"
                : typeof satireLabelRaw === "string" &&
                    (satireLabelRaw.toLowerCase() === "non_satire" ||
                        satireLabelRaw.toLowerCase() === "non-satire")
                    ? "non_satire"
                    : null;
        if (typeof satireScore === "number" || satireLabel !== null) {
            const line = document.createElement("div");
            Object.assign(line.style, {
                marginBottom: "8px",
                fontSize: "11px",
                color: "#d1d5db",
                fontWeight: "600",
            });
            const pct = typeof satireScore === "number" ? ` (${Math.round(satireScore * 100)}%)` : "";
            line.textContent =
                "Satire: " +
                (satireLabel === "satire" ? "Yes" : satireLabel === "non_satire" ? "No" : "Unknown") +
                pct;
            tip.appendChild(line);
        }
        if (typeof satireScore === "number" && satireScore >= SATIRE_SCORE_SOFTEN_THRESHOLD) {
            const banner = document.createElement("div");
            Object.assign(banner.style, {
                marginBottom: "8px",
                padding: "8px",
                borderRadius: "6px",
                backgroundColor: "rgba(251, 191, 36, 0.12)",
                border: "1px solid rgba(251, 191, 36, 0.45)",
                color: "#fde68a",
                fontSize: "11px",
                lineHeight: "1.45",
            });
            banner.textContent =
                satireScore >= SATIRE_SCORE_HIGH_BANNER_THRESHOLD
                    ? "Satire/parody detected. AI scores may be lowered on satirical posts to reduce false positives."
                    : "Satire signal is elevated — interpret AI scores cautiously for humorous/parody content.";
            tip.appendChild(banner);
        }

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

        const showSegmentDetail = this.settings.highlightSegments;

        // pattern-based reasons (local heuristics); only when segment highlights are on
        const tooltipPatternReasons = showSegmentDetail ? getPatternReasons(postText) : [];
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

        // Backend explanation (text classifier + optional satire nudge) — show whenever highlights are off,
        // and when on (above per-segment detail below).
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

    private makeTooltipLanguageRow(
        line: string,
        fontSize: string,
        color: string,
    ): HTMLElement {
        const row = document.createElement("div");
        Object.assign(row.style, {
            fontSize,
            color,
            marginBottom: "6px",
        });
        row.textContent = line;
        return row;
    }

    /**
     * Visually aligned with {@link createSimpleTooltip} / {@link createTooltip} (Detect Now hover).
     * {@code title} is "Unchecked in settings" or "Unsupported language"; {@code body} is the explanation.
     */
    private createLanguageUnsupportedTooltip(title: string, body: string): HTMLElement {
        const isSimple = this.settings.uiMode === "simple";
        const tip = document.createElement("div");
        Object.assign(tip.style, {
            wordBreak: "break-word",
            pointerEvents: "none",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            zIndex: OverlayRenderer.TOOLTIP_Z_INDEX,
            borderRadius: "8px",
            backgroundColor: "#1f2937",
            color: "#f3f4f6",
            lineHeight: "1.5",
        });

        if (isSimple) {
            Object.assign(tip.style, {
                minWidth: "200px",
                maxWidth: "300px",
                padding: "14px",
                fontSize: "14px",
            });
            const header = document.createElement("div");
            Object.assign(header.style, {
                fontWeight: "700",
                fontSize: "16px",
                marginBottom: "8px",
            });
            header.textContent = title;
            tip.appendChild(header);
            const summary = document.createElement("div");
            Object.assign(summary.style, { fontSize: "14px", marginTop: "8px" });
            summary.textContent = body;
            tip.appendChild(summary);
        } else {
            Object.assign(tip.style, {
                minWidth: "240px",
                maxWidth: "300px",
                maxHeight: "400px",
                overflowY: "auto",
                padding: "12px",
                fontSize: "12px",
            });
            const header = document.createElement("div");
            Object.assign(header.style, {
                fontWeight: "700",
                fontSize: "14px",
                marginBottom: "6px",
            });
            header.textContent = title;
            tip.appendChild(header);
            const bodyEl = document.createElement("div");
            Object.assign(bodyEl.style, {
                marginTop: "6px",
                color: "#e5e7eb",
            });
            bodyEl.textContent = body;
            tip.appendChild(bodyEl);
        }

        return tip;
    }

    private createErrorTooltip(message: string): HTMLElement {
        const tip = document.createElement("div");
        Object.assign(tip.style, {
            minWidth: "240px",
            maxWidth: "320px",
            padding: "12px",
            borderRadius: "8px",
            backgroundColor: "#1f2937",
            color: "#f3f4f6",
            fontSize: "12px",
            lineHeight: "1.5",
            boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
            zIndex: OverlayRenderer.TOOLTIP_Z_INDEX,
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
        const mediaLabel = this.getMediaLabel(imgRes);
        imgHeader.textContent = `${mediaLabel}: ${Math.round(imgRes.confidence * 100)}% — ${verdictLabel[imgRes.verdict]}`;
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

    private dismissTooltipForOverlay(overlay: HTMLElement): void {
        const fn = this.tooltipCleanupByOverlay.get(overlay);
        fn?.();
    }

    /**
     * Append tooltip to `document.body` with `position: fixed` under the badge so parent
     * `overflow` and later thread rows do not clip or cover the panel.
     */
    private mountTooltipOnBody(overlay: HTMLElement, tooltip: HTMLElement): void {
        this.dismissTooltipForOverlay(overlay);
        document.body.appendChild(tooltip);
        const apply = (): void => {
            const r = overlay.getBoundingClientRect();
            tooltip.style.position = "fixed";
            tooltip.style.top = `${r.bottom + 8}px`;
            tooltip.style.right = `${window.innerWidth - r.right}px`;
            tooltip.style.left = "auto";
            tooltip.style.bottom = "auto";
            tooltip.style.zIndex = "2147483647";
        };
        apply();
        const onScrollOrResize = (): void => apply();
        window.addEventListener("scroll", onScrollOrResize, true);
        window.addEventListener("resize", onScrollOrResize);
        const cleanup = (): void => {
            window.removeEventListener("scroll", onScrollOrResize, true);
            window.removeEventListener("resize", onScrollOrResize);
            tooltip.remove();
            this.tooltipCleanupByOverlay.delete(overlay);
        };
        this.tooltipCleanupByOverlay.set(overlay, cleanup);
    }

    private resetOverlayInteractions(overlay: HTMLElement): void {
        this.dismissTooltipForOverlay(overlay);
        overlay.replaceChildren();
        overlay.onmouseenter = null;
        overlay.onmouseleave = null;
        overlay.onclick = null;
        overlay.style.zIndex = OverlayRenderer.BADGE_Z_INDEX;
    }

    private getMediaLabel(imgRes: ImageDetectionResult): "Image" | "Video" | "GIF" {
        if (imgRes.mediaType === "video") return "Video";
        if (imgRes.mediaType === "gif") return "GIF";
        return "Image";
    }

    private getPrimarySourceLabel(res: DetectionResponse): "Image" | "Video" | "GIF" | null {
        if (res.detectionSource === "image") return "Image";
        if (res.detectionSource === "video") return "Video";
        if (res.detectionSource === "gif") return "GIF";
        return null;
    }
}