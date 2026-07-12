import { invoke } from '@tauri-apps/api/core'
import { cacheDocument, clearDocumentCache, invalidateDocumentCache, peekCachedDocument } from '@/lib/cache/document-cache'

export interface DocumentSummary {
  id: string
  title: string
  folderId: string | null
  filePath: string | null
  updatedAt: number
  isFavorite: boolean
  tags: string[]
  deletedAt: number | null
}

export interface Folder {
  id: string
  name: string
  parentId: string | null
  createdAt: number
  updatedAt: number
}

export interface SearchHit {
  documentId: string
  title: string
  snippet: string
  rank: number
}

export interface DocumentRevision {
  id: string
  documentId: string
  title: string
  createdAt: number
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
}

export interface StorageSettings {
  documentsDir: string
  folderAccessGranted: boolean
}

export interface ExportResult {
  path: string
}

export const listDocuments = () => invoke<DocumentSummary[]>('list_documents')

export const getDocument = async (id: string) => {
  const cached = peekCachedDocument(id)
  if (cached) return cached
  return cacheDocument(await invoke<Document>('get_document', { id }))
}

export const fetchDocumentFresh = async (id: string) =>
  cacheDocument(await invoke<Document>('get_document', { id }))

export const createDocument = async (input: CreateDocumentInput) =>
  cacheDocument(await invoke<Document>('create_document', { input }))

export const duplicateDocument = async (id: string, title?: string) =>
  cacheDocument(await invoke<Document>('duplicate_document', { input: { id, title } }))

export const updateDocument = async (input: UpdateDocumentInput) =>
  cacheDocument(await invoke<Document>('update_document', { input }))

export const deleteDocument = async (id: string) => {
  await invoke<void>('delete_document', { id })
  invalidateDocumentCache(id)
}

export const listTrashedDocuments = () => invoke<DocumentSummary[]>('list_trashed_documents')

export const restoreDocument = async (id: string) => {
  await invoke<void>('restore_document', { id })
  invalidateDocumentCache(id)
}

export const purgeDocument = async (id: string) => {
  await invoke<void>('purge_document', { id })
  invalidateDocumentCache(id)
}

export const emptyTrash = () => invoke<number>('empty_trash')

export const setDocumentFavorite = (id: string, favorite: boolean) =>
  invoke<void>('set_document_favorite', { id, favorite })

export const setDocumentTags = (id: string, tags: string[]) =>
  invoke<void>('set_document_tags', { id, tags })

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

export const readTextFile = (path: string) => invoke<string>('read_text_file', { path })

export const pickAndImportFile = async () => {
  const { pickAndImportDocument } = await import('@/lib/import-document')
  return pickAndImportDocument()
}

export const importFile = async (path: string) => cacheDocument(await invoke<Document>('import_file', { path }))

export const exportDocument = async (
  html: string,
  plainText: string,
  title: string,
  format: 'pdf' | 'docx' | 'txt' | 'pages' | 'md',
  markdown?: string,
  pageSetup?: import('@/lib/editor/page-setup').PageSetup,
) => {
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

export const listFolders = () => invoke<Folder[]>('list_folders')

export const createFolder = (input: { name: string; parentId?: string | null }) =>
  invoke<Folder>('create_folder', { input: { name: input.name, parentId: input.parentId ?? null } })

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

export const searchDocuments = (query: string, limit = 20) =>
  invoke<SearchHit[]>('search_documents', { query, limit })

export const listDocumentRevisions = (documentId: string, limit = 20) =>
  invoke<DocumentRevision[]>('list_document_revisions', { documentId, limit })

export const getDocumentRevision = (revisionId: string) =>
  invoke<DocumentRevisionDetail>('get_document_revision', { revisionId })

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

export interface BackupExportResult {
  path: string
  documentsIncluded: number
}

export interface BackupImportResult {
  documentsImported: number
  message: string
}

export const listLinkGraph = () => invoke<LinkGraphEdge[]>('list_link_graph')

export const exportLibraryArchive = () =>
  invoke<BackupExportResult | null>('export_library_archive')

export const importLibraryArchive = () =>
  invoke<BackupImportResult | null>('import_library_archive')

export const scanScribeFiles = () => invoke<ScanScribeResult>('scan_scribe_files')

export const reconcileStorage = () => invoke<ReconcileResult>('reconcile_storage')

export const flushPendingWrites = (documentId?: string) =>
  invoke<FlushPendingWritesResult>('flush_pending_writes', {
    documentId: documentId ?? null,
  })

export const getBackendStats = () => invoke<BackendStats>('get_backend_stats')

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
