import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import '@/i18n'
import {
  captureSelectionAsSnippet,
  listBlockSnippets,
  listCustomBlockSnippets,
  plainTextToTipTapContent,
  removeCustomBlockSnippet,
  resolveSnippetInsertContent,
  upsertCustomBlockSnippet,
} from '@/lib/editor/block-snippets'
import { getBlockDefinition, insertBlock, listBlockDefinitions } from '@/lib/editor/block-registry'
import { Callout } from '@/lib/editor/callout'
import { listSlashCommands, runSlashCommand, SLASH_COMMAND_DEFS } from '@/lib/editor/slash-commands'
import { resetKvStoreForTests } from '@/lib/storage/kv'

describe('custom block snippets', () => {
  beforeEach(async () => {
    await resetKvStoreForTests()
  })

  afterEach(async () => {
    await resetKvStoreForTests()
  })

  it('lists built-in snippets by default', () => {
    const snippets = listBlockSnippets()
    expect(snippets.map((item) => item.id)).toEqual(['meeting-notes', 'decision'])
    expect(listCustomBlockSnippets()).toEqual([])
  })

  it('upserts and removes a custom block', () => {
    const saved = upsertCustomBlockSnippet({
      name: 'Weekly review',
      plainText: '## Wins\n\n- \n\n## Risks\n\n',
    })

    expect(saved.id.startsWith('custom-')).toBe(true)
    expect(saved.custom).toBe(true)
    expect(listCustomBlockSnippets()).toHaveLength(1)
    expect(listBlockSnippets().some((item) => item.id === saved.id)).toBe(true)

    expect(removeCustomBlockSnippet(saved.id)).toBe(true)
    expect(listCustomBlockSnippets()).toEqual([])
  })

  it('converts plain text into TipTap nodes', () => {
    const content = plainTextToTipTapContent('## Agenda\n\n- Item\n- [ ] Task\n**Bold** line')
    expect(content[0]).toMatchObject({ type: 'heading', attrs: { level: 2 } })
    expect(content.some((node) => node.type === 'bulletList')).toBe(true)
    expect(content.some((node) => node.type === 'taskList')).toBe(true)
    expect(content.at(-1)).toMatchObject({
      type: 'paragraph',
      content: expect.arrayContaining([
        expect.objectContaining({ text: 'Bold', marks: [{ type: 'bold' }] }),
      ]),
    })
  })

  it('prefers TipTap JSON content over plain text on insert resolve', () => {
    const saved = upsertCustomBlockSnippet({
      name: 'Rich',
      plainText: '## Ignored heading',
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'From JSON' }],
        },
        {
          type: 'callout',
          attrs: { variant: 'tip' },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Keep me' }] }],
        },
      ],
    })

    const nodes = resolveSnippetInsertContent(saved)
    expect(nodes).toHaveLength(2)
    expect(nodes[0]).toMatchObject({ type: 'heading', content: [{ text: 'From JSON' }] })
    expect(nodes[1]).toMatchObject({ type: 'callout', attrs: { variant: 'tip' } })
  })

  it('captures the editor selection as TipTap JSON', () => {
    const editor = new Editor({
      extensions: [StarterKit, Callout],
      content: {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: 'Agenda' }],
          },
          {
            type: 'callout',
            attrs: { variant: 'info' },
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Note' }] }],
          },
        ],
      },
    })

    editor.commands.selectAll()
    const captured = captureSelectionAsSnippet(editor)
    expect(captured).not.toBeNull()
    expect(captured?.plainText).toContain('Agenda')
    expect(captured?.content.some((node) => node.type === 'heading')).toBe(true)
    expect(captured?.content.some((node) => node.type === 'callout')).toBe(true)

    const saved = upsertCustomBlockSnippet({
      name: 'From selection',
      plainText: captured!.plainText,
      content: captured!.content,
    })

    expect(saved.content?.some((node) => node.type === 'callout')).toBe(true)
    editor.destroy()
  })
})

describe('block registry', () => {
  it('exposes slash-visible definitions used by the catalog', () => {
    const ids = listBlockDefinitions().map((item) => item.id)
    expect(ids).toContain('mermaid')
    expect(ids).toContain('custom-block')
    expect(ids).not.toContain('snippet-meeting')
    expect(getBlockDefinition('snippet-meeting')?.slash).toBe(false)
  })

  it('inserts via insertBlock without the slash switch', () => {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const editor = new Editor({
      element: host,
      extensions: [StarterKit],
      content: '<p></p>',
    })

    expect(insertBlock(editor as never, 'hr')).toBe(true)
    expect(editor.getJSON().content?.some((node) => node.type === 'horizontalRule')).toBe(true)
    editor.destroy()
    host.remove()
  })
})

describe('slash custom block catalog', () => {
  beforeEach(async () => {
    await resetKvStoreForTests()
  })

  afterEach(async () => {
    await resetKvStoreForTests()
    document.body.replaceChildren()
  })

  it('includes custom-block in slash defs', () => {
    expect(SLASH_COMMAND_DEFS.some((item) => item.id === 'custom-block')).toBe(true)
  })

  it('lists built-in snippets and newly saved custom blocks', () => {
    const before = listSlashCommands()
    expect(before.some((item) => item.id === 'custom-block')).toBe(true)
    expect(before.some((item) => item.id === 'snippet:meeting-notes')).toBe(true)
    expect(before.some((item) => item.id === 'snippet:decision')).toBe(true)

    const saved = upsertCustomBlockSnippet({
      name: 'Standup',
      plainText: '## Yesterday\n\n- \n',
    })

    const after = listSlashCommands()
    expect(after.some((item) => item.id === `snippet:${saved.id}`)).toBe(true)
    expect(after.find((item) => item.id === `snippet:${saved.id}`)?.label).toContain('Standup')
  })

  it('inserts a saved custom snippet into the editor', () => {
    const saved = upsertCustomBlockSnippet({
      name: 'Retro',
      plainText: '## What went well\n\n- ',
    })

    const editor = new Editor({
      extensions: [StarterKit],
      content: '<p></p>',
    })

    runSlashCommand(editor as never, {
      id: `snippet:${saved.id}`,
      label: saved.name,
      hint: 'custom',
    })

    expect(editor.getJSON().content?.some((node) => node.type === 'heading')).toBe(true)
    expect(editor.getText()).toContain('What went well')
    editor.destroy()
  })

  it('inserts a JSON snippet with nested blocks intact', () => {
    const saved = upsertCustomBlockSnippet({
      name: 'Callout pack',
      content: [
        {
          type: 'callout',
          attrs: { variant: 'warning' },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Careful' }] }],
        },
      ],
    })

    const editor = new Editor({
      extensions: [StarterKit, Callout],
      content: '<p></p>',
    })

    runSlashCommand(editor as never, {
      id: `snippet:${saved.id}`,
      label: saved.name,
      hint: 'custom',
    })

    const callout = editor.getJSON().content?.find((node) => node.type === 'callout')
    expect(callout?.attrs?.variant).toBe('warning')
    expect(editor.getText()).toContain('Careful')
    editor.destroy()
  })

  it('rejects empty custom block names', () => {
    expect(() =>
      upsertCustomBlockSnippet({
        name: '   ',
        plainText: 'body',
      }),
    ).toThrow(/name/i)
  })
})
