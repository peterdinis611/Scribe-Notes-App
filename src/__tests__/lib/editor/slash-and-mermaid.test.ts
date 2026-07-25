import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'
import { MermaidDiagram } from '@/lib/editor/mermaid-extension'
import { MERMAID_DEFAULT_SOURCE } from '@/lib/editor/mermaid'
import { runSlashCommand, SLASH_COMMAND_DEFS, SlashCommands } from '@/lib/editor/slash-commands'
import { handleTauriEditorKeyDown, TauriInputFix } from '@/lib/editor/tauri-input-fix'
import { tiptapJsonToMarkdown } from '@/lib/export/markdown'
import { collectDocumentOutline } from '@/lib/editor/document-outline'

describe('slash command catalog', () => {
  it('includes mermaid among slash defs', () => {
    expect(SLASH_COMMAND_DEFS.some((item) => item.id === 'mermaid')).toBe(true)
  })
})

describe('runSlashCommand', () => {
  let editor: Editor | null = null

  afterEach(() => {
    editor?.destroy()
    editor = null
    document.body.replaceChildren()
  })

  it('inserts a mermaid diagram block', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)

    editor = new Editor({
      element: host,
      extensions: [StarterKit, MermaidDiagram],
      content: '<p></p>',
      editable: true,
    })

    runSlashCommand(editor as never, {
      id: 'mermaid',
      label: 'Mermaid',
      hint: 'Diagram',
    })

    const json = editor.getJSON()
    const mermaid = json.content?.find((node) => node.type === 'mermaidDiagram')
    expect(mermaid).toBeTruthy()
    expect(mermaid?.attrs?.source).toContain('flowchart')
  })
})

describe('mermaid export and outline', () => {
  it('exports mermaid as a fenced code block', () => {
    const source = 'flowchart TD\n  A --> B'
    const markdown = tiptapJsonToMarkdown(
      JSON.stringify({
        type: 'doc',
        content: [
          {
            type: 'mermaidDiagram',
            attrs: { source },
          },
        ],
      }),
      'Doc',
    )

    expect(markdown).toContain('```mermaid')
    expect(markdown).toContain('A --> B')
  })

  it('lists mermaid blocks in the document outline', () => {
    const editor = new Editor({
      extensions: [StarterKit, MermaidDiagram],
      content: {
        type: 'doc',
        content: [
          {
            type: 'mermaidDiagram',
            attrs: { source: MERMAID_DEFAULT_SOURCE },
          },
        ],
      },
    })

    const items = collectDocumentOutline(editor as never)
    expect(items.some((item) => item.kind === 'mermaidDiagram')).toBe(true)
    expect(items.find((item) => item.kind === 'mermaidDiagram')?.label).toBe('Mermaid')

    editor.destroy()
  })
})

describe('tauri input fix with active suggestion', () => {
  let editor: Editor | null = null

  afterEach(() => {
    editor?.destroy()
    editor = null
    document.body.replaceChildren()
  })

  it('does not steal Enter while slash suggestion decoration is active', async () => {
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
    handleTauriEditorKeyDown(
      view,
      new KeyboardEvent('keydown', { key: '/', code: 'Slash', bubbles: true, cancelable: true }),
    )

    await vi.waitFor(() => {
      expect(view.dom.querySelector('[data-decoration-id]')).toBeTruthy()
    })

    const before = editor.state.doc.textContent
    const handled = handleTauriEditorKeyDown(
      view,
      new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }),
    )

    expect(handled).toBe(false)
    expect(editor.state.doc.textContent).toBe(before)
  })
})
