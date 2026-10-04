import { describe, expect, it } from 'vitest'
import {
  archiveInstalledVersion,
  mergeInstallWithHistory,
} from '@/lib/plugins/install'
import type { InstalledPluginRecord } from '@/lib/plugins/types'
import {
  bumpSemver,
  buildUpdatedRecord,
  exportPluginPackage,
} from '@/lib/plugins/versioning'

function sampleRecord(
  version = '1.0.0',
  code = 'export default function activate(api) { api.log("v1") }',
): InstalledPluginRecord {
  return {
    manifest: {
      id: 'local.version-demo',
      name: 'Version demo',
      version,
      scribeApi: 2,
      permissions: ['commands'],
      defaultEnabled: true,
    },
    code,
    installedAt: '2026-01-01T00:00:00.000Z',
  }
}

describe('plugin versioning', () => {
  it('bumps semver', () => {
    expect(bumpSemver('1.2.3', 'patch')).toBe('1.2.4')
    expect(bumpSemver('1.2.3', 'minor')).toBe('1.3.0')
    expect(bumpSemver('1.2.3', 'major')).toBe('2.0.0')
    expect(bumpSemver('1.2.3', 'keep')).toBe('1.2.3')
  })

  it('archives previous version when building an update', () => {
    const current = sampleRecord('1.0.0', 'export default function activate(api) { api.log("v1") }')
    const next = buildUpdatedRecord(current, {
      code: 'export default function activate(api) { api.log("v2") }',
      bump: 'minor',
      note: 'Second release',
      name: 'Version demo',
    })

    expect(next.manifest.version).toBe('1.1.0')
    expect(next.history?.[0]?.version).toBe('1.0.0')
    expect(next.history?.[0]?.code).toContain('v1')
    expect(next.code).toContain('v2')
  })

  it('rejects publish with no changes', () => {
    const current = sampleRecord()
    expect(() =>
      buildUpdatedRecord(current, {
        code: current.code,
        bump: 'keep',
      }),
    ).toThrow('no_changes')
  })

  it('merges history on reinstall of the same id', () => {
    const existing = sampleRecord('1.0.0', 'old')
    existing.history = archiveInstalledVersion(
      sampleRecord('0.9.0', 'older'),
    )
    const incoming = sampleRecord('2.0.0', 'new')
    const merged = mergeInstallWithHistory(incoming, existing)
    expect(merged.manifest.version).toBe('2.0.0')
    expect(merged.installedAt).toBe(existing.installedAt)
    expect(merged.history?.some((item) => item.version === '1.0.0')).toBe(true)
  })

  it('exports a JSON package', () => {
    const pkg = exportPluginPackage(sampleRecord())
    expect(pkg).toContain('"id": "local.version-demo"')
    expect(pkg).toContain('export default function activate')
  })
})
