import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { activeTableToDelimited } from '@/lib/editor/table-commands'

function createTableEditor() {
  const editor = new Editor({
    extensions: [StarterKit, Table, TableRow, TableHeader, TableCell],
    content: {
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Name' }] }] },
                { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Qty' }] }] },
              ],
            },
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A, B' }] }] },
                { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '2' }] }] },
              ],
            },
          ],
        },
      ],
    },
  })
  // Place caret inside the table.
  editor.commands.setTextSelection(4)
  return editor
}

describe('activeTableToDelimited', () => {
  it('serializes TSV and CSV with escaping', () => {
    const editor = createTableEditor()
    expect(activeTableToDelimited(editor, '\t')).toBe('Name\tQty\nA, B\t2')
    expect(activeTableToDelimited(editor, ',')).toBe('Name,Qty\n"A, B",2')
    editor.destroy()
  })
})
