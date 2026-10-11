import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createVaultVerifier,
  getVaultPassword,
  installVaultAutoLock,
  isDocumentUnlocked,
  isVaultUnlocked,
  lockAllVaults,
  resetVaultSessionForTests,
  unlockDocument,
  unlockVault,
  VAULT_IDLE_LOCK_MS,
} from '@/lib/vault/session'

describe('vault session security', () => {
  beforeEach(() => {
    resetVaultSessionForTests()
  })

  afterEach(() => {
    resetVaultSessionForTests()
    vi.useRealTimers()
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    })
  })

  it('unlocks folder and stores password only in memory', async () => {
    const password = 'session-secret'
    const verifier = await createVaultVerifier(password)
    expect(await unlockVault('folder-1', password, verifier)).toBe(true)
    expect(isVaultUnlocked('folder-1')).toBe(true)
    expect(getVaultPassword('folder-1')).toBe(password)
    expect(await unlockVault('folder-1', 'wrong', verifier)).toBe(false)
  })

  it('lockAllVaults clears folder and document sessions', async () => {
    const password = 'pw'
    const verifier = await createVaultVerifier(password)
    await unlockVault('f1', password, verifier)
    await unlockDocument('d1', password, verifier)
    expect(isVaultUnlocked('f1')).toBe(true)
    expect(isDocumentUnlocked('d1')).toBe(true)
    lockAllVaults()
    expect(isVaultUnlocked('f1')).toBe(false)
    expect(isDocumentUnlocked('d1')).toBe(false)
    expect(getVaultPassword('f1')).toBeNull()
  })

  it('auto-locks after idle timeout', async () => {
    const password = 'idle-pw'
    const verifier = await createVaultVerifier(password)
    vi.useFakeTimers()
    await unlockVault('idle-folder', password, verifier)
    expect(isVaultUnlocked('idle-folder')).toBe(true)
    vi.advanceTimersByTime(VAULT_IDLE_LOCK_MS + 1)
    expect(isVaultUnlocked('idle-folder')).toBe(false)
  })

  it('locks when document becomes hidden', async () => {
    const password = 'hide-pw'
    const verifier = await createVaultVerifier(password)
    await unlockVault('hide-folder', password, verifier)
    installVaultAutoLock()
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(isVaultUnlocked('hide-folder')).toBe(false)
  })
})
