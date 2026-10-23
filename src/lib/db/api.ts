import { invoke } from '@/lib/tauri'
import { cacheDocument, clearDocumentCache, getCachedDocument, invalidateDocumentCache, peekCachedDocument } from '@/lib/cache/document-cache'
import { isVaultCipherJson } from '@/lib/vault/crypto'
import { maybeDecryptDocument, maybeEncryptContentJson } from '@/lib/vault/document-crypto'

export interface DocumentSummary {
  id: string
  title: string
  folderId: string | null
  filePath: string | null
  updatedAt: number
  isFavorite: boolean
  isPinned: boolean
  tags: string[]
  deletedAt: number | null
  isPasswordProtected?: boolean
}

export interface Folder {
  id: string
  name: string
  parentId: string | null
  createdAt: number
  updatedAt: number
  isPinned: boolean
  isVault?: boolean
  vaultVerifier?: string | null
  color?: string | null
  icon?: string | null
  sortOrder?: number
  isArchived?: boolean
}

export interface SearchHit {
  documentId: string
  title: string
  snippet: string
  rank: number
  matchKind?: 'fts' | 'semantic' | 'both' | 'vault-ram'
  chunkIndex?: number
}

export interface DocumentRevision {
  id: string
  documentId: string
  title: string
  createdAt: number
  label: string | null
  pinned: boolean
}

export interface DocumentRevisionDetail extends DocumentRevision {
  contentJson: string
}

export interface Document {
  id: string
  title: string
  contentJson: string
  folderId: string | null
  filePath: string | null
  createdAt: number
  updatedAt: number
  vaultVerifier?: string | null
  /** Runtime-only: true when ciphertext could not be decrypted (locked). */
  vaultLocked?: boolean
}

export interface CreateDocumentInput {
  title: string
  folderId?: string | null
  contentJson?: string
}

export interface UpdateDocumentInput {
  id: string
  title?: string
  contentJson?: string
  vaultVerifier?: string
  clearVaultVerifier?: boolean
}

export interface LibraryFindReplaceInput {
  query: string
  replacement: string
  dryRun: boolean
  folderId?: string | null
  matchCase?: boolean
}

export interface LibraryFindReplaceHit {
  documentId: string
  title: string
  matchCount: number
  preview: string
}

export interface StorageSettings {
  documentsDir: string
  folderAccessGranted: boolean
}

export interface StorageDiskUsage {
  documentsDir: string
  path: string
  totalBytes: number
  fileCount: number
  dirCount: number
}

export interface ExportResult {
  path: string
}

export const listDocuments = (input?: { folderId?: string | null; limit?: number }) =>
  invoke<DocumentSummary[]>('list_documents', {
    input: input
      ? {
          folderId: input.folderId ?? null,
          limit: input.limit,
        }
      : null,
  })

async function vaultContext() {
  const { store } = await import('@/store/index')
  const state = store.getState()
  return {
    folders: state.folders.folders,
    documents: state.documents.documents,
  }
}

const getDocumentInflight = new Map<string, Promise<Document>>()

export const getDocument = async (id: string) => {
  // Promote LRU on intentional fetch so open docs stay warm.
  const cached = getCachedDocument(id)

  // Prefer warm plaintext cache (typical after unlock / save).
  if (cached && !isVaultCipherJson(cached.contentJson)) {
    return cached
  }

  const pending = getDocumentInflight.get(id)
  if (pending) return pending

  const request = (async () => {
    const { folders } = await vaultContext()
    const warm = peekCachedDocument(id)
    if (warm && !isVaultCipherJson(warm.contentJson)) {
      return warm
    }

    const raw =
      warm ??
      (await (async () => {
        const fetched = await invoke<Document>('get_document', { id })
        cacheDocument(fetched)
        return fetched
      })())

    const decrypted = await maybeDecryptDocument(raw, folders)
    // While unlocked, keep plaintext warm so tab switches skip decrypt + IPC.
    if (!isVaultCipherJson(decrypted.contentJson)) {
      cacheDocument(decrypted)
    }
    return decrypted
  })().finally(() => {
    if (getDocumentInflight.get(id) === request) getDocumentInflight.delete(id)
  })

  getDocumentInflight.set(id, request)
  return request
}

export const fetchDocumentFresh = async (id: string) => {
  const { folders } = await vaultContext()
  // Do not invalidate first — overwrite after fetch so UI can keep using the
  // warm entry until the IPC round-trip completes.
  const raw = await invoke<Document>('get_document', { id })
  const decrypted = await maybeDecryptDocument(raw, folders)
  cacheDocument(isVaultCipherJson(decrypted.contentJson) ? raw : decrypted)
  return decrypted
}

export const createDocument = async (input: CreateDocumentInput) =>
  cacheDocument(await invoke<Document>('create_document', { input }))

export const duplicateDocument = async (id: string, title?: string) =>
  cacheDocument(await invoke<Document>('duplicate_document', { input: { id, title } }))

export const updateDocument = async (input: UpdateDocumentInput) => {
  const next = { ...input }
  const { folders, documents } = await vaultContext()
  if (typeof next.contentJson === 'string') {
    next.contentJson = await maybeEncryptContentJson(next.id, next.contentJson, folders, documents)
  }
  const saved = await invoke<Document>('update_document', { input: next })
  const decrypted = await maybeDecryptDocument(saved, folders)
  // Cache what the UI needs: plaintext when unlocked, ciphertext only when locked.
  cacheDocument(isVaultCipherJson(decrypted.contentJson) ? saved : decrypted)
  const folder = folders.find((item) => item.id === decrypted.folderId)
  void import('@/lib/vault/session').then(async ({ isVaultUnlocked, isDocumentUnlocked, documentVaultRamFolderId }) => {
    const { vaultRamRemove, vaultRamUpsert, vaultRamTextFromDocument } = await import(
      '@/lib/vault/ram-index'
    )
    const docProtected = Boolean(decrypted.vaultVerifier)
    if (
      docProtected &&
      isDocumentUnlocked(decrypted.id) &&
      !isVaultCipherJson(decrypted.contentJson)
    ) {
      await vaultRamUpsert({
        documentId: decrypted.id,
        folderId: documentVaultRamFolderId(decrypted.id),
        title: decrypted.title,
        text: vaultRamTextFromDocument(decrypted.title, decrypted.contentJson),
      })
    } else if (
      folder?.isVault &&
      isVaultUnlocked(folder.id) &&
      !isVaultCipherJson(decrypted.contentJson)
    ) {
      await vaultRamUpsert({
        documentId: decrypted.id,
        folderId: folder.id,
        title: decrypted.title,
        text: vaultRamTextFromDocument(decrypted.title, decrypted.contentJson),
      })
    } else {
      await vaultRamRemove(decrypted.id)
    }
  })
  return decrypted
}

