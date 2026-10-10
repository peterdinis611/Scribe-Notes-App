import { useEffect, useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { pickAndImportFiles } from '@/lib/db/api'
import { toastImportDocumentsResult } from '@/lib/import-document'
import { peekCachedDocument } from '@/lib/cache/document-cache'
import { prefetchDocument } from '@/lib/cache/prefetch-document'
import { prependDocumentSummary } from '@/lib/db/library-sync'
import { openTodayNote } from '@/lib/journal-notes'
import { toast } from '@/lib/toast'
import { ROUTES } from '@/lib/routes'
import { formatRelativeTime } from '@/lib/utils'
import { openScribeUiSurface, subscribeScribeUiEvents } from '@/lib/scribe-ui-host'
import { isTauriRuntime } from '@/lib/tauri'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  setActiveDocument,
  setActiveDocumentId,
  setSaveStatus,
  updateDocuments,
} from '@/store/documentsSlice'
import { setTemplatePickerOpen } from '@/store/settingsSlice'

/** Welcome chrome — Dioxus surface under Tauri; thin React host for actions. */
export function WelcomeScreen() {
  const documents = useAppSelector((state) => state.documents.documents)
  const folders = useAppSelector((state) => state.folders.folders)
  const recentDocumentIds = useAppSelector((state) => state.documents.recentDocumentIds)
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const recentDocuments = useMemo(() => {
    const alive = documents.filter((doc) => doc.deletedAt == null)
    const byId = new Map(alive.map((doc) => [doc.id, doc]))
    const fromHistory = recentDocumentIds
      .map((id) => byId.get(id))
      .filter((doc): doc is (typeof alive)[number] => doc != null)
      .slice(0, 8)

    if (fromHistory.length > 0) return fromHistory
    return [...alive].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8)
  }, [documents, recentDocumentIds])

  useEffect(() => {
    if (!isTauriRuntime()) return

    void openScribeUiSurface('welcome', {
      recent: recentDocuments.map((doc) => ({
        id: doc.id,
        title: doc.title || t('common.untitled'),
        updatedLabel: formatRelativeTime(doc.updatedAt),
      })),
    })

    return subscribeScribeUiEvents((payload) => {
      switch (payload.event) {
        case 'welcome-new-document':
          dispatch(setTemplatePickerOpen(true))
          break
        case 'welcome-today':
          void openTodayNote({
            documents,
            folders,
            dispatch,
            navigate: (route) => void navigate(route),
            t: (key, options) => t(key, options),
          }).catch((error) => toast.error(t('journal.openError'), String(error)))
          break
        case 'welcome-import':
          void (async () => {
            const result = await pickAndImportFiles()
            if (!result) return
            toastImportDocumentsResult(result, (key, options) => t(key, options))
            if (result.imported.length === 0) return
            for (const doc of result.imported) {
              dispatch(updateDocuments((prev) => prependDocumentSummary(prev, doc)))
            }
            const last = result.imported[result.imported.length - 1]!
            dispatch(setActiveDocumentId(last.id))
            dispatch(setActiveDocument(last))
            dispatch(setSaveStatus('saved'))
            navigate(ROUTES.document(last.id))
          })()
          break
        case 'welcome-open-docs':
          void navigate(ROUTES.docs())
          break
        case 'welcome-open-document':
          if (payload.arg) {
            dispatch(setActiveDocumentId(payload.arg))
            const cached = peekCachedDocument(payload.arg)
            if (cached) dispatch(setActiveDocument(cached))
            else prefetchDocument(payload.arg)
            void navigate(ROUTES.document(payload.arg))
          }
          break
        default:
          break
      }
    })
  }, [dispatch, documents, folders, navigate, recentDocuments, t])

  if (isTauriRuntime()) {
    return (
      <div className="editor-shell editor-shell--home titlebar-no-drag flex min-h-0 flex-1 items-center justify-center p-8">
        <div className="max-w-md text-center">
          <p className="text-[13px] text-[var(--color-muted-foreground)]">
            {t('welcome.brand')}
          </p>
          <p className="mt-2 text-[12px] text-[var(--color-muted-foreground)]">
            {t('common.loading')}
          </p>
          <button
            type="button"
            className="mt-4 rounded-[var(--radius-md)] border border-[var(--color-border)] px-3 py-2 text-[13px]"
            onClick={() => {
              void openScribeUiSurface('welcome', {
                recent: recentDocuments.map((doc) => ({
                  id: doc.id,
                  title: doc.title || t('common.untitled'),
                  updatedLabel: formatRelativeTime(doc.updatedAt),
                })),
              })
            }}
          >
            {t('welcome.brand')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="editor-shell editor-shell--home titlebar-no-drag flex min-h-0 flex-1 items-center justify-center p-8">
      <div className="max-w-md text-center">
        <h1 className="text-[28px] font-bold tracking-[-0.03em]">{t('welcome.brand')}</h1>
        <p className="mt-2 text-[14px] text-[var(--color-muted-foreground)]">
          {t('welcome.brandTagline')}
        </p>
        <button
          type="button"
          className="mt-6 rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2 text-[13px] font-semibold text-white"
          onClick={() => dispatch(setTemplatePickerOpen(true))}
        >
          {t('welcome.newDocument')}
        </button>
      </div>
    </div>
  )
}
