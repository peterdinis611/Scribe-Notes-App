import { useCallback, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { navigateToDemoGuide } from '@/lib/demo/load-demo-guide'
import { toast } from '@/lib/toast'
import { store } from '@/store/index'
import { useAppDispatch } from '@/store/hooks'

export function useOpenDemoGuide() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const openingRef = useRef(false)

  return useCallback(async () => {
    if (openingRef.current) return
    openingRef.current = true

    try {
      const documents = store.getState().documents.documents
      const result = await navigateToDemoGuide(documents, dispatch, navigate)
      toast.success(
        result.created ? t('toasts.demoCreated') : t('toasts.demoOpened'),
        result.document.title,
      )
    } catch (error) {
      toast.error(t('toasts.demoError'), String(error))
    } finally {
      openingRef.current = false
    }
  }, [dispatch, navigate, t])
}
