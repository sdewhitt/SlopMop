import { OverlayRenderer } from "./OverlayRenderer";
import type { SiteAdapter } from "./adapters/SiteAdapter";
import type { DetectionSettings } from "@src/utils/userSettings";

/**
 * Badge placement for X tweet cards: top header row, inset from the right edge so the control
 * sits just left of Grok and the overflow (⋯) menu instead of over the tweet body.
 * (Approximate chrome width varies; tweak `right` if it overlaps icons on your layout.)
 */
export class XOverlayRenderer extends OverlayRenderer {
  constructor(_adapter: SiteAdapter, settings: DetectionSettings) {
    super(settings);
  }

  protected override getBadgePosition(): Record<string, string> {
    return { top: "6px", right: "88px" };
  }

  protected override getPendingBadgeContainerStyle(isSimple: boolean): Record<string, string> {
    return {
      padding: this.scaleByBadgeSize(isSimple ? "2px 5px" : "2px 4px", "spacing"),
      borderRadius: this.scaleByBadgeSize("3px", "spacing"),
      fontSize: this.scaleByBadgeSize(isSimple ? "11px" : "10px", "font"),
      lineHeight: "1.2",
    };
  }

  protected override getActionButtonStyle(_hostNode: HTMLElement, isSimple: boolean): Partial<CSSStyleDeclaration> {
    return {
      border: "none",
      borderRadius: this.scaleByBadgeSize("3px", "spacing"),
      padding: this.scaleByBadgeSize("2px 6px", "spacing"),
      fontSize: this.scaleByBadgeSize(isSimple ? "11px" : "10px", "font"),
      fontWeight: "600",
      color: "#fff",
      backgroundColor: "#6b7280",
      cursor: "pointer",
      lineHeight: "1.15",
    };
  }

  protected override getSimpleVerdictBadgeFontSize(): string {
    return this.scaleByBadgeSize("11px", "font");
  }

  protected override getSimpleVerdictBadgePadding(): string {
    return this.scaleByBadgeSize("2px 6px", "spacing");
  }
}