export const libraryFindReplace = (input: LibraryFindReplaceInput) =>
  invoke<LibraryFindReplaceHit[]>('library_find_replace', { input })

export const deleteDocument = async (id: string) => {
  await invoke<void>('delete_document', { id })
  invalidateDocumentCache(id)
  void import('@/lib/vault/ram-index').then(({ vaultRamRemove }) => vaultRamRemove(id))
}

export const trashDocumentsBatch = async (ids: string[]) => {
  const result = await invoke<{ trashedIds: string[] }>('trash_documents', { ids })
  for (const id of result.trashedIds) {
    invalidateDocumentCache(id)
    void import('@/lib/vault/ram-index').then(({ vaultRamRemove }) => vaultRamRemove(id))
  }
  return result
}

export const listTrashedDocuments = () => invoke<DocumentSummary[]>('list_trashed_documents')

export const restoreDocument = async (id: string) => {
  await invoke<void>('restore_document', { id })
  invalidateDocumentCache(id)
}

export const restoreDocumentsBatch = async (ids: string[]) => {
  const result = await invoke<{ restoredIds: string[] }>('restore_documents', { ids })
  for (const id of result.restoredIds) {
    invalidateDocumentCache(id)
  }
  return result
}

export const renameDocument = (id: string, title: string) =>
  invoke<{ id: string; title: string; updatedAt: number }>('rename_document', {
    input: { id, title },
  })

export const listDocumentTags = () =>
  invoke<{ tag: string; count: number }[]>('list_document_tags')

export const mergeDocuments = async (keepId: string, dropId: string) => {
  const merged = cacheDocument(
    await invoke<Document>('merge_documents', { input: { keepId, dropId } }),
  )
  invalidateDocumentCache(dropId)
  void import('@/lib/vault/ram-index').then(({ vaultRamRemove }) => vaultRamRemove(dropId))
  return merged
}

export const purgeDocument = async (id: string) => {
  await invoke<void>('purge_document', { id })
  invalidateDocumentCache(id)
}

export const emptyTrash = () => invoke<number>('empty_trash')

export const setDocumentFavorite = (id: string, favorite: boolean) =>
  invoke<void>('set_document_favorite', { id, favorite })

export const setDocumentPinned = (id: string, pinned: boolean) =>
  invoke<void>('set_document_pinned', { id, pinned })

export const setFolderPinned = (id: string, pinned: boolean) =>
  invoke<void>('set_folder_pinned', { id, pinned })

export const setDocumentTags = (id: string, tags: string[]) =>
  invoke<void>('set_document_tags', { id, tags })

export const addDocumentTag = (id: string, tag: string) =>
  invoke<string[]>('add_document_tag', { id, tag })

export const removeDocumentTag = (id: string, tag: string) =>
  invoke<string[]>('remove_document_tag', { id, tag })

export const listBacklinks = (id: string) =>
  invoke<DocumentSummary[]>('list_backlinks', { id })

export const listOutgoingLinks = (id: string) =>
  invoke<DocumentSummary[]>('list_outgoing_links', { id })

export interface Comment {
  id: string
  threadId: string
  author: string
  body: string
  createdAt: number
}

export interface CommentThread {
  id: string
  documentId: string
  quote: string
  resolved: boolean
  createdAt: number
  comments: Comment[]
}

export const listCommentThreads = (documentId: string) =>
  invoke<CommentThread[]>('list_comment_threads', { documentId })

export const createCommentThread = (input: {
  id?: string
  documentId: string
  quote: string
  author: string
  body: string
}) =>
  invoke<CommentThread>('create_comment_thread', {
    input: {
      id: input.id ?? null,
      documentId: input.documentId,
      quote: input.quote,
      author: input.author,
      body: input.body,
    },
  })

export const addCommentReply = (input: { threadId: string; author: string; body: string }) =>
  invoke<Comment>('add_comment_reply', { input })

export const resolveCommentThread = (threadId: string, resolved: boolean) =>
  invoke<void>('resolve_comment_thread', { threadId, resolved })

export const deleteCommentThread = (threadId: string) =>
  invoke<void>('delete_comment_thread', { threadId })

export type DocumentChatCitation = {
  documentId: string
  title: string
  snippet: string
}

export type DocumentChatMessage = {
  id: string
  documentId: string
  role: 'user' | 'assistant' | string
  text: string
  createdAt: number
  action?: string | null
  citations: DocumentChatCitation[]
}

export const listDocumentChatMessages = (documentId: string) =>
  invoke<DocumentChatMessage[]>('list_document_chat_messages', { documentId })

export const appendDocumentChatMessage = (input: {
  documentId: string
  role: 'user' | 'assistant'
  text: string
  action?: string | null
  citations?: DocumentChatCitation[]
}) => invoke<DocumentChatMessage>('append_document_chat_message', { input })

export const clearDocumentChatMessages = (documentId: string) =>
  invoke<number>('clear_document_chat_messages', { documentId })

export type AgentMessageStep = {
  tool: string
  status: string
  detail?: string | null
}

export type AgentMessage = {
  id: string
  documentId: string
  role: 'user' | 'assistant' | string
  text: string
  createdAt: number
  steps: AgentMessageStep[]
  citations: DocumentChatCitation[]
  agentId?: string
}

export const listAgentMessages = (documentId: string, agentId?: string | null) =>
  invoke<AgentMessage[]>('list_agent_messages', {
    documentId,
    agentId: agentId ?? null,
  })

export const appendAgentMessage = (input: {
  documentId: string
  role: 'user' | 'assistant'
  text: string
  steps?: AgentMessageStep[]
  citations?: DocumentChatCitation[]
  agentId?: string | null
}) => invoke<AgentMessage>('append_agent_message', { input })

export const clearAgentMessages = (documentId: string, agentId?: string | null) =>
  invoke<number>('clear_agent_messages', {
    documentId,
    agentId: agentId ?? null,
  })

export const invokeMatchAgentIntents = (question: string) =>
  invoke<string[]>('match_agent_intents', { question })

export type AgentBackendDigestSchedule = {
  enabled: boolean
  timeLocal: string
  period: string
  weekday: number
  lastRunDate: string
}

export type AgentBackendCustomRecipe = {
  id: string
  label: string
  tools: string[]
  documentPreferred?: boolean
  roleId?: string | null
}

export type AgentBackendPrefs = {
  enabled: boolean
  maxSteps: number
  preferFast: boolean
  preferredTools: string[]
  disabledTools: string[]
  digestSchedule?: AgentBackendDigestSchedule
  customRecipes?: AgentBackendCustomRecipe[]
  extras?: Record<string, unknown>
}

export const getAgentSchemaVersion = () => invoke<number>('get_agent_schema_version')

export type AgentBackendTeaching = {
  id: string
  text: string
  createdAt: number
  topic?: 'general' | 'grammar'
  agentId?: string
}

