import type { SiteAdapter } from "./adapters/SiteAdapter";
import type { DetectionResponse, NormalizedPostContent } from "@src/types/domain";
import type { DetectionSettings } from "@src/utils/userSettings";
import {
    expandUserDetectionLanguages,
    formatDetectionLanguagesForUi,
    getLanguageSupportInfo,
    getLanguageUnsupportedCopy,
    isTextLanguageSupported,
} from "@src/utils/languageSupport";
import { computeFactCheckFingerprint } from "@src/utils/factCheckFingerprint";
import {
    computeTtlRemainingMs,
    getAllCachedDetections,
    type CachedDetection,
} from "@src/utils/detectionCache";
import { PostExtractor } from "./PostExtractor";
import { OverlayRenderer } from "./OverlayRenderer";
import { ExtensionMessageBus } from "./ExtensionMessageBus";

const DEBUG_EXTRACTION = true;
// debounce wait time in ms. mutations that fire within this window
// get batched into a single scan instead of triggering one each
const DEBOUNCE_MS = 200;
// if analysis takes longer than this, we show a timeout badge to the user.
// Remote ML APIs (e.g. Render) often need >15s after deploy or cold start.
const ANALYZE_TIMEOUT_MS = 60_000;
/** Max comments to send with post text for backend satire heuristics (consensus, markers). */
const MAX_COMMENTS_FOR_DETECT_API = 30;
const MAX_COMMENT_SNIPPET_CHARS = 2000;

export class FeedObserver {
    // Orchestrator for the content script pipeline.
    // Watches the page for new post nodes, extracts them,
    // deduplicates, checks eligibility, and emits for analysis.

    private adapter: SiteAdapter;
    private extractor: PostExtractor;
    private settings: DetectionSettings;
    private overlay: OverlayRenderer;
    private bus: ExtensionMessageBus;
    private observer: MutationObserver | null = null;

    // tracks postIds already processed to prevent duplication
    private seenPostIds = new Set<string>();
    // timer handle for debouncing mutation bursts
    // ReturnType<typeof setTimeout> resolves to the return type of setTimeout
    // which is number in browsers and NodeJS.Timeout in node
    private debounceTimer: ReturnType<typeof setTimeout> | null = null;
    // one timeout timer per post while waiting for background detection result.
    private pendingAnalyzeTimers = new Map<string, ReturnType<typeof setTimeout>>();
    // tracks postIds that currently have an in-flight analyze request.
    // used to ignore stale/duplicate errors that can arrive after a successful result.
    private inFlightAnalyzePostIds = new Set<string>();
    // tracks posts that already timed out so late results do not overwrite timeout badge.
    private timedOutPostIds = new Set<string>();
    // stores extracted payloads so failed analyses can be retried from the badge.
    private postsById = new Map<string, NormalizedPostContent>();
    // tracks DOM hosts where an overlay has already been rendered.
    private renderedHosts = new WeakSet<Element>();
    /** x.com virtualizes tweet cells; scroll often mounts nodes without a mutation burst we observe. */
    private xScrollHandler: (() => void) | null = null;
    private xScrollRescanTimer: ReturnType<typeof setTimeout> | null = null;
    /** True while the tab is hidden — observation is suspended but session state is preserved. */
    private paused = false;
    /** Timer handles from schedulePostNavigationScans so they can be cancelled on pause/stop. */
    private navScanTimers: ReturnType<typeof setTimeout>[] = [];
    /**
     * Snapshot of `browser.storage.local`'s detectionCache at observer start.
     * Lets the first scan paint cached verdicts without a round-trip through
     * the background (both automatic and manual mode). Session-local updates
     * flow through the OverlayRenderer's in-memory `mapToResponse`, so we do
     * not refresh this map on every write.
     */
    private persistedCache: Map<string, CachedDetection> = new Map();

