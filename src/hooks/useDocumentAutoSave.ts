import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { Editor } from '@tiptap/react'
import {
  cacheDocument,
  hashContent,
} from '@/lib/cache/document-cache'
import { flushPendingWrites, updateDocument } from '@/lib/db/api'
import { toast } from '@/lib/toast'
import { debounce, extractTitleFromContent } from '@/lib/utils'
import { useAppDispatch } from '@/store/hooks'
import {
  setActiveDocument,
  setSaveStatus,
  updateDocuments,
} from '@/store/documentsSlice'
import { editorRefs } from '@/store/editorRefs'
import type { Document } from '@/lib/db/api'

const AUTO_SAVE_DELAY_MS = 600

type UseDocumentAutoSaveOptions = {
  editor: Editor | null
  activeId: string | null
  viewMode: 'rich' | 'markdown'
  markdownDraftRef: React.MutableRefObject<string>
  manualTitleIdsRef: React.MutableRefObject<Set<string>>
  activeDocumentRef: React.MutableRefObject<Document | null>
}

export function useDocumentAutoSave({
  editor,
  activeId,
  viewMode,
  markdownDraftRef,
  manualTitleIdsRef,
  activeDocumentRef,
}: UseDocumentAutoSaveOptions) {
  const dispatch = useAppDispatch()
  const latestDocIdRef = useRef<string | null>(null)
  const previousDocIdRef = useRef<string | null>(null)
  const editorContentHashRef = useRef<string | null>(null)
  const lastPersistedHashRef = useRef<string | null>(null)
  const saveInFlightRef = useRef<Promise<boolean> | null>(null)

  latestDocIdRef.current = activeId

  const getContentJson = useCallback(() => {
    if (!editor) return null

    if (viewMode === 'markdown') {
      editor.commands.setContent(markdownDraftRef.current, {
        contentType: 'markdown',
        emitUpdate: false,
      })
    }

    return JSON.stringify(editor.getJSON())
  }, [editor, markdownDraftRef, viewMode])

  const persistContent = useCallback(
    async (docId: string, contentJson: string): Promise<boolean> => {
      const contentHash = hashContent(contentJson)
      if (contentHash === lastPersistedHashRef.current) return true

      const title = manualTitleIdsRef.current.has(docId)
        ? activeDocumentRef.current?.title ?? extractTitleFromContent(contentJson)
        : extractTitleFromContent(contentJson)

      try {
        dispatch(setSaveStatus('saving'))
        const updated = cacheDocument(
          await updateDocument({
            id: docId,
            title,
            contentJson,
          }),
        )

        if (latestDocIdRef.current === docId) {
          lastPersistedHashRef.current = contentHash
          editorContentHashRef.current = contentHash
          dispatch(setActiveDocument(updated))
        }

        dispatch(
          updateDocuments((prev) =>
            prev.map((item) =>
              item.id === updated.id
                ? {
                    ...item,
                    title: updated.title,
                    filePath: updated.filePath,
                    updatedAt: updated.updatedAt,
                  }
                : item,
            ),
          ),
        )

        if (latestDocIdRef.current === docId) {
          dispatch(setSaveStatus('saved'))
        }

        return true
      } catch {
        if (latestDocIdRef.current === docId) {
          dispatch(setSaveStatus('error'))
          toast.error('Ukladanie zlyhalo')
        }
        return false
      }
    },
    [activeDocumentRef, dispatch, manualTitleIdsRef],
  )

  const saveNow = useCallback(
    async (docId: string): Promise<boolean> => {
      if (!editor) return false

      const contentJson = getContentJson()
      if (!contentJson) return false

      const run = persistContent(docId, contentJson)
      saveInFlightRef.current = run
      const ok = await run
      if (saveInFlightRef.current === run) {
        saveInFlightRef.current = null
      }
      return ok
    },
    [editor, getContentJson, persistContent],
  )

  const scheduleSave = useMemo(
    () =>
      debounce((docId: string) => {
        void saveNow(docId)
      }, AUTO_SAVE_DELAY_MS),
    [saveNow],
  )

  const flushSave = useCallback(async () => {
    if (!activeId || !editor) return

    scheduleSave.flush()
    await saveInFlightRef.current
    await saveNow(activeId)
    await flushPendingWrites(activeId)
  }, [activeId, editor, saveNow, scheduleSave])

  const markDirty = useCallback(() => {
    dispatch(setSaveStatus('dirty'))
  }, [dispatch])

  const queueSave = useCallback(
    (docId: string) => {
      if (!editor) return

      const contentJson = getContentJson()
      if (!contentJson) return

      const contentHash = hashContent(contentJson)
      if (contentHash === lastPersistedHashRef.current) return

      editorContentHashRef.current = contentHash
      markDirty()
      scheduleSave(docId)
    },
    [editor, getContentJson, markDirty, scheduleSave],
  )

  useEffect(() => {
    editorRefs.flushAutoSave = flushSave
    return () => {
      editorRefs.flushAutoSave = null
    }
  }, [flushSave])

  useEffect(() => {
    const previousId = previousDocIdRef.current
    previousDocIdRef.current = activeId

    if (previousId && previousId !== activeId) {
      scheduleSave.cancel()
      void (async () => {
        scheduleSave.flush()
        await saveInFlightRef.current
        await saveNow(previousId)
        await flushPendingWrites(previousId)
      })()
    }
  }, [activeId, saveNow, scheduleSave])

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        void flushSave()
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      scheduleSave.cancel()
      void flushSave()
    }
  }, [flushSave, scheduleSave])

  return {
    queueSave,
    flushSave,
    editorContentHashRef,
    lastPersistedHashRef,
    markDirty,
  }
}
