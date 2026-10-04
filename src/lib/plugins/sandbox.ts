/**
 * Sandbox policy stub — full worker isolation comes later.
 * Installed (.scribe-ext) plugins run with a restricted permission set by default.
 */

import type { PluginPermission } from '@/lib/plugins/types'

/** Permissions never granted to disk-installed plugins until a real sandbox ships. */
export const SANDBOX_DENIED_PERMISSIONS: PluginPermission[] = [
  'editor.extensions', // raw TipTap extensions — use registerNode instead
]

export const SANDBOX_DEFAULT_ALLOW: PluginPermission[] = [
  'editor.blocks',
  'commands',
  'storage',
  'export',
  'import',
  'ui.sidebar',
  'ui.settings',
  'lifecycle',
  'nlp.skills',
  'mcp.tools',
]

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
