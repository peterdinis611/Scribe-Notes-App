import { Extension } from '@tiptap/core'
import { NodeSelection, Plugin, PluginKey, TextSelection, Selection } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import {
  createParagraphNear,
  deleteSelection,
  joinBackward,
  joinForward,
  liftEmptyBlock,
  newlineInCode,
  setBlockType,
  splitBlock,
} from '@tiptap/pm/commands'
import { liftListItem, splitListItem, wrapInList } from '@tiptap/pm/schema-list'

/**
 * Native contenteditable input is unreliable in the Tauri/WebKit webview.
 * Printable keys, Enter, Backspace and Delete are applied via ProseMirror
 * transactions instead (same path as programmatic insertContent).
 */
export function isEnterKey(event: KeyboardEvent) {
  return (
    event.key === 'Enter' ||
    event.code === 'Enter' ||
    event.code === 'NumpadEnter' ||
    event.keyCode === 13
  )
}

export function insertHardBreak(view: EditorView) {
  const hardBreak = view.state.schema.nodes.hardBreak
  if (!hardBreak) return false
  view.dispatch(view.state.tr.replaceSelectionWith(hardBreak.create()).scrollIntoView())
  return true
}

/** Convert markdown markers on the current line when Enter is pressed. */
function tryMarkdownEnterShortcuts(view: EditorView) {
  const { state, dispatch } = view
  const { $from, empty } = state.selection
  if (!empty || !$from.parent.isTextblock) return false
  if ($from.parent.type.spec.code) return false
  if ($from.parentOffset !== $from.parent.content.size) return false

  const start = $from.start()
  const text = $from.parent.textContent
  const trimmed = text.trim()
  const { horizontalRule, bulletList, orderedList, paragraph } = state.schema.nodes

  if (horizontalRule && /^(---|___|\*\*\*)$/.test(trimmed)) {
    const before = $from.before()
    const after = $from.after()
    const nodes = [horizontalRule.create()]
    if (paragraph) nodes.push(paragraph.create())
    const tr = state.tr.replaceWith(before, after, nodes)
    tr.setSelection(TextSelection.near(tr.doc.resolve(before + nodes[0].nodeSize + 1)))
    dispatch(tr.scrollIntoView())
    return true
  }

  if (bulletList && (trimmed === '-' || trimmed === '*' || trimmed === '+')) {
    dispatch(state.tr.delete(start, $from.pos).scrollIntoView())
    return wrapInList(bulletList)(view.state, view.dispatch)
  }

  if (orderedList && (trimmed === '.' || /^\d+\.$/.test(trimmed))) {
    dispatch(state.tr.delete(start, $from.pos).scrollIntoView())
    return wrapInList(orderedList)(view.state, view.dispatch)
  }

  return false
}

