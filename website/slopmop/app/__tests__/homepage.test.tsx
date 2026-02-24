import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import Home from '../page'

describe('Home', () => {

    it('Renders Install button in hero section and redirects to install page', () => {
        render(<Home />)
        const main = screen.getByRole('main')
        const installButton = within(main).getByRole('link', { name: /Install/i })

        expect(installButton).toBeInTheDocument()
        expect(installButton).toHaveAttribute('href', '/install')
    })

    // TODO: add tests for working install
})