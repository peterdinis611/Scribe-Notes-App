import { describe, expect, it } from 'vitest'
import { WHATS_NEW_40_HIGHLIGHTS, WHATS_NEW_40_TAG_KEYS } from '@/components/WhatsNewDialog'
import { APP_SHORT_VERSION, APP_VERSION } from '@/lib/app-version'

describe('WhatsNew 4.0 highlights', () => {
  it('lists 4.0 edition highlights', () => {
    expect(WHATS_NEW_40_HIGHLIGHTS).toEqual([
      'pageWorkspace',
      'editorCanvas',
      'welcomeHome',
      'auditInsights',
      'skinPicker',
    ])
    expect(WHATS_NEW_40_TAG_KEYS).toEqual(['workspace', 'design', 'audit'])
  })

  it('matches app version 4.1.0', () => {
    expect(APP_VERSION).toBe('4.1.0')
    expect(APP_SHORT_VERSION).toBe('4.1')
  })
})
