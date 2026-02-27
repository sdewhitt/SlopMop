import React from 'react';
import { usePanelClose } from '../PanelContext';

/**
 * Close button that hides the injected panel.
 * Reads the close handler from PanelContext so it works in both
 * the injected content-script panel and the standalone popup page.
 */
export default function CloseButton() {
  const closePanel = usePanelClose();

  return (
    <button
      onClick={closePanel}
      className="text-gray-400 hover:text-white transition-colors cursor-pointer"
      aria-label="Close panel"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-4 w-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  );
}
