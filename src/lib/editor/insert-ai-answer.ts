import type { Editor } from '@tiptap/react'
import { plainTextToTipTapContent } from '@/lib/editor/block-snippets'
import { editorRefs } from '@/store/editorRefs'

/** Strip light markdown so callout body stays readable. */
export function stripAnswerMarkdown(source: string): string {
  return source
    .replace(/^Based on (this document|your notes)(\s*\([^)]+\))?:\s*/i, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/^[•*-]\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function insertAiAnswerAsCallout(
  answer: string,
  options?: { sourceTitle?: string | null },
): boolean {
  const editor = editorRefs.editor
  if (!editor || editor.isDestroyed) return false

  const body = stripAnswerMarkdown(answer)
  if (!body) return false

  const paragraphs = plainTextToTipTapContent(body)
  const content =
    paragraphs.length > 0
      ? paragraphs
      : [{ type: 'paragraph', content: [{ type: 'text', text: body }] }]

  const source = options?.sourceTitle?.trim()
  if (source) {
    content.push({
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: `— ${source}`,
          marks: [{ type: 'italic' }],
        },
      ],
    })
  }

  return editor
    .chain()
    .focus('end')
    .insertContent({
      type: 'callout',
      attrs: { variant: 'info' },
      content,
    })
    .run()
}

export function requireOpenEditor(): Editor | null {
  const editor = editorRefs.editor
  if (!editor || editor.isDestroyed) return null
  return editor
}
