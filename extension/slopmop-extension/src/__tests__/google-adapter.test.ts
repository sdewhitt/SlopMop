import { beforeEach, describe, expect, it } from 'vitest';
import { GoogleAdapter } from '@src/core/adapters/GoogleAdapter';
import { defaultUserSettings } from '@src/utils/userSettings';
import type { DetectionSettings } from '@src/utils/userSettings';

/**
 * jsdom does not implement a real layout engine, so innerText tracks textContent
 * here. Adapters that call innerText still work, but for clarity and parity with
 * other adapter tests we provide a helper to force a specific innerText value.
 */
function setInnerText(element: HTMLElement, value: string): void {
  Object.defineProperty(element, 'innerText', {
    configurable: true,
    get: () => value,
  });
}

const LONG_AI_BODY =
  'AI Overviews summarize information from across the web into a single ' +
  'conversational response. The system uses generative AI to synthesize ' +
  'content from multiple sources and provide a quick, easy-to-read answer.';

// ── Simulate the content-script platform gate ────────────────────

function isGoogleHost(hostname: string): boolean {
  return /(^|\.)google\.[a-z]{2,3}(\.[a-z]{2,3})?$/.test(hostname);
}

function shouldRunOnCurrentSite(hostname: string, settings: DetectionSettings): boolean {
  if (hostname.includes('reddit.com')) return settings.platforms.reddit;
  if (hostname.includes('instagram.com')) return settings.platforms.instagram;
  if (hostname.includes('twitter.com') || hostname.includes('x.com')) return settings.platforms.twitter;
  if (hostname.includes('facebook.com')) return settings.platforms.facebook;
  if (hostname.includes('youtube.com')) return settings.platforms.youtube;
  if (hostname.includes('linkedin.com')) return settings.platforms.linkedin;
  if (isGoogleHost(hostname)) return settings.platforms.google;
  return false;
}

// ── Fixture builders ─────────────────────────────────────────────

/**
 * Mimics current Google AI Overview DOM:
 *   <div id="search">
 *     <div id="rso">
 *       <div data-attrid="AIOverview">        ← primary stable hook
 *                                                (capitalised — lowercase
 *                                                "overview" is a DIFFERENT
 *                                                knowledge-panel card)
 *         <h2>AI Overview</h2>
 *         <div class="Kevs9">                  ← rotating class name
 *           <div class="Y3BBE">…paragraph…</div>
 *         </div>
 *       </div>
 *       <div class="g">…organic result…</div>
 *     </div>
 *   </div>
 */
function buildSerpWithAIOverview(body = LONG_AI_BODY): HTMLElement {
  const root = document.createElement('div');
  root.id = 'search';
  const rso = document.createElement('div');
  rso.id = 'rso';
  root.appendChild(rso);

  const aiBlock = document.createElement('div');
  aiBlock.setAttribute('data-attrid', 'AIOverview');

  const heading = document.createElement('h2');
  heading.textContent = 'AI Overview';
  aiBlock.appendChild(heading);

  const content = document.createElement('div');
  content.className = 'Kevs9';
  const paragraph = document.createElement('div');
  paragraph.className = 'Y3BBE';
  paragraph.textContent = body;
  setInnerText(paragraph, body);
  content.appendChild(paragraph);
  setInnerText(content, body);
  aiBlock.appendChild(content);

  setInnerText(aiBlock, `AI Overview ${body}`);

  // Plain organic card with no title — should NOT qualify as an organic result
  // (no h3, no anchor): we use this in fixtures where we want the SERP to
  // contain both kinds but still count organics correctly.
  const organic = document.createElement('div');
  organic.className = 'g';
  organic.setAttribute('data-hveid', 'CAEQAA');
  const title = document.createElement('h3');
  title.textContent = 'Wikipedia — Some article';
  setInnerText(title, 'Wikipedia — Some article');
  organic.appendChild(title);

  rso.appendChild(aiBlock);
  rso.appendChild(organic);
  return root;
}

