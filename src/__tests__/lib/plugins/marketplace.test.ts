import { describe, expect, it } from 'vitest'
import {
  MARKETPLACE_STATUS,
  checkPluginUpdates,
  listMarketplaceByKind,
  listMarketplaceListings,
} from '@/lib/plugins/marketplace'

describe('marketplace catalog', () => {
  it('exposes a local catalog with samples, official, and community placeholders', () => {
    const listings = listMarketplaceListings()
    expect(MARKETPLACE_STATUS.mode).toBe('local')
    expect(listings.some((item) => item.kind === 'sample')).toBe(true)
    expect(listings.some((item) => item.kind === 'official')).toBe(true)
    expect(listings.some((item) => item.kind === 'community' && item.comingSoon)).toBe(true)
  })

  it('filters by kind', () => {
    const samples = listMarketplaceByKind('sample')
    expect(samples.length).toBeGreaterThan(0)
    expect(samples.every((item) => item.kind === 'sample')).toBe(true)
    expect(listMarketplaceByKind('official').every((item) => item.kind === 'official')).toBe(true)
  })

  it('ships installable sample packages with parseable JSON', () => {
    for (const sample of listMarketplaceByKind('sample')) {
      expect(sample.packageJson).toBeTruthy()
      const parsed = JSON.parse(sample.packageJson!) as {
        manifest: { id: string; name: string; version: string }
      }
      expect(parsed.manifest.id).toBe(sample.id)
      expect(parsed.manifest.version).toBe(sample.version)
      expect(parsed.manifest.name).toBeTruthy()
    }
  })

  it('returns no remote updates yet', async () => {
    await expect(checkPluginUpdates()).resolves.toEqual([])
  })
})
