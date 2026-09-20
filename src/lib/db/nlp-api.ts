import { invoke } from '@/lib/tauri'
import type { SearchHit } from '@/lib/db/api'

export interface NlpStatus {
  enabled: boolean
  sidecarAvailable: boolean
  sidecarOk: boolean
  version: string | null
  model: string | null
  indexedCount: number
  storedModel: string | null
  indexStale: boolean
  staleIndexCount: number
  embedBackend: string
  qualityAvailable: boolean
  scriptPath: string
  pythonBin: string
  error: string | null
}

export interface NlpIndexProgress {
  current: number
  total: number
  phase: 'starting' | 'indexing' | 'done'
}

export interface NlpIndexResult {
  indexed: number
  model: string
}

export interface NlpJournalSummary {
  summary: string
  bullets: string[]
  documentCount: number
  tone?: string | null
  toneScore?: number | null
}

export interface NlpEntity {
  text: string
  kind: string
}

export interface NlpTagSuggestions {
  entities: NlpEntity[]
  tagSuggestions: string[]
  folderSuggestion?: string | null
  folderSuggestionId?: string | null
}

export interface NlpLibraryReport {
  markdown: string
  stats: Record<string, unknown>
}

export interface DocumentTask {
  text: string
  checked: boolean
  source: string
  dueHint: string | null
  documentId: string | null
  documentTitle: string | null
}

export interface NlpKeyword {
  term: string
  score: number
  count: number
}

export interface NlpOutlineItem {
  title: string
  level: number
  kind: string
}

export interface NlpDateEvent {
  text: string
  kind: string
  resolvedDate?: string | null
}

export interface NlpDocumentAnalysis {
  language: string
  languageConfidence: number
  keywords: NlpKeyword[]
  keyphrases: string[]
  outline: NlpOutlineItem[]
  summary?: string | null
  suggestedTitle?: string | null
  readabilityLabel?: string | null
  readingTimeMinutes?: number | null
  flesch?: number | null
  tone?: string | null
  toneScore?: number | null
  wikiLinks?: string[]
  mentions?: string[]
  hosts?: string[]
  dates?: NlpDateEvent[]
}

const STATUS_TTL_MS = 20_000
const ANALYSIS_TTL_MS = 30_000
let statusCache: { value: NlpStatus; at: number } | null = null
let statusInflight: Promise<NlpStatus> | null = null
let analysisCache: { id: string; value: NlpDocumentAnalysis; at: number } | null = null
let analysisInflight: { id: string; promise: Promise<NlpDocumentAnalysis> } | null = null

export const nlpStatus = (options?: { fresh?: boolean }) => {
  const now = Date.now()
  if (!options?.fresh && statusCache && now - statusCache.at < STATUS_TTL_MS) {
    return Promise.resolve(statusCache.value)
  }
  if (!options?.fresh && statusInflight) return statusInflight
  statusInflight = invoke<NlpStatus>('nlp_status')
    .then((value) => {
      statusCache = { value, at: Date.now() }
      return value
    })
    .finally(() => {
      statusInflight = null
    })
  return statusInflight
}

export function invalidateNlpCaches(documentId?: string) {
  statusCache = null
  if (!documentId || analysisCache?.id === documentId) {
    analysisCache = null
  }
}

export const nlpSetEnabled = async (enabled: boolean) => {
  const value = await invoke<NlpStatus>('nlp_set_enabled', { input: { enabled } })
  statusCache = { value, at: Date.now() }
  return value
}

export const nlpSetEmbedBackend = async (backend: 'hash' | 'quality') => {
  const value = await invoke<NlpStatus>('nlp_set_embed_backend', { input: { backend } })
  statusCache = { value, at: Date.now() }
  analysisCache = null
  return value
}

export const nlpSearch = (
  query: string,
  options?: {
    limit?: number
    mode?: 'hybrid' | 'semantic' | 'fts'
    folderId?: string
    tag?: string
    fromDate?: string
    toDate?: string
    libraryId?: string
  },
) =>
  invoke<SearchHit[]>('nlp_search', {
    query,
    limit: options?.limit,
    mode: options?.mode,
    folderId: options?.folderId,
    tag: options?.tag,
    fromDate: options?.fromDate,
    toDate: options?.toDate,
    libraryId: options?.libraryId,
  })

export const nlpSemanticSearch = (query: string, limit = 12) =>
  nlpSearch(query, { limit, mode: 'semantic' })

export const nlpSimilarDocuments = (documentId: string, limit = 8) =>
  invoke<SearchHit[]>('nlp_similar_documents', { documentId, limit })

export const nlpDocumentTasks = (documentId: string) =>
  invoke<DocumentTask[]>('nlp_document_tasks', { documentId })

export const nlpJournalTasks = (documentIds: string[]) =>
  invoke<DocumentTask[]>('nlp_journal_tasks', { input: { documentIds } })

export const nlpIndexDocument = async (documentId: string) => {
  const result = await invoke<NlpIndexResult>('nlp_index_document', { documentId })
  if (analysisCache?.id === documentId) analysisCache = null
  return result
}

