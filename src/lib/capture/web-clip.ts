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

/** Create a note from a Safari/share-style clip payload. */
export async function openWebClipNote(
  dispatch: AppDispatch,
  navigate: (route: ReturnType<typeof ROUTES.document>) => void | Promise<void>,
  args: { url?: string; title?: string; text?: string },
) {
  const title =
    args.title?.trim() ||
    args.url?.replace(/^https?:\/\//i, '').slice(0, 80) ||
    'Web clip'
  const blocks: Array<Record<string, unknown>> = [
    {
      type: 'heading',
      attrs: { level: 1 },
      content: [{ type: 'text', text: title }],
    },
  ]
  if (args.url?.trim()) {
    blocks.push({
      type: 'paragraph',
      content: [
        {
          type: 'text',
          marks: [{ type: 'link', attrs: { href: args.url.trim() } }],
          text: args.url.trim(),
        },
      ],
    })
  }
  if (args.text?.trim()) {
    for (const part of args.text.trim().split(/\n\n+/)) {
      blocks.push({
        type: 'paragraph',
        content: part.trim() ? [{ type: 'text', text: part.trim() }] : undefined,
      })
    }
  }
  blocks.push({ type: 'paragraph' })

  const document = cacheDocument(
    await createDocument({
      title,
      contentJson: JSON.stringify({ type: 'doc', content: blocks }),
    }),
  )
  dispatch(updateDocuments((prev) => prependDocumentSummary(prev, document)))
  dispatch(setActiveDocumentId(document.id))
  dispatch(setActiveDocument(document))
  dispatch(setSaveStatus('saved'))
  await navigate(ROUTES.document(document.id))
  return document
}
