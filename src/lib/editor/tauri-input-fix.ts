import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import {
  createParagraphNear,
  deleteSelection,
  joinBackward,
  joinForward,
  liftEmptyBlock,
  newlineInCode,
  selectNodeBackward,
  selectNodeForward,
  splitBlock,
} from '@tiptap/pm/commands'
import { splitListItem } from '@tiptap/pm/schema-list'

/**
 * Native contenteditable input is unreliable in the Tauri/WebKit webview.
 * Printable keys, Enter, Backspace and Delete are applied via ProseMirror
 * transactions instead (same path as programmatic insertContent).
 */
function isEnterKey(event: KeyboardEvent) {
  return (
    event.key === 'Enter' ||
    event.code === 'Enter' ||
    event.code === 'NumpadEnter' ||
    event.keyCode === 13
  )
}

function insertHardBreak(view: EditorView) {
  const hardBreak = view.state.schema.nodes.hardBreak
  if (!hardBreak) return false
  view.dispatch(view.state.tr.replaceSelectionWith(hardBreak.create()).scrollIntoView())
  return true
}

function splitOrInsertBlock(view: EditorView) {
  const { state, dispatch } = view

  if (newlineInCode(state, dispatch)) return true
  if (createParagraphNear(state, dispatch)) return true
  if (liftEmptyBlock(state, dispatch)) return true

  const listItem = state.schema.nodes.listItem
  if (listItem && splitListItem(listItem)(state, dispatch)) return true

  const taskItem = state.schema.nodes.taskItem
  if (taskItem && splitListItem(taskItem)(state, dispatch)) return true

  if (splitBlock(state, dispatch)) return true

  // Last resort: insert an empty paragraph after the current block so Enter
  // never becomes a silent preventDefault (ProseMirror captureKeyDown).
  const paragraph = state.schema.nodes.paragraph
  const { $from } = state.selection
  if (!paragraph || $from.depth < 1) return false

  const insertPos = $from.after(1)
  const node = paragraph.createAndFill()
  if (!node) return false

  const tr = state.tr.insert(insertPos, node)
  tr.setSelection(TextSelection.near(tr.doc.resolve(insertPos + 1)))
  dispatch(tr.scrollIntoView())
  return true
}

function handleBackspace(view: EditorView) {
  const { state, dispatch } = view
  if (deleteSelection(state, dispatch)) return true
  if (joinBackward(state, dispatch)) return true
  if (selectNodeBackward(state, dispatch)) return true
  return false
}

function handleDelete(view: EditorView) {
  const { state, dispatch } = view
  if (deleteSelection(state, dispatch)) return true
  if (joinForward(state, dispatch)) return true
  if (selectNodeForward(state, dispatch)) return true
  return false
}

function handlePrintable(view: EditorView, event: KeyboardEvent) {
  if (event.metaKey || event.ctrlKey || event.altKey) return false
  if (event.key.length !== 1 || event.key === '\n' || event.key === '\r') return false

  const { state } = view
  const { from, to } = state.selection
  const text = event.key

  if (view.someProp('handleTextInput', (f) => f(view, from, to, text))) {
    return true
  }

  view.dispatch(state.tr.insertText(text, from, to).scrollIntoView())
  return true
}

export const TauriInputFix = Extension.create({
  name: 'tauriInputFix',
  // Run before TipTap keymaps / suggestions so we own Enter in this webview.
  priority: 10_000,

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('tauriInputFix'),
        props: {
          handleKeyDown(view, event) {
            if (event.defaultPrevented || event.isComposing || event.key === 'Dead') return false
            if (!view.editable) return false

            if (isEnterKey(event)) {
              if (event.metaKey || event.ctrlKey || event.altKey) return false
              if (event.shiftKey) return insertHardBreak(view)
              return splitOrInsertBlock(view)
            }

            if (event.key === 'Backspace') {
              if (event.metaKey || event.ctrlKey || event.altKey) return false
              return handleBackspace(view)
            }

            if (event.key === 'Delete') {
              if (event.metaKey || event.ctrlKey || event.altKey) return false
              return handleDelete(view)
            }

            return handlePrintable(view, event)
          },
        },
      }),
    ]
  },
})
