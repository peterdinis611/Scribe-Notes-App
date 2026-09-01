import { describe, expect, it } from 'vitest'
import {
  importTitleFromPath,
  isWordDocxPath,
  titleFromWordHtml,
} from '@/lib/import/word-docx'
import { isOleWordDoc, isZipArchive } from '@/lib/fs/read-scoped-binary'
import {
  bufferToDataUrl,
  createImportImageToken,
  isImportImageToken,
  mimeToExtension,
} from '@/lib/import/word-images'

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

  it('builds stable import image tokens', () => {
    expect(createImportImageToken(0)).toBe('scribe-import-img://0')
    expect(isImportImageToken('scribe-import-img://2')).toBe(true)
    expect(isImportImageToken('/tmp/image.png')).toBe(false)
  })

  it('maps mime types and encodes data urls', () => {
    expect(mimeToExtension('image/png')).toBe('png')
    expect(mimeToExtension('image/jpeg')).toBe('jpg')
    const dataUrl = bufferToDataUrl('image/png', Uint8Array.from([137, 80, 78, 71]).buffer)
    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true)
  })
})
