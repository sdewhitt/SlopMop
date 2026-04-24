/**
 * @jest-environment node
 */

jest.mock('../lib/firebaseAdmin', () => ({
  initAdminDb: jest.fn(),
}))

jest.mock('../lib/reportEmail', () => ({
  sendReportSubmittedEmail: jest.fn(() => Promise.resolve(true)),
}))

jest.mock('../lib/reportConfig', () => ({
  getConfiguredReportNotificationInterval: jest.fn(() => Promise.resolve('immediate')),
}))

jest.mock('../lib/reportAuth', () => {
  class ReportAuthError extends Error {
    status: number
    constructor(message: string, status: number) {
      super(message)
      this.status = status
      this.name = 'ReportAuthError'
    }
  }

  return {
    ReportAuthError,
    authenticateOptionalUser: jest.fn(() => Promise.resolve(null)),
    requireAdminUser: jest.fn(() => Promise.resolve({ uid: 'admin-1', email: 'admin@example.com' })),
  }
})

import { GET, POST } from '../api/reports/route'
import { initAdminDb } from '../lib/firebaseAdmin'
import {
  authenticateOptionalUser,
  ReportAuthError,
  requireAdminUser,
} from '../lib/reportAuth'
import { sendReportSubmittedEmail } from '../lib/reportEmail'
import { getConfiguredReportNotificationInterval } from '../lib/reportConfig'

describe('/api/reports route', () => {
  const originalEnv = process.env

  beforeAll(() => {
    process.env = { ...originalEnv }
  })

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...originalEnv }
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('returns 400 for invalid report payload', async () => {
    const request = new Request('http://localhost/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'website',
        message: '',
      }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toContain('Invalid report type')
    expect(initAdminDb).not.toHaveBeenCalled()
  })

  it('creates a report and writes it to Firestore', async () => {
    const add = jest.fn().mockResolvedValue({ id: 'report-123' })
    const collection = jest.fn().mockReturnValue({ add })

    ;(initAdminDb as jest.Mock).mockReturnValue({ collection })
    ;(authenticateOptionalUser as jest.Mock).mockResolvedValue({
      uid: 'user-1',
      email: 'user@example.com',
    })

    const request = new Request('http://localhost/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'bug',
        source: 'website',
        message: 'Detected issue details',
      }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(201)
    expect(data.reportId).toBe('report-123')
    expect(collection).toHaveBeenCalledWith('reports')
    expect(add).toHaveBeenCalled()
    expect(sendReportSubmittedEmail).toHaveBeenCalledTimes(1)

    const inserted = add.mock.calls[0][0] as Record<string, unknown>
    expect(inserted.notificationInterval).toBeUndefined()
    expect(data.notificationScheduledFor).toBe('immediate')
  })

  it('uses server-configured notification interval for all reports', async () => {
    ;(getConfiguredReportNotificationInterval as jest.Mock).mockResolvedValueOnce('weekly')

    const add = jest.fn().mockResolvedValue({ id: 'report-456' })
    const collection = jest.fn().mockReturnValue({ add })
    ;(initAdminDb as jest.Mock).mockReturnValue({ collection })

    const request = new Request('http://localhost/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'other',
        source: 'website',
        message: 'Weekly digest check',
      }),
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(201)
    expect(data.notificationScheduledFor).toBe('weekly')

    const inserted = add.mock.calls[0][0] as Record<string, unknown>
    expect(inserted.notificationInterval).toBeUndefined()
    expect(sendReportSubmittedEmail).not.toHaveBeenCalled()
  })

  it('returns 403 when admin auth fails on GET', async () => {
    ;(requireAdminUser as jest.Mock).mockRejectedValue(
      new ReportAuthError('Forbidden', 403)
    )

    const response = await GET(new Request('http://localhost/api/reports'))
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error).toBe('Forbidden')
  })

  it('returns reports for authorized admins', async () => {
    ;(requireAdminUser as jest.Mock).mockResolvedValue({
      uid: 'admin-1',
      email: 'admin@example.com',
    })

    const filteredQuery = {
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({
        docs: [
          {
            id: 'report-1',
            data: () => ({
              type: 'bug',
              source: 'website',
              status: 'open',
              message: 'Needs review',
              notificationInterval: 'daily',
              createdAt: {
                toDate: () => new Date('2026-01-01T00:00:00.000Z'),
              },
              updatedAt: {
                toDate: () => new Date('2026-01-01T00:00:00.000Z'),
              },
            }),
          },
        ],
      }),
    }

    ;(initAdminDb as jest.Mock).mockReturnValue({
      collection: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue(filteredQuery),
      }),
    })

    const response = await GET(
      new Request('http://localhost/api/reports?status=open&limit=10')
    )
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.reports).toHaveLength(1)
    expect(data.reports[0].id).toBe('report-1')
  })

  it('falls back when composite index is missing', async () => {
    ;(requireAdminUser as jest.Mock).mockResolvedValue({
      uid: 'admin-1',
      email: 'admin@example.com',
    })

    const indexedQuery = {
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      get: jest.fn().mockRejectedValue(
        new Error('9 FAILED_PRECONDITION: The query requires an index.')
      ),
    }

    const fallbackQuery = {
      limit: jest.fn().mockReturnThis(),
      get: jest.fn().mockResolvedValue({
        docs: [
          {
            id: 'report-open',
            data: () => ({
              type: 'bug',
              source: 'website',
              status: 'open',
              message: 'Open report',
              notificationInterval: 'daily',
              createdAt: { toDate: () => new Date('2026-01-02T00:00:00.000Z') },
              updatedAt: { toDate: () => new Date('2026-01-02T00:00:00.000Z') },
            }),
          },
          {
            id: 'report-addressed',
            data: () => ({
              type: 'other',
              source: 'website',
              status: 'addressed',
              message: 'Addressed report',
              notificationInterval: 'daily',
              createdAt: { toDate: () => new Date('2026-01-01T00:00:00.000Z') },
              updatedAt: { toDate: () => new Date('2026-01-01T00:00:00.000Z') },
            }),
          },
        ],
      }),
    }

    ;(initAdminDb as jest.Mock).mockReturnValue({
      collection: jest.fn().mockReturnValue({
        where: jest.fn().mockReturnValue(indexedQuery),
        orderBy: jest.fn().mockReturnValue(fallbackQuery),
      }),
    })

    const response = await GET(
      new Request('http://localhost/api/reports?status=open&limit=100')
    )
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.reports).toHaveLength(1)
    expect(data.reports[0].id).toBe('report-open')
  })
})
