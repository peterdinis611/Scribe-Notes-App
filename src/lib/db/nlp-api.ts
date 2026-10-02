import { invoke } from '@/lib/tauri'
import type { SearchHit } from '@/lib/db/api'

export interface NlpLlmPrefs {
  enabled: boolean
  provider: string
  baseUrl: string
  model: string
  useRewrite: boolean
  useAnswer: boolean
  usePlan: boolean
  enhanceHeuristics?: boolean
}

export interface NlpLlmStatus {
  reachable: boolean
  provider: string
  baseUrl: string
  model: string | null
  models: string[]
  error: string | null
}

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
  answerBackend?: string
  llm?: NlpLlmPrefs
  qualityAvailable: boolean
  fastAvailable?: boolean
  onnxAvailable?: boolean
  faissAvailable?: boolean
  hnswAvailable?: boolean
  bm25Available?: boolean
  spacyAvailable?: boolean
  argosAvailable?: boolean
  extras?: Record<string, boolean>
  rustExtras?: {
    fuzzy: boolean
    searchFast: boolean
    vectors: boolean
    unicode: boolean
  }
  features?: string[]
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

export const nlpSetEmbedBackend = async (backend: 'hash' | 'fast' | 'quality') => {
  const value = await invoke<NlpStatus>('nlp_set_embed_backend', { input: { backend } })
  statusCache = { value, at: Date.now() }
  analysisCache = null
  return value
}

export const nlpSetAnswerBackend = async (backend: 'auto' | 'index' | 'quality') => {
  const value = await invoke<NlpStatus>('nlp_set_answer_backend', { input: { backend } })
  statusCache = { value, at: Date.now() }
  return value
}

export const nlpSetLlmPrefs = async (input: {
  enabled?: boolean
  provider?: string
  baseUrl?: string
  model?: string
  useRewrite?: boolean
  useAnswer?: boolean
  usePlan?: boolean
  enhanceHeuristics?: boolean
}) => {
  const value = await invoke<NlpStatus>('nlp_set_llm_prefs', { input })
  statusCache = { value, at: Date.now() }
  return value
}

export const nlpLlmStatus = () => invoke<NlpLlmStatus>('nlp_llm_status')

export const nlpLlmComplete = (input: {
  prompt: string
  system?: string
  temperature?: number
  maxTokens?: number
  stream?: boolean
}) => invoke<{ requestId: string; text: string; model?: string; streamed: boolean }>('nlp_llm_complete', { input })

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

/** Open checkbox tasks across recent library documents (checkbox source only). */
export const nlpListOpenTasks = (limit = 200, folderId?: string | null) =>
  invoke<DocumentTask[]>('nlp_list_open_tasks', {
    limit,
    folderId: folderId ?? null,
  })

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

export type PlaceholderUnit = 'paragraphs' | 'sentences' | 'words'
export type PlaceholderLanguage = 'la' | 'en' | 'sk'

export type NlpPlaceholderResult = {
  text: string
  unit: PlaceholderUnit
  count: number
  language: PlaceholderLanguage
  source: string
  startWithClassic?: boolean
}

/** Generate placeholder / lorem text via Python NLP (preferred) or Rust fallback. */
export const nlpGeneratePlaceholder = (input: {
  unit?: PlaceholderUnit
  count?: number
  language?: PlaceholderLanguage | string
  startWithClassic?: boolean
  startWithLorem?: boolean
  seed?: number
  preferRust?: boolean
}) => invoke<NlpPlaceholderResult>('nlp_generate_placeholder', { input })

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

export type RevisionChangeKind =
  | 'identical'
  | 'expansion'
  | 'trim'
  | 'rewrite'
  | 'polish'
  | 'structural'
  | 'mixed'

export type RevisionAiBullet = {
  text: string
  severity: 'info' | 'warn' | 'critical' | string
  kind: string
}

export type RevisionAiReport = {
  summary: string
  headline: string
  changeKind: RevisionChangeKind
  confidence: number
  bullets: RevisionAiBullet[]
  addedSentences: string[]
  removedSentences: string[]
  gainedTerms: string[]
  lostTerms: string[]
  headingChanges: { added: string[]; removed: string[] }
  risks: string[]
  stats: {
    changeRatio: number
    oldWordCount: number
    newWordCount: number
    linesAdded: number
    linesRemoved: number
    netWords: number
  }
  source: 'python' | 'rust' | string
  changeRatio?: number
  oldWordCount?: number
  newWordCount?: number
}

/** Dedicated revision AI (Python module preferred, Rust fallback). */
export const nlpAnalyzeRevisionDiff = (input: {
  oldText: string
  newText: string
  maxBullets?: number
  language?: string
  preferRust?: boolean
}) => invoke<RevisionAiReport>('nlp_analyze_revision_diff', { input })

