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
// Keep this local to avoid importing the full content/index.tsx file,
// which has heavy side-effects (Firebase, React, etc.).

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

function buildSerpWithAIOverview(body = LONG_AI_BODY): HTMLElement {
  const root = document.createElement('div');
  root.id = 'rso';

  const aiBlock = document.createElement('div');
  aiBlock.setAttribute('data-attrid', 'AIOverview');
  aiBlock.setAttribute('data-hveid', 'CAAQAA');

  const heading = document.createElement('h2');
  heading.textContent = 'AI Overview';
  aiBlock.appendChild(heading);

  const paragraph = document.createElement('div');
  paragraph.textContent = body;
  setInnerText(paragraph, body);
  aiBlock.appendChild(paragraph);

  setInnerText(aiBlock, `AI Overview\n${body}`);

  // Sibling organic results — these should never be returned.
  const organic = document.createElement('div');
  organic.className = 'g';
  organic.setAttribute('data-hveid', 'CAEQAA');
  const title = document.createElement('h3');
  title.textContent = 'Wikipedia — Some article';
  organic.appendChild(title);

  root.appendChild(aiBlock);
  root.appendChild(organic);
  return root;
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

  it('finds an AI Overview block when present on the SERP', () => {
    document.body.appendChild(buildSerpWithAIOverview());

    const found = adapter.findPostNodes(document);
    expect(found.length).toBeGreaterThanOrEqual(1);

    const node = found[0] as HTMLElement;
    expect(node.getAttribute('data-attrid') ?? node.getAttribute('data-hveid')).toBeTruthy();

    const textNode = adapter.getTextNode(node);
    expect(textNode).not.toBeNull();
    expect((textNode!.innerText ?? textNode!.textContent ?? '').length).toBeGreaterThan(40);

    const postId = adapter.getStablePostId(node);
    expect(postId).toMatch(/^google-aio-[0-9a-f]+$/);
  });

  it('returns an empty list on a plain SERP with no AI block', () => {
    document.body.appendChild(buildPlainSerp());

    const found = adapter.findPostNodes(document);
    expect(found).toEqual([]);
  });

  it('produces the same postId for the same AI Overview content across re-renders', () => {
    const first = buildSerpWithAIOverview();
    document.body.appendChild(first);
    const firstNode = adapter.findPostNodes(document)[0];
    const firstId = adapter.getStablePostId(firstNode);

    document.body.innerHTML = '';
    const second = buildSerpWithAIOverview();
    document.body.appendChild(second);
    const secondNode = adapter.findPostNodes(document)[0];
    const secondId = adapter.getStablePostId(secondNode);

    expect(firstId).toBe(secondId);
  });

  it('produces different postIds for the same content under different search queries', () => {
    document.body.appendChild(buildSerpWithAIOverview());
    const node1 = adapter.findPostNodes(document)[0];
    const id1 = adapter.getStablePostId(node1);

    window.history.replaceState({}, '', '/search?q=different+query');
    const id2 = adapter.getStablePostId(node1);

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

  it('skips blocks whose text is too short to be a meaningful AI Overview', () => {
    const root = document.createElement('div');
    const tinyAi = document.createElement('div');
    tinyAi.setAttribute('data-attrid', 'AIOverview');
    setInnerText(tinyAi, 'too short');
    root.appendChild(tinyAi);
    document.body.appendChild(root);

    expect(adapter.findPostNodes(document)).toEqual([]);
  });

  it('falls back to heading-based detection when selectors do not match', () => {
    const root = document.createElement('div');
    const wrapper = document.createElement('section');
    wrapper.setAttribute('data-hveid', 'CAAQAA');

    const heading = document.createElement('h2');
    heading.textContent = 'AI Overview';
    wrapper.appendChild(heading);

    const body = document.createElement('div');
    body.textContent = LONG_AI_BODY;
    setInnerText(body, LONG_AI_BODY);
    wrapper.appendChild(body);

    setInnerText(wrapper, `AI Overview\n${LONG_AI_BODY}`);

    root.appendChild(wrapper);
    document.body.appendChild(root);

    const found = adapter.findPostNodes(document);
    expect(found.length).toBeGreaterThanOrEqual(1);
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
