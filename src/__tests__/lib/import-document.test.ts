import { describe, expect, it } from 'vitest'
import {
  fileNameFromPath,
  filterImportableDocumentPaths,
  isImportableDocumentPath,
} from '@/lib/import-document'

describe('import-document path helpers', () => {
  it('accepts supported document extensions', () => {
    expect(isImportableDocumentPath('/tmp/note.md')).toBe(true)
    expect(isImportableDocumentPath('/tmp/pack.scribe.json')).toBe(true)
    expect(isImportableDocumentPath('C:\\Docs\\file.DOCX')).toBe(true)
    expect(isImportableDocumentPath('/tmp/sheet.xlsx')).toBe(true)
    expect(isImportableDocumentPath('/tmp/photo.png')).toBe(false)
    expect(isImportableDocumentPath('/tmp/plugin.scribe-ext')).toBe(false)
  })

  it('filters and dedupes importable paths', () => {
    expect(
      filterImportableDocumentPaths([
        '/a/note.md',
        '/a/note.md',
        '/a/pic.png',
        '  /b/doc.docx  ',
        '',
      ]),
    ).toEqual(['/a/note.md', '/b/doc.docx'])
  })

  it('extracts file names', () => {
    expect(fileNameFromPath('/Users/me/Notes/hello.md')).toBe('hello.md')
    expect(fileNameFromPath('C:\\Notes\\hello.md')).toBe('hello.md')
  })
})
