import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { Clock, FileText, Star } from 'lucide-react'
import { peekCachedDocument } from '@/lib/cache/document-cache'
import { ROUTES } from '@/lib/routes'
import { cn, formatRelativeTime } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setActiveDocument, setActiveDocumentId } from '@/store/documentsSlice'

type LibraryFavoritesViewProps = {
  onNavigate?: () => void
}

export function LibraryFavoritesView({ onNavigate }: LibraryFavoritesViewProps) {
  const { t } = useTranslation()
  const documents = useAppSelector((state) => state.documents.documents)
  const activeId = useAppSelector((state) => state.documents.activeDocumentId)
  const dispatch = useAppDispatch()
  const navigate = useNavigate()

  const favoriteDocuments = useMemo(
    () =>
      [...documents]
        .filter((doc) => doc.isFavorite)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [documents],
  )

  function openDocument(id: string) {
    dispatch(setActiveDocumentId(id))
    const cached = peekCachedDocument(id)
    if (cached) dispatch(setActiveDocument(cached))
    navigate(ROUTES.document(id))
    onNavigate?.()
  }

  if (favoriteDocuments.length === 0) {
    return (
      <div className="library-empty-state">
        <div className="library-empty-state-icon">
          <Star className="h-5 w-5" />
        </div>
        <p className="library-empty-state-title">{t('library.noFavorites')}</p>
        <p className="library-empty-state-text">
          {t('library.noFavoritesHint')}
        </p>
      </div>
    )
  }

  return (
    <ul className="library-doc-list">
      {favoriteDocuments.map((doc) => (
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
            <Star className="library-doc-card-star h-3.5 w-3.5 fill-current" aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  )
}
