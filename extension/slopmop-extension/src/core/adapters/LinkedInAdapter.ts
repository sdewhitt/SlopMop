import type { SiteAdapter } from "./SiteAdapter";

const MAIN_FEED_COMPONENTKEY = "MAIN_FEED";
/** Substring in componentkey for comment rows (modern feed). */
const COMMENT_COMPONENTKEY_HINT = "COMMENT";

/**
 * SiteAdapter for LinkedIn feed.
 * Locates posts via URN/href when present; otherwise uses current feed markup:
 * `data-testid="expandable-text-box"`, `componentkey` hints (MAIN_FEED, profile activity, etc.),
 * and `componentkey`-derived ids for stable postIds. LinkedIn class names are hashed — avoid them.
 */
export class LinkedInAdapter implements SiteAdapter {
  getSiteId(): string {
    return "linkedin.com";
  }

  findPostNodes(root: ParentNode = document): Element[] {
    const seen = new Set<Element>();
    const out: Element[] = [];

    // 0) Modern feed (2025+): no data-urn / feed/update links in DOM — use listitem + test ids.
    for (const el of this.findModernFeedPostRoots(root)) {
      if (seen.has(el)) continue;
      seen.add(el);
      out.push(el);
    }

    // 1) URN-based: elements with data-urn containing a feed post URN.
    //    LinkedIn historically used urn:li:activity:ID; many surfaces now use urn:li:ugcPost:ID.
    //    We collect roots only — if parent and child both have the URN, keep the parent.
    const urnElements = Array.from(
      root.querySelectorAll<Element>(
        "[data-urn*='urn:li:activity'], [data-urn*='urn:li:ugcPost'], [data-urn*='urn:li:share']",
      ),
    );
    const urnRoots = urnElements.filter(
      (el) => !urnElements.some((other) => other !== el && other.contains(el)),
    );
    // Dedupe by activity ID: when multiple roots share the same ID (e.g. content + action bar),
    // keep only one to avoid duplicate badges. Prefer the one containing the permalink.
    const rootsByActivityId = new Map<string, Element>();
    for (const el of urnRoots) {
      if (seen.has(el) || this.isCoveredByExistingRoots(el, out)) continue;
      if (!this.getPermalink(el) && !this.getStablePostId(el) && !this.getTextNode(el))
        continue;
      const activityId = this.parseActivityUrnFromNode(el);
      if (activityId) {
        const existing = rootsByActivityId.get(activityId);
        if (existing) {
          // Prefer the one with permalink; else prefer the one that contains the other.
          const elHasPermalink = !!this.getPermalink(el);
          const existingHasPermalink = !!this.getPermalink(existing);
          if (elHasPermalink && !existingHasPermalink) {
            rootsByActivityId.set(activityId, el);
          } else if (!elHasPermalink && existingHasPermalink) {
            // keep existing
          } else if (el.contains(existing)) {
            rootsByActivityId.set(activityId, el);
          }
          // else keep existing
        } else {
          rootsByActivityId.set(activityId, el);
        }
      } else {
        seen.add(el);
        out.push(el);
      }
    }
    for (const el of rootsByActivityId.values()) {
      if (seen.has(el) || this.isCoveredByExistingRoots(el, out)) continue;
      seen.add(el);
      out.push(el);
    }

    // 2) Link-based: post links not yet captured. LinkedIn post URLs use
    //    /feed/update/urn:li:activity:ID/ or /posts/activity-ID-suffix.
    //    Covers feed, profile carousel, and other surfaces.
    const postLinks = Array.from(
      root.querySelectorAll<HTMLAnchorElement>(
        'a[href*="/feed/update/urn:li:activity"], a[href*="/feed/update/urn:li:ugcPost"], a[href*="/feed/update/urn:li:share"], a[href*="/posts/activity-"]',
      ),
    );
    for (const link of postLinks) {
      if (out.some((r) => r.contains(link))) continue;
      const container =
        link.closest("article") ??
        link.closest("[data-urn]") ??
        this.findPostContainerFromLink(link);
      if (!container || seen.has(container) || this.isCoveredByExistingRoots(container, out))
        continue;
      if (!this.getPermalink(container) && !this.getStablePostId(container) && !this.getTextNode(container))
        continue;
      seen.add(container);
      out.push(container);
    }

    // 3) Structural fallback: article elements containing post links.
    const articles = Array.from(root.querySelectorAll("article"));
    for (const article of articles) {
      if (seen.has(article) || this.isCoveredByExistingRoots(article, out)) continue;
      if (!this.getPermalink(article) && !this.getStablePostId(article) && !this.getTextNode(article))
        continue;
      seen.add(article);
      out.push(article);
    }

    return out;
  }

