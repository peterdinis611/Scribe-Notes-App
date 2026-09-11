import { createElement } from 'react'
import { JournalDigestDocument } from '@/components/pdf/templates/journal-digest'
import { LibraryReportDocument } from '@/components/pdf/templates/library-report'
import { ScribeInvoiceDocument, type ScribeInvoiceInput } from '@/components/pdf/templates/invoice'
import { exportTakumiPdf } from '@/lib/export/takumi-render'
import {
  nlpJournalSummary,
  nlpJournalTasks,
  nlpLibraryReport,
  type NlpLibraryReport,
} from '@/lib/db/nlp-api'
import {
  collectJournalDocumentIdsForRange,
  currentWeekRange,
  formatWeekKey,
  getJournalFolderId,
} from '@/lib/journal-notes'
import type { DocumentSummary, ExportResult, Folder } from '@/lib/db/api'
import { revealInFinder } from '@/lib/db/api'

function asCountRows(
  raw: unknown,
  labelKey: string,
  countKey = 'count',
): { label: string; count: number }[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const row = item as Record<string, unknown>
      const label = String(row[labelKey] ?? '').trim()
      const count = Number(row[countKey] ?? 0)
      if (!label) return null
      return { label, count: Number.isFinite(count) ? count : 0 }
    })
    .filter((row): row is { label: string; count: number } => row != null)
}

function libraryReportToPdfData(report: NlpLibraryReport, title: string, generatedAt: string) {
  const stats = report.stats ?? {}
  const documentCount = Number(stats.documentCount ?? 0)
  const taggedCount = Number(stats.taggedCount ?? 0)
  const topTags = asCountRows(stats.topTags, 'tag')
  const topTerms = asCountRows(stats.topTerms, 'term')
  const languages = asCountRows(stats.languages, 'language')
  const sentiments = asCountRows(stats.sentiments, 'label')

  const highlights: string[] = []
  const markdown = report.markdown ?? ''
  for (const line of markdown.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('- ') && highlights.length < 8) {
      highlights.push(trimmed.slice(2).replace(/\*\*/g, ''))
    }
  }

  return {
    title,
    generatedAt,
    stats: {
      documentCount,
      taggedCount,
      topTags,
      topTerms,
      languages,
      sentiments,
      highlights: highlights.slice(0, 6),
    },
  }
}

export type JournalDigestExportArgs = {
  documents: DocumentSummary[]
  folders: Folder[]
  journalFolderName: string
  title: string
  weekLabel: string
  summaryPlaceholder: string
  toneLabel?: string | null
  footerNote?: string
}

export async function exportJournalDigestPdf(
  args: JournalDigestExportArgs,
): Promise<ExportResult | null> {
  const now = new Date()
  const { from, to } = currentWeekRange(now)
  const folderId = getJournalFolderId(args.folders, args.journalFolderName)
  const documentIds = collectJournalDocumentIdsForRange(args.documents, folderId, from, to)

  let summaryText = args.summaryPlaceholder
  let bullets: string[] = []
  let documentCount = documentIds.length
  let toneLabel = args.toneLabel ?? null
  let tasks: string[] = []

  if (documentIds.length > 0) {
    const [summaryResult, tasksResult] = await Promise.allSettled([
      nlpJournalSummary({
        fromDate: from,
        toDate: to,
        journalFolderId: folderId,
        documentIds,
      }),
      nlpJournalTasks(documentIds),
    ])
    if (summaryResult.status === 'fulfilled') {
      summaryText = summaryResult.value.summary || args.summaryPlaceholder
      bullets = summaryResult.value.bullets ?? []
      documentCount = summaryResult.value.documentCount ?? documentIds.length
      if (summaryResult.value.tone) toneLabel = summaryResult.value.tone
    }
    if (tasksResult.status === 'fulfilled') {
      tasks = tasksResult.value
        .filter((task) => !task.checked && task.text.trim())
        .map((task) =>
          task.documentTitle
            ? `${task.text.trim()} (${task.documentTitle})`
            : task.text.trim(),
        )
        .slice(0, 24)
    }
  }

  const week = formatWeekKey(now)
  const document = createElement(JournalDigestDocument, {
    data: {
      title: args.title,
      weekLabel: args.weekLabel || week,
      period: `${from} → ${to}`,
      summary: summaryText,
      bullets,
      tasks,
      toneLabel,
      documentCount,
      footerNote: args.footerNote,
    },
  })

  return exportTakumiPdf(document, args.title)
}

export async function exportLibraryReportPdf(args: {
  title: string
  generatedAt?: string
  footerNote?: string
}): Promise<ExportResult | null> {
  const report = await nlpLibraryReport()
  const generatedAt =
    args.generatedAt ??
    new Date().toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  const data = libraryReportToPdfData(report, args.title, generatedAt)
  const document = createElement(LibraryReportDocument, {
    data: { ...data, footerNote: args.footerNote },
  })
  return exportTakumiPdf(document, args.title)
}

export async function exportInvoicePdf(
  input: ScribeInvoiceInput,
  title?: string,
): Promise<ExportResult | null> {
  const document = createElement(ScribeInvoiceDocument, { input })
  const exportTitle =
    (title ?? `Invoice ${input.invoiceNumber ?? ''}`.trim()) || 'Invoice'
  return exportTakumiPdf(document, exportTitle)
}

export async function exportStructuredPdfAndReveal(
  result: ExportResult | null,
): Promise<string | null> {
  if (!result?.path) return null
  await revealInFinder(result.path)
  return result.path
}
