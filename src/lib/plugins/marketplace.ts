/** Keep in sync with `crates/scribe-ui` counterpart. */
/**
 * Local marketplace catalog — local update checks + sample signing checksums.
 * Remote discovery remains opt-in later.
 */

import helloPackage from '@/lib/plugins/examples/hello.scribe-ext.json'
import slashBlockPackage from '@/lib/plugins/examples/slash-block.scribe-ext.json'
import commandNotifyPackage from '@/lib/plugins/examples/command-notify.scribe-ext.json'
import type { PluginCategory } from '@/lib/plugins/types'
import { listInstalledPluginRecords } from '@/lib/plugins/install'
import { compareSemver } from '@/lib/plugins/versioning'

export type MarketplaceKind = 'sample' | 'official' | 'community'

export type MarketplaceListing = {
  id: string
  name: string
  version: string
  summary: string
  author: string
  category: PluginCategory | 'sample'
  verified: boolean
  kind: MarketplaceKind
  /** Official bundled plugin id to highlight / deep-link. */
  bundledPluginId?: string
  /** Installable JSON package payload. */
  packageJson?: string
  /** Simple integrity checksum of packageJson (local “signing”). */
  packageChecksum?: string
  tags: string[]
  comingSoon?: boolean
}

export const MARKETPLACE_STATUS = {
  enabled: true,
  mode: 'local' as const,
  reason:
    'Local catalog with checksum verification and update checks against installed plugins. Remote signing is not wired yet.',
} as const

const SAMPLE_PACKAGES = [
  { pkg: helloPackage, tags: ['commands', 'starter'] },
  { pkg: slashBlockPackage, tags: ['blocks', 'slash'] },
  { pkg: commandNotifyPackage, tags: ['commands', 'active-doc'] },
] as const

/** FNV-1a 32-bit — stable local checksum for package integrity (not cryptographic signing). */
export function packageChecksum(payload: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < payload.length; i += 1) {
    hash ^= payload.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, '0')}`
}

export function verifyPackageChecksum(packageJson: string, expected?: string | null): boolean {
  if (!expected) return false
  return packageChecksum(packageJson) === expected
}

const OFFICIAL_FEATURED: MarketplaceListing[] = [
  {
    id: 'official.daily-journal',
    name: 'Daily journal',
    version: '1.0.0',
    summary: 'Slash template and command for a dated journal entry.',
    author: 'Scribe',
    category: 'writing',
    verified: true,
    kind: 'official',
    bundledPluginId: 'scribe.daily-journal',
    tags: ['writing', 'slash'],
  },
  {
    id: 'official.flashcard-block',
    name: 'Flashcards',
    version: '1.0.0',
    summary: 'Study cards as a slash block inside notes.',
    author: 'Scribe',
    category: 'study',
    verified: true,
    kind: 'official',
    bundledPluginId: 'scribe.flashcards',
    tags: ['study', 'blocks'],
  },
  {
    id: 'official.status-meta',
    name: 'Status meta',
    version: '1.0.0',
    summary: 'Per-note status in the sidebar, settings, and editor.',
    author: 'Scribe',
    category: 'workspace',
    verified: true,
    kind: 'official',
    bundledPluginId: 'scribe.status-meta',
    tags: ['workspace', 'sidebar'],
  },
  {
    id: 'official.plaintext-export',
    name: 'Plaintext export',
    version: '1.0.0',
    summary: 'Export the open note as plain text.',
    author: 'Scribe',
    category: 'writing',
    verified: true,
    kind: 'official',
    bundledPluginId: 'scribe.plaintext-export',
    tags: ['export'],
  },
]

export function listMarketplaceListings(): MarketplaceListing[] {
  const samples: MarketplaceListing[] = SAMPLE_PACKAGES.map(({ pkg, tags }) => {
    const packageJson = JSON.stringify(pkg)
    return {
      id: pkg.manifest.id,
      name: pkg.manifest.name,
      version: pkg.manifest.version,
      summary: pkg.manifest.description ?? '',
      author: 'Scribe examples',
      category: 'sample' as const,
      verified: true,
      kind: 'sample' as const,
      packageJson,
      packageChecksum: packageChecksum(packageJson),
      tags: [...tags],
    }
  })

  const community: MarketplaceListing[] = [
    {
      id: 'community.example',
      name: 'Community example',
      version: '0.0.0',
      summary: 'Placeholder for a future signed community plugin.',
      author: 'Community',
      category: 'other',
      verified: false,
      kind: 'community',
      tags: ['remote'],
      comingSoon: true,
    },
  ]

  return [...samples, ...OFFICIAL_FEATURED, ...community]
}

export function listMarketplaceByKind(kind?: MarketplaceKind): MarketplaceListing[] {
  const all = listMarketplaceListings()
  if (!kind) return all
  return all.filter((item) => item.kind === kind)
}

/**
 * Compare installed plugin versions against the local marketplace catalog.
 * Official bundled ids map via `bundledPluginId`; samples use listing id.
 */
export async function checkPluginUpdates(): Promise<
  Array<{ id: string; current: string; latest: string }>
> {
  const installed = listInstalledPluginRecords()
  const listings = listMarketplaceListings().filter((item) => !item.comingSoon)
  const updates: Array<{ id: string; current: string; latest: string }> = []

  for (const listing of listings) {
    const match = installed.find(
      (record) =>
        record.manifest.id === listing.id ||
        (listing.bundledPluginId != null && record.manifest.id === listing.bundledPluginId),
    )
    if (!match) continue
    if (compareSemver(listing.version, match.manifest.version) > 0) {
      updates.push({
        id: match.manifest.id,
        current: match.manifest.version,
        latest: listing.version,
      })
    }
  }

  return updates
}