  getStablePostId(postNode: Element): string | null {
    // 1) Parse activity ID from data-urn on node or ancestors.
    const urn = this.parseActivityUrnFromNode(postNode);
    if (urn) return urn;

    // 2) Parse from permalink URL.
    const permalink = this.getPermalink(postNode);
    const fromUrl = permalink ? this.parseActivityIdFromUrl(permalink) : null;
    if (fromUrl) return fromUrl;

    // 3) Modern feed: stable-ish id from componentkey (see findModernFeedPostRoots).
    const ck = this.getPostSurfaceComponentKey(postNode);
    if (ck) return `linkedin-ck-${this.fnv1a(ck)}`;

    // 4) Deterministic fallback hash when URN not in DOM.
    const author = this.getAuthorHandle(postNode);
    const timestamp = this.getTimestampText(postNode);
    const text = this.getTextNode(postNode)?.innerText?.slice(0, 300).trim() ?? "";
    const base = `${permalink ?? ""}|${author}|${timestamp}|${text}`;
    return base ? `linkedin-fallback-${this.fnv1a(base)}` : null;
  }

  getPermalink(postNode: Element): string | null {
    const link = postNode.querySelector<HTMLAnchorElement>(
      'a[href*="/feed/update/urn:li:activity"], a[href*="/feed/update/urn:li:ugcPost"], a[href*="/feed/update/urn:li:share"], a[href*="/posts/activity-"]',
    );
    const href = link?.getAttribute("href")?.trim();
    if (!href) return null;
    return this.normalizeUrl(href);
  }

  getTextNode(postNode: Element): HTMLElement | null {
    // Current feed exposes main copy on this node (obfuscated classes elsewhere).
    const expandable = postNode.querySelector<HTMLElement>(
      '[data-testid="expandable-text-box"]',
    );
    if (expandable) return expandable;

    // LinkedIn truncates long posts with "… Read More" / "… See more". The full text lives
    // in div.feed-shared-inline-show-more-text (or similar); CSS hides overflow. Prefer
    // that container so we analyze the full post, not just the preview.
    const showMore = postNode.querySelector<HTMLElement>(
      '[class*="feed-shared-inline-show-more-text"]:not(button)',
    );
    if (showMore) return showMore;

    // Fallback: main post body via span[dir="auto"], div[data-urn], etc.
    return (
      postNode.querySelector<HTMLElement>('span[dir="auto"]') ??
      postNode.querySelector<HTMLElement>("div[data-urn]") ??
      postNode.querySelector<HTMLElement>("p") ??
      postNode.querySelector<HTMLElement>("span") ??
      postNode.querySelector<HTMLElement>("div")
    );
  }

  getImageNodes(postNode: Element): HTMLImageElement[] {
    const imgs = Array.from(postNode.querySelectorAll<HTMLImageElement>("img"));

    return imgs.filter((img) => {
      const src = img.currentSrc || img.src || "";
      if (!src) return false;
      if (src.startsWith("data:")) return false;

      // LinkedIn content images are served from licdn.com CDN.
      const isContentHost =
        src.includes("media.licdn.com") ||
        src.includes("media-exp1.licdn.com") ||
        src.includes("static.licdn.com");
      if (!isContentHost) return false;

      // Exclude profile pictures: often in author/header area or have "profile" in alt.
      const alt = (img.alt || "").toLowerCase();
      if (alt.includes("profile") || alt.includes("avatar")) return false;

      // Size filter: exclude avatars/icons smaller than 150px.
      const w = img.naturalWidth || img.width || 0;
      const h = img.naturalHeight || img.height || 0;
      return w >= 150 && h >= 150;
    });
  }

  getAuthorHandle(postNode: Element): string | null {
    // LinkedIn profile URLs use /in/username.
    const profileLink = postNode.querySelector<HTMLAnchorElement>('a[href*="/in/"]');
    if (!profileLink) return null;
    const text = profileLink.innerText?.trim();
    if (text) return text;
    const href = profileLink.getAttribute("href")?.trim();
    if (href) {
      const match = href.match(/\/in\/([^/?]+)/);
      if (match) return match[1];
    }
    return null;
  }

