import { beforeEach, describe, expect, it } from 'vitest'
import {
  API_IDS,
  getApisEnabledSnapshot,
  isApiEnabled,
  setAllApisEnabled,
  setApiEnabled,
} from '@/lib/apis/prefs'
import { kvRemove } from '@/lib/storage/kv'

describe('apis prefs', () => {
  beforeEach(() => {
    kvRemove('scribe-apis-enabled-v1')
  })

  it('defaults all APIs to enabled', () => {
    for (const id of API_IDS) {
      expect(isApiEnabled(id)).toBe(true)
    }
  })

  it('disables and re-enables a single API', () => {
    setApiEnabled('nominatim', false)
    expect(isApiEnabled('nominatim')).toBe(false)
    expect(isApiEnabled('open_meteo')).toBe(true)
    setApiEnabled('nominatim', true)
    expect(isApiEnabled('nominatim')).toBe(true)
  })

  it('disables all then enables all', () => {
    setAllApisEnabled(false)
    const snap = getApisEnabledSnapshot()
    expect(Object.values(snap).every((v) => v === false)).toBe(true)
    setAllApisEnabled(true)
    expect(Object.values(getApisEnabledSnapshot()).every((v) => v === true)).toBe(true)
  })
})
