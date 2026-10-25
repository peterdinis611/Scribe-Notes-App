import { invoke } from '@/lib/tauri'
import type { Document } from '@/lib/db/api'
import { createDocument } from '@/lib/db/api'
import { cacheDocument } from '@/lib/cache/document-cache'
import { readScopedBinaryFile } from '@/lib/fs/read-scoped-binary'
import { convertExcelBytesToContentJson, MAX_EXCEL_BYTES } from '@/lib/import/excel-xlsx'
import { plainTextToContentJson } from '@/lib/import/html-content'
import { importTitleFromPath, isNumbersPath } from '@/lib/import/import-path'

export { isNumbersPath }

type NumbersImportPrepared =
  | { kind: 'xlsx'; path: string }
  | { kind: 'text'; text: string }

async function cleanupTempImportFile(path: string) {
  try {
    await invoke('cleanup_temp_import_file', { path })
  } catch {
    // Best-effort cleanup for temporary Numbers → XLSX conversion files.
  }
}

async function importNumbersText(text: string, sourcePath: string): Promise<Document> {
  const doc = await createDocument({
    title: importTitleFromPath(sourcePath, 'Import z Numbers'),
    contentJson: plainTextToContentJson(text),
  })
  return cacheDocument(doc)
}

export async function importNumbersDocumentFromPath(path: string): Promise<Document> {
  const { assertImportAllowedByAntivirus } = await import('@/lib/antivirus/scan-import')
  await assertImportAllowedByAntivirus(path)

  const prepared = await invoke<NumbersImportPrepared>('prepare_numbers_import', { path })

  if (prepared.kind === 'xlsx') {
    try {
      const bytes = await readScopedBinaryFile(prepared.path)
      if (bytes.length === 0) {
        throw new Error('Dočasný .xlsx z Numbers je prázdny.')
      }
      if (bytes.byteLength > MAX_EXCEL_BYTES) {
        throw new Error(
          `Numbers export je príliš veľký (max ${Math.floor(MAX_EXCEL_BYTES / (1024 * 1024))} MB).`,
        )
      }
      const contentJson = await convertExcelBytesToContentJson(bytes)
      const doc = await createDocument({
        title: importTitleFromPath(path, 'Import z Numbers'),
        contentJson,
      })
      return cacheDocument(doc)
    } finally {
      await cleanupTempImportFile(prepared.path)
    }
  }

  return importNumbersText(prepared.text, path)
}
