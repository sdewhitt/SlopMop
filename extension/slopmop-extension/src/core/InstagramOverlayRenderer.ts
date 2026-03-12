import { OverlayRenderer } from "./OverlayRenderer";
import type { SiteAdapter } from "./adapters/SiteAdapter";
import type { DetectionSettings } from "@src/utils/userSettings";

export class InstagramOverlayRenderer extends OverlayRenderer {
    constructor(adapter: SiteAdapter, settings: DetectionSettings) {
        super(adapter, settings);
    }

    protected override getBadgePosition(): Record<string, string> {
        return { top: "8px", right: "8px" };
    }

    protected override getTooltipPosition(): Record<string, string> {
        return { top: "calc(100% + 8px)", right: "0" };
    }
}
