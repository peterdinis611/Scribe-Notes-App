import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import '@/i18n'
import { PrintEmptyHero } from '@/components/editor/PrintEmptyHero'

afterEach(() => {
  cleanup()
})

describe('PrintEmptyHero', () => {
  it('renders the blank-page cue with slash and wiki tips', () => {
    render(<PrintEmptyHero />)

    expect(screen.getByText(/čistá stránka|blank page/i)).toBeInTheDocument()
    expect(screen.getByText(/vložiť bloky|insert blocks/i)).toBeInTheDocument()
    expect(screen.getByText(/prepojiť poznámku|link a note/i)).toBeInTheDocument()
  })

  it('is decorative and not interactive', () => {
    const { container } = render(<PrintEmptyHero />)
    const root = container.querySelector('.print-empty')
    expect(root).toHaveAttribute('aria-hidden', 'true')
  })
})
