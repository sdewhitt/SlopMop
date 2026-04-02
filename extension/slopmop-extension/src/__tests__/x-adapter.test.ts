import { beforeEach, describe, expect, it } from 'vitest';
import { XAdapter } from '@src/core/adapters/XAdapter';

function setInnerText(element: HTMLElement, value: string): void {
  Object.defineProperty(element, 'innerText', {
    configurable: true,
    get: () => value,
  });
}

describe('XAdapter', () => {
  let adapter: XAdapter;

  beforeEach(() => {
    document.body.innerHTML = '';
    // Relative paths only — jsdom rejects replaceState to another origin.
    window.history.replaceState({}, '', '/home');
    adapter = new XAdapter();
  });

  it('returns x.com as site id', () => {
    expect(adapter.getSiteId()).toBe('x.com');
  });

  it('finds only outermost tweet articles on feeds (quote nests inner article)', () => {
    const outer = document.createElement('article');
    outer.setAttribute('data-testid', 'tweet');
    const mainLink = document.createElement('a');
    mainLink.href = '/user/status/1111111111111111111';
    const mainText = document.createElement('div');
    mainText.setAttribute('data-testid', 'tweetText');
    setInnerText(mainText, 'Main post');
    outer.appendChild(mainLink);
    outer.appendChild(mainText);

    const inner = document.createElement('article');
    inner.setAttribute('data-testid', 'tweet');
    const quoteLink = document.createElement('a');
    quoteLink.href = '/user/status/2222222222222222222';
    const quoteText = document.createElement('div');
    quoteText.setAttribute('data-testid', 'tweetText');
    setInnerText(quoteText, 'Quoted');
    inner.appendChild(quoteLink);
    inner.appendChild(quoteText);
    outer.appendChild(inner);
    document.body.appendChild(outer);

    const found = adapter.findPostNodes(document);
    expect(found).toHaveLength(1);
    expect(found[0]).toBe(outer);
    expect(adapter.getStablePostId(outer)).toBe('x-status-1111111111111111111');
    expect(adapter.getTextNode(outer)).toBe(mainText);
    expect(adapter.getTextNode(inner)).toBe(quoteText);
  });

  it('on a thread URL returns only the focal tweet matching the status id', () => {
    window.history.replaceState({}, '', '/someuser/status/1234567890123456789');

    const col = document.createElement('div');
    col.setAttribute('data-testid', 'primaryColumn');

    const focal = document.createElement('article');
    focal.setAttribute('data-testid', 'tweet');
    const focalLink = document.createElement('a');
    focalLink.href = '/someuser/status/1234567890123456789';
    const focalText = document.createElement('div');
    focalText.setAttribute('data-testid', 'tweetText');
    setInnerText(focalText, 'Root');
    focal.appendChild(focalLink);
    focal.appendChild(focalText);

    const reply = document.createElement('article');
    reply.setAttribute('data-testid', 'tweet');
    const replyLink = document.createElement('a');
    replyLink.href = '/other/status/9876543210987654321';
    const replyText = document.createElement('div');
    replyText.setAttribute('data-testid', 'tweetText');
    setInnerText(replyText, 'Reply body');
    reply.appendChild(replyLink);
    reply.appendChild(replyText);

    col.appendChild(focal);
    col.appendChild(reply);
    document.body.appendChild(col);

    const posts = adapter.findPostNodes(document);
    expect(posts).toHaveLength(1);
    expect(posts[0]).toBe(focal);
    expect(adapter.getStablePostId(focal)).toBe('x-status-1234567890123456789');
  });

  it('on a thread URL treats other visible tweets as comments', () => {
    window.history.replaceState({}, '', '/someuser/status/1234567890123456789');

    const focal = document.createElement('article');
    focal.setAttribute('data-testid', 'tweet');
    const focalLink = document.createElement('a');
    focalLink.href = '/someuser/status/1234567890123456789';
    const focalText = document.createElement('div');
    focalText.setAttribute('data-testid', 'tweetText');
    setInnerText(focalText, 'Root');
    focal.appendChild(focalLink);
    focal.appendChild(focalText);

    const reply = document.createElement('article');
    reply.setAttribute('data-testid', 'tweet');
    const replyLink = document.createElement('a');
    replyLink.href = '/other/status/9876543210987654321';
    const replyText = document.createElement('div');
    replyText.setAttribute('data-testid', 'tweetText');
    setInnerText(replyText, 'Reply body');
    reply.appendChild(replyLink);
    reply.appendChild(replyText);

    document.body.appendChild(focal);
    document.body.appendChild(reply);

    Object.defineProperty(reply, 'getBoundingClientRect', {
      value: () => ({
        width: 400,
        height: 50,
        top: 10,
        bottom: 60,
        left: 0,
        right: 400,
      }),
    });

    const comments = adapter.findVisibleCommentNodes(document, 25);
    expect(comments).toHaveLength(1);
    expect(comments[0]).toBe(reply);
    expect(adapter.getCommentId(reply)).toBe('x-comment-9876543210987654321');
  });

  it('returns no comment nodes off-thread', () => {
    window.history.replaceState({}, '', '/home');
    const article = document.createElement('article');
    article.setAttribute('data-testid', 'tweet');
    const a = document.createElement('a');
    a.href = '/x/status/1';
    article.appendChild(a);
    document.body.appendChild(article);

    expect(adapter.findVisibleCommentNodes(document, 25)).toHaveLength(0);
  });

  it('normalizes permalinks and derives timestamp from time[datetime]', () => {
    const article = document.createElement('article');
    article.setAttribute('data-testid', 'tweet');
    const time = document.createElement('time');
    time.setAttribute('datetime', '2025-01-01T12:00:00.000Z');
    const link = document.createElement('a');
    link.href = 'https://x.com/user/status/5555555555555555555';
    link.appendChild(time);
    const text = document.createElement('div');
    text.setAttribute('data-testid', 'tweetText');
    setInnerText(text, 'Hi');
    article.appendChild(link);
    article.appendChild(text);
    document.body.appendChild(article);

    const permalink = adapter.getPermalink(article);
    expect(permalink).toContain('/status/5555555555555555555');
    expect(permalink).not.toContain('#');
    expect(adapter.getTimestampText(article)).toBe('2025-01-01T12:00:00.000Z');
  });

  it('extracts author handle from User-Name @mention text', () => {
    const article = document.createElement('article');
    const userName = document.createElement('div');
    userName.setAttribute('data-testid', 'User-Name');
    userName.textContent = '@cooluser';
    article.appendChild(userName);
    document.body.appendChild(article);

    expect(adapter.getAuthorHandle(article)).toBe('cooluser');
  });

  it('extracts author handle from profile link href under User-Name', () => {
    const article = document.createElement('article');
    const userName = document.createElement('div');
    userName.setAttribute('data-testid', 'User-Name');
    const a = document.createElement('a');
    a.href = '/some_author';
    a.textContent = 'Name';
    userName.appendChild(a);
    article.appendChild(userName);
    document.body.appendChild(article);

    expect(adapter.getAuthorHandle(article)).toBe('some_author');
  });

  it('getImageNodes keeps twimg media above size threshold and drops tiny images', () => {
    const article = document.createElement('article');
    const big = document.createElement('img');
    big.src = 'https://pbs.twimg.com/media/abc.jpg';
    big.width = 200;
    big.height = 200;
    const tiny = document.createElement('img');
    tiny.src = 'https://pbs.twimg.com/media/tiny.jpg';
    tiny.width = 32;
    tiny.height = 32;
    article.appendChild(big);
    article.appendChild(tiny);
    document.body.appendChild(article);

    const imgs = adapter.getImageNodes(article);
    expect(imgs).toHaveLength(1);
    expect(imgs[0]).toBe(big);
  });

  it('getImageNodes excludes profile image URLs and data URLs', () => {
    const article = document.createElement('article');
    const profile = document.createElement('img');
    profile.src = 'https://pbs.twimg.com/profile_images/xyz/normal.jpg';
    profile.width = 200;
    profile.height = 200;
    const dataImg = document.createElement('img');
    dataImg.src = 'data:image/png;base64,AAAA';
    dataImg.width = 200;
    dataImg.height = 200;
    article.appendChild(profile);
    article.appendChild(dataImg);
    document.body.appendChild(article);

    expect(adapter.getImageNodes(article)).toHaveLength(0);
  });

  it('findPostNodes omits tweet articles with no /status/ id', () => {
    const article = document.createElement('article');
    article.setAttribute('data-testid', 'tweet');
    const text = document.createElement('div');
    text.setAttribute('data-testid', 'tweetText');
    setInnerText(text, 'Promoted or broken');
    article.appendChild(text);
    document.body.appendChild(article);

    expect(adapter.findPostNodes(document)).toHaveLength(0);
  });

  it('findPostNodes on thread URL returns empty when no tweet matches URL status id', () => {
    window.history.replaceState({}, '', '/user/status/9999999999999999999');

    const article = document.createElement('article');
    article.setAttribute('data-testid', 'tweet');
    const a = document.createElement('a');
    a.href = '/user/status/1111111111111111111';
    const text = document.createElement('div');
    text.setAttribute('data-testid', 'tweetText');
    setInnerText(text, 'Wrong id');
    article.appendChild(a);
    article.appendChild(text);
    document.body.appendChild(article);

    expect(adapter.findPostNodes(document)).toHaveLength(0);
  });

  it('findVisibleCommentNodes skips quoted tweet nested inside focal article', () => {
    window.history.replaceState({}, '', '/user/status/1234567890123456789');

    const focal = document.createElement('article');
    focal.setAttribute('data-testid', 'tweet');
    const focalLink = document.createElement('a');
    focalLink.href = '/user/status/1234567890123456789';
    const focalText = document.createElement('div');
    focalText.setAttribute('data-testid', 'tweetText');
    setInnerText(focalText, 'Root');
    focal.appendChild(focalLink);
    focal.appendChild(focalText);

    const quoted = document.createElement('article');
    quoted.setAttribute('data-testid', 'tweet');
    const quoteLink = document.createElement('a');
    quoteLink.href = '/other/status/7777777777777777777';
    const quoteText = document.createElement('div');
    quoteText.setAttribute('data-testid', 'tweetText');
    setInnerText(quoteText, 'Quoted');
    quoted.appendChild(quoteLink);
    quoted.appendChild(quoteText);
    focal.appendChild(quoted);

    document.body.appendChild(focal);

    Object.defineProperty(quoted, 'getBoundingClientRect', {
      value: () => ({
        width: 400,
        height: 50,
        top: 10,
        bottom: 60,
        left: 0,
        right: 400,
      }),
    });

    expect(adapter.findVisibleCommentNodes(document, 25)).toHaveLength(0);
  });

  it('getCommentId uses deterministic fallback when status id is missing', () => {
    const article = document.createElement('article');
    article.setAttribute('data-testid', 'tweet');
    const text = document.createElement('div');
    text.setAttribute('data-testid', 'tweetText');
    setInnerText(text, 'Orphan reply text');
    article.appendChild(text);
    document.body.appendChild(article);

    const id = adapter.getCommentId(article);
    expect(id).toMatch(/^x-comment-fallback-[0-9a-f]+$/);
  });

  it('getStablePostId uses x-fallback hash when status links are absent', () => {
    const article = document.createElement('article');
    article.setAttribute('data-testid', 'tweet');
    const text = document.createElement('div');
    text.setAttribute('data-testid', 'tweetText');
    setInnerText(text, 'No permalink yet');
    article.appendChild(text);
    document.body.appendChild(article);

    const id = adapter.getStablePostId(article);
    expect(id).toMatch(/^x-fallback-[0-9a-f]+$/);
  });

  it('findVisibleCommentNodes respects limit', () => {
    window.history.replaceState({}, '', '/user/status/1000000000000000000');

    const focal = document.createElement('article');
    focal.setAttribute('data-testid', 'tweet');
    const focalLink = document.createElement('a');
    focalLink.href = '/u/status/1000000000000000000';
    const focalText = document.createElement('div');
    focalText.setAttribute('data-testid', 'tweetText');
    setInnerText(focalText, 'Root');
    focal.appendChild(focalLink);
    focal.appendChild(focalText);
    document.body.appendChild(focal);

    const makeReply = (id: string) => {
      const reply = document.createElement('article');
      reply.setAttribute('data-testid', 'tweet');
      const link = document.createElement('a');
      link.href = `/o/status/${id}`;
      const t = document.createElement('div');
      t.setAttribute('data-testid', 'tweetText');
      setInnerText(t, `Reply ${id}`);
      reply.appendChild(link);
      reply.appendChild(t);
      Object.defineProperty(reply, 'getBoundingClientRect', {
        value: () => ({
          width: 400,
          height: 40,
          top: 10,
          bottom: 50,
          left: 0,
          right: 400,
        }),
      });
      return reply;
    };

    document.body.appendChild(makeReply('2000000000000000001'));
    document.body.appendChild(makeReply('2000000000000000002'));
    document.body.appendChild(makeReply('2000000000000000003'));

    expect(adapter.findVisibleCommentNodes(document, 2)).toHaveLength(2);
  });

  it('prefers timestamp status id over inReplyToStyle link on the same card', () => {
    const article = document.createElement('article');
    article.setAttribute('data-testid', 'tweet');
    const replyCtx = document.createElement('div');
    replyCtx.setAttribute('data-testid', 'inReplyToStyle');
    const replyTo = document.createElement('a');
    replyTo.href = '/other/status/2222222222222222222';
    replyCtx.appendChild(replyTo);
    const tsLink = document.createElement('a');
    tsLink.href = '/me/status/1111111111111111111';
    const time = document.createElement('time');
    time.setAttribute('datetime', '2025-01-01T00:00:00.000Z');
    tsLink.appendChild(time);
    const text = document.createElement('div');
    text.setAttribute('data-testid', 'tweetText');
    setInnerText(text, 'Body');
    article.appendChild(replyCtx);
    article.appendChild(tsLink);
    article.appendChild(text);
    document.body.appendChild(article);

    expect(adapter.getStablePostId(article)).toBe('x-status-1111111111111111111');
  });
});
