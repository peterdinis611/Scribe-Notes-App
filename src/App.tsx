import { useEffect } from 'react'
import { RouterProvider } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { toast } from '@/lib/toast'
import { useActiveDocumentLoader } from '@/hooks/useActiveDocumentLoader'
import { useI18nSync } from '@/hooks/useI18nSync'
import { useTemplateCollectionsBootstrap } from '@/hooks/useTemplateCollections'
import { router } from '@/router'
import { useThemeSync, useDocumentBootstrap, useStorageBootstrap } from './hooks/useAppHooks'

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
