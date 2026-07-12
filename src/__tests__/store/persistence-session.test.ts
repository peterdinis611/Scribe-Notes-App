import { describe, expect, it, beforeEach } from 'vitest'
import {
  persistActiveDocumentId,
  readActiveDocumentId,
  persistOnboardingDismissed,
  readOnboardingDismissed,
} from '@/store/persistence'

describe('session persistence', () => {
  beforeEach(() => {
    localStorage.clear()
  })

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
})
