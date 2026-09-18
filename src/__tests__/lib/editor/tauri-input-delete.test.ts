import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import { afterEach, describe, expect, it } from 'vitest'
import { handleEditorBackspace, handleTauriEditorKeyDown, TauriInputFix } from '@/lib/editor/tauri-input-fix'

function createEditor(content: string) {
  return new Editor({
    extensions: [StarterKit],
    content,
  })
}

function findNodePos(editor: Editor, typeName: string) {
  let found: number | null = null
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === typeName) {
      found = pos
      return false
    }
    return true
  })
  return found
}

describe('editor delete after Escape', () => {
  let editor: Editor | null = null

  afterEach(() => {
    editor?.destroy()
    editor = null
  })

  it('deletes the previous block on Backspace instead of only selecting it', () => {
    editor = createEditor('<p>keep</p><hr><p></p>')
    const hrPos = findNodePos(editor, 'horizontalRule')
    expect(hrPos).not.toBeNull()

    const afterHr = hrPos! + editor.state.doc.nodeAt(hrPos!)!.nodeSize + 1
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, afterHr)))

    expect(handleEditorBackspace(editor.view)).toBe(true)
    expect(editor.getHTML()).not.toContain('<hr')
    expect(editor.state.doc.textContent).toContain('keep')
  })

  it('still joins two paragraphs instead of deleting the previous one', () => {
    editor = createEditor('<p>hello</p><p>world</p>')
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 8)))

    expect(handleEditorBackspace(editor.view)).toBe(true)
    expect(editor.state.doc.textContent).toBe('helloworld')
  })

  it('deletes consecutive empty paragraphs with repeated Backspace', () => {
    editor = createEditor('<p>keep</p><p></p><p></p><p></p>')
    editor.commands.focus('end')

    expect(handleEditorBackspace(editor.view)).toBe(true)
    expect(handleEditorBackspace(editor.view)).toBe(true)
    expect(handleEditorBackspace(editor.view)).toBe(true)

    expect(editor.getHTML()).toBe('<p>keep</p>')
  })

  it('applies rapid Backspace keydowns instead of swallowing the next line', () => {
    editor = new Editor({
      extensions: [TauriInputFix, StarterKit],
      content: '<p>keep</p><p></p><p></p>',
    })
    editor.commands.focus('end')

    const press = () => {
      const event = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true })
      editor!.view.someProp('handleKeyDown', (fn) => fn(editor!.view, event))
    }

    press()
    press()

    expect(editor.getHTML()).toBe('<p>keep</p>')
  })

  it('deletes consecutive hard-break lines with repeated Backspace', () => {
    editor = createEditor('<p>keep<br><br><br></p>')
    editor.commands.focus('end')

    expect(handleEditorBackspace(editor.view)).toBe(true)
    expect(handleEditorBackspace(editor.view)).toBe(true)
    expect(handleEditorBackspace(editor.view)).toBe(true)

    expect(editor.getHTML()).toBe('<p>keep</p>')
  })

  it('collapses a node selection on Escape so the next Backspace can delete', () => {
    editor = createEditor('<p>keep</p><hr><p></p>')
    const hrPos = findNodePos(editor, 'horizontalRule')
    expect(hrPos).not.toBeNull()

    editor.view.dispatch(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, hrPos!)),
    )
    expect(editor.state.selection).toBeInstanceOf(NodeSelection)

    const escaped = handleTauriEditorKeyDown(
      editor.view,
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    )
    expect(escaped).toBe(true)
    expect(editor.state.selection).toBeInstanceOf(TextSelection)

    expect(handleEditorBackspace(editor.view)).toBe(true)
    expect(editor.getHTML()).not.toContain('<hr')
  })
})
