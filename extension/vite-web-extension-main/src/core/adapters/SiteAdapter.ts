export interface SiteAdapter {
  getSiteId(): string;
  findPostNodes(root?: ParentNode): Element[];
  getStablePostId(postNode: Element): string | null;
  getPermalink(postNode: Element): string | null;
  getTextNode(postNode: Element): HTMLElement | null;
  getImageNodes(postNode: Element): HTMLImageElement[];
  getAuthorHandle(postNode: Element): string | null;
  getTimestampText(postNode: Element): string | null;
}
