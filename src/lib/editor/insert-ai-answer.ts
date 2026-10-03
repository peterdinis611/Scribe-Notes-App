import type { Editor } from '@tiptap/react'
import { plainTextToTipTapContent } from '@/lib/editor/block-snippets'
import { editorRefs } from '@/store/editorRefs'

export type AgentApplyMode = 'callout' | 'checklist' | 'frontmatter'

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

function bulletLines(source: string): string[] {
  return stripAnswerMarkdown(source)
    .split(/\n+/)
    .map((line) => line.replace(/^#{1,6}\s+/, '').replace(/^[•*\-\d.)\s]+/, '').trim())
    .filter((line) => line.length >= 2)
    .slice(0, 24)
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

/** Insert answer lines as an unchecked task list at the end of the note. */
export function insertAiAnswerAsChecklist(answer: string): boolean {
  const editor = editorRefs.editor
  if (!editor || editor.isDestroyed) return false
  const lines = bulletLines(answer)
  if (!lines.length) return false

  return editor
    .chain()
    .focus('end')
    .insertContent({
      type: 'taskList',
      content: lines.map((text) => ({
        type: 'taskItem',
        attrs: { checked: false },
        content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
      })),
    })
    .run()
}

/** Insert a short “Agent notes” meta block near the top of the document. */
export function insertAiAnswerAsFrontmatter(
  answer: string,
  options?: { sourceTitle?: string | null },
): boolean {
  const editor = editorRefs.editor
  if (!editor || editor.isDestroyed) return false
  const body = stripAnswerMarkdown(answer).slice(0, 1200)
  if (!body) return false
  const label = options?.sourceTitle?.trim() || 'Agent'
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')

  return editor
    .chain()
    .focus('start')
    .insertContent([
      {
        type: 'callout',
        attrs: { variant: 'note' },
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: `${label} · ${stamp}`, marks: [{ type: 'bold' }] },
            ],
          },
          ...plainTextToTipTapContent(body),
        ],
      },
      { type: 'paragraph' },
    ])
    .run()
}

/** Replace the current selection (or insert at cursor) with rewritten plain text. */
export function replaceSelectionWithAnswer(answer: string): boolean {
  const editor = editorRefs.editor
  if (!editor || editor.isDestroyed) return false
  const body = stripAnswerMarkdown(answer)
  if (!body) return false
  if (editor.state.selection.empty) {
    return editor.chain().focus().insertContent(plainTextToTipTapContent(body)).run()
  }
  return editor.chain().focus().insertContent(plainTextToTipTapContent(body)).run()
}

export function applyAgentAnswer(
  answer: string,
  mode: AgentApplyMode = 'callout',
  options?: { sourceTitle?: string | null },
): boolean {
  if (mode === 'checklist') return insertAiAnswerAsChecklist(answer)
  if (mode === 'frontmatter') return insertAiAnswerAsFrontmatter(answer, options)
  return insertAiAnswerAsCallout(answer, options)
}

export function undoAgentApply(): boolean {
  const editor = editorRefs.editor
  if (!editor || editor.isDestroyed) return false
  return editor.chain().focus().undo().run()
}

export function requireOpenEditor(): Editor | null {
  const editor = editorRefs.editor
  if (!editor || editor.isDestroyed) return null
  return editor
}
