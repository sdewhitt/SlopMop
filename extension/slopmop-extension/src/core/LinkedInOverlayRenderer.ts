import { OverlayRenderer } from "./OverlayRenderer";
import type { SiteAdapter } from "./adapters/SiteAdapter";
import type { DetectionSettings } from "@src/utils/userSettings";

export class LinkedInOverlayRenderer extends OverlayRenderer {
  constructor(adapter: SiteAdapter, settings: DetectionSettings) {
    super(settings);
  }

  protected override getBadgePosition(): Record<string, string> {
    return { top: "48px", right: "8px" };
  }

  protected override getPendingBadgeContainerStyle(isSimple: boolean): Record<string, string> {
    return {
      padding: isSimple ? "2px 5px" : "2px 4px",
      borderRadius: "3px",
      fontSize: isSimple ? "11px" : "10px",
      lineHeight: "1.2",
    };
  }

  protected override getActionButtonStyle(_hostNode: HTMLElement, isSimple: boolean): Partial<CSSStyleDeclaration> {
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
