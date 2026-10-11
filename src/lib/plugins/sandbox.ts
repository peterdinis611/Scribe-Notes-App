/**
 * Sandbox policy for plugins.
 * Bundled plugins are trusted. Installed (.scribe-ext) plugins get a restricted
 * permission set and must not touch Tauri IPC / FS APIs directly.
 */

import type { PluginPermission } from '@/lib/plugins/types'

/** Permissions never granted to disk-installed plugins. */
export const SANDBOX_DENIED_PERMISSIONS: PluginPermission[] = [
  'editor.extensions', // raw TipTap extensions — use registerNode instead
]

/** Installed plugins: no MCP tools / NLP skills (can invoke powerful host paths). */
export const SANDBOX_DEFAULT_ALLOW: PluginPermission[] = [
  'editor.blocks',
  'commands',
  'storage',
  'export',
  'import',
  'ui.sidebar',
  'ui.settings',
  'lifecycle',
]

/** Dangerous globals that installed plugins must not call. */
const BLOCKED_GLOBAL_KEYS = [
  '__TAURI__',
  '__TAURI_INTERNALS__',
  '__TAURI_INVOKE__',
] as const

/**
 * Freeze / neutralize Tauri IPC on `globalThis` for the duration of installed
 * plugin activation. Bundled plugins are unaffected.
 */
export function withInstalledPluginIsolation<T>(run: () => T | Promise<T>): T | Promise<T> {
  if (typeof globalThis === 'undefined') return run()

  const g = globalThis as Record<string, unknown>
  const saved: Array<[string, PropertyDescriptor | undefined]> = []

  for (const key of BLOCKED_GLOBAL_KEYS) {
    saved.push([key, Object.getOwnPropertyDescriptor(g, key)])
    try {
      Object.defineProperty(g, key, {
        configurable: true,
        enumerable: false,
        get() {
          throw new Error('Installed plugins cannot access Tauri IPC')
        },
        set() {
          throw new Error('Installed plugins cannot access Tauri IPC')
        },
      })
    } catch {
      // ignore non-configurable
    }
  }

  const restore = () => {
    for (const [key, desc] of saved) {
      try {
        if (desc) Object.defineProperty(g, key, desc)
        else delete g[key]
      } catch {
        // ignore
      }
    }
  }

  try {
    const result = run()
    if (result && typeof (result as Promise<T>).then === 'function') {
      return (result as Promise<T>).finally(restore)
    }
    restore()
    return result
  } catch (error) {
    restore()
    throw error
  }
}

export type SandboxPolicy = {
  mode: 'trusted' | 'installed'
  allow: PluginPermission[]
  deny: PluginPermission[]
}

export function sandboxPolicyFor(source: 'bundled' | 'installed'): SandboxPolicy {
  if (source === 'bundled') {
    return { mode: 'trusted', allow: [], deny: [] }
  }
  return {
    mode: 'installed',
    allow: [...SANDBOX_DEFAULT_ALLOW],
    deny: [...SANDBOX_DENIED_PERMISSIONS],
  }
}

export function isPermissionAllowed(
  source: 'bundled' | 'installed',
  permission: PluginPermission,
  requested: PluginPermission[],
): boolean {
  if (!requested.includes(permission)) return false
  const policy = sandboxPolicyFor(source)
  if (policy.mode === 'trusted') return true
  if (policy.deny.includes(permission)) return false
  return policy.allow.includes(permission)
}
