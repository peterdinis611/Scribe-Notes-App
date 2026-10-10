import { describe, expect, it } from 'vitest'
import { WHATS_NEW_34_HIGHLIGHTS } from '@/components/WhatsNewDialog'
import { APP_VERSION, APP_SHORT_VERSION } from '@/lib/app-version'

describe('WhatsNew 3.4 highlights', () => {
  it('lists the five edition features', () => {
    expect(WHATS_NEW_34_HIGHLIGHTS).toEqual([
      'specialistAgents',
      'agentHandoffs',
      'digestsRecipes',
      'spawnAndCalendar',
      'filesIngest',
    ])
  })

  it('matches app version 3.4.0', () => {
    expect(APP_VERSION).toBe('3.4.0')
    expect(APP_SHORT_VERSION).toBe('3.4')
  })
})