export function splitOrInsertBlock(view: EditorView) {
  if (tryMarkdownEnterShortcuts(view)) return true

  const { state, dispatch } = view

  if (newlineInCode(state, dispatch)) return true
  if (createParagraphNear(state, dispatch)) return true
  if (liftEmptyBlock(state, dispatch)) return true

  const listItem = state.schema.nodes.listItem
  if (listItem && splitListItem(listItem)(state, dispatch)) return true

  const taskItem = state.schema.nodes.taskItem
  if (taskItem && splitListItem(taskItem)(state, dispatch)) return true

  if (splitBlock(state, dispatch)) return true

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

function liftActiveListItem(view: EditorView) {
  const { state, dispatch } = view
  const listItem = state.schema.nodes.listItem
  if (listItem && liftListItem(listItem)(state, dispatch)) return true
  const taskItem = state.schema.nodes.taskItem
  if (taskItem && liftListItem(taskItem)(state, dispatch)) return true
  return false
}

/** Empty heading/code/etc. at block start → turn into paragraph (TipTap clearNodes subset). */
function clearBlockTypeAtStart(view: EditorView) {
  const { state, dispatch } = view
  const { $from, empty } = state.selection
  if (!empty || !$from.parent.isTextblock) return false
  if ($from.parentOffset !== 0) return false
  if ($from.parent.textContent.length > 0) return false
  if ($from.parent.type.name === 'paragraph') return false

  const atDocStart = Selection.atStart(state.doc).from === $from.pos
  if (!atDocStart) return false

  const paragraph = state.schema.nodes.paragraph
  if (!paragraph) return false
  return setBlockType(paragraph)(state, dispatch)
}

function deleteRange(view: EditorView, from: number, to: number) {
  if (from === to) return false
  view.dispatch(view.state.tr.delete(from, to).scrollIntoView())
  return true
}

/**
 * Delete the block before/after the caret instead of only selecting it.
 * Selecting first + Escape left a caret that could not finish the delete.
 */
function isAtomicBlock(node: { isAtom: boolean; isLeaf: boolean; isTextblock: boolean }) {
  return node.isAtom || (node.isLeaf && !node.isTextblock)
}

function deleteAdjacentBlock(view: EditorView, direction: 'backward' | 'forward') {
  const { state, dispatch } = view
  const { $head, empty } = state.selection
  if (!empty) return false

  const backward = direction === 'backward'
  if ($head.parent.isTextblock) {
    const atEdge = backward
      ? view.endOfTextblock('backward', state) || $head.parentOffset === 0
      : view.endOfTextblock('forward', state) || $head.parentOffset === $head.parent.content.size
    if (!atEdge) return false
  }

  const $cut = $head.parent.isTextblock
    ? state.doc.resolve(backward ? $head.before() : $head.after())
    : $head
  const node = backward ? $cut.nodeBefore : $cut.nodeAfter
  if (!node || !isAtomicBlock(node)) return false

  const from = backward ? $cut.pos - node.nodeSize : $cut.pos
  const to = backward ? $cut.pos : $cut.pos + node.nodeSize
  dispatch(state.tr.delete(from, to).scrollIntoView())
  return true
}

function finishJoinIfNodeSelected(view: EditorView, joined: boolean) {
  if (!joined) return false
  if (view.state.selection instanceof NodeSelection) {
    return deleteSelection(view.state, view.dispatch.bind(view))
  }
  return true
}

function deleteEmptyTextblockBackward(view: EditorView) {
  const { state, dispatch } = view
  const { $from, empty } = state.selection
  if (!empty || $from.parentOffset !== 0) return false
  if (!$from.parent.isTextblock || $from.parent.content.size > 0) return false

  const from = $from.before()
  const to = $from.after()
  if (from <= 0 && to >= state.doc.content.size) return false

  const tr = state.tr.delete(from, to)
  const pos = Math.min(Math.max(from, 1), tr.doc.content.size)
  tr.setSelection(TextSelection.near(tr.doc.resolve(pos), -1))
  dispatch(tr.scrollIntoView())
  return true
}

function collapseNodeSelection(view: EditorView) {
  const { state, dispatch } = view
  if (!(state.selection instanceof NodeSelection)) return false
  dispatch(state.tr.setSelection(TextSelection.near(state.doc.resolve(state.selection.to))))
  view.focus()
  return true
}

/** Delete one code point / atom node before the cursor. */
function deleteCharBackward(view: EditorView) {
  const { state } = view
  const { $from, empty } = state.selection
  if (!empty) return deleteSelection(state, view.dispatch.bind(view))

  if ($from.parentOffset === 0) return false

  const before = $from.nodeBefore
  if (before && !before.isText) {
    return deleteRange(view, $from.pos - before.nodeSize, $from.pos)
  }

  // Delete one UTF-16 code unit; good enough for BMP. Surrogate pairs: delete 2.
  const text = before?.text
  let size = 1
  if (text && text.length >= 2) {
    const last = text.charCodeAt(text.length - 1)
    const prev = text.charCodeAt(text.length - 2)
    if (last >= 0xdc00 && last <= 0xdfff && prev >= 0xd800 && prev <= 0xdbff) {
      size = 2
    }
  }
  return deleteRange(view, $from.pos - size, $from.pos)
}

/** Delete one code point / atom node after the cursor. */
function deleteCharForward(view: EditorView) {
  const { state } = view
  const { $from, empty } = state.selection
  if (!empty) return deleteSelection(state, view.dispatch.bind(view))

  if ($from.parentOffset === $from.parent.content.size) return false

  const after = $from.nodeAfter
  if (after && !after.isText) {
    return deleteRange(view, $from.pos, $from.pos + after.nodeSize)
  }

  const text = after?.text
  let size = 1
  if (text && text.length >= 2) {
    const first = text.charCodeAt(0)
    const second = text.charCodeAt(1)
    if (first >= 0xd800 && first <= 0xdbff && second >= 0xdc00 && second <= 0xdfff) {
      size = 2
    }
  }
  return deleteRange(view, $from.pos, $from.pos + size)
}

function deleteWordBackward(view: EditorView) {
  const { state } = view
  const { $from, empty } = state.selection
  if (!empty) return deleteSelection(state, view.dispatch.bind(view))
  if ($from.parentOffset === 0) return false

  const text = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc')
  const match = text.match(/(\s+|\S+)$/)
  const size = match?.[0]?.length ?? 1
  return deleteRange(view, $from.pos - size, $from.pos)
}

function deleteWordForward(view: EditorView) {
  const { state } = view
  const { $from, empty } = state.selection
  if (!empty) return deleteSelection(state, view.dispatch.bind(view))
  if ($from.parentOffset === $from.parent.content.size) return false

  const text = $from.parent.textBetween($from.parentOffset, $from.parent.content.size, undefined, '\ufffc')
  const match = text.match(/^(\s+|\S+)/)
  const size = match?.[0]?.length ?? 1
  return deleteRange(view, $from.pos, $from.pos + size)
}

function deleteToBlockStart(view: EditorView) {
  const { state } = view
  const { $from, empty } = state.selection
  if (!empty) return deleteSelection(state, view.dispatch.bind(view))
  if ($from.parentOffset === 0) return false
  return deleteRange(view, $from.start(), $from.pos)
}

function deleteToBlockEnd(view: EditorView) {
  const { state } = view
  const { $from, empty } = state.selection
  if (!empty) return deleteSelection(state, view.dispatch.bind(view))
  if ($from.parentOffset === $from.parent.content.size) return false
  return deleteRange(view, $from.pos, $from.end())
}

export function handleEditorBackspace(view: EditorView, event?: KeyboardEvent): boolean {
  const { state, dispatch } = view

  if (event?.metaKey || event?.ctrlKey) {
    return deleteToBlockStart(view)
  }
  if (event?.altKey) {
    return deleteWordBackward(view) || handleEditorBackspace(view)
  }

  if (!state.selection.empty) {
    return deleteSelection(state, dispatch)
  }

  const { $from } = state.selection
  if ($from.parentOffset === 0) {
    if (clearBlockTypeAtStart(view)) return true
    if (deleteAdjacentBlock(view, 'backward')) return true
    if (finishJoinIfNodeSelected(view, joinBackward(state, dispatch))) return true
    if (deleteEmptyTextblockBackward(view)) return true
    if (liftActiveListItem(view)) return true
    return false
  }

  return deleteCharBackward(view)
}

export function handleEditorDelete(view: EditorView, event?: KeyboardEvent): boolean {
  const { state, dispatch } = view

  if (event?.metaKey || event?.ctrlKey) {
    return deleteToBlockEnd(view)
  }
  if (event?.altKey) {
    return deleteWordForward(view) || handleEditorDelete(view)
  }

  if (!state.selection.empty) {
    return deleteSelection(state, dispatch)
  }

  const { $from } = state.selection
  if ($from.parentOffset === $from.parent.content.size) {
    if (deleteAdjacentBlock(view, 'forward')) return true
    return finishJoinIfNodeSelected(view, joinForward(state, dispatch))
  }

  return deleteCharForward(view)
}

export function handleEditorPrintable(view: EditorView, event: KeyboardEvent): boolean {
  if (event.metaKey || event.ctrlKey || event.altKey) return false
  if (event.key.length !== 1 || event.key === '\n' || event.key === '\r') return false

  const { state } = view
  const { from, to } = state.selection
  const text = event.key

  if (
    view.someProp('handleTextInput', (f) =>
      f(view, from, to, text, () => state.tr.insertText(text, from, to)),
    )
  ) {
    return true
  }

  view.dispatch(state.tr.insertText(text, from, to).scrollIntoView())
  return true
}

/** Shared keydown path for editorProps (checked first) and the extension plugin. */
/** TipTap Suggestion decorations — let the palette handle Enter/arrows/Esc. */
function hasActiveSuggestion(view: EditorView) {
  return Boolean(view.dom.querySelector('[data-decoration-id]'))
}

export function handleTauriEditorKeyDown(view: EditorView, event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing || event.key === 'Dead') return false
  if (!view.editable) return false

  // Don't steal keys the slash/emoji/wiki suggestion UI needs.
  if (
    hasActiveSuggestion(view) &&
    (isEnterKey(event) ||
      event.key === 'ArrowUp' ||
      event.key === 'ArrowDown' ||
      event.key === 'Escape' ||
      event.key === 'Esc')
  ) {
    return false
  }

  if (event.key === 'Escape' || event.key === 'Esc') {
    return collapseNodeSelection(view)
  }

  if (isEnterKey(event)) {
    if (event.metaKey || event.ctrlKey || event.altKey) return false
    if (event.shiftKey) return insertHardBreak(view)
    return splitOrInsertBlock(view)
  }

  if (event.key === 'Backspace') {
    return handleEditorBackspace(view, event)
  }

  if (event.key === 'Delete') {
    return handleEditorDelete(view, event)
  }

  return handleEditorPrintable(view, event)
}

