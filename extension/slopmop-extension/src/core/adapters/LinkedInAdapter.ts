import type { SiteAdapter } from "./SiteAdapter";

/**
 * SiteAdapter for LinkedIn feed.
 * Locates posts and comments via URN-based identification (urn:li:activity, urn:li:comment)
 * and structural DOM traversal. LinkedIn uses dynamic class names, so we rely on data-urn,
 * href patterns, and semantic elements rather than CSS classes.
 */
export class LinkedInAdapter implements SiteAdapter {
  getSiteId(): string {
    return "linkedin.com";
  }

  findPostNodes(root: ParentNode = document): Element[] {
    const seen = new Set<Element>();
    const out: Element[] = [];

    // 1) URN-based: elements with data-urn containing activity URN.
    //    LinkedIn may expose urn:li:activity:ID on the post container or nested elements.
    //    We collect roots only — if parent and child both have the URN, keep the parent.
    const urnElements = Array.from(
      root.querySelectorAll<Element>("[data-urn*='urn:li:activity']"),
    );
    const urnRoots = urnElements.filter(
      (el) => !urnElements.some((other) => other !== el && other.contains(el)),
    );
    // Dedupe by activity ID: when multiple roots share the same ID (e.g. content + action bar),
    // keep only one to avoid duplicate badges. Prefer the one containing the permalink.
    const rootsByActivityId = new Map<string, Element>();
    for (const el of urnRoots) {
      if (seen.has(el)) continue;
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
      if (seen.has(el)) continue;
      seen.add(el);
      out.push(el);
    }

    // 2) Link-based: post links not yet captured. LinkedIn post URLs use
    //    /feed/update/urn:li:activity:ID/ or /posts/activity-ID-suffix.
    //    Covers feed, profile carousel, and other surfaces.
    const postLinks = Array.from(
      root.querySelectorAll<HTMLAnchorElement>(
        'a[href*="/feed/update/urn:li:activity"], a[href*="/posts/activity-"]',
      ),
    );
    for (const link of postLinks) {
      if (out.some((r) => r.contains(link))) continue;
      const container =
        link.closest("article") ??
        link.closest("[data-urn]") ??
        this.findPostContainerFromLink(link);
      if (!container || seen.has(container)) continue;
      if (!this.getPermalink(container) && !this.getStablePostId(container) && !this.getTextNode(container))
        continue;
      seen.add(container);
      out.push(container);
    }

    // 3) Structural fallback: article elements containing post links.
    const articles = Array.from(root.querySelectorAll("article"));
    for (const article of articles) {
      if (seen.has(article)) continue;
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

    // 3) Deterministic fallback hash when URN not in DOM.
    const author = this.getAuthorHandle(postNode);
    const timestamp = this.getTimestampText(postNode);
    const text = this.getTextNode(postNode)?.innerText?.slice(0, 300).trim() ?? "";
    const base = `${permalink ?? ""}|${author}|${timestamp}|${text}`;
    return base ? `linkedin-fallback-${this.fnv1a(base)}` : null;
  }

  getPermalink(postNode: Element): string | null {
    const link = postNode.querySelector<HTMLAnchorElement>(
      'a[href*="/feed/update/urn:li:activity"], a[href*="/posts/activity-"]',
    );
    const href = link?.getAttribute("href")?.trim();
    if (!href) return null;
    return this.normalizeUrl(href);
  }

  getTextNode(postNode: Element): HTMLElement | null {
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
    // LinkedIn comments live inside feed posts when the user expands the comment section.
    // Only use urn:li:comment — "ul > li" and "div[role='listitem']" incorrectly match
    // the action bar (Like, Comment, Repost, Send), causing badges to appear there.
    const posts = this.findPostNodes(root);
    const seen = new Set<Element>();
    const out: Element[] = [];

    for (const post of posts) {
      const nodes = Array.from(post.querySelectorAll('[data-urn*="urn:li:comment"]'));
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
   * For profile carousel and other layouts: walk up from a post link to find a
   * container that has post content (text or images). Profile cards may not use
   * article or data-urn on the wrapper.
   */
  private findPostContainerFromLink(link: HTMLAnchorElement): Element | null {
    let el: Element | null = link.parentElement;
    while (el && el !== document.body) {
      const hasContent =
        el.contains(link) &&
        (el.querySelector('span[dir="auto"]') || el.querySelectorAll("img").length > 0);
      if (hasContent) return el;
      el = el.parentElement;
    }
    return link.closest("div");
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

    // 2) Parse from permalink if comment URL contains ID.
    const permalink = this.getCommentPermalink(commentNode);
    const fromUrl = permalink ? this.parseCommentIdFromUrl(permalink) : null;
    if (fromUrl) return fromUrl;

    // 3) Deterministic fallback hash when no stable ID available.
    const text =
      this.getCommentTextNode(commentNode)?.innerText?.slice(0, 300).trim() ?? "";
    return text ? `linkedin-comment-${this.fnv1a(text)}` : null;
  }

  getCommentTextNode(commentNode: Element): HTMLElement | null {
    return (
      commentNode.querySelector<HTMLElement>('span[dir="auto"]') ??
      commentNode.querySelector<HTMLElement>("span") ??
      commentNode.querySelector<HTMLElement>("p")
    );
  }

  getCommentPermalink(commentNode: Element): string | null {
    // Comment permalinks often point to the parent post.
    const link = commentNode.querySelector<HTMLAnchorElement>(
      'a[href*="/feed/update/urn:li:activity"], a[href*="/posts/activity-"]',
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
        const m = urn.match(/urn:li:activity:(\d+)/);
        if (m) return m[1];
      }
      el = el.parentElement;
    }
    return null;
  }

  private parseActivityIdFromUrl(url: string): string | null {
    // /feed/update/urn:li:activity:123456/ or /posts/activity-123456-suffix
    const m =
      url.match(/urn:li:activity:(\d+)/) ||
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
