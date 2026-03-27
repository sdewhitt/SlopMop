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

  it('finds post nodes on profile / activity surfaces without MAIN_FEED in componentkey', () => {
    const postOuter = document.createElement('div');
    postOuter.setAttribute('role', 'listitem');
    postOuter.setAttribute('componentkey', 'xProfileFeedType_RECENT_ACTIVITY_y');
    const textBox = document.createElement('span');
    textBox.setAttribute('data-testid', 'expandable-text-box');
    setInnerText(textBox, 'Post on profile view');
    postOuter.appendChild(textBox);
    document.body.appendChild(postOuter);

    const found = adapter.findPostNodes(document);
    expect(found.length).toBeGreaterThanOrEqual(1);
    expect(found).toContain(postOuter);
    expect(adapter.getStablePostId(postOuter)).toMatch(/^linkedin-ck-/);
  });

  it('finds post nodes via role=listitem + MAIN_FEED componentkey + expandable-text-box', () => {
    const li = document.createElement('div');
    li.setAttribute('role', 'listitem');
    li.setAttribute('componentkey', 'abc123XyzFeedType_MAIN_FEED_RELEVANCE');
    const textBox = document.createElement('span');
    textBox.setAttribute('data-testid', 'expandable-text-box');
    setInnerText(textBox, 'Hello from the modern feed');
    li.appendChild(textBox);
    document.body.appendChild(li);

    const found = adapter.findPostNodes(document);
    expect(found).toHaveLength(1);
    expect(found[0]).toBe(li);
    expect(adapter.getStablePostId(li)).toMatch(/^linkedin-ck-[0-9a-f]+$/);
    expect(adapter.getTextNode(li)).toBe(textBox);
  });

  it('dedupes two expandable-text-box nodes in the same post to one root', () => {
    const li = document.createElement('div');
    li.setAttribute('role', 'listitem');
    li.setAttribute('componentkey', 'singlePostFeedType_MAIN_FEED_RELEVANCE');
    const a = document.createElement('span');
    a.setAttribute('data-testid', 'expandable-text-box');
    setInnerText(a, 'First');
    const b = document.createElement('span');
    b.setAttribute('data-testid', 'expandable-text-box');
    setInnerText(b, 'Second');
    li.appendChild(a);
    li.appendChild(b);
    document.body.appendChild(li);

    expect(adapter.findPostNodes(document)).toHaveLength(1);
  });

  it('finds post nodes via urn:li:ugcPost (current feed markup)', () => {
    const postDiv = document.createElement('div');
    postDiv.setAttribute('data-urn', 'urn:li:ugcPost:7123456789');
    const link = document.createElement('a');
    link.href = '/feed/update/urn:li:ugcPost:7123456789/';
    const span = document.createElement('span');
    span.setAttribute('dir', 'auto');
    setInnerText(span, 'Post content');
    postDiv.appendChild(link);
    postDiv.appendChild(span);
    document.body.appendChild(postDiv);

    const found = adapter.findPostNodes(document);
    expect(found).toHaveLength(1);
    expect(adapter.getStablePostId(postDiv)).toBe('7123456789');
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

  it('finds comments when urn:li:comment is only in componentkey (replaceableComment_...)', () => {
    const postOuter = document.createElement('div');
    postOuter.setAttribute('role', 'listitem');
    postOuter.setAttribute('componentkey', 'storyFeedType_MAIN_FEED_RELEVANCE');

    const postText = document.createElement('span');
    postText.setAttribute('data-testid', 'expandable-text-box');
    setInnerText(postText, 'Original post');

    const commentWrap = document.createElement('div');
    commentWrap.setAttribute(
      'componentkey',
      'replaceableComment_urn:li:comment:(urn:li:activity:7443268373033181184,7443269247889403904)',
    );
    const commentText = document.createElement('span');
    commentText.setAttribute('data-testid', 'expandable-text-box');
    setInnerText(commentText, 'Congrats!!');

    commentWrap.appendChild(commentText);
    postOuter.appendChild(postText);
    postOuter.appendChild(commentWrap);
    document.body.appendChild(postOuter);

    Object.defineProperty(commentWrap, 'getBoundingClientRect', {
      value: () => ({ width: 400, height: 50, top: 10, bottom: 60, left: 0, right: 400 }),
    });

    const comments = adapter.findVisibleCommentNodes(document, 25);
    expect(comments).toHaveLength(1);
    expect(comments[0]).toBe(commentWrap);
    expect(adapter.getCommentId(commentWrap)).toBe('7443269247889403904');
  });

  it('finds modern comment nodes when comment thread uses expandable-text-box + COMMENT componentkey', () => {
    const postOuter = document.createElement('div');
    postOuter.setAttribute('role', 'listitem');
    postOuter.setAttribute('componentkey', 'abcFeedType_MAIN_FEED_RELEVANCE');

    const postText = document.createElement('span');
    postText.setAttribute('data-testid', 'expandable-text-box');
    setInnerText(postText, 'Main post body');

    const commentRow = document.createElement('div');
    commentRow.setAttribute('role', 'listitem');
    commentRow.setAttribute('componentkey', 'cmtFeedType_COMMENT_THREAD');

    const commentText = document.createElement('span');
    commentText.setAttribute('data-testid', 'expandable-text-box');
    setInnerText(commentText, 'This is a comment on the post');

    commentRow.appendChild(commentText);
    postOuter.appendChild(postText);
    postOuter.appendChild(commentRow);
    document.body.appendChild(postOuter);

    Object.defineProperty(commentRow, 'getBoundingClientRect', {
      value: () => ({ width: 400, height: 50, top: 10, bottom: 60, left: 0, right: 400 }),
    });

    const comments = adapter.findVisibleCommentNodes(document, 25);
    expect(comments).toHaveLength(1);
    expect(comments[0]).toBe(commentRow);
    expect(adapter.getCommentId(commentRow)).toMatch(/^linkedin-comment-/);
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
