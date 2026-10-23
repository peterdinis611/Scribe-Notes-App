import { mkdir, readDir, readTextFile, writeFile } from '@tauri-apps/plugin-fs'
import { join } from '@tauri-apps/api/path'
import type { Document, DocumentSummary } from '@/lib/db/api'
import { createDocument, getDocument, pickAndGrantPath, setDocumentTags } from '@/lib/db/api'
import { cacheDocument } from '@/lib/cache/document-cache'
import {
  parseMarkdownToContentJsonAsync,
  titleFromMarkdown,
} from '@/lib/editor/markdown-content'
import { tiptapJsonToMarkdown } from '@/lib/export/markdown'
import { sanitizeFileStem } from '@/lib/filenames'
import { saveScopedFile } from '@/lib/fs/scoped-dialog'

const MD_EXT = /\.(md|markdown)$/i
const MAX_VAULT_FILES = 400

function stripFrontmatter(raw: string): { body: string; tags: string[] } {
  if (!raw.startsWith('---')) return { body: raw, tags: [] }
  const end = raw.indexOf('\n---', 3)
  if (end < 0) return { body: raw, tags: [] }
  const fm = raw.slice(3, end)
  const body = raw.slice(end + 4).replace(/^\s*\n/, '')
  const tags: string[] = []
  const tagsMatch = fm.match(/tags:\s*(\[[^\]]*\]|.*)$/m)
  if (tagsMatch?.[1]) {
    try {
      const parsed = JSON.parse(tagsMatch[1].trim()) as unknown
      if (Array.isArray(parsed)) {
        for (const tag of parsed) {
          if (typeof tag === 'string' && tag.trim()) tags.push(tag.trim())
        }
      }
    } catch {
      for (const part of tagsMatch[1].split(/[,#]/)) {
        const tag = part.trim().replace(/^\[|\]$/g, '')
        if (tag) tags.push(tag)
      }
    }
  }
  return { body, tags }
}

async function collectMarkdownFiles(dir: string, depth = 0): Promise<string[]> {
  if (depth > 4) return []
  const entries = await readDir(dir)
  const out: string[] = []
  for (const entry of entries) {
    const name = entry.name ?? ''
    if (!name || name.startsWith('.')) continue
    const path = await join(dir, name)
    if (entry.isDirectory) {
      out.push(...(await collectMarkdownFiles(path, depth + 1)))
    } else if (MD_EXT.test(name)) {
      out.push(path)
    }
    if (out.length >= MAX_VAULT_FILES) break
  }
  return out.slice(0, MAX_VAULT_FILES)
}

/** One-shot export of the library as a Markdown folder (Obsidian-friendly). */
export async function exportMarkdownVault(args: {
  documents: DocumentSummary[]
  dialogTitle?: string
}): Promise<string | null> {
  const live = args.documents.filter((doc) => !doc.deletedAt).slice(0, 500)
  if (live.length === 0) return null

  const markerPath = await saveScopedFile({
    title: args.dialogTitle ?? 'Export Markdown vault',
    defaultPath: 'scribe-vault/README.md',
  })
  if (!markerPath) return null

  const folder = markerPath.replace(/[/\\][^/\\]+$/, '')
  const notesDir = await join(folder, 'notes')
  await mkdir(notesDir, { recursive: true })

  const indexLines = ['# Scribe Markdown vault', '', 'Notes:', '']
  for (const summary of live) {
    const doc = await getDocument(summary.id)
    if (!doc) continue
    const stem = sanitizeFileStem(doc.title || summary.id)
    const fileName = `${stem}.md`
    const markdown = tiptapJsonToMarkdown(doc.contentJson, doc.title)
    const docTags = doc.tags ?? summary.tags ?? []
    const tags = docTags.map((tag: string) => `#${tag.replace(/\s+/g, '-')}`).join(' ')
    const body = tags
      ? `---\ntitle: ${JSON.stringify(doc.title)}\ntags: ${JSON.stringify(docTags)}\n---\n\n${markdown}`
      : markdown
    await writeFile(await join(notesDir, fileName), new TextEncoder().encode(body))
    indexLines.push(`- [[notes/${stem}]] — ${doc.title.trim() || 'Untitled'}`)
  }

  await writeFile(markerPath, new TextEncoder().encode(`${indexLines.join('\n')}\n`))
  return folder
}

/** Import a Markdown vault folder (notes/ or any nested .md) into the library. */
export async function importMarkdownVault(args?: {
  dialogTitle?: string
}): Promise<{ folder: string; documents: Document[] } | null> {
  const folder = await pickAndGrantPath({
    title: args?.dialogTitle ?? 'Import Markdown vault',
    directory: true,
  })
  if (!folder) return null

  const notesSub = await join(folder, 'notes')
  let files: string[] = []
  try {
    files = await collectMarkdownFiles(notesSub)
  } catch {
    files = []
  }
  if (files.length === 0) {
    files = await collectMarkdownFiles(folder)
  }
  files = files.filter((path) => !/README\.md$/i.test(path))

  const documents: Document[] = []
  for (const path of files) {
    const raw = await readTextFile(path)
    const { body, tags } = stripFrontmatter(raw)
    const fallback =
      path
        .split(/[/\\]/)
        .pop()
        ?.replace(MD_EXT, '')
        .trim() || 'Imported note'
    const title = titleFromMarkdown(body, fallback)
    const contentJson = await parseMarkdownToContentJsonAsync(body)
    let doc = cacheDocument(
      await createDocument({
        title,
        contentJson,
      }),
    )
    if (tags.length > 0) {
      await setDocumentTags(doc.id, tags)
      doc = { ...doc, tags }
      cacheDocument(doc)
    }
    documents.push(doc)
  }

  return { folder, documents }
}
