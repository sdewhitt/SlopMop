import React from 'react';
import { createRoot } from 'react-dom/client';
import '@pages/popup/index.css';
import '@assets/styles/tailwind.css';
import '@assets/styles/accessibility-mode.css';
import Popup from '@pages/popup/Popup';
import { AuthProvider } from '../../hooks/useAuth';
import { PanelProvider } from './PanelContext';
import { ThemeProvider } from '../../hooks/useTheme'; // for dark/light mode (story 30)

function init() {
  const rootContainer = document.querySelector("#__root");
  if (!rootContainer) throw new Error("Can't find Popup root element");
  const root = createRoot(rootContainer);
  root.render(
    <ThemeProvider>
      <PanelProvider closePanel={() => window.close()}>
        <AuthProvider>
          <Popup />
        </AuthProvider>
      </PanelProvider>
    </ThemeProvider>
  );
}

init();
