import { RedditAdapter } from "../../core/adapters/RedditAdapter";
import { PostExtractor } from "../../core/PostExtractor";
import { FeedObserver } from "../../core/FeedObserver";
import { DEFAULT_SETTINGS } from "@src/types/domain";
import { renderDebugBadge } from "./debug";
import "./style.css";

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
  const observer = new FeedObserver(adapter, extractor, settings);

  observer.start();
  console.log("[SlopMop] FeedObserver started");
}

try {
  main();
} catch (e) {
  console.error("[SlopMop] content script error", e);
}