import { describe, expect, it } from 'vitest'
import {
  extensionForLanguage,
  extractFirstCodeBlock,
} from '@/lib/export/document-source'

describe('document-source', () => {
  it('extracts the first code block', () => {
    const json = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'codeBlock',
          attrs: { language: 'rust' },
          content: [{ type: 'text', text: 'fn main() {}' }],
        },
      ],
    })
    expect(extractFirstCodeBlock(json)).toEqual({
      language: 'rust',
      code: 'fn main() {}',
    })
  })

  it('maps languages to extensions', () => {
    expect(extensionForLanguage('typescript')).toBe('ts')
    expect(extensionForLanguage('python')).toBe('py')
    expect(extensionForLanguage(null)).toBe('txt')
  })
})
