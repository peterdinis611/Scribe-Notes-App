import { cacheDocument } from '@/lib/cache/document-cache'
import { createDocument, type Document } from '@/lib/db/api'
import { prependDocumentSummary } from '@/lib/db/library-sync'
import { nlpFilesList, nlpFilesReadText } from '@/lib/db/nlp-api'
import {
  parseMarkdownToContentJson,
  titleFromMarkdown,
} from '@/lib/editor/markdown-content'
import type { LibraryChatCitation } from '@/lib/library/library-chat'
import { ROUTES } from '@/lib/routes'
import type { AppDispatch } from '@/store/index'
import {
  setActiveDocument,
  setActiveDocumentId,
  setSaveStatus,
  updateDocuments,
} from '@/store/documentsSlice'

const TEXT_EXT = /\.(md|markdown|txt|csv|json|html|htm|rst|log)$/i

function basename(path: string): string {
  return path.split(/[/\\]/).pop() || path
}

function titleFromPath(path: string): string {
  return basename(path).replace(TEXT_EXT, '').trim() || basename(path)
}

export async function ingestSandboxFileToNote(input: {
  path: string
  folderId?: string | null
  dispatch?: AppDispatch
  navigate?: (route: ReturnType<typeof ROUTES.document>) => void | Promise<void>
  activate?: boolean
}): Promise<Document> {
  const read = await nlpFilesReadText({ path: input.path })
  const text = (read.text || '').trim()
  if (!text) throw new Error('agent.ingestEmpty')

  const looksMd = TEXT_EXT.test(input.path) || /^#\s/m.test(text)
  const title = titleFromMarkdown(text, titleFromPath(input.path))
  const contentJson = looksMd
    ? parseMarkdownToContentJson(text)
    : parseMarkdownToContentJson(text.split(/\n+/).map((line) => line.trim()).filter(Boolean).join('\n\n'))

  const document = cacheDocument(
    await createDocument({
      title,
      folderId: input.folderId ?? undefined,
      contentJson,
    }),
  )

  if (input.dispatch) {
    input.dispatch(updateDocuments((prev) => prependDocumentSummary(prev, document)))
    if (input.activate !== false && input.navigate) {
      input.dispatch(setActiveDocumentId(document.id))
      input.dispatch(setActiveDocument(document))
      input.dispatch(setSaveStatus('saved'))
      await input.navigate(ROUTES.document(document.id))
    }
  }
  return document
}

/** Import cited sandbox paths (from files_answer) into the library. */
export async function ingestCitedFilesToNotes(input: {
  citations: LibraryChatCitation[]
  folderId?: string | null
  dispatch: AppDispatch
  navigate: (route: ReturnType<typeof ROUTES.document>) => void | Promise<void>
  limit?: number
}): Promise<Document[]> {
  const paths = input.citations
    .map((item) => item.documentId)
    .filter((path): path is string => Boolean(path && !path.includes('://') && path.includes('/')))
  const unique = [...new Set(paths)].slice(0, input.limit ?? 6)
  const created: Document[] = []
  for (let i = 0; i < unique.length; i += 1) {
    const path = unique[i]!
    try {
      const doc = await ingestSandboxFileToNote({
        path,
        folderId: input.folderId,
        dispatch: input.dispatch,
        navigate: input.navigate,
        activate: i === unique.length - 1,
      })
      created.push(doc)
    } catch {
      // skip unreadable entries
    }
  }
  return created
}

/** Agent tool: pull recent text-like sandbox files into new notes. */
export async function runAgentFilesIngest(goal: string): Promise<{
  answer: string
  citations: LibraryChatCitation[]
  created: Document[]
}> {
  const listed = await nlpFilesList({ recursive: true })
  const needle = goal.trim().toLowerCase()
  let entries = (listed.entries || []).filter(
    (item) => item.kind !== 'dir' && (item.textLike || TEXT_EXT.test(item.name || item.path)),
  )
  if (needle) {
    const matched = entries.filter(
      (item) =>
        item.path.toLowerCase().includes(needle) ||
        (item.name || '').toLowerCase().includes(needle),
    )
    if (matched.length) entries = matched
  }
  entries = entries.slice(0, 5)
  if (!entries.length) {
    return {
      answer: 'No text-like files found in the sandbox to import.',
      citations: [],
      created: [],
    }
  }

  const created: Document[] = []
  const lines: string[] = []
  for (const entry of entries) {
    try {
      const doc = await ingestSandboxFileToNote({ path: entry.path, activate: false })
      created.push(doc)
      lines.push(`- [[${doc.title}]] ← \`${entry.path}\``)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      lines.push(`- Failed \`${entry.path}\`: ${detail}`)
    }
  }

  return {
    answer: `**Imported ${created.length} file(s) into the library**\n\n${lines.join('\n')}`,
    citations: created.map((doc) => ({
      documentId: doc.id,
      title: doc.title,
      snippet: 'Imported from files/',
    })),
    created,
  }
}
