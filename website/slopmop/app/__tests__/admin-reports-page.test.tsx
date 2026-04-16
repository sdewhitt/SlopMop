import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AdminReportsPage from '../admin/reports/page'

const authModule = jest.requireMock('../context/AuthContext') as {
  useAuth: jest.Mock
}

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

describe('Admin Reports Page', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = jest.fn() as unknown as typeof fetch
    jest.clearAllMocks()
  })

  afterEach(() => {
    global.fetch = originalFetch
    restoreAuthDefault()
  })

  it('shows sign-in required when logged out', () => {
    restoreAuthDefault()
    render(<AdminReportsPage />)

    expect(screen.getByText('Sign in required')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Log In/i })).toHaveAttribute('href', '/login')
  })

  it('loads and displays reports for admin users', async () => {
    const getIdToken = jest.fn().mockResolvedValue('admin-token')

    setAuthUser({
      uid: 'admin-uid',
      email: 'admin@example.com',
      getIdToken,
    })

    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        reports: [
          {
            id: 'report-1',
            type: 'bug',
            source: 'website',
            status: 'open',
            message: 'The report modal closes unexpectedly.',
            pageUrl: 'https://example.com/post/1',
            reporterEmail: 'user@example.com',
            submitterUid: null,
            submitterEmail: null,
            notificationInterval: 'immediate',
            userAgent: 'jest',
            resolutionNote: null,
            addressedAt: null,
            addressedByUid: null,
            addressedByEmail: null,
            lastNotifiedAt: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
      }),
    })

    render(<AdminReportsPage />)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/reports?status=open&limit=100',
        expect.objectContaining({
          headers: { Authorization: 'Bearer admin-token' },
        })
      )
    })

    expect(
      await screen.findByText('The report modal closes unexpectedly.')
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Mark Addressed/i })).toBeInTheDocument()
  })

  it('updates a report status when Mark Addressed is clicked', async () => {
    const user = userEvent.setup()
    const getIdToken = jest.fn().mockResolvedValue('admin-token')

    setAuthUser({
      uid: 'admin-uid',
      email: 'admin@example.com',
      getIdToken,
    })

    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          reports: [
            {
              id: 'report-1',
              type: 'bug',
              source: 'website',
              status: 'open',
              message: 'Needs triage',
              pageUrl: null,
              reporterEmail: null,
              submitterUid: null,
              submitterEmail: null,
              notificationInterval: 'immediate',
              userAgent: null,
              resolutionNote: null,
              addressedAt: null,
              addressedByUid: null,
              addressedByEmail: null,
              lastNotifiedAt: null,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          report: {
            id: 'report-1',
            type: 'bug',
            source: 'website',
            status: 'addressed',
            message: 'Needs triage',
            pageUrl: null,
            reporterEmail: null,
            submitterUid: null,
            submitterEmail: null,
            notificationInterval: 'immediate',
            userAgent: null,
            resolutionNote: null,
            addressedAt: '2026-01-02T00:00:00.000Z',
            addressedByUid: 'admin-uid',
            addressedByEmail: 'admin@example.com',
            lastNotifiedAt: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-02T00:00:00.000Z',
          },
        }),
      })

    render(<AdminReportsPage />)

    const markButton = await screen.findByRole('button', { name: /Mark Addressed/i })
    await user.click(markButton)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/reports/report-1',
        expect.objectContaining({
          method: 'PATCH',
        })
      )
    })

    expect(screen.getByRole('button', { name: /Reopen/i })).toBeInTheDocument()
  })

  it('refetches reports when refresh is clicked', async () => {
    const user = userEvent.setup()
    const getIdToken = jest.fn().mockResolvedValue('admin-token')

    setAuthUser({
      uid: 'admin-uid',
      email: 'admin@example.com',
      getIdToken,
    })

    ;(global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          reports: [
            {
              id: 'report-1',
              type: 'bug',
              source: 'website',
              status: 'open',
              message: 'Initial payload',
              pageUrl: null,
              reporterEmail: null,
              submitterUid: null,
              submitterEmail: null,
              notificationInterval: 'immediate',
              userAgent: null,
              resolutionNote: null,
              addressedAt: null,
              addressedByUid: null,
              addressedByEmail: null,
              lastNotifiedAt: null,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          reports: [
            {
              id: 'report-2',
              type: 'other',
              source: 'extension',
              status: 'open',
              message: 'Refreshed payload',
              pageUrl: null,
              reporterEmail: null,
              submitterUid: null,
              submitterEmail: null,
              notificationInterval: 'immediate',
              userAgent: null,
              resolutionNote: null,
              addressedAt: null,
              addressedByUid: null,
              addressedByEmail: null,
              lastNotifiedAt: null,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
        }),
      })

    render(<AdminReportsPage />)

    expect(await screen.findByText('Initial payload')).toBeInTheDocument()

    const refreshButton = screen.getByRole('button', { name: /Refresh/i })
    await user.click(refreshButton)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenNthCalledWith(
        2,
        '/api/reports?status=open&limit=100',
        expect.objectContaining({
          headers: { Authorization: 'Bearer admin-token' },
        })
      )
    })

    expect(await screen.findByText('Refreshed payload')).toBeInTheDocument()
  })
})
