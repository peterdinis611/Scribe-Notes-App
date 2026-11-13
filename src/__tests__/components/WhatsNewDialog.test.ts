import { describe, expect, it } from 'vitest'
import { WHATS_NEW_50_HIGHLIGHTS, WHATS_NEW_50_TAG_KEYS } from '@/components/WhatsNewDialog'
import { APP_SHORT_VERSION, APP_VERSION } from '@/lib/app-version'

describe('WhatsNew 5.4 highlights', () => {
  it('lists 5.4 edition highlights', () => {
    expect(WHATS_NEW_50_HIGHLIGHTS).toEqual([
      'offlineAiFelt',
      'searchRewrite',
      'aiSurface',
      'pythonParity',
      'stillLocal',
    ])
    expect(WHATS_NEW_50_TAG_KEYS).toEqual(['localAi', 'library', 'agent'])
  })

  it('matches app version 5.4.0', () => {
    expect(APP_VERSION).toBe('5.4.0')
    expect(APP_SHORT_VERSION).toBe('5.4')
  })
})
