import { writeFile } from '@tauri-apps/plugin-fs'
import type { Editor } from '@tiptap/react'
import { activeTableToMatrix } from '@/lib/editor/table-commands'
import { sanitizeFileName } from '@/lib/filenames'
import { saveScopedFile } from '@/lib/fs/scoped-dialog'

/** Build .xlsx bytes from a row matrix (first row is header visually in Excel). */
export async function matrixToXlsxBytes(rows: string[][], sheetName = 'Sheet1'): Promise<Uint8Array> {
  const XLSX = await import('xlsx')
  const sheet = XLSX.utils.aoa_to_sheet(rows)
  const workbook = XLSX.utils.book_new()
  const safeName = sheetName.trim().slice(0, 31) || 'Sheet1'
  XLSX.utils.book_append_sheet(workbook, sheet, safeName)
  return new Uint8Array(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer)
}

/** Export the active editor table as `.xlsx` via the native save dialog. */
export async function exportActiveTableAsXlsx(
  editor: Editor,
  options?: { baseName?: string; sheetName?: string; dialogTitle?: string },
): Promise<string | null> {
  const matrix = activeTableToMatrix(editor)
  if (!matrix || matrix.length === 0) return null

  const defaultPath = sanitizeFileName(options?.baseName ?? 'table', 'xlsx')
  const path = await saveScopedFile({
    title: options?.dialogTitle,
    defaultPath,
  })
  if (!path) return null

  const bytes = await matrixToXlsxBytes(matrix, options?.sheetName ?? 'Sheet1')
  await writeFile(path, bytes)
  return path
}
