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
}

export interface NlpEntity {
  text: string
  kind: string
}

export interface NlpTagSuggestions {
  entities: NlpEntity[]
  tagSuggestions: string[]
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

export const nlpStatus = () => invoke<NlpStatus>('nlp_status')

export const nlpSetEnabled = (enabled: boolean) =>
  invoke<NlpStatus>('nlp_set_enabled', { input: { enabled } })

export const nlpSetEmbedBackend = (backend: 'hash' | 'quality') =>
  invoke<NlpStatus>('nlp_set_embed_backend', { input: { backend } })

export const nlpSearch = (
  query: string,
  options?: { limit?: number; mode?: 'hybrid' | 'semantic' | 'fts' },
) =>
  invoke<SearchHit[]>('nlp_search', {
    query,
    limit: options?.limit,
    mode: options?.mode,
  })

export const nlpSemanticSearch = (query: string, limit = 12) =>
  nlpSearch(query, { limit, mode: 'semantic' })

export const nlpSimilarDocuments = (documentId: string, limit = 8) =>
  invoke<SearchHit[]>('nlp_similar_documents', { documentId, limit })

export const nlpDocumentTasks = (documentId: string) =>
  invoke<DocumentTask[]>('nlp_document_tasks', { documentId })

export const nlpJournalTasks = (documentIds: string[]) =>
  invoke<DocumentTask[]>('nlp_journal_tasks', { input: { documentIds } })

export const nlpIndexDocument = (documentId: string) =>
  invoke<NlpIndexResult>('nlp_index_document', { documentId })

export const nlpIndexAll = () => invoke<NlpIndexResult>('nlp_index_all')

export const nlpJournalSummary = (input: {
  fromDate: string
  toDate: string
  journalFolderId?: string | null
  documentIds?: string[]
}) => invoke<NlpJournalSummary>('nlp_journal_summary', { input })

export const nlpSuggestTags = (documentId: string) =>
  invoke<NlpTagSuggestions>('nlp_suggest_tags', { documentId })

export const nlpLibraryReport = () => invoke<NlpLibraryReport>('nlp_library_report')