export const nlpIndexAll = async () => {
  const result = await invoke<NlpIndexResult>('nlp_index_all')
  analysisCache = null
  statusCache = null
  return result
}

export const nlpCancel = () => invoke<void>('nlp_cancel')

export const nlpJournalSummary = (input: {
  fromDate: string
  toDate: string
  journalFolderId?: string | null
  documentIds?: string[]
}) => invoke<NlpJournalSummary>('nlp_journal_summary', { input })

export const nlpSuggestTags = (documentId: string) =>
  invoke<NlpTagSuggestions>('nlp_suggest_tags', { documentId })

export const nlpLibraryReport = () => invoke<NlpLibraryReport>('nlp_library_report')

export const nlpDocumentAnalysis = (documentId: string) => {
  const now = Date.now()
  if (analysisCache && analysisCache.id === documentId && now - analysisCache.at < ANALYSIS_TTL_MS) {
    return Promise.resolve(analysisCache.value)
  }
  if (analysisInflight?.id === documentId) return analysisInflight.promise
  const promise = invoke<NlpDocumentAnalysis>('nlp_document_analysis', { documentId })
    .then((value) => {
      analysisCache = { id: documentId, value, at: Date.now() }
      return value
    })
    .finally(() => {
      if (analysisInflight?.id === documentId) analysisInflight = null
    })
  analysisInflight = { id: documentId, promise }
  return promise
}

/** Ephemeral analysis of plaintext (unlocked vault note). Never persists to DB. */
export const nlpAnalyzePlaintext = (text: string) =>
  invoke<NlpDocumentAnalysis>('nlp_analyze_plaintext', { text })

export const nlpFindDuplicates = (limit = 20) =>
  invoke<{ pairs: DuplicatePair[]; compared: number }>('nlp_find_duplicates', {
    limit,
  })

export type DuplicatePair = {
  leftId: string
  leftTitle: string
  rightId: string
  rightTitle: string
  score: number
  jaccard: number
  embedScore: number
}

export const nlpSuggestTitle = (documentId: string) =>
  invoke<{ title: string; slug: string; source: string }>('nlp_suggest_title', { documentId })

export interface NlpDiffSummary {
  summary: string
  addedSentences: string[]
  removedSentences: string[]
  gainedTerms: string[]
  lostTerms: string[]
  changeRatio: number
  oldWordCount: number
  newWordCount: number
}

export const nlpSummarizeDiff = (input: {
  oldText: string
  newText: string
  maxBullets?: number
}) => invoke<NlpDiffSummary>('nlp_summarize_diff', { input })

export interface NlpTemplateFillHints {
  expected: string[]
  present: string[]
  missing: string[]
  coverage: number
  complete: boolean
}

export const nlpTemplateFillHints = (input: {
  documentId: string
  expectedSections?: string[]
}) => invoke<NlpTemplateFillHints>('nlp_template_fill_hints', { input })

export interface SpellIssue {
  word: string
  offset: number
  length: number
  suggestions: string[]
}

export interface SpellcheckResult {
  language: string
  checkedLanguage: string
  issueCount: number
  issues: SpellIssue[]
  dictionarySize: number
}

export const nlpSpellcheck = (documentId: string) =>
  invoke<SpellcheckResult>('nlp_spellcheck', { documentId })

export type LibraryChatCitation = {
  documentId: string
  title: string
  snippet: string
  chunkIndex?: number | null
}

export const nlpLibraryAnswer = (question: string, limit = 6) =>
  invoke<{ answer: string; citations: LibraryChatCitation[] }>('nlp_library_answer', {
    question,
    limit,
  })

export const nlpDocumentAnswer = (
  documentId: string,
  question: string,
  context?: Array<{ role: string; text: string }> | null,
) =>
  invoke<{ answer: string; citations: LibraryChatCitation[] }>('nlp_document_answer', {
    documentId,
    question,
    context: context ?? null,
  })

export interface WikiLinkSuggestion {
  phrase: string
  documentId: string
  title: string
  score: number
  reason: string
}

export const nlpSuggestWikiLinks = (documentId: string, limit = 8) =>
  invoke<WikiLinkSuggestion[]>('nlp_suggest_wiki_links', { documentId, limit })

export interface CalendarEvent {
  documentId: string | null
  documentTitle: string | null
  text: string
  kind: string
  resolvedDate: string | null
}

export interface NlpRewriteResult {
  output: string
  mode: string
  original: string
}

export const nlpRewriteSelection = (
  text: string,
  mode?: string,
  customInstruction?: string,
) =>
  invoke<NlpRewriteResult>('nlp_rewrite_selection', {
    text,
    mode,
    customInstruction,
  })

export const nlpCalendarEvents = (options?: {
  limit?: number
  fromDate?: string
  toDate?: string
}) =>
  invoke<CalendarEvent[]>('nlp_calendar_events', {
    limit: options?.limit,
    fromDate: options?.fromDate,
    toDate: options?.toDate,
  })
