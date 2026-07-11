import { useEffect } from 'react'
import { RouterProvider } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { listDocuments, listFolders, getStorageSettings } from '@/lib/db/api'
import { applyThemeSettings } from '@/lib/themes/apply'
import { toast } from '@/lib/toast'
import { useActiveDocumentLoader } from '@/hooks/useActiveDocumentLoader'
import { useI18nSync } from '@/hooks/useI18nSync'
import { useTemplateCollectionsBootstrap } from '@/hooks/useTemplateCollections'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setDocuments } from '@/store/documentsSlice'
import { setFolders } from '@/store/foldersSlice'
import { setStorageSettings } from '@/store/settingsSlice'
import { persistStorageFolderAccessGranted } from '@/store/persistence'
import { router } from '@/router'

function useThemeSync() {
  const themeSettings = useAppSelector((state) => state.settings.themeSettings)

  useEffect(() => {
    applyThemeSettings(themeSettings)

    if (themeSettings.themeId !== 'system') return

    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyThemeSettings(themeSettings)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [themeSettings])
}

function useDocumentBootstrap() {
  const dispatch = useAppDispatch()

  useEffect(() => {
    async function bootstrap() {
      const [docs, folders] = await Promise.all([listDocuments(), listFolders()])
      dispatch(setDocuments(docs))
      dispatch(setFolders(folders))
    }

    bootstrap()
  }, [dispatch])
}

function useStorageBootstrap() {
  const dispatch = useAppDispatch()

  useEffect(() => {
    getStorageSettings()
      .then((settings) => {
        dispatch(setStorageSettings(settings))
        if (settings.folderAccessGranted) {
          persistStorageFolderAccessGranted(true)
        }
      })
      .catch(() => undefined)
  }, [dispatch])
}

export default function App() {
  useI18nSync()
  useThemeSync()
  useDocumentBootstrap()
  useStorageBootstrap()
  const { t } = useTranslation()
  const { error: templateCollectionsError } = useTemplateCollectionsBootstrap()
  useActiveDocumentLoader()

  useEffect(() => {
    if (!templateCollectionsError) return
    toast.error(t('toasts.templatesLoadError'), templateCollectionsError.message)
  }, [templateCollectionsError, t])

  return <RouterProvider router={router} />
}
