import { readScopedBinaryFile } from '@/lib/fs/read-scoped-binary'
import { assertImportAllowedByAntivirus } from '@/lib/antivirus/scan-import'

export function isPdfPath(path: string) {
  return /\.pdf$/i.test(path)
}

/**
 * Import a PDF note via Rust `pdf_bytes_to_tiptap` (same path as native picker).
 * Replaces the old pdf.js text extraction.
 */
export async function importPdfDocumentFromPath(path: string) {
  await assertImportAllowedByAntivirus(path)
  const bytes = await readScopedBinaryFile(path)
  if (bytes.length === 0) {
    throw new Error('PDF súbor sa nepodarilo prečítať alebo je prázdny.')
  }
  if (bytes.byteLength > 40 * 1024 * 1024) {
    throw new Error('PDF je príliš veľký (max 40 MB).')
  }

  const [{ importFile }, { cacheDocument }] = await Promise.all([
    import('@/lib/db/api'),
    import('@/lib/cache/document-cache'),
  ])

  return cacheDocument(await importFile(path))
}
