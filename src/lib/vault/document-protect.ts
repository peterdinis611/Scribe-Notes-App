import { confirm } from '@tauri-apps/plugin-dialog'
import {
  fetchDocumentFresh,
  listDocuments,
  updateDocument,
  type Document,
} from '@/lib/db/api'
import { clearDocumentCache, getCachedParsedContent, invalidateDocumentCache } from '@/lib/cache/document-cache'
import { promptInput } from '@/lib/input-dialog'
import { setEditorContent } from '@/lib/editor/view-ready'
import {
  createVaultVerifier,
  encryptContentJson,
  isVaultCipherJson,
} from '@/lib/vault/crypto'
import {
  documentVaultRamFolderId,
  getDocumentPassword,
  isDocumentUnlocked,
  lockDocument,
  unlockDocument,
} from '@/lib/vault/session'
import { vaultRamRemove, vaultRamTextFromDocument, vaultRamUpsert } from '@/lib/vault/ram-index'
import { editorRefs } from '@/store/editorRefs'
import { store } from '@/store/index'
import { setActiveDocument, setDocuments } from '@/store/documentsSlice'

const MIN_PASSWORD_LENGTH = 4

export function isDocumentPasswordProtected(doc: Document | null | undefined): boolean {
  return Boolean(doc?.vaultVerifier && doc.vaultVerifier.length > 0)
}

async function refreshDocumentList() {
  const docs = await listDocuments()
  store.dispatch(setDocuments(docs))
}

async function reloadActiveDocument(id: string) {
  invalidateDocumentCache(id)
  const next = await fetchDocumentFresh(id)
  store.dispatch(setActiveDocument(next))
  await refreshDocumentList()
  const editor = editorRefs.editor
  if (editor) {
    editor.commands.blur()
    setEditorContent(editor, getCachedParsedContent(next), { emitUpdate: false })
  }
  return next
}

async function syncDocumentRamIndex(doc: Document) {
  if (!isDocumentPasswordProtected(doc) || isVaultCipherJson(doc.contentJson)) {
    await vaultRamRemove(doc.id)
    return
  }
  if (!isDocumentUnlocked(doc.id)) {
    await vaultRamRemove(doc.id)
    return
  }
  await vaultRamUpsert({
    documentId: doc.id,
    folderId: documentVaultRamFolderId(doc.id),
    title: doc.title,
    text: vaultRamTextFromDocument(doc.title, doc.contentJson),
  })
}

function currentPlainContentJson(doc: Document): string {
  const editor = editorRefs.editor
  if (editor && !doc.vaultLocked) {
    return JSON.stringify(editor.getJSON())
  }
  return doc.contentJson
}

export async function protectDocumentWithPassword(
  doc: Document,
  t: (key: string, opts?: Record<string, unknown>) => string,
): Promise<Document | null> {
  if (isDocumentPasswordProtected(doc)) return null
  if (isVaultCipherJson(doc.contentJson)) return null

  const folder = store.getState().folders.folders.find((item) => item.id === doc.folderId)
  if (folder?.isVault) {
    throw new Error(t('vault.doc.alreadyInVault'))
  }

  await editorRefs.flushAutoSave?.()

  const password = await promptInput({
    title: t('vault.doc.protectTitle'),
    description: t('vault.doc.protectDescription'),
    placeholder: t('vault.passwordPlaceholder'),
    confirmLabel: t('vault.doc.protectOk'),
    password: true,
  })
  if (!password) return null
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(t('vault.passwordTooShort'))
  }

  const confirmPassword = await promptInput({
    title: t('vault.doc.confirmTitle'),
    description: t('vault.doc.confirmDescription'),
    placeholder: t('vault.passwordPlaceholder'),
    confirmLabel: t('vault.doc.protectOk'),
    password: true,
  })
  if (!confirmPassword) return null
  if (confirmPassword !== password) {
    throw new Error(t('vault.doc.passwordMismatch'))
  }

  const plain = currentPlainContentJson(doc)
  const verifier = await createVaultVerifier(password)
  const cipher = await encryptContentJson(password, plain)

  await unlockDocument(doc.id, password, verifier)
  const saved = await updateDocument({
    id: doc.id,
    contentJson: cipher,
    vaultVerifier: verifier,
  })
  await refreshDocumentList()
  store.dispatch(setActiveDocument(saved))
  await syncDocumentRamIndex(saved)
  return saved
}

export async function unlockPasswordDocument(
  doc: Document,
  t: (key: string, opts?: Record<string, unknown>) => string,
): Promise<Document | null> {
  if (!isDocumentPasswordProtected(doc)) return null

  const password = await promptInput({
    title: t('vault.doc.unlockTitle'),
    description: t('vault.doc.unlockDescription', { title: doc.title }),
    placeholder: t('vault.passwordPlaceholder'),
    confirmLabel: t('vault.doc.unlock'),
    password: true,
  })
  if (!password) return null

  const ok = await unlockDocument(doc.id, password, doc.vaultVerifier)
  if (!ok) {
    throw new Error(t('vault.unlockFailed'))
  }

  clearDocumentCache()
  const next = await reloadActiveDocument(doc.id)
  await syncDocumentRamIndex(next)
  return next
}

export async function lockPasswordDocument(doc: Document): Promise<Document | null> {
  if (!isDocumentPasswordProtected(doc)) return null
  await editorRefs.flushAutoSave?.()
  lockDocument(doc.id)
  await vaultRamRemove(doc.id)
  clearDocumentCache()
  return reloadActiveDocument(doc.id)
}

export async function removeDocumentPassword(
  doc: Document,
  t: (key: string, opts?: Record<string, unknown>) => string,
): Promise<Document | null> {
  if (!isDocumentPasswordProtected(doc)) return null

  if (!isDocumentUnlocked(doc.id) || doc.vaultLocked) {
    throw new Error(t('vault.doc.unlockFirst'))
  }

  const ok = await confirm(t('vault.doc.removeConfirm'), {
    title: t('vault.doc.removeTitle'),
    kind: 'warning',
  })
  if (!ok) return null

  await editorRefs.flushAutoSave?.()
  const password = getDocumentPassword(doc.id)
  if (!password) {
    throw new Error(t('vault.doc.unlockFirst'))
  }

  const plain = currentPlainContentJson(doc)
  // Drop the session before save so maybeEncrypt does not re-seal plaintext.
  lockDocument(doc.id)
  const saved = await updateDocument({
    id: doc.id,
    contentJson: plain,
    clearVaultVerifier: true,
  })
  await vaultRamRemove(doc.id)
  await refreshDocumentList()
  const next = { ...saved, vaultVerifier: null, vaultLocked: false }
  store.dispatch(setActiveDocument(next))
  const editor = editorRefs.editor
  if (editor) {
    setEditorContent(editor, getCachedParsedContent(next), { emitUpdate: false })
  }
  return next
}
