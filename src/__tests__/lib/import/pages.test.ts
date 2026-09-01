import { describe, expect, it } from 'vitest'
import { plainTextToContentJson, titleFromHtml } from '@/lib/import/html-content'
import { importTitleFromPath, isPagesPath } from '@/lib/import/import-path'

describe('pages import helpers', () => {
  it('detects pages paths', () => {
    expect(isPagesPath('/tmp/report.pages')).toBe(true)
    expect(isPagesPath('/tmp/report.PAGES')).toBe(true)
    expect(isPagesPath('/tmp/report.docx')).toBe(false)
  })

  it('uses filename stem as fallback title', () => {
    expect(importTitleFromPath('/Users/me/Prezentácia.pages', 'fallback')).toBe('Prezentácia')
  })

  it('prefers first h1 as title', () => {
    expect(titleFromHtml('<p>Intro</p><h1>Projekt Beta</h1>', 'fallback')).toBe('Projekt Beta')
  })

  it('converts plain text paragraphs', () => {
    const json = JSON.parse(plainTextToContentJson('Prvý odsek\n\nDruhý odsek')) as {
      content: unknown[]
    }
    expect(json.content).toHaveLength(2)
  })
})
