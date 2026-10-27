import { mkdir, writeFile } from '@tauri-apps/plugin-fs'
import { join } from '@tauri-apps/api/path'
import type { DocumentSummary } from '@/lib/db/api'
import { getDocument, listOutgoingLinks } from '@/lib/db/api'
import { tiptapJsonToHtml } from '@/lib/export/html'
import { tiptapJsonToMarkdown } from '@/lib/export/markdown'
import { sanitizeFileStem } from '@/lib/filenames'
import { saveScopedFile, yieldForNativeDialog } from '@/lib/fs/scoped-dialog'

/** Collect note + up to `hops` outbound wiki-link neighbors (BFS). */
export async function collectWikiNeighborhood(
  rootId: string,
  hops = 2,
  maxNotes = 80,
): Promise<string[]> {
  const seen = new Set<string>([rootId])
  let frontier = [rootId]
  for (let depth = 0; depth < hops && frontier.length > 0; depth += 1) {
    const next: string[] = []
    for (const id of frontier) {
      const outbound = await listOutgoingLinks(id).catch(() => [])
      for (const doc of outbound) {
        if (seen.has(doc.id) || seen.size >= maxNotes) continue
        seen.add(doc.id)
        next.push(doc.id)
      }
      if (seen.size >= maxNotes) break
    }
    frontier = next
  }
  return [...seen]
}

/** Export a note subgraph as Markdown + HTML index (portable wiki pack). */
export async function exportWikiPack(args: {
  rootId: string
  rootTitle?: string
  hops?: number
  dialogTitle?: string
  documents?: DocumentSummary[]
}): Promise<string | null> {
  const hops = args.hops ?? 2
  const ids = await collectWikiNeighborhood(args.rootId, hops)
  if (ids.length === 0) return null

  // Caller usually closes Command Palette first — wait a frame so modal focus trap is gone.
  await yieldForNativeDialog()

  const packStem = `${sanitizeFileStem(args.rootTitle || 'wiki-pack')}-pack`
  const markerPath = await saveScopedFile({
    title: args.dialogTitle ?? 'Export wiki pack',
    defaultPath: `${packStem}.md`,
  })
  if (!markerPath) return null

  // Save panel returns a file path; build a sibling folder for the pack contents.
  const parent = markerPath.replace(/[/\\][^/\\]+$/, '')
  const folder = await join(parent, packStem)
  const notesDir = await join(folder, 'notes')
  const pagesDir = await join(folder, 'pages')
  await mkdir(notesDir, { recursive: true })
  await mkdir(pagesDir, { recursive: true })
  const readmePath = await join(folder, 'README.md')

  const indexLines = [
    `# Wiki pack — ${args.rootTitle?.trim() || 'Untitled'}`,
    '',
    `Notes within ${hops} hop(s) of the root:`,
    '',
  ]

  for (const id of ids) {
    const doc = await getDocument(id)
    if (!doc) continue
    const stem = sanitizeFileStem(doc.title || id)
    const md = tiptapJsonToMarkdown(doc.contentJson, doc.title)
    await writeFile(await join(notesDir, `${stem}.md`), new TextEncoder().encode(md))
    const fullHtml = tiptapJsonToHtml(doc.contentJson, doc.title, { includeTitleHeading: true })
    const bodyMatch = fullHtml.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
    const body = bodyMatch?.[1] ?? fullHtml
    await writeFile(
      await join(pagesDir, `${stem}.html`),
      new TextEncoder().encode(
        `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${doc.title}</title></head><body>${body}</body></html>`,
      ),
    )
    const mark = id === args.rootId ? ' (root)' : ''
    indexLines.push(`- [[notes/${stem}]]${mark}`)
  }

  await writeFile(readmePath, new TextEncoder().encode(`${indexLines.join('\n')}\n`))
  // Drop the placeholder file the save panel created (pack lives in the folder).
  if (markerPath !== readmePath) {
    try {
      const { remove } = await import('@tauri-apps/plugin-fs')
      await remove(markerPath)
    } catch {
      /* best-effort */
    }
  }
  return folder
}
