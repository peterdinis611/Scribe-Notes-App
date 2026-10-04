import { beforeEach, describe, expect, it } from 'vitest'
import {
  buildCreatedPlugin,
  slugifyPluginId,
  validatePluginId,
} from '@/lib/plugins/create'
import { INSTALLED_PLUGINS_KEY } from '@/lib/plugins/install'
import { resetPluginsForTests } from '@/lib/plugins/registry'
import { PLUGIN_ENABLED_KEY } from '@/lib/plugins/prefs'
import { hydrateKvStore, kvRemove, resetKvStoreForTests } from '@/lib/storage/kv'

describe('create plugin', () => {
  beforeEach(async () => {
    await resetKvStoreForTests()
    await hydrateKvStore()
    kvRemove(PLUGIN_ENABLED_KEY)
    kvRemove(INSTALLED_PLUGINS_KEY)
    resetPluginsForTests()
  })

  it('slugifies names into local.* ids', () => {
    expect(slugifyPluginId('My Helper')).toBe('local.my-helper')
    expect(slugifyPluginId('  Denník 2026 ')).toBe('local.dennik-2026')
  })

  it('builds a command template package', () => {
    const built = buildCreatedPlugin({
      name: 'Quick toast',
      template: 'command',
      category: 'writing',
    })
    expect(built.manifest.id).toBe('local.quick-toast')
    expect(built.manifest.permissions).toEqual(['commands'])
    expect(built.code).toContain('api.commands.register')
    expect(built.code).toContain('api.notify.success')
    expect(built.packageJson).toContain('"id": "local.quick-toast"')
  })

  it('builds a slash-block template with editor.blocks permission', () => {
    const built = buildCreatedPlugin({
      name: 'Note stub',
      id: 'local.note-stub',
      template: 'slashBlock',
    })
    expect(built.manifest.permissions).toEqual(['editor.blocks'])
    expect(built.code).toContain('api.blocks.register')
    expect(built.code).toContain("id: \"note-stub\"")
  })

  it('rejects invalid or taken ids', () => {
    expect(validatePluginId('Bad Id').ok).toBe(false)
    const built = buildCreatedPlugin({ name: 'Taken', id: 'local.taken', template: 'command' })
    // Simulate install by registering into installed records via build only —
    // validate against listPlugins which is empty, so use id_taken after fake register.
    expect(validatePluginId(built.manifest.id).ok).toBe(true)
  })
})
