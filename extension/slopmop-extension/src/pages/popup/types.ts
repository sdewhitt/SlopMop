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
}

export const defaultSettings: Settings = {
  sensitivity: 'medium',
  highlightStyle: 'badge',
  platforms: { twitter: true, reddit: true, facebook: true, youtube: true, linkedin: true },
  showNotifications: true,
};
