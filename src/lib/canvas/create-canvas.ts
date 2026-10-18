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

/**
 * Turn selected note/text cards into real wiki documents and return
 * patch objects that should become `docLink` cards on the canvas.
 */
export async function promoteCanvasCardsToWikiNotes(
  dispatch: AppDispatch,
  getTitle: (key: string) => string,
  objects: CanvasObject[],
): Promise<{ created: number; patched: CanvasObject[] }> {
  const patched: CanvasObject[] = []
  let created = 0

  for (const obj of objects) {
    if (obj.kind === 'docLink' && obj.documentId) {
      patched.push(obj)
      continue
    }
    const text =
      obj.kind === 'note' || obj.kind === 'text' || obj.kind === 'rect' || obj.kind === 'ellipse'
        ? obj.text.trim() || obj.label.trim()
        : obj.label.trim()
    if (!text) {
      patched.push(obj)
      continue
    }
    const title =
      text.split(/\n/)[0]?.trim().slice(0, 80) || getTitle('canvas.insertDocTitle')
    const paragraphs = text
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => ({
        type: 'paragraph',
        content: [{ type: 'text', text: line }],
      }))
    const document = cacheDocument(
      await createDocument({
        title,
        contentJson: JSON.stringify({
          type: 'doc',
          content: paragraphs.length > 0 ? paragraphs : [{ type: 'paragraph' }],
        }),
      }),
    )
    created += 1
    dispatch(updateDocuments((prev) => prependDocumentSummary(prev, document)))
    patched.push({
      ...obj,
      kind: 'docLink',
      documentId: document.id,
      documentTitle: document.title,
      text: '',
      label: document.title,
    })
  }

  void logCanvasAudit('canvas_promote_wiki', 'Promoted canvas cards to wiki notes', {
    created,
    objectCount: objects.length,
  })
  return { created, patched }
}
