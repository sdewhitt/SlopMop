import type { SiteAdapter } from "./SiteAdapter";

/**
 * SiteAdapter for Google Search (google.com and country TLDs).
 *
 * Targets AI-generated content blocks on the SERP — primarily the "AI Overview"
 * (also referred to as SGE / Search Generative Experience). Ordinary organic
 * results are intentionally ignored.
 *
 * Selector strategy: Google frequently changes class names, so this adapter uses
 * a fallback chain of selectors. When none match, findPostNodes returns [] and
 * the MutationObserver-driven scan is effectively a no-op.
 */

/**
 * Primary → fallback selector chain for AI Overview / generative blocks.
 * Ordered by specificity; first match wins.
 */
const AI_OVERVIEW_SELECTORS = [
  // Modern AI Overview containers (as of 2024-2026)
  'div[data-attrid="AIOverview"]',
  'div[data-attrid*="ai_overview"]',
  'div[aria-label*="AI Overview" i]',
  'div[aria-label*="AI-generated" i]',
  // Generative block fallbacks (SGE-era)
  'div[data-sgrd]',
  'div.g-blk[data-hveid]',
  // Knowledge panel generative descriptions
  'div.kno-rdesc',
];

/**
 * Heading text used to locate AI Overview containers when data attributes are
 * missing. We look for headings matching these patterns and return the nearest
 * meaningful container ancestor.
 */
const AI_HEADING_PATTERNS = [
  /\bAI\s*Overview\b/i,
  /\bAI-generated\b/i,
  /\bGenerative\s*AI\b/i,
];

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
        const picked = this.pickMeaningfulContainer(node);
        if (!picked || seen.has(picked)) continue;
        if (this.hasMeaningfulText(picked)) {
          seen.add(picked);
          out.push(picked);
        }
      }
    }

    if (out.length === 0) {
      const fromHeading = this.findByHeading(root);
      for (const node of fromHeading) {
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
    // The adapter's root is already scoped to the AI block; use it as the text host.
    if (postNode instanceof HTMLElement) return postNode;
    return null;
  }

  getImageNodes(_postNode: Element): HTMLImageElement[] {
    // AI Overview images are thumbnails of cited sources, not generated content.
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
   * Some selectors match inner wrappers. Walk up a few ancestors to find a
   * container that meaningfully bounds the AI block.
   */
  private pickMeaningfulContainer(el: Element): Element | null {
    const withHveid = el.closest('[data-hveid]');
    if (withHveid && this.hasMeaningfulText(withHveid)) return withHveid;
    return el;
  }

  private findByHeading(root: ParentNode): Element[] {
    const docRoot = root instanceof Document ? root : root instanceof Element ? root : document;
    const candidates = docRoot.querySelectorAll<HTMLElement>(
      'h1, h2, h3, [role="heading"], [aria-level]',
    );
    const out: Element[] = [];
    for (const h of Array.from(candidates)) {
      const text = (h.textContent ?? "").trim();
      if (!text) continue;
      if (!AI_HEADING_PATTERNS.some((rx) => rx.test(text))) continue;

      const container =
        h.closest('[data-hveid]') ??
        h.closest("section") ??
        h.parentElement;
      if (container) out.push(container);
    }
    return out;
  }

  private hasMeaningfulText(el: Element): boolean {
    if (!(el instanceof HTMLElement)) return false;
    const text = (el.innerText ?? "").trim();
    return text.length >= 40;
  }

  /** First 500 chars of innerText — stable across re-renders of the same AI Overview. */
  private getContentFingerprint(el: Element): string | null {
    if (!(el instanceof HTMLElement)) return null;
    const text = (el.innerText ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 500);
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
