import { describe, expect, it } from 'vitest'
import {
  getImageOnlyClipboardFiles,
  parseTsvTable,
  tsvGridToTableHtml,
} from '@/lib/editor/paste-handler'

function createDataTransfer(init: {
  html?: string
  text?: string
  files?: File[]
}): DataTransfer {
  const store = {
    html: init.html ?? '',
    text: init.text ?? '',
    files: init.files ?? [],
  }

  return {
    getData(type: string) {
      if (type === 'text/html') return store.html
      if (type === 'text/plain') return store.text
      return ''
    },
    files: store.files,
  } as DataTransfer
}

describe('getImageOnlyClipboardFiles', () => {
  it('returns image files when clipboard has no text content', () => {
    const image = new File(['png'], 'photo.png', { type: 'image/png' })
    const data = createDataTransfer({ files: [image] })

    expect(getImageOnlyClipboardFiles(data)).toEqual([image])
  })

  it('returns empty array when html content is present', () => {
    const image = new File(['png'], 'photo.png', { type: 'image/png' })
    const data = createDataTransfer({
      html: '<p>Hello</p>',
      files: [image],
    })

    expect(getImageOnlyClipboardFiles(data)).toEqual([])
  })

  it('returns empty array when plain text is present', () => {
    const image = new File(['png'], 'photo.png', { type: 'image/png' })
    const data = createDataTransfer({
      text: 'Hello',
      files: [image],
    })

    expect(getImageOnlyClipboardFiles(data)).toEqual([])
  })
})

describe('parseTsvTable', () => {
  it('parses Excel-style TSV into a grid', () => {
    expect(parseTsvTable('Name\tQty\nApples\t3\nPears\t2')).toEqual([
      ['Name', 'Qty'],
      ['Apples', '3'],
      ['Pears', '2'],
    ])
  })

  it('pads short rows to the widest column count', () => {
    expect(parseTsvTable('A\tB\tC\n1\t2')).toEqual([
      ['A', 'B', 'C'],
      ['1', '2', ''],
    ])
  })

  it('rejects plain text without tabs', () => {
    expect(parseTsvTable('just a sentence')).toBeNull()
  })
})

describe('tsvGridToTableHtml', () => {
  it('builds a header row for multi-row grids', () => {
    const html = tsvGridToTableHtml([
      ['A', 'B'],
      ['1', '2'],
    ])
    expect(html).toContain('<thead>')
    expect(html).toContain('<th><p>A</p></th>')
    expect(html).toContain('<td><p>1</p></td>')
  })
})
