import type { SiteAdapter } from "./adapters/SiteAdapter";
import type { NormalizedPostContent } from "@src/types/domain";
import type { DetectionSettings } from "@src/utils/userSettings";
import {
    expandUserDetectionLanguages,
    formatDetectionLanguagesForUi,
    getLanguageSupportInfo,
    getLanguageUnsupportedCopy,
    isTextLanguageSupported,
} from "@src/utils/languageSupport";
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

    constructor(adapter: SiteAdapter, extractor: PostExtractor, overlay: OverlayRenderer, bus: ExtensionMessageBus, settings: DetectionSettings) {
        this.adapter = adapter;
        this.extractor = extractor;
        this.overlay = overlay;
        this.bus = bus;
        this.settings = settings;
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

        if (DEBUG_EXTRACTION) {
            console.log(`[FeedObserver] stopped`);
        }
    }

    /** Apply updated detection settings and refresh overlay UI for posts already scanned. */
    updateSettings(settings: DetectionSettings): void {
        this.settings = settings;
        this.overlay.updateSettings(settings);
    }

    private onDomMutated(): void {
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
    scanEntirePage(): void {
        this.scanAndProcess();
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
            setTimeout(() => {
                this.scanAndProcess();
            }, ms);
        }
    }

    private scanAndProcess(): void {
        // Scan for posts
        const nodes = this.adapter.findPostNodes(document);
        // each node is one post container on the page
        for (const node of nodes) {
            this.handleCandidatePost(node, "post");
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
                this.handleCandidatePost(node, "comment");
            }

        }
        

        if (DEBUG_EXTRACTION) {
            console.log(`[FeedObserver] scan found ${nodes.length+numComments} candidate nodes`);
        }

    }


    private handleCandidatePost(node: Element, type: "post" | "comment"): void {
        // step 1: extract. turn raw DOM node into clean NormalizedPostContent
        // returns null if the node is missing critical data (no postId, etc.)
        const extracted = this.extractor.extract(node, this.adapter, type);
        // !extracted is true when extraction fails. bail out, don't mark as seen
        // so it can be retried on the next scan if the DOM updates
        if (!extracted) return;

        const textContainer =
            type === "post"
                ? this.adapter.getTextNode(node)
                : this.adapter.getCommentTextNode(node);

        // step 2: dedupe. Set.has() is O(1) lookup.
        // Virtualized feeds (X) recycle DOM nodes: if the badge is gone, clear seen state and
        // continue so we can reattach. Otherwise, in manual mode still render Detect Now on
        // newly encountered hosts (e.g. opening a modal for a post already seen in the grid).
        if (this.seenPostIds.has(extracted.postId)) {
            const alive = this.overlay.isBadgeDomAlive?.(extracted.postId);
            if (alive === false) {
                this.seenPostIds.delete(extracted.postId);
                this.overlay.forgetDisconnectedBadge?.(extracted.postId);
                if (!this.overlay.getCachedDetectionResponse?.(extracted.postId)) {
                    this.postsById.delete(extracted.postId);
                }
            } else {
                if (!this.settings.automaticScanning && !this.renderedHosts.has(node)) {
                    this.renderManualEntry(extracted, node as HTMLElement, textContainer);
                    this.renderedHosts.add(node);
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
                node as HTMLElement,
                extracted.text.plain,
                cachedResult,
                textContainer,
            );
            if (DEBUG_EXTRACTION) {
                console.log(`[FeedObserver] reattached cached verdict`, { postId: extracted.postId });
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

        if (this.settings.automaticScanning) {
            // automatic mode: render scanning state immediately and dispatch analysis now.
            this.overlay.renderPending(
                extracted.postId,
                node as HTMLElement,
                extracted.text.plain,
                undefined,
                textContainer,
            );
            this.renderedHosts.add(node);
            this.dispatchAnalyze(extracted);
            return;
        }

        this.renderManualEntry(extracted, node as HTMLElement, textContainer);
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
                      void this.bus.sendFactCheck(extracted.postId, extracted.text.plain);
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

    // send extracted post to background and start timeout tracking.
    private dispatchAnalyze(post: NormalizedPostContent): void {
        // start timeout window before sending message.
        // if no response/error arrives in ANALYZE_TIMEOUT_MS, badge becomes network timeout.
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

    // starts a per-post timeout for detection responses.
    private startAnalyzeTimeout(postId: string): void {
        this.clearAnalyzeTimeout(postId);
        this.timedOutPostIds.delete(postId);
        const timer = setTimeout(() => {
            this.pendingAnalyzeTimers.delete(postId);
            this.timedOutPostIds.add(postId);
            this.overlay.renderTimeout(postId);
        }, ANALYZE_TIMEOUT_MS);
        this.pendingAnalyzeTimers.set(postId, timer);
    }

    private clearAnalyzeTimeout(postId: string): void {
        const timer = this.pendingAnalyzeTimers.get(postId);
        if (!timer) return;
        clearTimeout(timer);
        this.pendingAnalyzeTimers.delete(postId);
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
