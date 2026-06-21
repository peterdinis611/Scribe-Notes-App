import { listDocuments, listFolders, type Document, type DocumentSummary } from '@/lib/db/api'

export function documentToSummary(doc: Document): DocumentSummary {
  return {
    id: doc.id,
    title: doc.title,
    folderId: doc.folderId,
    filePath: doc.filePath,
    updatedAt: doc.updatedAt,
  }
}

export function prependDocumentSummary(documents: DocumentSummary[], doc: Document): DocumentSummary[] {
  const summary = documentToSummary(doc)
  return [summary, ...documents.filter((item) => item.id !== summary.id)]
}

export async function fetchLibrarySnapshot() {
  const [folders, documents] = await Promise.all([listFolders(), listDocuments()])
  return { folders, documents }
}
