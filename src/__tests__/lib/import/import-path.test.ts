import { describe, expect, it } from 'vitest'
import { importTitleFromPath, isPagesPath } from '@/lib/import/import-path'

describe('importTitleFromPath', () => {
  it('uses the file stem as title', () => {
    expect(importTitleFromPath('/Users/me/Notes/Meeting.md', 'fallback')).toBe('Meeting')
    expect(importTitleFromPath('C:\\Docs\\Report.docx', 'fallback')).toBe('Report')
  })

  it('falls back when stem is empty', () => {
    expect(importTitleFromPath('/tmp/.md', 'fallback')).toBe('fallback')
    expect(importTitleFromPath('', 'fallback')).toBe('fallback')
  })
})

describe('isPagesPath', () => {
  it('detects .pages paths case-insensitively', () => {
    expect(isPagesPath('/tmp/File.pages')).toBe(true)
    expect(isPagesPath('/tmp/File.PAGES/')).toBe(true)
    expect(isPagesPath('/tmp/File.docx')).toBe(false)
  })
})
