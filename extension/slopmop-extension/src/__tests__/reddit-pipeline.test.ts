import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedObserver } from '@src/core/FeedObserver';
import { PostExtractor } from '@src/core/PostExtractor';
import { OverlayRenderer } from '@src/core/OverlayRenderer';
import { RedditAdapter } from '@src/core/adapters/RedditAdapter';
import type { SiteAdapter } from '@src/core/adapters/SiteAdapter';
import type { ExtensionMessageBus } from '@src/core/ExtensionMessageBus';
import { ContentType, type DetectionResponse } from '@src/types/domain';
import { defaultUserSettings } from '@src/utils/userSettings';

// run with "npm test -- src/__tests__/reddit-pipeline.test.ts"

function setInnerText(element: HTMLElement, value: string): void {
  Object.defineProperty(element, 'innerText', {
    configurable: true,
    get: () => value,
  });
}

function createAdapter(overrides: Partial<SiteAdapter> = {}): SiteAdapter {
  return {
    getSiteId: () => 'reddit.com',
    findPostNodes: () => [],
    getStablePostId: () => null,
    getPermalink: () => null,
    getTextNode: () => null,
    getImageNodes: () => [],
    getAuthorHandle: () => null,
    getTimestampText: () => null,
    findVisibleCommentNodes: () => [],
    getCommentId: () => null,
    getCommentTextNode: () => null,
    getCommentPermalink: () => null,
    ...overrides,
  };
}

