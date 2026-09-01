import { invoke } from '@tauri-apps/api/core'
import type { Document } from '@/lib/db/api'
import { createDocument } from '@/lib/db/api'
import { cacheDocument } from '@/lib/cache/document-cache'
import {
  convertHtmlToContentJson,
  plainTextToContentJson,
  titleFromHtml,
} from '@/lib/import/html-content'
import { importTitleFromPath, isPagesPath } from '@/lib/import/import-path'
import { importWordDocumentFromPath } from '@/lib/import/word-docx'

export { isPagesPath }

type PagesImportPrepared =
  | { kind: 'docx'; path: string }
  | { kind: 'html'; html: string }
  | { kind: 'text'; text: string }

async function cleanupTempImportFile(path: string) {
  try {
    await invoke('cleanup_temp_import_file', { path })
  } catch {
    // Best-effort cleanup for temporary Pages → DOCX conversion files.
  }
}

async function importPagesHtml(html: string, sourcePath: string): Promise<Document> {
  const fallbackTitle = importTitleFromPath(sourcePath, 'Import z Pages')
  const contentJson = await convertHtmlToContentJson(html)
  const doc = await createDocument({
    title: titleFromHtml(html, fallbackTitle),
    contentJson,
  })
  return cacheDocument(doc)
}

async function importPagesText(text: string, sourcePath: string): Promise<Document> {
  const fallbackTitle = importTitleFromPath(sourcePath, 'Import z Pages')
  const doc = await createDocument({
    title: fallbackTitle,
    contentJson: plainTextToContentJson(text),
  })
  return cacheDocument(doc)
}

export async function importPagesDocumentFromPath(path: string): Promise<Document> {
  const prepared = await invoke<PagesImportPrepared>('prepare_pages_import', { path })

  if (prepared.kind === 'docx') {
    try {
      return await importWordDocumentFromPath(prepared.path)
    } finally {
      await cleanupTempImportFile(prepared.path)
    }
  }

  if (prepared.kind === 'html') {
    return importPagesHtml(prepared.html, path)
  }

  return importPagesText(prepared.text, path)
}
