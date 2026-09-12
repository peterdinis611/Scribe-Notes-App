import {
  createVaultVerifier,
  decryptContentJson,
  encryptContentJson,
  isVaultCipherJson,
  verifyVaultPassword,
  vaultLockedPlaceholderJson,
} from '@/lib/vault/crypto'

type VaultSession = {
  folderId: string
  password: string
}

/** In-memory unlock sessions (cleared on lock / app reload). */
const sessions = new Map<string, VaultSession>()

export function isVaultUnlocked(folderId: string): boolean {
  return sessions.has(folderId)
}

export function lockVault(folderId: string) {
  sessions.delete(folderId)
}

export function lockAllVaults() {
  sessions.clear()
}

export async function unlockVault(
  folderId: string,
  password: string,
  verifier: string | null | undefined,
): Promise<boolean> {
  if (!verifier) return false
  const ok = await verifyVaultPassword(password, verifier)
  if (!ok) return false
  sessions.set(folderId, { folderId, password })
  return true
}

export function getVaultPassword(folderId: string): string | null {
  return sessions.get(folderId)?.password ?? null
}

export {
  createVaultVerifier,
  encryptContentJson,
  decryptContentJson,
  isVaultCipherJson,
  vaultLockedPlaceholderJson,
}
