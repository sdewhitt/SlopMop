import { beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { LinkedInOverlayRenderer } from '@src/core/LinkedInOverlayRenderer';
import type { SiteAdapter } from '@src/core/adapters/SiteAdapter';
import type { DetectionResponse } from '@src/types/domain';
import { defaultUserSettings } from '@src/utils/userSettings';

// Minimal SiteAdapter stub for overlay tests. Only methods used by the renderer
// need overrides; the rest are no ops.
function createAdapter(overrides: Partial<SiteAdapter> = {}): SiteAdapter {
  return {
    getSiteId: () => 'linkedin.com',
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

describe('LinkedInOverlayRenderer UI', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('positions the Detect Now badge at top-right (top: 48px, right: 8px) of the post', () => {
    // LinkedInOverlayRenderer overrides getBadgePosition to place the badge
    // below the post header (top: 48px) instead of bottom-right.
    const postNode = document.createElement('article');
    postNode.style.position = 'relative';
    document.body.appendChild(postNode);

    const adapter = createAdapter({
      findPostNodes: () => [postNode],
      getStablePostId: () => 'li-activity-123',
      findVisibleCommentNodes: () => [],
    });
    const renderer = new LinkedInOverlayRenderer(adapter, {
      ...defaultUserSettings.settings,
      uiMode: 'simple',
    });

    renderer.renderPending('li-activity-123', postNode, 'LinkedIn post text', () => {});

    const overlay = postNode.querySelector('[style*="position: absolute"]') as HTMLElement;
    expect(overlay).not.toBeNull();
    expect(overlay?.style.top).toBe('48px');
    expect(overlay?.style.right).toBe('8px');
    // Should NOT have bottom positioning (unlike default OverlayRenderer).
    expect(overlay?.style.bottom).toBe('');
  });

  it('renders Detect Now button, shows result badge on click, and applies verdict styling', async () => {
    // Step 1: render pending with onDetectNow callback (manual mode).
    // Step 2: click triggers callback and switches to "Scanning...".
    // Step 3: renderResult updates the same overlay with verdict and colour.
    const user = userEvent.setup();
    const postNode = document.createElement('article');
    postNode.style.position = 'relative';
    document.body.appendChild(postNode);

    const adapter = createAdapter({
      findPostNodes: () => [postNode],
      getStablePostId: () => 'li-activity-456',
      findVisibleCommentNodes: () => [],
    });
    const renderer = new LinkedInOverlayRenderer(adapter, {
      ...defaultUserSettings.settings,
      uiMode: 'simple',
    });

    const onDetectNow = vi.fn();
    renderer.renderPending('li-activity-456', postNode, 'Post content', onDetectNow);

    const detectButton = postNode.querySelector('button');
    expect(detectButton).not.toBeNull();
    expect(detectButton?.textContent).toBe('Detect Now');

    await user.click(detectButton!);
    expect(onDetectNow).toHaveBeenCalledTimes(1);
    // After click, overlay shows "Scanning..." until renderResult is called.
    expect(postNode.querySelector('[style*="position: absolute"]')?.textContent).toBe('Scanning...');

    const response: DetectionResponse = {
      requestId: 'req-li-1',
      postId: 'li-activity-456',
      verdict: 'likely_ai',
      confidence: 0.92,
      explanation: {
        summary: 'AI-generated post detected.',
        highlights: [],
        model: { name: 'test-model', version: '1.0' },
        cache: { hit: false, ttlRemainingMs: 0 },
        timing: { totalMs: 120, inferenceMs: 100 },
      },
    };
    renderer.renderResult('li-activity-456', response);

    const badge = postNode.querySelector('[style*="position: absolute"]') as HTMLElement;
    expect(badge?.textContent).toBe('likely_ai (92%)');
    // likely_ai uses red (#ef4444); jsdom normalizes to rgb.
    expect(badge?.style.backgroundColor).toBe('rgb(239, 68, 68)');
  });

  it('applies configured badge size on LinkedIn badges', () => {
    const smallNode = document.createElement('article');
    const largeNode = document.createElement('article');
    smallNode.style.position = 'relative';
    largeNode.style.position = 'relative';
    document.body.append(smallNode, largeNode);

    const adapter = createAdapter();
    const smallRenderer = new LinkedInOverlayRenderer(adapter, {
      ...defaultUserSettings.settings,
      uiMode: 'simple',
      badgeSize: 'small',
    });
    const largeRenderer = new LinkedInOverlayRenderer(adapter, {
      ...defaultUserSettings.settings,
      uiMode: 'simple',
      badgeSize: 'large',
    });

    smallRenderer.renderPending('li-size-small', smallNode, 'small', () => {});
    largeRenderer.renderPending('li-size-large', largeNode, 'large', () => {});

    const smallBadge = smallNode.querySelector('[style*="position: absolute"]') as HTMLElement;
    const largeBadge = largeNode.querySelector('[style*="position: absolute"]') as HTMLElement;
    expect(parseFloat(largeBadge.style.fontSize)).toBeGreaterThan(parseFloat(smallBadge.style.fontSize));
  });
});
