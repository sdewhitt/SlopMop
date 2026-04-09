import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeedObserver } from '@src/core/FeedObserver';
import { PostExtractor } from '@src/core/PostExtractor';
import { OverlayRenderer } from '@src/core/OverlayRenderer';
import type { SiteAdapter } from '@src/core/adapters/SiteAdapter';
import type { ExtensionMessageBus } from '@src/core/ExtensionMessageBus';
import { defaultUserSettings } from '@src/utils/userSettings';

function setInnerText(element: HTMLElement, value: string): void {
  Object.defineProperty(element, 'innerText', {
    configurable: true,
    get: () => value,
  });
}

function createAdapter(overrides: Partial<SiteAdapter> = {}): SiteAdapter {
  return {
    getSiteId: () => 'reddit.com',
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

function makePost(id: string, text: string): { node: HTMLElement; textNode: HTMLElement } {
  const node = document.createElement('article');
  node.setAttribute('data-post-id', id);
  const textNode = document.createElement('div');
  setInnerText(textNode, text);
  node.appendChild(textNode);
  return { node, textNode };
}

describe('FeedObserver pause / resume (tab visibility)', () => {
  let disconnectSpy: ReturnType<typeof vi.fn>;
  let observeSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();

    disconnectSpy = vi.fn();
    observeSpy = vi.fn();
    vi.stubGlobal(
      'MutationObserver',
      class {
        constructor(private cb: MutationCallback) {}
        observe = observeSpy;
        disconnect = disconnectSpy;
        takeRecords = () => [];
      },
    );
  });

  function buildObserver(
    adapterOverrides: Partial<SiteAdapter> = {},
    settingsOverrides: Partial<typeof defaultUserSettings.settings> = {},
  ) {
    const adapter = createAdapter(adapterOverrides);
    const extractor = new PostExtractor();
    const sendAnalyze = vi.fn();
    const renderPending = vi.fn();
    const observer = new FeedObserver(
      adapter,
      extractor,
      { renderPending } as unknown as OverlayRenderer,
      { sendAnalyze } as unknown as ExtensionMessageBus,
      { ...defaultUserSettings.settings, ...settingsOverrides },
    );
    return { observer, sendAnalyze, renderPending };
  }

  it('pause disconnects the MutationObserver and sets paused flag', () => {
    const { observer } = buildObserver();
    observer.start();
    expect(observeSpy).toHaveBeenCalledTimes(1);

    observer.pause();

    expect(disconnectSpy).toHaveBeenCalledTimes(1);
    expect((observer as any).paused).toBe(true);
  });

  it('resume reconnects the MutationObserver and clears paused flag', () => {
    const { observer } = buildObserver();
    observer.start();
    observer.pause();

    observer.resume();

    expect(observeSpy).toHaveBeenCalledTimes(2);
    expect((observer as any).paused).toBe(false);
  });

  it('resume runs a catch-up scanAndProcess that finds new posts', () => {
    const post = makePost('t3_catchup', 'Catch-up post');
    let posts: HTMLElement[] = [];
    const { observer, sendAnalyze } = buildObserver(
      {
        findPostNodes: () => posts,
        getStablePostId: (node) => node.getAttribute('data-post-id'),
        getPermalink: () => 'https://reddit.com/r/test/catchup',
        getTextNode: (node) => node.querySelector('div'),
      },
      { automaticScanning: true },
    );

    observer.start();
    expect(sendAnalyze).not.toHaveBeenCalled();

    observer.pause();

    // Post appears in DOM while tab is hidden
    posts = [post.node];

    observer.resume();

    expect(sendAnalyze).toHaveBeenCalledWith(
      expect.objectContaining({ postId: 't3_catchup' }),
    );
  });

  it('scanAndProcess is a no-op while paused', () => {
    const post = makePost('t3_blocked', 'Should not be scanned');
    const { observer, sendAnalyze } = buildObserver(
      {
        findPostNodes: () => [post.node],
        getStablePostId: (node) => node.getAttribute('data-post-id'),
        getPermalink: () => 'https://reddit.com/r/test/blocked',
        getTextNode: (node) => node.querySelector('div'),
      },
      { automaticScanning: true },
    );

    observer.start();
    sendAnalyze.mockClear();

    observer.pause();
    observer.scanEntirePage();

    expect(sendAnalyze).not.toHaveBeenCalled();
  });

  it('debounced mutation scan does not fire while paused', () => {
    const post = makePost('t3_debounce', 'Debounce test');
    const { observer, sendAnalyze } = buildObserver(
      {
        findPostNodes: () => [post.node],
        getStablePostId: (node) => node.getAttribute('data-post-id'),
        getPermalink: () => 'https://reddit.com/r/test/debounce',
        getTextNode: (node) => node.querySelector('div'),
      },
      { automaticScanning: true },
    );

    observer.start();
    sendAnalyze.mockClear();

    // Trigger a mutation, then pause before debounce fires
    (observer as any).onDomMutated();
    observer.pause();

    // The pending debounce timer should have been cleared by pause()
    vi.advanceTimersByTime(500);

    expect(sendAnalyze).not.toHaveBeenCalled();
  });

  it('preserves seenPostIds and postsById across pause/resume', () => {
    const post = makePost('t3_preserve', 'Preserved post');
    const { observer, sendAnalyze } = buildObserver(
      {
        findPostNodes: () => [post.node],
        getStablePostId: (node) => node.getAttribute('data-post-id'),
        getPermalink: () => 'https://reddit.com/r/test/preserve',
        getTextNode: (node) => node.querySelector('div'),
      },
      { automaticScanning: true },
    );

    observer.start();
    expect(sendAnalyze).toHaveBeenCalledTimes(1);
    sendAnalyze.mockClear();

    observer.pause();
    observer.resume();

    // Post was already seen before pause — should NOT be dispatched again
    expect(sendAnalyze).not.toHaveBeenCalled();
    expect((observer as any).seenPostIds.has('t3_preserve')).toBe(true);
    expect((observer as any).postsById.has('t3_preserve')).toBe(true);
  });

  it('pause is idempotent — calling it twice does not throw or double-disconnect', () => {
    const { observer } = buildObserver();
    observer.start();

    observer.pause();
    observer.pause();

    expect(disconnectSpy).toHaveBeenCalledTimes(1);
  });

  it('resume is idempotent — calling it when not paused does nothing', () => {
    const { observer } = buildObserver();
    observer.start();
    const callsBefore = observeSpy.mock.calls.length;

    observer.resume();

    expect(observeSpy).toHaveBeenCalledTimes(callsBefore);
  });

  it('pause before start is a no-op', () => {
    const { observer } = buildObserver();
    observer.pause();
    expect((observer as any).paused).toBe(false);
  });

  it('stop after pause resets paused flag', () => {
    const { observer } = buildObserver();
    observer.start();
    observer.pause();
    observer.stop();
    expect((observer as any).paused).toBe(false);
  });

  it('clears navigation scan timers on pause', () => {
    const { observer } = buildObserver();
    observer.start();
    observer.schedulePostNavigationScans();

    expect((observer as any).navScanTimers.length).toBe(5);

    observer.pause();

    expect((observer as any).navScanTimers.length).toBe(0);
  });

  it('clears navigation scan timers on stop', () => {
    const { observer } = buildObserver();
    observer.start();
    observer.schedulePostNavigationScans();

    observer.stop();

    expect((observer as any).navScanTimers.length).toBe(0);
  });
});
