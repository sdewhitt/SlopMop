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
    const raw = this.querySelectorAllIncludingRoot(root, 'div[role="article"]');
    // Keep outermost article cards only; nested `div[role="article"]` represents a quoted /
    // shared post and would otherwise produce a duplicate badge for the same feed unit.
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
