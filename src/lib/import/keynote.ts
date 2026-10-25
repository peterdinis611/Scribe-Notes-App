import { invoke } from '@/lib/tauri'
import type { Document } from '@/lib/db/api'
import { createDocument, updateDocument } from '@/lib/db/api'
import { cacheDocument } from '@/lib/cache/document-cache'
import { plainTextToContentJson } from '@/lib/import/html-content'
import { importTitleFromPath, isKeynotePath } from '@/lib/import/import-path'

export { isKeynotePath }

type KeynoteImportPrepared =
  | { kind: 'pptx'; path: string }
  | { kind: 'text'; text: string }

async function cleanupTempImportFile(path: string) {
  try {
    await invoke('cleanup_temp_import_file', { path })
  } catch {
    // Best-effort cleanup for temporary Keynote → PPTX conversion files.
  }
}

async function importKeynoteText(text: string, sourcePath: string): Promise<Document> {
  const doc = await createDocument({
    title: importTitleFromPath(sourcePath, 'Import z Keynote'),
    contentJson: plainTextToContentJson(text),
  })
  return cacheDocument(doc)
}

export async function importKeynoteDocumentFromPath(path: string): Promise<Document> {
  const { assertImportAllowedByAntivirus } = await import('@/lib/antivirus/scan-import')
  await assertImportAllowedByAntivirus(path)

  const prepared = await invoke<KeynoteImportPrepared>('prepare_keynote_import', { path })

  if (prepared.kind === 'pptx') {
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

  return importKeynoteText(prepared.text, path)
}
