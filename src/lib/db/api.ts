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

