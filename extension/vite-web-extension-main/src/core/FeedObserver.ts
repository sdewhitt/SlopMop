import type { SiteAdapter } from "./adapters/SiteAdapter";
import type { NormalizedPostContent, UserSettings } from "@src/types/domain";
import { PostExtractor } from "./PostExtractor";

const DEBUG_EXTRACTION = true;

export class FeedObserver {
  private adapter: SiteAdapter;
  private extractor: PostExtractor;
  private settings: UserSettings;
  private observer: MutationObserver | null = null;
  private seenPostIds = new Set<string>();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(adapter: SiteAdapter, extractor: PostExtractor, settings: UserSettings) {
    this.adapter = adapter;
    this.extractor = extractor;
    this.settings = settings;
  }

  start(): void {
    // TODO: guard against double start (don't create a second MutationObserver if one exists)

    //  initial scan  call adapter.findPostNodes(document), loop through them,
    //       pass each to handleCandidatePost

    // create a MutationObserver that watches for childList changes on document.body
    //       its callback should call onDomMutated()
    //       store it in this.observer so stop() can disconnect it
  }

  stop(): void {
    // TODO: disconnect this.observer if it exists, set it to null
    // clear this.seenPostIds
    // clear this.debounceTimer if running
  }

  private onDomMutated(): void {
    // : debounce  if this.debounceTimer is already set, clear it
    //  then set a new timer (e.g. 200ms) that calls scanAndProcess()
    //  this prevents mutation storms from triggering dozens of scans
  }

  private scanAndProcess(): void {
    const nodes = this.adapter.findPostNodes(document);

    if (DEBUG_EXTRACTION) {
      console.log(`[FeedObserver] scan found ${nodes.length} candidate nodes`);
    }

    for (const node of nodes) {
      this.handleCandidatePost(node);
    }
  }

  private handleCandidatePost(node: Element): void {
    const post = this.extractor.extract(node, this.adapter);
    if (!post) return;

    if (this.seenPostIds.has(post.postId)) return;

    if (!this.isEligible(post)) {
      if (DEBUG_EXTRACTION) {
        console.log(`[FeedObserver] skipped ineligible post ${post.postId}`);
      }
      return;
    }

    this.seenPostIds.add(post.postId);

    if (DEBUG_EXTRACTION) {
      console.log(`[FeedObserver] new post`, {
        postId: post.postId,
        contentType: post.contentType,
        textLength: post.text.plain.length,
        author: post.domContext.authorHandle,
      });
    }

    // tODO: bus.sendAnalyze(post) once ExtensionMessageBus exists
  }

  private isEligible(post: NormalizedPostContent): boolean {
    //  check this.settings.enabled
    //  check this.settings.whitelist includes post.site (or whitelist is empty = allow all)
    //  check this.settings.scanText or scanImages based on contentType
    // return true if all checks pass, false otherwise
    return true;
  }
}
