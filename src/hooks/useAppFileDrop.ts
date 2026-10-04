import { useEffect, useRef, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import {
  fileNameFromPath,
  filterImportableDocumentPaths,
  importDocumentsFromPaths,
} from '@/lib/import-document'
import type { Document } from '@/lib/db/api'

export type AppFileDropHandlers = {
  onImported: (docs: Document[]) => void | Promise<void>
  t: (key: string, options?: Record<string, unknown>) => string
  toastSuccess: (title: string, detail?: string) => void
  toastError: (title: string, detail?: string) => void
  toastInfo: (title: string, detail?: string) => void
}

/**
 * Native window file drag-and-drop (Tauri). Accepts one or many document files.
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
    let disposed = false
    let unlisten: (() => void) | undefined

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

        const importable = filterImportableDocumentPaths(paths)
        if (importable.length === 0) {
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
            // Import one-by-one so progress toasts stay ordered; shared helper is sequential.
            const result = await importDocumentsFromPaths(importable)
            if (result.imported.length > 0) {
              await h.onImported(result.imported)
              if (result.imported.length === 1) {
                h.toastSuccess(
                  h.t('fileDrop.importedOne'),
                  result.imported[0]!.title,
                )
              } else {
                h.toastSuccess(
                  h.t('fileDrop.importedMany', { count: result.imported.length }),
                )
              }
            }

            if (result.skipped.length > 0) {
              h.toastInfo(
                h.t('fileDrop.skipped', { count: result.skipped.length }),
                result.skipped.slice(0, 3).map(fileNameFromPath).join(', '),
              )
            }

            if (result.failed.length > 0) {
              const first = result.failed[0]!
              h.toastError(
                h.t('fileDrop.failed', { count: result.failed.length }),
                `${fileNameFromPath(first.path)}: ${first.error}`,
              )
            }
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
        // Not in Tauri / permissions — drop silently unavailable.
      })

    return () => {
      disposed = true
      unlisten?.()
    }
  }, [])

  return { active, busy, hoverCount }
}
