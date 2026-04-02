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
      padding: isSimple ? "2px 5px" : "2px 4px",
      borderRadius: "3px",
      fontSize: isSimple ? "11px" : "10px",
      lineHeight: "1.2",
    };
  }

  protected override getDetectNowButtonStyle(isSimple: boolean): Record<string, string> {
    return {
      border: "none",
      borderRadius: "3px",
      padding: "2px 6px",
      fontSize: isSimple ? "11px" : "10px",
      fontWeight: "600",
      color: "#fff",
      backgroundColor: "#6b7280",
      cursor: "pointer",
      lineHeight: "1.15",
    };
  }

  protected override getSimpleVerdictBadgeFontSize(): string {
    return "11px";
  }

  protected override getSimpleVerdictBadgePadding(): string {
    return "2px 6px";
  }
}
