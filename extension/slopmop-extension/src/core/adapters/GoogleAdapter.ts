import type { SiteAdapter } from "./SiteAdapter";

/**
 * SiteAdapter for Google Search (google.com and country TLDs).
 *
 * Targets AI-generated content blocks on the SERP — primarily the "AI Overview"
 * (previously SGE / Search Generative Experience). Ordinary organic results are
 * intentionally ignored.
 *
 * Selector strategy:
 *   Google rotates class names frequently (e.g. .Kevs9, .Y3BBE, .M8OgIe) but keeps
 *   a small set of stable attribute hooks. We prefer those, then fall back to the
 *   literal heading text "AI Overview" and walk up the DOM a bounded number of
 *   levels to find the content container.
 *
 *   Verified against Google SERP DOM, early 2026. See:
 *     - data-attrid="overview"          (container)
 *     - jsname="tJHJj"                  (container)
 *     - .Kevs9                          (content wrapper; class rotates)
 *     - .Y3BBE                          (per-paragraph; class rotates)
 */

/**
 * Primary → fallback attribute-based selector chain. First match wins.
 * All entries should be "real" hooks observed on live SERP HTML.
 */
const AI_OVERVIEW_SELECTORS = [
  // Stable attribute container (lowercase `overview`).
  'div[data-attrid="overview"]',
  // Stable jsname fingerprint for the AIO card.
  'div[jsname="tJHJj"]',
  // Aria-labelled landmark (occasionally emitted on the outer region).
  '[role="region"][aria-label*="AI Overview" i]',
  '[role="region"][aria-label*="AI-generated" i]',
];

/** Heading text used to locate AI Overview containers by content. */
const AI_HEADING_PATTERNS = [
  /\bAI\s*Overview\b/i,
  /\bAI-generated\b/i,
];

/**
 * Max levels `findByHeading` walks up from the heading looking for a container
 * that holds both the heading and substantially more body text. Matches the
 * pattern used by community AIO scrapers (they walk 10 ancestors for `.Kevs9`).
 */
const HEADING_ANCESTOR_WALK_LIMIT = 10;

/**
 * Minimum extra characters of text the container must contain beyond the
 * heading itself. Picks a wrapper that includes the AIO body, not just a title
 * chip.
 */
const MIN_BODY_CHARS_BEYOND_HEADING = 80;

/** Max ancestors `getPostOverlayHost` climbs when looking past clipping parents. */
const OVERLAY_HOST_WALK_LIMIT = 8;

export class GoogleAdapter implements SiteAdapter {
  getSiteId(): string {
    return "google.com";
  }

  findPostNodes(root: ParentNode = document): Element[] {
    const out: Element[] = [];
    const seen = new Set<Element>();

    for (const sel of AI_OVERVIEW_SELECTORS) {
      const nodes = this.querySelectorAllIncludingRoot(root, sel);
      for (const node of nodes) {
        if (seen.has(node)) continue;
        if (this.hasMeaningfulText(node)) {
          seen.add(node);
          out.push(node);
        }
      }
    }

    if (out.length === 0) {
      for (const node of this.findByHeading(root)) {
        if (!seen.has(node) && this.hasMeaningfulText(node)) {
          seen.add(node);
          out.push(node);
        }
      }
    }

    return out;
  }

  getStablePostId(postNode: Element): string | null {
    const query = this.getSearchQuery();
    const fingerprint = this.getContentFingerprint(postNode);
    if (!fingerprint) return null;
    const base = `${query}|${fingerprint}`;
    return `google-aio-${this.fnv1a(base)}`;
  }

  getPermalink(_postNode: Element): string | null {
    try {
      return window.location.href;
    } catch {
      return null;
    }
  }

  getTextNode(postNode: Element): HTMLElement | null {
    // The post node is already scoped to the AI block; use it as the text host.
    if (postNode instanceof HTMLElement) return postNode;
    return null;
  }

  /**
   * Google collapses the AI Overview with `overflow: hidden` + a `max-height`
   * animation. An absolute-positioned badge appended inside the AIO would be
   * clipped by that outer wrapper even when the post node itself isn't the
   * clipper. Walk self + up to N ancestors; if any of them clip, return the
   * first ancestor that sits above *every* clipping element in the chain.
   * Falls back to the post node itself when no clean ancestor is found.
   */
  getPostOverlayHost(postNode: Element): HTMLElement | null {
    if (!(postNode instanceof HTMLElement)) return null;

    const ancestors: HTMLElement[] = [];
    let node: HTMLElement | null = postNode;
    for (let i = 0; node && i <= OVERLAY_HOST_WALK_LIMIT; i++) {
      ancestors.push(node);
      node = node.parentElement;
    }

    let lastClipIdx = -1;
    for (let i = 0; i < ancestors.length; i++) {
      if (this.isClipping(ancestors[i])) lastClipIdx = i;
    }

    if (lastClipIdx === -1) return postNode;
    if (lastClipIdx + 1 < ancestors.length) return ancestors[lastClipIdx + 1];
    return postNode;
  }

