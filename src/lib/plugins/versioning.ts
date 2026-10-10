import {
  archiveInstalledVersion,
  getInstalledPluginRecord,
  snapshotInstalledVersion,
} from '@/lib/plugins/install'
import { getPlugin, installPluginRecord } from '@/lib/plugins/registry'
import type {
  InstalledPluginRecord,
  PluginManifest,
  PluginVersionSnapshot,
  RegisteredPlugin,
} from '@/lib/plugins/types'

/** Keep semver helpers in sync with `crates/scribe-ui/src/semver.rs`. */

export type VersionBump = 'patch' | 'minor' | 'major' | 'keep'

export function parseSemver(version: string): [number, number, number] | null {
  const match = version.trim().match(/^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/)
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

export function bumpSemver(version: string, bump: VersionBump): string {
  if (bump === 'keep') return version.trim() || '1.0.0'
  const parsed = parseSemver(version) ?? [1, 0, 0]
  let [major, minor, patch] = parsed
  if (bump === 'major') {
    major += 1
    minor = 0
    patch = 0
  } else if (bump === 'minor') {
    minor += 1
    patch = 0
  } else {
    patch += 1
  }
  return `${major}.${minor}.${patch}`
}

export function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a) ?? [0, 0, 0]
  const pb = parseSemver(b) ?? [0, 0, 0]
  for (let i = 0; i < 3; i += 1) {
    if (pa[i]! !== pb[i]!) return pa[i]! - pb[i]!
  }
  return 0
}

export type PublishPluginVersionInput = {
  pluginId: string
  code: string
  bump: VersionBump
  /** Explicit version; wins over bump when set. */
  version?: string
  note?: string
  name?: string
  description?: string
  author?: string
  /** Keep enabled state after publish (default true). */
  enable?: boolean
}

export function buildUpdatedRecord(
  current: InstalledPluginRecord,
  input: Omit<PublishPluginVersionInput, 'pluginId' | 'enable'>,
): InstalledPluginRecord {
  const nextVersion =
    input.version?.trim() || bumpSemver(current.manifest.version, input.bump)
  if (!nextVersion) throw new Error('version_required')
  if (!/^\d+\.\d+\.\d+([-+][a-zA-Z0-9.-]+)?$/.test(nextVersion)) {
    throw new Error('version_invalid')
  }

  const code = input.code
  if (!code.trim()) throw new Error('code_required')

  const sameVersion = nextVersion === current.manifest.version
  const sameCode = code === current.code
  if (sameVersion && sameCode) throw new Error('no_changes')

  const history =
    sameVersion && !sameCode
      ? [...(current.history ?? [])]
      : archiveInstalledVersion(current)

  const manifest: PluginManifest = {
    ...current.manifest,
    version: nextVersion,
    name: input.name?.trim() || current.manifest.name,
    description:
      input.description !== undefined
        ? input.description.trim() || undefined
        : current.manifest.description,
    author:
      input.author !== undefined
        ? input.author.trim() || undefined
        : current.manifest.author,
  }

  return {
    ...current,
    manifest,
    code,
    updatedAt: new Date().toISOString(),
    changelogNote: input.note?.trim() || undefined,
    history,
  }
}

/** Publish a new version (or overwrite same version code) for an installed plugin. */
export async function publishPluginVersion(
  input: PublishPluginVersionInput,
): Promise<RegisteredPlugin> {
  const entry = getPlugin(input.pluginId)
  if (!entry || entry.source !== 'installed') {
    throw new Error('not_installed')
  }
  const current = getInstalledPluginRecord(input.pluginId)
  if (!current) throw new Error('record_missing')

  const next = buildUpdatedRecord(current, input)
  return installPluginRecord(next, { enable: input.enable !== false })
}

/** Restore a historical snapshot as a new bump with that code. */
export async function restorePluginVersion(
  pluginId: string,
  version: string,
  options?: { bump?: VersionBump; note?: string },
): Promise<RegisteredPlugin> {
  const current = getInstalledPluginRecord(pluginId)
  if (!current) throw new Error('record_missing')
  const snap =
    current.history?.find((item) => item.version === version) ??
    (current.manifest.version === version
      ? snapshotInstalledVersion(current)
      : undefined)
  if (!snap) throw new Error('version_not_found')

  return publishPluginVersion({
    pluginId,
    code: snap.code,
    bump: options?.bump ?? 'patch',
    note: options?.note ?? `Restored from v${version}`,
    name: snap.manifest.name,
    description: snap.manifest.description,
    author: snap.manifest.author,
  })
}

export function exportPluginPackage(record: InstalledPluginRecord): string {
  return `${JSON.stringify({ manifest: record.manifest, code: record.code }, null, 2)}\n`
}

export function listPluginVersionHistory(pluginId: string): PluginVersionSnapshot[] {
  const record = getInstalledPluginRecord(pluginId)
  if (!record) return []
  const current = {
    ...snapshotInstalledVersion(record),
    note: record.changelogNote ?? 'current',
  }
  const history = record.history ?? []
  return [
    current,
    ...history.filter((item) => item.version !== current.version || item.code !== current.code),
  ]
}