    constructor(adapter: SiteAdapter, extractor: PostExtractor, overlay: OverlayRenderer, bus: ExtensionMessageBus, settings: DetectionSettings) {
        this.adapter = adapter;
        this.extractor = extractor;
        this.overlay = overlay;
        this.bus = bus;
        this.settings = settings;
    }

    /**
     * Load the persistent detection cache from storage into memory so
     * `handleCandidatePost` can synchronously hydrate badges on the first
     * scan. Safe to call multiple times; later calls replace the snapshot.
     * Callers should await this before {@link start} for cached verdicts to
     * appear on the very first scan.
     */
    async primeCacheFromStorage(): Promise<void> {
        if (!this.settings.cacheRecentResults) {
            this.persistedCache = new Map();
            return;
        }
        try {
            const entries = await getAllCachedDetections();
            this.persistedCache = new Map(entries.map((e) => [e.postId, e]));
        } catch {
            // Storage read failure — fall back to empty; background will still
            // consult the on-disk cache when dispatchAnalyze fires.
            this.persistedCache = new Map();
        }
    }

    /**
     * Build the `DETECTION_RESULT` payload for a persisted cache entry with
     * `cache.hit = true` and an accurate `ttlRemainingMs`, mirroring the
     * background's cache-hit response shape.
     */
    private buildCachedResponse(entry: CachedDetection): DetectionResponse {
        return {
            ...entry.response,
            explanation: {
                ...entry.response.explanation,
                cache: {
                    hit: true,
                    ttlRemainingMs: computeTtlRemainingMs(entry.savedAtMs),
                },
            },
        };
    }

    /**
     * Return a cached `DetectionResponse` for the post if one is available.
     * Prefers the overlay's in-memory map (covers posts analyzed in this
     * session, including fresh API results) over the persistent snapshot
     * (previous sessions). Returns `undefined` when nothing is cached.
     */
    private getCachedResponseForPost(postId: string): DetectionResponse | undefined {
        const inMemory = this.overlay.getCachedDetectionResponse?.(postId);
        if (inMemory) return inMemory;
        if (!this.settings.cacheRecentResults) return undefined;
        const persisted = this.persistedCache.get(postId);
        return persisted ? this.buildCachedResponse(persisted) : undefined;
    }

    start(): void {
        // check for duplicate
        if (this.observer) return;

        // initial scan: extract posts that are already on the page
        // before the MutationObserver is set up.
        // on Reddit, the feed loads ~15 posts on first render
        this.scanAndProcess();

        // MutationObserver watches for DOM changes.
        // the callback fires whenever child elements are added/removed.
        // arrow function () => preserves `this` context so onDomMutated
        // can access this.debounceTimer, this.adapter, etc.
        this.observer = new MutationObserver(() => this.onDomMutated());

        // observe document.body for child additions anywhere in the subtree.
        // childList: true means "watch for nodes being added or removed"
        // subtree: true means "watch the entire tree, not just direct children"
        // Reddit adds posts deep inside nested divs, so subtree is needed
        this.observer.observe(document.body, {
            childList: true,
            subtree: true,
        });

        if (this.adapter.getSiteId() === "x.com") {
            this.xScrollHandler = () => {
                if (this.xScrollRescanTimer !== null) {
                    clearTimeout(this.xScrollRescanTimer);
                }
                this.xScrollRescanTimer = setTimeout(() => {
                    this.xScrollRescanTimer = null;
                    this.scanAndProcess();
                }, 120);
            };
            window.addEventListener("scroll", this.xScrollHandler, { passive: true, capture: true });
        }

        if (DEBUG_EXTRACTION) {
            console.log(`[FeedObserver] started, initial scan complete, observer active`);
        }
    }

