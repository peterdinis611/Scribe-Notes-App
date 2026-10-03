import { describe, expect, it } from 'vitest'
import { WHATS_NEW_27_HIGHLIGHTS } from '@/components/WhatsNewDialog'
import { APP_VERSION, APP_SHORT_VERSION } from '@/lib/app-version'

describe('WhatsNew 2.7 highlights', () => {
  it('lists the five edition features', () => {
    expect(WHATS_NEW_27_HIGHLIGHTS).toEqual([
      'localAgent',
      'agentTeach',
      'agentOptimize',
      'paintPad',
      'agentDatabase',
    ])
  })

  it('matches app version 3.1.0', () => {
    expect(APP_VERSION).toBe('3.1.0')
    expect(APP_SHORT_VERSION).toBe('3.1')
  })
})
