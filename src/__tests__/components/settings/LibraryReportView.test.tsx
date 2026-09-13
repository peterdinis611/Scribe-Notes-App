import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import '@/i18n'
import { LibraryReportView } from '@/components/settings/LibraryReportView'
import type { NlpLibraryReport } from '@/lib/db/nlp-api'

afterEach(() => {
  cleanup()
})

const report: NlpLibraryReport = {
  markdown: '# Analýza knižnice\n\n## Dokumentácia\n- Denník (2)',
  stats: {
    documentCount: 22,
    taggedCount: 0,
    folderCount: 1,
    languages: [{ language: 'sk', count: 13 }],
    sentiments: [{ label: 'neutral', count: 21 }],
    topTerms: [{ term: 'zhrnutie', count: 12 }],
    topTags: [],
    documentation: [
      { id: null, name: 'Koreň knižnice', documentCount: 20, isVault: false },
      { id: 'f1', name: 'Denník', documentCount: 2, isVault: false },
    ],
    recentTitles: ['Názov reportu'],
    untaggedSample: [],
  },
}

describe('LibraryReportView', () => {
  it('renders documentation libraries and key stats', () => {
    render(<LibraryReportView report={report} />)
    expect(screen.getByText(/dokumentácia|documentation/i)).toBeInTheDocument()
    expect(screen.getByText('Denník')).toBeInTheDocument()
    expect(screen.getByText('Koreň knižnice')).toBeInTheDocument()
    expect(screen.getByText('zhrnutie')).toBeInTheDocument()
    expect(screen.getByText(/jazyky|languages/i)).toBeInTheDocument()
  })

  it('can reveal raw markdown', async () => {
    const user = userEvent.setup()
    render(<LibraryReportView report={report} />)
    await user.click(screen.getByRole('button', { name: /markdown/i }))
    expect(screen.getByText(/# Analýza knižnice/)).toBeInTheDocument()
  })
})
