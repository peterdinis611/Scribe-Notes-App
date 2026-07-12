import { createDocument, getDocument } from '@/lib/db/api'
import { cacheDocument } from '@/lib/cache/document-cache'
import { prependDocumentSummary } from '@/lib/db/library-sync'
import { ROUTES } from '@/lib/routes'
import {
  readScratchDocumentId,
  persistScratchDocumentId,
} from '@/store/persistence'
import type { AppDispatch } from '@/store/index'
import {
  setActiveDocument,
  setActiveDocumentId,
  setSaveStatus,
  updateDocuments,
} from '@/store/documentsSlice'

export async function openQuickNote(
  documents: { id: string; deletedAt: number | null }[],
  dispatch: AppDispatch,
  navigate: (route: ReturnType<typeof ROUTES.document>) => void | Promise<void>,
  getTitle: (key: string) => string,
) {
  const storedId = readScratchDocumentId()
  if (storedId) {
    const existing = documents.find((doc) => doc.id === storedId && doc.deletedAt == null)
    if (existing) {
      const document = cacheDocument(await getDocument(existing.id))
      dispatch(setActiveDocumentId(document.id))
      dispatch(setActiveDocument(document))
      await navigate(ROUTES.document(document.id))
      return document
    }
  }

  const document = cacheDocument(
    await createDocument({
      title: getTitle('quickNote.title'),
      contentJson: JSON.stringify({ type: 'doc', content: [] }),
    }),
  )

  persistScratchDocumentId(document.id)
  dispatch(updateDocuments((prev) => prependDocumentSummary(prev, document)))
  dispatch(setActiveDocumentId(document.id))
  dispatch(setActiveDocument(document))
  dispatch(setSaveStatus('saved'))
  await navigate(ROUTES.document(document.id))
  return document
}
