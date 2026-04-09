import { OverlayRenderer } from "./OverlayRenderer";
import type { SiteAdapter } from "./adapters/SiteAdapter";
import type { DetectionSettings } from "@src/utils/userSettings";

export class InstagramOverlayRenderer extends OverlayRenderer {
    constructor(adapter: SiteAdapter, settings: DetectionSettings) {
        super(settings);
    }

    protected override getBadgePosition(): Record<string, string> {
        return { top: "48px", right: "8px" };
    }

    protected override getBadgePositionForHost(hostNode: HTMLElement): Record<string, string> {
        const isCommentHost =
            hostNode.matches('li, [role="listitem"]') ||
            hostNode.closest('ul[role="list"], ol, [role="list"]') !== null;
        if (isCommentHost) {
            return { top: "calc(100% + 4px)", right: "4px" };
        }
        return this.getBadgePosition();
    }

    protected override getTooltipPosition(): Record<string, string> {
        return { top: "calc(100% + 2px)", right: "0" };
    }

    protected override getActionButtonStyle(
        _hostNode: HTMLElement,
        isSimple: boolean,
    ): Partial<CSSStyleDeclaration> {
        return {
            border: "none",
            borderRadius: this.scaleByBadgeSize("4px", "spacing"),
            padding: this.scaleByBadgeSize(isSimple ? "3px 6px" : "2px 6px", "spacing"),
            fontSize: this.scaleByBadgeSize(isSimple ? "11px" : "10px", "font"),
            fontWeight: "600",
            color: "#fff",
            cursor: "pointer",
        };
    }
}
