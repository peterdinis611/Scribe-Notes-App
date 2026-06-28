import { describe, expect, it } from 'vitest'
import { buildHeaderFooterLines, resolveHeaderFooterTemplate } from '@/lib/editor/page-header-footer'
import { DEFAULT_PAGE_HEADER_FOOTER } from '@/lib/editor/page-setup'

describe('page header/footer templates', () => {
  it('resolves template variables', () => {
    expect(
      resolveHeaderFooterTemplate('{title} · str. {page}/{pages} · {date}', {
        title: 'Dokument',
        page: 2,
        pages: 5,
        date: '21. jún 2026',
      }),
    ).toBe('Dokument · str. 2/5 · 21. jún 2026')
  })

  it('builds footer with page number', () => {
    const lines = buildHeaderFooterLines(
      { ...DEFAULT_PAGE_HEADER_FOOTER, enabled: true, footerText: 'Poznámka' },
      { title: 'Test', page: 1, pages: 3, date: '21. jún 2026' },
    )
    expect(lines.header).toBe('Test')
    expect(lines.footer).toBe('Poznámka · Strana 1 / 3')
  })
})
