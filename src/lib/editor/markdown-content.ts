import type { JSONContent } from '@tiptap/core'
import { MarkdownManager } from '@tiptap/markdown'
import { getEditorExtensions } from '@/lib/editor/extensions'

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
  const doc = getMarkdownManager().parse(markdown)
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

export function titleFromMarkdown(markdown: string, fallback: string): string {
  const match = markdown.match(/^#\s+(.+)$/m)
  if (match?.[1]) {
    return match[1].trim()
  }
  return fallback
}

/** TipTap editor with Markdown extension exposes getMarkdown(). */
export function getEditorMarkdown(editor: { getMarkdown?: () => string; getJSON: () => JSONContent }): string {
  if (typeof editor.getMarkdown === 'function') {
    return editor.getMarkdown().trimEnd()
  }
  return serializeContentJsonToMarkdown(JSON.stringify(editor.getJSON()))
}
