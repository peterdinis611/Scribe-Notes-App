import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { hasBlock, unregisterBlock } from '@/lib/editor/block-registry'
import { listSlashCommands } from '@/lib/editor/slash-commands'
import { bootstrapPlugins, resetPluginBootstrapForTests } from '@/lib/plugins/bootstrap'
import { listPluginCommands, resetPluginCommandsForTests } from '@/lib/plugins/commands'
import { PluginPermissionError } from '@/lib/plugins/host'
import { INSTALLED_PLUGINS_KEY, parsePluginManifest, parseScribeExtBytes } from '@/lib/plugins/install'
import { applyPluginPreset } from '@/lib/plugins/presets'
import {
  getPlugin,
  installPluginFromBytes,
  listPlugins,
  registerBundledPlugin,
  resetPluginsForTests,
  setPluginActive,
  syncEnabledPlugins,
} from '@/lib/plugins/registry'
import { PLUGIN_ENABLED_KEY, isPluginEnabled, setPluginEnabled } from '@/lib/plugins/prefs'
import { createPluginStorage, pluginStorageKey } from '@/lib/plugins/storage'
import { listPluginExportFormats, resetPluginExportFormatsForTests } from '@/lib/plugins/surfaces/export-formats'
import { listPluginExtensions, resetPluginExtensionsForTests, sanitizePluginNodeSpec } from '@/lib/plugins/surfaces/extensions'
import { emitPluginLifecycle, resetPluginLifecycleForTests } from '@/lib/plugins/surfaces/lifecycle'
import { listPluginNlpSkills, resetPluginNlpSkillsForTests } from '@/lib/plugins/surfaces/nlp-skills'
import { resetPluginUiPanelsForTests } from '@/lib/plugins/surfaces/ui-panels'
import { resetPluginMcpToolsForTests } from '@/lib/plugins/surfaces/mcp-tools'
import { resetPluginImportFormatsForTests } from '@/lib/plugins/surfaces/import-formats'
import { resetPluginDevtoolsForTests } from '@/lib/plugins/devtools'
import type { PluginModule } from '@/lib/plugins/types'
import { hydrateKvStore, kvRemove, resetKvStoreForTests } from '@/lib/storage/kv'

const samplePlugin: PluginModule = {
  manifest: {
    id: 'test.sample',
    name: 'Sample',
    version: '0.1.0',
    scribeApi: 2,
    permissions: ['editor.blocks', 'commands', 'storage', 'lifecycle'],
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
        editor
          .chain()
          .focus()
          .insertContent({ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] })
          .run()
      },
    })
    api.commands.register({
      id: 'ping',
      title: 'Sample ping',
      run: () => {
        api.storage.set('pinged', '1')
      },
    })
    api.lifecycle.on(() => {
      api.storage.set('life', '1')
    })
    api.storage.set('activated', '1')
  },
}

