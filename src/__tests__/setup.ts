import '@testing-library/jest-dom/vitest'
import { beforeEach } from 'vitest'
import { hydrateKvStore, resetKvStoreForTests } from '@/lib/storage/kv'

beforeEach(async () => {
  await resetKvStoreForTests()
  await hydrateKvStore()
})
