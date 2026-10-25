import { invoke } from '@/lib/tauri'
import type { Document } from '@/lib/db/api'
import { createDocument, updateDocument } from '@/lib/db/api'
import { cacheDocument } from '@/lib/cache/document-cache'
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
      const { readAntivirusPolicy } = await import('@/lib/antivirus/prefs')
      let doc = await cacheDocument(
        await invoke<Document>('import_file', {
          path: prepared.path,
          antivirusPolicy: readAntivirusPolicy(),
        }),
      )
      const title = importTitleFromPath(path, doc.title)
      if (title && title !== doc.title) {
        doc = await updateDocument({ id: doc.id, title })
      }
      return doc
    } finally {
      await cleanupTempImportFile(prepared.path)
    }
  }

  return importNumbersText(prepared.text, path)
}