export type AgentBackendRun = {
  id: string
  scope: string
  documentId?: string | null
  goal: string
  stepsJson?: string | null
  answer?: string | null
  createdAt: number
  agentId?: string
}

export type AgentBackendRoleState = {
  agentId: string
  enabled: boolean
}

export const getAgentPrefs = () => invoke<AgentBackendPrefs>('get_agent_prefs')

export const setAgentPrefsBackend = (input: AgentBackendPrefs) =>
  invoke<AgentBackendPrefs>('set_agent_prefs', {
    input: {
      enabled: input.enabled,
      maxSteps: input.maxSteps,
      preferFast: input.preferFast,
      preferredTools: input.preferredTools,
      disabledTools: input.disabledTools,
      digestSchedule: input.digestSchedule ?? null,
      customRecipes: input.customRecipes ?? null,
      extras: input.extras ?? null,
    },
  })

export const listAgentRoleStates = () =>
  invoke<AgentBackendRoleState[]>('list_agent_role_states')

export const setAgentRoleStatesBackend = (roles: AgentBackendRoleState[]) =>
  invoke<AgentBackendRoleState[]>('set_agent_role_states', { input: { roles } })

export const listAgentTeachings = (agentId?: string | null) =>
  invoke<AgentBackendTeaching[]>('list_agent_teachings', {
    agentId: agentId ?? null,
  })

export const addAgentTeachingBackend = (
  text: string,
  topic?: 'general' | 'grammar',
  agentId?: string | null,
) =>
  invoke<AgentBackendTeaching>('add_agent_teaching', {
    text,
    topic: topic ?? null,
    agentId: agentId ?? null,
  })

export const removeAgentTeachingBackend = (id: string) =>
  invoke<boolean>('remove_agent_teaching', { id })

export const clearAgentTeachingsBackend = (agentId?: string | null) =>
  invoke<number>('clear_agent_teachings', { agentId: agentId ?? null })

export const appendAgentRun = (input: {
  scope: string
  documentId?: string | null
  goal: string
  stepsJson?: string | null
  answer?: string | null
  agentId?: string | null
}) => invoke<AgentBackendRun>('append_agent_run', { input })

export const listAgentRuns = (limit = 40, agentId?: string | null) =>
  invoke<AgentBackendRun[]>('list_agent_runs', {
    limit,
    agentId: agentId ?? null,
  })

export const getAgentDbPath = () => invoke<string | null>('get_agent_db_path')

export type AgentBackendHandoff = {
  id: string
  fromAgentId: string
  toAgentId: string
  documentId?: string | null
  summary: string
  payloadJson?: string | null
  status: 'pending' | 'acknowledged' | 'dismissed' | string
  createdAt: number
  updatedAt: number
}

export const sendAgentHandoff = (input: {
  fromAgentId: string
  toAgentId: string
  summary: string
  documentId?: string | null
  payloadJson?: string | null
}) =>
  invoke<AgentBackendHandoff>('send_agent_handoff', {
    input: {
      fromAgentId: input.fromAgentId,
      toAgentId: input.toAgentId,
      summary: input.summary,
      documentId: input.documentId ?? null,
      payloadJson: input.payloadJson ?? null,
    },
  })

export const listAgentHandoffs = (
  toAgentId: string,
  status?: string | null,
  limit = 24,
) =>
  invoke<AgentBackendHandoff[]>('list_agent_handoffs', {
    toAgentId,
    status: status ?? null,
    limit,
  })

export const setAgentHandoffStatus = (id: string, status: string) =>
  invoke<AgentBackendHandoff | null>('set_agent_handoff_status', { id, status })

export type AuditAdminStatus = {
  configured: boolean
  unlocked: boolean
  eventCount: number
  keepLimit: number
}

export type AuditEvent = {
  id: string
  createdAt: number
  source: string
  category: string
  action: string
  actor: string
  resourceType?: string | null
  resourceId?: string | null
  summary: string
  detailJson?: string | null
  outcome: string
  correlationId?: string | null
  sessionId?: string | null
  appVersion?: string | null
}

export type AuditCountBucket = {
  key: string
  count: number
}

export type AuditStats = {
  total: number
  keepLimit: number
  oldestAt?: number | null
  newestAt?: number | null
  byCategory: AuditCountBucket[]
  bySource: AuditCountBucket[]
  byOutcome: AuditCountBucket[]
  byAction: AuditCountBucket[]
  byActor: AuditCountBucket[]
}

export type AuditListInput = {
  limit?: number
  category?: string | null
  source?: string | null
  outcome?: string | null
  action?: string | null
  actor?: string | null
  resourceType?: string | null
  resourceId?: string | null
  q?: string | null
  correlationId?: string | null
  since?: number | null
  until?: number | null
}

export const getAuditSchemaVersion = () => invoke<number>('get_audit_schema_version')

export const getAuditDbPath = () => invoke<string | null>('get_audit_db_path')

export const auditAdminStatus = () => invoke<AuditAdminStatus>('audit_admin_status')

export const auditAdminSetup = (password: string) =>
  invoke<AuditAdminStatus>('audit_admin_setup', { password })

export const auditAdminUnlock = (password: string) =>
  invoke<AuditAdminStatus>('audit_admin_unlock', { password })

export const auditAdminLock = () => invoke<AuditAdminStatus>('audit_admin_lock')

export const auditAdminChangePassword = (currentPassword: string, newPassword: string) =>
  invoke<AuditAdminStatus>('audit_admin_change_password', {
    currentPassword,
    newPassword,
  })

function auditListPayload(input?: AuditListInput) {
  return {
    limit: input?.limit ?? 100,
    category: input?.category ?? null,
    source: input?.source ?? null,
    outcome: input?.outcome ?? null,
    action: input?.action ?? null,
    actor: input?.actor ?? null,
    resourceType: input?.resourceType ?? null,
    resourceId: input?.resourceId ?? null,
    q: input?.q ?? null,
    correlationId: input?.correlationId ?? null,
    since: input?.since ?? null,
    until: input?.until ?? null,
  }
}

export const listAuditEvents = (input?: AuditListInput) =>
  invoke<AuditEvent[]>('list_audit_events', {
    input: auditListPayload(input),
  })

export const getAuditStats = () => invoke<AuditStats>('get_audit_stats')

export const exportAuditEventsJsonl = (input?: AuditListInput) =>
  invoke<string>('export_audit_events_jsonl', {
    input: auditListPayload({ ...input, limit: input?.limit ?? 2000 }),
  })

export const purgeAuditEventsBefore = (before: number) =>
  invoke<number>('purge_audit_events_before', { before })

export const setAuditEventsKeep = (keep: number) =>
  invoke<AuditAdminStatus>('set_audit_events_keep', { keep })

export const clearAuditEvents = () => invoke<number>('clear_audit_events')

