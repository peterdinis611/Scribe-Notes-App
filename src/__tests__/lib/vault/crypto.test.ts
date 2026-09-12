import { describe, expect, it } from 'vitest'
import {
  createVaultVerifier,
  decryptContentJson,
  encryptContentJson,
  isVaultCipherJson,
  verifyVaultPassword,
} from '@/lib/vault/crypto'

describe('vault crypto', () => {
  it('round-trips content with password', async () => {
    const password = 'test-pass-123'
    const plain = JSON.stringify({ type: 'doc', content: [{ type: 'paragraph' }] })
    const cipher = await encryptContentJson(password, plain)
    expect(isVaultCipherJson(cipher)).toBe(true)
    expect(await decryptContentJson(password, cipher)).toBe(plain)
  })

  it('verifies vault password', async () => {
    const password = 'vault-secret'
    const verifier = await createVaultVerifier(password)
    expect(await verifyVaultPassword(password, verifier)).toBe(true)
    expect(await verifyVaultPassword('wrong', verifier)).toBe(false)
  })
})
