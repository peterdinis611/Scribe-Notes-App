import { createDocument } from '@/lib/db/api'
import { cacheDocument } from '@/lib/cache/document-cache'
import { markCanvasDocument } from '@/lib/canvas/known'
import { buildCanvasTemplate, type CanvasTemplateId } from '@/lib/canvas/templates'
import { emptyCanvasDocument, serializeCanvasDocument } from '@/lib/canvas/types'
import { canvasObjectsToTiptapDoc } from '@/lib/canvas/to-tiptap'
import type { CanvasObject } from '@/lib/canvas/types'
import { prependDocumentSummary } from '@/lib/db/library-sync'
import { ROUTES } from '@/lib/routes'
import type { AppDispatch } from '@/store/index'
import {
  setActiveDocument,
  setActiveDocumentId,
  setSaveStatus,
  updateDocuments,
} from '@/store/documentsSlice'
import { logCanvasAudit } from '@/lib/canvas/audit'

export async function openNewCanvasNote(
  dispatch: AppDispatch,
  navigate: (route: ReturnType<typeof ROUTES.document>) => void | Promise<void>,
  getTitle: (key: string) => string,
  template: CanvasTemplateId = 'blank',
) {
  const content =
    template === 'blank' ? emptyCanvasDocument() : buildCanvasTemplate(template)
  const titleKey =
    template === 'blank'
      ? 'canvas.defaultTitle'
      : (`canvas.template.${template}.title` as const)

  const document = cacheDocument(
    await createDocument({
      title: getTitle(titleKey),
      contentJson: serializeCanvasDocument(content),
    }),
  )

  markCanvasDocument(document.id)
  dispatch(updateDocuments((prev) => prependDocumentSummary(prev, document)))
  dispatch(setActiveDocumentId(document.id))
  dispatch(setActiveDocument(document))
  dispatch(setSaveStatus('saved'))
  void logCanvasAudit('canvas_create', `Created canvas (${template})`, {
    documentId: document.id,
    template,
  })
  await navigate(ROUTES.document(document.id))
  return document
}

/** Create a TipTap note from canvas selection and open it. */
export async function openTiptapFromCanvasSelection(
  dispatch: AppDispatch,
  navigate: (route: ReturnType<typeof ROUTES.document>) => void | Promise<void>,
  getTitle: (key: string) => string,
  objects: CanvasObject[],
) {
  const contentJson = JSON.stringify(canvasObjectsToTiptapDoc(objects))
  const document = cacheDocument(
    await createDocument({
      title: getTitle('canvas.insertDocTitle'),
      contentJson,
    }),
  )
  dispatch(updateDocuments((prev) => prependDocumentSummary(prev, document)))
  dispatch(setActiveDocumentId(document.id))
  dispatch(setActiveDocument(document))
  dispatch(setSaveStatus('saved'))
  void logCanvasAudit('canvas_export_tiptap', 'Exported canvas selection to note', {
    documentId: document.id,
    objectCount: objects.length,
  })
  await navigate(ROUTES.document(document.id))
  return document
}
