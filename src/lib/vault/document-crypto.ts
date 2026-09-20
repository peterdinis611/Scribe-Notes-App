import type { Document, Folder } from '@/lib/db/api'
import {
  decryptContentJson,
  encryptContentJson,
  isVaultCipherJson,
  vaultLockedPlaceholderJson,
} from '@/lib/vault/crypto'
import {
  getDocumentPassword,
  getVaultPassword,
  isDocumentUnlocked,
  isVaultUnlocked,
} from '@/lib/vault/session'

function isPasswordProtected(doc: Document): boolean {
  return Boolean(doc.vaultVerifier && doc.vaultVerifier.length > 0)
}

export async function maybeDecryptDocument(
  doc: Document,
  folders: Folder[],
): Promise<Document & { vaultLocked?: boolean }> {
  if (!isVaultCipherJson(doc.contentJson)) return doc

  // Per-document password protection
  if (isPasswordProtected(doc)) {
    if (!isDocumentUnlocked(doc.id)) {
      return {
        ...doc,
        contentJson: vaultLockedPlaceholderJson(),
        vaultLocked: true,
      }
    }
    const password = getDocumentPassword(doc.id)
    if (!password) {
      return {
        ...doc,
        contentJson: vaultLockedPlaceholderJson(),
        vaultLocked: true,
      }
    }
    try {
      const contentJson = await decryptContentJson(password, doc.contentJson)
      return { ...doc, contentJson, vaultLocked: false }
    } catch {
      return {
        ...doc,
        contentJson: vaultLockedPlaceholderJson(),
        vaultLocked: true,
      }
    }
  }

  // Folder vault
  const folder = folders.find((item) => item.id === doc.folderId)
  if (!folder?.isVault) {
    return {
      ...doc,
      contentJson: vaultLockedPlaceholderJson(),
      vaultLocked: true,
    }
  }
  if (!isVaultUnlocked(folder.id)) {
    return {
      ...doc,
      contentJson: vaultLockedPlaceholderJson(),
      vaultLocked: true,
    }
  }
  const password = getVaultPassword(folder.id)
  if (!password) {
    return {
      ...doc,
      contentJson: vaultLockedPlaceholderJson(),
      vaultLocked: true,
    }
  }
  try {
    const contentJson = await decryptContentJson(password, doc.contentJson)
    return { ...doc, contentJson, vaultLocked: false }
  } catch {
    return {
      ...doc,
      contentJson: vaultLockedPlaceholderJson(),
      vaultLocked: true,
    }
  }
}

export async function maybeEncryptContentJson(
  documentId: string,
  contentJson: string,
  folders: Folder[],
  documents: Array<{ id: string; folderId: string | null }>,
): Promise<string> {
  if (isVaultCipherJson(contentJson)) return contentJson

  // Per-document password — encrypt while the document session is unlocked
  if (isDocumentUnlocked(documentId)) {
    const password = getDocumentPassword(documentId)
    if (!password) {
      throw new Error('Document is locked — unlock before saving')
    }
    return encryptContentJson(password, contentJson)
  }

  const doc = documents.find((item) => item.id === documentId)
  const folderId = doc?.folderId
  if (!folderId) return contentJson
  const folder = folders.find((item) => item.id === folderId)
  if (!folder?.isVault) return contentJson
  const password = getVaultPassword(folder.id)
  if (!password) {
    throw new Error('Vault is locked — unlock before saving')
  }
  return encryptContentJson(password, contentJson)
}
