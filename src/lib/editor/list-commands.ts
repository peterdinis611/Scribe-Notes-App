import type { Editor } from '@tiptap/react'

function prepareBlockForList(editor: Editor) {
  const chain = editor.chain().focus()

  if (editor.isActive('heading')) {
    chain.setParagraph()
  }

  if (editor.isActive('blockquote')) {
    chain.lift('blockquote')
  }

  return chain
}

export function insertBulletList(editor: Editor) {
  prepareBlockForList(editor).toggleBulletList().run()
}

export function insertOrderedList(editor: Editor) {
  prepareBlockForList(editor).toggleOrderedList().run()
}

export function insertTaskList(editor: Editor) {
  prepareBlockForList(editor).toggleTaskList().run()
}

export function isInsideList(editor: Editor) {
  return (
    editor.isActive('bulletList') ||
    editor.isActive('orderedList') ||
    editor.isActive('taskList')
  )
}

export function shouldShowInsertMenu(editor: Editor, _dismissedBlockPos: number | null = null) {
  if (!editor.isEditable || editor.isActive('table') || isInsideList(editor)) {
    return false
  }

  const { $from } = editor.state.selection
  if (!$from.parent.isTextblock || $from.parent.textContent.length > 0) {
    return false
  }

  // Hide while slash command palette is active (user typed "/")
  if ($from.parent.textContent.startsWith('/')) {
    return false
  }

  return true
}
