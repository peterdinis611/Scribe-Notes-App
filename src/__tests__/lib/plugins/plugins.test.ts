import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { hasBlock, unregisterBlock } from '@/lib/editor/block-registry'
import { listSlashCommands } from '@/lib/editor/slash-commands'
import { bootstrapPlugins, resetPluginBootstrapForTests } from '@/lib/plugins/bootstrap'
import { listPluginCommands, resetPluginCommandsForTests } from '@/lib/plugins/commands'
import { PluginPermissionError } from '@/lib/plugins/host'
import {
  getPlugin,
  listPlugins,
  registerBundledPlugin,
  resetPluginsForTests,
  setPluginActive,
  syncEnabledPlugins,
} from '@/lib/plugins/registry'
import { PLUGIN_ENABLED_KEY, isPluginEnabled, setPluginEnabled } from '@/lib/plugins/prefs'
import { createPluginStorage, pluginStorageKey } from '@/lib/plugins/storage'
import type { PluginModule } from '@/lib/plugins/types'
import { hydrateKvStore, kvRemove, resetKvStoreForTests } from '@/lib/storage/kv'

const samplePlugin: PluginModule = {
  manifest: {
    id: 'test.sample',
    name: 'Sample',
    version: '0.1.0',
    scribeApi: 1,
    permissions: ['editor.blocks', 'commands', 'storage'],
    defaultEnabled: false,
  },
  activate(api) {
    api.blocks.register({
      id: 'sample-block',
      icon: '★',
      group: 'advanced',
      label: 'Sample block',
      hint: 'From test plugin',
      keywords: ['sampleplugin'],
      insert: (editor) => {
        editor.chain().focus().insertContent({ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }).run()
      },
    })
    api.commands.register({
      id: 'ping',
      title: 'Sample ping',
      run: () => {
        api.storage.set('pinged', '1')
      },
    })
    api.storage.set('activated', '1')
  },
}

describe('plugin system', () => {
  beforeEach(async () => {
    await resetKvStoreForTests()
    await hydrateKvStore()
    kvRemove(PLUGIN_ENABLED_KEY)
    resetPluginCommandsForTests()
    resetPluginsForTests()
    resetPluginBootstrapForTests()
    unregisterBlock('sample-block')
    unregisterBlock('journal-entry')
    unregisterBlock('flashcard')
  })

  afterEach(() => {
    resetPluginCommandsForTests()
    resetPluginsForTests()
    resetPluginBootstrapForTests()
    unregisterBlock('sample-block')
    unregisterBlock('journal-entry')
    unregisterBlock('flashcard')
  })

  it('persists enable overrides', () => {
    expect(isPluginEnabled('test.sample', true)).toBe(true)
    setPluginEnabled('test.sample', false)
    expect(isPluginEnabled('test.sample', true)).toBe(false)
  })

  it('namespaces plugin storage', () => {
    const storage = createPluginStorage('test.sample')
    storage.set('foo', 'bar')
    expect(storage.get('foo')).toBe('bar')
    expect(pluginStorageKey('test.sample', 'foo')).toBe('scribe-plugin:test.sample:foo')
  })

  it('activates blocks and commands, then cleans up on disable', async () => {
    registerBundledPlugin(samplePlugin)
    expect(listPlugins()).toHaveLength(1)

    await setPluginActive('test.sample', true)
    expect(getPlugin('test.sample')?.active).toBe(true)
    expect(hasBlock('sample-block')).toBe(true)
    expect(listPluginCommands().some((c) => c.commandId === 'test.sample.ping')).toBe(true)
    expect(listSlashCommands().some((item) => item.id === 'sample-block' && item.label === 'Sample block')).toBe(
      true,
    )

    const editor = new Editor({
      extensions: [StarterKit],
      content: '<p></p>',
    })
    const def = listSlashCommands().find((item) => item.id === 'sample-block')
    expect(def).toBeTruthy()
    editor.destroy()

    await setPluginActive('test.sample', false)
    expect(getPlugin('test.sample')?.active).toBe(false)
    expect(hasBlock('sample-block')).toBe(false)
    expect(listPluginCommands()).toHaveLength(0)
  })

  it('denies missing permissions', async () => {
    const locked: PluginModule = {
      manifest: {
        id: 'test.locked',
        name: 'Locked',
        version: '0.1.0',
        scribeApi: 1,
        permissions: [],
        defaultEnabled: true,
      },
      activate(api) {
        api.blocks.register({
          id: 'nope',
          insert: () => undefined,
        })
      },
    }

    registerBundledPlugin(locked)
    await expect(setPluginActive('test.locked', true)).rejects.toBeInstanceOf(PluginPermissionError)
    expect(getPlugin('test.locked')?.error).toMatch(/editor\.blocks/)
  })

  it('bootstraps bundled plugins when default-enabled', async () => {
    await bootstrapPlugins()
    const ids = listPlugins().map((p) => p.manifest.id)
    expect(ids).toContain('scribe.daily-journal')
    expect(ids).toContain('scribe.flashcards')
    expect(ids).toContain('scribe.plaintext-export')

    expect(hasBlock('journal-entry')).toBe(true)
    expect(hasBlock('flashcard')).toBe(true)
    expect(listPluginCommands().some((c) => c.commandId === 'scribe.plaintext-export.export-txt')).toBe(
      true,
    )

    await setPluginActive('scribe.daily-journal', false)
    expect(hasBlock('journal-entry')).toBe(false)

    await syncEnabledPlugins()
    expect(hasBlock('journal-entry')).toBe(false)
  })
})
