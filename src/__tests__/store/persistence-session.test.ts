import { describe, expect, it } from 'vitest'
import {
  persistActiveDocumentId,
  readActiveDocumentId,
  persistOnboardingDismissed,
  readOnboardingDismissed,
  persistWhatsNewVersion,
  readWhatsNewVersion,
} from '@/store/persistence'

describe('session persistence', () => {
  it('persists and reads active document id', () => {
    expect(readActiveDocumentId()).toBeNull()
    persistActiveDocumentId('doc-123')
    expect(readActiveDocumentId()).toBe('doc-123')
    persistActiveDocumentId(null)
    expect(readActiveDocumentId()).toBeNull()
  })

  it('persists onboarding dismissed flag', () => {
    expect(readOnboardingDismissed()).toBe(false)
    persistOnboardingDismissed(true)
    expect(readOnboardingDismissed()).toBe(true)
    persistOnboardingDismissed(false)
    expect(readOnboardingDismissed()).toBe(false)
  })

  it('persists whats new version', () => {
    expect(readWhatsNewVersion()).toBeNull()
    persistWhatsNewVersion('0.8.0')
    expect(readWhatsNewVersion()).toBe('0.8.0')
  })
})
