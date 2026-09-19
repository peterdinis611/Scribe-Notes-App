import { describe, expect, it } from 'vitest'
import {
  persistActiveDocumentId,
  readActiveDocumentId,
  persistOnboardingDismissed,
  readOnboardingDismissed,
  persistSetupCompleted,
  readSetupCompleted,
  ensureSetupCompletedForExistingUsers,
  persistWhatsNewVersion,
  readWhatsNewVersion,
  persistOpenDocumentIds,
  readOpenDocumentIds,
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

  it('persists setup completed and migrates existing onboarding users', () => {
    persistSetupCompleted(false)
    persistOnboardingDismissed(false)
    expect(readSetupCompleted()).toBe(false)
    expect(ensureSetupCompletedForExistingUsers()).toBe(false)

    persistOnboardingDismissed(true)
    expect(ensureSetupCompletedForExistingUsers()).toBe(true)
    expect(readSetupCompleted()).toBe(true)

    persistSetupCompleted(false)
    persistOnboardingDismissed(false)
  })

  it('persists whats new version', () => {
    expect(readWhatsNewVersion()).toBeNull()
    persistWhatsNewVersion('0.8.0')
    expect(readWhatsNewVersion()).toBe('0.8.0')
  })

  it('persists open document tab ids', () => {
    expect(readOpenDocumentIds()).toEqual([])
    persistOpenDocumentIds(['a', 'b'])
    expect(readOpenDocumentIds()).toEqual(['a', 'b'])
  })
})
