import React, { createContext, useContext } from 'react';

interface PanelContextType {
  closePanel: () => void;
}

const PanelContext = createContext<PanelContextType>({ closePanel: () => {} });

export function PanelProvider({
  closePanel,
  children,
}: {
  closePanel: () => void;
  children: React.ReactNode;
}) {
  return (
    <PanelContext.Provider value={{ closePanel }}>
      {children}
    </PanelContext.Provider>
  );
}

export function usePanelClose() {
  return useContext(PanelContext).closePanel;
}
