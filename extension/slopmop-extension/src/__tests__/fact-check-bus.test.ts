import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExtensionMessageBus } from '@src/core/ExtensionMessageBus';

describe('ExtensionMessageBus fact-check', () => {
  beforeEach(() => {
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage: vi.fn().mockResolvedValue(undefined),
        onMessage: { addListener: vi.fn() },
      },
    });
  });

  it('sendFactCheck posts SLOPMOP_FACT_CHECK with postId and text', async () => {
    const send = vi.mocked(chrome.runtime.sendMessage);
    const bus = new ExtensionMessageBus();
    await bus.sendFactCheck('post-1', 'Hello world. Second sentence.');
    expect(send).toHaveBeenCalledWith({
      type: 'SLOPMOP_FACT_CHECK',
      postId: 'post-1',
      text: 'Hello world. Second sentence.',
    });
  });

  it('sendFactCheck includes optional site + contentFingerprint', async () => {
    const send = vi.mocked(chrome.runtime.sendMessage);
    const bus = new ExtensionMessageBus();
    await bus.sendFactCheck('post-1', 'Hello', {
      site: 'reddit.com',
      contentFingerprint: 'fp-text-only-1',
    });
    expect(send).toHaveBeenCalledWith({
      type: 'SLOPMOP_FACT_CHECK',
      postId: 'post-1',
      text: 'Hello',
      site: 'reddit.com',
      contentFingerprint: 'fp-text-only-1',
    });
  });
});
