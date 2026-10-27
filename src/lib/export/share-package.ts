import { exportDocument, revealInFinder, type ExportResult } from '@/lib/db/api'
import { tiptapJsonToHtmlAsync } from '@/lib/export/html'
import { tiptapJsonToMarkdown } from '@/lib/export/markdown'
import { tiptapToPlainText } from '@/lib/export/plain-text'
import { exportDocumentAsXlsx } from '@/lib/export/document-xlsx'
import { exportDocumentAsCsv } from '@/lib/export/document-csv'
import {
  exportDocumentAsOpml,
  exportDocumentAsStructuredJson,
} from '@/lib/export/document-structured'
import { exportDocumentAsSource } from '@/lib/export/document-source'
import { generateMarkdownWithLlm } from '@/lib/export/llm-markdown'
import type { PageSetup } from '@/lib/editor/page-setup'

/** Formats that write a file via the share / convert dialog. */
export type SharePackageFormat =
  | 'pdf'
  | 'html-zip'
  | 'html'
  | 'md'
  | 'md-llm'
  | 'docx'
  | 'txt'
  | 'xlsx'
  | 'csv'
  | 'json'
  | 'opml'
  | 'epub'
  | 'source'

export type ShareDocumentAction =
  | SharePackageFormat
  | 'copy-markdown'
  | 'copy-path'
  | 'reveal'

/**
 * Convert / share a document as a local file (PDF, Markdown, Word, Excel, TXT, HTML ZIP),
 * then reveal it in Finder. No cloud URLs — the user gets a file on disk.
 */
export async function shareDocumentPackage(args: {
  contentJson: string
  title: string
  format: SharePackageFormat
  pageSetup?: PageSetup
  documentId?: string
}): Promise<ExportResult | null> {
  if (args.format === 'md') {
    return shareDocumentAsMarkdownFile(args)
  }

  if (args.format === 'md-llm') {
    return shareDocumentAsLlmMarkdownFile(args)
  }

  if (args.format === 'txt') {
    return shareDocumentAsPlainTextFile(args)
  }

  if (args.format === 'xlsx') {
    return exportDocumentAsXlsx({
      contentJson: args.contentJson,
      title: args.title,
    })
  }

  if (
    (args.format === 'csv' || args.format === 'json' || args.format === 'opml') &&
    args.documentId
  ) {
    try {
      const { exportDocumentById } = await import('@/lib/db/api')
      const result = await exportDocumentById(args.documentId, args.format)
      if (result?.path) await revealInFinder(result.path)
      return result
    } catch {
      // Vault / missing row — fall through to FE serializers.
    }
  }

  if (args.format === 'csv') {
    return exportDocumentAsCsv({
      contentJson: args.contentJson,
      title: args.title,
    })
  }

  if (args.format === 'json') {
    return exportDocumentAsStructuredJson({
      contentJson: args.contentJson,
      title: args.title,
    })
  }

  if (args.format === 'opml') {
    return exportDocumentAsOpml({
      contentJson: args.contentJson,
      title: args.title,
    })
  }

  if (args.format === 'source') {
    return exportDocumentAsSource({
      contentJson: args.contentJson,
      title: args.title,
    })
  }

  if ((args.format === 'html' || args.format === 'epub') && args.documentId) {
    const result = await exportDocument('', '', args.title, args.format, undefined, undefined, {
      documentId: args.documentId,
    })
    if (result?.path) {
      await revealInFinder(result.path)
    }
    return result
  }

  if (args.format === 'html-zip' && args.documentId) {
    const result = await exportDocument('', '', args.title, 'html-zip', undefined, undefined, {
      documentId: args.documentId,
    })
    if (result?.path) {
      await revealInFinder(result.path)
    }
    return result
  }

  if (args.format === 'docx') {
    const html = await tiptapJsonToHtmlAsync(args.contentJson, args.title, {
      pageSetup: args.pageSetup,
      forPrint: true,
    })
    const plainText = tiptapToPlainText(args.contentJson)
    const markdown = tiptapJsonToMarkdown(args.contentJson, args.title)
    const result = await exportDocument(
      html,
      plainText,
      args.title,
      'docx',
      markdown,
      args.pageSetup,
      args.documentId ? { documentId: args.documentId } : undefined,
    )
    if (result?.path) {
      await revealInFinder(result.path)
    }
    return result
  }

  // pdf / html / html-zip / epub fallback without documentId
  const html = await tiptapJsonToHtmlAsync(args.contentJson, args.title, {
    pageSetup: args.pageSetup,
    forPrint: true,
  })
  const plainText = tiptapToPlainText(args.contentJson)

  const blobFormat =
    args.format === 'html-zip' || args.format === 'html' || args.format === 'epub'
      ? args.format
      : 'pdf'

  const result = await exportDocument(
    html,
    plainText,
    args.title,
    blobFormat,
    undefined,
    args.pageSetup,
    args.documentId ? { documentId: args.documentId } : undefined,
  )

  if (result?.path) {
    await revealInFinder(result.path)
  }

  return result
}

export async function shareDocumentAsMarkdownFile(args: {
  contentJson: string
  title: string
  documentId?: string
}): Promise<ExportResult | null> {
  if (args.documentId) {
    try {
      const result = await exportDocument('', '', args.title, 'md', undefined, undefined, {
        documentId: args.documentId,
      })
      if (result?.path) await revealInFinder(result.path)
      return result
    } catch {
      /* fall through */
    }
  }
  const markdown = tiptapJsonToMarkdown(args.contentJson, args.title)
  const plainText = tiptapToPlainText(args.contentJson)
  const result = await exportDocument(
    '',
    plainText,
    args.title,
    'md',
    markdown,
    undefined,
    args.documentId ? { documentId: args.documentId } : undefined,
  )

  if (result?.path) {
    await revealInFinder(result.path)
  }

  return result
}

export async function shareDocumentAsPlainTextFile(args: {
  contentJson: string
  title: string
  documentId?: string
}): Promise<ExportResult | null> {
  if (args.documentId) {
    try {
      const result = await exportDocument('', '', args.title, 'txt', undefined, undefined, {
        documentId: args.documentId,
      })
      if (result?.path) await revealInFinder(result.path)
      return result
    } catch {
      /* fall through */
    }
  }
  const plainText = tiptapToPlainText(args.contentJson)
  const result = await exportDocument(
    '',
    plainText,
    args.title,
    'txt',
    undefined,
    undefined,
    args.documentId ? { documentId: args.documentId } : undefined,
  )

  if (result?.path) {
    await revealInFinder(result.path)
  }

  return result
}

/** LLM-polished Markdown export (falls back to deterministic serializer). */
export async function shareDocumentAsLlmMarkdownFile(args: {
  contentJson: string
  title: string
  documentId?: string
}): Promise<ExportResult | null> {
  const { markdown } = await generateMarkdownWithLlm({
    contentJson: args.contentJson,
    title: args.title,
  })
  const plainText = tiptapToPlainText(args.contentJson)
  const result = await exportDocument(
    '',
    plainText,
    args.title,
    'md',
    markdown,
    undefined,
    args.documentId ? { documentId: args.documentId } : undefined,
  )

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
