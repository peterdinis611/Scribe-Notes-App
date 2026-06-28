import { describe, expect, it } from 'vitest'
import { tiptapToPlainText } from '@/lib/export/plain-text'

describe('tiptapToPlainText', () => {
  it('extracts plain text from paragraphs and lists', () => {
    const json = JSON.stringify({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Prvý riadok' }] },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Odrážka' }] }],
            },
          ],
        },
      ],
    })

    expect(tiptapToPlainText(json)).toBe('Prvý riadok\n\n- Odrážka')
  })

  it('returns empty string for invalid json', () => {
    expect(tiptapToPlainText('{')).toBe('')
  })
})
