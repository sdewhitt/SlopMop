import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import Home from '../page'

describe('Home', () => {

    it('Allows Email + Password sign up', () => {
        render(<Home />)
        const navbar = screen.getByRole('navigation')
        const signupLink = within(navbar).getByRole('link', { name: /Sign Up/i })
        // TODO: Finish test when auth is implemented
    })

})
