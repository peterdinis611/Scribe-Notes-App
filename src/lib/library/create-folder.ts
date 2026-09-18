import { createFolder, type Folder } from '@/lib/db/api'
import { promptInput } from '@/lib/input-dialog'
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
