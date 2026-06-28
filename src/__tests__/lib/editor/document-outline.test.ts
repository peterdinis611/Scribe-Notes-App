import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { collectDocumentOutline } from '@/lib/editor/document-outline'

describe('collectDocumentOutline', () => {
  it('collects headings, lists, and block elements', () => {
    const editor = new Editor({
      extensions: [StarterKit],
      content: {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Úvod' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Prvý odsek' }] },
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Položka A' }] }],
              },
            ],
          },
          { type: 'horizontalRule' },
        ],
      },
    })

    const items = collectDocumentOutline(editor as never)
    expect(items.map((item) => item.label)).toEqual([
      'Nadpis 1',
      'Odsek',
      'Položka zoznamu',
      'Oddeľovač',
    ])
    expect(items[0]?.preview).toBe('Úvod')
    expect(items[1]?.preview).toBe('Prvý odsek')
    expect(items[2]?.preview).toBe('Položka A')

    editor.destroy()
  })
})
