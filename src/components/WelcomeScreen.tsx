import { useEffect, useMemo } from 'react'
import { CalendarDays, Clock, FileText, FolderInput, Plus } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { DemoGuideButton } from '@/components/DemoGuideButton'
import { pickAndImportFiles } from '@/lib/db/api'
import { toastImportDocumentsResult } from '@/lib/import-document'
import { peekCachedDocument } from '@/lib/cache/document-cache'
import { prefetchDocument } from '@/lib/cache/prefetch-document'
import { prependDocumentSummary } from '@/lib/db/library-sync'
import { openTodayNote } from '@/lib/journal-notes'
import { closeScribeUiSurface } from '@/lib/scribe-ui-host'
import { toast } from '@/lib/toast'
import { ROUTES } from '@/lib/routes'
import { getDisplayKeysForShortcut } from '@/lib/shortcuts'
import { formatRelativeTime } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  setActiveDocument,
  setActiveDocumentId,
  setSaveStatus,
  updateDocuments,
} from '@/store/documentsSlice'
import { setTemplatePickerOpen } from '@/store/settingsSlice'
import { APP_VERSION } from '@/lib/app-version'

export function WelcomeScreen() {
  const documents = useAppSelector((state) => state.documents.documents)
  const folders = useAppSelector((state) => state.folders.folders)
  const recentDocumentIds = useAppSelector((state) => state.documents.recentDocumentIds)
  const shortcutOverrides = useAppSelector((state) => state.settings.shortcutOverrides)
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { t } = useTranslation()

  useEffect(() => {
    void closeScribeUiSurface()
  }, [])

  const newDocKeys = getDisplayKeysForShortcut('newDocument', shortcutOverrides).join('')

  const recentDocuments = useMemo(() => {
    const alive = documents.filter((doc) => doc.deletedAt == null)
    const byId = new Map(alive.map((doc) => [doc.id, doc]))
    const fromHistory = recentDocumentIds
      .map((id) => byId.get(id))
      .filter((doc): doc is (typeof alive)[number] => doc != null)
      .slice(0, 12)

    if (fromHistory.length > 0) return fromHistory

    return [...alive].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 12)
  }, [documents, recentDocumentIds])

  async function handleImport() {
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
  }

  function handleToday() {
    void openTodayNote({
      documents,
      folders,
      dispatch,
      navigate: (route) => void navigate(route),
      t: (key, options) => t(key, options),
    }).catch((error) => toast.error(t('journal.openError'), String(error)))
  }

  function openDocument(id: string) {
    dispatch(setActiveDocumentId(id))
    const cached = peekCachedDocument(id)
    if (cached) dispatch(setActiveDocument(cached))
    else prefetchDocument(id)
    navigate(ROUTES.document(id))
  }

  function openNewDocument() {
    dispatch(setTemplatePickerOpen(true))
  }

  return (
    <div className="welcome-page titlebar-no-drag">
      <div className="welcome-page-inner">
        <header className="welcome-page-hero">
          <h1 className="welcome-page-brand">{t('welcome.brand')}</h1>
          <p className="welcome-page-tagline">{t('welcome.brandTagline')}</p>

          <div className="welcome-page-actions">
            <Button
              variant="default"
              className="welcome-page-primary"
              data-tour="new-document"
              onClick={openNewDocument}
            >
              <Plus className="h-4 w-4" />
              <span>{t('welcome.newDocument')}</span>
              {newDocKeys ? (
                <kbd className="welcome-page-kbd" aria-hidden="true">
                  {newDocKeys}
                </kbd>
              ) : null}
            </Button>
            <Button variant="ghost" className="welcome-page-ghost" onClick={handleToday}>
              <CalendarDays className="h-4 w-4" />
              {t('welcome.todayNote')}
            </Button>
            <Button
              variant="ghost"
              className="welcome-page-ghost"
              onClick={() => void handleImport()}
            >
              <FolderInput className="h-4 w-4" />
              {t('welcome.import')}
            </Button>
            <DemoGuideButton variant="link" className="welcome-page-link" />
          </div>
        </header>

        <section className="welcome-page-recent" aria-labelledby="welcome-recent-heading">
          <div className="welcome-page-recent-head">
            <h2 id="welcome-recent-heading">{t('welcome.recentDocuments')}</h2>
            {documents.length > 0 ? (
              <span>{t('common.total', { count: documents.length })}</span>
            ) : null}
          </div>

          {recentDocuments.length > 0 ? (
            <ul className="welcome-page-list">
              {recentDocuments.map((doc) => (
                <li key={doc.id}>
                  <button
                    type="button"
                    className="welcome-page-row"
                    onClick={() => openDocument(doc.id)}
                  >
                    <FileText className="welcome-page-row-icon h-4 w-4" aria-hidden="true" />
                    <span className="welcome-page-row-title">{doc.title}</span>
                    <span className="welcome-page-row-meta">
                      <Clock className="h-3 w-3" aria-hidden="true" />
                      {formatRelativeTime(doc.updatedAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="welcome-page-empty">
              <p className="welcome-page-empty-title">{t('welcome.noDocuments')}</p>
              <p className="welcome-page-empty-text">{t('welcome.emptyStartHint')}</p>
              <Button variant="default" size="sm" onClick={openNewDocument}>
                <Plus className="h-3.5 w-3.5" />
                {t('welcome.newDocument')}
              </Button>
            </div>
          )}
        </section>

        <p className="welcome-page-version">{t('common.version', { version: APP_VERSION })}</p>
      </div>
    </div>
  )
}
