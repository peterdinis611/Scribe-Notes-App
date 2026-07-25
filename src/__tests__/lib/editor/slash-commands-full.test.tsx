import { EditorContent, useEditor } from '@tiptap/react'
import { act, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { getEditorExtensions } from '@/lib/editor/extensions'
import { handleTauriEditorKeyDown } from '@/lib/editor/tauri-input-fix'

function FullHarness({ onReady }: { onReady: (editor: NonNullable<ReturnType<typeof useEditor>>) => void }) {
  const editor = useEditor({
    extensions: getEditorExtensions({}),
    content: '<p></p>',
    editable: true,
    immediatelyRender: true,
    editorProps: {
      handleKeyDown: handleTauriEditorKeyDown,
    },
  })

  if (editor) onReady(editor)

  return <EditorContent editor={editor} />
}

describe('slash commands with full extensions', () => {
  afterEach(() => {
    document.body.replaceChildren()
  })

  it('shows popup with full editor extension set', async () => {
    let editor: ReturnType<typeof useEditor> = null

    render(
      <FullHarness
        onReady={(current) => {
          editor = current
        }}
      />,
    )

    await waitFor(() => expect(editor?.view).toBeTruthy())

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
      expect((popup?.textContent ?? '').length).toBeGreaterThan(10)
    })
  })
})
