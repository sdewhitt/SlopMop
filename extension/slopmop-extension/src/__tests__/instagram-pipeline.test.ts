import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedObserver } from '@src/core/FeedObserver';
import { PostExtractor } from '@src/core/PostExtractor';
import { OverlayRenderer } from '@src/core/OverlayRenderer';
import { InstagramAdapter } from '@src/core/adapters/InstagramAdapter';
import type { SiteAdapter } from '@src/core/adapters/SiteAdapter';
import type { ExtensionMessageBus } from '@src/core/ExtensionMessageBus';
import { ContentType } from '@src/types/domain';
import { defaultUserSettings } from '@src/utils/userSettings';

// run with "npm test -- src/__tests__/instagram-pipeline.test.ts"

function setInnerText(element: HTMLElement, value: string): void {
  Object.defineProperty(element, 'innerText', {
    configurable: true,
    get: () => value,
  });
}

function createAdapter(overrides: Partial<SiteAdapter> = {}): SiteAdapter {
  return {
    getSiteId: () => 'instagram.com',
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

describe('Instagram extraction pipeline', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('extracts normalized text post content from an Instagram post', () => {
    const extractor = new PostExtractor();
    const postNode = document.createElement('article');
    const textNode = document.createElement('span');
    textNode.setAttribute('dir', 'auto');
    setInnerText(textNode, '  Caption with   extra spaces\n\n\n second paragraph  ');
    postNode.appendChild(textNode);

    const adapter = createAdapter({
      getStablePostId: () => 'CxAbCdEfG12',
      getPermalink: () => 'https://www.instagram.com/p/CxAbCdEfG12/',
      getTextNode: () => textNode,
      getAuthorHandle: () => '@photographer',
      getTimestampText: () => '2025-06-15T10:30:00.000Z',
    });

    const extracted = extractor.extract(postNode, adapter, 'post');

    expect(extracted).not.toBeNull();
    expect(extracted).toMatchObject({
      site: 'instagram.com',
      postId: 'CxAbCdEfG12',
      url: 'https://www.instagram.com/p/CxAbCdEfG12/',
      contentType: ContentType.TEXT,
      text: {
        plain: 'Caption with extra spaces\n\nsecond paragraph',
        languageHint: '',
      },
      images: [],
      domContext: {
        authorHandle: '@photographer',
        timestampText: '2025-06-15T10:30:00.000Z',
      },
    });
  });

  it('extracts mixed Instagram post content with image metadata', () => {
    const extractor = new PostExtractor();
    const postNode = document.createElement('article');
    const textNode = document.createElement('span');
    textNode.setAttribute('dir', 'auto');
    setInnerText(textNode, 'Look at this photo');

    const imageNode = document.createElement('img');
    imageNode.src = 'https://scontent-lga3-2.cdninstagram.com/v/photo.jpg?_nc_cat=1';

    const adapter = createAdapter({
      getStablePostId: () => 'DyZxWvUtS98',
      getPermalink: () => 'https://www.instagram.com/p/DyZxWvUtS98/',
      getTextNode: () => textNode,
      getImageNodes: () => [imageNode],
      getAuthorHandle: () => '@artist',
      getTimestampText: () => 'just now',
    });

    const extracted = extractor.extract(postNode, adapter, 'post');

    expect(extracted).not.toBeNull();
    expect(extracted?.contentType).toBe(ContentType.MIXED);
    expect(extracted?.images).toHaveLength(1);
    expect(extracted?.images[0]).toMatchObject({
      bytesBase64: '',
      srcUrl: 'https://scontent-lga3-2.cdninstagram.com/v/photo.jpg?_nc_cat=1',
      mimeType: 'image/jpeg',
    });
    expect(extracted?.images[0].imageId).toBeTruthy();
  });

  it('extracts Instagram comment content into a NormalizedPostContent payload', () => {
    const extractor = new PostExtractor();
    const commentNode = document.createElement('li');
    const commentTextNode = document.createElement('span');
    commentTextNode.setAttribute('dir', 'auto');
    setInnerText(commentTextNode, 'This is a top-level comment on Instagram.');
    commentNode.appendChild(commentTextNode);

    const adapter = createAdapter({
      getCommentId: () => 'ig-comment-abc123',
      getCommentTextNode: () => commentTextNode,
      getCommentPermalink: () => 'https://www.instagram.com/p/CxAbCdEfG12/',
    });

    const extracted = extractor.extract(commentNode, adapter, 'comment');

    expect(extracted).not.toBeNull();
    expect(extracted).toMatchObject({
      site: 'instagram.com',
      postId: 'ig-comment-abc123',
      url: 'https://www.instagram.com/p/CxAbCdEfG12/',
      contentType: ContentType.TEXT,
      text: {
        plain: 'This is a top-level comment on Instagram.',
        languageHint: '',
      },
      images: [],
      domContext: {
        authorHandle: '',
        timestampText: '',
      },
    });
  });

  it('extracts media-only gif comments as image content', () => {
    const extractor = new PostExtractor();
    const adapter = new InstagramAdapter();

    const article = document.createElement('article');
    const postLink = document.createElement('a');
    postLink.href = '/p/CxGifComment01/';
    article.appendChild(postLink);

    const li = document.createElement('li');
    const gif = document.createElement('img');
    gif.src = 'https://media.tenor.com/some-gif-id.gif';
    Object.defineProperty(gif, 'naturalWidth', { value: 160 });
    Object.defineProperty(gif, 'naturalHeight', { value: 120 });
    li.appendChild(gif);
    article.appendChild(li);
    document.body.appendChild(article);

    const extracted = extractor.extract(li, adapter, 'comment');
    expect(extracted).not.toBeNull();
    expect(extracted?.contentType).toBe(ContentType.IMAGE);
    expect(extracted?.images).toHaveLength(1);
    expect(extracted?.images[0].srcUrl).toContain('tenor.com');
    expect(extracted?.postId).toContain('ig-comment-');
  });

  it('extracts image-only Instagram post when there is no caption', () => {
    const extractor = new PostExtractor();
    const postNode = document.createElement('article');

    const imageNode = document.createElement('img');
    imageNode.src = 'https://scontent.fbcdn.net/v/image-only.png';

    const adapter = createAdapter({
      getStablePostId: () => 'AxBcDeFgH01',
      getPermalink: () => 'https://www.instagram.com/p/AxBcDeFgH01/',
      getTextNode: () => null,
      getImageNodes: () => [imageNode],
      getAuthorHandle: () => '@nocaption',
      getTimestampText: () => '3h',
    });

    const extracted = extractor.extract(postNode, adapter, 'post');

    expect(extracted).not.toBeNull();
    expect(extracted?.contentType).toBe(ContentType.IMAGE);
    expect(extracted?.text.plain).toBe('');
    expect(extracted?.images).toHaveLength(1);
    expect(extracted?.images[0].srcUrl).toBe(
      'https://scontent.fbcdn.net/v/image-only.png',
    );
  });

  it('returns null when an Instagram post has neither text nor images', () => {
    const extractor = new PostExtractor();
    const postNode = document.createElement('article');

    const adapter = createAdapter({
      getStablePostId: () => 'EmptyPost01',
      getPermalink: () => 'https://www.instagram.com/p/EmptyPost01/',
      getTextNode: () => null,
      getImageNodes: () => [],
    });

    const extracted = extractor.extract(postNode, adapter, 'post');
    expect(extracted).toBeNull();
  });

  it('derives a stable Instagram post id from the permalink shortcode', () => {
    const adapter = new InstagramAdapter();
    const article = document.createElement('article');
    const link = document.createElement('a');
    link.href = '/p/CxAbCdEfG12/';
    article.appendChild(link);

    expect(adapter.getStablePostId(article)).toBe('CxAbCdEfG12');
  });

  it('derives a stable id from reel permalink shortcode', () => {
    const adapter = new InstagramAdapter();
    const article = document.createElement('article');
    const link = document.createElement('a');
    link.href = '/reel/DaBcDeFgHi9/';
    article.appendChild(link);

    expect(adapter.getStablePostId(article)).toBe('DaBcDeFgHi9');
  });

  it('extracts author handle from Instagram header profile link', () => {
    const adapter = new InstagramAdapter();
    const article = document.createElement('article');
    const header = document.createElement('header');
    const profileLink = document.createElement('a');
    profileLink.href = '/natgeo/';
    setInnerText(profileLink, 'natgeo');
    header.appendChild(profileLink);
    article.appendChild(header);

    expect(adapter.getAuthorHandle(article)).toBe('@natgeo');
  });

  it('filters Instagram content images by CDN host and ignores small avatars', () => {
    const adapter = new InstagramAdapter();
    const article = document.createElement('article');

    // Content image from CDN (not in header)
    const contentImg = document.createElement('img');
    contentImg.src = 'https://scontent-lga3-2.cdninstagram.com/v/photo.jpg';
    Object.defineProperty(contentImg, 'naturalWidth', { value: 1080 });
    Object.defineProperty(contentImg, 'naturalHeight', { value: 1080 });
    article.appendChild(contentImg);

    // Small avatar from CDN (should be filtered by size)
    const avatarImg = document.createElement('img');
    avatarImg.src = 'https://scontent-lga3-2.cdninstagram.com/v/avatar.jpg';
    Object.defineProperty(avatarImg, 'naturalWidth', { value: 32 });
    Object.defineProperty(avatarImg, 'naturalHeight', { value: 32 });
    article.appendChild(avatarImg);

    // Image from unrelated host (should be filtered)
    const otherImg = document.createElement('img');
    otherImg.src = 'https://example.com/random.jpg';
    Object.defineProperty(otherImg, 'naturalWidth', { value: 800 });
    Object.defineProperty(otherImg, 'naturalHeight', { value: 600 });
    article.appendChild(otherImg);

    const images = adapter.getImageNodes(article);
    expect(images).toHaveLength(1);
    expect(images[0].src).toContain('cdninstagram.com');
  });

  it('excludes profile pictures inside the post header from image nodes', () => {
    const adapter = new InstagramAdapter();
    const article = document.createElement('article');

    // Profile picture inside <header> — large enough to pass size filter
    const header = document.createElement('header');
    const profilePic = document.createElement('img');
    profilePic.src = 'https://scontent-lga3-2.cdninstagram.com/v/avatar_large.jpg';
    profilePic.alt = "user's profile picture";
    Object.defineProperty(profilePic, 'naturalWidth', { value: 150 });
    Object.defineProperty(profilePic, 'naturalHeight', { value: 150 });
    header.appendChild(profilePic);
    article.appendChild(header);

    // Actual post content image
    const contentImg = document.createElement('img');
    contentImg.src = 'https://scontent-lga3-2.cdninstagram.com/v/post_photo.jpg';
    Object.defineProperty(contentImg, 'naturalWidth', { value: 1080 });
    Object.defineProperty(contentImg, 'naturalHeight', { value: 1080 });
    article.appendChild(contentImg);

    const images = adapter.getImageNodes(article);
    expect(images).toHaveLength(1);
    expect(images[0].src).toContain('post_photo.jpg');
  });

  it('excludes images with profile picture alt text', () => {
    const adapter = new InstagramAdapter();
    const article = document.createElement('article');

    const profilePic = document.createElement('img');
    profilePic.src = 'https://scontent-lga3-2.cdninstagram.com/v/avatar.jpg';
    profilePic.alt = "natgeo's profile picture";
    Object.defineProperty(profilePic, 'naturalWidth', { value: 150 });
    Object.defineProperty(profilePic, 'naturalHeight', { value: 150 });
    article.appendChild(profilePic);

    const images = adapter.getImageNodes(article);
    expect(images).toHaveLength(0);
  });

  it('only finds articles with a post permalink as feed posts', () => {
    const adapter = new InstagramAdapter();

    // Article with a post link — should be found
    const feedPost = document.createElement('article');
    const postLink = document.createElement('a');
    postLink.href = '/p/CxAbCdEfG12/';
    feedPost.appendChild(postLink);
    document.body.appendChild(feedPost);

    // Article without a post link (e.g. stories tray) — should be ignored
    const nonPost = document.createElement('article');
    const randomSpan = document.createElement('span');
    setInnerText(randomSpan, 'Some UI text');
    nonPost.appendChild(randomSpan);
    document.body.appendChild(nonPost);

    const found = adapter.findPostNodes(document);
    expect(found).toHaveLength(1);
    expect(found[0]).toBe(feedPost);
  });

  it('excludes articles containing story links from feed posts', () => {
    const adapter = new InstagramAdapter();

    // Article that is part of the stories tray — has both a /p/ link and a /stories/ link
    const storyArticle = document.createElement('article');
    const storyLink = document.createElement('a');
    storyLink.href = '/stories/someuser/';
    storyArticle.appendChild(storyLink);
    // Some story containers may also contain /p/ links
    const postLink = document.createElement('a');
    postLink.href = '/p/CxAbCdEfG12/';
    storyArticle.appendChild(postLink);
    document.body.appendChild(storyArticle);

    // Normal feed post without story links
    const feedPost = document.createElement('article');
    const feedLink = document.createElement('a');
    feedLink.href = '/p/NormalPost01/';
    feedPost.appendChild(feedLink);
    document.body.appendChild(feedPost);

    const found = adapter.findPostNodes(document);
    expect(found).toHaveLength(1);
    expect(found[0]).toBe(feedPost);
  });

  it('excludes story icon images from image nodes', () => {
    const adapter = new InstagramAdapter();
    const article = document.createElement('article');

    // Story icon image with "story" alt text
    const storyIcon = document.createElement('img');
    storyIcon.src = 'https://scontent-lga3-2.cdninstagram.com/v/story_thumb.jpg';
    storyIcon.alt = "someuser's story";
    Object.defineProperty(storyIcon, 'naturalWidth', { value: 200 });
    Object.defineProperty(storyIcon, 'naturalHeight', { value: 200 });
    article.appendChild(storyIcon);

    // Story icon inside a /stories/ link
    const storyLink = document.createElement('a');
    storyLink.href = '/stories/otheruser/';
    const storyLinkImg = document.createElement('img');
    storyLinkImg.src = 'https://scontent-lga3-2.cdninstagram.com/v/story_circle.jpg';
    Object.defineProperty(storyLinkImg, 'naturalWidth', { value: 200 });
    Object.defineProperty(storyLinkImg, 'naturalHeight', { value: 200 });
    storyLink.appendChild(storyLinkImg);
    article.appendChild(storyLink);

    // Actual post content image
    const contentImg = document.createElement('img');
    contentImg.src = 'https://scontent-lga3-2.cdninstagram.com/v/post_photo.jpg';
    Object.defineProperty(contentImg, 'naturalWidth', { value: 1080 });
    Object.defineProperty(contentImg, 'naturalHeight', { value: 1080 });
    article.appendChild(contentImg);

    const images = adapter.getImageNodes(article);
    expect(images).toHaveLength(1);
    expect(images[0].src).toContain('post_photo.jpg');
  });

  it('retries analysis with the original extracted Instagram payload', () => {
    const extractor = new PostExtractor();
    const postNode = document.createElement('article');
    const textNode = document.createElement('span');
    textNode.setAttribute('dir', 'auto');
    setInnerText(textNode, 'Retry this Instagram post');
    postNode.appendChild(textNode);

    const adapter = createAdapter({
      getStablePostId: () => 'RetryIg001',
      getPermalink: () => 'https://www.instagram.com/p/RetryIg001/',
      getTextNode: () => textNode,
      getAuthorHandle: () => '@retryuser',
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

    expect(observer.retryAnalyze('RetryIg001')).toBe(true);
    expect(sendAnalyze).toHaveBeenCalledTimes(2);
    expect(sendAnalyze.mock.calls[1][0]).toEqual(originalPayload);
  });

  it('does not collapse instagram visible comments to a single top-level comment in auto mode', () => {
    const extractor = new PostExtractor();

    const commentOne = document.createElement('li');
    commentOne.id = 'ig-comment-1';
    const textOne = document.createElement('span');
    textOne.setAttribute('dir', 'auto');
    setInnerText(textOne, 'First visible comment.');
    commentOne.appendChild(textOne);

    const commentTwo = document.createElement('li');
    commentTwo.id = 'ig-comment-2';
    const textTwo = document.createElement('span');
    textTwo.setAttribute('dir', 'auto');
    setInnerText(textTwo, 'Second visible comment.');
    commentTwo.appendChild(textTwo);

    const commentThree = document.createElement('li');
    commentThree.id = 'ig-comment-3';
    const textThree = document.createElement('span');
    textThree.setAttribute('dir', 'auto');
    setInnerText(textThree, 'Third visible comment.');
    commentThree.appendChild(textThree);

    const renderPending = vi.fn();
    const renderError = vi.fn();
    const observer = new FeedObserver(
      createAdapter({
        getSiteId: () => 'instagram.com',
        findPostNodes: () => [],
        findVisibleCommentNodes: () => [commentOne, commentTwo, commentThree],
        getCommentId: (node) => node.id || null,
        getCommentTextNode: (node) => node.querySelector('span'),
        getCommentPermalink: () => 'https://www.instagram.com/p/AutoCommentPost01/',
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

    expect(renderPending).toHaveBeenCalledTimes(3);
    expect(renderPending).toHaveBeenNthCalledWith(
      1,
      'ig-comment-1',
      commentOne,
      'First visible comment.',
      undefined,
      expect.any(HTMLElement),
    );
    expect(renderPending).toHaveBeenNthCalledWith(
      2,
      'ig-comment-2',
      commentTwo,
      'Second visible comment.',
      undefined,
      expect.any(HTMLElement),
    );
    expect(renderPending).toHaveBeenNthCalledWith(
      3,
      'ig-comment-3',
      commentThree,
      'Third visible comment.',
      undefined,
      expect.any(HTMLElement),
    );
  });

  it('processes all visible instagram comments beyond 20 while scrolling', () => {
    const extractor = new PostExtractor();
    const comments: HTMLElement[] = [];

    for (let i = 0; i < 25; i++) {
      const li = document.createElement('li');
      li.id = `ig-visible-${i}`;
      const span = document.createElement('span');
      span.setAttribute('dir', 'auto');
      setInnerText(span, `Visible comment ${i}`);
      li.appendChild(span);
      comments.push(li);
    }

    const renderPending = vi.fn();
    const renderError = vi.fn();
    const observer = new FeedObserver(
      createAdapter({
        getSiteId: () => 'instagram.com',
        findPostNodes: () => [],
        findVisibleCommentNodes: () => comments,
        getCommentId: (node) => node.id || null,
        getCommentTextNode: (node) => node.querySelector('span'),
        getCommentPermalink: () => 'https://www.instagram.com/p/AllVisibleComments01/',
      }),
      extractor,
      { renderPending, renderError } as unknown as OverlayRenderer,
      { sendAnalyze: vi.fn() } as unknown as ExtensionMessageBus,
      {
        ...defaultUserSettings.settings,
        automaticScanning: false,
        scanComments: 'user_triggered',
      },
    );

    (observer as any).scanAndProcess();

    expect(renderPending).toHaveBeenCalledTimes(25);
  });

  it('extracts top 25 comment nodes at depth 1 via findVisibleCommentNodes', () => {
    const adapter = new InstagramAdapter();
    // Comments must live inside a feed post article (one with a /p/ link)
    const article = document.createElement('article');
    const postLink = document.createElement('a');
    postLink.href = '/p/TestComments01/';
    article.appendChild(postLink);

    const ul = document.createElement('ul');

    for (let i = 0; i < 30; i++) {
      const li = document.createElement('li');
      const span = document.createElement('span');
      span.setAttribute('dir', 'auto');
      setInnerText(span, `Comment number ${i}`);
      li.appendChild(span);
      // Make visually visible (non-zero bounding rect)
      Object.defineProperty(li, 'getBoundingClientRect', {
        value: () => ({ width: 400, height: 50, top: 10, bottom: 60, left: 0, right: 400 }),
      });
      ul.appendChild(li);
    }
    article.appendChild(ul);
    document.body.appendChild(article);

    const comments = adapter.findVisibleCommentNodes(document, 25);
    expect(comments.length).toBeLessThanOrEqual(25);
    expect(comments.length).toBeGreaterThan(0);
  });

  it('does not pick up story tray items as comment nodes', () => {
    const adapter = new InstagramAdapter();

    // Stories tray: a <ul> of <li> items at the top of the page, NOT inside
    // a feed-post article. Each has a username span and a /stories/ link.
    const storySection = document.createElement('section');
    const storyUl = document.createElement('ul');
    for (let i = 0; i < 8; i++) {
      const li = document.createElement('li');
      const link = document.createElement('a');
      link.href = `/stories/user${i}/`;
      const span = document.createElement('span');
      setInnerText(span, `user${i}`);
      link.appendChild(span);
      li.appendChild(link);
      Object.defineProperty(li, 'getBoundingClientRect', {
        value: () => ({ width: 66, height: 86, top: 10, bottom: 96, left: 0, right: 66 }),
      });
      storyUl.appendChild(li);
    }
    storySection.appendChild(storyUl);
    document.body.appendChild(storySection);

    const comments = adapter.findVisibleCommentNodes(document, 25);
    expect(comments).toHaveLength(0);
  });

  it('does not treat View replies/Hide replies rows as comments', () => {
    const adapter = new InstagramAdapter();

    const article = document.createElement('article');
    const postLink = document.createElement('a');
    postLink.href = '/p/ReplyToggle01/';
    article.appendChild(postLink);

    const ul = document.createElement('ul');

    const viewRepliesLi = document.createElement('li');
    const viewRepliesSpan = document.createElement('span');
    setInnerText(viewRepliesSpan, 'View replies');
    viewRepliesLi.appendChild(viewRepliesSpan);
    Object.defineProperty(viewRepliesLi, 'getBoundingClientRect', {
      value: () => ({ width: 250, height: 30, top: 20, bottom: 50, left: 0, right: 250 }),
    });
    ul.appendChild(viewRepliesLi);

    const hideRepliesLi = document.createElement('li');
    const hideRepliesSpan = document.createElement('span');
    setInnerText(hideRepliesSpan, 'Hide replies');
    hideRepliesLi.appendChild(hideRepliesSpan);
    Object.defineProperty(hideRepliesLi, 'getBoundingClientRect', {
      value: () => ({ width: 250, height: 30, top: 60, bottom: 90, left: 0, right: 250 }),
    });
    ul.appendChild(hideRepliesLi);

    const actualCommentLi = document.createElement('li');
    const actualCommentSpan = document.createElement('span');
    actualCommentSpan.setAttribute('dir', 'auto');
    setInnerText(actualCommentSpan, 'This is an actual comment.');
    actualCommentLi.appendChild(actualCommentSpan);
    Object.defineProperty(actualCommentLi, 'getBoundingClientRect', {
      value: () => ({ width: 400, height: 40, top: 100, bottom: 140, left: 0, right: 400 }),
    });
    ul.appendChild(actualCommentLi);

    article.appendChild(ul);
    document.body.appendChild(article);

    const comments = adapter.findVisibleCommentNodes(document, 25);
    expect(comments).toHaveLength(1);
    expect(comments[0]).toBe(actualCommentLi);
  });

  it('finds visible comments inside an instagram post dialog', () => {
    const adapter = new InstagramAdapter();

    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');

    const permalink = document.createElement('a');
    permalink.href = '/p/DialogPost01/';
    dialog.appendChild(permalink);

    const list = document.createElement('ul');
    list.setAttribute('role', 'list');
    const comment = document.createElement('li');
    comment.setAttribute('role', 'listitem');
    const span = document.createElement('span');
    span.setAttribute('dir', 'auto');
    setInnerText(span, 'Dialog comment should be detected');
    comment.appendChild(span);
    Object.defineProperty(comment, 'getBoundingClientRect', {
      value: () => ({ width: 400, height: 40, top: 10, bottom: 50, left: 0, right: 400 }),
    });
    list.appendChild(comment);
    dialog.appendChild(list);
    document.body.appendChild(dialog);

    const comments = adapter.findVisibleCommentNodes(document, 25);
    expect(comments).toHaveLength(1);
    expect(comments[0]).toBe(comment);
  });

  it('creates distinct comment ids for visible comments with identical text', () => {
    const adapter = new InstagramAdapter();

    const article = document.createElement('article');
    const postLink = document.createElement('a');
    postLink.href = '/p/SameTextPost01/';
    article.appendChild(postLink);

    const ul = document.createElement('ul');
    for (let i = 0; i < 2; i++) {
      const li = document.createElement('li');
      const author = document.createElement('a');
      author.href = i === 0 ? '/author_one/' : '/author_two/';
      li.appendChild(author);

      const span = document.createElement('span');
      span.setAttribute('dir', 'auto');
      setInnerText(span, 'Same text');
      li.appendChild(span);

      Object.defineProperty(li, 'getBoundingClientRect', {
        value: () => ({ width: 380, height: 36, top: 8, bottom: 44, left: 0, right: 380 }),
      });
      ul.appendChild(li);
    }

    article.appendChild(ul);
    document.body.appendChild(article);

    const comments = adapter.findVisibleCommentNodes(document, 25);
    expect(comments).toHaveLength(2);

    const firstId = adapter.getCommentId(comments[0]);
    const secondId = adapter.getCommentId(comments[1]);
    expect(firstId).toBeTruthy();
    expect(secondId).toBeTruthy();
    expect(firstId).not.toBe(secondId);
  });

  it('finds explore-page grid items that are not wrapped in <article>', () => {
    const adapter = new InstagramAdapter();

    // Explore grid: each tile is a <div> containing an <a href="/p/...">
    // with an <img> inside — no <article> wrapper.
    const grid = document.createElement('div');
    for (const code of ['ExploreA01', 'ExploreB02', 'ExploreC03']) {
      const cell = document.createElement('div');
      const link = document.createElement('a');
      link.href = `/p/${code}/`;
      const img = document.createElement('img');
      img.src = 'https://scontent.cdninstagram.com/v/thumb.jpg';
      link.appendChild(img);
      cell.appendChild(link);
      grid.appendChild(cell);
    }
    document.body.appendChild(grid);

    const found = adapter.findPostNodes(document);
    expect(found).toHaveLength(3);
  });

  it('does not duplicate explore grid items already inside an <article>', () => {
    const adapter = new InstagramAdapter();

    // A normal feed article with a /p/ link
    const article = document.createElement('article');
    const link = document.createElement('a');
    link.href = '/p/FeedPost01/';
    article.appendChild(link);
    document.body.appendChild(article);

    const found = adapter.findPostNodes(document);
    expect(found).toHaveLength(1);
    expect(found[0]).toBe(article);
  });

  it('returns the post shortcode as stable id for explore grid items', () => {
    const adapter = new InstagramAdapter();

    const cell = document.createElement('div');
    const link = document.createElement('a');
    link.href = '/p/ExplGridId1/';
    cell.appendChild(link);
    document.body.appendChild(cell);

    expect(adapter.getStablePostId(cell)).toBe('ExplGridId1');
  });

  it('extracts CDN images from explore grid items', () => {
    const adapter = new InstagramAdapter();

    const cell = document.createElement('div');
    const link = document.createElement('a');
    link.href = '/p/ExplImg01/';
    const img = document.createElement('img');
    img.src = 'https://scontent-lga3-2.cdninstagram.com/v/explore_thumb.jpg';
    Object.defineProperty(img, 'naturalWidth', { value: 640 });
    Object.defineProperty(img, 'naturalHeight', { value: 640 });
    link.appendChild(img);
    cell.appendChild(link);

    const images = adapter.getImageNodes(cell);
    expect(images).toHaveLength(1);
    expect(images[0].src).toContain('explore_thumb.jpg');
  });

  it('extracts video-only explore reel tiles as media posts', () => {
    const adapter = new InstagramAdapter();
    const extractor = new PostExtractor();

    const cell = document.createElement('div');
    const link = document.createElement('a');
    link.href = '/reel/ExploreVideo01/';
    const video = document.createElement('video');
    video.src =
      'https://scontent-sea1-1.cdninstagram.com/o1/v/t16/f2/m69/sample.mp4';
    link.appendChild(video);
    cell.appendChild(link);
    document.body.appendChild(cell);

    const extracted = extractor.extract(cell, adapter, 'post');
    expect(extracted).not.toBeNull();
    expect(extracted?.postId).toBe('ExploreVideo01');
    expect(extracted?.url).toContain('/reel/ExploreVideo01/');
    expect(extracted?.contentType).toBe(ContentType.IMAGE);
  });

  it('finds explore video tiles without permalink anchors', () => {
    const adapter = new InstagramAdapter();

    const outer = document.createElement('div');
    outer.setAttribute('style', 'max-height: 372px; max-width: 209px; aspect-ratio: 720 / 1280;');
    const mediaWrap = document.createElement('div');
    const video = document.createElement('video');
    video.src =
      'https://scontent-sea1-1.cdninstagram.com/o1/v/t16/f2/m69/no-anchor-sample.mp4';
    mediaWrap.appendChild(video);
    outer.appendChild(mediaWrap);
    document.body.appendChild(outer);

    const found = adapter.findPostNodes(document);
    expect(found).toContain(outer);

    const stableId = adapter.getStablePostId(outer);
    expect(stableId).toBeTruthy();
  });

  it('does not return duplicate hosts when a video reel tile has both anchor and video paths', () => {
    const adapter = new InstagramAdapter();

    const outer = document.createElement('div');
    outer.setAttribute('style', 'max-height: 372px; max-width: 209px; aspect-ratio: 720 / 1280;');

    const inner = document.createElement('div');
    const link = document.createElement('a');
    link.href = '/reel/DedupVideo01/';
    const video = document.createElement('video');
    video.src =
      'https://scontent-sea1-1.cdninstagram.com/o1/v/t16/f2/m69/dedup-sample.mp4';

    link.appendChild(video);
    inner.appendChild(link);
    outer.appendChild(inner);
    document.body.appendChild(outer);

    const found = adapter.findPostNodes(document);
    expect(found).toHaveLength(1);
  });

  it('ignores explore grid story links', () => {
    const adapter = new InstagramAdapter();

    // A link to /stories/ should not be picked up as an explore grid item
    const cell = document.createElement('div');
    const link = document.createElement('a');
    link.href = '/stories/someuser/';
    cell.appendChild(link);
    document.body.appendChild(cell);

    // A link to /p/ that also has a /stories/ ancestor shouldn't either
    // but that's covered by the article-stories test above

    const found = adapter.findPostNodes(document);
    expect(found).toHaveLength(0);
  });

  it('finds instagram modal dialog posts opened from search grid', () => {
    const adapter = new InstagramAdapter();

    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const mediaHost = document.createElement('div');
    const video = document.createElement('video');
    mediaHost.appendChild(video);
    dialog.appendChild(mediaHost);
    const permalink = document.createElement('a');
    permalink.href = '/reel/ModalPost01/';
    dialog.appendChild(permalink);
    document.body.appendChild(dialog);

    Object.defineProperty(mediaHost, 'getBoundingClientRect', {
      value: () => ({ width: 420, height: 720, top: 0, bottom: 720, left: 0, right: 420 }),
    });

    const found = adapter.findPostNodes(document);
    expect(found).toContain(mediaHost);
    expect(found).not.toContain(dialog);
  });

  it('prefers dialog media host over overlapping non-dialog reel host', () => {
    const adapter = new InstagramAdapter();

    const outer = document.createElement('div');
    outer.setAttribute('style', 'max-height: 372px; max-width: 209px; aspect-ratio: 720 / 1280;');
    const feedLink = document.createElement('a');
    feedLink.href = '/reel/OverlapVideo01/';
    const feedVideo = document.createElement('video');
    feedVideo.src =
      'https://scontent-sea1-1.cdninstagram.com/o1/v/t16/f2/m69/overlap-feed.mp4';
    feedLink.appendChild(feedVideo);
    outer.appendChild(feedLink);

    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const mediaHost = document.createElement('div');
    const dialogVideo = document.createElement('video');
    dialogVideo.src =
      'https://scontent-sea1-1.cdninstagram.com/o1/v/t16/f2/m69/overlap-dialog.mp4';
    mediaHost.appendChild(dialogVideo);
    dialog.appendChild(mediaHost);
    const permalink = document.createElement('a');
    permalink.href = '/reel/OverlapVideo01/';
    dialog.appendChild(permalink);

    // Keep dialog nested here to model overlap where non-dialog host can enclose it.
    outer.appendChild(dialog);
    document.body.appendChild(outer);

    Object.defineProperty(mediaHost, 'getBoundingClientRect', {
      value: () => ({ width: 420, height: 720, top: 0, bottom: 720, left: 0, right: 420 }),
    });

    const found = adapter.findPostNodes(document);
    expect(found).toContain(mediaHost);
    expect(found).not.toContain(outer);
  });

  it('does not return modal article nodes when dialog media host is present', () => {
    const adapter = new InstagramAdapter();

    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');

    const article = document.createElement('article');
    const mediaHost = document.createElement('div');
    const video = document.createElement('video');
    mediaHost.appendChild(video);
    article.appendChild(mediaHost);

    const permalink = document.createElement('a');
    permalink.href = '/reel/ModalPostArticle01/';
    article.appendChild(permalink);
    dialog.appendChild(article);
    document.body.appendChild(dialog);

    Object.defineProperty(mediaHost, 'getBoundingClientRect', {
      value: () => ({ width: 420, height: 720, top: 0, bottom: 720, left: 0, right: 420 }),
    });

    const found = adapter.findPostNodes(document);
    expect(found).toContain(mediaHost);
    expect(found).not.toContain(article);
  });

  it('scans modal dialog comments when they are visible', () => {
    const adapter = new InstagramAdapter();

    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const article = document.createElement('article');
    const permalink = document.createElement('a');
    permalink.href = '/p/ModalCommentPost01/';
    article.appendChild(permalink);

    const ul = document.createElement('ul');
    const li = document.createElement('li');
    const span = document.createElement('span');
    span.setAttribute('dir', 'auto');
    setInnerText(span, 'This modal comment should not be auto-scanned.');
    li.appendChild(span);
    Object.defineProperty(li, 'getBoundingClientRect', {
      value: () => ({ width: 400, height: 40, top: 12, bottom: 52, left: 0, right: 400 }),
    });
    ul.appendChild(li);
    article.appendChild(ul);
    dialog.appendChild(article);
    document.body.appendChild(dialog);

    const comments = adapter.findVisibleCommentNodes(document, 25);
    expect(comments).toHaveLength(1);
    expect(comments[0]).toBe(li);
  });

  it('extracts caption text from modal dialog scope when media node has only blob video', () => {
    const adapter = new InstagramAdapter();
    const extractor = new PostExtractor();

    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');

    // Left media pane node that FeedObserver may process.
    const mediaPane = document.createElement('div');
    const video = document.createElement('video');
    video.src = 'blob:https://www.instagram.com/abcd-1234';
    mediaPane.appendChild(video);

    // Right pane has permalink + caption text.
    const permalink = document.createElement('a');
    permalink.href = '/reel/ModalPost02/';
    const caption = document.createElement('span');
    caption.setAttribute('dir', 'auto');
    setInnerText(caption, 'This modal caption should still be detected.');

    dialog.appendChild(mediaPane);
    dialog.appendChild(permalink);
    dialog.appendChild(caption);
    document.body.appendChild(dialog);

    const extracted = extractor.extract(mediaPane, adapter, 'post');
    expect(extracted).not.toBeNull();
    expect(extracted?.postId).toBe('ModalPost02');
    expect(extracted?.contentType).toBe(ContentType.TEXT);
    expect(extracted?.text.plain).toContain('modal caption');
  });

  it('prefers modal caption heading over longer comment text', () => {
    const adapter = new InstagramAdapter();
    const extractor = new PostExtractor();

    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');

    const mediaPane = document.createElement('div');
    const video = document.createElement('video');
    video.src = 'blob:https://www.instagram.com/efgh-5678';
    mediaPane.appendChild(video);

    const permalink = document.createElement('a');
    permalink.href = '/reel/ModalPost03/';

    const captionHeading = document.createElement('h1');
    setInnerText(captionHeading, 'Short caption');

    const commentSpan = document.createElement('span');
    commentSpan.setAttribute('dir', 'auto');
    setInnerText(
      commentSpan,
      'This is a much longer comment that should not be used as post text extraction in modal view.',
    );

    dialog.appendChild(mediaPane);
    dialog.appendChild(permalink);
    dialog.appendChild(captionHeading);
    dialog.appendChild(commentSpan);
    document.body.appendChild(dialog);

    const extracted = extractor.extract(mediaPane, adapter, 'post');
    expect(extracted).not.toBeNull();
    expect(extracted?.postId).toBe('ModalPost03');
    expect(extracted?.text.plain).toBe('Short caption');
  });
});
