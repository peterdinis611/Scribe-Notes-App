import { cacheDocument } from '@/lib/cache/document-cache'
import { createDocument, type Document } from '@/lib/db/api'
import { prependDocumentSummary } from '@/lib/db/library-sync'
import {
  parseMarkdownToContentJson,
  titleFromMarkdown,
} from '@/lib/editor/markdown-content'
import { ROUTES } from '@/lib/routes'
import type { AppDispatch } from '@/store/index'
import {
  setActiveDocument,
  setActiveDocumentId,
  setSaveStatus,
  updateDocuments,
} from '@/store/documentsSlice'

function fallbackTitle(hint?: string | null): string {
  const trimmed = (hint || '').trim().replace(/\s+/g, ' ').slice(0, 80)
  if (trimmed) return trimmed
  const stamp = new Date().toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  return `Agent note · ${stamp}`
}

/** Create a library note from agent markdown and open it. */
export async function spawnNoteFromAgentMarkdown(input: {
  markdown: string
  titleHint?: string | null
  folderId?: string | null
  dispatch: AppDispatch
  navigate: (route: ReturnType<typeof ROUTES.document>) => void | Promise<void>
}): Promise<Document> {
  const body = (input.markdown || '').trim()
  if (!body) throw new Error('agent.spawnEmpty')

  const title = titleFromMarkdown(body, fallbackTitle(input.titleHint))
  const contentJson = parseMarkdownToContentJson(body)
  const document = cacheDocument(
    await createDocument({
      title,
      folderId: input.folderId ?? undefined,
      contentJson,
    }),
  )

  input.dispatch(updateDocuments((prev) => prependDocumentSummary(prev, document)))
  input.dispatch(setActiveDocumentId(document.id))
  input.dispatch(setActiveDocument(document))
  input.dispatch(setSaveStatus('saved'))
  await input.navigate(ROUTES.document(document.id))
  return document
}