  getTimestampText(postNode: Element): string | null {
    const timeEl = postNode.querySelector<HTMLTimeElement>("time[datetime]");
    return (
      timeEl?.getAttribute("datetime")?.trim() ??
      timeEl?.innerText?.trim() ??
      null
    );
  }

  findVisibleCommentNodes(root: ParentNode = document, limit = 25): Element[] {
    // Comments mount after the user opens the thread; MutationObserver rescans the page.
    // Legacy: urn:li:comment. Modern: componentkey + expandable-text-box under the post card.
    const posts = this.findPostNodes(root);
    const seen = new Set<Element>();
    const out: Element[] = [];

    for (const post of posts) {
      // URN often lives in componentkey (e.g. replaceableComment_urn:li:comment:(...)) not data-urn.
      const fromComponentKey = this.findCommentRootsFromComponentKey(post);
      const legacy = Array.from(post.querySelectorAll('[data-urn*="urn:li:comment"]'));
      const modern = this.findModernCommentRootsInPost(post);
      const nodes = [...fromComponentKey, ...legacy, ...modern];

      for (const node of nodes) {
        if (seen.has(node)) continue;
        // Exclude nodes inside the social actions bar (e.g. "Comment" button).
        if (this.isLikelyActionBarItem(node)) continue;
        seen.add(node);

        if (!this.isElementVisibleInViewport(node)) continue;
        if (!this.getCommentTextNode(node)) continue;

        out.push(node);
        if (out.length >= limit) return out;
      }
    }

    return out;
  }

  /**
   * LinkedIn embeds urn:li:comment in `componentkey` on a wrapper (not data-urn).
   * Keep outermost matching nodes so each comment gets one badge root.
   */
  private findCommentRootsFromComponentKey(post: Element): Element[] {
    const candidates = Array.from(
      post.querySelectorAll<HTMLElement>('[componentkey*="urn:li:comment"]'),
    );
    if (candidates.length === 0) return [];
    return candidates.filter(
      (el) => !candidates.some((other) => other !== el && other.contains(el)),
    );
  }

  /**
   * When urn:li:comment is absent: treat expandable copy that is clearly not the main post
   * body as comments (expanded thread). See looksLikeCommentExpandable.
   */
  private findModernCommentRootsInPost(post: Element): Element[] {
    const roots: Element[] = [];
    const seen = new Set<Element>();

    const expandables = [
      ...post.querySelectorAll<HTMLElement>('[data-testid="expandable-text-box"]'),
    ];
    if (expandables.length === 0) return roots;

    const primaryIdx = this.findPrimaryPostExpandableIndex(expandables, post);

    // Image-only / odd wrappers: no listitem has MAIN_FEED on the text row — only treat
    // boxes that clearly belong to the comment thread.
    if (primaryIdx === -1) {
      for (const tb of expandables) {
        if (!this.looksLikeCommentExpandableNoPrimary(tb, post)) continue;
        const root = this.commentRootForExpandable(tb, post);
        if (!root || seen.has(root)) continue;
        seen.add(root);
        roots.push(root);
      }
      return roots;
    }

    if (expandables.length === 1) return roots;

    const primaryEl = expandables[primaryIdx];

    for (let i = 0; i < expandables.length; i++) {
      if (i === primaryIdx) continue;
      const tb = expandables[i];
      if (primaryEl.contains(tb)) continue;
      if (!this.looksLikeCommentExpandable(tb, post, primaryEl)) continue;

      const root = this.commentRootForExpandable(tb, post);
      if (!root || seen.has(root)) continue;
      seen.add(root);
      roots.push(root);
    }

    return roots;
  }

  /** First main-post text box: not inside a componentkey comment block; prefer feed/profile row. */
  private findPrimaryPostExpandableIndex(
    expandables: HTMLElement[],
    post: Element,
  ): number {
    for (let i = 0; i < expandables.length; i++) {
      const tb = expandables[i];
      if (this.isInsideCommentComponentKeyBlock(tb, post)) continue;
      if (this.isPrimaryFeedPostExpandable(tb, post)) return i;
    }
    for (let i = 0; i < expandables.length; i++) {
      if (!this.isInsideCommentComponentKeyBlock(expandables[i], post)) return i;
    }
    return -1;
  }

  private isInsideCommentComponentKeyBlock(tb: HTMLElement, post: Element): boolean {
    const block = tb.closest('[componentkey*="urn:li:comment"]');
    return block !== null && post.contains(block);
  }

