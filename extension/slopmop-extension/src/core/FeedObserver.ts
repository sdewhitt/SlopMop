import type { SiteAdapter } from "./adapters/SiteAdapter";
import type { NormalizedPostContent } from "@src/types/domain";
import type { DetectionSettings } from "@src/utils/userSettings";
import { PostExtractor } from "./PostExtractor";
import { OverlayRenderer } from "./OverlayRenderer";
import { ExtensionMessageBus } from "./ExtensionMessageBus";

const DEBUG_EXTRACTION = true;
// debounce wait time in ms. mutations that fire within this window
// get batched into a single scan instead of triggering one each
const DEBOUNCE_MS = 200;
// if analysis takes longer than this, we show a timeout badge to the user.
const ANALYZE_TIMEOUT_MS = 15_000;

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
    // tracks posts that already timed out so late results do not overwrite timeout badge.
    private timedOutPostIds = new Set<string>();

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
        this.timedOutPostIds.clear();

        if (DEBUG_EXTRACTION) {
            console.log(`[FeedObserver] stopped`);
        }
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
            // TODO: add limit to settings and read limit from settings
            const maxComments = 20
            const commentNodes = this.adapter.findVisibleCommentNodes(document, maxComments);
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

        // step 2: dedupe. Set.has() is O(1) lookup.
        // most posts on a re-scan are ones we've already processed
        if (this.seenPostIds.has(extracted.postId)) return;

        // step 3: eligibility. check user settings
        if (!this.isEligible(extracted)) {
            if (DEBUG_EXTRACTION) {
                console.log(`[FeedObserver] skipped ineligible post ${extracted.postId}`);
            }
            return;
        }

        // only mark as seen AFTER extraction succeeded + passed eligibility.
        // if we marked it earlier and extraction failed, we'd never retry
        this.seenPostIds.add(extracted.postId);

        if (DEBUG_EXTRACTION) {
            console.log(`[FeedObserver] new post`, {
                postId: extracted.postId,
                contentType: extracted.contentType,
                textLength: extracted.text.plain.length,
                author: extracted.domContext.authorHandle,
            });
        }

        // render pending for all posts.
        // pass post.text.plain so the overlay can show highlighted excerpts later
        this.overlay.renderPending(extracted.postId, extracted.text.plain);
        // start timeout window before sending message.
        // if no response/error arrives in ANALYZE_TIMEOUT_MS, badge becomes network timeout.
        this.startAnalyzeTimeout(extracted.postId);
        // call background service to get post's DetectionResponse
        this.bus.sendAnalyze(extracted);
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
    // returns false if this post already timed out and we want timeout to stay visible.
    markAnalyzeCompleted(postId: string): boolean {
        this.clearAnalyzeTimeout(postId);
        if (this.timedOutPostIds.has(postId)) {
            return false;
        }
        return true;
    }

    private isEligible(post: NormalizedPostContent): boolean {
        // check 1: is the extension turned on at all?
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
}
