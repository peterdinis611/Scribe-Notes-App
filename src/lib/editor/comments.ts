import type { Editor } from '@tiptap/react'
import { createCommentThread } from '@/lib/db/api'
import { promptInput } from '@/lib/input-dialog'
import { toast } from '@/lib/toast'
import { store } from '@/store/index'
import {
  bumpCommentsVersion,
  setCommentsPanelOpen,
} from '@/store/documentsSlice'

function generateCommentId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `c-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** Prompts for a comment, persists the thread and anchors a mark on the current selection. */
export async function createCommentForSelection(editor: Editor): Promise<void> {
  const { activeDocumentId: documentId, commentAuthor: author } = store.getState().documents
  if (!documentId) return

  const { from, to } = editor.state.selection
  const quote = editor.state.doc.textBetween(from, to, ' ').trim().slice(0, 280)

  const body = await promptInput({
    title: 'Nový komentár',
    description: quote ? `“${quote.slice(0, 120)}”` : undefined,
    placeholder: 'Napíšte komentár…',
    confirmLabel: 'Pridať',
  })
  if (!body?.trim()) return

  const commentId = generateCommentId()

  editor.chain().focus().setComment({ commentId }).run()

  try {
    await createCommentThread({ id: commentId, documentId, quote, author, body: body.trim() })
    store.dispatch(bumpCommentsVersion())
    store.dispatch(setCommentsPanelOpen(true))
  } catch (error) {
    editor.chain().focus().removeCommentById({ commentId }).run()
    toast.error('Nepodarilo sa pridať komentár', String(error))
  }
}

/** Returns the document positions of the first mark belonging to a comment thread. */
export function findCommentRange(
  editor: Editor,
  commentId: string,
): { from: number; to: number } | null {
  const markType = editor.state.schema.marks.comment
  if (!markType) return null

  let range: { from: number; to: number } | null = null
  editor.state.doc.descendants((node, pos) => {
    if (range) return false
    if (!node.isText) return
    const hasMark = node.marks.some(
      (mark) => mark.type === markType && mark.attrs.commentId === commentId,
    )
    if (hasMark) {
      range = { from: pos, to: pos + node.nodeSize }
      return false
    }
  })

  return range
}

/** Selects and scrolls the editor to a comment thread's anchor. */
export function focusComment(editor: Editor, commentId: string): boolean {
  const range = findCommentRange(editor, commentId)
  if (!range) return false

  editor
    .chain()
    .focus()
    .setTextSelection(range)
    .scrollIntoView()
    .run()

  const dom = editor.view.domAtPos(range.from)?.node as HTMLElement | undefined
  const element = dom?.nodeType === 1 ? dom : dom?.parentElement
  element?.scrollIntoView?.({ behavior: 'smooth', block: 'center' })

  return true
}

/** Collects the set of comment thread ids currently present in the document. */
export function collectCommentIds(editor: Editor): Set<string> {
  const markType = editor.state.schema.marks.comment
  const ids = new Set<string>()
  if (!markType) return ids

  editor.state.doc.descendants((node) => {
    if (!node.isText) return
    for (const mark of node.marks) {
      if (mark.type === markType && mark.attrs.commentId) {
        ids.add(mark.attrs.commentId as string)
      }
    }
  })

  return ids
}