  getImageNodes(_postNode: Element): HTMLImageElement[] {
    // AI Overview images are source citation thumbnails, not generated content.
    return [];
  }

  getAuthorHandle(_postNode: Element): string | null {
    return "Google AI";
  }

  getTimestampText(_postNode: Element): string | null {
    return null;
  }

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

  // ── Helpers ────────────────────────────────────────────────────

  private querySelectorAllIncludingRoot(root: ParentNode, selector: string): Element[] {
    const nodes: Element[] = [];
    if (root instanceof Element && root.matches(selector)) {
      nodes.push(root);
    }
    nodes.push(...Array.from(root.querySelectorAll(selector)));
    return nodes;
  }

  /**
   * Heading-text fallback: find h1/h2/h3/[role="heading"] elements whose text
   * matches an AI Overview marker, then walk up to HEADING_ANCESTOR_WALK_LIMIT
   * ancestors and pick the first ancestor whose own text contains the heading
   * plus MIN_BODY_CHARS_BEYOND_HEADING more characters. That heuristic avoids
   * bare title chips and over-broad SERP shells alike.
   */
  private findByHeading(root: ParentNode): Element[] {
    const docRoot =
      root instanceof Document ? root :
      root instanceof Element ? root :
      document;
    const headings = docRoot.querySelectorAll<HTMLElement>(
      'h1, h2, h3, [role="heading"]',
    );

    const out: Element[] = [];
    for (const h of Array.from(headings)) {
      const headingText = (h.textContent ?? "").trim();
      if (!headingText) continue;
      if (!AI_HEADING_PATTERNS.some((rx) => rx.test(headingText))) continue;

      const container = this.walkUpForAioContainer(h, headingText);
      if (container) out.push(container);
    }
    return out;
  }

  private walkUpForAioContainer(
    heading: HTMLElement,
    headingText: string,
  ): Element | null {
    let node: HTMLElement | null = heading.parentElement;
    let level = 0;
    while (node && level < HEADING_ANCESTOR_WALK_LIMIT) {
      const ownText = this.getInnerText(node);
      const extra = ownText.length - headingText.length;
      if (extra >= MIN_BODY_CHARS_BEYOND_HEADING) {
        return node;
      }
      node = node.parentElement;
      level++;
    }
    return null;
  }

  private hasMeaningfulText(el: Element): boolean {
    return this.getInnerText(el).length >= 40;
  }

  /**
   * True when the element would visually clip an absolute-positioned badge
   * placed at its bottom/right corner. Checks computed overflow (hidden/clip/
   * scroll) and whether a capped max-height is in effect. Falls back to inline
   * styles when getComputedStyle is unavailable (e.g. jsdom without layout).
   */
  private isClipping(el: HTMLElement): boolean {
    const overflows = this.readOverflowStyles(el);
    for (const v of overflows) {
      if (v === "hidden" || v === "clip" || v === "scroll") return true;
    }
    const maxH = this.readStyle(el, "maxHeight", "max-height");
    if (maxH && maxH !== "none" && maxH !== "0px" && maxH !== "0") {
      return true;
    }
    return false;
  }

  private readOverflowStyles(el: HTMLElement): string[] {
    return [
      this.readStyle(el, "overflow", "overflow"),
      this.readStyle(el, "overflowX", "overflow-x"),
      this.readStyle(el, "overflowY", "overflow-y"),
    ];
  }

  private readStyle(
    el: HTMLElement,
    inlineKey: keyof CSSStyleDeclaration,
    cssProp: string,
  ): string {
    try {
      const computed = window.getComputedStyle(el).getPropertyValue(cssProp);
      if (computed) return computed.trim();
    } catch {
      // getComputedStyle can throw in rare detached-node contexts.
    }
    const inline = el.style[inlineKey];
    return typeof inline === "string" ? inline.trim() : "";
  }

  /** Normalized innerText (whitespace-collapsed) for fingerprint and length checks. */
  private getInnerText(el: Element): string {
    if (!(el instanceof HTMLElement)) return "";
    const raw = el.innerText ?? el.textContent ?? "";
    return raw.replace(/\s+/g, " ").trim();
  }

  /** First 500 chars of innerText — stable across same-content re-renders. */
  private getContentFingerprint(el: Element): string | null {
    const text = this.getInnerText(el).slice(0, 500);
    return text || null;
  }

  private getSearchQuery(): string {
    try {
      const params = new URLSearchParams(window.location.search);
      return (params.get("q") ?? "").trim().toLowerCase();
    } catch {
      return "";
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
