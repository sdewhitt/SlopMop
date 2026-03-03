import { RedditAdapter } from "../../core/adapters/RedditAdapter";
import { PostExtractor } from "../../core/PostExtractor";
import { FeedObserver } from "../../core/FeedObserver";
import { OverlayRenderer } from "@src/core/OverlayRenderer";
import { DEFAULT_SETTINGS } from "@src/types/domain";
import { renderDebugBadge } from "./debug";
import "./style.css";
import { ExtensionMessageBus } from "@src/core/ExtensionMessageBus";

function main() {
  renderDebugBadge(); // show debug badge

  const isReddit = window.location.hostname.includes("reddit.com");
  console.log("[SlopMop] content script loaded", {
    url: window.location.href,
    isReddit,
  });

  if (!isReddit) return;

  const settings = { ...DEFAULT_SETTINGS };

  if (!settings.enabled) {
    console.log("[SlopMop] extension disabled in settings, skipping");
    return;
  }

  const adapter = new RedditAdapter();
  const extractor = new PostExtractor();
  const overlay = new OverlayRenderer(adapter, settings);
  const bus = new ExtensionMessageBus();
  const observer = new FeedObserver(adapter, extractor, overlay, bus, settings);

  // register overlay.renderResult() as the handler function when bus receives a DetectionResponse from chrome
  bus.onDetectionResponse((res) => {
    overlay.renderResult(res.postId, res);
});

  observer.start();
  console.log("[SlopMop] FeedObserver started");
}

try {
  main();
} catch (e) {
  console.error("[SlopMop] content script error", e);
}