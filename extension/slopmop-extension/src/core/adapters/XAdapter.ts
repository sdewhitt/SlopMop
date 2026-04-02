import type { SiteAdapter } from "./SiteAdapter";

/** Tweet cards on x.com use `article` with this test id (class names churn; prefer this). */
const TWEET_ARTICLE_SELECTOR = 'article[data-testid="tweet"]';

/**
 * SiteAdapter for X (x.com / legacy twitter.com).
 * Anchors on tweet articles; quote tweets nest another `article[data-testid="tweet"]` — we keep
 * outermost cards in feeds and scope text to the card root so quoted copy is excluded.
 */
export class XAdapter implements SiteAdapter {
  getSiteId(): string {
    return "x.com";
  }

  findPostNodes(root: ParentNode = document): Element[] {
    if (this.isThreadPage()) {
      const focal = this.findFocalTweetArticle(root);
      return focal ? [focal] : [];
    }

    const raw = this.querySelectorAllIncludingRoot(root, TWEET_ARTICLE_SELECTOR);
    const outer = this.filterOutermostTweetArticles(raw);
    return outer.filter((el) => !this.isPromotedOrInvalid(el));
  }

  getStablePostId(postNode: Element): string | null {
    const id = this.getStatusIdFromTweetArticle(postNode);
    if (id) return `x-status-${id}`;

    const permalink = this.getPermalink(postNode);
    const fromUrl = permalink ? this.parseStatusIdFromUrl(permalink) : null;
    if (fromUrl) return `x-status-${fromUrl}`;

    const author = this.getAuthorHandle(postNode);
    const timestamp = this.getTimestampText(postNode);
    const text = this.getTextNode(postNode)?.innerText?.slice(0, 300).trim() ?? "";
    const base = `${permalink ?? ""}|${author}|${timestamp}|${text}`;
    return base ? `x-fallback-${this.fnv1a(base)}` : null;
  }

  getPermalink(postNode: Element): string | null {
    const timeEl = postNode.querySelector<HTMLTimeElement>("time[datetime]");
    const timeLink = timeEl?.closest("a") as HTMLAnchorElement | null;
    const fromTime = timeLink?.getAttribute("href")?.trim();
    if (fromTime?.includes("/status/")) {
      const normalized = this.normalizeUrl(fromTime);
      if (normalized) return normalized;
    }

    const selfId = this.getStatusIdFromTweetArticle(postNode);
    const links = postNode.querySelectorAll<HTMLAnchorElement>('a[href*="/status/"]');
    for (const a of links) {
      const href = a.getAttribute("href")?.trim();
      if (!href) continue;
      const sid = this.parseStatusIdFromUrl(href);
      if (selfId && sid === selfId) return this.normalizeUrl(href);
    }

    const first = postNode.querySelector<HTMLAnchorElement>('a[href*="/status/"]');
    const href = first?.getAttribute("href")?.trim();
    return href ? this.normalizeUrl(href) : null;
  }

  /**
   * Prefer `[data-testid="tweetText"]` whose owning tweet `article` is this node, not a nested
   * quote card (`article` inside this one).
   */
  getTextNode(postNode: Element): HTMLElement | null {
    return this.getTweetTextNodeForArticle(postNode);
  }

  getImageNodes(postNode: Element): HTMLImageElement[] {
    const imgs = Array.from(postNode.querySelectorAll<HTMLImageElement>("img"));

    return imgs.filter((img) => {
      const src = img.currentSrc || img.src || "";
      if (!src || src.startsWith("data:")) return false;

      const isTwimg =
        src.includes("pbs.twimg.com") ||
        src.includes("twimg.com") ||
        src.includes("twimg");
      if (!isTwimg) return false;

      const lower = src.toLowerCase();
      if (lower.includes("profile_images") || lower.includes("/profile_")) return false;
      if (lower.includes("sticky/default_profile")) return false;

      const alt = (img.alt || "").toLowerCase();
      if (alt.includes("profile picture") || alt.includes("avatar")) return false;

      const w = img.naturalWidth || img.width || 0;
      const h = img.naturalHeight || img.height || 0;
      return w >= 64 && h >= 64;
    });
  }

