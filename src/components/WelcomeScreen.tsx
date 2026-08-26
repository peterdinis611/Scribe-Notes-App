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
import { formatRelativeTime } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  setActiveDocument,
  setActiveDocumentId,
  setSaveStatus,
  updateDocuments,
} from '@/store/documentsSlice'
import { setTemplatePickerOpen } from '@/store/settingsSlice'

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

  const actions = (
    <div className={isPress ? 'welcome-actions' : 'welcome-actions flex flex-col gap-3 pt-1'}>
      <div className={isPress ? 'welcome-actions-primary' : 'flex flex-wrap gap-2.5'}>
        <Button
          variant="default"
          size="default"
          className={isPress ? 'welcome-cta-primary' : undefined}
          onClick={() => dispatch(setTemplatePickerOpen(true))}
        >
          <Plus className="h-4 w-4" />
          {t('welcome.newDocument')}
        </Button>
        <Button
          variant="outline"
          size="default"
          className={isPress ? 'welcome-cta-secondary' : undefined}
          onClick={handleToday}
        >
          <CalendarDays className="h-4 w-4" />
          {t('welcome.todayNote')}
        </Button>
        <Button
          variant="outline"
          size="default"
          className={isPress ? 'welcome-cta-secondary' : undefined}
          onClick={() => void handleImport()}
        >
          <FolderInput className="h-4 w-4" />
          {t('welcome.import')}
        </Button>
      </div>
      <p className={isPress ? 'welcome-workflow' : 'm-0 max-w-[48ch] text-[12.5px] leading-relaxed text-[var(--color-muted-foreground)]'}>
        {t(isPress ? 'welcome.press.workflowHint' : 'welcome.workflowHint')}
      </p>
      <div className={isPress ? 'welcome-actions-more' : 'flex flex-wrap items-center gap-x-4 gap-y-1'}>
        <DemoGuideButton variant="link" />
        <button
          type="button"
          title={t('welcome.connectionMapHint')}
          className={
            isPress
              ? 'welcome-link'
              : 'inline-flex items-center gap-1.5 border-0 bg-transparent p-0 text-[13px] font-medium text-[var(--color-muted-foreground)] underline-offset-4 hover:text-[var(--color-foreground)] hover:underline'
          }
          onClick={() => void navigate(ROUTES.graph())}
        >
          <GitBranch className="h-3.5 w-3.5" aria-hidden="true" />
          {t('welcome.connectionMap')}
        </button>
      </div>
    </div>
  )

  const recentSection = (
    <section
      className={isPress ? 'welcome-recent' : 'welcome-recent space-y-3'}
      aria-labelledby="welcome-recent-heading"
    >
      <div className={isPress ? 'welcome-recent-head' : 'flex items-baseline justify-between gap-3'}>
        <h2
          id="welcome-recent-heading"
          className={
            isPress
              ? 'welcome-recent-label'
              : 'm-0 text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--color-muted-foreground)]'
          }
        >
          {t(isPress ? 'welcome.press.recentDocuments' : 'welcome.recentDocuments')}
        </h2>
        {documents.length > 0 && (
          <span
            className={
              isPress
                ? 'welcome-recent-count'
                : 'text-[11px] text-[var(--color-muted-foreground)]'
            }
          >
            {t('common.total', { count: documents.length })}
          </span>
        )}
      </div>

      {recentDocuments.length > 0 ? (
        <ul
          className={
            isPress
              ? 'welcome-recent-list'
              : 'welcome-recent-list m-0 list-none divide-y divide-[var(--color-border)] border-y border-[var(--color-border)] p-0'
          }
        >
          {recentDocuments.map((doc, index) => (
            <li
              key={doc.id}
              style={isPress ? { ['--welcome-i' as string]: String(index) } : undefined}
            >
              <button
                type="button"
                className={
                  isPress
                    ? 'welcome-recent-row'
                    : 'group flex w-full items-center gap-3 bg-transparent px-1 py-3.5 text-left transition-colors hover:bg-[var(--color-hover)] sm:px-2'
                }
                onClick={() => openDocument(doc.id)}
              >
                <span
                  className={
                    isPress
                      ? 'welcome-recent-icon'
                      : 'flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-accent)]'
                  }
                  aria-hidden="true"
                >
                  <FileText className="h-4 w-4" />
                </span>
                <span
                  className={
                    isPress
                      ? 'welcome-recent-title'
                      : 'm-0 min-w-0 flex-1 truncate text-[14px] font-semibold text-[var(--color-foreground)]'
                  }
                >
                  {doc.title}
                </span>
                <span
                  className={
                    isPress
                      ? 'welcome-recent-meta'
                      : 'ml-3 inline-flex shrink-0 items-center gap-1 text-[11px] text-[var(--color-muted-foreground)]'
                  }
                >
                  <Clock className="h-3 w-3" />
                  {formatRelativeTime(doc.updatedAt)}
                </span>
                <ArrowRight
                  className={
                    isPress
                      ? 'welcome-recent-arrow h-4 w-4'
                      : 'h-4 w-4 shrink-0 text-[var(--color-muted-foreground)] opacity-0 transition-opacity group-hover:opacity-100'
                  }
                  aria-hidden="true"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className={isPress ? 'welcome-empty' : 'space-y-2 py-2'}>
          <p
            className={
              isPress
                ? 'welcome-empty-title'
                : 'm-0 text-[14px] font-semibold text-[var(--color-foreground)]'
            }
          >
            {t(isPress ? 'welcome.press.noDocuments' : 'welcome.noDocuments')}
          </p>
          <p
            className={
              isPress
                ? 'welcome-empty-text'
                : 'm-0 text-[13px] text-[var(--color-muted-foreground)]'
            }
          >
            {t(isPress ? 'welcome.press.noDocumentsHint' : 'welcome.noDocumentsHint')}
          </p>
          <div className={isPress ? 'welcome-empty-actions' : undefined}>
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
            {actions}
          </header>

          {recentSection}
        </div>
      </div>
    )
  }

  return (
    <div className="titlebar-no-drag flex min-h-0 flex-1 overflow-y-auto">
      <div className="welcome-screen mx-auto flex w-full max-w-[760px] flex-col gap-10 px-6 py-12 max-[640px]:gap-8 max-[640px]:px-5 max-[640px]:py-8 sm:px-8">
        <header className="welcome-hero space-y-4">
          <h1 className="welcome-brand m-0 text-[clamp(40px,7vw,64px)] font-bold leading-none tracking-[-0.05em] text-[var(--color-foreground)]">
            {t('welcome.brand')}
          </h1>
          <p className="m-0 max-w-[42ch] text-[15px] leading-relaxed text-[var(--color-muted-foreground)]">
            {t('welcome.brandTagline')}
          </p>
          {actions}
        </header>
        {recentSection}
      </div>
    </div>
  )
}
