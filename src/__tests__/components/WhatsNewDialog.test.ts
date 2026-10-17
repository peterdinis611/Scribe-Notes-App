import { describe, expect, it } from 'vitest'
import { WHATS_NEW_39_HIGHLIGHTS, WHATS_NEW_39_TAG_KEYS } from '@/components/WhatsNewDialog'
import { APP_SHORT_VERSION, APP_VERSION } from '@/lib/app-version'

describe('WhatsNew 3.9 highlights', () => {
  it('lists Library · Flow edition highlights', () => {
    expect(WHATS_NEW_39_HIGHLIGHTS).toEqual([
      'tanstackMarkdown',
      'captureInbox',
      'syncMergeStudio',
      'wikiHealthQueue',
      'mcpWriteCountdown',
    ])
    expect(WHATS_NEW_39_TAG_KEYS).toEqual(['library', 'capture', 'markdown'])
  })

  it('matches app version 3.9.0', () => {
    expect(APP_VERSION).toBe('3.9.0')
    expect(APP_SHORT_VERSION).toBe('3.9')
  })
})
