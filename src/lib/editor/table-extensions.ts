import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { findParentNode } from '@tiptap/core'
import type { Editor } from '@tiptap/react'

export const TABLE_CELL_COLORS = [
  { label: 'Bez farby', value: '' },
  { label: 'Žltá', value: '#fff3a3' },
  { label: 'Zelená', value: '#d1fae5' },
  { label: 'Modrá', value: '#dbeafe' },
  { label: 'Ružová', value: '#fce7f3' },
  { label: 'Oranžová', value: '#ffedd5' },
  { label: 'Fialová', value: '#ede9fe' },
] as const

const backgroundColorAttr = {
  backgroundColor: {
    default: null as string | null,
    parseHTML: (element: HTMLElement) => element.getAttribute('data-background-color'),
    renderHTML: (attributes: { backgroundColor?: string | null }) => {
      if (!attributes.backgroundColor) return {}
      return {
        'data-background-color': attributes.backgroundColor,
        style: `background-color: ${attributes.backgroundColor}`,
      }
    },
  },
}

export const CustomTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...backgroundColorAttr,
    }
  },
})

export const CustomTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      ...backgroundColorAttr,
    }
  },
})

export type TableMatrixCell = {
  id: string
  row: number
  col: number
  isHeader: boolean
  backgroundColor: string | null
}

export type TableMatrixRow = {
  id: string
  cells: TableMatrixCell[]
}

export function getTableMatrix(editor: Editor): TableMatrixRow[] | null {
  const table = findParentNode((node) => node.type.name === 'table')(editor.state.selection)
  if (!table) return null

  const rows: TableMatrixRow[] = []
  let rowIndex = 0

  table.node.forEach((rowNode) => {
    if (rowNode.type.name !== 'tableRow') return

    const cells: TableMatrixCell[] = []
    let colIndex = 0

    rowNode.forEach((cellNode) => {
      if (cellNode.type.name !== 'tableCell' && cellNode.type.name !== 'tableHeader') return

      cells.push({
        id: `${rowIndex}-${colIndex}`,
        row: rowIndex,
        col: colIndex,
        isHeader: cellNode.type.name === 'tableHeader',
        backgroundColor: (cellNode.attrs.backgroundColor as string | null) ?? null,
      })
      colIndex += 1
    })

    rows.push({ id: `row-${rowIndex}`, cells })
    rowIndex += 1
  })

  return rows
}

export function setTableCellBackground(editor: Editor, color: string) {
  if (!color) {
    return editor.chain().focus().setCellAttribute('backgroundColor', null).run()
  }
  return editor.chain().focus().setCellAttribute('backgroundColor', color).run()
}

export function focusTableCell(editor: Editor, row: number, col: number) {
  const table = findParentNode((node) => node.type.name === 'table')(editor.state.selection)
  if (!table) return false

  let pos = table.pos + 1
  let currentRow = 0

  for (let i = 0; i < table.node.childCount; i += 1) {
    const rowNode = table.node.child(i)
    if (rowNode.type.name !== 'tableRow') continue

    if (currentRow === row) {
      let currentCol = 0
      for (let j = 0; j < rowNode.childCount; j += 1) {
        const cellNode = rowNode.child(j)
        if (cellNode.type.name !== 'tableCell' && cellNode.type.name !== 'tableHeader') continue
        if (currentCol === col) {
          return editor.chain().focus().setTextSelection(pos + 1).run()
        }
        pos += cellNode.nodeSize
        currentCol += 1
      }
      return false
    }

    pos += rowNode.nodeSize
    currentRow += 1
  }

  return false
}
