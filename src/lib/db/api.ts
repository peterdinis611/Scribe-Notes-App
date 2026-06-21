import { invoke } from '@tauri-apps/api/core'

export interface DocumentSummary {
  id: string
  title: string
  folderId: string | null
  filePath: string | null
  updatedAt: number
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
}

export interface ExportResult {
  path: string
}

export const listDocuments = () => invoke<DocumentSummary[]>('list_documents')

export const getDocument = (id: string) => invoke<Document>('get_document', { id })

export const createDocument = (input: CreateDocumentInput) =>
  invoke<Document>('create_document', { input })

export const updateDocument = (input: UpdateDocumentInput) =>
  invoke<Document>('update_document', { input })

export const deleteDocument = (id: string) =>
  invoke<void>('delete_document', { id })

export const clearAllDocuments = () => invoke<number>('clear_all_documents')

export const getStorageSettings = () =>
  invoke<StorageSettings>('get_storage_settings')

export const pickDocumentsDirectory = () =>
  invoke<StorageSettings | null>('pick_documents_directory')

export const revealInFinder = (path: string) =>
  invoke<void>('reveal_in_finder', { path })

export const pickAndImportFile = () =>
  invoke<Document | null>('pick_and_import_file')

export const importFile = (path: string) =>
  invoke<Document>('import_file', { path })

export const exportDocument = (
  html: string,
  plainText: string,
  title: string,
  format: 'pdf' | 'docx' | 'txt' | 'pages',
) =>
  invoke<ExportResult | null>('export_document', {
    input: { html, plainText, title, format },
  })

export const scanScribeFiles = () => invoke<Document[]>('scan_scribe_files')

export const forceSaveDocument = (id: string) =>
  invoke<Document>('force_save_document', { id })

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
