import { invoke } from '@/lib/tauri'
import { tiptapToPlainText } from '@/lib/export/plain-text'

/** RAM overlay for unlocked vault notes — plaintext never written to SQLite. */
export function vaultRamUpsert(note: {
  documentId: string
  folderId: string
  title: string
  text: string
}) {
  return invoke<void>('nlp_vault_index_put', { input: note })
}

export function vaultRamRemove(documentId: string) {
  return invoke<void>('nlp_vault_index_remove', { documentId })
}

export function vaultRamClearFolder(folderId: string) {
  return invoke<void>('nlp_vault_index_clear_folder', { folderId })
}

export function vaultRamTextFromDocument(title: string, contentJson: string) {
  return `${title}\n${tiptapToPlainText(contentJson)}`
}

export async function syncUnlockedVaultFolder(
  folderId: string,
  documents: Array<{ id: string; folderId: string | null; title: string; contentJson: string }>,
) {
  for (const doc of documents) {
    if (doc.folderId !== folderId) continue
    await vaultRamUpsert({
      documentId: doc.id,
      folderId,
      title: doc.title,
      text: vaultRamTextFromDocument(doc.title, doc.contentJson),
    })
  }
}
