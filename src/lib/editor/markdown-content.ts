import type { JSONContent } from '@tiptap/core'
import { MarkdownManager } from '@tiptap/markdown'
import { getEditorExtensions } from '@/lib/editor/extensions'
import {
  promoteMarkdownSpecialBlocks,
  promoteMarkdownSpecialBlocksAsync,
} from '@/lib/editor/markdown-promote'

let markdownManager: MarkdownManager | null = null

function getMarkdownManager(): MarkdownManager {
  if (!markdownManager) {
    markdownManager = new MarkdownManager({
      extensions: getEditorExtensions(),
    })
  }
  return markdownManager
}

export function parseMarkdownToContentJson(markdown: string): string {
  const doc = promoteMarkdownSpecialBlocks(getMarkdownManager().parse(markdown) as JSONContent)
  return JSON.stringify(doc)
}

/** Prefer Rust promote under Tauri after TipTap Markdown parse. */
export async function parseMarkdownToContentJsonAsync(markdown: string): Promise<string> {
  const parsed = getMarkdownManager().parse(markdown) as JSONContent
  const doc = await promoteMarkdownSpecialBlocksAsync(parsed)
  return JSON.stringify(doc)
}

export function serializeContentJsonToMarkdown(contentJson: string): string {
  let doc: JSONContent = { type: 'doc', content: [] }
  try {
    doc = JSON.parse(contentJson) as JSONContent
  } catch {
    return ''
  }
  return getMarkdownManager().serialize(doc).trimEnd()
}

/** Canonical: `scribe_ui::title_from_markdown` (Tauri `title_from_markdown_ui`). */
export function titleFromMarkdown(markdown: string, fallback: string): string {
  const match = markdown.match(/^#\s+(.+)$/m)
  if (match?.[1]) {
    return match[1].trim()
  }
  return fallback
}

/** TipTap editor with Markdown extension exposes getMarkdown(). */
export function getEditorMarkdown(editor: {
  getMarkdown?: () => string
  getJSON: () => JSONContent
}): string {
  if (typeof editor.getMarkdown === 'function') {
    return editor.getMarkdown().trimEnd()
  }
  return serializeContentJsonToMarkdown(JSON.stringify(editor.getJSON()))
}