export type UiDocsGroup = {
  id: string
  topics: string[]
}

export type UiDocsTopicTip = {
  topicId: string
  tipKey: string
  shortcut?: string
}

export type UiManifest = {
  version: string
  shortVersion: string
  whatsNewHighlights: string[]
  whatsNewTagKeys: string[]
  settingsSectionIds: string[]
  privacyArticleIds: string[]
  privacyEffectiveDate: string
  editionMarkKey: string
  docsTopicIds: string[]
  docsQuickLinks: string[]
  docsGroups: UiDocsGroup[]
  docsTopicTips: UiDocsTopicTip[]
  uiSkinIds: string[]
  smartFilterIds: string[]
  libraryViewIds: string[]
  shortcutIds: string[]
  agentRoleIds: string[]
  agentRecipeIds: string[]
  templateCategoryIds: string[]
  pluginPresetIds: string[]
  statusTagValues: string[]
  paperSizeIds: string[]
  pinnedLanguageIds: string[]
  localeSectionGroupIds: string[]
  globalShortcutIds: string[]
  uiFontPresetIds: string[]
  routePaths: {
    home: string
    document: string
    docs: string
    graph: string
    plugins: string
    storageMode: string
    settingsPrefix: string
  }
  documentStylePresetIds: string[]
  themePresetIds: string[]
  builtInLocales: string[]
  paragraphStyleIds: string[]
  headingLevels: number[]
}

export type AppVersionInfo = {
  version: string
  shortVersion: string
}

export const getUiManifest = () => invoke<UiManifest>('get_ui_manifest')

export const getAppVersionInfo = () => invoke<AppVersionInfo>('get_app_version_info')

export const listSettingsSectionIds = () => invoke<string[]>('list_settings_section_ids')

export const generateRandomThemeNative = (scheme?: 'light' | 'dark' | null) =>
  invoke<import('@/lib/themes/types').ThemeColors>('generate_random_theme', {
    scheme: scheme ?? null,
  })

export const buildIcsCalendarNative = (events: Array<{
  summary: string
  date: string
  description?: string
  uid?: string
}>, calendarName?: string) =>
  invoke<string>('build_ics_calendar', {
    events,
    calendarName: calendarName ?? null,
  })

export type FuzzyRankItem = {
  id: string
  primary: string
  secondary?: string
}

export type FuzzyRankHit = {
  id: string
  score: number
}

export const fuzzyRankStringsNative = (
  items: FuzzyRankItem[],
  query: string,
  limit?: number | null,
) =>
  invoke<FuzzyRankHit[]>('fuzzy_rank_strings', {
    items,
    query,
    limit: limit ?? null,
  })

export type FlashcardNativeInput = {
  kind?: string | null
  question: string
  answer: string
  front?: string | null
}

export const flashcardsToAnkiTsvNative = (cards: FlashcardNativeInput[]) =>
  invoke<string>('flashcards_to_anki_tsv', { cards })

export const flashcardsToMarkdownNative = (
  cards: FlashcardNativeInput[],
  title?: string | null,
) => invoke<string>('flashcards_to_markdown', { cards, title: title ?? null })

export const buildRevisionCompareOptionsNative = (
  revisions: Array<{
    id: string
    title: string
    createdAt: number
    label?: string | null
  }>,
  currentUpdatedAt: number,
  currentLabel?: string | null,
) =>
  invoke<
    Array<{
      id: string
      label: string
      createdAt: number
      isCurrent?: boolean
    }>
  >('build_revision_compare_options_ui', {
    revisions,
    currentUpdatedAt,
    currentLabel: currentLabel ?? null,
  })

export const normalizeComparePairNative = (
  versionAId: string,
  versionBId: string,
  revisions: Array<{
    id: string
    title: string
    createdAt: number
    label?: string | null
  }>,
  currentUpdatedAt: number,
) =>
  invoke<[string, string]>('normalize_compare_pair_ui', {
    versionAId,
    versionBId,
    revisions,
    currentUpdatedAt,
  })

export const generateLoremIpsumNative = (args: {
  unit: 'paragraphs' | 'sentences' | 'words'
  count: number
  startWithLorem?: boolean | null
}) =>
  invoke<string>('generate_lorem_ipsum_ui', {
    unit: args.unit,
    count: args.count,
    startWithLorem: args.startWithLorem ?? null,
  })

export const normalizeVideoSrcNative = (src: string) =>
  invoke<string>('normalize_video_src_ui', { src })

/** Local large-video library (Rust store + optional Python ASR). */
export type VideoImportMode = 'copy' | 'reference'

export type LibraryVideoStatus =
  | 'ready'
  | 'probing'
  | 'thumbPending'
  | 'transcribing'
  | 'transcriptReady'
  | 'failed'

export type LibraryVideo = {
  id: string
  title: string
  importMode: VideoImportMode
  sourcePath: string
  relPath?: string | null
  sizeBytes: number
  contentHash?: string | null
  durationSecs?: number | null
  width?: number | null
  height?: number | null
  codec?: string | null
  thumbRelPath?: string | null
  transcriptRelPath?: string | null
  transcriptDocumentId?: string | null
  status: LibraryVideoStatus
  error?: string | null
  documentId?: string | null
  createdAt: number
  updatedAt: number
}

export type ImportLocalVideoResult = {
  video: LibraryVideo
  large: boolean
}

export type ProbeVideoResult = {
  durationSecs?: number | null
  width?: number | null
  height?: number | null
  codec?: string | null
  available: boolean
}

export type TranscriptSegment = {
  start: number
  end: number
  text: string
}

export type TranscribeVideoResult = {
  videoId: string
  text: string
  segments: TranscriptSegment[]
  model: string
  language?: string | null
  transcriptRelPath?: string | null
  transcriptDocumentId?: string | null
}

/** Native file picker; grants PathAccessGate. Returns absolute path or null if cancelled. */
export const pickLocalVideoNative = () =>
  invoke<string | null>('pick_local_video')

export const importLocalVideoNative = (input: {
  sourcePath: string
  title?: string | null
  importMode?: VideoImportMode | null
  documentId?: string | null
}) =>
  invoke<ImportLocalVideoResult>('import_local_video', {
    request: {
      sourcePath: input.sourcePath,
      title: input.title ?? null,
      importMode: input.importMode ?? null,
      documentId: input.documentId ?? null,
    },
  })

export const listLibraryVideosNative = () =>
  invoke<LibraryVideo[]>('list_library_videos_cmd')

export const getLibraryVideoNative = (id: string) =>
  invoke<LibraryVideo | null>('get_library_video_cmd', { id })

export const probeLibraryVideoNative = (id: string) =>
  invoke<ProbeVideoResult>('probe_library_video', { id })

