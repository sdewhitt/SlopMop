import type { SiteAdapter } from "./SiteAdapter";

export class InstagramAdapter implements SiteAdapter {
  getSiteId(): string {
    return "instagram.com";
  }

  findPostNodes(root: ParentNode = document): Element[] {
    const articles = Array.from(root.querySelectorAll("article"));
    const out: Element[] = [];

    for (const article of articles) {
      // Only treat articles that contain a post permalink (/p/ or /reel/)
      // as feed posts. This excludes profile-picture-only containers,
      // story trays, and other non-post article elements.
      if (!this.getPermalink(article)) continue;

      // Skip articles that are part of the stories tray. Story containers
      // hold links to /stories/{username}/ and should never be scanned.
      if (article.querySelector('a[href*="/stories/"]')) continue;

      out.push(article);
    }

    return out;
  }

  getStablePostId(postNode: Element): string | null {
    // 1) Extract shortcode from permalink
    const permalink = this.getPermalink(postNode);
    if (permalink) {
      const shortcode = this.parseShortcodeFromUrl(permalink);
      if (shortcode) return shortcode;
    }

    // 2) Deterministic fallback hash
    const author = this.getAuthorHandle(postNode);
    const timestamp = this.getTimestampText(postNode);
    const text = this.getTextNode(postNode)?.innerText?.slice(0, 300).trim() ?? "";
    const base = `${permalink ?? ""}|${author}|${timestamp}|${text}`;
    return base ? `ig-fallback-${this.fnv1a(base)}` : null;
  }

  getPermalink(postNode: Element): string | null {
    // Instagram post links contain /p/{shortcode}/ or /reel/{shortcode}/
    const link = postNode.querySelector<HTMLAnchorElement>(
      'a[href*="/p/"], a[href*="/reel/"]',
    );
    const href = link?.getAttribute("href")?.trim();
    if (!href) return null;
    return this.normalizeUrl(href);
  }

  getTextNode(postNode: Element): HTMLElement | null {
    // Instagram captions appear in spans with dir="auto" below the image.
    // Fall back to the first <h1> or generic <span> with text.
    return (
      postNode.querySelector<HTMLElement>('span[dir="auto"]') ??
      postNode.querySelector<HTMLElement>("h1") ??
      postNode.querySelector<HTMLElement>("span")
    );
  }

  getImageNodes(postNode: Element): HTMLImageElement[] {
    const imgs = Array.from(postNode.querySelectorAll<HTMLImageElement>("img"));

    return imgs.filter((img) => {
      const src = img.currentSrc || img.src || "";
      if (!src) return false;
      if (src.startsWith("data:")) return false;

      // Instagram content images are served from CDN domains
      const isContentHost =
        src.includes("cdninstagram.com") ||
        src.includes("fbcdn.net");
      if (!isContentHost) return false;

      // Exclude profile pictures: images inside the post <header> are
      // always avatars, never feed content.
      if (img.closest("header")) return false;

      // Instagram sets alt text like "username's profile picture" on avatars
      // and story icons carry alt text containing "story".
      const alt = (img.alt || "").toLowerCase();
      if (alt.includes("profile picture")) return false;
      if (alt.includes("story")) return false;

      // Exclude images inside a stories link (e.g. /stories/{username}/)
      if (img.closest('a[href*="/stories/"]')) return false;

      // Filter out small avatars / icons / story circles
      const w = img.naturalWidth || img.width || 0;
      const h = img.naturalHeight || img.height || 0;
      return w >= 150 && h >= 150;
    });
  }

  getAuthorHandle(postNode: Element): string | null {
    // The author link lives inside the <header> of the article
    const header = postNode.querySelector("header");
    if (header) {
      const profileLink = header.querySelector<HTMLAnchorElement>('a[href^="/"]');
      if (profileLink) {
        const href = profileLink.getAttribute("href")?.trim();
        if (href) {
          const match = href.match(/^\/([^/]+)\/?$/);
          if (match) return `@${match[1]}`;
        }
        const text = profileLink.innerText?.trim();
        if (text) return `@${text}`;
      }
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
    // Instagram comments live inside feed post <article> elements.
    // First find all feed-post articles, then search for comment nodes
    // only within them. This prevents the stories tray and other top-level
    // list items from being picked up as comments.
    const articles = this.findPostNodes(root);
    const selectors = ["ul > li", "ul > div"];

    const seen = new Set<Element>();
    const out: Element[] = [];

    for (const article of articles) {
      for (const sel of selectors) {
        const nodes = Array.from(article.querySelectorAll(sel));
        for (const node of nodes) {
          if (seen.has(node)) continue;
          seen.add(node);

          // Extra guard: skip any node inside a stories link
          if (node.closest('a[href*="/stories/"]')) continue;

          if (!this.isElementVisibleInViewport(node)) continue;
          if (!this.getCommentTextNode(node)) continue;

          out.push(node);
          if (out.length >= limit) return out;
        }
      }
    }

    return out;
  }

  getCommentId(commentNode: Element): string | null {
    // Instagram doesn't expose stable comment IDs in the DOM, so we hash
    // the comment text to generate a deterministic identifier.
    const text =
      this.getCommentTextNode(commentNode)?.innerText?.slice(0, 300).trim() ?? "";
    return text ? `ig-comment-${this.fnv1a(text)}` : null;
  }

  getCommentTextNode(commentNode: Element): HTMLElement | null {
    return (
      commentNode.querySelector<HTMLElement>('span[dir="auto"]') ??
      commentNode.querySelector<HTMLElement>("span")
    );
  }

  getCommentPermalink(commentNode: Element): string | null {
    const link = commentNode.querySelector<HTMLAnchorElement>(
      'a[href*="/p/"], a[href*="/reel/"]',
    );
    const href = link?.getAttribute("href")?.trim();
    if (!href) return null;
    return this.normalizeUrl(href);
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

  private parseShortcodeFromUrl(url: string): string | null {
    const m = url.match(/\/(?:p|reel)\/([A-Za-z0-9_-]+)(?:\/|$)/);
    return m?.[1] ?? null;
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
