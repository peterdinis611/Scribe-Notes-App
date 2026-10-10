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

/** In-memory unlock sessions (cleared on lock / app reload / idle / sleep). */
const folderSessions = new Map<string, FolderVaultSession>()
const documentSessions = new Map<string, DocumentVaultSession>()

/** Auto-lock unlocked vault passwords after this much idle time (ms). */
const VAULT_IDLE_LOCK_MS = 15 * 60 * 1000

let idleTimer: ReturnType<typeof setTimeout> | null = null
let autoLockInstalled = false

function clearIdleTimer() {
  if (idleTimer != null) {
    clearTimeout(idleTimer)
    idleTimer = null
  }
}

function scheduleIdleLock() {
  clearIdleTimer()
  if (folderSessions.size === 0 && documentSessions.size === 0) return
  idleTimer = setTimeout(() => {
    lockAllVaults()
  }, VAULT_IDLE_LOCK_MS)
}

function touchVaultActivity() {
  if (folderSessions.size === 0 && documentSessions.size === 0) return
  scheduleIdleLock()
}

/** Install once: idle timeout + lock on tab hide / sleep resume. */
export function installVaultAutoLock() {
  if (autoLockInstalled || typeof window === 'undefined') return
  autoLockInstalled = true

  const onActivity = () => touchVaultActivity()
  for (const evt of ['pointerdown', 'keydown', 'mousemove', 'touchstart', 'wheel'] as const) {
    window.addEventListener(evt, onActivity, { passive: true })
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      lockAllVaults()
    }
  })

  window.addEventListener('pagehide', () => {
    lockAllVaults()
  })

  // Best-effort sleep/wake: browsers fire resume after suspension.
  window.addEventListener('focus', () => {
    // After long background, prefer locked state — idle timer already covers most cases.
    touchVaultActivity()
  })
}

export function isVaultUnlocked(folderId: string): boolean {
  return folderSessions.has(folderId)
}

export function isDocumentUnlocked(documentId: string): boolean {
  return documentSessions.has(documentId)
}

export function lockVault(folderId: string) {
  folderSessions.delete(folderId)
  scheduleIdleLock()
}

export function lockDocument(documentId: string) {
  documentSessions.delete(documentId)
  scheduleIdleLock()
}

export function lockAllVaults() {
  folderSessions.clear()
  documentSessions.clear()
  clearIdleTimer()
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
  installVaultAutoLock()
  scheduleIdleLock()
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
  installVaultAutoLock()
  scheduleIdleLock()
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
