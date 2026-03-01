import type { SiteAdapter } from "./adapters/SiteAdapter";
import type { NormalizedPostContent, UserSettings, ContentType } from "@src/types/domain";
import { PostExtractor } from "./PostExtractor";

const DEBUG_EXTRACTION = true;
// debounce wait time in ms. mutations that fire within this window
// get batched into a single scan instead of triggering one each
const DEBOUNCE_MS = 200;

export class FeedObserver {
    // Orchestrator for the content script pipeline.
    // Watches the page for new post nodes, extracts them,
    // deduplicates, checks eligibility, and emits for analysis.

    private adapter: SiteAdapter;
    private extractor: PostExtractor;
    private settings: UserSettings;
    // MutationObserver instance, null when not running
    private observer: MutationObserver | null = null;
    // tracks postIds we've already processed so we don't extract twice
    private seenPostIds = new Set<string>();
    // timer handle for debouncing mutation bursts
    // ReturnType<typeof setTimeout> resolves to the return type of setTimeout
    // which is number in browsers and NodeJS.Timeout in node
    private debounceTimer: ReturnType<typeof setTimeout> | null = null;

    constructor(adapter: SiteAdapter, extractor: PostExtractor, settings: UserSettings) {
        // store dependencies on the instance so all methods can use them via this.*
        this.adapter = adapter;
        this.extractor = extractor;
        this.settings = settings;
    }

    start(): void {
        // guard: if observer already exists, we've already started. 
        // calling start() twice would create a second MutationObserver
        // and we'd get duplicate scans on every DOM change
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
        // ask the adapter for all post nodes currently in the DOM
        // findPostNodes returns Element[] of candidate post containers
        const nodes = this.adapter.findPostNodes(document);

        if (DEBUG_EXTRACTION) {
            console.log(`[FeedObserver] scan found ${nodes.length} candidate nodes`);
        }

        // for...of iterates over each element in the array
        // each node is one post container on the page
        for (const node of nodes) {
            this.handleCandidatePost(node);
        }
    }

    private handleCandidatePost(node: Element): void {
        // step 1: extract. turn raw DOM node into clean NormalizedPostContent
        // returns null if the node is missing critical data (no postId, etc.)
        const post = this.extractor.extract(node, this.adapter);
        // !post is true when post is null. bail out, don't mark as seen
        // so it can be retried on the next scan if the DOM updates
        if (!post) return;

        // step 2: dedupe. Set.has() is O(1) lookup.
        // most posts on a re-scan are ones we've already processed
        if (this.seenPostIds.has(post.postId)) return;

        // step 3: eligibility. check user settings
        // e.g. is the extension enabled? is this site whitelisted?
        if (!this.isEligible(post)) {
            if (DEBUG_EXTRACTION) {
                console.log(`[FeedObserver] skipped ineligible post ${post.postId}`);
            }
            return;
        }

        // only mark as seen AFTER extraction succeeded + passed eligibility.
        // if we marked it earlier and extraction failed, we'd never retry
        this.seenPostIds.add(post.postId);

        if (DEBUG_EXTRACTION) {
            console.log(`[FeedObserver] new post`, {
                postId: post.postId,
                contentType: post.contentType,
                textLength: post.text.plain.length,
                author: post.domContext.authorHandle,
            });
        }

        // TODO: this.bus.sendAnalyze(post) once ExtensionMessageBus exists
        // that will send the post to the background script for AI detection
    }

    private isEligible(post: NormalizedPostContent): boolean {
        // gate 1: is the extension turned on at all?
        if (!this.settings.enabled) return false;

        // gate 2: is this site in the whitelist?
        // empty whitelist means "allow all sites"
        if (this.settings.whitelist.length > 0
            && !this.settings.whitelist.includes(post.site)) {
            return false;
        }

        // gate 3: does the content type match what the user wants to scan?
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
