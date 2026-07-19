import type { Editor } from '@tiptap/react'
import i18n from '@/i18n'

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
  if (editor.isActive('codeBlock')) return i18n.t('editorActions.deleteCodeBlock')
  if (editor.isActive('blockquote')) return i18n.t('editorActions.deleteBlockquote')
  if (editor.isActive('horizontalRule')) return i18n.t('editorActions.deleteHr')
  if (editor.isActive('image')) return i18n.t('editorActions.deleteImage')
  if (editor.isActive('bulletList')) return i18n.t('editorActions.deleteList')
  if (editor.isActive('orderedList')) return i18n.t('editorActions.deleteList')
  if (editor.isActive('taskList')) return i18n.t('editorActions.deleteChecklist')
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
