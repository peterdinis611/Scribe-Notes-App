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

const TEXT_EXT = /\.(md|markdown|txt|csv|html|htm|rst|log)$/i
const CODE_EXT =
  /\.(rs|py|pyw|pyi|ts|tsx|js|jsx|mjs|cjs|go|java|kt|kts|swift|c|h|hh|hpp|cc|cpp|cxx|cs|rb|php|lua|r|sql|toml|ya?ml|xml|css|scss|sh|bash|zsh|ps1|graphql|gql|proto|vue|svelte|dart|scala|ex|exs|hs|clj|zig|nim|nix|tf|sol|diff|patch|json|jsonc|jsonl|ini|cfg|env)$/i

const LANG_BY_EXT: Record<string, string> = {
  rs: 'rust',
  py: 'python',
  pyw: 'python',
  pyi: 'python',
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  go: 'go',
  java: 'java',
  kt: 'kotlin',
  toml: 'toml',
  yml: 'yaml',
  yaml: 'yaml',
  json: 'json',
  jsonc: 'json',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  sql: 'sql',
  css: 'css',
  scss: 'scss',
}

function basename(path: string): string {
  return path.split(/[/\\]/).pop() || path
}

function titleFromPath(path: string): string {
  return basename(path).replace(TEXT_EXT, '').replace(CODE_EXT, '').trim() || basename(path)
}

function languageFromPath(path: string): string | null {
  const name = basename(path).toLowerCase()
  if (name === 'dockerfile' || name.startsWith('dockerfile.')) return 'dockerfile'
  if (name === 'makefile' || name === 'gnumakefile') return 'makefile'
  const ext = name.includes('.') ? name.split('.').pop()! : ''
  return LANG_BY_EXT[ext] ?? (CODE_EXT.test(path) ? ext || null : null)
}

function sourceToContentJson(code: string, language: string | null): string {
  return JSON.stringify({
    type: 'doc',
    content: [
      {
        type: 'codeBlock',
        attrs: { language: language || null },
        content: code ? [{ type: 'text', text: code }] : [],
      },
      { type: 'paragraph' },
    ],
  })
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

  const codeLang = languageFromPath(input.path)
  const looksMd = !codeLang && (TEXT_EXT.test(input.path) || /^#\s/m.test(text))
  const title = codeLang
    ? titleFromPath(input.path)
    : titleFromMarkdown(text, titleFromPath(input.path))
  const contentJson = codeLang
    ? sourceToContentJson(text, codeLang)
    : looksMd
      ? parseMarkdownToContentJson(text)
      : parseMarkdownToContentJson(
          text
            .split(/\n+/)
            .map((line) => line.trim())
            .filter(Boolean)
            .join('\n\n'),
        )

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
  followups?: string[]
}> {
  const listed = await nlpFilesList({ recursive: true })
  const needle = goal.trim().toLowerCase()
  let entries = (listed.entries || []).filter(
    (item) =>
      item.kind !== 'dir' &&
      (item.textLike ||
        TEXT_EXT.test(item.name || item.path) ||
        CODE_EXT.test(item.name || item.path)),
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
      answer:
        'No text/code files found in the sandbox to import. Put `.md`, `.py`, `.rs`, … under `files/` and start the Local Files API.',
      citations: [],
      created: [],
      followups: ['recipe:files_digest', 'teach:files'],
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
    answer: `**Imported ${created.length} file(s) into the library**\n\n${lines.join('\n')}\n\n_Tip: save a standing instruction (Teach) so the agent prefers these notes / files/ paths next time._`,
    citations: created.map((doc) => ({
      documentId: doc.id,
      title: doc.title,
      snippet: 'Imported from files/',
    })),
    created,
    followups: [
      'recipe:files_to_library',
      'recipe:weekly_review',
      'teach:files',
    ],
  }
}
