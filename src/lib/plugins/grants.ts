/**
 * User-granted elevated permissions for installed plugins.
 * Bundled plugins ignore this (trusted). Stored in IndexedDB via kv.
 */

import type { PluginPermission } from '@/lib/plugins/types'
import { kvGetJson, kvSetJson } from '@/lib/storage/kv'

const STORAGE_KEY = 'scribe-plugin-permission-grants'
/** Legacy localStorage / dotted kv key — still readable after hydrate migration. */
const LEGACY_STORAGE_KEY = 'scribe.plugin.permissionGrants'

/** Permissions that require an explicit user grant for installed plugins. */
export const ELEVATED_PERMISSIONS: PluginPermission[] = ['nlp.skills', 'mcp.tools']

type GrantMap = Record<string, PluginPermission[]>

function readMap(): GrantMap {
  const parsed =
    kvGetJson<GrantMap>(STORAGE_KEY) ?? kvGetJson<GrantMap>(LEGACY_STORAGE_KEY)
  return parsed && typeof parsed === 'object' ? parsed : {}
}

function writeMap(map: GrantMap) {
  kvSetJson(STORAGE_KEY, map)
}

export function grantedPermissionsFor(pluginId: string): PluginPermission[] {
  return readMap()[pluginId] ?? []
}

export function isPermissionGranted(pluginId: string, permission: PluginPermission): boolean {
  return grantedPermissionsFor(pluginId).includes(permission)
}

export function grantPluginPermission(pluginId: string, permission: PluginPermission): void {
  if (!ELEVATED_PERMISSIONS.includes(permission)) return
  const map = readMap()
  const current = new Set(map[pluginId] ?? [])
  current.add(permission)
  map[pluginId] = [...current]
  writeMap(map)
}

export function revokePluginPermission(pluginId: string, permission: PluginPermission): void {
  const map = readMap()
  const next = (map[pluginId] ?? []).filter((p) => p !== permission)
  if (next.length === 0) delete map[pluginId]
  else map[pluginId] = next
  writeMap(map)
}
