import { findParentNode } from '@tiptap/core'
import type { Editor } from '@tiptap/react'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'

/** Parse a cell string into a number (supports 1.5 / 1,5 / € / spaces). */
export function parseTableNumber(raw: string): number | null {
  const cleaned = raw
    .replace(/\s/g, '')
    .replace(/[€$£¥]/g, '')
    .replace(/[^\d,.-]/g, '')
  if (!cleaned || cleaned === '-' || cleaned === '.' || cleaned === ',') return null

  let normalized = cleaned
  if (normalized.includes(',') && normalized.includes('.')) {
    // 1.234,56 vs 1,234.56 — last separator wins as decimal.
    if (normalized.lastIndexOf(',') > normalized.lastIndexOf('.')) {
      normalized = normalized.replace(/\./g, '').replace(',', '.')
    } else {
      normalized = normalized.replace(/,/g, '')
    }
  } else if (normalized.includes(',')) {
    normalized = normalized.replace(',', '.')
  }

  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}

function cellText(cell: ProseMirrorNode): string {
  return cell.textContent.trim()
}

function getTableContext(editor: Editor) {
  const table = findParentNode((node) => node.type.name === 'table')(editor.state.selection)
  if (!table) return null

  const $from = editor.state.selection.$from
  let row = -1
  let col = -1
  let pos = table.pos + 1
  let rowIndex = 0

  for (let i = 0; i < table.node.childCount; i += 1) {
    const rowNode = table.node.child(i)
    if (rowNode.type.name !== 'tableRow') continue
    const rowStart = pos
    if ($from.pos >= rowStart && $from.pos < rowStart + rowNode.nodeSize) {
      row = rowIndex
      let cellPos = rowStart + 1
      let colIndex = 0
      for (let j = 0; j < rowNode.childCount; j += 1) {
        const cellNode = rowNode.child(j)
        if (cellNode.type.name !== 'tableCell' && cellNode.type.name !== 'tableHeader') continue
        if ($from.pos >= cellPos && $from.pos < cellPos + cellNode.nodeSize) {
          col = colIndex
          break
        }
        cellPos += cellNode.nodeSize
        colIndex += 1
      }
    }
    pos += rowNode.nodeSize
    rowIndex += 1
  }

  if (row < 0 || col < 0) return null
  return { table, row, col }
}

function collectRows(tableNode: ProseMirrorNode): ProseMirrorNode[] {
  const rows: ProseMirrorNode[] = []
  tableNode.forEach((child) => {
    if (child.type.name === 'tableRow') rows.push(child)
  })
  return rows
}

function rowHasHeader(row: ProseMirrorNode): boolean {
  let header = false
  row.forEach((cell) => {
    if (cell.type.name === 'tableHeader') header = true
  })
  return header
}

function getCell(row: ProseMirrorNode, col: number): ProseMirrorNode | null {
  let index = 0
  let found: ProseMirrorNode | null = null
  row.forEach((cell) => {
    if (cell.type.name !== 'tableCell' && cell.type.name !== 'tableHeader') return
    if (index === col) found = cell
    index += 1
  })
  return found
}

export type TableColumnStats = {
  count: number
  sum: number
  avg: number
  values: number[]
}

export function getActiveColumnNumbers(editor: Editor): TableColumnStats | null {
  const ctx = getTableContext(editor)
  if (!ctx) return null
  const rows = collectRows(ctx.table.node)
  const values: number[] = []
  for (const row of rows) {
    if (rowHasHeader(row)) continue
    const cell = getCell(row, ctx.col)
    if (!cell) continue
    const num = parseTableNumber(cellText(cell))
    if (num != null) values.push(num)
  }
  if (values.length === 0) return { count: 0, sum: 0, avg: 0, values }
  const sum = values.reduce((a, b) => a + b, 0)
  return { count: values.length, sum, avg: sum / values.length, values }
}

