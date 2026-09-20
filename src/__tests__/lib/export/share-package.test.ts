import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  copyDocumentPath,
  documentMarkdownForClipboard,
  revealDocumentSource,
} from '@/lib/export/share-package'

vi.mock('@/lib/db/api', () => ({
  exportDocument: vi.fn(),
  revealInFinder: vi.fn(async () => undefined),
}))

import { revealInFinder } from '@/lib/db/api'

describe('share-package helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds markdown for clipboard from tip tap json', () => {
    const markdown = documentMarkdownForClipboard(
      JSON.stringify({
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ahoj' }] }],
      }),
      'Poznámka',
    )
    expect(markdown).toContain('Poznámka')
    expect(markdown).toContain('Ahoj')
  })

  it('copies a file path to the clipboard', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    await expect(copyDocumentPath('/Users/me/Documents/Scribe/note.scribe')).resolves.toBe(
      '/Users/me/Documents/Scribe/note.scribe',
    )
    expect(writeText).toHaveBeenCalledWith('/Users/me/Documents/Scribe/note.scribe')
  })

  it('rejects copy/reveal when path is missing', async () => {
    await expect(copyDocumentPath(null)).rejects.toThrow('NO_FILE_PATH')
    await expect(revealDocumentSource('')).rejects.toThrow('NO_FILE_PATH')
    expect(revealInFinder).not.toHaveBeenCalled()
  })

  it('reveals an existing document path', async () => {
    await revealDocumentSource('/tmp/doc.scribe')
    expect(revealInFinder).toHaveBeenCalledWith('/tmp/doc.scribe')
  })
})
