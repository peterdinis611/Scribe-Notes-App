import { describe, expect, it } from 'vitest'
import { WHATS_NEW_38_HIGHLIGHTS, WHATS_NEW_38_TAG_KEYS } from '@/components/WhatsNewDialog'
import { APP_SHORT_VERSION, APP_VERSION } from '@/lib/app-version'

describe('WhatsNew 3.8 highlights', () => {
  it('lists Library · Flow edition highlights', () => {
    expect(WHATS_NEW_38_HIGHLIGHTS).toEqual([
      'tanstackMarkdown',
      'captureInbox',
      'syncMergeStudio',
      'wikiHealthQueue',
      'mcpWriteCountdown',
    ])
    expect(WHATS_NEW_38_TAG_KEYS).toEqual(['library', 'capture', 'markdown'])
  })

  it('matches app version 3.8.0', () => {
    expect(APP_VERSION).toBe('3.8.0')
    expect(APP_SHORT_VERSION).toBe('3.8')
  })
})
