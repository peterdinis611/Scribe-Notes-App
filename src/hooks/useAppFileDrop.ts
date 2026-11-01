import { useEffect, useRef, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import {
  filterImportableDocumentPaths,
  importDocumentsFromPathsOrFolders,
  toastImportDocumentsResult,
} from '@/lib/import-document'
import type { Document } from '@/lib/db/api'
import { isTauriRuntime } from '@/lib/tauri'

export type AppFileDropHandlers = {
  onImported: (docs: Document[]) => void | Promise<void>
  t: (key: string, options?: Record<string, unknown>) => string
  toastSuccess: (title: string, detail?: string) => void
  toastError: (title: string, detail?: string) => void
  toastInfo: (title: string, detail?: string) => void
}

/**
 * Native window file drag-and-drop (Tauri). Accepts files and folders
 * (folders expand to every supported document underneath).
 */
export function useAppFileDrop(handlers: AppFileDropHandlers) {
  const [active, setActive] = useState(false)
  const [busy, setBusy] = useState(false)
  const [hoverCount, setHoverCount] = useState(0)
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers
  const enterPathsRef = useRef<string[]>([])
  const busyRef = useRef(false)

  useEffect(() => {
    if (!isTauriRuntime()) return

    let disposed = false
    let unlisten: (() => void) | undefined

    try {
      void getCurrentWindow()
        .onDragDropEvent((event) => {
          if (disposed) return
          const { payload } = event

          if (payload.type === 'enter') {
            enterPathsRef.current = payload.paths
            const importable = filterImportableDocumentPaths(payload.paths)
            setHoverCount(importable.length > 0 ? importable.length : payload.paths.length)
            setActive(importable.length > 0 || payload.paths.length > 0)
            return
          }

          if (payload.type === 'over') {
            setActive(true)
            return
          }

          if (payload.type === 'leave') {
            enterPathsRef.current = []
            setActive(false)
            setHoverCount(0)
            return
          }

          if (payload.type !== 'drop') return

          const paths = payload.paths.length > 0 ? payload.paths : enterPathsRef.current
          enterPathsRef.current = []
          setActive(false)
          setHoverCount(0)

          if (busyRef.current) {
            handlersRef.current.toastInfo(handlersRef.current.t('fileDrop.busy'))
            return
          }

          // Directories are expanded in Rust; keep hover feedback for any drop payload.
          const maybeFiles = filterImportableDocumentPaths(paths)
          if (maybeFiles.length === 0 && paths.length === 0) {
            handlersRef.current.toastError(
              handlersRef.current.t('fileDrop.unsupportedTitle'),
              handlersRef.current.t('fileDrop.unsupportedBody'),
            )
            return
          }

          busyRef.current = true
          setBusy(true)

          void (async () => {
            const h = handlersRef.current
            try {
              const result = await importDocumentsFromPathsOrFolders(paths)
              if (result.imported.length === 0 && result.failed.length === 0) {
                h.toastError(
                  h.t('fileDrop.unsupportedTitle'),
                  h.t('fileDrop.unsupportedBody'),
                )
                return
              }
              if (result.imported.length > 0) {
                await h.onImported(result.imported)
              }
              toastImportDocumentsResult(result, h.t)
            } catch (error) {
              h.toastError(h.t('fileDrop.error'), String(error))
            } finally {
              busyRef.current = false
              setBusy(false)
            }
          })()
        })
        .then((fn) => {
          if (disposed) fn()
          else unlisten = fn
        })
        .catch(() => {
          // Permissions / drag-drop unavailable.
        })
    } catch {
      // getCurrentWindow() throws sync when `__TAURI_INTERNALS__` is missing.
    }

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [])

  return { active, busy, hoverCount }
}
