import { useEffect } from 'react'
import { useAtom, useSetAtom } from 'jotai'
import { RouterProvider } from '@tanstack/react-router'
import { listDocuments, listFolders } from '@/lib/db/api'
import { documentsAtom } from '@/store/documents'
import { foldersAtom } from '@/store/folders'
import { applyThemeSettings } from '@/lib/themes/apply'
import { themeSettingsAtom } from '@/store/settings'
import { useActiveDocumentLoader } from '@/hooks/useActiveDocumentLoader'
import { router } from '@/router'

function useThemeSync() {
  const [themeSettings] = useAtom(themeSettingsAtom)

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
  const setDocuments = useSetAtom(documentsAtom)
  const setFolders = useSetAtom(foldersAtom)

  useEffect(() => {
    async function bootstrap() {
      const [docs, folders] = await Promise.all([listDocuments(), listFolders()])
      setDocuments(docs)
      setFolders(folders)
    }

    bootstrap()
  }, [setDocuments, setFolders])
}

export default function App() {
  useThemeSync()
  useDocumentBootstrap()
  useActiveDocumentLoader()

  return <RouterProvider router={router} />
}
