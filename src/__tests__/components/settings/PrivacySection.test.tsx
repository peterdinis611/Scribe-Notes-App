import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import '@/i18n'
import i18n from '@/i18n'
import { PrivacySection } from '@/components/settings/PrivacySection'
import { PRIVACY_ARTICLE_IDS } from '@/lib/privacy'

afterEach(() => {
  cleanup()
})

describe('PrivacySection', () => {
  it('renders the notice and every article in English', async () => {
    await i18n.changeLanguage('en')
    render(<PrivacySection />)

    expect(screen.getByRole('heading', { name: 'Privacy policy' })).toBeTruthy()
    expect(screen.getByText(/Effective 19 September 2026/)).toBeTruthy()
    expect(screen.getByText('Local first')).toBeTruthy()
    expect(screen.getByText('MCP (Cursor / Claude)')).toBeTruthy()
    expect(document.querySelectorAll('.privacy-notice-articles li')).toHaveLength(
      PRIVACY_ARTICLE_IDS.length,
    )
  })

  it('renders the Slovak title', async () => {
    const previous = i18n.language
    await i18n.changeLanguage('sk')
    render(<PrivacySection />)

    expect(screen.getByRole('heading', { name: 'Zásady ochrany súkromia' })).toBeTruthy()
    expect(screen.getByText('Najprv lokálne')).toBeTruthy()

    await i18n.changeLanguage(previous)
  })
})
