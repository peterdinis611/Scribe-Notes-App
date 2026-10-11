import { createFolder, type Folder } from '@/lib/db/api'
import { promptInput } from '@/lib/input-dialog'
import { createVaultVerifier } from '@/lib/vault/crypto'
import { toast } from '@/lib/toast'
import type { AppDispatch } from '@/store/index'
import { setLibraryView } from '@/store/documentsSlice'
import { updateExpandedFolderIds, updateFolders } from '@/store/foldersSlice'

type Translate = (key: string, options?: Record<string, unknown>) => string

export async function createLibraryFolder(
  input: {
    name: string
    parentId?: string | null
    isVault?: boolean
    vaultVerifier?: string | null
  },
  dispatch: AppDispatch,
): Promise<Folder> {
  const name = input.name.trim()
  if (!name) {
    throw new Error('Folder name is required')
  }

  const folder = await createFolder({
    name,
    parentId: input.parentId ?? null,
    isVault: input.isVault ?? false,
    vaultVerifier: input.vaultVerifier ?? null,
  })

  dispatch(updateFolders((prev) => (prev.some((item) => item.id === folder.id) ? prev : [...prev, folder])))
  dispatch(
    updateExpandedFolderIds((prev) => {
      const next = new Set(prev)
      if (folder.parentId) next.add(folder.parentId)
      next.add(folder.id)
      return [...next]
    }),
  )
  dispatch(setLibraryView('folders'))

  return folder
}

export async function promptAndCreateFolder({
  t,
  dispatch,
  parentId = null,
  title,
  isVault = false,
  vaultVerifier = null,
}: {
  t: Translate
  dispatch: AppDispatch
  parentId?: string | null
  title?: string
  isVault?: boolean
  vaultVerifier?: string | null
}): Promise<Folder | null> {
  const name = await promptInput({
    title: title ?? (parentId ? t('library.newSubfolder') : t('library.newFolder')),
    placeholder: t('library.folderNamePlaceholder'),
    confirmLabel: t('common.create'),
  })
  if (!name) return null

  try {
    const folder = await createLibraryFolder(
      { name, parentId, isVault, vaultVerifier },
      dispatch,
    )
    toast.success(
      isVault ? t('toasts.vaultFolderCreated') : t('toasts.folderCreated'),
      folder.name,
    )
    return folder
  } catch (error) {
    toast.error(t('toasts.folderCreateError'), String(error))
    return null
  }
}

/** Wizard: name → password → confirm → encrypted vault folder. */
export async function promptAndCreateVaultFolder({
  t,
  dispatch,
  parentId = null,
}: {
  t: Translate
  dispatch: AppDispatch
  parentId?: string | null
}): Promise<Folder | null> {
  const name = await promptInput({
    title: parentId ? t('library.newVaultSubfolder') : t('library.newVaultFolder'),
    description: t('vault.createConfirm'),
    placeholder: t('library.folderNamePlaceholder'),
    confirmLabel: t('common.next'),
  })
  if (!name) return null

  const password = await promptInput({
    title: t('vault.setPasswordTitle'),
    description: t('vault.setPasswordDescription'),
    placeholder: t('vault.passwordPlaceholder'),
    password: true,
    confirmLabel: t('common.next'),
  })
  if (!password) return null
  if (password.trim().length < 4) {
    toast.error(t('vault.passwordTooShort'))
    return null
  }

  const confirm = await promptInput({
    title: t('vault.doc.confirmTitle'),
    description: t('vault.doc.confirmDescription'),
    placeholder: t('vault.passwordPlaceholder'),
    password: true,
    confirmLabel: t('vault.createOk'),
  })
  if (confirm === null) return null
  if (confirm !== password) {
    toast.error(t('vault.doc.passwordMismatch'))
    return null
  }

  try {
    const vaultVerifier = await createVaultVerifier(password)
    const folder = await createLibraryFolder(
      { name, parentId, isVault: true, vaultVerifier },
      dispatch,
    )
    toast.success(t('toasts.vaultFolderCreated'), folder.name)
    return folder
  } catch (error) {
    toast.error(t('toasts.folderCreateError'), String(error))
    return null
  }
}