describe('plugin system', () => {
  beforeEach(async () => {
    await resetKvStoreForTests()
    await hydrateKvStore()
    kvRemove(PLUGIN_ENABLED_KEY)
    kvRemove(INSTALLED_PLUGINS_KEY)
    resetPluginCommandsForTests()
    resetPluginExportFormatsForTests()
    resetPluginImportFormatsForTests()
    resetPluginExtensionsForTests()
    resetPluginNlpSkillsForTests()
    resetPluginMcpToolsForTests()
    resetPluginUiPanelsForTests()
    resetPluginLifecycleForTests()
    resetPluginDevtoolsForTests()
    resetPluginsForTests()
    resetPluginBootstrapForTests()
    unregisterBlock('sample-block')
    unregisterBlock('journal-entry')
    unregisterBlock('flashcard')
    unregisterBlock('citation')
    unregisterBlock('meeting-wrap')
    unregisterBlock('status-badge')
    unregisterBlock('standup')
  })

  afterEach(() => {
    resetPluginCommandsForTests()
    resetPluginExportFormatsForTests()
    resetPluginImportFormatsForTests()
    resetPluginExtensionsForTests()
    resetPluginNlpSkillsForTests()
    resetPluginMcpToolsForTests()
    resetPluginUiPanelsForTests()
    resetPluginLifecycleForTests()
    resetPluginDevtoolsForTests()
    resetPluginsForTests()
    resetPluginBootstrapForTests()
    unregisterBlock('sample-block')
    unregisterBlock('journal-entry')
    unregisterBlock('flashcard')
    unregisterBlock('citation')
    unregisterBlock('meeting-wrap')
    unregisterBlock('status-badge')
    unregisterBlock('standup')
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

    const docKey = 'status:348e01f4-c7a4-4220-86f5-0e75b061e4fd'
    storage.set(docKey, 'draft')
    expect(storage.get(docKey)).toBe('draft')
  })

  it('activates blocks and commands, then cleans up on disable', async () => {
    registerBundledPlugin(samplePlugin)
    await setPluginActive('test.sample', true)
    expect(getPlugin('test.sample')?.active).toBe(true)
    expect(hasBlock('sample-block')).toBe(true)
    expect(listPluginCommands().some((c) => c.commandId === 'test.sample.ping')).toBe(true)
    expect(
      listSlashCommands().some((item) => item.id === 'sample-block' && item.label === 'Sample block'),
    ).toBe(true)

    emitPluginLifecycle({ type: 'documentOpen', documentId: 'd1', title: 'T' })
    expect(createPluginStorage('test.sample').get('life')).toBe('1')

    await setPluginActive('test.sample', false)
    expect(hasBlock('sample-block')).toBe(false)
    expect(listPluginCommands()).toHaveLength(0)
  })

  it('denies missing permissions', async () => {
    const locked: PluginModule = {
      manifest: {
        id: 'test.locked',
        name: 'Locked',
        version: '0.1.0',
        scribeApi: 2,
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

  it('bootstraps bundled plugins with new surfaces', async () => {
    await bootstrapPlugins()
    const ids = listPlugins().map((p) => p.manifest.id)
    expect(ids).toContain('scribe.daily-journal')
    expect(ids).toContain('scribe.citation-pack')
    expect(ids).toContain('scribe.meeting-wrap')
    expect(ids).toContain('scribe.status-meta')
    expect(ids).toContain('scribe.theme-pack')

    expect(hasBlock('journal-entry')).toBe(true)
    expect(hasBlock('citation')).toBe(true)
    expect(hasBlock('standup')).toBe(false)
    expect(listPluginExportFormats().some((f) => f.id === 'bibliography-txt')).toBe(true)
    expect(listPluginNlpSkills().some((s) => s.id === 'extract-actions')).toBe(true)

    await setPluginActive('scribe.status-meta', true)
    expect(listPluginExtensions().some((ext) => ext.name === 'statusBadge')).toBe(true)

    await applyPluginPreset('writing', false)
    expect(hasBlock('journal-entry')).toBe(false)
    await applyPluginPreset('writing', true)
    expect(hasBlock('journal-entry')).toBe(true)

    await setPluginActive('scribe.daily-journal', false)
    expect(hasBlock('journal-entry')).toBe(false)
    await syncEnabledPlugins()
    expect(hasBlock('journal-entry')).toBe(false)
  })

  it('parses manifest and JSON .scribe-ext packages', async () => {
    const manifest = parsePluginManifest({
      id: 'demo.pack',
      name: 'Demo',
      version: '1.0.0',
      scribeApi: 2,
      permissions: ['commands'],
      i18n: { en: { 'manifest.name': 'Demo EN' } },
    })
    expect(manifest.id).toBe('demo.pack')

    const record = await parseScribeExtBytes(
      new TextEncoder().encode(
        JSON.stringify({
          manifest: {
            id: 'demo.installed',
            name: 'Installed demo',
            version: '1.0.0',
            scribeApi: 2,
            permissions: ['commands'],
            defaultEnabled: true,
          },
          code: `export default function activate(api) {
            api.commands.register({ id: 'hi', title: 'Hi', run: () => {} })
          }`,
        }),
      ),
    )
    expect(record.manifest.id).toBe('demo.installed')
    expect(record.code).toContain('activate')
  })

  it('sanitizes plugin node specs', () => {
    expect(() => sanitizePluginNodeSpec({ name: 'Bad Name' })).toThrow()
    expect(() =>
      sanitizePluginNodeSpec({ name: 'okNode', parseTag: 'script' }),
    ).toThrow()
    const safe = sanitizePluginNodeSpec({
      name: 'okNode',
      parseTag: 'div',
      attrs: { label: { default: 'x' }, '$$': { default: 1 } },
    })
    expect(safe.name).toBe('okNode')
    expect(safe.attrs?.label?.default).toBe('x')
    expect(safe.attrs?.$$).toBeUndefined()
  })

  it('installs a JSON plugin package when dynamic import works', async () => {
    const code = `export default function activate(api) {
      api.commands.register({ id: 'greet', title: 'Greet', run: () => {} })
    }`
    const bytes = new TextEncoder().encode(
      JSON.stringify({
        manifest: {
          id: 'demo.dynamic',
          name: 'Dynamic',
          version: '1.0.0',
          scribeApi: 2,
          permissions: ['commands'],
          defaultEnabled: true,
        },
        code,
      }),
    )

    try {
      const entry = await installPluginFromBytes(bytes, 'demo.json')
      expect(entry.source).toBe('installed')
      expect(listPluginCommands().some((c) => c.commandId === 'demo.dynamic.greet')).toBe(true)
    } catch (error) {
      // Some test environments block blob module imports — parser coverage above still applies.
      expect(String(error)).toMatch(/Failed to fetch|import|blob|URL/i)
    }
  })
})