export const transcribeLibraryVideoNative = (input: {
  videoId: string
  model?: string | null
  language?: string | null
  createDocument?: boolean | null
}) =>
  invoke<TranscribeVideoResult>('transcribe_library_video', {
    request: {
      videoId: input.videoId,
      model: input.model ?? null,
      language: input.language ?? null,
      createDocument: input.createDocument ?? null,
    },
  })

export const libraryVideoPlaybackPathNative = (id: string) =>
  invoke<string>('library_video_playback_path', { id })

export const promoteMarkdownSpecialBlocksNative = (doc: unknown) =>
  invoke<unknown>('promote_markdown_special_blocks_ui', { doc })

export const filterDiffLinesNative = (
  lines: Array<{ type: string; text: string }>,
  changesOnly: boolean,
  contextLines?: number | null,
) =>
  invoke<Array<{ type: string; text: string }>>('filter_diff_lines_ui', {
    lines,
    changesOnly,
    contextLines: contextLines ?? null,
  })

export const buildDocumentAskQuestionsNative = (
  analysis: unknown | null,
  tasks: Array<{ text: string; checked: boolean }>,
  options: { title?: string | null; slovak?: boolean },
) =>
  invoke<string[]>('build_document_ask_questions_ui', {
    analysis,
    tasks,
    options: {
      title: options.title ?? null,
      slovak: Boolean(options.slovak),
    },
  })

export const buildDocumentAskActionsNative = (
  analysis: unknown | null,
  tasks: Array<{ text: string; checked: boolean }>,
) => invoke<string[]>('build_document_ask_actions_ui', { analysis, tasks })

export const buildDocumentContentCssNative = (
  typography?: {
    fontFamily?: string | null
    fontSize?: number | null
    lineHeight?: number | null
  } | null,
) => invoke<string>('build_document_content_css_ui', { typography: typography ?? null })

export const buildWatermarkCssNative = (opacity: number, angle: number) =>
  invoke<string>('build_watermark_css_ui', { opacity, angle })

export const documentTiptapCssNative = () => invoke<string>('document_tiptap_css_ui')

export const documentHighlightCssNative = () => invoke<string>('document_highlight_css_ui')

export const pdfCaptureCssNative = () => invoke<string>('pdf_capture_css_ui')

export type UiSurfaceId = 'whats-new' | 'welcome' | 'privacy' | 'about' | 'docs'

export type UiSurfaceRequest = {
  surface: UiSurfaceId
  locale?: string
  strings?: Record<string, string>
  version?: string
  shortVersion?: string
  highlights?: string[]
  highlightCopy?: Record<string, [string, string]>
  recent?: Array<{ id: string; title: string; updatedLabel?: string }>
  privacyArticles?: Array<{ id: string; title: string; paragraphs: string[] }>
  docsTopics?: Array<{
    id: string
    title: string
    summary: string
    paragraphs?: string[]
    points?: string[]
  }>
  docsGroups?: Array<[string, string[]]>
}

export const renderUiSurfaceHtml = (request: UiSurfaceRequest) =>
  invoke<string>('render_ui_surface_html', { request })

export const openUiSurface = (request: UiSurfaceRequest) =>
  invoke<void>('open_ui_surface', { input: { request } })

export const closeUiSurface = () => invoke<void>('close_ui_surface')

export const clearAllDocuments = async () => {
  const count = await invoke<number>('clear_all_documents')
  clearDocumentCache()
  return count
}

export const getStorageSettings = () =>
  invoke<StorageSettings>('get_storage_settings')

export const pickDocumentsDirectory = () =>
  invoke<StorageSettings | null>('pick_documents_directory')

export const revealInFinder = (path: string) =>
  invoke<void>('reveal_in_finder', { path })

export const revealDocumentsDirectory = () =>
  invoke<void>('reveal_documents_directory')

export const getStorageDiskUsage = (path?: string | null) =>
  invoke<StorageDiskUsage>('get_storage_disk_usage', { path: path ?? null })

/** Local ClamAV CLI status (`clamscan` / `clamdscan` on PATH). */
export type AntivirusEngine = 'none' | 'clamscan' | 'clamdscan'
export type ScanVerdict = 'clean' | 'infected' | 'unavailable' | 'skipped'

export type AntivirusStatus = {
  engine: AntivirusEngine
  available: boolean
  binaryPath?: string | null
  version?: string | null
  detail: string
  installHint: string
}

export type ThreatHit = {
  name: string
  path: string
}

export type AntivirusScanReport = {
  engine: AntivirusEngine
  verdict: ScanVerdict
  path: string
  threats: ThreatHit[]
  rawSummary: string
  durationMs: number
}

export type AntivirusBatchReport = {
  scanned: number
  clean: number
  infected: number
  unavailable: number
  skipped: number
  reports: AntivirusScanReport[]
  durationMs: number
}

export type AntivirusSelfTestReport = {
  engine: AntivirusEngine
  passed: boolean
  detail: string
  scan: AntivirusScanReport
}

export type QuarantineEntry = {
  id: string
  originalPath: string
  quarantinedPath: string
  threatName?: string | null
  reason: string
  quarantinedAt: number
  sizeBytes: number
}

export type FileHealthReport = {
  integrity: {
    kind: string
    status: 'ok' | 'suspect' | 'corrupt'
    sizeBytes: number
    issues: Array<{ code: string; message: string }>
    checks: string[]
  }
  antivirus: AntivirusScanReport
}

export const antivirusStatus = () => invoke<AntivirusStatus>('antivirus_status')

export const antivirusSelfTest = () => invoke<AntivirusSelfTestReport>('antivirus_self_test')

export const antivirusScanPath = (path: string, timeoutSecs?: number | null) =>
  invoke<AntivirusScanReport>('antivirus_scan_path', {
    path,
    timeoutSecs: timeoutSecs ?? null,
  })

export const antivirusScanStorageFile = (path: string, timeoutSecs?: number | null) =>
  invoke<AntivirusScanReport>('antivirus_scan_storage_file', {
    path,
    timeoutSecs: timeoutSecs ?? null,
  })

export const antivirusScanStorageTree = (options?: {
  path?: string | null
  recursive?: boolean
  maxFiles?: number
}) =>
  invoke<AntivirusBatchReport>('antivirus_scan_storage_tree', {
    path: options?.path ?? null,
    recursive: options?.recursive ?? true,
    maxFiles: options?.maxFiles ?? 200,
  })

export const antivirusCheckStorageHealth = (path: string) =>
  invoke<FileHealthReport>('antivirus_check_storage_health', { path })

export const antivirusQuarantineStorageFile = (
  path: string,
  reason?: string | null,
  threatName?: string | null,
) =>
  invoke<QuarantineEntry>('antivirus_quarantine_storage_file', {
    path,
    reason: reason ?? null,
    threatName: threatName ?? null,
  })

