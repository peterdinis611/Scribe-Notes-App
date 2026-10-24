import { writeFile } from '@tauri-apps/plugin-fs'
import { sanitizeFileName } from '@/lib/filenames'
import { saveScopedFile } from '@/lib/fs/scoped-dialog'
import { revealInFinder, type ExportResult } from '@/lib/db/api'

type TipTapNode = {
  type?: string
  text?: string
  attrs?: { level?: number }
  content?: TipTapNode[]
}

function collectText(node: TipTapNode | undefined): string {
  if (!node) return ''
  if (node.type === 'text') return node.text ?? ''
  if (node.type === 'hardBreak') return '\n'
  return (node.content ?? []).map(collectText).join('')
}

function parseDoc(contentJson: string): TipTapNode {
  try {
    return JSON.parse(contentJson) as TipTapNode
  } catch {
    return { type: 'doc', content: [] }
  }
}

/** Structured JSON export (blocks + full TipTap doc). */
export function documentToStructuredJson(contentJson: string, title: string): string {
  const doc = parseDoc(contentJson)
  const blocks: Array<{ type: string; text: string; level?: number }> = []
  for (const node of doc.content ?? []) {
    const text = collectText(node).trim()
    if (!text) continue
    const type = node.type ?? 'paragraph'
    const block: { type: string; text: string; level?: number } = { type, text }
    if (type === 'heading' && typeof node.attrs?.level === 'number') {
      block.level = node.attrs.level
    }
    blocks.push(block)
  }
  return `${JSON.stringify(
    {
      title,
      format: 'scribe-structured',
      version: 1,
      blocks,
      content: doc,
    },
    null,
    2,
  )}\n`
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Flat OPML 2.0 outline from headings / paragraphs. */
export function documentToOpml(contentJson: string, title: string): string {
  const doc = parseDoc(contentJson)
  const lines: string[] = []
  for (const node of doc.content ?? []) {
    const text = collectText(node).trim()
    if (!text) continue
    const level =
      node.type === 'heading' && typeof node.attrs?.level === 'number' ? node.attrs.level : undefined
    const levelAttr = level != null ? ` _level="${level}"` : ''
    lines.push(`    <outline text="${escapeXml(text)}"${levelAttr} />`)
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>${escapeXml(title)}</title></head>
  <body>
${lines.join('\n')}
  </body>
</opml>
`
}

export async function exportDocumentAsStructuredJson(args: {
  contentJson: string
  title: string
  dialogTitle?: string
}): Promise<ExportResult | null> {
  const path = await saveScopedFile({
    title: args.dialogTitle ?? 'Export JSON',
    defaultPath: sanitizeFileName(args.title || 'document', 'json'),
  })
  if (!path) return null
  const bytes = new TextEncoder().encode(documentToStructuredJson(args.contentJson, args.title))
  await writeFile(path, bytes)
  await revealInFinder(path)
  return { path }
}

export async function exportDocumentAsOpml(args: {
  contentJson: string
  title: string
  dialogTitle?: string
}): Promise<ExportResult | null> {
  const path = await saveScopedFile({
    title: args.dialogTitle ?? 'Export OPML',
    defaultPath: sanitizeFileName(args.title || 'document', 'opml'),
  })
  if (!path) return null
  const bytes = new TextEncoder().encode(documentToOpml(args.contentJson, args.title))
  await writeFile(path, bytes)
  await revealInFinder(path)
  return { path }
}
