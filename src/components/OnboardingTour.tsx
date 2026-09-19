import { useCallback, useEffect, useRef } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import {
  destroyAppTour,
  runAppTour,
  subscribeAppTourRequest,
} from '@/lib/app-tour'
import { resolveLibraryEditorDocumentId } from '@/lib/libraries/switch'
import { ROUTES } from '@/lib/routes'
import { persistOnboardingDismissed, readOnboardingDismissed, readSetupCompleted } from '@/store/persistence'
import { store } from '@/store/index'
import { useAppDispatch } from '@/store/hooks'
import {
  setActiveDocumentId,
  setFocusMode,
  setLibraryView,
  setPanelRailExpanded,
  setReadingMode,
  setSidebarOpen,
} from '@/store/documentsSlice'

type OnboardingTourProps = {
  /** When false, the tour stays closed (e.g. setup wizard still running). */
  enabled?: boolean
  onFinished?: () => void
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

async function waitForSelector(selector: string, timeoutMs = 4000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    if (document.querySelector(selector)) return true
    await wait(50)
  }
  return false
}

/**
 * Product tour host powered by driver.js.
 * Auto-starts once after setup for first-run users; can be replayed via `requestAppTour()`.
 */
export function OnboardingTour({ enabled = true, onFinished }: OnboardingTourProps) {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const runningRef = useRef(false)
  const autoStartedRef = useRef(false)

  const finish = useCallback(() => {
    persistOnboardingDismissed(true)
    runningRef.current = false
    onFinished?.()
  }, [onFinished])

  const prepareWorkspace = useCallback(async () => {
    dispatch(setFocusMode(false))
    dispatch(setReadingMode(false))
    dispatch(setPanelRailExpanded(true))
    dispatch(setLibraryView('folders'))
    dispatch(setSidebarOpen(true))

    const editorId = resolveLibraryEditorDocumentId(store.getState().documents)
    if (editorId) {
      dispatch(setActiveDocumentId(editorId))
      await navigate(ROUTES.document(editorId))
      dispatch(setSidebarOpen(true))
      await waitForSelector('[data-tour="editor-canvas"]')
    }

    await waitForSelector('[data-tour="sidebar-rail"]')
    await wait(160)
  }, [dispatch, navigate])

  const startTour = useCallback(
    async (options?: { force?: boolean }) => {
      if (!enabled && !options?.force) return
      if (runningRef.current) {
        destroyAppTour()
        runningRef.current = false
      }
      runningRef.current = true
      try {
        await prepareWorkspace()
        runAppTour({
          t: (key, opts) => t(key, opts),
          onDestroyed: finish,
        })
      } catch {
        finish()
      }
    },
    [enabled, finish, prepareWorkspace, t],
  )

  useEffect(() => {
    if (!enabled) return
    if (autoStartedRef.current) return
    if (!readSetupCompleted() || readOnboardingDismissed()) return
    autoStartedRef.current = true
    void startTour()
  }, [enabled, startTour])

  useEffect(() => {
    return subscribeAppTourRequest(() => {
      void startTour({ force: true })
    })
  }, [startTour])

  useEffect(() => {
    return () => {
      destroyAppTour()
    }
  }, [])

  return null
}
