import type { Editor } from '@tiptap/react'
import { tiptapJsonToMarkdown } from '@/lib/export/markdown'
import { tiptapJsonToHtmlAsync } from '@/lib/export/html'
import { exportDocument } from '@/lib/db/api'
import type { PageSetup } from '@/lib/editor/page-setup'

/** Build a TipTap doc JSON string from the current selection (or null if empty). */
export function getSelectionContentJson(editor: Editor | null): string | null {
  if (!editor || editor.isDestroyed || editor.state.selection.empty) return null

  const slice = editor.state.selection.content()
  const nodes: unknown[] = []
  slice.content.forEach((node) => {
    nodes.push(node.toJSON())
  })

  if (nodes.length === 0) return null
  return JSON.stringify({ type: 'doc', content: nodes })
}

export async function exportEditorSelection(args: {
  editor: Editor | null
  title: string
  format: 'md' | 'pdf'
  pageSetup?: PageSetup
}): Promise<boolean> {
  const contentJson = getSelectionContentJson(args.editor)
  if (!contentJson) return false

  const excerptTitle = `${args.title} — excerpt`
  const markdown = tiptapJsonToMarkdown(contentJson, excerptTitle)
  const plainText = args.editor?.state.doc.textBetween(
    args.editor.state.selection.from,
    args.editor.state.selection.to,
    '\n',
  ) ?? markdown

  if (args.format === 'md') {
    await exportDocument('', plainText, excerptTitle, 'md', markdown)
    return true
  }

  const html = await tiptapJsonToHtmlAsync(contentJson, excerptTitle, {
    pageSetup: args.pageSetup,
    forPrint: true,
  })
  await exportDocument(html, plainText, excerptTitle, 'pdf', markdown, args.pageSetup)
  return true
}
