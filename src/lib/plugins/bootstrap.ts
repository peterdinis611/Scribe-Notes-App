import { BUNDLED_PLUGINS } from '@/lib/plugins/bundled'
import {
  hydrateInstalledPlugins,
  registerBundledPlugin,
  syncEnabledPlugins,
} from '@/lib/plugins/registry'

let bootstrapped = false

/** Register bundled + installed plugins and activate those enabled in prefs. Idempotent. */
export async function bootstrapPlugins(): Promise<void> {
  if (bootstrapped) {
    await syncEnabledPlugins()
    return
  }

  for (const module of BUNDLED_PLUGINS) {
    if (!module.manifest.id) continue
    try {
      registerBundledPlugin(module)
    } catch (error) {
      console.error('[plugins] failed to register', module.manifest.id, error)
    }
  }

  await hydrateInstalledPlugins()
  await syncEnabledPlugins()
  bootstrapped = true
}

export function resetPluginBootstrapForTests() {
  bootstrapped = false
}
