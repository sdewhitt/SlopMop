export interface SiteAdapter {
  getSiteId(): string;
  findPostNodes(root?: ParentNode): Element[];
  getStablePostId(postNode: Element): string | null;
  getPermalink(postNode: Element): string | null;
  getTextNode(postNode: Element): HTMLElement | null;
  getImageNodes(postNode: Element): HTMLImageElement[];
  getAuthorHandle(postNode: Element): string | null;
  getTimestampText(postNode: Element): string | null;
  findVisibleCommentNodes(root?: ParentNode, limit?: number): Element[];
  getCommentId(commentNode: Element): string | null;
  getCommentTextNode(commentNode: Element): HTMLElement | null;
  getCommentPermalink(commentNode: Element): string | null;
  /** Narrower host element for badge positioning on comments whose container nests children (e.g. Reddit shreddit-comment). */
  getCommentOverlayHost?(commentNode: Element): HTMLElement | null;
  /**
   * Alternate host element for the post badge when the post node itself clips
   * its contents (overflow:hidden / max-height animation — e.g. Google AI
   * Overview's collapsed state). Return `null` to keep default behavior.
   */
  getPostOverlayHost?(postNode: Element): HTMLElement | null;
}
