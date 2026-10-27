import { importTitleFromPath } from '@/lib/import/import-path'

const EXCEL_EXTENSION = /\.(xlsx|xlsm|csv|tsv)$/i
const LEGACY_EXCEL_EXTENSION = /\.xls$/i

/** Reject oversized workbooks (aligned with Rust importer). */
export const MAX_EXCEL_BYTES = 12 * 1024 * 1024

export function isExcelPath(path: string) {
  return EXCEL_EXTENSION.test(path)
}

export function isLegacyExcelPath(path: string) {
  return LEGACY_EXCEL_EXTENSION.test(path) && !/\.xlsx$/i.test(path) && !/\.xlsm$/i.test(path)
}

/**
 * Import spreadsheet via Rust (`xlsx_bytes_to_tiptap` / `csv_bytes_to_tiptap`).
 * SheetJS is no longer used on the import path.
 */
export async function importExcelDocumentFromPath(path: string) {
  if (isLegacyExcelPath(path)) {
    throw new Error(
      'Toto je starý formát Excel (.xls). Uložte ho v Exceli ako .xlsx a skúste znova.',
    )
  }

  const { assertImportAllowedByAntivirus } = await import('@/lib/antivirus/scan-import')
  await assertImportAllowedByAntivirus(path)

  const [{ importFile }, { cacheDocument }] = await Promise.all([
    import('@/lib/db/api'),
    import('@/lib/cache/document-cache'),
  ])

  // Title from path is applied by Rust import_file; keep stem helper for callers.
  void importTitleFromPath(path, 'Import z Excelu')
  return cacheDocument(await importFile(path))
}