function handleDeleteInput(view: EditorView, inputType: string) {
  switch (inputType) {
    case 'deleteContentBackward':
    case 'deleteContent':
      return handleEditorBackspace(view)
    case 'deleteContentForward':
      return handleEditorDelete(view)
    case 'deleteWordBackward':
      return deleteWordBackward(view) || handleEditorBackspace(view)
    case 'deleteWordForward':
      return deleteWordForward(view) || handleEditorDelete(view)
    case 'deleteSoftLineBackward':
    case 'deleteHardLineBackward':
      return deleteToBlockStart(view) || handleEditorBackspace(view)
    case 'deleteSoftLineForward':
    case 'deleteHardLineForward':
      return deleteToBlockEnd(view) || handleEditorDelete(view)
    default:
      return false
  }
}

export const TauriInputFix = Extension.create({
  name: 'tauriInputFix',
  priority: 10_000,

  addProseMirrorPlugins() {
    let lastEnterSource: 'keydown' | 'beforeinput' | null = null
    let lastEnterHandledAt = 0
    let lastDeleteSource: 'keydown' | 'beforeinput' | null = null
    let lastDeleteHandledAt = 0
    const recently = (at: number) => Date.now() - at < 50

    return [
      new Plugin({
        key: new PluginKey('tauriInputFix'),
        props: {
          handleDOMEvents: {
            beforeinput(view, event) {
              if (!view.editable) return false
              const inputType = (event as InputEvent).inputType

              if (inputType === 'insertParagraph') {
                if (!(lastEnterSource === 'keydown' && recently(lastEnterHandledAt))) {
                  splitOrInsertBlock(view)
                  lastEnterSource = 'beforeinput'
                  lastEnterHandledAt = Date.now()
                }
                return true
              }
              if (inputType === 'insertLineBreak') {
                if (!(lastEnterSource === 'keydown' && recently(lastEnterHandledAt))) {
                  insertHardBreak(view)
                  lastEnterSource = 'beforeinput'
                  lastEnterHandledAt = Date.now()
                }
                return true
              }

              if (inputType.startsWith('delete')) {
                if (lastDeleteSource === 'keydown' && recently(lastDeleteHandledAt)) return true
                if (handleDeleteInput(view, inputType)) {
                  lastDeleteSource = 'beforeinput'
                  lastDeleteHandledAt = Date.now()
                  return true
                }
              }

              return false
            },
          },
          handleKeyDown(view, event) {
            if (isEnterKey(event) && lastEnterSource === 'beforeinput' && recently(lastEnterHandledAt)) {
              return true
            }
            if (
              (event.key === 'Backspace' || event.key === 'Delete') &&
              lastDeleteSource === 'beforeinput' &&
              recently(lastDeleteHandledAt)
            ) {
              return true
            }

            const handled = handleTauriEditorKeyDown(view, event)
            if (!handled) return false

            if (isEnterKey(event)) {
              lastEnterSource = 'keydown'
              lastEnterHandledAt = Date.now()
            }
            if (event.key === 'Backspace' || event.key === 'Delete') {
              lastDeleteSource = 'keydown'
              lastDeleteHandledAt = Date.now()
            }
            return true
          },
        },
      }),
    ]
  },
})
