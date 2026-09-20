import {
  createVaultVerifier,
  decryptContentJson,
  encryptContentJson,
  isVaultCipherJson,
  verifyVaultPassword,
  vaultLockedPlaceholderJson,
} from '@/lib/vault/crypto'

type FolderVaultSession = {
  folderId: string
  password: string
}

type DocumentVaultSession = {
  documentId: string
  password: string
}

/** In-memory unlock sessions (cleared on lock / app reload). */
const folderSessions = new Map<string, FolderVaultSession>()
const documentSessions = new Map<string, DocumentVaultSession>()

export function isVaultUnlocked(folderId: string): boolean {
  return folderSessions.has(folderId)
}

export function isDocumentUnlocked(documentId: string): boolean {
  return documentSessions.has(documentId)
}

export function lockVault(folderId: string) {
  folderSessions.delete(folderId)
}

export function lockDocument(documentId: string) {
  documentSessions.delete(documentId)
}

export function lockAllVaults() {
  folderSessions.clear()
  documentSessions.clear()
}

export async function unlockVault(
  folderId: string,
  password: string,
  verifier: string | null | undefined,
): Promise<boolean> {
  if (!verifier) return false
  const ok = await verifyVaultPassword(password, verifier)
  if (!ok) return false
  folderSessions.set(folderId, { folderId, password })
  return true
}

export async function unlockDocument(
  documentId: string,
  password: string,
  verifier: string | null | undefined,
): Promise<boolean> {
  if (!verifier) return false
  const ok = await verifyVaultPassword(password, verifier)
  if (!ok) return false
  documentSessions.set(documentId, { documentId, password })
  return true
}

export function getVaultPassword(folderId: string): string | null {
  return folderSessions.get(folderId)?.password ?? null
}

export function getDocumentPassword(documentId: string): string | null {
  return documentSessions.get(documentId)?.password ?? null
}

/** Synthetic folder id for RAM NLP overlay of password-protected notes. */
export function documentVaultRamFolderId(documentId: string): string {
  return `doc:${documentId}`
}

export {
  createVaultVerifier,
  encryptContentJson,
  decryptContentJson,
  isVaultCipherJson,
  vaultLockedPlaceholderJson,
}
