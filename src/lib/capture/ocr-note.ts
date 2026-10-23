import { createDocument } from '@/lib/db/api'
import { cacheDocument } from '@/lib/cache/document-cache'
import { prependDocumentSummary } from '@/lib/db/library-sync'
import { ROUTES } from '@/lib/routes'
import type { AppDispatch } from '@/store/index'
import {
  setActiveDocument,
  setActiveDocumentId,
  setSaveStatus,
  updateDocuments,
} from '@/store/documentsSlice'

/** Create a note from OCR / extracted image text. */
export async function openOcrCaptureNote(
  dispatch: AppDispatch,
  navigate: (route: ReturnType<typeof ROUTES.document>) => void | Promise<void>,
  args: { text: string; sourceTitle?: string },
) {
  const body = args.text.trim()
  if (!body) throw new Error('empty')
  const title =
    args.sourceTitle?.trim() ||
    `OCR · ${new Date().toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`
  const paragraphs = body.split(/\n+/).map((line) => ({
    type: 'paragraph',
    content: line.trim() ? [{ type: 'text', text: line.trim() }] : undefined,
  }))
  const document = cacheDocument(
    await createDocument({
      title,
      contentJson: JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 1 },
            content: [{ type: 'text', text: title }],
          },
          ...paragraphs,
          { type: 'paragraph' },
        ],
      }),
    }),
  )
  dispatch(updateDocuments((prev) => prependDocumentSummary(prev, document)))
  dispatch(setActiveDocumentId(document.id))
  dispatch(setActiveDocument(document))
  dispatch(setSaveStatus('saved'))
  await navigate(ROUTES.document(document.id))
  return document
}
