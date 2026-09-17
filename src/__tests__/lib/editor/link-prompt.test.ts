import { describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { applyEditorLink } from '@/lib/editor/link-prompt'

function createEditor() {
  const editor = new Editor({
    extensions: [StarterKit, Link],
    content: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Hello', marks: [{ type: 'link', attrs: { href: 'https://old.example' } }] }],
        },
      ],
    },
  })
  editor.commands.setTextSelection({ from: 1, to: 6 })
  return editor
}

describe('applyEditorLink', () => {
  it('sets a link from the dialog value', () => {
    const editor = createEditor()
    applyEditorLink(editor, 'https://new.example')
    expect(editor.getAttributes('link').href).toBe('https://new.example')
    editor.destroy()
  })

  it('clears the link when the dialog submits empty', () => {
    const editor = createEditor()
    applyEditorLink(editor, '')
    expect(editor.isActive('link')).toBe(false)
    editor.destroy()
  })

  it('ignores cancel', () => {
    const editor = createEditor()
    applyEditorLink(editor, null)
    expect(editor.getAttributes('link').href).toBe('https://old.example')
    editor.destroy()
  })
})
