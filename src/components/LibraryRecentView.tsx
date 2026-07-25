import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { Clock, FileText, History, RotateCcw } from 'lucide-react'
import { peekCachedDocument } from '@/lib/cache/document-cache'
import { ROUTES } from '@/lib/routes'
import { cn, formatRelativeTime } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setActiveDocument, setActiveDocumentId } from '@/store/documentsSlice'
import type { DocumentSummary } from '@/lib/db/api'

type LibraryRecentViewProps = {
  onNavigate?: () => void
}

function resolveOrdered(
  ids: string[],
  documents: DocumentSummary[],
): DocumentSummary[] {
  const byId = new Map(documents.filter((doc) => doc.deletedAt == null).map((doc) => [doc.id, doc]))
  return ids.map((id) => byId.get(id)).filter((doc): doc is DocumentSummary => doc != null)
}

export function LibraryRecentView({ onNavigate }: LibraryRecentViewProps) {
  const { t } = useTranslation()
  const documents = useAppSelector((state) => state.documents.documents)
  const recentIds = useAppSelector((state) => state.documents.recentDocumentIds)
  const closedIds = useAppSelector((state) => state.documents.recentlyClosedIds)
  const activeId = useAppSelector((state) => state.documents.activeDocumentId)
  const dispatch = useAppDispatch()
  const navigate = useNavigate()

  const recentDocuments = useMemo(
    () => resolveOrdered(recentIds, documents),
    [recentIds, documents],
  )

  const closedOnly = useMemo(
    () => resolveOrdered(closedIds.filter((id) => id !== activeId), documents),
    [closedIds, documents, activeId],
  )

  function openDocument(id: string) {
    dispatch(setActiveDocumentId(id))
    const cached = peekCachedDocument(id)
    if (cached) dispatch(setActiveDocument(cached))
    navigate(ROUTES.document(id))
    onNavigate?.()
  }

  if (recentDocuments.length === 0 && closedOnly.length === 0) {
    return (
      <div className="library-empty-state">
        <div className="library-empty-state-icon">
          <History className="h-5 w-5" />
        </div>
        <p className="library-empty-state-title">{t('library.noRecent')}</p>
        <p className="library-empty-state-text">{t('library.noRecentHint')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4 px-0.5 pt-1">
      {recentDocuments.length > 0 && (
        <section>
          <h3 className="m-0 mb-1.5 px-2 text-[11px] font-medium text-[var(--color-muted-foreground)]">
            {t('library.recentOpened')}
          </h3>
          <ul className="library-doc-list">
            {recentDocuments.map((doc) => (
              <li key={doc.id}>
                <button
                  type="button"
                  className={cn('library-doc-card', activeId === doc.id && 'is-active')}
                  onClick={() => openDocument(doc.id)}
                >
                  <div className="library-doc-card-icon">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="library-doc-card-body">
                    <p className="library-doc-card-title">{doc.title}</p>
                    <p className="library-doc-card-meta">
                      <Clock className="h-3 w-3" />
                      {formatRelativeTime(doc.updatedAt)}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {closedOnly.length > 0 && (
        <section>
          <h3 className="m-0 mb-1.5 px-2 text-[11px] font-medium text-[var(--color-muted-foreground)]">
            {t('library.recentClosed')}
          </h3>
          <ul className="library-doc-list">
            {closedOnly.map((doc) => (
              <li key={doc.id}>
                <button
                  type="button"
                  className={cn('library-doc-card', activeId === doc.id && 'is-active')}
                  onClick={() => openDocument(doc.id)}
                >
                  <div className="library-doc-card-icon">
                    <RotateCcw className="h-4 w-4" />
                  </div>
                  <div className="library-doc-card-body">
                    <p className="library-doc-card-title">{doc.title}</p>
                    <p className="library-doc-card-meta">
                      <Clock className="h-3 w-3" />
                      {formatRelativeTime(doc.updatedAt)}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
