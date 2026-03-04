export interface Stats {
  postsScanned: number;
  aiDetected: number;
  postsProcessing: number;
}

export interface Settings {
  sensitivity: 'low' | 'medium' | 'high';
  highlightStyle: 'badge' | 'border' | 'dim';
  platforms: {
    twitter: boolean;
    reddit: boolean;
    facebook: boolean;
    youtube: boolean;
    linkedin: boolean;
  };
  showNotifications: boolean;
  enabled: boolean;
  scanText: boolean;
  scanImages: boolean;
  scanComments: 'off' | 'user_triggered' | 'auto_top_n';
  uiMode: 'simple' | 'detailed';
}

export const defaultSettings: Settings = {
  sensitivity: 'medium',
  highlightStyle: 'badge',
  platforms: { twitter: true, reddit: true, facebook: true, youtube: true, linkedin: true },
  showNotifications: true,
  enabled: true,
  scanText: true,
  scanImages: false,
  scanComments: 'auto_top_n',
  uiMode: 'simple',
};
