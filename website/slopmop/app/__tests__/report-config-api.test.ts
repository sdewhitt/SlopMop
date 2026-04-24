/**
 * @jest-environment node
 */

jest.mock('../lib/reportConfig', () => ({
  getReportNotificationSettings: jest.fn(),
  updateReportNotificationSettings: jest.fn(),
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
    requireAdminUser: jest.fn(() =>
      Promise.resolve({ uid: 'admin-1', email: 'admin@example.com' })
    ),
  }
})

import { GET, PATCH } from '../api/reports/config/route'
import {
  getReportNotificationSettings,
  updateReportNotificationSettings,
} from '../lib/reportConfig'
import { ReportAuthError, requireAdminUser } from '../lib/reportAuth'

describe('/api/reports/config route', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns 403 when admin auth fails on GET', async () => {
    ;(requireAdminUser as jest.Mock).mockRejectedValueOnce(
      new ReportAuthError('Forbidden', 403)
    )

    const response = await GET(new Request('http://localhost/api/reports/config'))
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.error).toBe('Forbidden')
  })

  it('returns settings for admin users', async () => {
    ;(getReportNotificationSettings as jest.Mock).mockResolvedValueOnce({
      notificationInterval: 'daily',
      updatedAt: '2026-01-01T00:00:00.000Z',
      updatedByUid: 'admin-1',
      updatedByEmail: 'admin@example.com',
    })

    const response = await GET(new Request('http://localhost/api/reports/config'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.settings.notificationInterval).toBe('daily')
  })

  it('rejects invalid notification intervals on PATCH', async () => {
    const response = await PATCH(
      new Request('http://localhost/api/reports/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationInterval: 'hourly' }),
      })
    )

    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toContain('Invalid notification interval')
    expect(updateReportNotificationSettings).not.toHaveBeenCalled()
  })

  it('updates settings for valid PATCH requests', async () => {
    ;(updateReportNotificationSettings as jest.Mock).mockResolvedValueOnce({
      notificationInterval: 'weekly',
      updatedAt: '2026-01-01T00:00:00.000Z',
      updatedByUid: 'admin-1',
      updatedByEmail: 'admin@example.com',
    })

    const response = await PATCH(
      new Request('http://localhost/api/reports/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationInterval: 'weekly' }),
      })
    )

    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.settings.notificationInterval).toBe('weekly')
    expect(updateReportNotificationSettings).toHaveBeenCalledWith('weekly', {
      uid: 'admin-1',
      email: 'admin@example.com',
    })
  })
})
