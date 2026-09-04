import { exportDocument, revealInFinder, type ExportResult } from '@/lib/db/api'
import { tiptapJsonToHtmlAsync } from '@/lib/export/html'
import { tiptapToPlainText } from '@/lib/export/plain-text'
import type { PageSetup } from '@/lib/editor/page-setup'

export type SharePackageFormat = 'pdf' | 'html-zip'

/**
 * Build a local share package (PDF or HTML ZIP), save via the existing export
 * pipeline, then reveal the file in Finder for AirDrop / sharing.
 * No cloud URLs — the user gets a file on disk.
 */
export async function shareDocumentPackage(args: {
  contentJson: string
  title: string
  format: SharePackageFormat
  pageSetup?: PageSetup
}): Promise<ExportResult | null> {
  const html = await tiptapJsonToHtmlAsync(args.contentJson, args.title, {
    pageSetup: args.pageSetup,
    forPrint: true,
  })
  const plainText = tiptapToPlainText(args.contentJson)

  // PDF goes through generatePdfFromHtml → export_pdf_bytes inside exportDocument;
  // HTML ZIP uses export_document with format html-zip.
  const result = await exportDocument(
    html,
    plainText,
    args.title,
    args.format,
    undefined,
    args.pageSetup,
  )

  if (result?.path) {
    await revealInFinder(result.path)
  }

  return result
}
