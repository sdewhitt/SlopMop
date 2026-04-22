import type { SiteAdapter } from "./SiteAdapter";

/**
 * SiteAdapter for Google Search (google.com and country TLDs).
 *
 * Targets two distinct kinds of feed units on the SERP:
 *
 *   1. AI Overview cards (previously SGE / Search Generative Experience) — the
 *      primary, highest-value target because their body text is itself a
 *      candidate for AI-written content detection.
 *
 *   2. Ordinary organic search results — each result card gets its own Detect
 *      Now entry point so the user can analyse any snippet on the page.
 *
 * Selector strategy:
 *   Google rotates class names frequently (e.g. .Kevs9, .Y3BBE, .VwiC3b) but
 *   keeps a small set of stable attribute hooks. We prefer those, then fall
 *   back to the literal heading text "AI Overview" (walking up the DOM a bounded
 *   number of levels) for the AI Overview, and to `div.g` / `#rso [data-hveid]`
 *   for organic results.
 *
 *   Verified against Google SERP DOM, early 2026. See:
 *     - data-attrid="AIOverview"        (AIO container; capitalised — lowercase
 *                                        "overview" is a DIFFERENT knowledge-panel
 *                                        card and must NOT be matched here)
 *     - .Kevs9                          (AIO content wrapper; class rotates)
 *     - .Y3BBE                          (AIO per-paragraph; class rotates)
 *     - #search div.g + [data-hveid]    (organic result cards)
 *     - h3 (inside .g)                  (result title)
 *     - .VwiC3b                         (result snippet; class rotates)
 */

/**
 * Primary → fallback attribute-based selector chain for the AI Overview.
 * First match wins. All entries should be "real" hooks observed on live
 * SERP HTML — do not add lowercase `data-attrid="overview"`, that is the
 * knowledge-panel entity summary, not the AI Overview.
 */
