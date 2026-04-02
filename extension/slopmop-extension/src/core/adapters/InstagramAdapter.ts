import type { SiteAdapter } from "./SiteAdapter";

export class InstagramAdapter implements SiteAdapter {
  getSiteId(): string {
    return "instagram.com";
  }

  findPostNodes(root: ParentNode = document): Element[] {
    const out: Element[] = [];
    const seen = new Set<Element>();

    // 1) Standard feed & modal posts: <article> elements with post permalinks.
    //    This covers the home feed, profile pages, and the dialog/modal that
    //    opens when a user clicks an explore-grid thumbnail.
    const articles = Array.from(root.querySelectorAll("article"));
    for (const article of articles) {
      // Modal dialogs are handled separately so overlays stay anchored to media.
      if (article.closest('div[role="dialog"]')) continue;
      if (!this.getPermalink(article)) continue;
      if (article.querySelector('a[href*="/stories/"]')) continue;
      this.pushUniqueHost(out, seen, article);
    }

    // 2) Explore-page grid items: clickable thumbnail tiles that are NOT
    //    wrapped in <article>.  On /explore/ Instagram renders each post as
    //    a <div> containing an <a href="/p/…"> or <a href="/reel/…"> with an
    //    <img> inside.  We use the link's parent <div> as the post container.
    const postLinks = Array.from(
      root.querySelectorAll<HTMLAnchorElement>(
        'a[href*="/p/"], a[href*="/reel/"]',
      ),
    );
    for (const link of postLinks) {
      // Links inside articles are already captured above.
      if (link.closest("article")) continue;
      // Modal dialogs are handled separately below.
      if (link.closest('div[role="dialog"]')) continue;
      // Ignore story links that somehow match the selector.
      if (link.getAttribute("href")?.includes("/stories/")) continue;
      // The grid cell wrapper is the link's nearest parent <div>.
      const container = link.closest("div");
      if (!container) continue;
      this.pushUniqueHost(out, seen, container);
    }

    // 2b) Explore/search reel tiles that render as bare <video> media without
    // an immediate permalink anchor in the visible subtree.
    const tileVideos = Array.from(root.querySelectorAll<HTMLVideoElement>("video[src]"));
    for (const video of tileVideos) {
      if (video.closest("article")) continue;
      if (video.closest('div[role="dialog"]')) continue;

      const container = this.resolveVideoTileHost(video);
      if (!container) continue;
      this.pushUniqueHost(out, seen, container);
    }

    // 3) Post modal dialogs opened from explore/search pages.
    //    These can contain media on the left and caption/comments on the right,
    //    without a stable <article> around the same subtree.
    const dialogs = Array.from(root.querySelectorAll('div[role="dialog"]'));
    for (const dialog of dialogs) {
      if (!this.getPermalink(dialog)) continue;
      const modalHost = this.resolveDialogOverlayHost(dialog);
      this.pushUniqueHost(out, seen, modalHost);
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
    const mediaEl = postNode.querySelector<HTMLImageElement | HTMLVideoElement>("img, video");
    const mediaSrc = mediaEl instanceof HTMLVideoElement
      ? (mediaEl.currentSrc || mediaEl.src || "")
      : (mediaEl?.currentSrc || mediaEl?.getAttribute("src") || "");
    const base = `${permalink ?? ""}|${author}|${timestamp}|${text}|${mediaSrc}`;
    return base ? `ig-fallback-${this.fnv1a(base)}` : null;
  }

  getPermalink(postNode: Element): string | null {
    // Instagram post links contain /p/{shortcode}/ or /reel/{shortcode}/
    const searchRoot = this.getSearchRoot(postNode);
    const link = searchRoot.querySelector<HTMLAnchorElement>(
      'a[href*="/p/"], a[href*="/reel/"]',
    );
    const href = link?.getAttribute("href")?.trim();
    if (!href) return null;
    return this.normalizeUrl(href);
  }

  getTextNode(postNode: Element): HTMLElement | null {
    // Instagram captions appear in spans with dir="auto" below the image.
    // In modal dialogs, caption can be in a sibling pane outside the media node,
    // so query against dialog scope and choose the longest likely text node.
    const dialog = postNode.closest('div[role="dialog"]');
    if (dialog) {
      // Modal post captions are typically rendered as an <h1>; comments are usually
      // list-item spans, so prefer heading text when present.
      const captionHeading = dialog.querySelector<HTMLElement>("h1");
      if (captionHeading && (captionHeading.innerText || "").trim().length > 0) {
        return captionHeading;
      }
    }

    const searchRoot = this.getSearchRoot(postNode);
    const candidates = Array.from(
      searchRoot.querySelectorAll<HTMLElement>('span[dir="auto"], h1'),
    ).filter((el) => (el.innerText || "").trim().length > 0);

    if (candidates.length > 0) {
      candidates.sort((a, b) => b.innerText.trim().length - a.innerText.trim().length);
      return candidates[0];
    }

    return postNode.querySelector<HTMLElement>("span");
  }

  getImageNodes(postNode: Element): HTMLImageElement[] {
    const imgs = Array.from(postNode.querySelectorAll<HTMLImageElement>("img"));

    return imgs.filter((img) => {
      const src = img.currentSrc || img.src || "";
      if (!src) return false;
      if (src.startsWith("data:")) return false;

      let hostname = "";
      try {
        hostname = new URL(src, window.location.origin).hostname.toLowerCase();
      } catch {
        return false;
      }

      const lowerSrc = src.toLowerCase();
      const isCommentGifLike =
        (!!img.closest('li, [role="listitem"]') || !!img.closest('ul[role="list"], [role="list"]')) &&
        (lowerSrc.includes(".gif") ||
          lowerSrc.includes("giphy") ||
          lowerSrc.includes("tenor") ||
          lowerSrc.includes("gif"));

      // Instagram content images are served from CDN domains
      const isContentHost =
        hostname.includes("cdninstagram.com") ||
        hostname === "fbcdn.net" ||
        hostname.endsWith(".fbcdn.net") ||
        hostname === "instagram.com" ||
        hostname.endsWith(".instagram.com");
      if (!isContentHost && !isCommentGifLike) return false;

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
      if (isCommentGifLike) {
        return w >= 24 && h >= 24;
      }
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
    // Collect likely post scopes first so we can avoid unrelated list items
    // (stories tray, suggested users, etc.) while still supporting modal and
    // permalink page comments.
    const scopes = this.collectCommentScopes(root);
    const selectors = [
      'ul[role="list"] > li[role="listitem"]',
      'ul[role="list"] > li',
      "ul > li",
      "ul > div",
      'div[role="list"] > div[role="listitem"]',
    ];

    const seen = new Set<Element>();
    const out: Element[] = [];

    for (const scope of scopes) {
      for (const sel of selectors) {
        const nodes = Array.from(scope.querySelectorAll(sel));
        for (const node of nodes) {
          if (seen.has(node)) continue;
          seen.add(node);

          // Extra guard: skip any node inside a stories link
          if (node.closest('a[href*="/stories/"]')) continue;
          if (this.isLikelyCommentComposer(node)) continue;
          if (this.isLikelyReplyToggle(node)) continue;

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
    // Prefer ID-like URL fragments when present.
    const commentPermalink = this.getCommentPermalink(commentNode);
    const fromPermalink = commentPermalink
      ? this.parseCommentIdFromUrl(commentPermalink)
      : null;
    if (fromPermalink) return `ig-comment-${fromPermalink}`;

    // Fallback to a deterministic hash using nearby post context + local position.
    const textNode = this.getCommentTextNode(commentNode);
    const text = textNode?.innerText?.slice(0, 300).trim() ?? "";
    const commentImages = this.getImageNodes(commentNode);
    const mediaSrc = commentImages[0]?.currentSrc || commentImages[0]?.src || "";
    if (!text && !mediaSrc) return null;

    const postPermalink = this.getPermalink(commentNode) ?? "";
    const authorHref =
      commentNode.querySelector<HTMLAnchorElement>('a[href^="/"]')?.getAttribute("href") ?? "";
    const localIndex = this.getSiblingIndex(commentNode);

    return `ig-comment-${this.fnv1a(`${postPermalink}|${authorHref}|${text}|${mediaSrc}|${localIndex}`)}`;
  }

  getCommentTextNode(commentNode: Element): HTMLElement | null {
    return (
      commentNode.querySelector<HTMLElement>('span[dir="auto"]') ??
      commentNode.querySelector<HTMLElement>("span")
    );
  }

  getCommentPermalink(commentNode: Element): string | null {
    const commentLink = commentNode.querySelector<HTMLAnchorElement>(
      'a[href*="/c/"], a[href*="/comment/"]',
    );
    const commentHref = commentLink?.getAttribute("href")?.trim();
    if (commentHref) {
      const normalized = this.normalizeUrl(commentHref);
      if (normalized) return normalized;
    }

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

  private getSearchRoot(postNode: Element): ParentNode {
    return postNode.closest('div[role="dialog"]') ?? postNode;
  }

  /**
   * For modal posts opened from search/explore, anchor overlays to the media pane
   * (left column) rather than the full dialog container.
   */
  private resolveDialogOverlayHost(dialog: Element): Element {
    const media = dialog.querySelector<HTMLElement>("video, img");
    if (!media) return dialog;

    // Prefer the smallest ancestor around the media that has real dimensions.
    // Stop climbing once we hit an ancestor that already contains permalink links,
    // which usually indicates the broader dialog/comment pane wrapper.
    let host: Element = media.parentElement ?? media;
    let current: HTMLElement | null = media.parentElement;
    while (current && current !== dialog) {
      if (current.querySelector('a[href*="/p/"], a[href*="/reel/"]')) {
        break;
      }
      const rect = current.getBoundingClientRect();
      if (rect.width >= 150 && rect.height >= 150) {
        host = current;
      }
      current = current.parentElement;
    }

    return host;
  }

  private resolveVideoTileHost(video: HTMLVideoElement): Element | null {
    let host: Element | null = video.parentElement;
    let current: HTMLElement | null = video.parentElement;

    while (current) {
      if (current.matches('div[role="dialog"]') || current.matches("article")) {
        break;
      }

      const styleAttr = (current.getAttribute("style") || "").toLowerCase();
      if (styleAttr.includes("aspect-ratio") || styleAttr.includes("max-height")) {
        host = current;
      }

      current = current.parentElement;
    }

    return host;
  }

  private pushUniqueHost(out: Element[], seen: Set<Element>, host: Element): void {
    if (seen.has(host)) return;

    const hostInDialog = !!host.closest('div[role="dialog"]');

    for (let i = 0; i < out.length; i += 1) {
      const existing = out[i];
      const existingInDialog = !!existing.closest('div[role="dialog"]');

      if (existing === host) return;
      // If the candidate is nested under an already-selected host, skip it,
      // unless this candidate is dialog-scoped and the existing host is not.
      if (existing.contains(host)) {
        if (hostInDialog && !existingInDialog) {
          out.splice(i, 1);
          seen.delete(existing);
          i -= 1;
          continue;
        }
        return;
      }
      // If the candidate wraps an existing host and is dialog-scoped while
      // the existing host is not, prefer the dialog host for clicked-post views.
      if (host.contains(existing)) {
        if (hostInDialog && !existingInDialog) {
          out.splice(i, 1);
          seen.delete(existing);
          i -= 1;
          continue;
        }
        // Otherwise preserve deterministic placement from the first host.
        return;
      }
    }

    seen.add(host);
    out.push(host);
  }

  private parseShortcodeFromUrl(url: string): string | null {
    const m = url.match(/\/(?:p|reel)\/([A-Za-z0-9_-]+)(?:\/|$)/);
    return m?.[1] ?? null;
  }

  private parseCommentIdFromUrl(url: string): string | null {
    const m = url.match(/\/(?:c|comment)\/([A-Za-z0-9_-]+)(?:\/|$)/);
    return m?.[1] ?? null;
  }

  private collectCommentScopes(root: ParentNode): Element[] {
    const scopes: Element[] = [];
    const seen = new Set<Element>();

    const articles = Array.from(root.querySelectorAll("article")).filter((article) => {
      if (article.querySelector('a[href*="/stories/"]')) return false;
      return !!this.getPermalink(article);
    });
    for (const article of articles) {
      if (seen.has(article)) continue;
      seen.add(article);
      scopes.push(article);
    }

    const dialogs = Array.from(root.querySelectorAll('div[role="dialog"]')).filter((dialog) =>
      !!this.getPermalink(dialog),
    );
    for (const dialog of dialogs) {
      if (seen.has(dialog)) continue;
      seen.add(dialog);
      scopes.push(dialog);
    }

    return scopes;
  }

  private isLikelyCommentComposer(node: Element): boolean {
    if (node.matches('form, [role="textbox"], textarea')) return true;
    if (node.querySelector('textarea, input[type="text"], [contenteditable="true"]')) {
      return true;
    }

    const nodeText = (node as HTMLElement).innerText || node.textContent || "";
    const text = nodeText.trim().toLowerCase();
    return text === "add a comment..." || text.startsWith("add a comment");
  }

  private isLikelyReplyToggle(node: Element): boolean {
    const commentTextNode = this.getCommentTextNode(node);
    const nodeText =
      commentTextNode?.innerText ||
      commentTextNode?.textContent ||
      (node as HTMLElement).innerText ||
      node.textContent ||
      "";
    const text = nodeText
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    if (!text) return false;

    const replyToggleLabels = [
      "view replies",
      "hide replies",
      "view more replies",
      "hide more replies",
      "view all replies",
      "hide all replies",
    ];

    return replyToggleLabels.some((label) => text === label || text.startsWith(`${label} `));
  }

  private getSiblingIndex(node: Element): number {
    const parent = node.parentElement;
    if (!parent) return 0;
    const siblings = Array.from(parent.children);
    return siblings.indexOf(node);
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
