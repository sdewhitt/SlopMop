import '@testing-library/jest-dom'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Home from '../page'
import faqs from '@/app/data/faqs.json'

describe('Home', () => {

    it('Renders Install button in hero section and redirects to install page', () => {
        render(<Home />)
        const main = screen.getByRole('main')
        const installButton = within(main).getByRole('link', { name: /Install/i })

        expect(installButton).toBeInTheDocument()
        expect(installButton).toHaveAttribute('href', '/install')
    })

    it('Renders FAQ section with heading and questions', () => {
        render(<Home />)
        
        const faqHeading = screen.getByRole('heading', { name: /Frequently Asked Questions/i })
        expect(faqHeading).toBeInTheDocument()

        // Check that all FAQ questions are rendered
        faqs.forEach(({ q }) => {
            expect(screen.getByText(q)).toBeInTheDocument()
        })
    })

    it('Displays FAQ answer when question is clicked', async () => {
        const user = userEvent.setup()
        render(<Home />)

        const firstFaq = faqs[0]
        const firstQuestion = screen.getByRole('button', { name: new RegExp(firstFaq.q) })
        
        // Initially, answer should not be visible
        expect(screen.queryByText(firstFaq.a)).not.toBeInTheDocument()

        // Click the question to expand it
        await user.click(firstQuestion)

        // Answer should now be visible
        expect(screen.getByText(firstFaq.a)).toBeInTheDocument()

        // Button should have aria-expanded=true
        expect(firstQuestion).toHaveAttribute('aria-expanded', 'true')
    })

    it('Hides FAQ answer when question is clicked again', async () => {
        const user = userEvent.setup()
        render(<Home />)

        const firstFaq = faqs[0]
        const firstQuestion = screen.getByRole('button', { name: new RegExp(firstFaq.q) })

        // Click to expand
        await user.click(firstQuestion)
        expect(screen.getByText(firstFaq.a)).toBeInTheDocument()

        // Click to collapse
        await user.click(firstQuestion)
        expect(screen.queryByText(firstFaq.a)).not.toBeInTheDocument()

        // Button should have aria-expanded=false
        expect(firstQuestion).toHaveAttribute('aria-expanded', 'false')
    })

    it('Allows multiple FAQ questions to be open simultaneously', async () => {
        const user = userEvent.setup()
        render(<Home />)

        const firstFaq = faqs[0]
        const secondFaq = faqs[1]
        const firstQuestion = screen.getByRole('button', { name: new RegExp(firstFaq.q) })
        const secondQuestion = screen.getByRole('button', { name: new RegExp(secondFaq.q) })

        // Click first question
        await user.click(firstQuestion)

        // Click second question
        await user.click(secondQuestion)

        // Both should have aria-expanded=true
        expect(firstQuestion).toHaveAttribute('aria-expanded', 'true')
        expect(secondQuestion).toHaveAttribute('aria-expanded', 'true')

        // Both answers should be visible
        expect(screen.getByText(firstFaq.a)).toBeInTheDocument()
        expect(screen.getByText(secondFaq.a)).toBeInTheDocument()
    })

    // TODO: add tests for working install
})