const AI_OVERVIEW_SELECTORS = [
  // Stable attribute container for the AIO card (case-sensitive).
  'div[data-attrid="AIOverview"]',
  // Legacy / alternative attribute hooks still seen in some rollouts.
  'div[data-attrid*="ai_overview" i]',
  'div[data-subtree="ai_overview"]',
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
 * Organic-result selectors, in priority order. We require the card to also
 * contain an `h3` title and at least one anchor, so we don't accidentally
 * badge related-searches chips, "People also ask" accordions, etc.
 */
const ORGANIC_RESULT_SELECTORS = [
  "#search div.g",
  "#rso div.g",
  "#search div[data-sokoban-container]",
  "#rso div[jscontroller][data-hveid]",
];

/** Snippet text container inside an organic result; first match wins. */
const ORGANIC_SNIPPET_SELECTORS = [
  ".VwiC3b",
  "div[data-sncf]",
  "div[data-content-feature]",
  "span.st",
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

/** Minimum characters an organic result's snippet + title must have to be worth detecting. */
const MIN_ORGANIC_TEXT_CHARS = 25;

type GoogleNodeKind = "aio" | "organic";

export class GoogleAdapter implements SiteAdapter {
  /**
   * Remember whether a given post node is the AI Overview or an organic
   * result — adapter methods behave differently for the two. We keep this on
   * the adapter (not a per-node attribute) so we don't mutate Google's DOM.
   */
  private nodeKind = new WeakMap<Element, GoogleNodeKind>();

  getSiteId(): string {
    return "google.com";
  }

  findPostNodes(root: ParentNode = document): Element[] {
    const out: Element[] = [];
    const seen = new Set<Element>();

    for (const node of this.collectAioNodes(root)) {
      if (seen.has(node)) continue;
      seen.add(node);
      this.nodeKind.set(node, "aio");
      out.push(node);
    }

    for (const node of this.collectOrganicNodes(root)) {
      if (seen.has(node)) continue;
      // Skip any organic-result wrapper that happens to sit inside an AIO
      // (e.g. a sources list card) — we already emitted the AIO itself.
      if (out.some((aio) => aio.contains(node) || node.contains(aio))) continue;
      seen.add(node);
      this.nodeKind.set(node, "organic");
      out.push(node);
    }

    return out;
  }

  getStablePostId(postNode: Element): string | null {
    const kind = this.nodeKind.get(postNode) ?? this.inferKind(postNode);
    if (kind === "organic") {
      const href = this.getOrganicResultHref(postNode);
      if (href) return `google-result-${this.fnv1a(href)}`;
      const fingerprint = this.getContentFingerprint(postNode);
      if (!fingerprint) return null;
      return `google-result-${this.fnv1a(fingerprint)}`;
    }

    const query = this.getSearchQuery();
    const fingerprint = this.getContentFingerprint(postNode);
    if (!fingerprint) return null;
    const base = `${query}|${fingerprint}`;
    return `google-aio-${this.fnv1a(base)}`;
  }

  getPermalink(postNode: Element): string | null {
    const kind = this.nodeKind.get(postNode) ?? this.inferKind(postNode);
    if (kind === "organic") {
      return this.getOrganicResultHref(postNode);
    }
    try {
      return window.location.href;
    } catch {
      return null;
    }
  }

  getTextNode(postNode: Element): HTMLElement | null {
    const kind = this.nodeKind.get(postNode) ?? this.inferKind(postNode);
    if (kind === "organic") {
      return this.getOrganicTextHost(postNode);
    }
    // The AIO post node is already scoped to the AI block; use it as the text host.
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
   *
   * For organic results the card itself is not clipped — just use the node.
   */
  getPostOverlayHost(postNode: Element): HTMLElement | null {
    if (!(postNode instanceof HTMLElement)) return null;

    const kind = this.nodeKind.get(postNode) ?? this.inferKind(postNode);
    if (kind === "organic") return postNode;

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
    // AI Overview images are source citation thumbnails; organic result
    // favicons / site thumbnails are not generated content either.
    return [];
  }

  getAuthorHandle(postNode: Element): string | null {
    const kind = this.nodeKind.get(postNode) ?? this.inferKind(postNode);
    if (kind === "organic") {
      const cite = postNode.querySelector<HTMLElement>("cite");
      const citeText = cite?.textContent?.trim();
      if (citeText) return citeText.split(/\s+[›»]\s+/)[0].trim() || citeText;
      const href = this.getOrganicResultHref(postNode);
      return href ? this.hostnameFromHref(href) : null;
    }
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

  private collectAioNodes(root: ParentNode): Element[] {
    const out: Element[] = [];
    const seen = new Set<Element>();

    for (const sel of AI_OVERVIEW_SELECTORS) {
      for (const node of this.querySelectorAllIncludingRoot(root, sel)) {
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

  private collectOrganicNodes(root: ParentNode): Element[] {
    const out: Element[] = [];
    const seen = new Set<Element>();

    for (const sel of ORGANIC_RESULT_SELECTORS) {
      for (const node of this.querySelectorAllIncludingRoot(root, sel)) {
        if (seen.has(node)) continue;
        if (!this.looksLikeOrganicResult(node)) continue;
        seen.add(node);
        out.push(node);
      }
    }

    // Google sometimes nests a `.g` wrapper around a group of sibling `.g`
    // sub-cards (sitelinks). Keep outermost only so we don't double-badge.
    return out.filter(
      (el) => !out.some((other) => other !== el && other.contains(el)),
    );
  }

  private looksLikeOrganicResult(el: Element): boolean {
    if (!(el instanceof HTMLElement)) return false;
    // Must carry a title and a result link.
    const title = el.querySelector("h3");
    if (!title) return false;
    const link = el.querySelector<HTMLAnchorElement>('a[href]:not([href="#"])');
    if (!link) return false;
    // Filter out "People also ask" / related searches cards that also have h3.
    const role = el.getAttribute("role");
    if (role === "listitem" || role === "complementary") return false;
    // Must carry enough visible text to be worth detecting.
    const bodyText = this.getInnerText(el);
    if (bodyText.length < MIN_ORGANIC_TEXT_CHARS) return false;
    return true;
  }

  private getOrganicTextHost(postNode: Element): HTMLElement | null {
    if (!(postNode instanceof HTMLElement)) return null;
    for (const sel of ORGANIC_SNIPPET_SELECTORS) {
      const el = postNode.querySelector<HTMLElement>(sel);
      if (el && this.getInnerText(el).length > 0) return el;
    }
    // Fallback: widest span of snippet-ish text below the header.
    return postNode;
  }

  private getOrganicResultHref(postNode: Element): string | null {
    const anchors = Array.from(
      postNode.querySelectorAll<HTMLAnchorElement>('a[href]:not([href="#"])'),
    );
    for (const a of anchors) {
      const href = (a.getAttribute("href") ?? "").trim();
      if (!href) continue;
      if (href.startsWith("javascript:")) continue;
      // Prefer anchors that contain the h3 title — that's the canonical result link.
      if (a.querySelector("h3")) return this.normaliseHref(href);
    }
    for (const a of anchors) {
      const href = (a.getAttribute("href") ?? "").trim();
      if (href && !href.startsWith("javascript:")) return this.normaliseHref(href);
    }
    return null;
  }

  private normaliseHref(href: string): string {
    try {
      const url = new URL(href, window.location.origin || "https://www.google.com");
      // Google sometimes wraps external links in `/url?q=<encoded>`; unwrap.
      if (url.pathname === "/url") {
        const q = url.searchParams.get("q");
        if (q) return q;
      }
      return url.toString();
    } catch {
      return href;
    }
  }

  private hostnameFromHref(href: string): string | null {
    try {
      return new URL(href, window.location.origin || "https://www.google.com")
        .hostname.replace(/^www\./, "");
    } catch {
      return null;
    }
  }

  /**
   * Best-effort classification when the WeakMap entry is missing (e.g. the
   * caller stored the node earlier and the adapter was re-instantiated).
   */
  private inferKind(postNode: Element): GoogleNodeKind {
    for (const sel of AI_OVERVIEW_SELECTORS) {
      if (postNode.matches(sel)) return "aio";
    }
    const text = (postNode.textContent ?? "").trim();
    if (AI_HEADING_PATTERNS.some((rx) => rx.test(text.slice(0, 120)))) {
      return "aio";
    }
    return "organic";
  }

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
