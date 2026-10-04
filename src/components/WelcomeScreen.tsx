import { useMemo } from 'react'
import { ArrowRight, CalendarDays, Clock, FileText, FolderInput, GitBranch, Plus } from 'lucide-react'
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
import { toast } from '@/lib/toast'
import { ROUTES } from '@/lib/routes'
import { getDisplayKeysForShortcut } from '@/lib/shortcuts'
import { cn, formatRelativeTime } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  setActiveDocument,
  setActiveDocumentId,
  setSaveStatus,
  updateDocuments,
} from '@/store/documentsSlice'
import { setTemplatePickerOpen } from '@/store/settingsSlice'
import { APP_VERSION, APP_SHORT_VERSION } from '@/lib/app-version'

export function WelcomeScreen() {
  const documents = useAppSelector((state) => state.documents.documents)
  const folders = useAppSelector((state) => state.folders.folders)
  const recentDocumentIds = useAppSelector((state) => state.documents.recentDocumentIds)
  const shortcutOverrides = useAppSelector((state) => state.settings.shortcutOverrides)
  const uiSkin = useAppSelector((state) => state.settings.uiSkin)
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const isGrove = uiSkin !== 'classic'
  const newDocKeys = getDisplayKeysForShortcut('newDocument', shortcutOverrides).join('')

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

  const primaryCta = (
    <Button
      variant="default"
      size="default"
      className={isGrove ? 'welcome-cta-primary' : 'welcome-atelier-primary'}
      data-tour="new-document"
      onClick={openNewDocument}
    >
      <Plus className="h-4 w-4" />
      <span>{t('welcome.newDocument')}</span>
      {newDocKeys ? (
        <kbd className="welcome-cta-kbd" aria-hidden="true">
          {newDocKeys}
        </kbd>
      ) : null}
    </Button>
  )

  const secondaryCtas = (
    <>
      <Button
        variant="outline"
        size="default"
        className={isGrove ? 'welcome-cta-secondary' : 'welcome-atelier-secondary'}
        onClick={handleToday}
      >
        <CalendarDays className="h-4 w-4" />
        {t('welcome.todayNote')}
      </Button>
      <Button
        variant="outline"
        size="default"
        className={isGrove ? 'welcome-cta-secondary' : 'welcome-atelier-secondary'}
        onClick={() => void handleImport()}
      >
        <FolderInput className="h-4 w-4" />
        {t('welcome.import')}
      </Button>
    </>
  )

  const moreLinks = (
    <div className={isGrove ? 'welcome-actions-more' : 'welcome-more'}>
      <DemoGuideButton variant="link" className={isGrove ? 'welcome-link' : undefined} />
      <button
        type="button"
        title={t('welcome.connectionMapHint')}
        className={isGrove ? 'welcome-link' : 'welcome-more-link'}
        onClick={() => void navigate(ROUTES.graph())}
      >
        <GitBranch className="h-3.5 w-3.5" aria-hidden="true" />
        {t('welcome.connectionMap')}
      </button>
    </div>
  )

  const emptyActions = (
    <div className={isGrove ? 'welcome-empty-actions' : 'welcome-rail-empty-actions'}>
      <Button variant="default" size="sm" onClick={openNewDocument}>
        <Plus className="h-3.5 w-3.5" />
        {t('welcome.newDocument')}
      </Button>
      <Button variant="outline" size="sm" onClick={handleToday}>
        <CalendarDays className="h-3.5 w-3.5" />
        {t('welcome.todayNote')}
      </Button>
      <DemoGuideButton size="sm" />
    </div>
  )

  const recentSection = (
    <section
      className={isGrove ? 'welcome-recent' : 'welcome-rail'}
      aria-labelledby="welcome-recent-heading"
    >
      <div className={isGrove ? 'welcome-recent-head' : 'welcome-rail-head'}>
        <h2
          id="welcome-recent-heading"
          className={isGrove ? 'welcome-recent-label' : 'welcome-rail-label'}
        >
          {t(isGrove ? 'welcome.press.recentDocuments' : 'welcome.recentDocuments')}
        </h2>
        {documents.length > 0 ? (
          <span className={isGrove ? 'welcome-recent-count' : 'welcome-rail-count'}>
            {t('common.total', { count: documents.length })}
          </span>
        ) : null}
      </div>

      {recentDocuments.length > 0 ? (
        <ul className={isGrove ? 'welcome-recent-list' : 'welcome-rail-list'}>
          {recentDocuments.map((doc, index) => (
            <li key={doc.id} style={{ ['--welcome-i' as string]: String(index) }}>
              <button
                type="button"
                className={isGrove ? 'welcome-recent-row' : 'welcome-rail-row'}
                onClick={() => openDocument(doc.id)}
              >
                <span
                  className={isGrove ? 'welcome-recent-icon' : 'welcome-rail-icon'}
                  aria-hidden="true"
                >
                  <FileText className="h-4 w-4" />
                </span>
                <span className={isGrove ? 'welcome-recent-title' : 'welcome-rail-title'}>
                  {doc.title}
                </span>
                <span className={isGrove ? 'welcome-recent-meta' : 'welcome-rail-meta'}>
                  <Clock className="h-3 w-3" />
                  {formatRelativeTime(doc.updatedAt)}
                </span>
                <ArrowRight
                  className={cn(isGrove ? 'welcome-recent-arrow' : 'welcome-rail-arrow', 'h-4 w-4')}
                  aria-hidden="true"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className={isGrove ? 'welcome-empty' : 'welcome-rail-empty'}>
          <p className={isGrove ? 'welcome-empty-title' : 'welcome-rail-empty-title'}>
            {t(isGrove ? 'welcome.press.noDocuments' : 'welcome.noDocuments')}
          </p>
          <p className={isGrove ? 'welcome-empty-text' : 'welcome-rail-empty-text'}>
            {t(isGrove ? 'welcome.press.noDocumentsHint' : 'welcome.emptyStartHint')}
          </p>
          {emptyActions}
        </div>
      )}
    </section>
  )

  if (isGrove) {
    return (
      <div className="welcome-desk titlebar-no-drag">
        <div className="welcome-desk-grain" aria-hidden="true" />
        <p className="welcome-stamp" aria-hidden="true">
          {t('welcome.brand')}
        </p>

        <div className="welcome-sheet">
          <div className="welcome-margin-rule" aria-hidden="true" />

          <header className="welcome-hero">
            <p className="welcome-eyebrow">
              {t('welcome.press.eyebrow', { version: APP_SHORT_VERSION })}
            </p>
            <h1 className="welcome-brand">
              {t('welcome.brand')}
              <span className="scribe-edition">{APP_SHORT_VERSION}</span>
            </h1>
            <p className="welcome-tagline">{t('welcome.press.brandTagline')}</p>
            <p className="welcome-workflow">{t('welcome.press.workflowHint')}</p>
            <div className="welcome-actions">
              <div className="welcome-actions-primary">
                {primaryCta}
                {secondaryCtas}
              </div>
              {moreLinks}
            </div>
          </header>

          {recentSection}
          <p className="welcome-version welcome-version--press">
            {t('common.version', { version: APP_VERSION })}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="welcome-atelier titlebar-no-drag">
      <div className="welcome-atelier-glow" aria-hidden="true" />
      <div className="welcome-atelier-grain" aria-hidden="true" />
      <div className="welcome-atelier-orb" aria-hidden="true" />

      <div className="welcome-compose">
        <header className="welcome-lead">
          <p className="welcome-atelier-eyebrow">
            {t('welcome.eyebrow', { version: APP_SHORT_VERSION })}
          </p>
          <h1 className="welcome-atelier-brand">
            {t('welcome.brand')}
            <span className="scribe-edition">{APP_SHORT_VERSION}</span>
          </h1>
          <p className="welcome-atelier-tagline">{t('welcome.brandTagline')}</p>
          <p className="welcome-workflow welcome-workflow--atelier">
            {t('welcome.workflowHint')}
          </p>

          <div className="welcome-cta-stack">
            {primaryCta}
            <div className="welcome-cta-secondary-row">{secondaryCtas}</div>
          </div>

          {moreLinks}
          <p className="welcome-version">{t('common.version', { version: APP_VERSION })}</p>
        </header>

        {recentSection}
      </div>
    </div>
  )
}
