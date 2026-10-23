import { writeFile } from '@tauri-apps/plugin-fs'
import { matrixToXlsxBytes } from '@/lib/export/excel-xlsx'
import { tiptapToPlainText } from '@/lib/export/plain-text'
import { sanitizeFileName } from '@/lib/filenames'
import { saveScopedFile } from '@/lib/fs/scoped-dialog'
import { revealInFinder, type ExportResult } from '@/lib/db/api'

type TipTapNode = {
  type?: string
  text?: string
  content?: TipTapNode[]
}

function cellPlain(node: TipTapNode | undefined): string {
  if (!node) return ''
  if (node.type === 'text') return node.text ?? ''
  return (node.content ?? []).map(cellPlain).join('')
}

/** Extract every TipTap table as a string matrix (row-major). */
export function extractTablesFromTiptapJson(contentJson: string): string[][][] {
  let doc: TipTapNode
  try {
    doc = JSON.parse(contentJson) as TipTapNode
  } catch {
    return []
  }

  const tables: string[][][] = []

  function walk(node: TipTapNode) {
    if (node.type === 'table' && Array.isArray(node.content)) {
      const rows: string[][] = []
      for (const row of node.content) {
        if (row.type !== 'tableRow' || !row.content) continue
        const cells: string[] = []
        for (const cell of row.content) {
          if (cell.type !== 'tableCell' && cell.type !== 'tableHeader') continue
          cells.push(cellPlain(cell).trim())
        }
        if (cells.length > 0) rows.push(cells)
      }
      if (rows.length > 0) tables.push(rows)
      return
    }
    for (const child of node.content ?? []) walk(child)
  }

  walk(doc)
  return tables
}

function plainTextToRows(title: string, contentJson: string): string[][] {
  const plain = tiptapToPlainText(contentJson)
  const lines = plain.split(/\r?\n/)
  const rows: string[][] = [[title.trim() || 'Untitled']]
  for (const line of lines) {
    rows.push([line])
  }
  return rows
}

/** Build a multi-sheet workbook: one sheet per table + Content sheet with body text. */
export async function documentToXlsxBytes(
  contentJson: string,
  title: string,
): Promise<Uint8Array> {
  const XLSX = await import('xlsx')
  const workbook = XLSX.utils.book_new()
  const tables = extractTablesFromTiptapJson(contentJson)

  const contentRows = plainTextToRows(title, contentJson)
  const contentSheet = XLSX.utils.aoa_to_sheet(contentRows)
  XLSX.utils.book_append_sheet(workbook, contentSheet, 'Content')

  tables.forEach((matrix, index) => {
    const sheet = XLSX.utils.aoa_to_sheet(matrix)
    const name = `Table ${index + 1}`.slice(0, 31)
    XLSX.utils.book_append_sheet(workbook, sheet, name)
  })

  // If there were no tables and content is empty-ish, still keep Content sheet.
  if (tables.length === 0 && contentRows.length <= 1) {
    const empty = XLSX.utils.aoa_to_sheet([[title.trim() || 'Untitled'], ['']])
    workbook.Sheets.Content = empty
  }

  return new Uint8Array(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)
}

/** Export the whole document as `.xlsx` (content sheet + table sheets). */
export async function exportDocumentAsXlsx(args: {
  contentJson: string
  title: string
  dialogTitle?: string
}): Promise<ExportResult | null> {
  const defaultPath = sanitizeFileName(args.title || 'document', 'xlsx')
  const path = await saveScopedFile({
    title: args.dialogTitle ?? 'Export Excel',
    defaultPath,
  })
  if (!path) return null

  // Prefer multi-sheet builder; fall back to single-sheet matrix if needed.
  const tables = extractTablesFromTiptapJson(args.contentJson)
  let bytes: Uint8Array
  if (tables.length === 1 && tables[0]) {
    // Single table docs: one clean sheet named after the document.
    bytes = await matrixToXlsxBytes(tables[0], (args.title || 'Sheet1').slice(0, 31))
  } else {
    bytes = await documentToXlsxBytes(args.contentJson, args.title)
  }

  await writeFile(path, bytes)
  await revealInFinder(path)
  return { path }
}
