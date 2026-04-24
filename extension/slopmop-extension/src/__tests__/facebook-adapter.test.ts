import { beforeEach, describe, expect, it } from 'vitest';
import { FacebookAdapter } from '@src/core/adapters/FacebookAdapter';
import { defaultUserSettings } from '@src/utils/userSettings';
import type { DetectionSettings } from '@src/utils/userSettings';

/**
 * jsdom's layout shim does not reflect CSS, so innerText mirrors textContent.
 * Match the convention used by other adapter tests and force an explicit innerText
 * value whenever we rely on it for extraction.
 */
function setInnerText(element: HTMLElement, value: string): void {
  Object.defineProperty(element, 'innerText', {
    configurable: true,
    get: () => value,
  });
}

// ── Platform gate (content-script logic) ───────────────────────────────

function shouldRunOnCurrentSite(hostname: string, settings: DetectionSettings): boolean {
  if (hostname.includes('reddit.com')) return settings.platforms.reddit;
  if (hostname.includes('instagram.com')) return settings.platforms.instagram;
  if (hostname.includes('twitter.com') || hostname.includes('x.com')) return settings.platforms.twitter;
  if (hostname.includes('facebook.com')) return settings.platforms.facebook;
  if (hostname.includes('youtube.com')) return settings.platforms.youtube;
  if (hostname.includes('linkedin.com')) return settings.platforms.linkedin;
  return false;
}

// ── Fixture builders ───────────────────────────────────────────────────

/**
 * Approximates a current Facebook Comet feed story:
 *   <div role="feed">
 *     <div role="article" aria-posinset="1">
 *       <h3><a href="/charlie.xyz/">Charlie XYZ</a></h3>
 *       <a aria-label="3 hours ago" href="/charlie.xyz/posts/pfbidABC123">…</a>
 *       <div data-ad-comet-preview="message">
 *         <div dir="auto">Post body text that is long enough to qualify…</div>
 *       </div>
 *     </div>
 *   </div>
 */
