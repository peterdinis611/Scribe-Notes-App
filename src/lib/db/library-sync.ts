import { listDocuments, listFolders, type Document, type DocumentSummary } from '@/lib/db/api'

export function documentToSummary(
  doc: Document,
  previous?: DocumentSummary,
): DocumentSummary {
  return {
    id: doc.id,
    title: doc.title,
    folderId: doc.folderId,
    filePath: doc.filePath,
    updatedAt: doc.updatedAt,
    isFavorite: previous?.isFavorite ?? false,
    tags: previous?.tags ?? [],
    deletedAt: previous?.deletedAt ?? null,
  }
}

export function prependDocumentSummary(documents: DocumentSummary[], doc: Document): DocumentSummary[] {
  const previous = documents.find((item) => item.id === doc.id)
  const summary = documentToSummary(doc, previous)
  return [summary, ...documents.filter((item) => item.id !== summary.id)]
}

export async function fetchLibrarySnapshot() {
  const [folders, documents] = await Promise.all([listFolders(), listDocuments()])
  return { folders, documents }
}
