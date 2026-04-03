import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { XOverlayRenderer } from '@src/core/XOverlayRenderer';
import type { SiteAdapter } from '@src/core/adapters/SiteAdapter';
import type { DetectionResponse } from '@src/types/domain';
import { defaultUserSettings } from '@src/utils/userSettings';

function createAdapter(overrides: Partial<SiteAdapter> = {}): SiteAdapter {
  return {
    getSiteId: () => 'x.com',
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

describe('XOverlayRenderer UI', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('positions the badge in the top header, left of Grok/menu (inset from card right)', () => {
    const postNode = document.createElement('article');
    postNode.setAttribute('data-testid', 'tweet');
    postNode.style.position = 'relative';
    document.body.appendChild(postNode);

    const adapter = createAdapter({
      findPostNodes: () => [postNode],
      getStablePostId: () => 'x-status-1',
      findVisibleCommentNodes: () => [],
    });
    const renderer = new XOverlayRenderer(adapter, {
      ...defaultUserSettings.settings,
      uiMode: 'simple',
    });

    renderer.renderPending('x-status-1', postNode, 'Post', () => {});

    const overlay = postNode.querySelector('[style*="position: absolute"]') as HTMLElement;
    expect(overlay).not.toBeNull();
    expect(overlay?.style.top).toBe('6px');
    expect(overlay?.style.right).toBe('88px');
    expect(overlay?.style.bottom).toBe('');
  });

  it('renders Detect Now, then result after click', async () => {
    const user = userEvent.setup();
    const postNode = document.createElement('article');
    postNode.style.position = 'relative';
    document.body.appendChild(postNode);

    const adapter = createAdapter({
      findPostNodes: () => [postNode],
      getStablePostId: () => 'x-status-2',
      findVisibleCommentNodes: () => [],
    });
    const renderer = new XOverlayRenderer(adapter, {
      ...defaultUserSettings.settings,
      uiMode: 'simple',
    });

    const onDetectNow = vi.fn();
    renderer.renderPending('x-status-2', postNode, 'Hello', onDetectNow);

    const detectButton = postNode.querySelector('button');
    expect(detectButton?.textContent).toBe('Detect Now');

    await user.click(detectButton!);
    expect(onDetectNow).toHaveBeenCalledTimes(1);
    expect(postNode.querySelector('[style*="position: absolute"]')?.textContent).toBe(
      'Scanning...',
    );

    const response: DetectionResponse = {
      requestId: 'req-x-1',
      postId: 'x-status-2',
      verdict: 'likely_human',
      confidence: 0.88,
      explanation: {
        summary: 'Looks human.',
        highlights: [],
        model: { name: 'test', version: '1' },
        cache: { hit: false, ttlRemainingMs: 0 },
        timing: { totalMs: 50, inferenceMs: 40 },
      },
    };
    renderer.renderResult('x-status-2', response);

    const badge = postNode.querySelector('[style*="position: absolute"]') as HTMLElement;
    expect(badge?.textContent).toContain('likely_human (88%)');
  });
});
