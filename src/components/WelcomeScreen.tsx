import { useMemo } from 'react'
import { ArrowRight, CalendarDays, Clock, FileText, FolderInput, GitBranch, Plus } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { DemoGuideButton } from '@/components/DemoGuideButton'
import { pickAndImportFile } from '@/lib/db/api'
import { peekCachedDocument } from '@/lib/cache/document-cache'
import { prependDocumentSummary } from '@/lib/db/library-sync'
import { openTodayNote } from '@/lib/journal-notes'
import { toast } from '@/lib/toast'
import { ROUTES } from '@/lib/routes'
import { cn, formatRelativeTime } from '@/lib/utils'
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
  const uiSkin = useAppSelector((state) => state.settings.uiSkin)
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

  async function handleImport() {
    const doc = await pickAndImportFile()
    if (!doc) return
    dispatch(updateDocuments((prev) => prependDocumentSummary(prev, doc)))
    dispatch(setActiveDocumentId(doc.id))
    dispatch(setActiveDocument(doc))
    dispatch(setSaveStatus('saved'))
    toast.success(t('toasts.documentImported'), doc.title)
    navigate(ROUTES.document(doc.id))
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
    navigate(ROUTES.document(id))
  }

  const isPress = uiSkin === 'press'

  const steps = (
    <ol className={isPress ? 'welcome-steps welcome-steps--press' : 'welcome-steps'} aria-label={t('welcome.stepsLabel')}>
      <li>
        <span className="welcome-step-index" aria-hidden="true">
          01
        </span>
        <span>{t('welcome.stepWrite')}</span>
      </li>
      <li>
        <span className="welcome-step-index" aria-hidden="true">
          02
        </span>
        <span>{t('welcome.stepLink')}</span>
      </li>
      <li>
        <span className="welcome-step-index" aria-hidden="true">
          03
        </span>
        <span>{t('welcome.stepExport')}</span>
      </li>
    </ol>
  )

  const moreLinks = (
    <div className={isPress ? 'welcome-actions-more' : 'welcome-more'}>
      <DemoGuideButton variant="link" className={isPress ? 'welcome-link' : undefined} />
      <button
        type="button"
        title={t('welcome.connectionMapHint')}
        className={isPress ? 'welcome-link' : 'welcome-more-link'}
        onClick={() => void navigate(ROUTES.graph())}
      >
        <GitBranch className="h-3.5 w-3.5" aria-hidden="true" />
        {t('welcome.connectionMap')}
      </button>
    </div>
  )

  const recentSection = (
    <section
      className={isPress ? 'welcome-recent' : 'welcome-rail'}
      aria-labelledby="welcome-recent-heading"
    >
      <div className={isPress ? 'welcome-recent-head' : 'welcome-rail-head'}>
        <h2 id="welcome-recent-heading" className={isPress ? 'welcome-recent-label' : 'welcome-rail-label'}>
          {t(isPress ? 'welcome.press.recentDocuments' : 'welcome.recentDocuments')}
        </h2>
        {documents.length > 0 && (
          <span className={isPress ? 'welcome-recent-count' : 'welcome-rail-count'}>
            {t('common.total', { count: documents.length })}
          </span>
        )}
      </div>

      {recentDocuments.length > 0 ? (
        <ul className={isPress ? 'welcome-recent-list' : 'welcome-rail-list'}>
          {recentDocuments.map((doc, index) => (
            <li key={doc.id} style={{ ['--welcome-i' as string]: String(index) }}>
              <button
                type="button"
                className={isPress ? 'welcome-recent-row' : 'welcome-rail-row'}
                onClick={() => openDocument(doc.id)}
              >
                <span className={isPress ? 'welcome-recent-icon' : 'welcome-rail-icon'} aria-hidden="true">
                  <FileText className="h-4 w-4" />
                </span>
                <span className={isPress ? 'welcome-recent-title' : 'welcome-rail-title'}>{doc.title}</span>
                <span className={isPress ? 'welcome-recent-meta' : 'welcome-rail-meta'}>
                  <Clock className="h-3 w-3" />
                  {formatRelativeTime(doc.updatedAt)}
                </span>
                <ArrowRight
                  className={cn(isPress ? 'welcome-recent-arrow' : 'welcome-rail-arrow', 'h-4 w-4')}
                  aria-hidden="true"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className={isPress ? 'welcome-empty' : 'welcome-rail-empty'}>
          <p className={isPress ? 'welcome-empty-title' : 'welcome-rail-empty-title'}>
            {t(isPress ? 'welcome.press.noDocuments' : 'welcome.noDocuments')}
          </p>
          <p className={isPress ? 'welcome-empty-text' : 'welcome-rail-empty-text'}>
            {t(isPress ? 'welcome.press.noDocumentsHint' : 'welcome.noDocumentsHint')}
          </p>
          <div className={isPress ? 'welcome-empty-actions' : 'welcome-rail-empty-actions'}>
            <DemoGuideButton size="sm" />
          </div>
        </div>
      )}
    </section>
  )

  if (isPress) {
    return (
      <div className="welcome-desk titlebar-no-drag">
        <div className="welcome-desk-grain" aria-hidden="true" />
        <p className="welcome-stamp" aria-hidden="true">
          {t('welcome.brand')}
        </p>

        <div className="welcome-sheet">
          <div className="welcome-margin-rule" aria-hidden="true" />

          <header className="welcome-hero">
            <p className="welcome-eyebrow">{t('welcome.press.eyebrow')}</p>
            <h1 className="welcome-brand">{t('welcome.brand')}</h1>
            <p className="welcome-tagline">{t('welcome.press.brandTagline')}</p>
            <div className="welcome-actions">
              <div className="welcome-actions-primary">
                <Button
                  variant="default"
                  size="default"
                  className="welcome-cta-primary"
                  onClick={() => dispatch(setTemplatePickerOpen(true))}
                >
                  <Plus className="h-4 w-4" />
                  {t('welcome.newDocument')}
                </Button>
                <Button
                  variant="outline"
                  size="default"
                  className="welcome-cta-secondary"
                  onClick={handleToday}
                >
                  <CalendarDays className="h-4 w-4" />
                  {t('welcome.todayNote')}
                </Button>
                <Button
                  variant="outline"
                  size="default"
                  className="welcome-cta-secondary"
                  onClick={() => void handleImport()}
                >
                  <FolderInput className="h-4 w-4" />
                  {t('welcome.import')}
                </Button>
              </div>
              {steps}
              {moreLinks}
            </div>
          </header>

          {recentSection}
          <p className="welcome-version welcome-version--press">{t('common.version', { version: APP_VERSION })}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="welcome-atelier titlebar-no-drag">
      <div className="welcome-atelier-glow" aria-hidden="true" />
      <div className="welcome-atelier-grain" aria-hidden="true" />

      <div className="welcome-compose">
        <header className="welcome-lead">
          <p className="welcome-atelier-eyebrow">{t('welcome.eyebrow')}</p>
          <h1 className="welcome-atelier-brand">{t('welcome.brand')}</h1>
          <p className="welcome-atelier-tagline">{t('welcome.brandTagline')}</p>

          <div className="welcome-cta-stack">
            <Button
              variant="default"
              size="default"
              className="welcome-atelier-primary"
              onClick={() => dispatch(setTemplatePickerOpen(true))}
            >
              <Plus className="h-4 w-4" />
              {t('welcome.newDocument')}
            </Button>
            <div className="welcome-cta-secondary-row">
              <Button variant="outline" size="default" className="welcome-atelier-secondary" onClick={handleToday}>
                <CalendarDays className="h-4 w-4" />
                {t('welcome.todayNote')}
              </Button>
              <Button
                variant="outline"
                size="default"
                className="welcome-atelier-secondary"
                onClick={() => void handleImport()}
              >
                <FolderInput className="h-4 w-4" />
                {t('welcome.import')}
              </Button>
            </div>
          </div>

          {steps}
          {moreLinks}
          <p className="welcome-version">{t('common.version', { version: APP_VERSION })}</p>
        </header>

        {recentSection}
      </div>
    </div>
  )
}
