import { describe, expect, it } from 'vitest'
import { WHATS_NEW_35_HIGHLIGHTS } from '@/components/WhatsNewDialog'
import { APP_SHORT_VERSION, APP_VERSION } from '@/lib/app-version'

describe('WhatsNew 3.5 highlights', () => {
  it('lists Surfaces edition highlights', () => {
    expect(WHATS_NEW_35_HIGHLIGHTS).toEqual([
      'docsFieldGuide',
      'pythonUiChrome',
      'sharedUiCatalogs',
      'renderUiSurface',
      'welcomeSurfaces',
    ])
  })

  it('matches app version 3.5.0', () => {
    expect(APP_VERSION).toBe('3.5.0')
    expect(APP_SHORT_VERSION).toBe('3.5')
  })
})
