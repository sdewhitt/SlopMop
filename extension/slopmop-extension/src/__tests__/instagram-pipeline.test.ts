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
});