describe('Reddit extraction pipeline', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('extracts normalized text post content without extra UI fluff', () => {
    const extractor = new PostExtractor();
    const postNode = document.createElement('article');
    const textNode = document.createElement('div');
    setInnerText(textNode, '  First   line\n\n\n second line  ');
    postNode.appendChild(textNode);

    const adapter = createAdapter({
      getStablePostId: () => 't3_abc123',
      getPermalink: () => 'https://www.reddit.com/r/test/comments/abc123/title/',
      getTextNode: () => textNode,
      getAuthorHandle: () => 'u/tester',
      getTimestampText: () => '2h ago',
    });

    const extracted = extractor.extract(postNode, adapter, 'post');

    expect(extracted).not.toBeNull();
    expect(extracted).toMatchObject({
      site: 'reddit.com',
      postId: 't3_abc123',
      url: 'https://www.reddit.com/r/test/comments/abc123/title/',
      contentType: ContentType.TEXT,
      text: {
        plain: 'First line\n\nsecond line',
        languageHint: '',
      },
      images: [],
      domContext: {
        authorHandle: 'u/tester',
        timestampText: '2h ago',
      },
    });
  });

  it('extracts mixed reddit post content with image metadata', () => {
    const extractor = new PostExtractor();
    const postNode = document.createElement('article');
    const textNode = document.createElement('div');
    setInnerText(textNode, 'Look at this image');

    const imageNode = document.createElement('img');
    imageNode.src = 'https://i.redd.it/example-image.png?width=1080';

    const adapter = createAdapter({
      getStablePostId: () => 't3_mixed001',
      getPermalink: () => 'https://www.reddit.com/r/test/comments/mixed001/title/',
      getTextNode: () => textNode,
      getImageNodes: () => [imageNode],
      getAuthorHandle: () => 'u/imageposter',
      getTimestampText: () => 'just now',
    });

    const extracted = extractor.extract(postNode, adapter, 'post');

    expect(extracted).not.toBeNull();
    expect(extracted?.contentType).toBe(ContentType.MIXED);
    expect(extracted?.images).toHaveLength(1);
    expect(extracted?.images[0]).toMatchObject({
      bytesBase64: '',
      srcUrl: 'https://i.redd.it/example-image.png?width=1080',
      mimeType: 'image/png',
    });
    expect(extracted?.images[0].imageId).toBeTruthy();
  });

  it('extracts reddit comment content into a NormalizedPostContent payload', () => {
    const extractor = new PostExtractor();
    const commentNode = document.createElement('article');
    const commentTextNode = document.createElement('p');
    setInnerText(commentTextNode, 'This is a top-level comment.');
    commentNode.appendChild(commentTextNode);

    const adapter = createAdapter({
      getCommentId: () => 't1_comment123',
      getCommentTextNode: () => commentTextNode,
      getCommentPermalink: () =>
        'https://www.reddit.com/r/test/comments/post123/title/comment123/',
    });

    const extracted = extractor.extract(commentNode, adapter, 'comment');

    expect(extracted).not.toBeNull();
    expect(extracted).toMatchObject({
      site: 'reddit.com',
      postId: 't1_comment123',
      url: 'https://www.reddit.com/r/test/comments/post123/title/comment123/',
      contentType: ContentType.TEXT,
      text: {
        plain: 'This is a top-level comment.',
        languageHint: '',
      },
      images: [],
      domContext: {
        authorHandle: '',
        timestampText: '',
      },
    });
  });

  it('derives a stable reddit post id from permalink when id attributes are absent', () => {
    const adapter = new RedditAdapter();
    const postNode = document.createElement('article');
    const permalink = document.createElement('a');
    permalink.href = '/r/test/comments/abc123/sample_title/';
    permalink.setAttribute('data-click-id', 'comments');
    permalink.textContent = '42 comments';
    postNode.appendChild(permalink);

    expect(adapter.getStablePostId(postNode)).toBe('abc123');
  });

  it('renders a badge with the backend classification and confidence', () => {
    const postNode = document.createElement('article');
    document.body.appendChild(postNode);

    const adapter = createAdapter({
      findPostNodes: () => [postNode],
      getStablePostId: (node) => (node === postNode ? 't3_overlay123' : null),
      findVisibleCommentNodes: () => [],
    });
    const renderer = new OverlayRenderer(adapter, {
      ...defaultUserSettings.settings,
      uiMode: 'simple',
    });
    const response: DetectionResponse = {
      requestId: 'req-1',
      postId: 't3_overlay123',
      verdict: 'likely_ai',
      confidence: 0.86,
      explanation: {
        summary: 'Likely AI-generated wording.',
        highlights: [],
        model: { name: 'test-model', version: '1.0' },
        cache: { hit: false, ttlRemainingMs: 0 },
        timing: { totalMs: 125, inferenceMs: 100 },
      },
    };

    renderer.renderPending('t3_overlay123', 'Example reddit post');
    renderer.renderResult('t3_overlay123', response);

    const overlay = postNode.lastElementChild as HTMLElement | null;
    expect(overlay).not.toBeNull();
    expect(overlay?.textContent).toBe('likely_ai (86%)');
  });

  it('shows the detailed tooltip when hovering the badge in detailed mode', () => {
    const postNode = document.createElement('article');
    document.body.appendChild(postNode);

    const adapter = createAdapter({
      findPostNodes: () => [postNode],
      getStablePostId: (node) => (node === postNode ? 't3_overlay_detailed' : null),
      findVisibleCommentNodes: () => [],
    });
    const renderer = new OverlayRenderer(adapter, {
      ...defaultUserSettings.settings,
      uiMode: 'detailed',
    });
    const response: DetectionResponse = {
      requestId: 'req-2',
      postId: 't3_overlay_detailed',
      verdict: 'likely_ai',
      confidence: 0.86,
      explanation: {
        summary: 'Likely AI-generated wording.',
        highlights: [],
        model: { name: 'test-model', version: '1.0' },
        cache: { hit: false, ttlRemainingMs: 0 },
        timing: { totalMs: 125, inferenceMs: 100 },
      },
    };

    renderer.renderPending(
      't3_overlay_detailed',
      "It's worth noting -- this text includes a common AI phrase.",
    );
    renderer.renderResult('t3_overlay_detailed', response);

    const overlay = postNode.lastElementChild as HTMLElement | null;
    expect(overlay).not.toBeNull();

    overlay?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

    expect(overlay?.textContent).toContain('Patterns observed:');
    expect(overlay?.textContent).toContain('Likely AI-generated wording.');
    expect(overlay?.textContent).toContain('Model: test-model v1.0');
  });

  it('renders a retry button when detection fails', () => {
    const postNode = document.createElement('article');
    document.body.appendChild(postNode);

    const adapter = createAdapter({
      findPostNodes: () => [postNode],
      getStablePostId: (node) => (node === postNode ? 't3_overlay_error' : null),
      findVisibleCommentNodes: () => [],
    });
    const renderer = new OverlayRenderer(adapter, {
      ...defaultUserSettings.settings,
      uiMode: 'simple',
    });
    const onRetry = vi.fn();

    renderer.renderPending('t3_overlay_error', 'Example reddit post');
    renderer.renderError('t3_overlay_error', 'Backend failed', onRetry);

    const overlay = postNode.lastElementChild as HTMLElement | null;
    const retryButton = overlay?.querySelector('button');

    expect(retryButton?.textContent).toBe('Retry');
    retryButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(overlay?.textContent).toBe('Scanning...');
  });

  it('retries analysis with the original extracted payload', () => {
    const extractor = new PostExtractor();
    const postNode = document.createElement('article');
    const textNode = document.createElement('div');
    setInnerText(textNode, 'Retry this post');
    postNode.appendChild(textNode);

    const adapter = createAdapter({
      getStablePostId: () => 't3_retryable',
      getPermalink: () => 'https://www.reddit.com/r/test/comments/retryable/title/',
      getTextNode: () => textNode,
      getAuthorHandle: () => 'u/retryable',
      getTimestampText: () => 'just now',
    });
    const renderPending = vi.fn();
    const sendAnalyze = vi.fn();
    const observer = new FeedObserver(
      adapter,
      extractor,
      { renderPending } as unknown as OverlayRenderer,
      { sendAnalyze } as unknown as ExtensionMessageBus,
      {
        ...defaultUserSettings.settings,
        automaticScanning: true,
      },
    );

    (observer as any).handleCandidatePost(postNode, 'post');

    expect(sendAnalyze).toHaveBeenCalledTimes(1);
    const originalPayload = sendAnalyze.mock.calls[0][0];

    expect(observer.retryAnalyze('t3_retryable')).toBe(true);
    expect(sendAnalyze).toHaveBeenCalledTimes(2);
    expect(sendAnalyze.mock.calls[1][0]).toEqual(originalPayload);
  });
});