export type FlashcardKind = 'qa' | 'definition' | 'cloze' | 'section' | string

export type Flashcard = {
  kind: FlashcardKind
  question: string
  answer: string
  front?: string
}

export type FlashcardsResult = {
  cards: Flashcard[]
  count: number
  source: 'python' | string
}

export type TerminologyVariant = { term: string; count: number }

export type TerminologyIssue = {
  canonical: string
  key: string
  preferredCount: number
  variants: TerminologyVariant[]
  suggestion: string
}

export type TerminologyResult = {
  issues: TerminologyIssue[]
  issueCount: number
  scannedTerms: number
  source: 'python' | string
}

export type TakeawayItem = {
  text: string
  kind: string
  score: number
}

export type TakeawaysResult = {
  summary: string
  takeaways: TakeawayItem[]
  count: number
  themes: Array<{ term: string; count: number }>
  source: 'python' | string
}

export type WritingCoachHint = {
  code: string
  severity: 'info' | 'warn' | 'ok' | string
  message: string
  excerpt?: string
}

export type WritingCoachResult = {
  language: string
  score?: number
  hints: WritingCoachHint[]
  stats?: {
    sentenceCount?: number
    wordCount?: number
    averageSentenceWords?: number
    longSentenceCount?: number
    passiveSentenceCount?: number
  }
  source: 'python' | string
}

export const nlpExtractFlashcards = (input: {
  documentId?: string
  text?: string
  limit?: number
  includeCloze?: boolean
}) => invoke<FlashcardsResult>('nlp_extract_flashcards', { input })

export const nlpCheckTerminology = (input: {
  documentId?: string
  text?: string
  limit?: number
}) => invoke<TerminologyResult>('nlp_check_terminology', { input })

export const nlpExtractTakeaways = (input: {
  documentId?: string
  text?: string
  limit?: number
}) => invoke<TakeawaysResult>('nlp_extract_takeaways', { input })

export const nlpWritingCoach = (input: {
  documentId?: string
  text?: string
  limit?: number
}) => invoke<WritingCoachResult>('nlp_writing_coach', { input })

export type FilesListResult = {
  path: string
  count: number
  entries: Array<{
    path: string
    name: string
    kind: string
    sizeBytes?: number
    modifiedAt?: string
    extension?: string
    textLike?: boolean
  }>
  source: string
}

export type FilesSearchHit = {
  path: string
  line?: number
  snippet?: string
  score?: number
}

export type FilesAnswerResult = {
  answer: string
  citations: Array<{ path: string; snippet?: string; excerpt?: string; score?: number }>
  source: string
}

export const nlpFilesList = (input?: {
  path?: string
  recursive?: boolean
  baseUrl?: string
}) => invoke<FilesListResult>('nlp_files_list', { input: input ?? {} })

export const nlpFilesReadText = (input: { path: string; baseUrl?: string }) =>
  invoke<{ path: string; text: string; sizeBytes: number; source: string }>('nlp_files_read_text', {
    input,
  })

export const nlpFilesSearch = (input: {
  query: string
  path?: string
  glob?: string
  limit?: number
  baseUrl?: string
}) =>
  invoke<{ query: string; hits: FilesSearchHit[]; count: number; source: string }>(
    'nlp_files_search',
    { input },
  )

export const nlpFilesSummarize = (input: {
  path: string
  limit?: number
  baseUrl?: string
}) => invoke<{ path: string; summary: string; bullets?: string[]; source: string }>(
  'nlp_files_summarize',
  { input },
)

export const nlpFilesAnswer = (input: {
  question: string
  path?: string
  limit?: number
  baseUrl?: string
}) => invoke<FilesAnswerResult>('nlp_files_answer', { input })

export const nlpFilesIndex = (input?: {
  path?: string
  limitFiles?: number
  force?: boolean
  baseUrl?: string
}) =>
  invoke<{
    namespace: string
    indexedFiles: number
    chunkCount: number
    updated: number
    skipped: number
    indexPath: string
    source: string
  }>('nlp_files_index', { input: input ?? {} })

export const nlpSummarize = (input: {
  documentId?: string
  text?: string
  maxSentences?: number
}) =>
  invoke<{ summary: string; bullets: string[]; enhanced?: boolean; source?: string }>(
    'nlp_summarize',
    { input },
  )

export type ExplainSelectionResult = {
  language: string
  explanation: string
  bullets: string[]
  keyTerms: string[]
  enhanced?: boolean
  source: string
}