  private looksLikeCommentExpandableNoPrimary(tb: HTMLElement, post: Element): boolean {
    const li = tb.closest("div[role='listitem']");
    const ck = li?.getAttribute("componentkey") ?? "";
    if (this.componentKeyLooksLikeCommentBlock(ck)) return true;
    if (this.isInCommentOrReplyAriaRegion(tb, post)) return true;
    return false;
  }

  /** Listitem whose componentkey looks like the main story (feed or profile), not a comment row. */
  private isPrimaryFeedPostExpandable(tb: HTMLElement, _post: Element): boolean {
    const li = tb.closest("div[role='listitem']");
    const ck = li?.getAttribute("componentkey") ?? "";
    if (this.componentKeyLooksLikeCommentBlock(ck)) return false;
    return this.componentKeyLooksLikePostSurface(ck);
  }

  private looksLikeCommentExpandable(
    tb: HTMLElement,
    post: Element,
    primaryEl: HTMLElement,
  ): boolean {
    if (this.isInsideCommentComponentKeyBlock(tb, post)) return true;
    const li = tb.closest("div[role='listitem']");
    const ck = li?.getAttribute("componentkey") ?? "";
    if (this.componentKeyLooksLikeCommentBlock(ck)) return true;
    if (this.isInCommentOrReplyAriaRegion(tb, post)) return true;
    if (this.componentKeyLooksLikePostSurface(ck) && !this.componentKeyLooksLikeCommentBlock(ck)) {
      return false;
    }
    return Boolean(
      primaryEl.compareDocumentPosition(tb) & Node.DOCUMENT_POSITION_FOLLOWING,
    );
  }

  private isInCommentOrReplyAriaRegion(tb: HTMLElement, post: Element): boolean {
    let el: Element | null = tb;
    while (el && el !== post) {
      const lab = el.getAttribute("aria-label")?.toLowerCase() ?? "";
      if (lab.includes("comment") || lab.includes("reply")) return true;
      el = el.parentElement;
    }
    return false;
  }

  private commentRootForExpandable(tb: HTMLElement, post: Element): Element {
    const li = tb.closest("div[role='listitem']");
    if (li && post.contains(li)) return li;
    const p = tb.parentElement;
    return p && post.contains(p) ? p : tb;
  }

  /**
   * For profile carousel and other layouts: walk up from a post link to find a
   * container that has post content (text or images). Profile cards may not use
   * article or data-urn on the wrapper.
   */
  private findPostContainerFromLink(link: HTMLAnchorElement): Element | null {
    let el: Element | null = link.parentElement;
    while (el && el !== document.body) {
      const hasContent =
        el.contains(link) &&
        (el.querySelector('[data-testid="expandable-text-box"]') ||
          el.querySelector('span[dir="auto"]') ||
          el.querySelectorAll("img").length > 0);
      if (hasContent) return el;
      el = el.parentElement;
    }
    return link.closest("div");
  }

  /** True if el is strictly inside another root already collected (avoid duplicate badges). */
  private isCoveredByExistingRoots(el: Element, roots: Element[]): boolean {
    return roots.some((r) => r !== el && r.contains(el));
  }

  /**
   * Feed posts after URN removal: one listitem (or componentkey wrapper) per update,
   * with main text in data-testid="expandable-text-box".
   */
  private findModernFeedPostRoots(root: ParentNode): Element[] {
    const raw = new Set<Element>();

    for (const tb of root.querySelectorAll('[data-testid="expandable-text-box"]')) {
      const postRoot = this.findModernPostRootFromTextBox(tb);
      if (postRoot && this.isPlausibleModernFeedPost(postRoot)) raw.add(postRoot);
    }

    for (const li of root.querySelectorAll('div[role="listitem"][componentkey]')) {
      const ck = li.getAttribute("componentkey") ?? "";
      if (!this.componentKeyLooksLikePostSurface(ck)) continue;
      let insideOther = false;
      for (const r of raw) {
        if (r !== li && r.contains(li)) {
          insideOther = true;
          break;
        }
      }
      if (insideOther) continue;
      if (!this.isPlausibleModernFeedPost(li)) continue;
      const hasText = !!li.querySelector('[data-testid="expandable-text-box"]');
      if (hasText || this.hasLicdnContentImage(li)) raw.add(li);
    }

    return this.dedupeToMinimalRoots(Array.from(raw));
  }