  getAuthorHandle(postNode: Element): string | null {
    const userName = postNode.querySelector('[data-testid="User-Name"]');
    const link =
      userName?.querySelector<HTMLAnchorElement>('a[href^="/"]') ??
      postNode.querySelector<HTMLAnchorElement>(
        'a[href^="/"]:not([href*="/status/"]):not([href*="/i/"]):not([href*="/hashtag/"])',
      );
    const href = link?.getAttribute("href")?.trim();
    if (href) {
      const m = href.match(/^\/([^/?#]+)\/?$/);
      if (m && m[1] && !["home", "explore", "notifications", "messages", "settings"].includes(m[1])) {
        return m[1];
      }
    }
    const text = userName?.textContent?.trim();
    if (text) {
      const at = text.match(/@([\w_]+)/);
      if (at) return at[1];
      return text.split("\n")[0]?.trim() ?? null;
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
    if (!this.isThreadPage()) return [];

    const urlId = this.getThreadStatusIdFromLocation();
    if (!urlId) return [];

    const focal = this.findFocalTweetArticle(root);
    if (!focal) return [];

    const all = this.querySelectorAllIncludingRoot(root, TWEET_ARTICLE_SELECTOR);
    const out: Element[] = [];

    for (const art of all) {
      if (art === focal) continue;
      if (focal.contains(art)) continue;

      const sid = this.getStatusIdFromTweetArticle(art);
      if (!sid || sid === urlId) continue;

      if (!this.isElementVisibleInViewport(art)) continue;
      if (!this.getCommentTextNode(art)) continue;

      out.push(art);
      if (out.length >= limit) break;
    }

    return out;
  }

  getCommentId(commentNode: Element): string | null {
    const id = this.getStatusIdFromTweetArticle(commentNode);
    if (id) return `x-comment-${id}`;

    const permalink = this.getCommentPermalink(commentNode);
    const fromUrl = permalink ? this.parseStatusIdFromUrl(permalink) : null;
    if (fromUrl) return `x-comment-${fromUrl}`;

    const text = this.getCommentTextNode(commentNode)?.innerText?.slice(0, 300).trim() ?? "";
    return text ? `x-comment-fallback-${this.fnv1a(text)}` : null;
  }

  getCommentTextNode(commentNode: Element): HTMLElement | null {
    return this.getTweetTextNodeForArticle(commentNode);
  }

  getCommentPermalink(commentNode: Element): string | null {
    return this.getPermalink(commentNode);
  }

  private getTweetTextNodeForArticle(articleRoot: Element): HTMLElement | null {
    const texts = articleRoot.querySelectorAll<HTMLElement>('[data-testid="tweetText"]');
    for (const t of texts) {
      const owner = t.closest(TWEET_ARTICLE_SELECTOR);
      if (owner === articleRoot) return t;
    }
    return null;
  }

  private findFocalTweetArticle(root: ParentNode): Element | null {
    const urlId = this.getThreadStatusIdFromLocation();
    if (!urlId) return null;

    let candidates = this.querySelectorAllIncludingRoot(root, TWEET_ARTICLE_SELECTOR).filter(
      (el) => this.getStatusIdFromTweetArticle(el) === urlId,
    );
    // Virtualized thread UIs can mount duplicate tweet cells (offscreen / zero-size). Prefer a
    // real, visible instance so the focal post gets a badge on permalink pages.
    const visible = candidates.filter((c) => {
      const r = c.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && this.isElementVisibleInViewport(c);
    });
    if (visible.length > 0) candidates = visible;

    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    const primary = this.getPrimaryColumn(root);
    const inPrimary = candidates.filter((c) => primary?.contains(c));
    return inPrimary[0] ?? candidates[0];
  }

  private getPrimaryColumn(root: ParentNode): Element | null {
    if (root instanceof Document) {
      return (
        root.querySelector('[data-testid="primaryColumn"]') ?? root.querySelector("main")
      );
    }
    if (root instanceof Element) {
      return (
        root.querySelector('[data-testid="primaryColumn"]') ??
        root.closest('[data-testid="primaryColumn"]') ??
        root.querySelector("main") ??
        root.closest("main")
      );
    }
    return null;
  }

  private isThreadPage(): boolean {
    return this.parseStatusIdFromUrl(window.location.pathname) !== null;
  }

  private getThreadStatusIdFromLocation(): string | null {
    return this.parseStatusIdFromUrl(window.location.pathname);
  }

  /** Snowflake id from a path or full URL containing `/status/{id}`. */
  private parseStatusIdFromUrl(hrefOrPath: string): string | null {
    const m = hrefOrPath.match(/\/status\/(\d+)/);
    return m?.[1] ?? null;
  }

  /**
   * Canonical status id for this tweet card.
   * Prefer the timestamp permalink (`time[datetime]` → parent `a`) so "Replying to …" links
   * (same outer `article`, different `/status/` id) do not win on standalone thread pages.
   * Quoted nested `article` links still use `closest(tweet)` !== this node and are skipped.
   */
  private getStatusIdFromTweetArticle(article: Element): string | null {
    const timeEl = article.querySelector("time[datetime]");
    const timeLink = timeEl?.closest("a");
    if (timeLink instanceof HTMLAnchorElement) {
      const href = timeLink.getAttribute("href")?.trim() ?? "";
      if (href.includes("/status/")) {
        const id = this.parseStatusIdFromUrl(href);
        if (id) return id;
      }
    }

    const links = article.querySelectorAll<HTMLAnchorElement>('a[href*="/status/"]');
    for (const a of links) {
      const owner = a.closest(TWEET_ARTICLE_SELECTOR);
      if (owner !== article) continue;
      if (a.closest('[data-testid="inReplyToStyle"], [data-testid="socialContext"]')) continue;
      const id = this.parseStatusIdFromUrl(a.getAttribute("href") ?? "");
      if (id) return id;
    }

    for (const a of links) {
      const owner = a.closest(TWEET_ARTICLE_SELECTOR);
      if (owner !== article) continue;
      const id = this.parseStatusIdFromUrl(a.getAttribute("href") ?? "");
      if (id) return id;
    }
    return null;
  }

  private isPromotedOrInvalid(el: Element): boolean {
    if (!this.getStatusIdFromTweetArticle(el)) return true;
    return false;
  }

  private filterOutermostTweetArticles(articles: Element[]): Element[] {
    return articles.filter(
      (el) => !articles.some((other) => other !== el && other.contains(el)),
    );
  }

  private querySelectorAllIncludingRoot(root: ParentNode, selector: string): Element[] {
    const nodes: Element[] = [];
    if (root instanceof Element && root.matches(selector)) {
      nodes.push(root);
    }
    nodes.push(...Array.from(root.querySelectorAll(selector)));
    return nodes;
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
      rect.top < (window.innerHeight || document.documentElement.clientHeight) &&
      rect.left < (window.innerWidth || document.documentElement.clientWidth)
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
