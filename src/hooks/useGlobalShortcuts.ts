import { useEffect, useRef } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { openTodayNote } from '@/lib/journal-notes'
import { syncGlobalShortcuts } from '@/lib/global-shortcuts'
import { openQuickNote } from '@/lib/quick-note'
import { toast } from '@/lib/toast'
import { useAppDispatch, useAppSelector } from '@/store/hooks'

async function focusMainWindow() {
  try {
    const window = getCurrentWindow()
    await window.show()
    await window.unminimize()
    await window.setFocus()
  } catch {
    /* ignore — browser / non-Tauri */
  }
}

/** OS-global Quick Note / Today journal — works while Scribe is in the background. */
export function useGlobalShortcuts() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { t } = useTranslation()
  const documents = useAppSelector((state) => state.documents.documents)
  const folders = useAppSelector((state) => state.folders.folders)
  const shortcutOverrides = useAppSelector((state) => state.settings.shortcutOverrides)
  const latest = useRef({ documents, folders, dispatch, navigate, t })
  latest.current = { documents, folders, dispatch, navigate, t }

  useEffect(() => {
    let disposed = false
    let cleanup: (() => Promise<void>) | undefined

    void syncGlobalShortcuts(shortcutOverrides, {
      quickNote: async () => {
        await focusMainWindow()
        const ctx = latest.current
        try {
          await openQuickNote(ctx.documents, ctx.dispatch, ctx.navigate, (key) => ctx.t(key))
        } catch (error) {
          toast.error(String(error))
        }
      },
      todayNote: async () => {
        await focusMainWindow()
        const ctx = latest.current
        try {
          await openTodayNote({
            documents: ctx.documents,
            folders: ctx.folders,
            dispatch: ctx.dispatch,
            navigate: ctx.navigate,
            t: (key, options) => ctx.t(key, options),
          })
        } catch (error) {
          toast.error(ctx.t('journal.openError'), String(error))
        }
      },
    }).then((fn) => {
      if (disposed) {
        void fn()
        return
      }
      cleanup = fn
    })

    return () => {
      disposed = true
      void cleanup?.()
    }
  }, [shortcutOverrides])
}
