import { describe, expect, it } from 'vitest'
import {
  importTitleFromPath,
  isKeynotePath,
  isNumbersPath,
  isPagesPath,
} from '@/lib/import/import-path'

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

describe('isNumbersPath', () => {
  it('detects .numbers paths case-insensitively', () => {
    expect(isNumbersPath('/tmp/Budget.numbers')).toBe(true)
    expect(isNumbersPath('/tmp/Budget.NUMBERS/')).toBe(true)
    expect(isNumbersPath('/tmp/Budget.xlsx')).toBe(false)
  })
})

describe('isKeynotePath', () => {
  it('detects .key paths case-insensitively', () => {
    expect(isKeynotePath('/tmp/Talk.key')).toBe(true)
    expect(isKeynotePath('/tmp/Talk.KEY/')).toBe(true)
    expect(isKeynotePath('/tmp/Talk.pptx')).toBe(false)
  })
})
