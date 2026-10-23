import { describe, expect, it } from 'vitest'
import { extractTablesFromTiptapJson } from '@/lib/export/document-xlsx'

describe('extractTablesFromTiptapJson', () => {
  it('returns empty for invalid json', () => {
    expect(extractTablesFromTiptapJson('not-json')).toEqual([])
  })

  it('extracts nested tables as matrices', () => {
    const json = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Intro' }],
        },
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }] },
                { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'B' }] }] },
              ],
            },
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '1' }] }] },
                { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '2' }] }] },
              ],
            },
          ],
        },
      ],
    })

    expect(extractTablesFromTiptapJson(json)).toEqual([
      [
        ['A', 'B'],
        ['1', '2'],
      ],
    ])
  })
})
