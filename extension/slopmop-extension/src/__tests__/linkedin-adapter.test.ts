import { beforeEach, describe, expect, it } from 'vitest';
import { LinkedInAdapter } from '@src/core/adapters/LinkedInAdapter';

// Helper to mock innerText for DOM elements. jsdom does not always reflect
// textContent in innerText, so we override for extraction tests.
function setInnerText(element: HTMLElement, value: string): void {
  Object.defineProperty(element, 'innerText', {
    configurable: true,
    get: () => value,
  });
}

describe('LinkedInAdapter', () => {
  let adapter: LinkedInAdapter;

  beforeEach(() => {
    document.body.innerHTML = '';
    adapter = new LinkedInAdapter();
  });

  it('returns linkedin.com as site id', () => {
    expect(adapter.getSiteId()).toBe('linkedin.com');
  });

  it('finds post nodes via URN-based identification', () => {
    // LinkedIn exposes urn:li:activity:ID on post containers or nested elements.
    // Build a minimal post with data-urn, permalink link, and text content.
    const postDiv = document.createElement('div');
    postDiv.setAttribute('data-urn', 'urn:li:activity:7123456789');
    const link = document.createElement('a');
    link.href = '/feed/update/urn:li:activity:7123456789/';
    const span = document.createElement('span');
    span.setAttribute('dir', 'auto');
    setInnerText(span, 'Post content');
    postDiv.appendChild(link);
    postDiv.appendChild(span);
    document.body.appendChild(postDiv);

    const found = adapter.findPostNodes(document);
    expect(found).toHaveLength(1);
    expect(found[0]).toBe(postDiv);
  });

  it('derives stable post id from activity URN', () => {
    // Activity ID is the preferred stable identifier; parsed from data-urn.
    const postDiv = document.createElement('div');
    postDiv.setAttribute('data-urn', 'urn:li:activity:7123456789');
    const link = document.createElement('a');
    link.href = '/feed/update/urn:li:activity:7123456789/';
    const span = document.createElement('span');
    span.setAttribute('dir', 'auto');
    setInnerText(span, 'Post text');
    postDiv.appendChild(link);
    postDiv.appendChild(span);
    document.body.appendChild(postDiv);

    expect(adapter.getStablePostId(postDiv)).toBe('7123456789');
  });

  it('derives permalink from feed/update link', () => {
    // Permalink URLs use /feed/update/urn:li:activity:ID/ or /posts/activity-ID-suffix.
    const postDiv = document.createElement('div');
    const link = document.createElement('a');
    link.href = 'https://www.linkedin.com/feed/update/urn:li:activity:7123456789/';
    const span = document.createElement('span');
    span.setAttribute('dir', 'auto');
    setInnerText(span, 'Content');
    postDiv.appendChild(link);
    postDiv.appendChild(span);

    const permalink = adapter.getPermalink(postDiv);
    expect(permalink).toContain('urn:li:activity:7123456789');
  });

  it('prefers show-more container for full post text over truncated span', () => {
    // LinkedIn truncates long posts with "… Read More". The full text lives in
    // div.feed-shared-inline-show-more-text; CSS hides overflow. We must prefer
    // that container so we analyze the full post, not just the preview.
    const postDiv = document.createElement('div');
    const truncatedSpan = document.createElement('span');
    truncatedSpan.setAttribute('dir', 'auto');
    setInnerText(truncatedSpan, 'Short preview... Read More');

    const showMoreDiv = document.createElement('div');
    showMoreDiv.className = 'feed-shared-inline-show-more-text';
    const fullSpan = document.createElement('span');
    fullSpan.textContent = 'This is the full post content that would be hidden until the user clicks Read More.';
    showMoreDiv.appendChild(fullSpan);

    postDiv.appendChild(truncatedSpan);
    postDiv.appendChild(showMoreDiv);

    const textNode = adapter.getTextNode(postDiv);
    expect(textNode).toBe(showMoreDiv);
    expect(textNode?.textContent?.length).toBeGreaterThan(50);
  });

  it('extracts author handle from /in/ profile link', () => {
    // LinkedIn profile URLs use /in/username. Prefer link text, fallback to href.
    const postDiv = document.createElement('div');
    const profileLink = document.createElement('a');
    profileLink.href = 'https://www.linkedin.com/in/jane-doe/';
    setInnerText(profileLink, 'Jane Doe');
    const span = document.createElement('span');
    span.setAttribute('dir', 'auto');
    setInnerText(span, 'Post');
    postDiv.appendChild(profileLink);
    postDiv.appendChild(span);

    expect(adapter.getAuthorHandle(postDiv)).toBe('Jane Doe');
  });

  it('deduplicates multiple URN roots with same activity ID', () => {
    // When content and action bar both have urn:li:activity:ID, we must return
    // only one post container to avoid duplicate badges.
    const outer = document.createElement('div');
    outer.setAttribute('data-urn', 'urn:li:activity:1111111111');
    const link = document.createElement('a');
    link.href = '/feed/update/urn:li:activity:1111111111/';
    const span = document.createElement('span');
    span.setAttribute('dir', 'auto');
    setInnerText(span, 'Main content');
    outer.appendChild(link);
    outer.appendChild(span);

    const actionBar = document.createElement('div');
    actionBar.setAttribute('data-urn', 'urn:li:activity:1111111111');
    actionBar.textContent = 'Like Comment Repost';
    outer.appendChild(actionBar);

    document.body.appendChild(outer);

    const found = adapter.findPostNodes(document);
    expect(found).toHaveLength(1);
  });

  it('only returns urn:li:comment nodes for comments, excluding action bar items', () => {
    // findVisibleCommentNodes must use urn:li:comment only. Broad selectors like
    // "ul > li" incorrectly match the action bar (Like, Comment, Repost, Send).
    const postDiv = document.createElement('div');
    postDiv.setAttribute('data-urn', 'urn:li:activity:6666666666');
    const link = document.createElement('a');
    link.href = '/feed/update/urn:li:activity:6666666666/';
    const span = document.createElement('span');
    span.setAttribute('dir', 'auto');
    setInnerText(span, 'Post');
    postDiv.appendChild(link);
    postDiv.appendChild(span);

    // Action bar items have activity URN, not comment URN — should not be returned.
    const actionBar = document.createElement('ul');
    ['Like', 'Comment', 'Repost', 'Send'].forEach((label) => {
      const li = document.createElement('li');
      li.textContent = label;
      li.setAttribute('data-urn', 'urn:li:activity:6666666666');
      actionBar.appendChild(li);
    });
    postDiv.appendChild(actionBar);

    const realComment = document.createElement('div');
    realComment.setAttribute('data-urn', 'urn:li:comment:7777777777');
    const commentSpan = document.createElement('span');
    commentSpan.setAttribute('dir', 'auto');
    setInnerText(commentSpan, 'Actual comment text');
    realComment.appendChild(commentSpan);
    postDiv.appendChild(realComment);

    document.body.appendChild(postDiv);

    // Mock getBoundingClientRect so isElementVisibleInViewport returns true.
    Object.defineProperty(realComment, 'getBoundingClientRect', {
      value: () => ({ width: 400, height: 50, top: 10, bottom: 60, left: 0, right: 400 }),
    });

    const comments = adapter.findVisibleCommentNodes(document, 25);
    expect(comments).toHaveLength(1);
    expect(comments[0].getAttribute('data-urn')).toContain('urn:li:comment');
  });
});