function buildFeedStory(opts: {
  permalink?: string;
  message: string;
  author?: string;
  ariaPosinset?: string;
  timestampAriaLabel?: string;
}): HTMLElement {
  const feed = document.createElement('div');
  feed.setAttribute('role', 'feed');

  const article = document.createElement('div');
  article.setAttribute('role', 'article');
  if (opts.ariaPosinset) article.setAttribute('aria-posinset', opts.ariaPosinset);

  const header = document.createElement('h3');
  const authorLink = document.createElement('a');
  authorLink.setAttribute('role', 'link');
  authorLink.href = '/charlie.xyz/';
  const authorName = opts.author ?? 'Charlie XYZ';
  authorLink.textContent = authorName;
  setInnerText(authorLink, authorName);
  header.appendChild(authorLink);

  const tsLink = document.createElement('a');
  tsLink.href = opts.permalink ?? '/charlie.xyz/posts/pfbidABC123';
  tsLink.setAttribute('aria-label', opts.timestampAriaLabel ?? '3 hours ago');
  tsLink.textContent = '3h';

  const messageHost = document.createElement('div');
  messageHost.setAttribute('data-ad-comet-preview', 'message');
  const messageBody = document.createElement('div');
  messageBody.setAttribute('dir', 'auto');
  messageBody.textContent = opts.message;
  setInnerText(messageBody, opts.message);
  messageHost.appendChild(messageBody);
  setInnerText(messageHost, opts.message);

  article.appendChild(header);
  article.appendChild(tsLink);
  article.appendChild(messageHost);
  feed.appendChild(article);
  return feed;
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('FacebookAdapter', () => {
  let adapter: FacebookAdapter;

  beforeEach(() => {
    document.body.innerHTML = '';
    window.history.replaceState({}, '', '/');
    adapter = new FacebookAdapter();
  });

  it('returns facebook.com as site id', () => {
    expect(adapter.getSiteId()).toBe('facebook.com');
  });

  it('finds a feed story and extracts text + stable pfbid post id', () => {
    document.body.appendChild(
      buildFeedStory({
        message: 'This is a sufficiently long Facebook post body so detection can run.',
        permalink: '/charlie.xyz/posts/pfbid0ABCDEFGHIJKLMNOP',
      }),
    );

    const posts = adapter.findPostNodes(document);
    expect(posts).toHaveLength(1);
    expect(posts[0].getAttribute('role')).toBe('article');

    const textNode = adapter.getTextNode(posts[0]);
    expect(textNode).not.toBeNull();
    expect(textNode!.innerText).toMatch(/Facebook post/);

    const id = adapter.getStablePostId(posts[0]);
    expect(id).toBe('fb-pfbid0ABCDEFGHIJKLMNOP');
  });

  it('parses numeric /posts/ id when pfbid is absent', () => {
    const feed = buildFeedStory({
      message: 'Classic numeric permalink story body long enough to register.',
      permalink: '/charlie.xyz/posts/1234567890',
    });
    document.body.appendChild(feed);

    const post = adapter.findPostNodes(document)[0];
    expect(adapter.getStablePostId(post)).toBe('fb-1234567890');
  });

  it('parses story_fbid= query param for feed-fallback permalinks', () => {
    const feed = buildFeedStory({
      message: 'A second Facebook post body that is long enough to register.',
      permalink: '/permalink.php?story_fbid=9988776655&id=111',
    });
    document.body.appendChild(feed);

    const post = adapter.findPostNodes(document)[0];
    expect(adapter.getStablePostId(post)).toBe('fb-9988776655');
  });

  it('returns the SAME stable id across virtualized re-mounts of the same story', () => {
    document.body.appendChild(
      buildFeedStory({
        message: 'Virtualized feed mount A — long enough to qualify for detection.',
        permalink: '/charlie.xyz/posts/pfbid0SAMEPOST',
      }),
    );
    const firstId = adapter.getStablePostId(adapter.findPostNodes(document)[0]);

    // Simulate scroll recycling: wipe + re-render the same logical story.
    document.body.innerHTML = '';
    document.body.appendChild(
      buildFeedStory({
        message: 'Virtualized feed mount A — long enough to qualify for detection.',
        permalink: '/charlie.xyz/posts/pfbid0SAMEPOST',
      }),
    );
    const secondId = adapter.getStablePostId(adapter.findPostNodes(document)[0]);

    expect(firstId).toBe(secondId);
    expect(firstId).toBe('fb-pfbid0SAMEPOST');
  });

  it('keeps only the outermost article when a shared/quoted post nests inside', () => {
    const outer = document.createElement('div');
    outer.setAttribute('role', 'article');
    const outerMsg = document.createElement('div');
    outerMsg.setAttribute('data-ad-comet-preview', 'message');
    setInnerText(outerMsg, 'Outer story body');
    outer.appendChild(outerMsg);
    const outerLink = document.createElement('a');
    outerLink.href = '/me/posts/pfbid0OUTER';
    outer.appendChild(outerLink);

    const inner = document.createElement('div');
    inner.setAttribute('role', 'article');
    const innerMsg = document.createElement('div');
    innerMsg.setAttribute('data-ad-comet-preview', 'message');
    setInnerText(innerMsg, 'Quoted inner story body');
    inner.appendChild(innerMsg);
    const innerLink = document.createElement('a');
    innerLink.href = '/someone/posts/pfbid0INNER';
    inner.appendChild(innerLink);

    outer.appendChild(inner);
    document.body.appendChild(outer);

    const found = adapter.findPostNodes(document);
    expect(found).toHaveLength(1);
    expect(found[0]).toBe(outer);
  });

  it('skips Sponsored / Suggested cards via aria-label', () => {
    const feed = buildFeedStory({
      message: 'Sponsored body text that would otherwise look like a real post.',
      permalink: '/ads.xyz/posts/pfbid0ADCARD',
    });
    const article = feed.querySelector('div[role="article"]') as HTMLElement;
    article.setAttribute('aria-label', 'Sponsored');
    document.body.appendChild(feed);

    expect(adapter.findPostNodes(document)).toHaveLength(0);
  });

  it('resolves Sponsored through aria-labelledby reference', () => {
    const feed = buildFeedStory({
      message: 'Paid partnership body text long enough to normally register.',
      permalink: '/ads.xyz/posts/pfbid0REFAD',
    });
    const article = feed.querySelector('div[role="article"]') as HTMLElement;
    const labelEl = document.createElement('span');
    labelEl.id = 'ad-label-1';
    labelEl.textContent = 'Sponsored';
    article.setAttribute('aria-labelledby', 'ad-label-1');
    article.appendChild(labelEl);
    document.body.appendChild(feed);

    expect(adapter.findPostNodes(document)).toHaveLength(0);
  });

  it('skips article-like nodes that are not real posts (no permalink and no message host)', () => {
    // Facebook sometimes mounts `div[role="article"]` for comments and chrome; without the
    // post-shape markers we should not render badges on them.
    const bogus = document.createElement('div');
    bogus.setAttribute('role', 'article');
    const span = document.createElement('span');
    span.textContent = 'Some text that is not a real post';
    bogus.appendChild(span);
    document.body.appendChild(bogus);

    expect(adapter.findPostNodes(document)).toHaveLength(0);
  });

  it('extracts author handle from the h3 anchor inside the header', () => {
    document.body.appendChild(
      buildFeedStory({
        message: 'Post body to exercise the author extraction path. Long enough.',
        author: 'Ada Lovelace',
      }),
    );
    const post = adapter.findPostNodes(document)[0];
    expect(adapter.getAuthorHandle(post)).toBe('Ada Lovelace');
  });

  it('prefers timestamp anchor aria-label for getTimestampText', () => {
    document.body.appendChild(
      buildFeedStory({
        message: 'Body used to validate timestamp extraction, sufficiently long.',
        timestampAriaLabel: 'Saturday at 4:12 PM',
      }),
    );
    const post = adapter.findPostNodes(document)[0];
    expect(adapter.getTimestampText(post)).toBe('Saturday at 4:12 PM');
  });

  it('returns no comments (out of scope) for any node', () => {
    document.body.appendChild(
      buildFeedStory({
        message: 'Body used to validate comment stubs, also sufficiently long.',
      }),
    );
    const post = adapter.findPostNodes(document)[0];

    expect(adapter.findVisibleCommentNodes(document)).toEqual([]);
    expect(adapter.getCommentId(post)).toBeNull();
    expect(adapter.getCommentTextNode(post)).toBeNull();
    expect(adapter.getCommentPermalink(post)).toBeNull();
  });

  it('falls back to fb-fallback hash when permalink + text together are available but id parse fails', () => {
    const article = document.createElement('div');
    article.setAttribute('role', 'article');
    const link = document.createElement('a');
    link.href = '/unparseable/path/here';
    const msg = document.createElement('div');
    msg.setAttribute('data-ad-comet-preview', 'message');
    setInnerText(msg, 'Post body that does not carry any id token in the permalink.');
    article.appendChild(link);
    article.appendChild(msg);
    document.body.appendChild(article);

    const id = adapter.getStablePostId(article);
    expect(id).toMatch(/^fb-fallback-[0-9a-f]+$/);
  });

  it('ignores role="article" loading-state skeleton placeholders', () => {
    // FB renders skeleton cards as <div role="article"><div data-visualcompletion="loading-state" aria-label="Loading...">…
    // while the feed hydrates. Without a filter these were returning 0 real posts because
    // their mere presence suppressed the message-container fallback.
    const skeleton = document.createElement('div');
    skeleton.setAttribute('role', 'article');
    const status = document.createElement('div');
    status.setAttribute('data-visualcompletion', 'loading-state');
    status.setAttribute('role', 'status');
    status.setAttribute('aria-label', 'Loading...');
    skeleton.appendChild(status);
    document.body.appendChild(skeleton);

    expect(adapter.findPostNodes(document)).toHaveLength(0);
  });

  it('finds real posts via message-container fallback even when skeleton role="article" cards exist', () => {
    // Reproduces the live FB home feed state: two role="article" loading skeletons
    // coexisting with a hydrated post card that has NO role="article" of its own.
    const skel1 = document.createElement('div');
    skel1.setAttribute('role', 'article');
    const s1 = document.createElement('div');
    s1.setAttribute('data-visualcompletion', 'loading-state');
    skel1.appendChild(s1);

    const skel2 = document.createElement('div');
    skel2.setAttribute('role', 'article');
    const s2 = document.createElement('div');
    s2.setAttribute('data-visualcompletion', 'loading-state');
    skel2.appendChild(s2);

    const feed = document.createElement('div');
    feed.setAttribute('role', 'feed');

    const hydratedCard = document.createElement('div');
    hydratedCard.className = 'html-div hydrated-card';
    const storyMessage = document.createElement('div');
    storyMessage.setAttribute('data-ad-rendering-role', 'story_message');
    const messageHost = document.createElement('div');
    messageHost.setAttribute('data-ad-comet-preview', 'message');
    const messageBody = document.createElement('div');
    messageBody.setAttribute('dir', 'auto');
    const bodyText = 'Hydrated post body long enough to qualify for detection.';
    messageBody.textContent = bodyText;
    setInnerText(messageBody, bodyText);
    setInnerText(messageHost, bodyText);
    messageHost.appendChild(messageBody);
    storyMessage.appendChild(messageHost);
    hydratedCard.appendChild(storyMessage);
    const link = document.createElement('a');
    link.href = '/charlie.xyz/posts/pfbid0HYDRATED';
    hydratedCard.appendChild(link);
    feed.appendChild(hydratedCard);

    document.body.appendChild(skel1);
    document.body.appendChild(feed);
    document.body.appendChild(skel2);

    const posts = adapter.findPostNodes(document);
    expect(posts).toHaveLength(1);
    expect(posts[0]).toBe(hydratedCard);
    expect(adapter.getStablePostId(posts[0])).toBe('fb-pfbid0HYDRATED');
  });

  it('finds a feed card via message-container fallback when role="article" is absent', () => {
    // Mirrors an FB build that omits role="article" on feed cards (observed 2026+):
    // the story card wraps a `data-ad-rendering-role="story_message"` which wraps
    // `data-ad-comet-preview="message"` / `data-ad-preview="message"`.
    const feed = document.createElement('div');
    feed.setAttribute('role', 'feed');

    const cardOuter = document.createElement('div');
    cardOuter.className = 'html-div outer-card';

    const cardInner = document.createElement('div');
    cardInner.className = 'html-div inner-card';

    const storyMessage = document.createElement('div');
    storyMessage.setAttribute('data-ad-rendering-role', 'story_message');

    const messageHost = document.createElement('div');
    messageHost.setAttribute('data-ad-comet-preview', 'message');
    messageHost.setAttribute('data-ad-preview', 'message');

    const messageBody = document.createElement('div');
    messageBody.setAttribute('dir', 'auto');
    const bodyText = 'Message-anchor fallback body — long enough to qualify for detection.';
    messageBody.textContent = bodyText;
    setInnerText(messageBody, bodyText);
    setInnerText(messageHost, bodyText);

    const permalink = document.createElement('a');
    permalink.href = '/charlie.xyz/posts/pfbid0FALLBACK123';

    messageHost.appendChild(messageBody);
    storyMessage.appendChild(messageHost);
    cardInner.appendChild(storyMessage);
    cardInner.appendChild(permalink);
    cardOuter.appendChild(cardInner);
    feed.appendChild(cardOuter);
    document.body.appendChild(feed);

    const posts = adapter.findPostNodes(document);
    expect(posts).toHaveLength(1);
    // Walker should climb to the highest ancestor that still contains only one
    // story_message — in this fixture, cardOuter (one level below <div>feed).
    expect(posts[0]).toBe(cardOuter);

    expect(adapter.getTextNode(posts[0])?.innerText).toMatch(/fallback body/);
    expect(adapter.getStablePostId(posts[0])).toBe('fb-pfbid0FALLBACK123');
  });

  it('fallback walker stops before pulling in a sibling post from the feed wrapper', () => {
    // Two sibling cards under a shared feed wrapper; each must resolve to its own
    // immediate card boundary, not to the wrapper.
    const feedWrapper = document.createElement('div');
    feedWrapper.className = 'html-div feed-wrapper';

    function buildCardNoArticle(permalink: string, text: string): HTMLElement {
      const card = document.createElement('div');
      card.className = 'html-div card';
      const sm = document.createElement('div');
      sm.setAttribute('data-ad-rendering-role', 'story_message');
      const msg = document.createElement('div');
      msg.setAttribute('data-ad-comet-preview', 'message');
      const body = document.createElement('div');
      body.setAttribute('dir', 'auto');
      setInnerText(body, text);
      msg.appendChild(body);
      setInnerText(msg, text);
      sm.appendChild(msg);
      card.appendChild(sm);
      const link = document.createElement('a');
      link.href = permalink;
      card.appendChild(link);
      return card;
    }

    const a = buildCardNoArticle(
      '/a/posts/pfbid0AAA',
      'First sibling body long enough to qualify.',
    );
    const b = buildCardNoArticle(
      '/b/posts/pfbid0BBB',
      'Second sibling body long enough to qualify.',
    );
    feedWrapper.appendChild(a);
    feedWrapper.appendChild(b);
    document.body.appendChild(feedWrapper);

    const posts = adapter.findPostNodes(document);
    expect(posts).toHaveLength(2);
    expect(posts).toContain(a);
    expect(posts).toContain(b);
    expect(posts).not.toContain(feedWrapper);
  });

  it('dedupes images via content host and size filter', () => {
    const article = document.createElement('div');
    article.setAttribute('role', 'article');
    const link = document.createElement('a');
    link.href = '/me/posts/pfbid0IMG';
    article.appendChild(link);

    const big = document.createElement('img');
    big.src = 'https://scontent.fbcdn.net/v/t51/big.jpg';
    big.width = 400;
    big.height = 400;

    const tiny = document.createElement('img');
    tiny.src = 'https://scontent.fbcdn.net/v/t51/tiny.jpg';
    tiny.width = 16;
    tiny.height = 16;

    const offHost = document.createElement('img');
    offHost.src = 'https://random.example.com/img.jpg';
    offHost.width = 800;
    offHost.height = 800;

    article.appendChild(big);
    article.appendChild(tiny);
    article.appendChild(offHost);
    document.body.appendChild(article);

    const imgs = adapter.getImageNodes(article);
    expect(imgs).toHaveLength(1);
    expect(imgs[0]).toBe(big);
  });
});

// ── Platform gate tests ────────────────────────────────────────────────

describe('platform gate for facebook.com', () => {
  const baseSettings: DetectionSettings = { ...defaultUserSettings.settings };

  it('returns false for facebook.com when platforms.facebook is disabled', () => {
    const settings: DetectionSettings = {
      ...baseSettings,
      platforms: { ...baseSettings.platforms, facebook: false },
    };
    expect(shouldRunOnCurrentSite('facebook.com', settings)).toBe(false);
    expect(shouldRunOnCurrentSite('www.facebook.com', settings)).toBe(false);
    expect(shouldRunOnCurrentSite('m.facebook.com', settings)).toBe(false);
  });

  it('returns true for facebook.com subdomains when platforms.facebook is enabled', () => {
    const settings: DetectionSettings = {
      ...baseSettings,
      platforms: { ...baseSettings.platforms, facebook: true },
    };
    expect(shouldRunOnCurrentSite('facebook.com', settings)).toBe(true);
    expect(shouldRunOnCurrentSite('www.facebook.com', settings)).toBe(true);
    expect(shouldRunOnCurrentSite('m.facebook.com', settings)).toBe(true);
  });

  it('defaults to platforms.facebook enabled in defaultUserSettings', () => {
    expect(defaultUserSettings.settings.platforms.facebook).toBe(true);
  });
});