    stop(): void {
        // disconnect the MutationObserver so it stops firing callbacks
        // ?. optional chaining: if this.observer is null, skip the call
        this.observer?.disconnect();
        this.observer = null;

        // clear seen posts so a fresh start() doesn't think old posts are duplicates
        this.seenPostIds.clear();

        // if a debounced scan was pending, cancel it
        if (this.debounceTimer !== null) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        // clear all pending analysis timers so no callbacks run after stop().
        for (const timer of this.pendingAnalyzeTimers.values()) {
            clearTimeout(timer);
        }
        this.pendingAnalyzeTimers.clear();
        this.inFlightAnalyzePostIds.clear();
        this.timedOutPostIds.clear();
        this.postsById.clear();
        this.renderedHosts = new WeakSet<Element>();

        if (this.xScrollHandler) {
            window.removeEventListener("scroll", this.xScrollHandler, { capture: true });
            this.xScrollHandler = null;
        }
        if (this.xScrollRescanTimer !== null) {
            clearTimeout(this.xScrollRescanTimer);
            this.xScrollRescanTimer = null;
        }

        for (const t of this.navScanTimers) clearTimeout(t);
        this.navScanTimers = [];
        this.paused = false;

        if (DEBUG_EXTRACTION) {
            console.log(`[FeedObserver] stopped`);
        }
    }

    /**
     * Lightweight suspend: disconnect the MutationObserver and scroll listener
     * without clearing session state. Use when the tab becomes hidden.
     */
    pause(): void {
        if (this.paused || !this.observer) return;
        this.paused = true;

        this.observer.disconnect();

        if (this.debounceTimer !== null) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }

        if (this.xScrollHandler) {
            window.removeEventListener("scroll", this.xScrollHandler, { capture: true });
        }
        if (this.xScrollRescanTimer !== null) {
            clearTimeout(this.xScrollRescanTimer);
            this.xScrollRescanTimer = null;
        }

        for (const t of this.navScanTimers) clearTimeout(t);
        this.navScanTimers = [];