  /** True when componentkey identifies a LinkedIn post/update (feed, profile activity, etc.). */
  private componentKeyLooksLikePostSurface(ck: string): boolean {
    const u = ck.toUpperCase();
    if (this.componentKeyLooksLikeCommentBlock(ck)) return false;
    if (
      u.includes("COMMENT_THREAD") ||
      u.includes("COMMENT_VIEW") ||
      u.includes("COMMENT_LIST") ||
      u.includes("REPLY_THREAD")
    ) {
      return false;
    }
    if (u.includes(MAIN_FEED_COMPONENTKEY)) return true;
    if (u.includes("FEEDTYPE") || u.includes("FEED_TYPE")) return true;
    if (u.includes("URN:LI:ACTIVITY") || u.includes("URN:LI:UGCPOST")) return true;
    if (u.includes("RECENT_ACTIVITY") || u.includes("RECENTACTIVITY")) return true;
    if (u.includes("SINGLE_POST") || u.includes("POST_DETAIL") || u.includes("FULL_UPDATE")) {
      return true;
    }
    if (
      u.includes("PROFILE") &&
      (u.includes("FEED") ||
        u.includes("ACTIVITY") ||
        u.includes("POST") ||
        u.includes("UPDATE") ||
        u.includes("RECENT"))
    ) {
      return true;
    }
    return false;
  }

  /** urn:li:comment in componentkey — comment row, not post root. */
  private componentKeyLooksLikeCommentBlock(ck: string): boolean {
    return ck.toUpperCase().includes("URN:LI:COMMENT");
  }

  private findModernPostRootFromTextBox(tb: Element): Element | null {
    let el: Element | null = tb;
    let depth = 0;
    const maxDepth = 52;
    while (el && el !== document.body && depth++ < maxDepth) {
      const ck = el.getAttribute("componentkey")?.trim() ?? "";
      if (ck) {
        if (this.componentKeyLooksLikeCommentBlock(ck)) {
          el = el.parentElement;
          continue;
        }
        if (this.componentKeyLooksLikePostSurface(ck)) {
          return el;
        }
      }
      el = el.parentElement;
    }
    return (
      tb.closest(`div[role="listitem"][componentkey*="${MAIN_FEED_COMPONENTKEY}"]`) ??
      tb.closest(`[componentkey*="${MAIN_FEED_COMPONENTKEY}"]`)
    );
  }

  private isPlausibleModernFeedPost(el: Element): boolean {
    const rect = el.getBoundingClientRect();
    // jsdom often returns 0×0; only reject when we have real layout and it's tiny chrome.
    if (rect.width > 0 && rect.height > 0 && (rect.width < 32 || rect.height < 20)) {
      return false;
    }
    return true;
  }

  private hasLicdnContentImage(el: Element): boolean {
    for (const img of el.querySelectorAll<HTMLImageElement>("img")) {
      const src = img.currentSrc || img.src || "";
      if (!src.includes("licdn")) continue;
      const w = img.naturalWidth || img.width || 0;
      const h = img.naturalHeight || img.height || 0;
      if (w >= 64 && h >= 64) return true;
    }
    return false;
  }

  /** Prefer inner roots when one post container wraps another. */
  private dedupeToMinimalRoots(nodes: Element[]): Element[] {
    return nodes.filter(
      (el) => !nodes.some((other) => other !== el && el.contains(other)),
    );
  }

  private getPostSurfaceComponentKey(node: Element): string | null {
    let el: Element | null = node;
    while (el && el !== document.body) {
      const ck = el.getAttribute("componentkey")?.trim();
      if (ck && this.componentKeyLooksLikePostSurface(ck)) return ck;
      el = el.parentElement;
    }
    return null;
  }

  /** Returns true if the node is likely part of the post action bar (Like/Comment/Repost/Send). */
  private isLikelyActionBarItem(node: Element): boolean {
    const text = (node.textContent ?? "").trim().toLowerCase();
    const actionLabels = ["like", "comment", "repost", "send", "react"];
    return actionLabels.some((label) => text === label || text.startsWith(`${label} `));
  }

