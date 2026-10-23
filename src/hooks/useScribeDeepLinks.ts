import { useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { listen } from '@tauri-apps/api/event'
import { OPEN_DEEP_LINK_EVENT, parseScribeDeepLink } from '@/lib/deep-links'
import { openWebClipNote } from '@/lib/capture/web-clip'
import { ROUTES } from '@/lib/routes'
import { isTauriRuntime } from '@/lib/tauri'
import { useAppDispatch } from '@/store/hooks'
import { setActiveDocumentId, setRevisionHistoryOpen } from '@/store/documentsSlice'
import { toast } from '@/lib/toast'
import { useTranslation } from 'react-i18next'

/** Listen for OS / in-app `scribe://` deep links and navigate. */
export function useScribeDeepLinks() {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { t } = useTranslation()

  useEffect(() => {
    function apply(raw: string) {
      const link = parseScribeDeepLink(raw)
      if (!link) return
      if (link.kind === 'doc') {
        dispatch(setActiveDocumentId(link.documentId))
        void navigate(ROUTES.document(link.documentId))
        toast.success(t('toasts.deepLinkOpened'))
        return
      }
      if (link.kind === 'artifact') {
        toast.info(t('toasts.deepLinkArtifact', { id: link.artifactId }))
        return
      }
      if (link.kind === 'revision') {
        dispatch(setActiveDocumentId(link.documentId))
        dispatch(setRevisionHistoryOpen(true))
        void navigate(ROUTES.document(link.documentId))
        toast.success(t('toasts.deepLinkOpened'))
        return
      }
      if (link.kind === 'clip') {
        void openWebClipNote(dispatch, navigate, link)
          .then(() => toast.success(t('toasts.webClipSaved')))
          .catch((error) => toast.error(t('toasts.webClipError'), String(error)))
      }
    }

    let unlisten: (() => void) | undefined
    if (isTauriRuntime()) {
      void listen<string>(OPEN_DEEP_LINK_EVENT, (event) => {
        apply(String(event.payload ?? ''))
      }).then((fn) => {
        unlisten = fn
      })
    }

    const onMessage = (event: MessageEvent) => {
      if (typeof event.data === 'string' && event.data.startsWith('scribe://')) {
        apply(event.data)
      }
    }
    window.addEventListener('message', onMessage)

    return () => {
      unlisten?.()
      window.removeEventListener('message', onMessage)
    }
  }, [dispatch, navigate, t])
}