        if (DEBUG_EXTRACTION) {
            console.log(`[FeedObserver] paused (tab hidden)`);
        }
    }

    /**
     * Resume after a pause: reconnect the MutationObserver, re-add the scroll
     * listener, and run a catch-up scan for DOM changes that occurred while hidden.
     */
    resume(): void {
        if (!this.paused || !this.observer) return;
        this.paused = false;

        this.observer.observe(document.body, {
            childList: true,
            subtree: true,
        });

        if (this.xScrollHandler) {
            window.addEventListener("scroll", this.xScrollHandler, { passive: true, capture: true });
        }

        this.scanAndProcess();

        if (DEBUG_EXTRACTION) {
            console.log(`[FeedObserver] resumed (tab visible), catch-up scan complete`);
        }
    }

    /** Apply updated detection settings and refresh overlay UI for posts already scanned. */
    updateSettings(settings: DetectionSettings): void {
        this.settings = settings;
        this.overlay.updateSettings(settings);
    }

    private onDomMutated(): void {
        if (this.paused) return;

        // debounce: Reddit fires many mutations in rapid succession
        // (e.g. 30 mutations in 50ms when loading a batch of posts).
        // without debouncing, scanAndProcess would run 30 times.
        // instead, we reset a timer on every mutation. the scan only
        // runs once the mutations have been quiet for DEBOUNCE_MS.

        // if (DEBUG_EXTRACTION) {
        //     // Log mutations to see if we're detecting scrolling. 
        //     console.log(`[FeedObserver] DOM mutation detected`);
        // }

        // if a timer is already running, cancel it
        if (this.debounceTimer !== null) {
            clearTimeout(this.debounceTimer);
        }

        // start a new timer. setTimeout returns a timer id.
        // when DEBOUNCE_MS passes with no new mutations, scanAndProcess runs.
        // arrow function preserves `this` context
        this.debounceTimer = setTimeout(() => {
            this.debounceTimer = null;
            this.scanAndProcess();
        }, DEBOUNCE_MS);
    }

    // force an immediate full page scan. fallback when mutation-based
    // detection misses posts (e.g. virtual scrolling, non-standard DOM updates).
    // (strange reddit cases)
    // all visible posts from adapter.findPostNodes() are processed in one batch.
    // forceAnalyze bypasses the manual-mode gate so every unseen post is
    // immediately sent for analysis (used when the user clicks "Scan Entire Page").
    scanEntirePage(): void {
        this.scanAndProcess(true);
    }

    /**
     * Clear seen posts and rescan. Use when the user navigates to a new page (e.g. SPA
     * route change). Same post in a new view was previously skipped due to seenPostIds.
     */
    rescanForNewPage(): void {
        this.seenPostIds.clear();
        this.renderedHosts = new WeakSet<Element>();
        this.scanAndProcess();
    }

    /**
     * X and similar SPAs often mount the thread column after `pushState`; the first scan can see
     * an empty or stale tree. Run additional full scans (without clearing seen ids) so late-mounted
     * tweets and replies are picked up without waiting for scroll.
     */
    schedulePostNavigationScans(): void {
        const delaysMs = [80, 250, 700, 1600, 3200];
        for (const ms of delaysMs) {
            const id = setTimeout(() => {
                this.navScanTimers = this.navScanTimers.filter((t) => t !== id);
                this.scanAndProcess();
            }, ms);
            this.navScanTimers.push(id);
        }
    }

    private scanAndProcess(forceAnalyze = false): void {
        if (this.paused) return;

        // Scan for posts
        const nodes = this.adapter.findPostNodes(document);
        // each node is one post container on the page
        for (const node of nodes) {
            this.handleCandidatePost(node, "post", forceAnalyze);
        }
        let numComments = 0;
        // Scan for comments
        if (this.settings.scanComments !== "off") {
            // Instagram comment threads often keep many comments visible while scrolling.
            // Cap non-Instagram sites to preserve existing behavior, but process all visible
            // Instagram comments so Detect Now badges continue appearing on scroll.
            const maxComments = this.adapter.getSiteId() === "instagram.com"
                ? Number.MAX_SAFE_INTEGER
                : 50;
            const rawCommentNodes = this.adapter.findVisibleCommentNodes(
                document,
                this.settings.scanComments === "auto_top_n" ? Number.MAX_SAFE_INTEGER : maxComments,
            );
            const shouldFilterTopLevel =
                this.settings.scanComments === "auto_top_n" &&
                this.adapter.getSiteId() !== "instagram.com";
            const commentNodes = shouldFilterTopLevel
                ? this.filterTopLevelCommentNodes(rawCommentNodes).slice(0, maxComments)
                : rawCommentNodes.slice(0, maxComments);
            numComments = commentNodes.length;
            for (const node of commentNodes) {
                this.handleCandidatePost(node, "comment", forceAnalyze);
            }
        }

        if (DEBUG_EXTRACTION) {
            console.log(`[FeedObserver] scan found ${nodes.length+numComments} candidate nodes`);
        }
    }


    private handleCandidatePost(node: Element, type: "post" | "comment", forceAnalyze = false): void {
        // step 1: extract. turn raw DOM node into clean NormalizedPostContent
        // returns null if the node is missing critical data (no postId, etc.)
        const extracted = this.extractor.extract(node, this.adapter, type);
        // !extracted is true when extraction fails. bail out, don't mark as seen
        // so it can be retried on the next scan if the DOM updates
        if (!extracted) return;

        // collect the comment texts for the post
        // this is used for the satire heuristics
        if (type === "post") {
            const commentTexts = this.collectCommentTextsForPost(node);
            if (commentTexts.length > 0) {
                extracted.commentTexts = commentTexts;
            }
        }

        const textContainer =
            type === "post"
                ? this.adapter.getTextNode(node)
                : this.adapter.getCommentTextNode(node);

        // Adapters may override where the badge mounts:
        //   - Comments with nested containers (e.g. Reddit shreddit-comment) use
        //     a narrower host so the badge anchors to the comment's own text.
        //   - Posts whose node clips its contents (e.g. Google AI Overview's
        //     collapsed overflow:hidden state) use a less-restrictive ancestor.
        const commentHost = type === "comment"
            ? this.adapter.getCommentOverlayHost?.(node)
            : null;
        const postHost = type === "post"
            ? this.adapter.getPostOverlayHost?.(node)
            : null;
        const hostNode: HTMLElement =
            commentHost || postHost || (node as HTMLElement);

        // step 2: dedupe. Set.has() is O(1) lookup.
        // Virtualized feeds (X) recycle DOM nodes: if the badge is gone, clear seen state and
        // continue so we can reattach. Otherwise, in manual mode still render Detect Now on
        // newly encountered hosts for posts only (e.g. opening a modal for a post already seen
        // in the grid). Comments use one id across sibling DOM rows (LinkedIn headline + body);
        // re-rendering on a second host duplicates overlays.
        if (this.seenPostIds.has(extracted.postId)) {
            const alive = this.overlay.isBadgeDomAlive?.(extracted.postId);
            if (alive === false) {
                this.seenPostIds.delete(extracted.postId);
                this.overlay.forgetDisconnectedBadge?.(extracted.postId);
                if (!this.overlay.getCachedDetectionResponse?.(extracted.postId)) {
                    this.postsById.delete(extracted.postId);
                }
            } else {
                // Re-render on a new host only for posts. Comment lists can expose
                // duplicate wrappers for the same comment id (notably first comments),
                // which would otherwise create duplicate Detect/Fact-check controls.
                if (type === "post" && !this.renderedHosts.has(node)) {
                    // A second DOM host appeared for an already-seen post
                    // (common on Reddit: subreddit feed + opened post detail
                    // both mount `shreddit-post` for the same id). Prefer an
                    // existing verdict so we don't flash a redundant
                    // "Detect Now" button next to the already-rendered badge.
                    const cached = this.getCachedResponseForPost(extracted.postId);
                    if (cached) {
                        this.postsById.set(extracted.postId, extracted);
                        this.overlay.mountResultBadgeOnHost?.(
                            extracted.postId,
                            hostNode,
                            extracted.text.plain,
                            cached,
                            textContainer,
                        );
                        this.renderedHosts.add(node);
                    } else if (!this.settings.automaticScanning) {
                        this.renderManualEntry(extracted, hostNode, textContainer);
                        this.renderedHosts.add(node);
                    }
                }

                return;
            }
        }

        if (!this.isEligible(extracted)) {
            if (DEBUG_EXTRACTION) {
                console.log(`[FeedObserver] skipped ineligible post ${extracted.postId}`);
            }
            return;
        }

        const cachedResult = this.overlay.getCachedDetectionResponse?.(extracted.postId);
        if (cachedResult) {
            this.seenPostIds.add(extracted.postId);
            this.postsById.set(extracted.postId, extracted);
            this.overlay.mountResultBadgeOnHost?.(
                extracted.postId,
                hostNode,
                extracted.text.plain,
                cachedResult,
                textContainer,
            );
            if (DEBUG_EXTRACTION) {
                console.log(`[FeedObserver] reattached cached verdict`, { postId: extracted.postId });
            }
            return;
        }

        // Persistent (24h) cache hit: hydrate the badge directly — no
        // `renderPending` flash, no `dispatchAnalyze`. Covers both automatic
        // and manual mode so a previously-analyzed post shows its verdict
        // even when "Automatic scanning" is off (otherwise the user only
        // sees the Detect Now button).
        const persisted = this.settings.cacheRecentResults
            ? this.persistedCache.get(extracted.postId)
            : undefined;
        if (persisted) {
            this.seenPostIds.add(extracted.postId);
            this.postsById.set(extracted.postId, extracted);
            const hydrated = this.buildCachedResponse(persisted);
            this.overlay.mountResultBadgeOnHost?.(
                extracted.postId,
                hostNode,
                extracted.text.plain,
                hydrated,
                textContainer,
            );
            this.renderedHosts.add(node);
            if (DEBUG_EXTRACTION) {
                console.log(`[FeedObserver] hydrated verdict from persistent cache`, {
                    postId: extracted.postId,
                    ttlRemainingMs: hydrated.explanation.cache.ttlRemainingMs,
                });
            }
            return;
        }

        this.seenPostIds.add(extracted.postId);
        this.postsById.set(extracted.postId, extracted);

        if (DEBUG_EXTRACTION) {
            console.log(`[FeedObserver] new post`, {
                postId: extracted.postId,
                contentType: extracted.contentType,
                textLength: extracted.text.plain.length,
                author: extracted.domContext.authorHandle,
            });
        }

        if (this.settings.automaticScanning || forceAnalyze) {
            // automatic mode (or explicit "Scan Entire Page"): render scanning state
            // immediately and dispatch analysis now.
            this.overlay.renderPending(
                extracted.postId,
                hostNode,
                extracted.text.plain,
                undefined,
                textContainer,
            );
            this.renderedHosts.add(node);
            this.dispatchAnalyze(extracted);
            return;
        }

        this.renderManualEntry(extracted, hostNode, textContainer);
        this.renderedHosts.add(node);
    }

    private renderManualEntry(
        extracted: NormalizedPostContent,
        hostNode: HTMLElement,
        textContainer: HTMLElement | null,
    ): void {

        // manual mode: if language unsupported AND post is text-only, show badge only (no Detect Now button).
        // IMAGE and MIXED posts can still be analyzed via image detection.
        const enabledIso = expandUserDetectionLanguages(this.settings.detectionLanguages);
        if (extracted.contentType === 'TEXT' && !isTextLanguageSupported(extracted.text.plain, enabledIso)) {
            const langInfo = getLanguageSupportInfo(extracted.text.plain, enabledIso);
            this.overlay.renderPending(
                extracted.postId,
                hostNode,
                extracted.text.plain,
                undefined,
                textContainer,
            );
            const copy = getLanguageUnsupportedCopy(
                langInfo,
                formatDetectionLanguagesForUi(this.settings.detectionLanguages),
                this.settings.detectionLanguages,
            );
            console.log(
                '[SlopMop] Language detection (franc):',
                langInfo.detectedCode,
                '(' + langInfo.detectedName + '),',
                'confidence:',
                Math.round(langInfo.confidence * 100) + '%',
                '— skipping POST /detect (manual entry)',
            );
            this.overlay.renderLanguageUnsupported(extracted.postId, {
                simpleTitle: copy.hoverSimple,
                tooltipTitle: copy.hoverTooltipTitle,
                tooltipBody: copy.hoverTooltipBody,
            });
            return;
        }

        // manual mode: Fact check (optional) + Detect Now; gated by settings.factCheck.
        const onFactCheck =
            this.settings.factCheck && extracted.text.plain.trim().length > 0
                ? () => {
                      // Use a text-only fingerprint so caching is stable across image hydration.
                      const contentFingerprint = computeFactCheckFingerprint(extracted.site, extracted.text.plain);
                      void this.bus.sendFactCheck(extracted.postId, extracted.text.plain, {
                          site: extracted.site,
                          contentFingerprint,
                      });
                  }
                : undefined;
        this.overlay.renderPending(
            extracted.postId,
            hostNode,
            extracted.text.plain,
            () => {
                this.dispatchAnalyze(extracted);
            },
            textContainer,
            onFactCheck,
        );
    }

    private dispatchAnalyze(post: NormalizedPostContent): void {
        if (this.paused) return;

        this.inFlightAnalyzePostIds.add(post.postId);
        this.startAnalyzeTimeout(post.postId);
        this.bus.sendAnalyze(post);
    }

    retryAnalyze(postId: string): boolean {
        const post = this.postsById.get(postId);
        if (!post) return false;
        this.dispatchAnalyze(post);
        return true;
    }

    /**
     * gathers visible comment strings under the post node for /detect comment_texts
     * (satire keyword + consensus heuristics on the main post score).
     */
    private collectCommentTextsForPost(postNode: Element): string[] {
        const nodes = this.adapter.findVisibleCommentNodes(postNode, MAX_COMMENTS_FOR_DETECT_API);
        const out: string[] = [];
        const seen = new Set<string>();
        for (const n of nodes) {
            const el = this.adapter.getCommentTextNode(n);
            const raw = el?.innerText?.trim() ?? "";
            if (raw.length < 2) continue;
            let t = raw.replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n\n").trim();
            if (t.length > MAX_COMMENT_SNIPPET_CHARS) {
                t = t.slice(0, MAX_COMMENT_SNIPPET_CHARS);
            }
            if (seen.has(t)) continue;
            seen.add(t);
            out.push(t);
        }
        return out;
    }

    // starts a per-post timeout for detection responses.
    private startAnalyzeTimeout(postId: string): void {
        this.clearAnalyzeTimeout(postId);
        this.timedOutPostIds.delete(postId);
        const timer = setTimeout(() => {
            this.pendingAnalyzeTimers.delete(postId);
            this.timedOutPostIds.add(postId);
            this.overlay.renderError(postId, "network timeout", () => { this.retryAnalyze(postId); });
        }, ANALYZE_TIMEOUT_MS);
        this.pendingAnalyzeTimers.set(postId, timer);
    }

    private clearAnalyzeTimeout(postId: string): void {
        const timer = this.pendingAnalyzeTimers.get(postId);
        if (!timer) return;
        clearTimeout(timer);
        this.pendingAnalyzeTimers.delete(postId);
    }

    // Keep the post in-flight but refresh timeout after a preliminary update.
    noteAnalyzeProgress(postId: string): void {
        if (!this.inFlightAnalyzePostIds.has(postId)) return;
        if (this.timedOutPostIds.has(postId)) return;
        this.startAnalyzeTimeout(postId);
    }

    // returns true when the caller should render result/error for this post.
    // returns false for stale errors (no active request) or for timed out posts.
    markAnalyzeCompleted(postId: string, outcome: "result" | "error" = "result"): boolean {
        const wasInFlight = this.inFlightAnalyzePostIds.has(postId);
        if (outcome === "error" && !wasInFlight) {
            return false;
        }
        this.inFlightAnalyzePostIds.delete(postId);
        this.clearAnalyzeTimeout(postId);
        if (this.timedOutPostIds.has(postId)) {
            return false;
        }
        return true;
    }

    private isEligible(post: NormalizedPostContent): boolean {
        // check if extension enabled
        if (!this.settings.enabled) return false;

        // check 2: does the content type match what the user wants to scan?
        // if scanText is false and this is a TEXT post, skip it
        // if scanImages is false and this is an IMAGE post, skip it
        // MIXED requires at least one of scanText or scanImages
        // UNSUPPORTED is always skipped
        if (post.contentType === "UNSUPPORTED") return false;
        if (post.contentType === "TEXT" && !this.settings.scanText) return false;
        if (post.contentType === "IMAGE" && !this.settings.scanImages) return false;
        if (post.contentType === "MIXED"
            && !this.settings.scanText
            && !this.settings.scanImages) {
            return false;
        }

        return true;
    }

    private filterTopLevelCommentNodes(nodes: Element[]): Element[] {
        const nodeSet = new Set(nodes);
        return nodes.filter((node) => {
            let parent = node.parentElement;
            while (parent) {
                if (nodeSet.has(parent)) return false;
                parent = parent.parentElement;
            }
            return true;
        });
    }
}