/** Alternate heading-only fixture used when no attribute hooks match. */
function buildSerpWithHeadingOnlyAIOverview(body = LONG_AI_BODY): HTMLElement {
  const root = document.createElement('div');
  const aiBlock = document.createElement('div');
  // Neither AIOverview attr nor any other hook — pure heading fallback.

  const heading = document.createElement('h2');
  heading.textContent = 'AI Overview';
  aiBlock.appendChild(heading);

  const paragraph = document.createElement('div');
  paragraph.textContent = body;
  setInnerText(paragraph, body);
  aiBlock.appendChild(paragraph);

  setInnerText(aiBlock, `AI Overview ${body}`);
  root.appendChild(aiBlock);
  return root;
}

/**
 * Mimics a single organic result card with a title, snippet, cite, and link.
 *   <div class="g">
 *     <a href="…"><h3>Title</h3></a>
 *     <cite>example.com › path</cite>
 *     <div class="VwiC3b">Snippet text…</div>
 *   </div>
 */
function buildOrganicResult(opts: {
  href: string;
  title: string;
  snippet: string;
  cite?: string;
}): HTMLElement {
  const card = document.createElement('div');
  card.className = 'g';
  card.setAttribute('data-hveid', 'CAkQAA');

  const titleLink = document.createElement('a');
  titleLink.href = opts.href;
  titleLink.setAttribute('href', opts.href);
  const title = document.createElement('h3');
  title.textContent = opts.title;
  setInnerText(title, opts.title);
  titleLink.appendChild(title);
  card.appendChild(titleLink);

  if (opts.cite) {
    const cite = document.createElement('cite');
    cite.textContent = opts.cite;
    card.appendChild(cite);
  }

  const snippet = document.createElement('div');
  snippet.className = 'VwiC3b';
  snippet.textContent = opts.snippet;
  setInnerText(snippet, opts.snippet);
  card.appendChild(snippet);

  setInnerText(
    card,
    `${opts.title} ${opts.cite ?? ''} ${opts.snippet}`.trim(),
  );
  return card;
}

function buildSerpWithOrganicResults(count = 3): HTMLElement {
  const root = document.createElement('div');
  root.id = 'search';
  const rso = document.createElement('div');
  rso.id = 'rso';
  root.appendChild(rso);

  for (let i = 0; i < count; i++) {
    rso.appendChild(
      buildOrganicResult({
        href: `https://example${i}.com/article?ref=google`,
        title: `Example ${i} — Informative article`,
        snippet:
          `Result ${i}: An in-depth explainer about the topic. ` +
          'It covers key points, evidence, and cites primary sources ' +
          'so readers can follow up independently.',
        cite: `example${i}.com › path`,
      }),
    );
  }
  return root;
}

/**
 * Heading-walk fallback fixture: no attribute hooks, but the AIO body lives
 * a few levels deeper than the heading's immediate parent.
 */
function buildSerpHeadingOnly(body = LONG_AI_BODY): HTMLElement {
  const outer = document.createElement('div');

  const headingShell = document.createElement('div');
  const heading = document.createElement('h2');
  heading.textContent = 'AI Overview';
  headingShell.appendChild(heading);
  setInnerText(headingShell, 'AI Overview');

  const bodyShell = document.createElement('div');
  const body1 = document.createElement('div');
  body1.textContent = body;
  setInnerText(body1, body);
  bodyShell.appendChild(body1);
  setInnerText(bodyShell, body);

  outer.appendChild(headingShell);
  outer.appendChild(bodyShell);
  setInnerText(outer, `AI Overview ${body}`);
  return outer;
}

function buildPlainSerp(): HTMLElement {
  const root = document.createElement('div');
  root.id = 'rso';

  for (let i = 0; i < 5; i++) {
    const organic = document.createElement('div');
    organic.className = 'g';
    organic.setAttribute('data-hveid', `CA${i}QAA`);
    const title = document.createElement('h3');
    title.textContent = `Organic result ${i}`;
    setInnerText(title, `Organic result ${i}`);
    organic.appendChild(title);
    setInnerText(organic, `Organic result ${i}`);
    root.appendChild(organic);
  }

  return root;
}

