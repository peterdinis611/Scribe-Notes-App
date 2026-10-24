import { describe, expect, it } from 'vitest'
import {
  documentToCsvMatrix,
  escapeCsvField,
  matrixToCsv,
} from '@/lib/export/document-csv'

describe('document-csv', () => {
  it('escapes commas and quotes', () => {
    expect(escapeCsvField('plain')).toBe('plain')
    expect(escapeCsvField('a,b')).toBe('"a,b"')
    expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""')
  })

  it('serializes a matrix', () => {
    expect(matrixToCsv([['a', 'b'], ['1', '2']])).toBe('a,b\n1,2\n')
  })

  it('prefers the first TipTap table', () => {
    const json = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableHeader',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Name' }] }],
                },
                {
                  type: 'tableHeader',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Age' }] }],
                },
              ],
            },
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableCell',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ada' }] }],
                },
                {
                  type: 'tableCell',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: '36' }] }],
                },
              ],
            },
          ],
        },
      ],
    })
    expect(documentToCsvMatrix(json, 'Doc')).toEqual([
      ['Name', 'Age'],
      ['Ada', '36'],
    ])
  })

  it('falls back to plain text column when there is no table', () => {
    const json = JSON.stringify({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Hello' }],
        },
      ],
    })
    const rows = documentToCsvMatrix(json, 'Note')
    expect(rows[0]).toEqual(['Note'])
    expect(rows.some((row) => row[0]?.includes('Hello'))).toBe(true)
  })
})
