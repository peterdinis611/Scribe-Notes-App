import { kvGet, kvGetJson, kvRemove, kvSet, kvSetJson } from '@/lib/storage/kv'
import type { PluginStorage } from '@/lib/plugins/types'

const PLUGIN_ID_PATTERN = /^[a-z][a-z0-9.-]{0,127}$/i
const KEY_PATTERN = /^[a-zA-Z0-9._-]{1,128}$/

export function pluginStorageKey(pluginId: string, key: string): string {
  return `scribe-plugin:${pluginId}:${key}`
}

export function createPluginStorage(pluginId: string): PluginStorage {
  if (!PLUGIN_ID_PATTERN.test(pluginId)) {
    throw new Error(`Invalid plugin id for storage: ${pluginId}`)
  }

  function assertKey(key: string) {
    if (!KEY_PATTERN.test(key)) {
      throw new Error(`Invalid plugin storage key: ${key}`)
    }
  }

  return {
    get(key) {
      assertKey(key)
      return kvGet(pluginStorageKey(pluginId, key))
    },
    set(key, value) {
      assertKey(key)
      kvSet(pluginStorageKey(pluginId, key), value)
    },
    remove(key) {
      assertKey(key)
      kvRemove(pluginStorageKey(pluginId, key))
    },
    getJson<T>(key) {
      assertKey(key)
      return kvGetJson<T>(pluginStorageKey(pluginId, key))
    },
    setJson(key, value) {
      assertKey(key)
      kvSetJson(pluginStorageKey(pluginId, key), value)
    },
  }
}