export const antivirusQuarantineExternalPath = (
  path: string,
  reason?: string | null,
  threatName?: string | null,
) =>
  invoke<QuarantineEntry>('antivirus_quarantine_external_path', {
    path,
    reason: reason ?? null,
    threatName: threatName ?? null,
  })

export const antivirusListQuarantine = () =>
  invoke<QuarantineEntry[]>('antivirus_list_quarantine')

export const antivirusRestoreQuarantine = (id: string) =>
  invoke<string>('antivirus_restore_quarantine', { id })

export const antivirusPurgeQuarantine = (id: string) =>
  invoke<void>('antivirus_purge_quarantine', { id })

export const antivirusPurgeAllQuarantine = () =>
  invoke<number>('antivirus_purge_all_quarantine')

export const antivirusPickAndScan = (timeoutSecs?: number | null) =>
  invoke<AntivirusScanReport | null>('antivirus_pick_and_scan', {
    timeoutSecs: timeoutSecs ?? null,
  })

/** Native open dialog that grants the path in Rust (never pass arbitrary JS paths to grant). */
export const pickAndGrantPath = (options?: { title?: string; directory?: boolean }) =>
  invoke<string | null>('pick_and_grant_path', {
    title: options?.title ?? null,
    directory: options?.directory ?? null,
  })

/** Native save dialog that grants the chosen path for a subsequent write. */
export const pickAndGrantSavePath = (options?: { title?: string; defaultPath?: string }) =>
  invoke<string | null>('pick_and_grant_save_path', {
    title: options?.title ?? null,
    defaultPath: options?.defaultPath ?? null,
  })

/** Grant paths after a native window drop (also handled in Rust on_window_event). */
export const grantDroppedPaths = (paths: string[]) =>
  invoke<void>('grant_dropped_paths', { paths })

export const readTextFile = async (path: string) => {
  const result = await readTextFileDecoded(path)
  return result.text
}

export type ReadTextFileResult = {
  text: string
  encoding: string
  converted: boolean
}

export const readTextFileDecoded = async (path: string) =>
  invoke<ReadTextFileResult>('read_text_file', { path })

export const readBinaryFile = async (path: string) =>
  invoke<number[]>('read_binary_file', { path })

export const writeTextFile = async (path: string, contents: string) =>
  invoke<void>('write_text_file', { path, contents })

export const saveDocumentOcr = (documentId: string, imagePath: string, text: string) =>
  invoke<void>('save_document_ocr', { documentId, imagePath, text })

export type PickAndImportFailure = { path: string; error: string }
export type PickAndImportResult = {
  imported: Document[]
  failed: PickAndImportFailure[]
}

/** Multi-file import via native Rust picker (grants PathAccessGate). */
export const pickAndImportFiles = async () => {
  const { readAntivirusPolicy } = await import('@/lib/antivirus/prefs')
  return invoke<PickAndImportResult | null>('pick_and_import_file', {
    antivirusPolicy: readAntivirusPolicy(),
  })
}

export const importFile = async (path: string) => {
  const [
    { isPagesPath, importPagesDocumentFromPath },
    { isExcelPath, isLegacyExcelPath, importExcelDocumentFromPath },
    { isWordDocxPath },
  ] = await Promise.all([
    import('@/lib/import/pages'),
    import('@/lib/import/excel-xlsx'),
    import('@/lib/import/word-docx'),
  ])

  // Excel / CSV → TipTap tables via SheetJS (editable). Legacy .xls errors with convert hint.
  // Native picker also uses Rust `xlsx_bytes_to_tiptap` (same table shape).
  if (isLegacyExcelPath(path) || isExcelPath(path)) {
    return importExcelDocumentFromPath(path)
  }

  if (isPagesPath(path)) {
    return importPagesDocumentFromPath(path)
  }

  if (isWordDocxPath(path)) {
    return cacheDocument(await invoke<Document>('import_file', { path }))
  }

  return cacheDocument(await invoke<Document>('import_file', { path }))
}

const NATIVE_EXPORT_FORMATS = new Set(['md', 'txt', 'html', 'html-zip', 'epub'])

/** Export from SQLite by document id — TipTap blob never crosses IPC. */
export const exportDocumentById = (
  documentId: string,
  format: 'md' | 'txt' | 'html' | 'html-zip' | 'epub',
) =>
  invoke<ExportResult | null>('export_document_by_id', {
    input: { documentId, format },
  })

export const compileDocuments = (title: string, chapterIds: string[]) =>
  invoke<Document>('compile_documents', {
    input: { title, chapterIds },
  }).then(cacheDocument)

export type DiffDocumentRevisionsResult = {
  lines: Array<{ type: 'unchanged' | 'added' | 'removed'; text: string }>
  added: number
  removed: number
  oldText: string
  newText: string
  sideBySideRows: import('@/lib/revisions/diff-text').SideBySideRow[]
}

export const diffDocumentRevisions = (
  documentId: string,
  oldRevisionId: string,
  newRevisionId: string,
  currentPlainText?: string,
) =>
  invoke<DiffDocumentRevisionsResult>('diff_document_revisions', {
    input: {
      documentId,
      oldRevisionId,
      newRevisionId,
      currentPlainText: currentPlainText ?? null,
    },
  })

export type DiffPlainTextsResult = {
  lines: Array<{ type: 'unchanged' | 'added' | 'removed'; text: string }>
  added: number
  removed: number
  sideBySideRows: import('@/lib/revisions/diff-text').SideBySideRow[]
}

export const diffPlainTexts = (oldText: string, newText: string) =>
  invoke<DiffPlainTextsResult>('diff_plain_texts', { oldText, newText })

export const convertTiptap = (contentJson: string, format: 'plain' | 'markdown') =>
  invoke<string>('convert_tiptap', { contentJson, format })

export const invokeMatchDocumentChatIntent = (question: string) =>
  invoke<string | null>('match_document_chat_intent', { question })

export const invokeParseMetaTag = (raw: string) =>
  invoke<{ raw: string; kind: string; value: string }>('parse_meta_tag', { raw })

export const invokeDocumentMatchesMetaFilters = (
  tags: string[],
  filters: { status?: string | null; project?: string | null; year?: string | null },
) =>
  invoke<boolean>('document_matches_meta_filters', {
    tags,
    filters: {
      status: filters.status ?? null,
      project: filters.project ?? null,
      year: filters.year ?? null,
    },
  })

export const renderDocumentHtml = (documentId: string, includeTitleHeading = true) =>
  invoke<string>('render_document_html', {
    documentId,
    includeTitleHeading,
  })