export type SimplifyResult = {
  language: string
  simplified: string
  enhanced?: boolean
  source: string
}

export type ActionItemsResult = {
  items: Array<{ text: string; kind?: string; dueHint?: string | null }>
  count: number
  enhanced?: boolean
  source: string
}

export type GlossaryResult = {
  entries: Array<{ term: string; definition: string; count?: number }>
  count: number
  enhanced?: boolean
  source: string
}

export type CompareNotesResult = {
  summary: string
  bullets?: string[]
  enhanced?: boolean
  source: string
}

export const nlpExplainSelection = (input: {
  documentId?: string
  text?: string
}) => invoke<ExplainSelectionResult>('nlp_explain_selection', { input })

export const nlpSimplify = (input: { documentId?: string; text?: string }) =>
  invoke<SimplifyResult>('nlp_simplify', { input })

export const nlpActionItems = (input: {
  documentId?: string
  text?: string
  limit?: number
}) => invoke<ActionItemsResult>('nlp_action_items', { input })

export const nlpGlossary = (input: {
  documentId?: string
  text?: string
  limit?: number
}) => invoke<GlossaryResult>('nlp_glossary', { input })

export const nlpCompareNotes = (input: {
  documentIdA?: string
  documentIdB?: string
  textA?: string
  textB?: string
  titleA?: string
  titleB?: string
}) => invoke<CompareNotesResult>('nlp_compare_notes', { input })

export type OutlineQuizQuestion = {
  kind: string
  level?: number
  section: string
  question: string
  answer: string
}

export type OutlineQuizResult = {
  questions: OutlineQuizQuestion[]
  count: number
  headingCount: number
  source: string
}

export const nlpOutlineQuiz = (input: {
  documentId?: string
  text?: string
  limit?: number
}) => invoke<OutlineQuizResult>('nlp_outline_quiz', { input })

export type MeetingNotesPack = {
  decisions: Array<{ text: string; kind: string }>
  actionItems: Array<{ text: string; dueHint?: string | null; source?: string }>
  attendees: string[]
  counts: { decisions: number; actionItems: number; attendees: number }
  source: string
}

export const nlpMeetingNotesPack = (input: {
  documentId?: string
  text?: string
  limit?: number
}) => invoke<MeetingNotesPack>('nlp_meeting_notes_pack', { input })

export type AgentPlanNlpResult = {
  goal: string
  scope: string
  tools: string[]
  toolScores?: Array<{ tool: string; score: number }>
  confidence?: number
  needsClarification: boolean
  clarifyOptions?: string[]
  source: string
}

export const nlpPlanAgentGoal = (input: {
  goal: string
  scope?: 'library' | 'document' | string
  maxTools?: number
}) => invoke<AgentPlanNlpResult>('nlp_plan_agent_goal', { input })

export type AgentDocumentBriefResult = {
  goal: string
  tools: string[]
  sections: Array<{ tool: string; title: string; markdown: string }>
  answer: string
  count: number
  source: string
}

export const nlpAgentDocumentBrief = (input: {
  documentId?: string
  text?: string
  goal?: string
  tools?: string[]
  limit?: number
}) => invoke<AgentDocumentBriefResult>('nlp_agent_document_brief', { input })

export type CitationPackResult = {
  claim: string
  citations: Array<{ documentId: string; title: string; snippet: string; score: number }>
  bullets: string[]
  count: number
  source: string
}

export const nlpCitationPack = (input: { claim: string; limit?: number }) =>
  invoke<CitationPackResult>('nlp_citation_pack', { input })

export const nlpCheckTerminologyLibrary = (input?: {
  limit?: number
  documentLimit?: number
}) => invoke<TerminologyResult>('nlp_check_terminology_library', { input: input ?? {} })

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

export const nlpLibraryAnswer = (
  question: string,
  limit = 6,
  folderId?: string | null,
) =>
  invoke<{ answer: string; citations: LibraryChatCitation[]; followups?: string[] }>(
    'nlp_library_answer',
    {
      question,
      limit,
      folderId: folderId ?? null,
    },
  )

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

export type ContinuationSuggestion = {
  text: string
  score: number
  model: string
}

export type NlpContinuationResult = {
  suggestions: ContinuationSuggestion[]
  prefixTail: string
  source: string
  corpusDocs: number
  model: string
}

/** Suggest continue-writing phrases from the local library (Python n-grams, Rust fallback). */
export const nlpSuggestContinuation = (input: {
  prefix: string
  maxSuggestions?: number
  maxTokens?: number
  preferRust?: boolean
  excludeDocumentId?: string
}) => invoke<NlpContinuationResult>('nlp_suggest_continuation', { input })

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
