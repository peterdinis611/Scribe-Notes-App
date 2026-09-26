import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import '@/i18n'
import {
  listBlockSnippets,
  listCustomBlockSnippets,
  plainTextToTipTapContent,
  removeCustomBlockSnippet,
  upsertCustomBlockSnippet,
} from '@/lib/editor/block-snippets'
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

  it('rejects empty custom block names', () => {
    expect(() =>
      upsertCustomBlockSnippet({
        name: '   ',
        plainText: 'body',
      }),
    ).toThrow(/name/i)
  })
})