export const exportDocument = async (
  html: string,
  plainText: string,
  title: string,
  format: 'pdf' | 'docx' | 'txt' | 'pages' | 'md' | 'html' | 'html-zip' | 'epub',
  markdown?: string,
  pageSetup?: import('@/lib/editor/page-setup').PageSetup,
  options?: { documentId?: string },
) => {
  if (
    options?.documentId &&
    NATIVE_EXPORT_FORMATS.has(format) &&
    format !== 'pdf'
  ) {
    try {
      return await exportDocumentById(
        options.documentId,
        format as 'md' | 'txt' | 'html' | 'html-zip' | 'epub',
      )
    } catch {
      // Vault / missing row — fall through to blob export.
    }
  }

  if (format === 'pdf') {
    const { generatePdfFromHtml } = await import('@/lib/export/pdf')
    const { dataBase64 } = await generatePdfFromHtml(html, { pageSetup, title })
    return invoke<ExportResult | null>('export_pdf_bytes', {
      input: { title, dataBase64 },
    })
  }

  return invoke<ExportResult | null>('export_document', {
    input: {
      html,
      plainText: format === 'md' ? (markdown ?? plainText) : plainText,
      title,
      format,
    },
  })
}

export const previewPdfExport = async (
  html: string,
  _plainText: string,
  title: string,
  pageSetup?: import('@/lib/editor/page-setup').PageSetup,
) => {
  const { generatePdfFromHtml } = await import('@/lib/export/pdf')
  const { dataBase64 } = await generatePdfFromHtml(html, { pageSetup, title })
  return { dataBase64 }
}

export const listFolders = (includeArchived = false) =>
  invoke<Folder[]>('list_folders', { includeArchived })

export const createFolder = (input: {
  name: string
  parentId?: string | null
  isVault?: boolean
  vaultVerifier?: string | null
  color?: string | null
  icon?: string | null
}) =>
  invoke<Folder>('create_folder', {
    input: {
      name: input.name,
      parentId: input.parentId ?? null,
      isVault: input.isVault ?? false,
      vaultVerifier: input.vaultVerifier ?? null,
      color: input.color ?? null,
      icon: input.icon ?? null,
    },
  })

export const renameFolder = (id: string, name: string) =>
  invoke<Folder>('rename_folder', { input: { id, name } })

export interface DeleteFolderResult {
  deletedDocumentIds: string[]
  deletedFolderIds: string[]
}

export interface TrashFolderDocumentsResult {
  trashedDocumentIds: string[]
}

export const deleteFolder = (id: string) => invoke<DeleteFolderResult>('delete_folder', { id })

export const trashFolderDocuments = (folderId: string) =>
  invoke<TrashFolderDocumentsResult>('trash_folder_documents', { folderId })

export const moveFolder = (id: string, parentId: string | null) =>
  invoke<Folder>('move_folder', { input: { id, parentId } })

export const moveDocumentToFolder = (documentId: string, folderId: string | null) =>
  invoke<void>('move_document_to_folder', { input: { documentId, folderId } })

export const moveDocumentsToFolder = (documentIds: string[], folderId: string | null) =>
  invoke<{ movedIds: string[] }>('move_documents_to_folder', {
    input: { documentIds, folderId },
  })

export const setFolderAppearance = (
  id: string,
  appearance: { color?: string | null; icon?: string | null },
) =>
  invoke<Folder>('set_folder_appearance', {
    input: {
      id,
      color: appearance.color ?? null,
      icon: appearance.icon ?? null,
    },
  })

export const setFolderArchived = (id: string, archived: boolean) =>
  invoke<string[]>('set_folder_archived', { id, archived })

export const reorderFolders = (orderedIds: string[]) =>
  invoke<void>('reorder_folders', { input: { orderedIds } })

export const folderStats = (id: string) =>
  invoke<{ subfolderCount: number; documentCount: number }>('folder_stats', { id })

export const folderDocumentCounts = () =>
  invoke<{ folderId: string; count: number }[]>('folder_document_counts')

export const duplicateFolderStructure = (id: string) =>
  invoke<Folder[]>('duplicate_folder_structure', { id })

export const searchDocuments = (
  query: string,
  limit = 20,
  filter?: {
    folderId?: string
    tag?: string
    fromDate?: string
    toDate?: string
    libraryId?: string
  },
) =>
  invoke<SearchHit[]>('search_documents', {
    query,
    limit,
    folderId: filter?.folderId,
    tag: filter?.tag,
    fromDate: filter?.fromDate,
    toDate: filter?.toDate,
    libraryId: filter?.libraryId,
  })

export const listDocumentRevisions = (documentId: string, limit = 20) =>
  invoke<DocumentRevision[]>('list_document_revisions', { documentId, limit })

export const getDocumentRevision = (revisionId: string) =>
  invoke<DocumentRevisionDetail>('get_document_revision', { revisionId })

export const createNamedRevision = (documentId: string, label: string, pinned = true) =>
  invoke<DocumentRevision>('create_named_revision', {
    input: { documentId, label, pinned },
  })

export const renameDocumentRevision = (
  revisionId: string,
  label: string | null,
  pinned?: boolean,
) =>
  invoke<DocumentRevision>('rename_document_revision', {
    input: { revisionId, label, pinned },
  })

export const deleteDocumentRevision = (revisionId: string) =>
  invoke<void>('delete_document_revision', { revisionId })

export const restoreDocumentRevision = (revisionId: string) =>
  invoke<Document>('restore_document_revision', { revisionId })

export interface ScanScribeResult {
  scannedCount: number
  importedCount: number
  updatedCount: number
}

export interface ReconcileResult {
  scannedCount: number
  importedCount: number
  updatedFromDiskCount: number
  syncedToDiskCount: number
  conflictCount: number
}

export interface DiskPersistError {
  documentId: string
  message: string
}

export interface FlushPendingWritesResult {
  flushed: number
  errors: DiskPersistError[]
}

export interface BackendStats {
  schemaVersion: number
  documentsCount: number
  foldersCount: number
  revisionsCount: number
  linksCount: number
  walEnabled: boolean
  deferredDiskWrites: boolean
  dbPath: string
  documentsDir: string
  appVersion: string
  pendingDiskJobs: number
}

export interface LinkGraphEdge {
  sourceId: string
  targetId: string
  sourceTitle: string
  targetTitle: string
}

export interface LinkGraphOrphan {
  id: string
  title: string
}

export interface LinkGraph {
  edges: LinkGraphEdge[]
  orphans: LinkGraphOrphan[]
}

export interface BackupExportResult {
  path: string
  documentsIncluded: number
}

export interface BackupImportResult {
  documentsImported: number
  message: string
}

export const listLinkGraph = () => invoke<LinkGraph>('list_link_graph')

export interface WikiHealthOrphan {
  id: string
  title: string
}

export interface WikiHealthUnresolved {
  documentId: string
  documentTitle: string
  label: string
  targetId?: string | null
  suggestions?: TitleMatch[]
}

export interface TitleMatch {
  id: string
  title: string
  score: number
}

