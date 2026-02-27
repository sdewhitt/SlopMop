import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import {
  defaultUserSettings,
  type UserSettings,
  type DetectionSettings,
  type DetectionStats,
} from '../lib/userSettings'

// Pull the mocked Firestore service so we can inspect calls
const firestoreMock = jest.requireMock('../lib/firestore') as {
  getUserSettings: jest.Mock
  createUserSettings: jest.Mock
  getOrCreateUserSettings: jest.Mock
  updateDetectionSettings: jest.Mock
  updateDetectionStats: jest.Mock
  updateIgnoredSites: jest.Mock
  addIgnoredSite: jest.Mock
  removeIgnoredSite: jest.Mock
  resetStats: jest.Mock
  resetSettings: jest.Mock
}

const sampleSettings: UserSettings = {
  ...defaultUserSettings,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('User Settings – Firestore service layer', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  // ── Read / Create ─────────────────────────────────────────────

  it('getUserSettings returns null when document does not exist', async () => {
    firestoreMock.getUserSettings.mockResolvedValueOnce(null)
    const result = await firestoreMock.getUserSettings('uid-123')
    expect(result).toBeNull()
    expect(firestoreMock.getUserSettings).toHaveBeenCalledWith('uid-123')
  })

  it('createUserSettings returns a full settings object', async () => {
    firestoreMock.createUserSettings.mockResolvedValueOnce(sampleSettings)
    const result = await firestoreMock.createUserSettings('uid-123')
    expect(result).toEqual(sampleSettings)
    expect(result.ignoredSites).toEqual([])
    expect(result.stats.postsScanned).toBe(0)
  })

  it('getOrCreateUserSettings creates defaults when missing', async () => {
    firestoreMock.getOrCreateUserSettings.mockResolvedValueOnce(sampleSettings)
    const result = await firestoreMock.getOrCreateUserSettings('uid-new')
    expect(result.settings.sensitivity).toBe('medium')
    expect(result.settings.platforms.twitter).toBe(true)
  })

  // ── Ignored Sites ─────────────────────────────────────────────

  it('supports updates to ignored sites list', async () => {
    const sites = ['example.com', 'spam.net']
    await firestoreMock.updateIgnoredSites('uid-123', sites)
    expect(firestoreMock.updateIgnoredSites).toHaveBeenCalledWith('uid-123', sites)
  })

  it('adds a single ignored site', async () => {
    await firestoreMock.addIgnoredSite('uid-123', 'noisy-blog.com')
    expect(firestoreMock.addIgnoredSite).toHaveBeenCalledWith('uid-123', 'noisy-blog.com')
  })

  it('removes a single ignored site', async () => {
    await firestoreMock.removeIgnoredSite('uid-123', 'noisy-blog.com')
    expect(firestoreMock.removeIgnoredSite).toHaveBeenCalledWith('uid-123', 'noisy-blog.com')
  })

  // ── Detection Settings ────────────────────────────────────────

  it('saves detection preferences', async () => {
    const patch: Partial<DetectionSettings> = { sensitivity: 'high' }
    await firestoreMock.updateDetectionSettings('uid-123', patch)
    expect(firestoreMock.updateDetectionSettings).toHaveBeenCalledWith('uid-123', patch)
  })

  // ── Stats ─────────────────────────────────────────────────────

  it('saves detection stats', async () => {
    const stats: DetectionStats = { postsScanned: 42, aiDetected: 7, postsProcessing: 1 }
    await firestoreMock.updateDetectionStats('uid-123', stats)
    expect(firestoreMock.updateDetectionStats).toHaveBeenCalledWith('uid-123', stats)
  })

  it('resets stats to zero', async () => {
    await firestoreMock.resetStats('uid-123')
    expect(firestoreMock.resetStats).toHaveBeenCalledWith('uid-123')
  })

  it('resets settings to defaults', async () => {
    await firestoreMock.resetSettings('uid-123')
    expect(firestoreMock.resetSettings).toHaveBeenCalledWith('uid-123')
  })
})

describe('User Settings – default values', () => {
  it('has empty ignoredSites by default', () => {
    expect(defaultUserSettings.ignoredSites).toEqual([])
  })

  it('has zero stats by default', () => {
    expect(defaultUserSettings.stats).toEqual({
      postsScanned: 0,
      aiDetected: 0,
      postsProcessing: 0,
    })
  })

  it('has medium sensitivity by default', () => {
    expect(defaultUserSettings.settings.sensitivity).toBe('medium')
  })

  it('enables all platforms by default', () => {
    const platforms = defaultUserSettings.settings.platforms
    expect(platforms.twitter).toBe(true)
    expect(platforms.reddit).toBe(true)
    expect(platforms.facebook).toBe(true)
    expect(platforms.youtube).toBe(true)
    expect(platforms.linkedin).toBe(true)
  })
})

