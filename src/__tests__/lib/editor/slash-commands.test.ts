import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SlashCommands } from '@/lib/editor/slash-commands'
import { TauriInputFix, handleTauriEditorKeyDown } from '@/lib/editor/tauri-input-fix'

function getSlashSuggestionState(editor: Editor) {
  for (const plugin of editor.state.plugins) {
    const key = (plugin as { key?: string }).key
    if (typeof key === 'string' && key.includes('slashCommandsSuggestion')) {
      return plugin.getState(editor.state) as {
        active?: boolean
        query?: string | null
        text?: string | null
      }
    }
  }
  for (const plugin of editor.state.plugins) {
    const state = plugin.getState(editor.state) as
      | { active?: boolean; text?: string | null; query?: string | null }
      | undefined
    if (state && typeof state === 'object' && 'active' in state && state.text === '/') {
      return state
    }
  }
  return null
}

describe('slash commands suggestion', () => {
  let editor: Editor | null = null

  afterEach(() => {
    editor?.destroy()
    editor = null
    document.body.replaceChildren()
  })

  it('activates suggestion after programmatic slash insert (Tauri path)', async () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    editor = new Editor({
      element: host,
      extensions: [TauriInputFix, StarterKit, SlashCommands.configure({})],
      content: '<p></p>',
      editable: true,
    })

    const view = editor.view
    view.focus()

    const event = new KeyboardEvent('keydown', {
      key: '/',
      code: 'Slash',
      bubbles: true,
      cancelable: true,
    })

    const handled = handleTauriEditorKeyDown(view, event)
    expect(handled).toBe(true)
    expect(editor.state.doc.textContent).toBe('/')

    await vi.waitFor(() => {
      const state = getSlashSuggestionState(editor!)
      expect(state?.active).toBe(true)
      expect(state?.query).toBe('')
    })
  })
})
