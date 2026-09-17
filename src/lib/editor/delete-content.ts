import type { Editor } from '@tiptap/react'
import i18n from '@/i18n'

const DELETABLE_NODE_TYPES = [
  'codeBlock',
  'blockquote',
  'horizontalRule',
  'image',
  'lottieAnimation',
  'bulletList',
  'orderedList',
  'taskList',
] as const

const HANDLE_DELETE_SKIP = new Set(['image', 'lottieAnimation', 'paragraph', 'heading'])

const HANDLE_DELETE_LABEL_KEYS: Record<string, string> = {
  listItem: 'editorActions.deleteListItem',
  taskItem: 'editorActions.deleteListItem',
  codeBlock: 'editorActions.deleteCodeBlock',
  blockquote: 'editorActions.deleteBlockquote',
  horizontalRule: 'editorActions.deleteHr',
  table: 'editorActions.deleteTable',
  bulletList: 'editorActions.deleteList',
  orderedList: 'editorActions.deleteList',
  taskList: 'editorActions.deleteChecklist',
}

export function hasEditorSelection(editor: Editor): boolean {
  return !editor.state.selection.empty
}

export function getHandleDeleteLabel(nodeName: string): string | null {
  if (HANDLE_DELETE_SKIP.has(nodeName)) return null
  const key = HANDLE_DELETE_LABEL_KEYS[nodeName] ?? 'editorActions.deleteBlock'
  return i18n.t(key)
}

export function deleteHandleTarget(editor: Editor, start: number, end: number, nodeName: string): boolean {
  if (getHandleDeleteLabel(nodeName) === null) return false
  if (nodeName === 'table') {
    return editor.chain().focus().setTextSelection(Math.min(start + 1, end - 1)).deleteTable().run()
  }
  return deleteBlockRange(editor, start, end)
}

export function getActiveBlockDeleteLabel(editor: Editor): string | null {
  if (editor.isActive('codeBlock')) return i18n.t('editorActions.deleteCodeBlock')
  if (editor.isActive('blockquote')) return i18n.t('editorActions.deleteBlockquote')
  if (editor.isActive('horizontalRule')) return i18n.t('editorActions.deleteHr')
  if (editor.isActive('image')) return i18n.t('editorActions.deleteImage')
  if (editor.isActive('lottieAnimation')) return i18n.t('editorActions.deleteLottie')
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

export function deleteBlockRange(editor: Editor, start: number, end: number): boolean {
  if (start < 0 || end <= start) return false
  return editor.chain().focus().deleteRange({ from: start, to: end }).run()
}
