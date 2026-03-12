import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InstagramOverlayRenderer } from '@src/core/InstagramOverlayRenderer';
import type { SiteAdapter } from '@src/core/adapters/SiteAdapter';
import type { DetectionResponse } from '@src/types/domain';
import { defaultUserSettings } from '@src/utils/userSettings';

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

describe('Instagram overlay rendering', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('renders a badge with classification and confidence on an Instagram post', () => {
    const postNode = document.createElement('article');
    document.body.appendChild(postNode);

    const adapter = createAdapter({
      findPostNodes: () => [postNode],
      getStablePostId: (node) => (node === postNode ? 'CxTest12345' : null),
      findVisibleCommentNodes: () => [],
    });
    const renderer = new InstagramOverlayRenderer(adapter, {
      ...defaultUserSettings.settings,
      uiMode: 'simple',
    });
    const response: DetectionResponse = {
      requestId: 'req-ig-1',
      postId: 'CxTest12345',
      verdict: 'likely_ai',
      confidence: 0.91,
      explanation: {
        summary: 'AI-generated caption detected.',
        highlights: [],
        model: { name: 'test-model', version: '1.0' },
        cache: { hit: false, ttlRemainingMs: 0 },
        timing: { totalMs: 150, inferenceMs: 120 },
      },
    };

    renderer.renderPending('CxTest12345', 'Example Instagram caption');
    renderer.renderResult('CxTest12345', response);

    const overlay = postNode.lastElementChild as HTMLElement | null;
    expect(overlay).not.toBeNull();
    expect(overlay?.textContent).toBe('likely_ai (91%)');
  });

  it('positions the badge in the top-right corner of the post', () => {
    const postNode = document.createElement('article');
    document.body.appendChild(postNode);

    const adapter = createAdapter({
      findPostNodes: () => [postNode],
      getStablePostId: (node) => (node === postNode ? 'CxPos123' : null),
      findVisibleCommentNodes: () => [],
    });
    const renderer = new InstagramOverlayRenderer(adapter, {
      ...defaultUserSettings.settings,
      uiMode: 'simple',
    });

    renderer.renderPending('CxPos123', 'Position test');

    const overlay = postNode.lastElementChild as HTMLElement | null;
    expect(overlay).not.toBeNull();
    expect(overlay?.style.top).toBe('8px');
    expect(overlay?.style.right).toBe('8px');
    // Should NOT have bottom positioning
    expect(overlay?.style.bottom).toBe('');
  });

  it('renders dual text + image results on the badge for mixed Instagram posts', () => {
    const postNode = document.createElement('article');
    document.body.appendChild(postNode);

    const adapter = createAdapter({
      findPostNodes: () => [postNode],
      getStablePostId: (node) => (node === postNode ? 'CxMixed001' : null),
      findVisibleCommentNodes: () => [],
    });
    const renderer = new InstagramOverlayRenderer(adapter, {
      ...defaultUserSettings.settings,
      uiMode: 'simple',
    });
    const response: DetectionResponse = {
      requestId: 'req-ig-dual',
      postId: 'CxMixed001',
      verdict: 'likely_ai',
      confidence: 0.88,
      explanation: {
        summary: 'Caption appears AI-generated.',
        highlights: [],
        model: { name: 'test-model', version: '1.0' },
        cache: { hit: false, ttlRemainingMs: 0 },
        timing: { totalMs: 200, inferenceMs: 160 },
      },
      imageResult: {
        verdict: 'likely_human',
        confidence: 0.22,
        summary: 'Image appears authentic.',
        model: { name: 'nonescape-mini', version: '0.1' },
        timingMs: 350,
      },
    };

    renderer.renderPending('CxMixed001', 'Caption with image');
    renderer.renderResult('CxMixed001', response);

    const overlay = postNode.lastElementChild as HTMLElement | null;
    expect(overlay).not.toBeNull();
    expect(overlay?.textContent).toContain('Text: likely_ai (88%)');
    expect(overlay?.textContent).toContain('Img: likely_human (22%)');
  });

  it('applies the correct background colour for the verdict', () => {
    const postNode = document.createElement('article');
    document.body.appendChild(postNode);

    const adapter = createAdapter({
      findPostNodes: () => [postNode],
      getStablePostId: (node) => (node === postNode ? 'CxColor01' : null),
      findVisibleCommentNodes: () => [],
    });
    const renderer = new InstagramOverlayRenderer(adapter, {
      ...defaultUserSettings.settings,
      uiMode: 'simple',
    });
    const response: DetectionResponse = {
      requestId: 'req-ig-color',
      postId: 'CxColor01',
      verdict: 'likely_human',
      confidence: 0.78,
      explanation: {
        summary: 'Appears human-written.',
        highlights: [],
        model: { name: 'test-model', version: '1.0' },
        cache: { hit: false, ttlRemainingMs: 0 },
        timing: { totalMs: 100, inferenceMs: 80 },
      },
    };

    renderer.renderPending('CxColor01', 'Human post text');
    renderer.renderResult('CxColor01', response);

    const overlay = postNode.lastElementChild as HTMLElement | null;
    expect(overlay).not.toBeNull();
    // likely_human colour is green (jsdom normalizes hex to rgb)
    expect(overlay?.style.backgroundColor).toBe('rgb(34, 197, 94)');
  });

  it('renders a retry button when detection fails on an Instagram post', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const postNode = document.createElement('article');
    document.body.appendChild(postNode);

    const adapter = createAdapter({
      findPostNodes: () => [postNode],
      getStablePostId: (node) => (node === postNode ? 'CxErr001' : null),
      findVisibleCommentNodes: () => [],
    });
    const renderer = new InstagramOverlayRenderer(adapter, {
      ...defaultUserSettings.settings,
      uiMode: 'simple',
    });
    const onRetry = vi.fn();

    renderer.renderPending('CxErr001', 'Example Instagram post');
    renderer.renderError('CxErr001', 'Backend failed', onRetry);

    const overlay = postNode.lastElementChild as HTMLElement | null;
    const retryButton = overlay?.querySelector('button');

    expect(overlay?.textContent).toContain('Error');
    expect(retryButton?.textContent).toBe(' · Retry');
    retryButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(overlay?.textContent).toBe('Scanning...');
    errorSpy.mockRestore();
  });
});
