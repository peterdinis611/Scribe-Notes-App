import { describe, expect, it } from 'vitest'
import { WHATS_NEW_25_HIGHLIGHTS } from '@/components/WhatsNewDialog'

describe('WhatsNew 2.5 highlights', () => {
  it('lists the five edition features', () => {
    expect(WHATS_NEW_25_HIGHLIGHTS).toEqual([
      'continueWriting',
      'smartPaste',
      'models3d',
      'revisionAi',
      'studyAi',
    ])
  })
})
