import { createDocument } from '@/lib/db/api'
import { cacheDocument } from '@/lib/cache/document-cache'
import { prependDocumentSummary } from '@/lib/db/library-sync'
import { emptyPaintSketchDoc } from '@/lib/editor/paint'
import { ROUTES } from '@/lib/routes'
import type { AppDispatch } from '@/store/index'
import {
  setActiveDocument,
  setActiveDocumentId,
  setSaveStatus,
  updateDocuments,
} from '@/store/documentsSlice'

/** Create a TipTap note with an empty ink pad and open it. */
export async function openNewPaintSketch(
  dispatch: AppDispatch,
  navigate: (route: ReturnType<typeof ROUTES.document>) => void | Promise<void>,
  getTitle: (key: string) => string,
) {
  const title = getTitle('paint.defaultTitle')
  const document = cacheDocument(
    await createDocument({
      title,
      contentJson: JSON.stringify(emptyPaintSketchDoc(title)),
    }),
  )

  dispatch(updateDocuments((prev) => prependDocumentSummary(prev, document)))
  dispatch(setActiveDocumentId(document.id))
  dispatch(setActiveDocument(document))
  dispatch(setSaveStatus('saved'))
  await navigate(ROUTES.document(document.id))
  return document
}
