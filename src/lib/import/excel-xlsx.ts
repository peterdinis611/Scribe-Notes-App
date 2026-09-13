import {
  isOleWordDoc,
  isZipArchive,
  readScopedBinaryFile,
} from '@/lib/fs/read-scoped-binary'
import { importTitleFromPath } from '@/lib/import/import-path'

const EXCEL_EXTENSION = /\.(xlsx|xlsm|csv)$/i
const LEGACY_EXCEL_EXTENSION = /\.xls$/i

const MAX_SHEETS = 15
const MAX_ROWS = 400
const MAX_COLS = 40

const EMPTY_DOC_JSON = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] })

type TipTapNode = {
  type: string
  attrs?: Record<string, unknown>
  content?: TipTapNode[]
  text?: string
}

export function isExcelPath(path: string) {
  return EXCEL_EXTENSION.test(path)
}

export function isLegacyExcelPath(path: string) {
  return LEGACY_EXCEL_EXTENSION.test(path) && !/\.xlsx$/i.test(path) && !/\.xlsm$/i.test(path)
}

function cellText(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value)
}

function paragraphNode(text: string): TipTapNode {
  const trimmed = text.replace(/\r\n/g, '\n')
  if (!trimmed) {
    return { type: 'paragraph' }
  }
  return {
    type: 'paragraph',
    content: [{ type: 'text', text: trimmed }],
  }
}

function tableCellNode(text: string, header: boolean): TipTapNode {
  return {
    type: header ? 'tableHeader' : 'tableCell',
    attrs: { colspan: 1, rowspan: 1, colwidth: null },
    content: [paragraphNode(text)],
  }
}

function sheetToTable(rows: unknown[][]): TipTapNode | null {
  if (rows.length === 0) return null

  const width = Math.min(
    MAX_COLS,
    rows.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0),
  )
  if (width === 0) return null

  const limitedRows = rows.slice(0, MAX_ROWS)
  const tableRows: TipTapNode[] = limitedRows.map((row, rowIndex) => {
    const cells: TipTapNode[] = []
    for (let col = 0; col < width; col += 1) {
      const raw = Array.isArray(row) ? row[col] : undefined
      cells.push(tableCellNode(cellText(raw), rowIndex === 0))
    }
    return { type: 'tableRow', content: cells }
  })

  return { type: 'table', content: tableRows }
}

function normalizeDocJson(json: TipTapNode): string {
  if (json.type !== 'doc' || !Array.isArray(json.content) || json.content.length === 0) {
    return EMPTY_DOC_JSON
  }
  return JSON.stringify(json)
}

export async function convertExcelBytesToContentJson(bytes: Uint8Array): Promise<string> {
  const XLSX = await import('xlsx')

  const workbook = XLSX.read(bytes, {
    type: 'array',
    cellDates: true,
  })

  const sheetNames = (workbook.SheetNames ?? []).slice(0, MAX_SHEETS)
  if (sheetNames.length === 0) {
    return EMPTY_DOC_JSON
  }

  const content: TipTapNode[] = []
  const multipleSheets = sheetNames.length > 1

  for (const sheetName of sheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue

    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: '',
      blankrows: false,
    }) as unknown[][]

    const table = sheetToTable(rows)
    if (!table) continue

    if (multipleSheets) {
      content.push({
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: sheetName || 'Sheet' }],
      })
    }

    content.push(table)
    content.push({ type: 'paragraph' })
  }

  if (content.length === 0) {
    return EMPTY_DOC_JSON
  }

  return normalizeDocJson({ type: 'doc', content })
}

export async function importExcelDocumentFromPath(path: string) {
  if (isLegacyExcelPath(path)) {
    throw new Error(
      'Toto je starý formát Excel (.xls). Uložte ho v Exceli ako .xlsx a skúste znova.',
    )
  }

  const bytes = await readScopedBinaryFile(path)

  if (bytes.length === 0) {
    throw new Error('Súbor sa nepodarilo prečítať alebo je prázdny.')
  }

  const isCsv = /\.csv$/i.test(path)
  if (!isCsv) {
    if (isOleWordDoc(bytes)) {
      throw new Error(
        'Toto je starý formát Excel (.xls). Uložte ho v Exceli ako .xlsx a skúste znova.',
      )
    }
    if (!isZipArchive(bytes)) {
      throw new Error(
        'Súbor nie je platný Excel (.xlsx). Otvorte ho v Exceli a uložte ako .xlsx.',
      )
    }
  }

  const [{ createDocument }, { cacheDocument }] = await Promise.all([
    import('@/lib/db/api'),
    import('@/lib/cache/document-cache'),
  ])

  const fallbackTitle = importTitleFromPath(path, 'Import z Excelu')
  const contentJson = await convertExcelBytesToContentJson(bytes)

  const created = await createDocument({
    title: fallbackTitle,
    contentJson,
  })

  return cacheDocument(created)
}
