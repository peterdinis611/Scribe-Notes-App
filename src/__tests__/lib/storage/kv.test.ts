import { describe, expect, it } from 'vitest'
import { hydrateKvStore, kvGet, kvRemove, kvSet, resetKvStoreForTests } from '@/lib/storage/kv'

describe('indexeddb kv store', () => {
  it('persists values across hydrate cycles', async () => {
    await resetKvStoreForTests()
    kvSet('scribe-test-key', 'value')
    await hydrateKvStore()
    expect(kvGet('scribe-test-key')).toBe('value')
    kvRemove('scribe-test-key')
    expect(kvGet('scribe-test-key')).toBeNull()
  })

  it('migrates legacy localStorage keys once', async () => {
    await resetKvStoreForTests()
    localStorage.setItem('scribe-legacy-test', 'migrated')
    await hydrateKvStore()
    expect(kvGet('scribe-legacy-test')).toBe('migrated')
    expect(localStorage.getItem('scribe-legacy-test')).toBeNull()
  })
})
