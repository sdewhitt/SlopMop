import type { DetectionLanguageCode } from '../../utils/userSettings';

export interface Stats {
  postsScanned: number;
  aiDetected: number;
  postsProcessing: number;
}

export interface Settings {
  sensitivity: 'low' | 'medium' | 'high';
  highlightStyle: 'badge' | 'border' | 'dim';
  automaticScanning: boolean;
  platforms: {
    twitter: boolean;
    reddit: boolean;
    facebook: boolean;
    instagram: boolean;
    youtube: boolean;
    linkedin: boolean;
  };
  showNotifications: boolean;
  enabled: boolean;
  scanText: boolean;
  scanImages: boolean;
  scanComments: 'off' | 'user_triggered' | 'auto_top_n';
  uiMode: 'simple' | 'detailed';
  badgeSize: 'small' | 'medium' | 'large';
  badgePosition: 'top_right' | 'top_left' | 'bottom_right';
  detectionTheme: 'default' | 'high_contrast' | 'minimal';
  accessibilityMode: boolean;
  highlightSegments: boolean;
  /** Show Fact check on posts (ClaimReview search via backend). */
  factCheck: boolean;
  /** When on, automatic scanning is off and its toggle is locked until this is turned off. */
  lowBatteryMode: boolean;
  /**
   * When on, low-battery mode applies automatically while unplugged and below the low threshold;
   * clears when charging or above the resume threshold (saved scanning prefs unchanged).
   */
  lowBatteryModeAutoWhenBatteryLow: boolean;
  detectionLanguages: DetectionLanguageCode[];
}

export const defaultSettings: Settings = {
  sensitivity: 'medium',
  highlightStyle: 'badge',
  automaticScanning: false,
  platforms: { twitter: true, reddit: true, facebook: true, instagram: true, youtube: true, linkedin: true },
  showNotifications: true,
  enabled: true,
  scanText: true,
  scanImages: false,
  scanComments: 'auto_top_n',
  uiMode: 'simple',
  badgeSize: 'medium',
  badgePosition: 'top_right',
  detectionTheme: 'default',
  accessibilityMode: false,
  highlightSegments: true,
  factCheck: true,
  lowBatteryMode: false,
  lowBatteryModeAutoWhenBatteryLow: false,
  detectionLanguages: ['eng', 'spa', 'fra'],
};
