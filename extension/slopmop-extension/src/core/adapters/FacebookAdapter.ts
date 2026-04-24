import type { SiteAdapter } from "./SiteAdapter";

/**
 * SiteAdapter for Facebook (facebook.com, m.facebook.com).
 *
 * Selector strategy:
 *   Facebook's class names are fully obfuscated and rotate frequently, so we
 *   anchor on stable ARIA / data-* attributes observed on live DOM (2025+):
 *
 *     - `div[role="feed"]`                 outer news-feed container
 *     - `div[role="article"]`              each story card (top-level + nested
 *                                          shared posts)
 *     - `div[data-ad-preview="message"]`   legacy message container
 *     - `div[data-ad-comet-preview="message"]`  current message container
 *     - `a[href*="/posts/"|"/permalink/"|…]`     post permalink patterns
 *
 * Virtualization:
 *   Facebook recycles feed cells aggressively. The adapter derives a stable
 *   post id from the permalink (pfbid / fbid / story_fbid / numeric post id)
 *   or — when not yet in the DOM — from a deterministic content hash. The
 *   FeedObserver's seenPostIds set then collapses re-mounts of the same
 *   logical post to a single badge.
 */

const POST_PERMALINK_SELECTOR = [
  'a[href*="/posts/"]',
  'a[href*="/permalink/"]',
  'a[href*="/permalink.php"]',
  'a[href*="story_fbid="]',
  'a[href*="fbid="]',
  'a[href*="/videos/"]',
  'a[href*="/watch/?v="]',
  'a[href*="/photo/"]',
  'a[href*="/photo.php"]',
  'a[href*="/share/p/"]',
  'a[href*="/share/v/"]',
  'a[href*="/reel/"]',
].join(", ");

const MESSAGE_SELECTORS = [
  'div[data-ad-comet-preview="message"]',
  'div[data-ad-preview="message"]',
  'div[data-testid="post_message"]',
];

/**
 * Fallback anchors for FB builds that omit `div[role="article"]` on feed cards.
 * Ordered from most-specific (one per post) to least; the walker counts the
 * matching selector in ancestors to decide where the card boundary is.
 */
const MESSAGE_ANCHOR_FALLBACKS: string[] = [
  'div[data-ad-rendering-role="story_message"]',
  'div[data-ad-comet-preview="message"]',
  'div[data-ad-preview="message"]',
];

/** Safety cap on how far to walk up looking for the card boundary. */
const FALLBACK_WALK_UP_MAX = 25;

/** Substrings in aria-label / text that mark ads/promotions we should not badge. */
const PROMO_LABEL_MARKERS = [
  "sponsored",
  "suggested for you",
  "paid partnership",
];

export class FacebookAdapter implements SiteAdapter {
  getSiteId(): string {
    return "facebook.com";
  }

  findPostNodes(root: ParentNode = document): Element[] {
    // Primary: `div[role="article"]`. Discard skeleton/glimmer placeholders that FB mounts
    // as `role="article"` while the feed hydrates — they contain a loading-state status
    // element and no post content, and would otherwise suppress the fallback below.
    const articles = this.querySelectorAllIncludingRoot(root, 'div[role="article"]')
      .filter((el) => !this.isLoadingPlaceholder(el));

    // Fallback: some FB builds (observed 2026+) mount real feed cards without
    // `role="article"` at all. Anchor on the story message container and walk up to the
    // card boundary. We always union this with `articles` because the feed can mix both
    // schemas at once (loading skeletons with `role="article"` coexisting with fully
    // hydrated cards that have only message anchors).
    const byMessage = this.findCardsByMessageFallback(root);

    const raw = [...articles, ...byMessage];

    // Keep outermost cards only; this also collapses the case where a `role="article"`
    // wraps the same logical post that the message-walker resolved to an inner div.
    const outermost = raw.filter(
      (el) => !raw.some((other) => other !== el && other.contains(el)),
    );

    const out: Element[] = [];
    const seen = new Set<Element>();
    for (const el of outermost) {
      if (seen.has(el)) continue;
      if (this.isPromotedOrInvalid(el)) continue;
      if (!this.looksLikePost(el)) continue;
      seen.add(el);
      out.push(el);
    }
    return out;
  }

