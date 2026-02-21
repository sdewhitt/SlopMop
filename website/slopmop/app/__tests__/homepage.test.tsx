import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import Home from '../page'

describe('Home', () => {
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
    const faqLink = within(navbar).getByRole('link', { name: /FAQ/i })
    const signupLink = within(navbar).getByRole('link', { name: /Sign Up/i })
    const homeLink = within(navbar).getByRole('link', { name: /SlopMop/i })

    expect(installLink).toHaveAttribute('href', '/install')
    expect(faqLink).toHaveAttribute('href', '/faq')
    expect(signupLink).toHaveAttribute('href', '/signup')
    expect(homeLink).toHaveAttribute('href', '/')
  })
})