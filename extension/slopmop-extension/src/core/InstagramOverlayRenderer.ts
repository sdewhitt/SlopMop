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
}