  getStablePostId(postNode: Element): string | null {
    const permalink = this.getPermalink(postNode);
    const fromUrl = permalink ? this.parsePostIdFromUrl(permalink) : null;
    if (fromUrl) return `fb-${fromUrl}`;

    // Fallback: hash(permalink + author + timestamp + text snippet). Stable enough across
    // virtualized remounts because each logical story re-serializes with the same content.
    const author = this.getAuthorHandle(postNode) ?? "";
    const timestamp = this.getTimestampText(postNode) ?? "";
    const textEl = this.getTextNode(postNode);
    const text = (textEl?.innerText ?? "").slice(0, 300).trim();
    const base = `${permalink ?? ""}|${author}|${timestamp}|${text}`;
    const hashable = base.replace(/[|\s]+/g, "").length > 0;
    return hashable ? `fb-fallback-${this.fnv1a(base)}` : null;
  }

  getPermalink(postNode: Element): string | null {
    const links = Array.from(
      postNode.querySelectorAll<HTMLAnchorElement>(POST_PERMALINK_SELECTOR),
    );
    // Prefer pfbid-bearing permalinks (canonical on modern FB); else first match.
    const pfbid = links.find((a) => (a.getAttribute("href") ?? "").includes("pfbid"));
    const chosen = pfbid ?? links[0];
    const href = chosen?.getAttribute("href")?.trim();
    if (!href) return null;
    return this.normalizeUrl(href);
  }

  getTextNode(postNode: Element): HTMLElement | null {
    for (const sel of MESSAGE_SELECTORS) {
      const el = postNode.querySelector<HTMLElement>(sel);
      if (el && this.getInnerText(el).length > 0) return el;
    }

    // Fallback: longest `div[dir="auto"]` inside the card. Facebook renders post copy in
    // `dir="auto"` spans/divs; longer blocks are overwhelmingly the story body.
    const autos = Array.from(
      postNode.querySelectorAll<HTMLElement>('div[dir="auto"], span[dir="auto"]'),
    );
    let best: HTMLElement | null = null;
    let bestLen = 0;
    for (const el of autos) {
      const len = this.getInnerText(el).length;
      if (len > bestLen) {
        bestLen = len;
        best = el;
      }
    }
    return best;
  }

  getImageNodes(postNode: Element): HTMLImageElement[] {
    const imgs = Array.from(postNode.querySelectorAll<HTMLImageElement>("img"));
    return imgs.filter((img) => {
      const src = img.currentSrc || img.src || "";
      if (!src || src.startsWith("data:")) return false;

      let hostname = "";
      try {
        hostname = new URL(src, window.location.origin).hostname.toLowerCase();
      } catch {
        return false;
      }
      const isContentHost =
        hostname.endsWith(".fbcdn.net") ||
        hostname === "fbcdn.net" ||
        hostname.endsWith(".facebook.com");
      if (!isContentHost) return false;

      // Exclude avatars + small story-ring icons.
      const alt = (img.alt || "").toLowerCase();
      if (alt.includes("profile picture")) return false;
      if (alt.includes("avatar")) return false;

      // Profile photos are usually inside an anchor pointing at the author profile; the
      // author link sits in the post header block (never wraps the main media).
      if (this.isInsideAuthorHeader(img, postNode)) return false;

      const w = img.naturalWidth || img.width || 0;
      const h = img.naturalHeight || img.height || 0;
      return w >= 150 && h >= 150;
    });
  }

  getAuthorHandle(postNode: Element): string | null {
    // Author link sits in the top header of the card; prefer a named anchor.
    const header = this.findAuthorHeader(postNode);
    const scope = header ?? postNode;
    const link = scope.querySelector<HTMLAnchorElement>(
      'a[role="link"][href^="/"], a[role="link"][href*="facebook.com"], h2 a, h3 a, h4 a, strong a, b a',
    );
    if (!link) return null;

    const text = (link.innerText ?? link.textContent ?? "").trim();
    if (text) return text.split("\n")[0].trim();

    const href = link.getAttribute("href") ?? "";
    const handle = this.parseHandleFromHref(href);
    return handle ?? null;
  }

  getTimestampText(postNode: Element): string | null {
    const abbr = postNode.querySelector<HTMLElement>("abbr[data-utime]");
    const fromAbbr = abbr?.getAttribute("data-utime")?.trim();
    if (fromAbbr) return fromAbbr;

    // Comet variant: timestamp link with aria-label "Saturday at 4:12 PM".
    const tsLink = postNode.querySelector<HTMLElement>(
      'a[aria-label][href*="/posts/"], a[aria-label][href*="/permalink/"], a[aria-label][href*="fbid="], a[aria-label][href*="story_fbid="]',
    );
    const ariaLabel = tsLink?.getAttribute("aria-label")?.trim();
    if (ariaLabel) return ariaLabel;

    const time = postNode.querySelector<HTMLTimeElement>("time[datetime]");
    return (
      time?.getAttribute("datetime")?.trim() ??
      time?.innerText?.trim() ??
      null
    );
  }

