import type { Editor } from '@tiptap/react'

const DELETABLE_NODE_TYPES = [
  'codeBlock',
  'blockquote',
  'horizontalRule',
  'image',
  'bulletList',
  'orderedList',
  'taskList',
] as const

export function hasEditorSelection(editor: Editor): boolean {
  return !editor.state.selection.empty
}

export function getActiveBlockDeleteLabel(editor: Editor): string | null {
  if (editor.isActive('codeBlock')) return 'Odstrániť blok kódu'
  if (editor.isActive('blockquote')) return 'Odstrániť citáciu'
  if (editor.isActive('horizontalRule')) return 'Odstrániť oddeľovač'
  if (editor.isActive('image')) return 'Odstrániť obrázok'
  if (editor.isActive('bulletList')) return 'Odstrániť zoznam'
  if (editor.isActive('orderedList')) return 'Odstrániť zoznam'
  if (editor.isActive('taskList')) return 'Odstrániť checklist'
  return null
}

export function canDeleteCurrentBlock(editor: Editor): boolean {
  return getActiveBlockDeleteLabel(editor) !== null
}

export function deleteEditorSelection(editor: Editor): boolean {
  if (editor.state.selection.empty) return false
  return editor.chain().focus().deleteSelection().run()
}

export function deleteCurrentBlock(editor: Editor): boolean {
  for (const type of DELETABLE_NODE_TYPES) {
    if (editor.isActive(type)) {
      return editor.chain().focus().deleteNode(type).run()
    }
  }

  return editor.chain().focus().selectParentNode().deleteSelection().run()
}

export function shouldShowBlockBubble(editor: Editor): boolean {
  return canDeleteCurrentBlock(editor)
}