export interface ResolveWikiLinkResult {
  documentId: string
  label: string
  targetId: string
  targetTitle: string
  updated: number
}

export interface WikiHealthStub {
  id: string
  title: string
  wordCount: number
}

export interface WikiHealth {
  orphans: WikiHealthOrphan[]
  unresolved: WikiHealthUnresolved[]
  stubs: WikiHealthStub[]
}

export const listWikiHealth = (options?: {
  unresolvedLimit?: number
  stubMaxWords?: number
  stubLimit?: number
}) =>
  invoke<WikiHealth>('list_wiki_health', {
    unresolvedLimit: options?.unresolvedLimit ?? null,
    stubMaxWords: options?.stubMaxWords ?? null,
    stubLimit: options?.stubLimit ?? null,
  })

export interface GraphHub {
  id: string
  title: string
  backlinks: number
  outgoing: number
}

export const listGraphHubs = (limit = 12) =>
  invoke<GraphHub[]>('list_graph_hubs', { limit })

export const findDocumentsByTitle = (title: string, limit = 10) =>
  invoke<TitleMatch[]>('find_documents_by_title', { title, limit })

export const resolveWikiLink = (documentId: string, label: string, targetId: string) =>
  invoke<ResolveWikiLinkResult>('resolve_wiki_link', {
    documentId,
    label,
    targetId,
  })

export const exportLibraryArchive = (password?: string | null) =>
  invoke<BackupExportResult | null>('export_library_archive', {
    password: password?.trim() ? password.trim() : null,
  })

export const exportLibraryArchiveToDir = (directory: string) =>
  invoke<BackupExportResult>('export_library_archive_to_dir', { directory })

/** Default folder for automatic backups (~/Documents/Scribe/Backups). */
export const getDefaultAutoBackupDir = () =>
  invoke<string>('get_default_auto_backup_dir')

export interface AutoBackupConfig {
  enabled: boolean
  intervalHours: number
  directory: string | null
  lastAt: number | null
  /** True when AES password is configured for auto-backup zips. */
  encrypted?: boolean
}

export const getAutoBackupConfig = () => invoke<AutoBackupConfig>('get_auto_backup_config')

export const configureAutoBackup = (config: AutoBackupConfig) =>
  invoke<AutoBackupConfig>('configure_auto_backup', { config })

/** Set or clear AES password for automatic backup archives. Empty clears. */
export const setAutoBackupPassword = (password: string | null) =>
  invoke<AutoBackupConfig>('set_auto_backup_password', {
    password: password?.trim() ? password.trim() : null,
  })

export const setDocumentsWatchEnabled = (enabled: boolean) =>
  invoke<void>('set_documents_watch_enabled', { enabled })

export interface SmartFolderRecord {
  id: string
  libraryId: string
  name: string
  queryRule: string
  icon: string | null
  createdAt: number
  updatedAt: number
}

export interface SmartFolderMatch {
  documentId: string
  title: string
}

export interface SmartFolderEval {
  folder: SmartFolderRecord
  matches: SmartFolderMatch[]
}

export const listSmartFolders = () => invoke<SmartFolderRecord[]>('list_smart_folders')

export const upsertSmartFolder = (input: {
  id?: string | null
  name: string
  queryRule: string
  icon?: string | null
}) => invoke<SmartFolderRecord>('upsert_smart_folder', { input })

export const deleteSmartFolder = (id: string) => invoke<boolean>('delete_smart_folder', { id })

export const evaluateSmartFolder = (input: {
  id?: string | null
  queryRule?: string | null
  limit?: number
}) => invoke<SmartFolderEval>('evaluate_smart_folder', { input })

export const importLibraryArchive = (password?: string | null) =>
  invoke<BackupImportResult | null>('import_library_archive', {
    password: password?.trim() ? password.trim() : null,
  })

export const scanScribeFiles = () => invoke<ScanScribeResult>('scan_scribe_files')

export const reconcileStorage = () => invoke<ReconcileResult>('reconcile_storage')

export const flushPendingWrites = (documentId?: string) =>
  invoke<FlushPendingWritesResult>('flush_pending_writes', {
    documentId: documentId ?? null,
  })

export const getBackendStats = () => invoke<BackendStats>('get_backend_stats')

/** Installed system font family names (empty when not in Tauri). */
export async function listSystemFontFamilies(): Promise<string[]> {
  try {
    return await invoke<string[]>('list_system_font_families')
  } catch {
    return []
  }
}

export const forceSaveDocument = async (id: string) =>
  cacheDocument(await invoke<Document>('force_save_document', { id }))

export const saveDocumentImage = (
  documentId: string,
  fileName: string,
  dataBase64: string,
) =>
  invoke<string>('save_document_image', {
    documentId,
    fileName,
    dataBase64,
  })

/** Edge flood-fill background removal → new PNG path under the document assets. */
export const removeImageBackground = (
  documentId: string,
  imagePath: string,
  tolerance?: number | null,
) =>
  invoke<string>('remove_image_background', {
    documentId,
    imagePath,
    tolerance: tolerance ?? null,
  })

export type LibraryAssetKind = 'image' | 'svg' | 'lottie' | 'model3d' | 'video' | 'other'

export interface LibraryAsset {
  path: string
  fileName: string
  extension: string
  kind: LibraryAssetKind | string
  sizeBytes: number
  documentId: string
  documentTitle: string | null
  modifiedAt: number | null
}

export const listLibraryAssets = () => invoke<LibraryAsset[]>('list_library_assets')

export const deleteLibraryAsset = (path: string) =>
  invoke<void>('delete_library_asset', { path })

export interface CustomTemplateCategoryRow {
  id: string
  name: string
  createdAt: number
}

export interface CustomTemplateRow {
  id: string
  name: string
  description: string
  category: string
  title: string
  contentJson: string
  createdAt: number
}

export const listCustomTemplateCategories = () =>
  invoke<CustomTemplateCategoryRow[]>('list_custom_template_categories')

export const createCustomTemplateCategory = (input: CustomTemplateCategoryRow) =>
  invoke<CustomTemplateCategoryRow>('create_custom_template_category', {
    input: {
      id: input.id,
      name: input.name,
      createdAt: input.createdAt,
    },
  })

export const deleteCustomTemplateCategory = (id: string) =>
  invoke<number>('delete_custom_template_category', { id })

export const listCustomTemplates = () => invoke<CustomTemplateRow[]>('list_custom_templates')

export const createCustomTemplate = (input: CustomTemplateRow) =>
  invoke<CustomTemplateRow>('create_custom_template', {
    input: {
      id: input.id,
      name: input.name,
      description: input.description,
      category: input.category,
      title: input.title,
      contentJson: input.contentJson,
      createdAt: input.createdAt,
    },
  })

export const deleteCustomTemplate = (id: string) =>
  invoke<void>('delete_custom_template', { id })
