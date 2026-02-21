import '@testing-library/jest-dom'
import { render, screen } from '@testing-library/react'
import Home from '../page'

describe('Home', () => {
  it('Renders the Navbar', () => {
    render(<Home />)
 
    const navbar = screen.getByRole('navigation')
    const slopmopBrand = screen.getByText('SlopMop')
 
    expect(navbar).toBeInTheDocument()
    expect(slopmopBrand).toBeInTheDocument()
  })
})