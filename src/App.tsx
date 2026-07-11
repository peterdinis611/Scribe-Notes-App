import { useEffect } from 'react'
import { RouterProvider } from '@tanstack/react-router'
import { listDocuments, listFolders } from '@/lib/db/api'
import { applyThemeSettings } from '@/lib/themes/apply'
import { toast } from '@/lib/toast'
import { useActiveDocumentLoader } from '@/hooks/useActiveDocumentLoader'
import { useTemplateCollectionsBootstrap } from '@/hooks/useTemplateCollections'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setDocuments } from '@/store/documentsSlice'
import { setFolders } from '@/store/foldersSlice'
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

export default function App() {
  useThemeSync()
  useDocumentBootstrap()
  const { error: templateCollectionsError } = useTemplateCollectionsBootstrap()
  useActiveDocumentLoader()

  useEffect(() => {
    if (!templateCollectionsError) return
    toast.error('Nepodarilo sa načítať šablóny', templateCollectionsError.message)
  }, [templateCollectionsError])

  return <RouterProvider router={router} />
}
