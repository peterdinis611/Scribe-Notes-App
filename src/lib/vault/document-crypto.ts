import type { Document, Folder } from '@/lib/db/api'
import {
  decryptContentJson,
  encryptContentJson,
  isVaultCipherJson,
  vaultLockedPlaceholderJson,
} from '@/lib/vault/crypto'
import { getVaultPassword, isVaultUnlocked } from '@/lib/vault/session'

export async function maybeDecryptDocument(
  doc: Document,
  folders: Folder[],
): Promise<Document & { vaultLocked?: boolean }> {
  if (!isVaultCipherJson(doc.contentJson)) return doc
  const folder = folders.find((item) => item.id === doc.folderId)
  if (!folder?.isVault) return doc
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
