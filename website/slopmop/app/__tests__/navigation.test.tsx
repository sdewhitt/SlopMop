import '@testing-library/jest-dom'
import { render, screen, within, waitFor } from '@testing-library/react'
import Home from '../page'

const authModule = jest.requireMock('../context/AuthContext') as {
    useAuth: jest.Mock
}

const originalUseAuth = authModule.useAuth
const originalFetch = global.fetch

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

describe('Home', () => {

    beforeEach(() => {
        restoreAuthDefault()
        global.fetch = jest.fn() as unknown as typeof fetch
    })

    afterEach(() => {
        global.fetch = originalFetch
        restoreAuthDefault()
    })

    it('Renders the Navbar & Title', () => {
        render(<Home />)

        const navbar = screen.getByRole('navigation')
        const slopmopBrand = screen.getByText('SlopMop')

        expect(navbar).toBeInTheDocument()
        expect(slopmopBrand).toBeInTheDocument()
    })


    it('Navigation links are present and have correct hrefs', () => {
        render(<Home />)

        const navbar = screen.getByRole('navigation')

        const installLink = within(navbar).getByRole('link', { name: /Install/i })
        const reportLink = within(navbar).getByRole('link', { name: /Report/i })
        const faqLink = within(navbar).getByRole('link', { name: /FAQ/i })
        const signupLink = within(navbar).getByRole('link', { name: /Sign Up/i })
        const homeLink = within(navbar).getByRole('link', { name: /SlopMop/i })

        expect(installLink).toHaveAttribute('href', '/install')
        expect(reportLink).toHaveAttribute('href', '/report')
        expect(faqLink).toHaveAttribute('href', '/#faq')
        expect(signupLink).toHaveAttribute('href', '/signup')
        expect(homeLink).toHaveAttribute('href', '/')
    })

    it('Hides Admin Reports for unauthorized users', async () => {
        const getIdToken = jest.fn().mockResolvedValue('user-token')

        setAuthUser({
            uid: 'user-uid',
            email: 'user@example.com',
            getIdToken,
        })

        ;(global.fetch as jest.Mock).mockResolvedValue({
            ok: false,
            status: 403,
            json: async () => ({ error: 'Not authorized' }),
        })

        render(<Home />)

        await waitFor(() => {
            expect(global.fetch).toHaveBeenCalledWith(
                '/api/reports/config',
                expect.objectContaining({
                    headers: { Authorization: 'Bearer user-token' },
                })
            )
        })

        expect(screen.queryByRole('link', { name: /Admin Reports/i })).not.toBeInTheDocument()
    })

    it('Shows Admin Reports for authorized users', async () => {
        const getIdToken = jest.fn().mockResolvedValue('admin-token')

        setAuthUser({
            uid: 'admin-uid',
            email: 'admin@example.com',
            getIdToken,
        })

        ;(global.fetch as jest.Mock).mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ settings: { notificationInterval: 'immediate' } }),
        })

        render(<Home />)

        const adminLink = await screen.findByRole('link', { name: /Admin Reports/i })
        expect(adminLink).toHaveAttribute('href', '/admin/reports')
    })
})
