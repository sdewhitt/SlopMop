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

    renderer.renderPending('CxTest12345', postNode, 'Example Instagram caption');
    renderer.renderResult('CxTest12345', response);

    const overlay = postNode.lastElementChild as HTMLElement | null;
    expect(overlay).not.toBeNull();
    expect(overlay?.textContent).toContain('likely_ai (91%)');
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

    renderer.renderPending('CxPos123', postNode, 'Position test');

    const overlay = postNode.lastElementChild as HTMLElement | null;
    expect(overlay).not.toBeNull();
    expect(overlay?.style.top).toBe('48px');
    expect(overlay?.style.right).toBe('8px');
    // Should NOT have bottom positioning
    expect(overlay?.style.bottom).toBe('');
  });

  it('positions comment badges near the comment host instead of post offset', () => {
    const commentNode = document.createElement('li');
    commentNode.setAttribute('role', 'listitem');
    document.body.appendChild(commentNode);

    const adapter = createAdapter();
    const renderer = new InstagramOverlayRenderer(adapter, {
      ...defaultUserSettings.settings,
      uiMode: 'simple',
    });

    renderer.renderPending('ig-comment-pos', commentNode, 'Comment content');

    const overlay = commentNode.lastElementChild as HTMLElement | null;
    expect(overlay).not.toBeNull();
    expect(overlay?.style.top).toBe('calc(100% + 4px)');
    expect(overlay?.style.right).toBe('4px');
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

    renderer.renderPending('CxMixed001', postNode, 'Caption with image');
    renderer.renderResult('CxMixed001', response);

    const overlay = postNode.lastElementChild as HTMLElement | null;
    expect(overlay).not.toBeNull();
    expect(overlay?.textContent).toContain('Text: likely_ai (88%)');
    expect(overlay?.textContent).toContain('Image: likely_human (22%)');
  });

  it('labels mixed results as video when mediaType is video', () => {
    const postNode = document.createElement('article');
    document.body.appendChild(postNode);

    const adapter = createAdapter({
      findPostNodes: () => [postNode],
      getStablePostId: (node) => (node === postNode ? 'CxMixedVideo' : null),
      findVisibleCommentNodes: () => [],
    });
    const renderer = new InstagramOverlayRenderer(adapter, {
      ...defaultUserSettings.settings,
      uiMode: 'simple',
    });
    const response: DetectionResponse = {
      requestId: 'req-ig-video',
      postId: 'CxMixedVideo',
      verdict: 'likely_ai',
      confidence: 0.81,
      explanation: {
        summary: 'Caption looks synthetic.',
        highlights: [],
        model: { name: 'test-model', version: '1.0' },
        cache: { hit: false, ttlRemainingMs: 0 },
        timing: { totalMs: 210, inferenceMs: 170 },
      },
      imageResult: {
        verdict: 'likely_ai',
        confidence: 0.76,
        summary: 'Frame looks AI-generated.',
        model: { name: 'nonescape-mini', version: '0.1' },
        timingMs: 340,
        mediaType: 'video',
      },
    };

    renderer.renderPending('CxMixedVideo', postNode, 'Caption with reel');
    renderer.renderResult('CxMixedVideo', response);

    const overlay = postNode.lastElementChild as HTMLElement | null;
    expect(overlay).not.toBeNull();
    expect(overlay?.textContent).toContain('Video: likely_ai (76%)');
  });

  it('labels mixed results as GIF when mediaType is gif', () => {
    const postNode = document.createElement('article');
    document.body.appendChild(postNode);

    const adapter = createAdapter({
      findPostNodes: () => [postNode],
      getStablePostId: (node) => (node === postNode ? 'CxMixedGif' : null),
      findVisibleCommentNodes: () => [],
    });
    const renderer = new InstagramOverlayRenderer(adapter, {
      ...defaultUserSettings.settings,
      uiMode: 'simple',
    });
    const response: DetectionResponse = {
      requestId: 'req-ig-gif',
      postId: 'CxMixedGif',
      verdict: 'likely_ai',
      confidence: 0.79,
      explanation: {
        summary: 'Caption looks synthetic.',
        highlights: [],
        model: { name: 'test-model', version: '1.0' },
        cache: { hit: false, ttlRemainingMs: 0 },
        timing: { totalMs: 210, inferenceMs: 170 },
      },
      imageResult: {
        verdict: 'likely_human',
        confidence: 0.21,
        summary: 'GIF appears authentic.',
        model: { name: 'nonescape-mini', version: '0.1' },
        timingMs: 300,
        mediaType: 'gif',
      },
    };

    renderer.renderPending('CxMixedGif', postNode, 'Caption with gif');
    renderer.renderResult('CxMixedGif', response);

    const overlay = postNode.lastElementChild as HTMLElement | null;
    expect(overlay).not.toBeNull();
    expect(overlay?.textContent).toContain('GIF: likely_human (21%)');
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

    renderer.renderPending('CxColor01', postNode, 'Human post text');
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

    renderer.renderPending('CxErr001', postNode, 'Example Instagram post');
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

  it('keeps only one Detect Now overlay per grid tile when the same node is rendered twice', () => {
    const postNode = document.createElement('div');
    document.body.appendChild(postNode);

    const adapter = createAdapter();
    const renderer = new InstagramOverlayRenderer(adapter, {
      ...defaultUserSettings.settings,
      uiMode: 'simple',
      automaticScanning: false,
    });

    renderer.renderPending('first-id', postNode, 'First pass', () => {});
    renderer.renderPending('second-id', postNode, 'Second pass', () => {});

    const overlays = postNode.querySelectorAll('[data-slopmop-overlay="1"]');
    const buttons = postNode.querySelectorAll('button');

    expect(overlays).toHaveLength(1);
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toBe('Detect Now');
  });

  it('does not bubble Detect Now click events to parent containers', () => {
    const host = document.createElement('div');
    const parentClick = vi.fn();
    host.addEventListener('click', parentClick);
    document.body.appendChild(host);

    const adapter = createAdapter();
    const renderer = new InstagramOverlayRenderer(adapter, {
      ...defaultUserSettings.settings,
      uiMode: 'simple',
      automaticScanning: false,
    });

    const onDetectNow = vi.fn();
    renderer.renderPending('click-safe', host, 'modal caption', onDetectNow);

    const button = host.querySelector('button');
    expect(button).not.toBeNull();
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(onDetectNow).toHaveBeenCalledTimes(1);
    expect(parentClick).toHaveBeenCalledTimes(0);
  });

  it('raises explanation tooltip above adjacent detect-now overlays', () => {
    vi.useFakeTimers();
    try {
    const leftHost = document.createElement('article');
    const rightHost = document.createElement('article');
    document.body.appendChild(leftHost);
    document.body.appendChild(rightHost);

    const adapter = createAdapter();
    const renderer = new InstagramOverlayRenderer(adapter, {
      ...defaultUserSettings.settings,
      uiMode: 'simple',
      automaticScanning: false,
    });

    renderer.renderPending('left-post', leftHost, 'Left caption');
    renderer.renderPending('right-post', rightHost, 'Right caption', () => {});

    const response: DetectionResponse = {
      requestId: 'req-ig-layer',
      postId: 'left-post',
      verdict: 'likely_ai',
      confidence: 0.87,
      explanation: {
        summary: 'Tooltip should be top layer.',
        highlights: [],
        model: { name: 'test-model', version: '1.0' },
        cache: { hit: false, ttlRemainingMs: 0 },
        timing: { totalMs: 120, inferenceMs: 90 },
      },
    };

    renderer.renderResult('left-post', response);

    const leftOverlay = leftHost.lastElementChild as HTMLElement | null;
    expect(leftOverlay).not.toBeNull();
    expect(leftOverlay?.style.zIndex).toBe('9999');

    leftOverlay?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));

    const tooltip = Array.from(document.body.querySelectorAll('div')).find((el) =>
      (el as HTMLElement).textContent?.includes('Tooltip should be top layer.'),
    ) as HTMLElement | undefined;
    expect(leftOverlay?.style.zIndex).toBe('2147483646');
    expect(tooltip?.style.zIndex).toBe('2147483647');

    leftOverlay?.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));
    const tooltipAfterLeave = Array.from(document.body.querySelectorAll('div')).find((el) =>
      (el as HTMLElement).textContent?.includes('Tooltip should be top layer.'),
    );
    expect(tooltipAfterLeave).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('hides tooltip when leaving the badge', () => {
    vi.useFakeTimers();
    try {
      const host = document.createElement('article');
      document.body.appendChild(host);

      const adapter = createAdapter();
      const renderer = new InstagramOverlayRenderer(adapter, {
        ...defaultUserSettings.settings,
        uiMode: 'simple',
      });

      renderer.renderPending('gap-post', host, 'Gap crossing caption');
      renderer.renderResult('gap-post', {
        requestId: 'req-gap',
        postId: 'gap-post',
        verdict: 'likely_ai',
        confidence: 0.9,
        explanation: {
          summary: 'Hover bridge behavior test.',
          highlights: [],
          model: { name: 'test-model', version: '1.0' },
          cache: { hit: false, ttlRemainingMs: 0 },
          timing: { totalMs: 110, inferenceMs: 80 },
        },
      });

      const overlay = host.lastElementChild as HTMLElement | null;
      expect(overlay).not.toBeNull();

      overlay?.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
      const tooltip = Array.from(document.body.querySelectorAll('div')).find((el) =>
        (el as HTMLElement).textContent?.includes('Hover bridge behavior test.'),
      ) as HTMLElement | undefined;
      expect(tooltip).toBeDefined();

      overlay?.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));

      const tooltipAfterLeave = Array.from(document.body.querySelectorAll('div')).find((el) =>
        (el as HTMLElement).textContent?.includes('Hover bridge behavior test.'),
      );
      expect(tooltipAfterLeave).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});
