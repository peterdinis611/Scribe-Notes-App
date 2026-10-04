/**
 * Marketplace stub — discovery / signing / updates land later.
 */

export type MarketplaceListing = {
  id: string
  name: string
  version: string
  summary: string
  verified: boolean
  comingSoon: true
}

export const MARKETPLACE_STATUS = {
  enabled: false,
  reason: 'Signing and remote discovery are not wired yet. Install local .scribe-ext packages instead.',
} as const

export function listMarketplaceListings(): MarketplaceListing[] {
  return [
    {
      id: 'community.example',
      name: 'Community example',
      version: '0.0.0',
      summary: 'Placeholder for a future signed community plugin.',
      verified: false,
      comingSoon: true,
    },
  ]
}

export async function checkPluginUpdates(): Promise<
  Array<{ id: string; current: string; latest: string }>
> {
  return []
}
