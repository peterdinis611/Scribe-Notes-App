/**
 * Local marketplace catalog — remote signing/discovery still later.
 * Ships installable sample packages + featured official plugins.
 */

import helloPackage from '@/lib/plugins/examples/hello.scribe-ext.json'
import slashBlockPackage from '@/lib/plugins/examples/slash-block.scribe-ext.json'
import commandNotifyPackage from '@/lib/plugins/examples/command-notify.scribe-ext.json'
import type { PluginCategory } from '@/lib/plugins/types'

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
  tags: string[]
  comingSoon?: boolean
}

export const MARKETPLACE_STATUS = {
  enabled: true,
  mode: 'local' as const,
  reason:
    'Local catalog: install sample packages now. Signed remote discovery is not wired yet.',
} as const

const SAMPLE_PACKAGES = [
  { pkg: helloPackage, tags: ['commands', 'starter'] },
  { pkg: slashBlockPackage, tags: ['blocks', 'slash'] },
  { pkg: commandNotifyPackage, tags: ['commands', 'active-doc'] },
] as const

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
  const samples: MarketplaceListing[] = SAMPLE_PACKAGES.map(({ pkg, tags }) => ({
    id: pkg.manifest.id,
    name: pkg.manifest.name,
    version: pkg.manifest.version,
    summary: pkg.manifest.description ?? '',
    author: 'Scribe examples',
    category: 'sample',
    verified: true,
    kind: 'sample',
    packageJson: JSON.stringify(pkg),
    tags: [...tags],
  }))

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

export async function checkPluginUpdates(): Promise<
  Array<{ id: string; current: string; latest: string }>
> {
  return []
}
