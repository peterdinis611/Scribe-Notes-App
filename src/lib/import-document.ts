import { message } from '@tauri-apps/plugin-dialog'
import { cacheDocument } from '@/lib/cache/document-cache'
import {
  createDocument,
  importFile,
  pickAndImportFiles,
  readTextFileDecoded,
  type Document,
} from '@/lib/db/api'
import {
  parseMarkdownToContentJson,
  titleFromMarkdown,
} from '@/lib/editor/markdown-content'
import {
  importPagesDocumentFromPath,
  isPagesPath,
} from '@/lib/import/pages'
import {
  importNumbersDocumentFromPath,
  isNumbersPath,
} from '@/lib/import/numbers'
import {
  importKeynoteDocumentFromPath,
  isKeynotePath,
} from '@/lib/import/keynote'
import {
  importExcelDocumentFromPath,
  isExcelPath,
  isLegacyExcelPath,
} from '@/lib/import/excel-xlsx'
import { isWordDocxPath } from '@/lib/import/word-docx'
import { importPdfDocumentFromPath, isPdfPath } from '@/lib/import/pdf-document'
import { assertImportAllowedByAntivirus } from '@/lib/antivirus/scan-import'
import { toast } from '@/lib/toast'
import i18n from '@/i18n'

/** Extensions accepted for document import (picker + window drop). */
export const IMPORTABLE_DOCUMENT_EXT =
  /\.(scribe\.json|scribe|pages|numbers|key|md|markdown|txt|docx|rtf|doc|xlsx|xlsm|csv|tsv|xls|odt|ods|html|htm|epub|pptx|opml|json|jsonc|jsonl|ndjson|pdf|org|rst|rest|adoc|asciidoc|asc|fountain|spmd|wiki|mediawiki|ics|ical|ifb|eml|rs|py|pyw|pyi|ts|tsx|js|jsx|mjs|cjs|go|java|kt|kts|swift|c|h|hh|hpp|cc|cpp|cxx|cs|fs|rb|php|lua|r|pl|pm|ex|exs|erl|hs|clj|cljs|ml|elm|nim|zig|vue|svelte|css|scss|sass|less|toml|ya?ml|xml|xsl|svg|sql|graphql|gql|proto|sh|bash|zsh|fish|ps1|bat|cmd|tf|hcl|nix|wasm|wat|ini|cfg|conf|env|gradle|groovy|tex|latex|mdx|astro|sol|diff|patch|log)$/i

/** Extensionless build files accepted on drop / open. */
const IMPORTABLE_BASENAMES = /^(dockerfile|makefile|gnumakefile|cmakelists\.txt)(\.|$)/i

export function isImportableSourceBasename(path: string): boolean {
  const name = path.split(/[/\\]/).pop() ?? ''
  return IMPORTABLE_BASENAMES.test(name)
}

function isMarkdownPath(path: string) {
  return /\.(md|markdown)$/i.test(path)
}

function fallbackTitleFromPath(path: string) {
  const fileName = path.split(/[/\\]/).pop() ?? 'Importovaný dokument'
  return fileName.replace(/\.(md|markdown)$/i, '').trim() || 'Importovaný dokument'
}

function isLegacyWordPath(path: string) {
  // Legacy .doc still goes through Rust textutil; .rtf uses the RTF importer.
  return /\.doc$/i.test(path) && !isWordDocxPath(path)
}

export function isImportableDocumentPath(path: string): boolean {
  const trimmed = path.trim()
  return IMPORTABLE_DOCUMENT_EXT.test(trimmed) || isImportableSourceBasename(trimmed)
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

  await assertImportAllowedByAntivirus(selected)

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

  if (isLegacyExcelPath(selected) || isExcelPath(selected)) {
    return await importExcelDocumentFromPath(selected)
  }

  if (isPagesPath(selected)) {
    return await importPagesDocumentFromPath(selected)
  }

  if (isNumbersPath(selected)) {
    return await importNumbersDocumentFromPath(selected)
  }

  if (isKeynotePath(selected)) {
    return await importKeynoteDocumentFromPath(selected)
  }

  // Prefer pdf.js path (richer page text); Rust pdf-extract is used by native picker.
  if (isPdfPath(selected)) {
    return await importPdfDocumentFromPath(selected)
  }

  // .docx / text / .scribe / markup / ics / eml — Rust import_file.
  if (isWordDocxPath(selected) || isLegacyWordPath(selected)) {
    return await importFile(selected)
  }

  return await importFile(selected)
}

export type ImportDocumentsResult = {
  imported: Document[]
  /** Unsupported paths skipped before import (optional for native picker results). */
  skipped?: string[]
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
  // Native Rust multi-file picker + PathAccessGate grant (not JS path strings).
  const result = await pickAndImportFiles()
  if (!result) return null
  for (const doc of result.imported) {
    cacheDocument(doc)
  }
  return {
    imported: result.imported,
    skipped: [],
    failed: result.failed,
  }
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

  const skipped = result.skipped ?? []
  if (skipped.length > 0) {
    toast.info(
      t('fileDrop.skipped', { count: skipped.length }),
      skipped.slice(0, 3).map(fileNameFromPath).join(', '),
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
