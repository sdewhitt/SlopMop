/**
 * @jest-environment node
 */

jest.mock('../lib/firebaseAdmin', () => ({
  initAdminDb: jest.fn(),
}))

jest.mock('../lib/reportEmail', () => ({
  sendDigestEmail: jest.fn(() => Promise.resolve(true)),
}))

jest.mock('../lib/reportConfig', () => ({
  getConfiguredReportNotificationInterval: jest.fn(() => Promise.resolve('daily')),
}))

import { POST } from '../api/reports/dispatch/route'
import { initAdminDb } from '../lib/firebaseAdmin'
import { sendDigestEmail } from '../lib/reportEmail'
import { getConfiguredReportNotificationInterval } from '../lib/reportConfig'

describe('/api/reports/dispatch route', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...originalEnv, REPORT_DISPATCH_SECRET: 'dispatch-secret' }
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('returns 401 when secret is missing', async () => {
    const response = await POST(new Request('http://localhost/api/reports/dispatch', { method: 'POST' }))
    expect(response.status).toBe(401)
  })

  it('skips digest when global interval is immediate', async () => {
    ;(getConfiguredReportNotificationInterval as jest.Mock).mockResolvedValueOnce('immediate')

    const collection = jest.fn()
    ;(initAdminDb as jest.Mock).mockReturnValue({ collection })

    const response = await POST(
      new Request('http://localhost/api/reports/dispatch', {
        method: 'POST',
        headers: { 'x-dispatch-secret': 'dispatch-secret' },
      })
    )

    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.interval).toBe('immediate')
    expect(body.skipped).toBe(true)
    expect(sendDigestEmail).not.toHaveBeenCalled()
  })

  it('sends digest for due reports in configured interval', async () => {
    const update = jest.fn().mockResolvedValue(undefined)
    const where = jest.fn().mockReturnValue({
      get: jest.fn().mockResolvedValue({
        docs: [
          {
            id: 'report-due',
            data: () => ({
              type: 'bug',
              source: 'website',
              status: 'open',
              message: 'Due now',
              lastNotifiedAt: null,
            }),
          },
          {
            id: 'report-not-due',
            data: () => ({
              type: 'other',
              source: 'website',
              status: 'open',
              message: 'Not due yet',
              lastNotifiedAt: {
                toDate: () => new Date(Date.now() - 60 * 60 * 1000),
              },
            }),
          },
        ],
      }),
    })

    const collection = jest.fn().mockReturnValue({
      where,
      doc: jest.fn().mockReturnValue({ update }),
    })

    ;(initAdminDb as jest.Mock).mockReturnValue({ collection })

    const response = await POST(
      new Request('http://localhost/api/reports/dispatch', {
        method: 'POST',
        headers: { 'x-dispatch-secret': 'dispatch-secret' },
      })
    )

    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.interval).toBe('daily')
    expect(body.candidates).toBe(1)
    expect(body.sent).toBe(true)
    expect(sendDigestEmail).toHaveBeenCalledWith('daily', expect.arrayContaining([
      expect.objectContaining({ id: 'report-due' }),
    ]))
    expect(update).toHaveBeenCalledTimes(1)
  })
})
