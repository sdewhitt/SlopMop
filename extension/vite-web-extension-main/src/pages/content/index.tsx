import { createRoot } from 'react-dom/client';
import { RedditAdapter } from '../../core/adapters/RedditAdapter';
import './style.css' 

const DEBUG_REDDIT_ADAPTER = true;

function renderDebugBadge() {
  const div = document.createElement('div');
  div.id = '__root';
  document.body.appendChild(div);

  const rootContainer = document.querySelector('#__root');
  if (!rootContainer) throw new Error("Can't find Content root element");
  const root = createRoot(rootContainer);
  root.render(
    <div className='absolute bottom-0 left-0 text-lg text-black bg-amber-400 z-50'  >
      content script <span className='your-class'>loaded</span>
    </div>
  );
}

function logRedditAdapterScan() {
  const adapter = new RedditAdapter();
  const siteId = adapter.getSiteId();
  const postNodes = adapter.findPostNodes(document);

  console.log(`[SlopMop] ${siteId} adapter scan`, {
    hostname: window.location.hostname,
    url: window.location.href,
    totalPosts: postNodes.length,
  });

  const sample = postNodes.slice(0, 5).map((node) => {
    const postId = adapter.getStablePostId(node);
    const permalink = adapter.getPermalink(node);
    const text = adapter.getTextNode(node)?.innerText?.trim() ?? '';
    const images = adapter.getImageNodes(node);

    return {
      postId,
      permalink,
      textPreview: text.slice(0, 120),
      imageCount: images.length,
      tag: node.tagName,
      className: (node as HTMLElement).className || null,
    };
  });

  console.table(sample);
}

function main() {
  renderDebugBadge();

  if (!DEBUG_REDDIT_ADAPTER) return;

  const isReddit = window.location.hostname.includes('reddit.com');
  console.log('[SlopMop] content script loaded', {
    url: window.location.href,
    isReddit,
  });

  if (!isReddit) return;

  // Initial scan.
  logRedditAdapterScan();

  // Rescan as Reddit dynamically injects more posts.
  const observer = new MutationObserver(() => {
    logRedditAdapterScan();
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

try {
  main();
} catch (e) {
  console.error('[SlopMop] content script error', e);
}
