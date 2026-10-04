import { message, open } from '@tauri-apps/plugin-dialog'
import { cacheDocument } from '@/lib/cache/document-cache'
import { createDocument, importFile, readTextFileDecoded, type Document } from '@/lib/db/api'
import {
  parseMarkdownToContentJson,
  titleFromMarkdown,
} from '@/lib/editor/markdown-content'
import {
  importPagesDocumentFromPath,
  isPagesPath,
} from '@/lib/import/pages'
import {
  importExcelDocumentFromPath,
  isExcelPath,
  isLegacyExcelPath,
} from '@/lib/import/excel-xlsx'
import { isWordDocxPath } from '@/lib/import/word-docx'
import { toast } from '@/lib/toast'
import i18n from '@/i18n'

const IMPORT_FILTERS = [
  {
    name: 'Apple Pages',
    extensions: ['pages'],
  },
  {
    name: 'Podporované dokumenty',
    extensions: [
      'scribe',
      'pages',
      'md',
      'markdown',
      'txt',
      'docx',
      'rtf',
      'doc',
      'xlsx',
      'xlsm',
      'csv',
      'xls',
    ],
  },
  { name: 'Scribe', extensions: ['scribe'] },
  { name: 'Text a Markdown', extensions: ['md', 'markdown', 'txt'] },
  { name: 'Word', extensions: ['docx', 'doc', 'rtf'] },
  { name: 'Excel', extensions: ['xlsx', 'xlsm', 'csv', 'xls'] },
]

/** Extensions accepted for document import (picker + window drop). */
export const IMPORTABLE_DOCUMENT_EXT =
  /\.(scribe\.json|scribe|pages|md|markdown|txt|docx|rtf|doc|xlsx|xlsm|csv|xls)$/i

function isMarkdownPath(path: string) {
  return /\.(md|markdown)$/i.test(path)
}

function fallbackTitleFromPath(path: string) {
  const fileName = path.split(/[/\\]/).pop() ?? 'Importovaný dokument'
  return fileName.replace(/\.(md|markdown)$/i, '').trim() || 'Importovaný dokument'
}

function isLegacyWordPath(path: string) {
  return /\.(doc|rtf)$/i.test(path) && !isWordDocxPath(path)
}

export function isImportableDocumentPath(path: string): boolean {
  return IMPORTABLE_DOCUMENT_EXT.test(path.trim())
}

export function filterImportableDocumentPaths(paths: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const path of paths) {
    const trimmed = path.trim()
    if (!trimmed || seen.has(trimmed) || !isImportableDocumentPath(trimmed)) continue
    seen.add(trimmed)
    out.push(trimmed)
  }
  return out
}

export function fileNameFromPath(path: string): string {
  return path.split(/[/\\]/).pop() ?? path
}

/** Import a single document from an absolute filesystem path. */
export async function importDocumentFromPath(path: string): Promise<Document> {
  const selected = path.trim()
  if (!selected) throw new Error('Empty path')

  if (isMarkdownPath(selected)) {
    const decoded = await readTextFileDecoded(selected)
    if (decoded.converted && decoded.encoding.toLowerCase() !== 'utf-8') {
      toast.info(i18n.t('import.encodingConverted', { encoding: decoded.encoding }))
    }
    const markdown = decoded.text
    const fallbackTitle = fallbackTitleFromPath(selected)
    const doc = await createDocument({
      title: titleFromMarkdown(markdown, fallbackTitle),
      contentJson: parseMarkdownToContentJson(markdown),
    })
    return cacheDocument(doc)
  }

  if (isLegacyExcelPath(selected)) {
    return await importExcelDocumentFromPath(selected)
  }

  if (isExcelPath(selected) && /\.csv$/i.test(selected)) {
    return await importExcelDocumentFromPath(selected)
  }

  if (isPagesPath(selected)) {
    return await importPagesDocumentFromPath(selected)
  }

  // .docx / .xlsx / text / .scribe — Rust import_file (office_import for Office).
  if (isWordDocxPath(selected) || isExcelPath(selected) || isLegacyWordPath(selected)) {
    return await importFile(selected)
  }

  return await importFile(selected)
}

export type ImportDocumentsResult = {
  imported: Document[]
  skipped: string[]
  failed: Array<{ path: string; error: string }>
}

/** Import many paths sequentially. Skips unsupported extensions. */
export async function importDocumentsFromPaths(paths: string[]): Promise<ImportDocumentsResult> {
  const importable = filterImportableDocumentPaths(paths)
  const skipped = paths
    .map((path) => path.trim())
    .filter((path) => path && !isImportableDocumentPath(path))

  const imported: Document[] = []
  const failed: Array<{ path: string; error: string }> = []

  for (const path of importable) {
    try {
      imported.push(await importDocumentFromPath(path))
    } catch (error) {
      failed.push({
        path,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return { imported, skipped, failed }
}

/**
 * Open a multi-file picker and import all selected documents.
 * Returns `null` when the user cancels.
 */
export async function pickAndImportDocuments(): Promise<ImportDocumentsResult | null> {
  const selected = await open({
    multiple: true,
    title: 'Importovať dokumenty',
    filters: IMPORT_FILTERS,
    fileAccessMode: 'scoped',
  })

  if (selected == null) {
    return null
  }

  const paths = (Array.isArray(selected) ? selected : [selected]).filter(Boolean)
  if (paths.length === 0) {
    return null
  }

  return importDocumentsFromPaths(paths)
}

/** Single-file convenience wrapper (first imported doc, or null). */
export async function pickAndImportDocument(): Promise<Document | null> {
  const result = await pickAndImportDocuments()
  if (!result) return null

  if (result.imported.length === 0 && result.failed.length > 0) {
    const first = result.failed[0]!
    await message(`${fileNameFromPath(first.path)}: ${first.error}`, {
      title: 'Import zlyhal',
      kind: 'error',
    })
    return null
  }

  return result.imported[0] ?? null
}

/** Toast feedback for a batch import result (picker or drop). */
export function toastImportDocumentsResult(
  result: ImportDocumentsResult,
  t: (key: string, options?: Record<string, unknown>) => string,
): void {
  if (result.imported.length === 1) {
    toast.success(
      t('toasts.documentImported'),
      result.imported[0]!.title || t('fileDrop.importedOne'),
    )
  } else if (result.imported.length > 1) {
    toast.success(t('fileDrop.importedMany', { count: result.imported.length }))
  }

  if (result.skipped.length > 0) {
    toast.info(
      t('fileDrop.skipped', { count: result.skipped.length }),
      result.skipped.slice(0, 3).map(fileNameFromPath).join(', '),
    )
  }

  if (result.failed.length > 0) {
    const first = result.failed[0]!
    toast.error(
      t('fileDrop.failed', { count: result.failed.length }),
      `${fileNameFromPath(first.path)}: ${first.error}`,
    )
  }
}