  getCommentId(commentNode: Element): string | null {
    // 1) Parse from data-urn (urn:li:comment:ID) when exposed in DOM.
    const urn = this.parseCommentUrnFromNode(commentNode);
    if (urn) return urn;

    // 2) urn:li:comment often appears only inside componentkey on a wrapper div.
    const fromCk = this.parseCommentIdFromComponentKey(commentNode);
    if (fromCk) return fromCk;

    // 3) Parse from permalink if comment URL contains ID.
    const permalink = this.getCommentPermalink(commentNode);
    const fromUrl = permalink ? this.parseCommentIdFromUrl(permalink) : null;
    if (fromUrl) return fromUrl;

    // 4) Deterministic fallback hash when no stable ID available.
    const text =
      this.getCommentTextNode(commentNode)?.innerText?.slice(0, 300).trim() ?? "";
    return text ? `linkedin-comment-${this.fnv1a(text)}` : null;
  }

  getCommentTextNode(commentNode: Element): HTMLElement | null {
    return (
      commentNode.querySelector<HTMLElement>('[data-testid="expandable-text-box"]') ??
      commentNode.querySelector<HTMLElement>('span[dir="auto"]') ??
      commentNode.querySelector<HTMLElement>("span") ??
      commentNode.querySelector<HTMLElement>("p")
    );
  }

  getCommentPermalink(commentNode: Element): string | null {
    // Comment permalinks often point to the parent post.
    const link = commentNode.querySelector<HTMLAnchorElement>(
      'a[href*="/feed/update/urn:li:activity"], a[href*="/feed/update/urn:li:ugcPost"], a[href*="/feed/update/urn:li:share"], a[href*="/posts/activity-"]',
    );
    const href = link?.getAttribute("href")?.trim();
    if (!href) return null;
    return this.normalizeUrl(href);
  }

  private parseActivityUrnFromNode(node: Element): string | null {
    let el: Element | null = node;
    while (el) {
      const urn = el.getAttribute("data-urn")?.trim();
      if (urn) {
        const m =
          urn.match(/urn:li:activity:(\d+)/) ??
          urn.match(/urn:li:ugcPost:(\d+)/) ??
          urn.match(/urn:li:share:(\d+)/);
        if (m) return m[1];
      }
      el = el.parentElement;
    }
    return null;
  }

  private parseActivityIdFromUrl(url: string): string | null {
    // /feed/update/urn:li:activity:123456/ or /feed/update/urn:li:ugcPost:123456/
    // or /posts/activity-123456-suffix
    const m =
      url.match(/urn:li:activity:(\d+)/) ??
      url.match(/urn:li:ugcPost:(\d+)/) ??
      url.match(/urn:li:share:(\d+)/) ??
      url.match(/\/posts\/activity-(\d+)-/);
    return m?.[1] ?? null;
  }

  private parseCommentUrnFromNode(node: Element): string | null {
    let el: Element | null = node;
    while (el) {
      const urn = el.getAttribute("data-urn")?.trim();
      if (urn) {
        const m = urn.match(/urn:li:comment:(\d+)/);
        if (m) return m[1];
      }
      el = el.parentElement;
    }
    return null;
  }

  /**
   * e.g. componentkey="replaceableComment_urn:li:comment:(urn:li:activity:ACT_ID,COMMENT_ID)"
   */
  private parseCommentIdFromComponentKey(node: Element): string | null {
    let el: Element | null = node;
    while (el) {
      const ck = el.getAttribute("componentkey")?.trim();
      if (ck && ck.includes("urn:li:comment")) {
        const tuple = ck.match(/urn:li:activity:\d+,(\d+)\)/);
        if (tuple) return tuple[1];
        const simple = ck.match(/urn:li:comment:\(?(\d+)/);
        if (simple) return simple[1];
        const hash = this.fnv1a(ck);
        return `ck-${hash}`;
      }
      el = el.parentElement;
    }
    return null;
  }

  private parseCommentIdFromUrl(_url: string): string | null {
    // LinkedIn comment URLs may include comment ID; structure varies.
    return null;
  }

  private normalizeUrl(rawUrl: string): string | null {
    try {
      const url = new URL(rawUrl, window.location.origin);
      url.hash = "";
      return url.toString();
    } catch {
      return null;
    }
  }

  private isElementVisibleInViewport(element: Element): boolean {
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;

    const style = window.getComputedStyle(element as HTMLElement);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0"
    ) {
      return false;
    }

    return (
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top <
        (window.innerHeight || document.documentElement.clientHeight) &&
      rect.left <
        (window.innerWidth || document.documentElement.clientWidth)
    );
  }

  private fnv1a(input: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16);
  }
}
