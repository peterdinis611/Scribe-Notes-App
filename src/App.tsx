import { useEffect } from 'react'
import { useAtom, useSetAtom } from 'jotai'
import { RouterProvider } from '@tanstack/react-router'
import { getDocument, listDocuments, scanScribeFiles } from '@/lib/db/api'
import {
  activeDocumentAtom,
  activeDocumentIdAtom,
  documentsAtom,
  saveStatusAtom,
} from '@/store/documents'
import { applyThemeSettings } from '@/lib/themes/apply'
import { themeSettingsAtom } from '@/store/settings'
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

  useEffect(() => {
    async function bootstrap() {
      await scanScribeFiles().catch(() => undefined)
      const docs = await listDocuments()
      setDocuments(docs)
    }

    bootstrap()
  }, [setDocuments])
}

function useActiveDocumentLoader() {
  const [activeId] = useAtom(activeDocumentIdAtom)
  const setActiveDocument = useSetAtom(activeDocumentAtom)
  const setSaveStatus = useSetAtom(saveStatusAtom)

  useEffect(() => {
    if (!activeId) {
      setActiveDocument(null)
      return
    }

    const documentId = activeId
    let cancelled = false

    async function load() {
      try {
        const doc = await getDocument(documentId)
        if (!cancelled) {
          setActiveDocument(doc)
          setSaveStatus('saved')
        }
      } catch {
        if (!cancelled) setSaveStatus('error')
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [activeId, setActiveDocument, setSaveStatus])
}

export default function App() {
  useThemeSync()
  useDocumentBootstrap()
  useActiveDocumentLoader()

  return <RouterProvider router={router} />
}
