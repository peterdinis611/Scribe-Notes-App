import { describe, expect, it } from 'vitest'
import { isPdfPath } from '@/lib/import/pdf-document'

describe('pdf-document import', () => {
  it('detects pdf paths', () => {
    expect(isPdfPath('/tmp/notes.pdf')).toBe(true)
    expect(isPdfPath('/tmp/notes.PDF')).toBe(true)
    expect(isPdfPath('/tmp/notes.docx')).toBe(false)
  })
})