  /** Comments on Facebook post permalink pages are not in scope for this adapter. */
  findVisibleCommentNodes(_root: ParentNode = document, _limit = 25): Element[] {
    return [];
  }

  getCommentId(_commentNode: Element): string | null {
    return null;
  }

  getCommentTextNode(_commentNode: Element): HTMLElement | null {
    return null;
  }

  getCommentPermalink(_commentNode: Element): string | null {
    return null;
  }

  // ── Helpers ───────────────────────────────────────────────────────

  private querySelectorAllIncludingRoot(root: ParentNode, selector: string): Element[] {
    const nodes: Element[] = [];
    if (root instanceof Element && root.matches(selector)) nodes.push(root);
    nodes.push(...Array.from(root.querySelectorAll(selector)));
    return nodes;
  }

  /**
   * Skeleton / glimmer cards mount as `div[role="article"]` while the feed hydrates. They
   * hold an inner `[data-visualcompletion="loading-state"]` (often paired with
   * `aria-label="Loading..."`) and no post content. Treating them as candidates would
   * both generate noise and mask real posts mounted without `role="article"` by keeping
   * the message-container fallback gated off.
   */
  private isLoadingPlaceholder(el: Element): boolean {
    return el.querySelector('[data-visualcompletion="loading-state"]') !== null;
  }

  /**
   * Fallback discovery when `div[role="article"]` is missing: collect message anchors
   * and walk each one up to the enclosing story card. Tries the most-specific selector
   * first (`story_message`, which appears once per post) so the walker's "count in
   * parent" stopping rule is well-defined.
   */
  private findCardsByMessageFallback(root: ParentNode): Element[] {
    for (const sel of MESSAGE_ANCHOR_FALLBACKS) {
      const anchors = this.querySelectorAllIncludingRoot(root, sel);
      if (anchors.length === 0) continue;
      const cards: Element[] = [];
      const seen = new Set<Element>();
      for (const anchor of anchors) {
        const card = this.walkUpToStoryCard(anchor, sel);
        if (!card || seen.has(card)) continue;
        seen.add(card);
        cards.push(card);
      }
      if (cards.length > 0) return cards;
    }
    return [];
  }

  /**
   * Walk up from a message anchor until we hit a feed wrapper or another sibling
   * post. The highest single-match ancestor below those boundaries is the story
   * card.
   *
   * Stopping rules (any one terminates the walk so `best` is returned):
   *   - adding `parent` would pull in a second matching marker (sibling post)
   *   - `parent` has `role="feed"` / `role="main"` (feed-list wrapper)
   *   - `parent` is `<body>` / `<html>` (we've overshot the document body)
   *   - `parent` is not a `<div>` (FB story cards are always div-based)
   */
  private walkUpToStoryCard(anchor: Element, countSelector: string): Element | null {
    const doc = anchor.ownerDocument ?? document;
    const docBody = doc.body;
    const docEl = doc.documentElement;

    let current: Element | null = anchor;
    let best: Element | null = anchor;
    for (let i = 0; i < FALLBACK_WALK_UP_MAX; i++) {
      const parent: Element | null = current?.parentElement ?? null;
      if (!parent) break;
      if (parent === docBody || parent === docEl) break;
      if (parent.tagName !== "DIV") break;
      const role = parent.getAttribute("role");
      if (role === "feed" || role === "main") break;
      if (parent.querySelectorAll(countSelector).length > 1) break;
      best = parent;
      current = parent;
    }
    return best;
  }

  /**
   * A real story card should have either a post permalink or a recognizable message
   * container. Filters out comment `div[role="article"]` nodes (no permalink, no message
   * data-attrs) that the feed view sometimes mounts inline.
   */
  private looksLikePost(el: Element): boolean {
    if (this.getPermalink(el)) return true;
    for (const sel of MESSAGE_SELECTORS) {
      if (el.querySelector(sel)) return true;
    }
    // Aria-labelled story containers (used on m.facebook.com and some group views).
    const aria = el.getAttribute("aria-label")?.toLowerCase() ?? "";
    if (aria.startsWith("post by ") || aria.startsWith("story by ")) return true;
    return false;
  }