// ── Tests ────────────────────────────────────────────────────────

describe('GoogleAdapter', () => {
  let adapter: GoogleAdapter;

  beforeEach(() => {
    document.body.innerHTML = '';
    window.history.replaceState({}, '', '/search?q=what+is+ai');
    adapter = new GoogleAdapter();
  });

  it('returns google.com as site id', () => {
    expect(adapter.getSiteId()).toBe('google.com');
  });

  it('finds AI Overview via data-attrid="AIOverview" (capitalised)', () => {
    document.body.appendChild(buildSerpWithAIOverview());

    const aios = adapter
      .findPostNodes(document)
      .filter((n) => n.getAttribute('data-attrid') === 'AIOverview');
    expect(aios).toHaveLength(1);

    const textNode = adapter.getTextNode(aios[0]);
    expect(textNode).not.toBeNull();

    const postId = adapter.getStablePostId(aios[0]);
    expect(postId).toMatch(/^google-aio-[0-9a-f]+$/);
  });

  it('does NOT match lowercase data-attrid="overview" (knowledge-panel card, not AIO)', () => {
    // Guards against the regression introduced in commit 1475db5 where the
    // lowercase selector leaked through and targeted the wrong SERP feature.
    const root = document.createElement('div');
    const knowledgePanel = document.createElement('div');
    knowledgePanel.setAttribute('data-attrid', 'overview');
    setInnerText(
      knowledgePanel,
      'Wikipedia-style factual entity summary that is long enough to ' +
        'pass the meaningful-text check but must not be mistaken for the ' +
        'AI Overview feature.',
    );
    root.appendChild(knowledgePanel);
    document.body.appendChild(root);

    expect(
      adapter
        .findPostNodes(document)
        .filter((n) => n === knowledgePanel),
    ).toEqual([]);
  });

  it('falls back to heading walk-up when no attribute hooks are present', () => {
    document.body.appendChild(buildSerpWithHeadingOnlyAIOverview());

    const found = adapter.findPostNodes(document);
    expect(found.length).toBeGreaterThanOrEqual(1);
    expect((found[0] as HTMLElement).innerText).toMatch(/AI Overview/);
  });

  it('returns an empty list on a plain SERP with no AI block and no organic cards', () => {
    document.body.appendChild(buildPlainSerp());
    expect(adapter.findPostNodes(document)).toEqual([]);
  });

  it('produces the same postId for the same AI Overview across re-renders', () => {
    document.body.appendChild(buildSerpWithAIOverview());
    const id1 = adapter.getStablePostId(adapter.findPostNodes(document)[0]);

    document.body.innerHTML = '';
    document.body.appendChild(buildSerpWithAIOverview());
    const id2 = adapter.getStablePostId(adapter.findPostNodes(document)[0]);

    expect(id1).toBe(id2);
  });

  it('produces different postIds for the same content under different queries', () => {
    document.body.appendChild(buildSerpWithAIOverview());
    const node = adapter.findPostNodes(document)[0];
    const id1 = adapter.getStablePostId(node);

    window.history.replaceState({}, '', '/search?q=different+query');
    const id2 = adapter.getStablePostId(node);

    expect(id1).not.toBe(id2);
  });

  it('reports Google AI as the author handle', () => {
    document.body.appendChild(buildSerpWithAIOverview());
    const node = adapter.findPostNodes(document)[0];
    expect(adapter.getAuthorHandle(node)).toBe('Google AI');
  });

  it('returns no images and no comments for SERP blocks', () => {
    document.body.appendChild(buildSerpWithAIOverview());
    const node = adapter.findPostNodes(document)[0];
    expect(adapter.getImageNodes(node)).toEqual([]);
    expect(adapter.findVisibleCommentNodes(document)).toEqual([]);
    expect(adapter.getCommentId(node)).toBeNull();
    expect(adapter.getCommentTextNode(node)).toBeNull();
    expect(adapter.getCommentPermalink(node)).toBeNull();
  });

  it('skips AI Overview blocks whose text is too short to be meaningful', () => {
    const root = document.createElement('div');
    const tinyAi = document.createElement('div');
    tinyAi.setAttribute('data-attrid', 'AIOverview');
    setInnerText(tinyAi, 'too short');
    root.appendChild(tinyAi);
    document.body.appendChild(root);

    expect(adapter.findPostNodes(document)).toEqual([]);
  });

  it('falls back to heading walk-up when no attribute hooks match', () => {
    document.body.appendChild(buildSerpHeadingOnly());

    const found = adapter.findPostNodes(document);
    expect(found.length).toBeGreaterThanOrEqual(1);
    expect((found[0] as HTMLElement).innerText).toMatch(/AI Overview/);
  });

  it('heading fallback picks an ancestor with substantially more body than the heading alone', () => {
    // A heading whose parent holds ONLY the heading text should not qualify —
    // the walk must continue up to a larger ancestor.
    const root = document.createElement('div');

    const narrowParent = document.createElement('span');
    const heading = document.createElement('h2');
    heading.textContent = 'AI Overview';
    narrowParent.appendChild(heading);
    setInnerText(narrowParent, 'AI Overview');

    const bigAncestor = document.createElement('div');
    bigAncestor.appendChild(narrowParent);
    const body = document.createElement('div');
    const bodyText = LONG_AI_BODY;
    body.textContent = bodyText;
    setInnerText(body, bodyText);
    bigAncestor.appendChild(body);
    setInnerText(bigAncestor, `AI Overview ${bodyText}`);

    root.appendChild(bigAncestor);
    document.body.appendChild(root);

    const found = adapter.findPostNodes(document);
    expect(found).toHaveLength(1);
    // The adapter should have selected `bigAncestor`, not `narrowParent`.
    expect(found[0]).toBe(bigAncestor);
  });

  it('heading fallback stops when no ancestor has enough body text', () => {
    const root = document.createElement('div');
    const heading = document.createElement('h2');
    heading.textContent = 'AI Overview';
    setInnerText(heading, 'AI Overview');
    root.appendChild(heading);
    setInnerText(root, 'AI Overview');
    document.body.appendChild(root);

    expect(adapter.findPostNodes(document)).toEqual([]);
  });

  it('deduplicates when attribute hook and heading fallback would both match', () => {
    // data-attrid match will be taken first; heading fallback only runs when
    // no attribute hook matches.
    document.body.appendChild(buildSerpWithAIOverview());
    const aios = adapter
      .findPostNodes(document)
      .filter((n) => n.getAttribute('data-attrid') === 'AIOverview');
    expect(aios).toHaveLength(1);
  });

  it('deduplicates overlapping AI Overview attribute and region containers', () => {
    const region = document.createElement('div');
    region.setAttribute('role', 'region');
    region.setAttribute('aria-label', 'AI Overview');

    const aiBlock = buildSerpWithAIOverview();
    const attrContainer = aiBlock.querySelector('[data-attrid="AIOverview"]')!;
    region.appendChild(aiBlock);
    setInnerText(region, `AI Overview ${LONG_AI_BODY}`);
    document.body.appendChild(region);

    const found = adapter.findPostNodes(document);

    expect(found).toHaveLength(1);
    expect(found[0]).toBe(region);
    expect(found).not.toContain(attrContainer);
  });

  describe('organic search results', () => {
    it('finds each organic result card on a results-only SERP', () => {
      document.body.appendChild(buildSerpWithOrganicResults(3));

      const found = adapter.findPostNodes(document);
      expect(found).toHaveLength(3);
      for (const node of found) {
        expect((node as HTMLElement).classList.contains('g')).toBe(true);
      }
    });

    it('returns an organic-specific post id derived from the result href', () => {
      document.body.appendChild(buildSerpWithOrganicResults(1));
      const node = adapter.findPostNodes(document)[0];
      const postId = adapter.getStablePostId(node);
      expect(postId).toMatch(/^google-result-[0-9a-f]+$/);
    });

    it('returns the result link as the permalink, not the SERP URL', () => {
      document.body.appendChild(buildSerpWithOrganicResults(1));
      const node = adapter.findPostNodes(document)[0];
      const permalink = adapter.getPermalink(node);
      expect(permalink).toMatch(/^https?:\/\/example0\.com\//);
    });

    it('uses the snippet (.VwiC3b) as the text host when present', () => {
      document.body.appendChild(buildSerpWithOrganicResults(1));
      const node = adapter.findPostNodes(document)[0];
      const textNode = adapter.getTextNode(node);
      expect(textNode).not.toBeNull();
      expect(textNode!.classList.contains('VwiC3b')).toBe(true);
    });

    it('uses the cite element as the author handle', () => {
      document.body.appendChild(buildSerpWithOrganicResults(1));
      const node = adapter.findPostNodes(document)[0];
      expect(adapter.getAuthorHandle(node)).toBe('example0.com');
    });

    it('skips cards that lack an h3 title or an anchor link', () => {
      const root = document.createElement('div');
      root.id = 'search';
      const rso = document.createElement('div');
      rso.id = 'rso';
      root.appendChild(rso);

      const noAnchor = document.createElement('div');
      noAnchor.className = 'g';
      const h3NoLink = document.createElement('h3');
      h3NoLink.textContent = 'No link here — just a headline that is long enough to pass the text check';
      setInnerText(h3NoLink, h3NoLink.textContent!);
      noAnchor.appendChild(h3NoLink);
      setInnerText(noAnchor, h3NoLink.textContent!);
      rso.appendChild(noAnchor);

      const noTitle = document.createElement('div');
      noTitle.className = 'g';
      const anchor = document.createElement('a');
      anchor.href = 'https://example.com';
      anchor.setAttribute('href', 'https://example.com');
      anchor.textContent = 'Untitled result with reasonable link text here';
      noTitle.appendChild(anchor);
      setInnerText(noTitle, 'Untitled result with reasonable link text here');
      rso.appendChild(noTitle);

      document.body.appendChild(root);

      expect(adapter.findPostNodes(document)).toEqual([]);
    });

    it('keeps outermost cards when a `.g` wraps sitelink sub-cards', () => {
      const root = document.createElement('div');
      root.id = 'search';
      const rso = document.createElement('div');
      rso.id = 'rso';
      root.appendChild(rso);

      const outer = buildOrganicResult({
        href: 'https://outer.com/a',
        title: 'Outer result — top card',
        snippet: 'Outer snippet text long enough to count as a real result body here.',
        cite: 'outer.com',
      });
      const inner = buildOrganicResult({
        href: 'https://outer.com/b',
        title: 'Inner sitelink — nested under outer',
        snippet: 'Inner snippet text long enough to count as a real result body here.',
        cite: 'outer.com',
      });
      outer.appendChild(inner);
      rso.appendChild(outer);
      document.body.appendChild(root);

      const found = adapter.findPostNodes(document);
      expect(found).toHaveLength(1);
      expect(found[0]).toBe(outer);
    });

    it('returns both the AI Overview and organic results on a mixed SERP', () => {
      const outer = document.createElement('div');
      outer.appendChild(buildSerpWithAIOverview());

      const resultsBlock = buildSerpWithOrganicResults(2);
      // Nest organic results *below* the AIO under the same #search wrapper.
      const searchShell = outer.querySelector('#search')!;
      const organicCards = resultsBlock.querySelectorAll('.g');
      for (const card of Array.from(organicCards)) {
        searchShell.querySelector('#rso')!.appendChild(card);
      }

      document.body.appendChild(outer);

      const found = adapter.findPostNodes(document);
      const aios = found.filter(
        (n) => n.getAttribute('data-attrid') === 'AIOverview',
      );
      const organics = found.filter((n) =>
        (n as HTMLElement).classList.contains('g'),
      );
      expect(aios).toHaveLength(1);
      expect(organics).toHaveLength(2);
    });

    it('returns no images for organic result cards', () => {
      document.body.appendChild(buildSerpWithOrganicResults(1));
      const node = adapter.findPostNodes(document)[0];
      expect(adapter.getImageNodes(node)).toEqual([]);
    });

    it('produces the same organic post id across re-renders of the same link', () => {
      document.body.appendChild(buildSerpWithOrganicResults(1));
      const id1 = adapter.getStablePostId(adapter.findPostNodes(document)[0]);

      document.body.innerHTML = '';
      adapter = new GoogleAdapter();
      document.body.appendChild(buildSerpWithOrganicResults(1));
      const id2 = adapter.getStablePostId(adapter.findPostNodes(document)[0]);

      expect(id1).toBe(id2);
    });

    it('produces different organic post ids for different result links', () => {
      document.body.appendChild(buildSerpWithOrganicResults(2));
      const [a, b] = adapter.findPostNodes(document);
      expect(adapter.getStablePostId(a)).not.toBe(adapter.getStablePostId(b));
    });

    it('unwraps Google /url?q=<href> redirects when building the permalink', () => {
      const root = document.createElement('div');
      root.id = 'search';
      const rso = document.createElement('div');
      rso.id = 'rso';
      root.appendChild(rso);

      const card = buildOrganicResult({
        href: '/url?q=https://destination.example/real-page&sa=U',
        title: 'Wrapped link — resolves to destination.example',
        snippet: 'Snippet text long enough to count as a real result body here for detection.',
        cite: 'destination.example',
      });
      rso.appendChild(card);
      document.body.appendChild(root);

      const node = adapter.findPostNodes(document)[0];
      expect(adapter.getPermalink(node)).toBe(
        'https://destination.example/real-page',
      );
    });
  });

  describe('getPostOverlayHost', () => {
    it('returns the node itself when nothing clips', () => {
      document.body.appendChild(buildSerpWithAIOverview());
      const node = adapter.findPostNodes(document)[0] as HTMLElement;
      expect(adapter.getPostOverlayHost(node)).toBe(node);
    });

    it('walks up past an overflow:hidden ancestor', () => {
      const root = document.createElement('div');

      const clippingWrap = document.createElement('div');
      clippingWrap.style.overflow = 'hidden';
      clippingWrap.style.maxHeight = '120px';

      const aiBlock = document.createElement('div');
      aiBlock.setAttribute('data-attrid', 'AIOverview');
      const heading = document.createElement('h2');
      heading.textContent = 'AI Overview';
      aiBlock.appendChild(heading);
      const body = document.createElement('div');
      body.textContent = LONG_AI_BODY;
      setInnerText(body, LONG_AI_BODY);
      aiBlock.appendChild(body);
      setInnerText(aiBlock, `AI Overview ${LONG_AI_BODY}`);
      clippingWrap.appendChild(aiBlock);

      root.appendChild(clippingWrap);
      document.body.appendChild(root);

      const node = adapter.findPostNodes(document)[0] as HTMLElement;
      const host = adapter.getPostOverlayHost(node);
      expect(host).not.toBe(node);
      expect(host).not.toBe(clippingWrap);
      // Walks past both the AIO node (inherits no clipping) and the wrap.
      // First non-clipping is the outer `root`.
      expect(host).toBe(root);
    });

    it('walks up when the post node itself clips', () => {
      const outer = document.createElement('div');
      const aiBlock = document.createElement('div');
      aiBlock.setAttribute('data-attrid', 'AIOverview');
      aiBlock.style.overflow = 'hidden';
      aiBlock.style.maxHeight = '96px';

      const heading = document.createElement('h2');
      heading.textContent = 'AI Overview';
      aiBlock.appendChild(heading);
      const body = document.createElement('div');
      body.textContent = LONG_AI_BODY;
      setInnerText(body, LONG_AI_BODY);
      aiBlock.appendChild(body);
      setInnerText(aiBlock, `AI Overview ${LONG_AI_BODY}`);
      outer.appendChild(aiBlock);
      document.body.appendChild(outer);

      const host = adapter.getPostOverlayHost(aiBlock);
      expect(host).toBe(outer);
    });

    it('falls back to the post node if no clean ancestor is found within the walk limit', () => {
      // Build 12 levels of clipping ancestors — more than the walk limit.
      let current: HTMLElement = document.createElement('div');
      document.body.appendChild(current);
      for (let i = 0; i < 12; i++) {
        current.style.overflow = 'hidden';
        const child = document.createElement('div');
        current.appendChild(child);
        current = child;
      }
      const aiBlock = current;
      aiBlock.setAttribute('data-attrid', 'AIOverview');
      aiBlock.style.overflow = 'hidden';
      const heading = document.createElement('h2');
      heading.textContent = 'AI Overview';
      aiBlock.appendChild(heading);
      const body = document.createElement('div');
      body.textContent = LONG_AI_BODY;
      setInnerText(body, LONG_AI_BODY);
      aiBlock.appendChild(body);
      setInnerText(aiBlock, `AI Overview ${LONG_AI_BODY}`);

      const host = adapter.getPostOverlayHost(aiBlock);
      // Every ancestor within the limit is clipping, so the adapter returns
      // the post node itself rather than something far outside the AIO.
      expect(host).toBe(aiBlock);
    });

    it('treats max-height as clipping', () => {
      const outer = document.createElement('div');
      const mid = document.createElement('div');
      mid.style.maxHeight = '200px';
      const aiBlock = document.createElement('div');
      aiBlock.setAttribute('data-attrid', 'AIOverview');
      const heading = document.createElement('h2');
      heading.textContent = 'AI Overview';
      aiBlock.appendChild(heading);
      const body = document.createElement('div');
      body.textContent = LONG_AI_BODY;
      setInnerText(body, LONG_AI_BODY);
      aiBlock.appendChild(body);
      setInnerText(aiBlock, `AI Overview ${LONG_AI_BODY}`);
      mid.appendChild(aiBlock);
      outer.appendChild(mid);
      document.body.appendChild(outer);

      const host = adapter.getPostOverlayHost(aiBlock);
      expect(host).toBe(outer);
    });
  });
});

// ── Platform gate tests ──────────────────────────────────────────

describe('platform gate for google.com', () => {
  const baseSettings: DetectionSettings = { ...defaultUserSettings.settings };

  it('returns false for google.com when platforms.google is disabled', () => {
    const settings: DetectionSettings = {
      ...baseSettings,
      platforms: { ...baseSettings.platforms, google: false },
    };
    expect(shouldRunOnCurrentSite('google.com', settings)).toBe(false);
  });

  it('returns true for google.com when platforms.google is enabled', () => {
    const settings: DetectionSettings = {
      ...baseSettings,
      platforms: { ...baseSettings.platforms, google: true },
    };
    expect(shouldRunOnCurrentSite('google.com', settings)).toBe(true);
  });

  it('matches google country TLDs (google.co.uk, google.de, google.com.au)', () => {
    expect(isGoogleHost('google.co.uk')).toBe(true);
    expect(isGoogleHost('google.de')).toBe(true);
    expect(isGoogleHost('google.com.au')).toBe(true);
    expect(isGoogleHost('www.google.com')).toBe(true);
  });

  it('does not match non-Google hosts that contain "google"', () => {
    expect(isGoogleHost('notgoogle.com')).toBe(false);
    expect(isGoogleHost('example.com')).toBe(false);
    expect(isGoogleHost('mygoogle.net')).toBe(false);
  });

  it('defaults to platforms.google enabled in defaultUserSettings', () => {
    expect(defaultUserSettings.settings.platforms.google).toBe(true);
  });
});
