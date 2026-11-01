import type { Editor } from '@tiptap/react'
import { plainTextToTipTapContent } from '@/lib/editor/block-snippets'
import { editorRefs } from '@/store/editorRefs'

export type AgentApplyMode = 'callout' | 'checklist' | 'frontmatter' | 'cursor' | 'section'

/** Strip light markdown so callout body stays readable. Canonical: `scribe_ui::strip_answer_markdown`. */
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

/** Insert plain answer at the current cursor (or replace selection). */
export function insertAiAnswerAtCursor(answer: string): boolean {
  const editor = editorRefs.editor
  if (!editor || editor.isDestroyed) return false
  const body = stripAnswerMarkdown(answer)
  if (!body) return false
  return editor.chain().focus().insertContent(plainTextToTipTapContent(body)).run()
}

/** Append a markdown section (`## title` + body) at the end of the note. */
export function insertAiAnswerAsSection(
  answer: string,
  options?: { title?: string | null; sourceTitle?: string | null },
): boolean {
  const editor = editorRefs.editor
  if (!editor || editor.isDestroyed) return false
  const body = stripAnswerMarkdown(answer)
  if (!body) return false
  const heading =
    options?.title?.trim() ||
    options?.sourceTitle?.trim() ||
    'Agent'
  const nodes = [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: heading }],
    },
    ...plainTextToTipTapContent(body),
    { type: 'paragraph' },
  ]
  return editor.chain().focus('end').insertContent(nodes).run()
}

/**
 * Replace the first occurrence of `matchText` with the answer.
 * Falls back to current selection / cursor insert when the span is missing.
 */
export function replaceMatchOrSelectionWithAnswer(
  answer: string,
  matchText?: string | null,
): boolean {
  const editor = editorRefs.editor
  if (!editor || editor.isDestroyed) return false
  const body = stripAnswerMarkdown(answer)
  if (!body) return false
  const needle = matchText?.trim()
  if (needle) {
    let done = false
    editor.state.doc.descendants((node, pos) => {
      if (done || !node.isText) return
      const text = node.text ?? ''
      const index = text.indexOf(needle)
      if (index < 0) return
      const from = pos + index
      const to = from + needle.length
      done = editor.chain().focus().insertContentAt({ from, to }, plainTextToTipTapContent(body)).run()
    })
    if (done) return true
  }
  return replaceSelectionWithAnswer(answer)
}

/** Replace the current selection (or insert at cursor) with rewritten plain text. */
export function replaceSelectionWithAnswer(answer: string): boolean {
  const editor = editorRefs.editor
  if (!editor || editor.isDestroyed) return false
  const body = stripAnswerMarkdown(answer)
  if (!body) return false
  return editor.chain().focus().insertContent(plainTextToTipTapContent(body)).run()
}

export function applyAgentAnswer(
  answer: string,
  mode: AgentApplyMode = 'callout',
  options?: { sourceTitle?: string | null; sectionTitle?: string | null },
): boolean {
  if (mode === 'checklist') return insertAiAnswerAsChecklist(answer)
  if (mode === 'frontmatter') return insertAiAnswerAsFrontmatter(answer, options)
  if (mode === 'cursor') return insertAiAnswerAtCursor(answer)
  if (mode === 'section') {
    return insertAiAnswerAsSection(answer, {
      title: options?.sectionTitle,
      sourceTitle: options?.sourceTitle,
    })
  }
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

/** Live editor selection text for agent rewrite/simplify. */
export function getEditorSelectionText(): string {
  const editor = requireOpenEditor()
  if (!editor) return ''
  const { from, to, empty } = editor.state.selection
  if (empty) return ''
  return editor.state.doc.textBetween(from, to, '\n').trim()
}