export function sortTableByActiveColumn(editor: Editor, direction: 'asc' | 'desc' = 'asc'): boolean {
  const ctx = getTableContext(editor)
  if (!ctx) return false
  const { table, col } = ctx
  const rows = collectRows(table.node)
  if (rows.length < 2) return false

  const headerRows = rows.filter(rowHasHeader)
  const bodyRows = rows.filter((row) => !rowHasHeader(row))
  if (bodyRows.length < 2) return false

  const sorted = [...bodyRows].sort((left, right) => {
    const leftCell = getCell(left, col)
    const rightCell = getCell(right, col)
    const leftText = leftCell ? cellText(leftCell) : ''
    const rightText = rightCell ? cellText(rightCell) : ''
    const leftNum = parseTableNumber(leftText)
    const rightNum = parseTableNumber(rightText)
    const cmp =
      leftNum != null && rightNum != null
        ? leftNum - rightNum
        : leftText.localeCompare(rightText, undefined, { numeric: true, sensitivity: 'base' })
    return direction === 'asc' ? cmp : -cmp
  })

  const schema = editor.state.schema
  const nextRows = [...headerRows, ...sorted]
  const nextTable = table.node.type.create(
    table.node.attrs,
    nextRows.map((row) => row.copy(row.content)),
    table.node.marks,
  )
  // Ensure we keep schema table type
  void schema
  const tr = editor.state.tr.replaceWith(table.pos, table.pos + table.node.nodeSize, nextTable)
  editor.view.dispatch(tr)
  return true
}

export function fillDownActiveColumn(editor: Editor): boolean {
  const ctx = getTableContext(editor)
  if (!ctx) return false
  const { table, row, col } = ctx
  const rows = collectRows(table.node)
  if (row < 0 || row >= rows.length - 1) return false

  const sourceRow = rows[row]!
  const sourceCell = getCell(sourceRow, col)
  if (!sourceCell) return false
  const sourceContent = sourceCell.content

  let pos = table.pos + 1
  const tr = editor.state.tr
  let changed = false

  for (let i = 0; i < rows.length; i += 1) {
    const rowNode = rows[i]!
    const rowStart = pos
    if (i > row) {
      let cellPos = rowStart + 1
      let colIndex = 0
      for (let j = 0; j < rowNode.childCount; j += 1) {
        const cellNode = rowNode.child(j)
        if (cellNode.type.name !== 'tableCell' && cellNode.type.name !== 'tableHeader') {
          continue
        }
        if (colIndex === col) {
          const text = cellText(cellNode)
          if (!text) {
            tr.replaceWith(cellPos + 1, cellPos + cellNode.nodeSize - 1, sourceContent)
            changed = true
          }
          break
        }
        cellPos += cellNode.nodeSize
        colIndex += 1
      }
    }
    pos += rowNode.nodeSize
  }

  if (!changed) return false
  editor.view.dispatch(tr)
  return true
}

export function insertColumnTotalBelow(editor: Editor): boolean {
  const stats = getActiveColumnNumbers(editor)
  const ctx = getTableContext(editor)
  if (!stats || !ctx || stats.count === 0) return false

  const formatted = Number.isInteger(stats.sum)
    ? String(stats.sum)
    : stats.sum.toFixed(2).replace(/\.?0+$/, '')

  // Prefer filling the first empty body cell below selection in this column;
  // otherwise append text into the last body cell.
  const { table, col } = ctx
  const rows = collectRows(table.node)
  let pos = table.pos + 1
  const tr = editor.state.tr
  let target: { from: number; to: number; empty: boolean } | null = null

  for (let i = 0; i < rows.length; i += 1) {
    const rowNode = rows[i]!
    const rowStart = pos
    if (!rowHasHeader(rowNode)) {
      let cellPos = rowStart + 1
      let colIndex = 0
      for (let j = 0; j < rowNode.childCount; j += 1) {
        const cellNode = rowNode.child(j)
        if (cellNode.type.name !== 'tableCell' && cellNode.type.name !== 'tableHeader') continue
        if (colIndex === col) {
          const empty = !cellText(cellNode)
          const candidate = {
            from: cellPos + 1,
            to: cellPos + cellNode.nodeSize - 1,
            empty,
          }
          if (empty) {
            target = candidate
          } else if (!target) {
            target = candidate
          }
          break
        }
        cellPos += cellNode.nodeSize
        colIndex += 1
      }
    }
    pos += rowNode.nodeSize
  }

  if (!target) return false
  const textNode = editor.state.schema.text(formatted)
  const paragraph = editor.state.schema.nodes.paragraph!.create(null, textNode)
  tr.replaceWith(target.from, target.to, paragraph)
  editor.view.dispatch(tr)
  return true
}
