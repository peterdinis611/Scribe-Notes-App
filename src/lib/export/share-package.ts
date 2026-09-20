import { exportDocument, revealInFinder, type ExportResult } from '@/lib/db/api'
import { tiptapJsonToHtmlAsync } from '@/lib/export/html'
import { tiptapJsonToMarkdown } from '@/lib/export/markdown'
import { tiptapToPlainText } from '@/lib/export/plain-text'
import type { PageSetup } from '@/lib/editor/page-setup'

export type SharePackageFormat = 'pdf' | 'html-zip' | 'md'

export type ShareDocumentAction =
  | 'pdf'
  | 'html-zip'
  | 'md'
  | 'copy-markdown'
  | 'copy-path'
  | 'reveal'

/**
 * Build a local share package (PDF, HTML ZIP, or Markdown), save via the existing
 * export pipeline, then reveal the file in Finder for AirDrop / sharing.
 * No cloud URLs — the user gets a file on disk.
 */
export async function shareDocumentPackage(args: {
  contentJson: string
  title: string
  format: SharePackageFormat
  pageSetup?: PageSetup
}): Promise<ExportResult | null> {
  if (args.format === 'md') {
    return shareDocumentAsMarkdownFile(args)
  }

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

export async function shareDocumentAsMarkdownFile(args: {
  contentJson: string
  title: string
}): Promise<ExportResult | null> {
  const markdown = tiptapJsonToMarkdown(args.contentJson, args.title)
  const plainText = tiptapToPlainText(args.contentJson)
  const result = await exportDocument('', plainText, args.title, 'md', markdown)

  if (result?.path) {
    await revealInFinder(result.path)
  }

  return result
}

export function documentMarkdownForClipboard(contentJson: string, title: string): string {
  return tiptapJsonToMarkdown(contentJson, title)
}

export async function copyDocumentMarkdown(contentJson: string, title: string): Promise<string> {
  const markdown = documentMarkdownForClipboard(contentJson, title)
  await navigator.clipboard.writeText(markdown)
  return markdown
}

export async function copyDocumentPath(filePath: string | null | undefined): Promise<string> {
  const path = filePath?.trim()
  if (!path) {
    throw new Error('NO_FILE_PATH')
  }
  await navigator.clipboard.writeText(path)
  return path
}

export async function revealDocumentSource(filePath: string | null | undefined): Promise<void> {
  const path = filePath?.trim()
  if (!path) {
    throw new Error('NO_FILE_PATH')
  }
  await revealInFinder(path)
}
