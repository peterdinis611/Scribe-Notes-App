import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  duplicateCustomBlockSnippet,
  exportCustomBlockSnippets,
  getBlockSnippet,
  importCustomBlockSnippets,
  insertAnyBlock,
  insertBlockSnippet,
  listBlockDefinitionsByGroup,
  listFavoriteBlockSnippets,
  patchCustomBlockSnippet,
  registerBlock,
  renameCustomBlockSnippet,
  searchBlockSnippets,
  setBlockSnippetFavorite,
  unregisterBlock,
  upsertCustomBlockSnippet,
} from '@/lib/editor/block-api'
import { resetKvStoreForTests } from '@/lib/storage/kv'

describe('block api extras', () => {
  beforeEach(async () => {
    await resetKvStoreForTests()
  })

  afterEach(async () => {
    await resetKvStoreForTests()
  })

  it('supports metadata, rename, favorite, duplicate, and search', () => {
    const saved = upsertCustomBlockSnippet({
      name: 'Standup',
      plainText: '## Yesterday\n\n- ',
      icon: '☀',
      hint: 'Daily sync',
      keywords: ['standup', 'daily'],
      favorite: true,
    })

    expect(saved.icon).toBe('☀')
    expect(saved.hint).toBe('Daily sync')
    expect(saved.keywords).toEqual(['standup', 'daily'])
    expect(listFavoriteBlockSnippets().some((item) => item.id === saved.id)).toBe(true)

    const renamed = renameCustomBlockSnippet(saved.id, 'Morning standup')
    expect(renamed.name).toBe('Morning standup')

    const copy = duplicateCustomBlockSnippet(saved.id)
    expect(copy.id).not.toBe(saved.id)
    expect(copy.name).toContain('copy')
    expect(copy.favorite).toBeFalsy()

    expect(searchBlockSnippets('daily').some((item) => item.id === saved.id)).toBe(true)
    expect(searchBlockSnippets('nope')).toEqual([])
  })

  it('patches and exports/imports custom snippets', () => {
    const saved = upsertCustomBlockSnippet({
      name: 'Retro',
      plainText: '## Keep\n',
    })
    const patched = patchCustomBlockSnippet(saved.id, {
      hint: 'Team retro',
      favorite: true,
      content: [
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: 'Keep' }],
        },
      ],
    })
    expect(patched.hint).toBe('Team retro')
    expect(patched.content?.[0]?.type).toBe('heading')

    const exported = exportCustomBlockSnippets()
    expect(exported.some((item) => item.id === saved.id)).toBe(true)

    const imported = importCustomBlockSnippets(exported)
    expect(imported.imported.length).toBeGreaterThan(0)
    expect(getBlockSnippet(imported.imported[0]!.id)).toBeTruthy()
  })

  it('inserts snippets with replaceSelection and supports insertAnyBlock', () => {
    const saved = upsertCustomBlockSnippet({
      name: 'Replace me',
      plainText: '## Replaced',
    })

    const editor = new Editor({
      extensions: [StarterKit],
      content: '<p>selected</p>',
    })
    editor.commands.selectAll()

    expect(
      insertBlockSnippet(editor as never, saved.id, {
        replaceSelection: true,
      }),
    ).toBe(true)
    expect(editor.getText()).toContain('Replaced')
    expect(editor.getText()).not.toContain('selected')

    expect(insertAnyBlock(editor as never, 'hr')).toBe(true)
    expect(editor.getJSON().content?.some((node) => node.type === 'horizontalRule')).toBe(true)

    editor.destroy()
  })

  it('lists registry groups and can unregister runtime blocks', () => {
    expect(listBlockDefinitionsByGroup('media').some((item) => item.id === 'video')).toBe(true)

    registerBlock({
      id: 'tmp-test-block',
      group: 'advanced',
      insert: (editor) => {
        editor.chain().focus().insertContent('tmp').run()
      },
    })
    expect(unregisterBlock('tmp-test-block')).toBe(true)
    expect(unregisterBlock('tmp-test-block')).toBe(false)
  })

  it('can favorite a built-in snippet override', () => {
    const next = setBlockSnippetFavorite('meeting-notes', true)
    expect(next.favorite).toBe(true)
    expect(listFavoriteBlockSnippets().some((item) => item.id === 'meeting-notes')).toBe(true)
  })
})
