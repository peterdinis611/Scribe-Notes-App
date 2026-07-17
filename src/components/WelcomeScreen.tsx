import { useMemo } from 'react'
import { ArrowRight, Clock, FileText, FolderInput, Plus } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { DemoGuideButton } from '@/components/DemoGuideButton'
import { pickAndImportFile } from '@/lib/db/api'
import { peekCachedDocument } from '@/lib/cache/document-cache'
import { prependDocumentSummary } from '@/lib/db/library-sync'
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
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const recentDocuments = useMemo(
    () => [...documents].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8),
    [documents],
  )

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

  function openDocument(id: string) {
    dispatch(setActiveDocumentId(id))
    const cached = peekCachedDocument(id)
    if (cached) dispatch(setActiveDocument(cached))
    navigate(ROUTES.document(id))
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

          <div className="welcome-actions flex flex-wrap gap-2.5 pt-1">
            <Button variant="default" size="default" onClick={() => dispatch(setTemplatePickerOpen(true))}>
              <Plus className="h-4 w-4" />
              {t('welcome.newDocument')}
            </Button>
            <Button variant="outline" size="default" onClick={() => void handleImport()}>
              <FolderInput className="h-4 w-4" />
              {t('welcome.import')}
            </Button>
            <DemoGuideButton />
          </div>
        </header>

        <section className="welcome-recent space-y-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="m-0 text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--color-muted-foreground)]">
              {t('welcome.recentDocuments')}
            </h2>
            {documents.length > 0 && (
              <span className="text-[11px] text-[var(--color-muted-foreground)]">
                {t('common.total', { count: documents.length })}
              </span>
            )}
          </div>

          {recentDocuments.length > 0 ? (
            <ul className="welcome-recent-list m-0 list-none divide-y divide-[var(--color-border)] border-y border-[var(--color-border)] p-0">
              {recentDocuments.map((doc) => (
                <li key={doc.id}>
                  <button
                    type="button"
                    className="group flex w-full items-center gap-3 bg-transparent px-1 py-3.5 text-left transition-colors hover:bg-[var(--color-hover)] sm:px-2"
                    onClick={() => openDocument(doc.id)}
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-accent)]">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="m-0 truncate text-[14px] font-semibold text-[var(--color-foreground)]">
                        {doc.title}
                      </p>
                      <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-[var(--color-muted-foreground)]">
                        <Clock className="h-3 w-3" />
                        {formatRelativeTime(doc.updatedAt)}
                      </p>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-[var(--color-muted-foreground)] opacity-0 transition-opacity group-hover:opacity-100" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-start gap-3 border-y border-[var(--color-border)] py-10">
              <div className="flex h-12 w-12 items-center justify-center rounded-[14px] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-accent)]">
                <FileText className="h-6 w-6 stroke-[1.25]" />
              </div>
              <div>
                <p className="m-0 text-[14px] font-semibold text-[var(--color-foreground)]">
                  {t('welcome.noDocuments')}
                </p>
                <p className="mt-1 max-w-[40ch] text-[13px] text-[var(--color-muted-foreground)]">
                  {t('welcome.noDocumentsHint')}
                </p>
                <div className="mt-3">
                  <DemoGuideButton size="sm" />
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