/* ═══════════════════════════════════════════════════════════════════════════ */
/* Settings Page – rendering tests                                            */
/* ═══════════════════════════════════════════════════════════════════════════ */

// We need to control useAuth per-test.  The global mock in jest.setup.ts
// returns user: null by default.  We override it for the "logged-in" tests.
import SettingsPage from '../settings/page'

// Get the underlying mock function exposed via jest.setup.ts
const authModule = jest.requireMock('../context/AuthContext') as {
  useAuth: jest.Mock
  AuthProvider: unknown
}

// Keep original reference so we can restore it
const originalUseAuth = authModule.useAuth

function setAuthUser(user: object | null) {
  authModule.useAuth = jest.fn(() => ({
    user,
    loading: false,
    signUp: jest.fn(),
    logIn: jest.fn(),
    signInWithGoogle: jest.fn(),
    logOut: jest.fn(),
  }))
}

function restoreAuthDefault() {
  authModule.useAuth = originalUseAuth
}

describe('Settings Page – logged-out user', () => {
  beforeEach(() => {
    restoreAuthDefault()
  })

  it('shows sign-in required message when not logged in', () => {
    render(<SettingsPage />)
    expect(screen.getByText('Sign in required')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Log In/i })).toHaveAttribute('href', '/login')
  })

  it('does not show settings sections when not logged in', () => {
    render(<SettingsPage />)
    expect(screen.queryByText('Detection')).not.toBeInTheDocument()
    expect(screen.queryByText('Platforms')).not.toBeInTheDocument()
  })
})

describe('Settings Page – logged-in user', () => {
  beforeEach(() => {
    setAuthUser({ uid: 'test-uid', email: 'test@example.com' })
  })

  afterEach(() => {
    restoreAuthDefault()
  })

  it('renders the Settings heading', () => {
    render(<SettingsPage />)
    expect(screen.getByRole('heading', { name: /Settings/i })).toBeInTheDocument()
  })

  it('renders Statistics section with stat cards', () => {
    render(<SettingsPage />)
    expect(screen.getByText('Statistics')).toBeInTheDocument()
    expect(screen.getByText('Posts Scanned')).toBeInTheDocument()
    expect(screen.getByText('Processing')).toBeInTheDocument()
    expect(screen.getByText('AI Detected')).toBeInTheDocument()
  })

  it('renders Detection section with controls', () => {
    render(<SettingsPage />)
    expect(screen.getByText('Detection')).toBeInTheDocument()
    expect(screen.getByText('Show Notifications')).toBeInTheDocument()
    expect(screen.getByText('Sensitivity')).toBeInTheDocument()
    expect(screen.getByText('Highlight Style')).toBeInTheDocument()
  })

  it('renders sensitivity options', () => {
    render(<SettingsPage />)
    expect(screen.getByRole('button', { name: /low/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /medium/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /high/i })).toBeInTheDocument()
  })

  it('renders highlight style options', () => {
    render(<SettingsPage />)
    expect(screen.getByRole('button', { name: /badge/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /border/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /dim/i })).toBeInTheDocument()
  })

  it('renders Platforms section with all platform toggles', () => {
    render(<SettingsPage />)
    expect(screen.getByText('Platforms')).toBeInTheDocument()
    expect(screen.getByText('Twitter')).toBeInTheDocument()
    expect(screen.getByText('Reddit')).toBeInTheDocument()
    expect(screen.getByText('Facebook')).toBeInTheDocument()
    expect(screen.getByText('Youtube')).toBeInTheDocument()
    expect(screen.getByText('Linkedin')).toBeInTheDocument()
  })

  it('renders Ignored Sites section with input and add button', () => {
    render(<SettingsPage />)
    expect(screen.getByText('Ignored Sites')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('e.g. example.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Add/i })).toBeInTheDocument()
  })

  it('shows empty state when no ignored sites', () => {
    render(<SettingsPage />)
    expect(screen.getByText('No ignored sites yet.')).toBeInTheDocument()
  })

  it('renders Data section with reset buttons', () => {
    render(<SettingsPage />)
    expect(screen.getByText('Data')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Reset Statistics/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Reset All Settings/i })).toBeInTheDocument()
  })
})
