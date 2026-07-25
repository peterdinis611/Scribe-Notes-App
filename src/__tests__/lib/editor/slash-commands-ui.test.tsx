import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { act, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SlashCommands } from '@/lib/editor/slash-commands'
import { TauriInputFix, handleTauriEditorKeyDown } from '@/lib/editor/tauri-input-fix'

function SlashHarness({ onReady }: { onReady: (editor: NonNullable<ReturnType<typeof useEditor>>) => void }) {
  const editor = useEditor({
    extensions: [TauriInputFix, StarterKit, SlashCommands.configure({})],
    content: '<p></p>',
    editable: true,
    immediatelyRender: true,
  })

  if (editor) onReady(editor)

  return <EditorContent editor={editor} />
}

describe('slash commands UI', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('mounts suggestion popup after typing /', async () => {
    let editor: ReturnType<typeof useEditor> = null

    render(
      <SlashHarness
        onReady={(current) => {
          editor = current
        }}
      />,
    )

    await waitFor(() => {
      expect(editor).toBeTruthy()
      expect(editor?.view).toBeTruthy()
    })

    await act(async () => {
      editor!.view.focus()
      handleTauriEditorKeyDown(
        editor!.view,
        new KeyboardEvent('keydown', { key: '/', code: 'Slash', bubbles: true, cancelable: true }),
      )
    })

    expect(editor!.state.doc.textContent).toBe('/')

    await waitFor(() => {
      const popup = document.body.querySelector('.react-renderer')
      expect(popup).toBeTruthy()
      expect(popup?.textContent ?? '').toMatch(/H1|Nadpis|Heading|h1/i)
    })
  })
})
