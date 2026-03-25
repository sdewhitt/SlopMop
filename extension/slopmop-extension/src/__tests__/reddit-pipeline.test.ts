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

function setVisibleRect(element: Element): void {
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      width: 300,
      height: 80,
      top: 10,
      right: 310,
      bottom: 90,
      left: 10,
      x: 10,
      y: 10,
      toJSON: () => ({}),
    }),
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

  it('extracts image-only post when there is no text body', () => {
    const extractor = new PostExtractor();
    const postNode = document.createElement('article');

    const imageNode = document.createElement('img');
    imageNode.src = 'https://i.redd.it/image-only.jpg';

    const adapter = createAdapter({
      getStablePostId: () => 't3_imgonly',
      getPermalink: () => 'https://www.reddit.com/r/test/comments/imgonly/title/',
      getTextNode: () => null,
      getImageNodes: () => [imageNode],
      getAuthorHandle: () => 'u/imagefan',
      getTimestampText: () => '5m ago',
    });

    const extracted = extractor.extract(postNode, adapter, 'post');

    expect(extracted).not.toBeNull();
    expect(extracted?.contentType).toBe(ContentType.IMAGE);
    expect(extracted?.text.plain).toBe('');
    expect(extracted?.images).toHaveLength(1);
    expect(extracted?.images[0].srcUrl).toBe('https://i.redd.it/image-only.jpg');
  });

  it('returns null when post has neither text nor images', () => {
    const extractor = new PostExtractor();
    const postNode = document.createElement('article');

    const adapter = createAdapter({
      getStablePostId: () => 't3_empty',
      getPermalink: () => 'https://www.reddit.com/r/test/comments/empty/title/',
      getTextNode: () => null,
      getImageNodes: () => [],
    });

    const extracted = extractor.extract(postNode, adapter, 'post');
    expect(extracted).toBeNull();
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
    const renderer = new OverlayRenderer({
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

    renderer.renderPending('t3_overlay123', postNode, 'Example reddit post');
    renderer.renderResult('t3_overlay123', response);

    const overlay = postNode.lastElementChild as HTMLElement | null;
    expect(overlay).not.toBeNull();
    expect(overlay?.textContent).toBe('likely_ai (86%)');
  });

  it('renders dual text + image results on the badge for mixed posts', () => {
    const postNode = document.createElement('article');
    document.body.appendChild(postNode);
    const renderer = new OverlayRenderer({
      ...defaultUserSettings.settings,
      uiMode: 'simple',
    });
    const response: DetectionResponse = {
      requestId: 'req-dual',
      postId: 't3_dual',
      verdict: 'likely_ai',
      confidence: 0.92,
      explanation: {
        summary: 'Text looks AI-generated.',
        highlights: [],
        model: { name: 'test-model', version: '1.0' },
        cache: { hit: false, ttlRemainingMs: 0 },
        timing: { totalMs: 200, inferenceMs: 150 },
      },
      imageResult: {
        verdict: 'likely_human',
        confidence: 0.15,
        summary: 'Image appears authentic.',
        model: { name: 'nonescape-mini', version: '0.1' },
        timingMs: 300,
      },
    };

    renderer.renderPending('t3_dual', postNode, 'Some text with image');
    renderer.renderResult('t3_dual', response);

    const overlay = postNode.lastElementChild as HTMLElement | null;
    expect(overlay).not.toBeNull();
    expect(overlay?.textContent).toContain('Text: likely_ai (92%)');
    expect(overlay?.textContent).toContain('Img: likely_human (15%)');
  });

  it('shows the detailed tooltip when hovering the badge in detailed mode', () => {
    const postNode = document.createElement('article');
    document.body.appendChild(postNode);
    const renderer = new OverlayRenderer({
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
      postNode,
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
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const postNode = document.createElement('article');
    document.body.appendChild(postNode);
    const renderer = new OverlayRenderer({
      ...defaultUserSettings.settings,
      uiMode: 'simple',
    });
    const onRetry = vi.fn();

    renderer.renderPending('t3_overlay_error', postNode, 'Example reddit post');
    renderer.renderError('t3_overlay_error', 'Backend failed', onRetry);

    const overlay = postNode.lastElementChild as HTMLElement | null;
    const retryButton = overlay?.querySelector('button');

    expect(overlay?.textContent).toContain('Error');
    expect(retryButton?.textContent).toBe(' · Retry');
    retryButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(overlay?.textContent).toBe('Scanning...');
    errorSpy.mockRestore();
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

  it('does not block image-only posts with unsupported language in manual mode', () => {
    const extractor = new PostExtractor();
    const postNode = document.createElement('article');

    // No text node — image-only post
    const imageNode = document.createElement('img');
    imageNode.src = 'https://i.redd.it/some-image.jpg';

    const adapter = createAdapter({
      getStablePostId: () => 't3_imglang',
      getPermalink: () => 'https://www.reddit.com/r/test/comments/imglang/title/',
      getTextNode: () => null,
      getImageNodes: () => [imageNode],
      getAuthorHandle: () => 'u/imguser',
      getTimestampText: () => 'just now',
    });
    const renderPending = vi.fn();
    const renderError = vi.fn();
    const sendAnalyze = vi.fn();
    const observer = new FeedObserver(
      adapter,
      extractor,
      { renderPending, renderError } as unknown as OverlayRenderer,
      { sendAnalyze } as unknown as ExtensionMessageBus,
      {
        ...defaultUserSettings.settings,
        automaticScanning: false, // manual mode
      },
    );

    (observer as any).handleCandidatePost(postNode, 'post');

    // Image-only post should get a Detect Now button (renderPending with callback),
    // NOT an unsupported language error.
    expect(renderError).not.toHaveBeenCalled();
    expect(renderPending).toHaveBeenCalledTimes(1);
  });

  it('anchors comment overlays to the exact extracted node', () => {
    const commentNode = document.createElement('article');
    document.body.appendChild(commentNode);

    const renderer = new OverlayRenderer({
      ...defaultUserSettings.settings,
      uiMode: 'simple',
    });

    renderer.renderPending('t1_comment_overlay', commentNode, 'Example comment', vi.fn());

    expect(commentNode.lastElementChild).not.toBeNull();
    expect(commentNode.lastElementChild?.textContent).toBe('Detect Now');
  });

  it('prefers top-level comments for auto_top_n scanning', () => {
    const extractor = new PostExtractor();
    const rootComment = document.createElement('article');
    rootComment.id = 't1_root';
    const rootText = document.createElement('p');
    setInnerText(rootText, 'This is a clear top-level English comment.');
    rootComment.appendChild(rootText);

    const nestedComment = document.createElement('article');
    nestedComment.id = 't1_nested';
    const nestedText = document.createElement('p');
    setInnerText(nestedText, 'This nested reply should be skipped in auto mode.');
    nestedComment.appendChild(nestedText);
    rootComment.appendChild(nestedComment);

    const secondRootComment = document.createElement('article');
    secondRootComment.id = 't1_root_two';
    const secondRootText = document.createElement('p');
    setInnerText(secondRootText, 'This is the second top-level English comment.');
    secondRootComment.appendChild(secondRootText);

    const renderPending = vi.fn();
    const renderError = vi.fn();
    const observer = new FeedObserver(
      createAdapter({
        findPostNodes: () => [],
        findVisibleCommentNodes: () => [rootComment, nestedComment, secondRootComment],
        getCommentId: (node) => node.id || null,
        getCommentTextNode: (node) => node.querySelector('p'),
      }),
      extractor,
      { renderPending, renderError } as unknown as OverlayRenderer,
      { sendAnalyze: vi.fn() } as unknown as ExtensionMessageBus,
      {
        ...defaultUserSettings.settings,
        automaticScanning: false,
        scanComments: 'auto_top_n',
      },
    );

    (observer as any).scanAndProcess();

    expect(renderPending).toHaveBeenCalledTimes(2);
    expect(renderPending).toHaveBeenNthCalledWith(
      1,
      't1_root',
      rootComment,
      'This is a clear top-level English comment.',
      expect.any(Function),
    );
    expect(renderPending).toHaveBeenNthCalledWith(
      2,
      't1_root_two',
      secondRootComment,
      'This is the second top-level English comment.',
      expect.any(Function),
    );
  });

  it('re-processes all visible posts when scanEntirePage is called', () => {
    const extractor = new PostExtractor();
    const postNodes: HTMLElement[] = [];
    const postIds = ['t3_1', 't3_2', 't3_3', 't3_4', 't3_5'];

    for (let i = 0; i < 5; i++) {
      const node = document.createElement('article');
      const textNode = document.createElement('div');
      setInnerText(textNode, `Post content ${i + 1}`);
      node.appendChild(textNode);
      node.setAttribute('data-post-id', postIds[i]);
      postNodes.push(node);
    }

    const adapter = createAdapter({
      findPostNodes: () => postNodes,
      findVisibleCommentNodes: () => [],
      getStablePostId: (node) => node.getAttribute('data-post-id'),
      getPermalink: (node) =>
        `https://www.reddit.com/r/test/comments/${node.getAttribute('data-post-id')?.replace('t3_', '')}/title/`,
      getTextNode: (node) => node.querySelector('div'),
      getAuthorHandle: () => 'u/test',
      getTimestampText: () => '1h ago',
    });

    const extractSpy = vi.spyOn(extractor, 'extract');
    const sendAnalyze = vi.fn();
    const observer = new FeedObserver(
      adapter,
      extractor,
      { renderPending: vi.fn() } as unknown as OverlayRenderer,
      { sendAnalyze } as unknown as ExtensionMessageBus,
      {
        ...defaultUserSettings.settings,
        automaticScanning: true,
        scanComments: 'off',
      },
    );

    observer.scanEntirePage();

    expect(extractSpy).toHaveBeenCalledTimes(5);
    for (let i = 0; i < 5; i++) {
      expect(extractSpy).toHaveBeenNthCalledWith(i + 1, postNodes[i], adapter, 'post');
    }
    expect(sendAnalyze).toHaveBeenCalledTimes(5);
  });

  it('scanEntirePage skips already-seen posts and only processes new ones', () => {
    const extractor = new PostExtractor();
    const postNodes: HTMLElement[] = [];
    const postIds = ['t3_seen1', 't3_seen2', 't3_seen3', 't3_new1', 't3_new2'];

    for (let i = 0; i < 5; i++) {
      const node = document.createElement('article');
      const textNode = document.createElement('div');
      setInnerText(textNode, `Post content ${i + 1}`);
      node.appendChild(textNode);
      node.setAttribute('data-post-id', postIds[i]);
      postNodes.push(node);
    }

    const adapter = createAdapter({
      findPostNodes: () => postNodes,
      findVisibleCommentNodes: () => [],
      getStablePostId: (node) => node.getAttribute('data-post-id'),
      getPermalink: (node) =>
        `https://www.reddit.com/r/test/comments/${node.getAttribute('data-post-id')?.replace('t3_', '')}/title/`,
      getTextNode: (node) => node.querySelector('div'),
      getAuthorHandle: () => 'u/test',
      getTimestampText: () => '1h ago',
    });

    const sendAnalyze = vi.fn();
    const observer = new FeedObserver(
      adapter,
      extractor,
      { renderPending: vi.fn() } as unknown as OverlayRenderer,
      { sendAnalyze } as unknown as ExtensionMessageBus,
      {
        ...defaultUserSettings.settings,
        automaticScanning: true,
        scanComments: 'off',
      },
    );

    (observer as any).seenPostIds.add('t3_seen1');
    (observer as any).seenPostIds.add('t3_seen2');
    (observer as any).seenPostIds.add('t3_seen3');

    observer.scanEntirePage();

    expect(sendAnalyze).toHaveBeenCalledTimes(2);
    expect(sendAnalyze).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ postId: 't3_new1' }),
    );
    expect(sendAnalyze).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ postId: 't3_new2' }),
    );
  });

  it('includes the root node when scanning a comment subtree', () => {
    const adapter = new RedditAdapter();
    const rootComment = document.createElement('article');
    rootComment.id = 't1_root_subtree';
    rootComment.setAttribute('data-testid', 'comment');
    const body = document.createElement('div');
    body.setAttribute('data-testid', 'comment');
    const paragraph = document.createElement('p');
    setInnerText(paragraph, 'Visible root comment');
    body.appendChild(paragraph);
    rootComment.appendChild(body);
    document.body.appendChild(rootComment);

    setVisibleRect(rootComment);
    Object.defineProperty(window, 'getComputedStyle', {
      configurable: true,
      value: () => ({ display: 'block', visibility: 'visible', opacity: '1' } as CSSStyleDeclaration),
    });

    const found = adapter.findVisibleCommentNodes(rootComment, 5);

    expect(found).toContain(rootComment);
  });
});
