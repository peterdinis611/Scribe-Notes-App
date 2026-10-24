import { writeFile } from '@tauri-apps/plugin-fs'
import { extractTablesFromTiptapJson } from '@/lib/export/document-xlsx'
import { tiptapToPlainText } from '@/lib/export/plain-text'
import { sanitizeFileName } from '@/lib/filenames'
import { saveScopedFile } from '@/lib/fs/scoped-dialog'
import { revealInFinder, type ExportResult } from '@/lib/db/api'

/** Escape one CSV field (RFC4180, comma delimiter). */
export function escapeCsvField(value: string, delimiter = ','): string {
  const needsQuotes =
    value.includes(delimiter) || value.includes('"') || value.includes('\n') || value.includes('\r')
  if (!needsQuotes) return value
  return `"${value.replace(/"/g, '""')}"`
}

/** Serialize a row matrix to CSV text (UTF-8, trailing newline). */
export function matrixToCsv(rows: string[][], delimiter = ','): string {
  if (rows.length === 0) return ''
  const lines = rows.map((row) => row.map((cell) => escapeCsvField(cell, delimiter)).join(delimiter))
  return `${lines.join('\n')}\n`
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

/** Prefer the first TipTap table; otherwise one column of plain text. */
export function documentToCsvMatrix(contentJson: string, title: string): string[][] {
  const tables = extractTablesFromTiptapJson(contentJson)
  if (tables[0] && tables[0].length > 0) {
    return tables[0]
  }
  return plainTextToRows(title, contentJson)
}

export function documentToCsvBytes(contentJson: string, title: string): Uint8Array {
  const matrix = documentToCsvMatrix(contentJson, title)
  const text = matrixToCsv(matrix)
  return new TextEncoder().encode(text)
}

/** Export the document (or its first table) as `.csv`. */
export async function exportDocumentAsCsv(args: {
  contentJson: string
  title: string
  dialogTitle?: string
}): Promise<ExportResult | null> {
  const defaultPath = sanitizeFileName(args.title || 'document', 'csv')
  const path = await saveScopedFile({
    title: args.dialogTitle ?? 'Export CSV',
    defaultPath,
  })
  if (!path) return null

  const bytes = documentToCsvBytes(args.contentJson, args.title)
  await writeFile(path, bytes)
  await revealInFinder(path)
  return { path }
}