  /**
   * Identifies Sponsored / Suggested / Paid-partnership cards so we don't waste detection on
   * them. Facebook hides the "Sponsored" string with CSS tricks; we accept both visible text
   * and aria-label / aria-describedby markers. Conservative: matches literal substrings.
   */
  private isPromotedOrInvalid(el: Element): boolean {
    const aria = (el.getAttribute("aria-label") ?? "").toLowerCase();
    for (const marker of PROMO_LABEL_MARKERS) {
      if (aria.includes(marker)) return true;
    }
    const labelledBy = el.getAttribute("aria-labelledby");
    if (labelledBy) {
      for (const id of labelledBy.split(/\s+/)) {
        if (!id) continue;
        const refEl = (el.ownerDocument ?? document).getElementById(id);
        const refText = (refEl?.textContent ?? "").trim().toLowerCase();
        for (const marker of PROMO_LABEL_MARKERS) {
          if (refText.includes(marker)) return true;
        }
      }
    }
    return false;
  }

  /**
   * Walks up/into the card looking for the per-post header block (author + timestamp row).
   * We prefer the first `h2`/`h3`/`h4` inside the card — that is where Facebook renders the
   * author name across both classic and Comet UIs.
   */
  private findAuthorHeader(postNode: Element): Element | null {
    return (
      postNode.querySelector<HTMLElement>("h2, h3, h4") ??
      postNode.querySelector<HTMLElement>('[data-ad-rendering-role="profile_name"]')
    );
  }

  private isInsideAuthorHeader(img: HTMLImageElement, postNode: Element): boolean {
    const header = this.findAuthorHeader(postNode);
    if (!header) return false;
    return header.contains(img);
  }

  /**
   * Extract the logical post id token from a Facebook permalink. Accepts:
   *   - pfbid…                                   (canonical on the Comet UI)
   *   - /posts/<digits>                          (classic numeric)
   *   - ?story_fbid=<digits>                     (feed fallback url)
   *   - ?fbid=<digits>                           (photo links)
   *   - /videos/<digits>                         (watch)
   *   - /share/p/<token>                         (reshare short links)
   *   - /permalink/<digits>                      (pages / groups)
   */
  private parsePostIdFromUrl(url: string): string | null {
    const pfbid = url.match(/(pfbid[0-9a-zA-Z]+)/);
    if (pfbid) return pfbid[1];

    const storyFbid = url.match(/[?&]story_fbid=(\d+)/);
    if (storyFbid) return storyFbid[1];

    const fbid = url.match(/[?&]fbid=(\d+)/);
    if (fbid) return fbid[1];

    const posts = url.match(/\/posts\/([^/?#]+)/);
    if (posts) return posts[1];

    const permalink = url.match(/\/permalink\/([^/?#]+)/);
    if (permalink) return permalink[1];

    const videos = url.match(/\/videos\/(\d+)/);
    if (videos) return videos[1];

    const watchV = url.match(/\/watch\/?\?v=(\d+)/);
    if (watchV) return watchV[1];

    const share = url.match(/\/share\/(?:p|v)\/([^/?#]+)/);
    if (share) return share[1];

    const reel = url.match(/\/reel\/(\d+)/);
    if (reel) return reel[1];

    return null;
  }

  private parseHandleFromHref(href: string): string | null {
    if (!href) return null;
    const m =
      href.match(/facebook\.com\/([^/?#]+)/) ??
      href.match(/^\/([^/?#]+)\/?$/);
    const candidate = m?.[1];
    if (!candidate) return null;
    const reserved = new Set([
      "home",
      "login",
      "share",
      "stories",
      "permalink",
      "permalink.php",
      "photo.php",
      "posts",
      "videos",
      "watch",
      "groups",
      "events",
      "marketplace",
      "profile.php",
    ]);
    return reserved.has(candidate.toLowerCase()) ? null : candidate;
  }

  private getInnerText(el: Element): string {
    if (!(el instanceof HTMLElement)) return (el.textContent ?? "").trim();
    const raw = el.innerText ?? el.textContent ?? "";
    return raw.replace(/\s+/g, " ").trim();
  }

  private normalizeUrl(rawUrl: string): string | null {
    try {
      const url = new URL(rawUrl, window.location.origin || "https://facebook.com");
      url.hash = "";
      return url.toString();
    } catch {
      return null;
    }
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
