import type { SiteAdapter } from "./SiteAdapter";

export class RedditAdapter implements SiteAdapter {
  getSiteId(): string {
    return "reddit.com";
  }

  findPostNodes(root: ParentNode = document): Element[] {
    // Prefer stable-ish structural selectors over class names.
    const selectors = [
      "shreddit-post",
      "[data-testid='post-container']",
      "article[role='article']",
    ];

    const seen = new Set<Element>();
    const out: Element[] = [];

    for (const sel of selectors) {
      const nodes = Array.from(root.querySelectorAll(sel));
      for (const node of nodes) {
        if (seen.has(node)) continue;
        seen.add(node);

        // Keep only nodes that look like real posts.
        if (this.getPermalink(node) || this.getTextNode(node)) {
          out.push(node);
        }
      }
    }

    return out;
  }

  getStablePostId(postNode: Element): string | null {
    // 1) Preferred id-like attributes
    const attrCandidates = [
      "data-fullname", // often t3_xxxxx
      "data-post-id",
      "data-postid",
      "thingid",
      "id",
    ];

    for (const attr of attrCandidates) {
      const raw = postNode.getAttribute(attr);
      if (!raw) continue;
      const cleaned = raw.trim();
      if (cleaned) return cleaned;
    }

    // 2) Parse from permalink
    const permalink = this.getPermalink(postNode);
    const fromUrl = permalink ? this.parsePostIdFromPermalink(permalink) : null;
    if (fromUrl) return fromUrl;

    // 3) Deterministic fallback hash
    const author =
      postNode.querySelector<HTMLElement>("[data-testid='post_author_link']")?.innerText?.trim() ??
      postNode.querySelector<HTMLElement>("a[href^='/user/']")?.innerText?.trim() ??
      "";

    const timestamp =
      postNode.querySelector<HTMLElement>("a[data-click-id='timestamp']")?.innerText?.trim() ??
      postNode.querySelector<HTMLElement>("time")?.getAttribute("datetime")?.trim() ??
      "";

    const text = this.getTextNode(postNode)?.innerText?.slice(0, 300).trim() ?? "";
    const base = `${permalink ?? ""}|${author}|${timestamp}|${text}`;

    return base ? `reddit-fallback-${this.fnv1a(base)}` : null;
  }

  getPermalink(postNode: Element): string | null {
    const a =
      postNode.querySelector<HTMLAnchorElement>("a[href*='/comments/']") ??
      postNode.querySelector<HTMLAnchorElement>("a[data-click-id='comments']") ??
      postNode.querySelector<HTMLAnchorElement>("a[data-click-id='body']");

    const href = a?.getAttribute("href")?.trim();
    if (!href) return null;

    try {
      const url = new URL(href, window.location.origin);
      url.hash = "";
      return url.toString();
    } catch {
      return null;
    }
  }

  getTextNode(postNode: Element): HTMLElement | null {
    // Title + body containers, avoiding UI chrome as much as possible.
    return (
      postNode.querySelector<HTMLElement>("[slot='text-body']") ??
      postNode.querySelector<HTMLElement>("[data-click-id='text']") ??
      postNode.querySelector<HTMLElement>("h1, h2, h3") ??
      postNode.querySelector<HTMLElement>("p")
    );
  }

  getImageNodes(postNode: Element): HTMLImageElement[] {
    // Phase 1 can return []; keeping discoverability here is useful for later.
    const imgs = Array.from(postNode.querySelectorAll<HTMLImageElement>("img"));

    return imgs.filter((img) => {
      const src = img.currentSrc || img.src || "";
      if (!src) return false;
      if (src.startsWith("data:")) return false; // often tiny placeholders
      if (src.includes("emoji")) return false;
      if (src.includes("award")) return false;

      // Filter likely avatars/icons.
      const w = img.naturalWidth || img.width || 0;
      const h = img.naturalHeight || img.height || 0;
      return w >= 80 && h >= 80;
    });
  }

  private parsePostIdFromPermalink(url: string): string | null {
    // reddit.com/r/{sub}/comments/{postId}/{slug}
    const m = url.match(/\/comments\/([a-z0-9]+)\//i);
    return m?.[1] ?? null;
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