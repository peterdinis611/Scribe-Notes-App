import { describe, expect, it } from 'vitest'
import {
  importTitleFromPath,
  isWordDocxPath,
  titleFromWordHtml,
} from '@/lib/import/word-docx'
import { isOleWordDoc, isZipArchive } from '@/lib/fs/read-scoped-binary'

describe('word-docx import helpers', () => {
  it('detects docx paths', () => {
    expect(isWordDocxPath('/tmp/report.docx')).toBe(true)
    expect(isWordDocxPath('/tmp/report.DOCX')).toBe(true)
    expect(isWordDocxPath('/tmp/report.doc')).toBe(false)
  })

  it('uses filename stem as fallback title', () => {
    expect(importTitleFromPath('/Users/me/Môj dokument.docx', 'fallback')).toBe('Môj dokument')
  })

  it('prefers first h1 as title', () => {
    expect(
      titleFromWordHtml('<p>Intro</p><h1>Projekt Alpha</h1><p>Body</p>', 'fallback'),
    ).toBe('Projekt Alpha')
  })

  it('detects zip and ole signatures', () => {
    expect(isZipArchive(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBe(true)
    expect(isZipArchive(new Uint8Array([0x00, 0x00]))).toBe(false)
    expect(isOleWordDoc(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]))).toBe(true)
  })
})
