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

function looksLikeUrl(text: string): boolean {
  return /^https?:\/\/\S+$/i.test(text.trim())
}

function contentFromClipboard(text: string): { title: string; contentJson: string } {
  const trimmed = text.trim()
  if (!trimmed) {
    return {
      title: 'Capture',
      contentJson: JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] }),
    }
  }
  if (looksLikeUrl(trimmed)) {
    return {
      title: trimmed.replace(/^https?:\/\//i, '').slice(0, 80),
      contentJson: JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                marks: [{ type: 'link', attrs: { href: trimmed } }],
                text: trimmed,
              },
            ],
          },
          { type: 'paragraph' },
        ],
      }),
    }
  }
  const firstLine = trimmed.split(/\r?\n/).find((line) => line.trim())?.trim() ?? 'Capture'
  return {
    title: firstLine.slice(0, 80),
    contentJson: JSON.stringify({
      type: 'doc',
      content: trimmed.split(/\n\n+/).map((block) => ({
        type: 'paragraph',
        content: block.trim() ? [{ type: 'text', text: block.trim() }] : undefined,
      })),
    }),
  }
}

/** Create a note from the system clipboard (tray / command palette capture). */
export async function openClipboardCaptureNote(
  dispatch: AppDispatch,
  navigate: (route: ReturnType<typeof ROUTES.document>) => void | Promise<void>,
  getTitle: (key: string) => string,
) {
  let text = ''
  try {
    text = (await navigator.clipboard.readText()) ?? ''
  } catch {
    text = ''
  }
  const built = contentFromClipboard(text)
  const document = cacheDocument(
    await createDocument({
      title: built.title || getTitle('capture.clipboardTitle'),
      contentJson: built.contentJson,
    }),
  )
  dispatch(updateDocuments((prev) => prependDocumentSummary(prev, document)))
  dispatch(setActiveDocumentId(document.id))
  dispatch(setActiveDocument(document))
  dispatch(setSaveStatus('saved'))
  await navigate(ROUTES.document(document.id))
  return document
}
