import '@testing-library/jest-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ReportPage from '../report/page'

describe('Report Page', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = jest.fn() as unknown as typeof fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
    jest.clearAllMocks()
  })

  it('shows validation when submitting an empty report', async () => {
    const user = userEvent.setup()
    render(<ReportPage />)

    await user.click(screen.getByRole('button', { name: /Submit Report/i }))

    expect(screen.getByText('Please select a report type.')).toBeInTheDocument()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('submits a valid report and shows success feedback', async () => {
    const user = userEvent.setup()

    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ reportId: 'report-123', notificationScheduledFor: 'daily' }),
    })

    render(<ReportPage />)

    await user.selectOptions(screen.getByLabelText(/Report Type/i), 'bug')
    await user.type(screen.getByLabelText(/Message/i), 'The detector incorrectly flagged satire as AI.')
    await user.type(screen.getByLabelText(/Related Page URL/i), 'https://example.com/post/123')
    await user.type(screen.getByLabelText(/Email for follow-up/i), 'reporter@example.com')
    await user.selectOptions(screen.getByLabelText(/Dev Notification Interval/i), 'daily')

    await user.click(screen.getByRole('button', { name: /Submit Report/i }))

    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1))

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/reports',
      expect.objectContaining({
        method: 'POST',
      })
    )

    expect(
      await screen.findByText(/Report submitted \(ID: report-123\)\. Notifications: daily\./i)
    ).toBeInTheDocument()
  })
})
