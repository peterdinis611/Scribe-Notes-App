import { useMemo } from 'react'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useNavigate } from '@tanstack/react-router'
import { Clock, FileText, Tag as TagIcon } from 'lucide-react'
import { peekCachedDocument } from '@/lib/cache/document-cache'
import { ROUTES } from '@/lib/routes'
import { cn, formatRelativeTime } from '@/lib/utils'
import {
  activeDocumentAtom,
  activeDocumentIdAtom,
  activeTagFilterAtom,
  documentsAtom,
} from '@/store/documents'

type LibraryTagsViewProps = {
  onNavigate?: () => void
}

type TagStat = {
  name: string
  count: number
}

export function LibraryTagsView({ onNavigate }: LibraryTagsViewProps) {
  const documents = useAtomValue(documentsAtom)
  const activeId = useAtomValue(activeDocumentIdAtom)
  const [activeTagFilter, setTagFilter] = useAtom(activeTagFilterAtom)
  const setActiveId = useSetAtom(activeDocumentIdAtom)
  const setActiveDocument = useSetAtom(activeDocumentAtom)
  const navigate = useNavigate()

  const tagStats = useMemo(() => {
    const counts = new Map<string, number>()
    for (const doc of documents) {
      for (const tag of doc.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1)
      }
    }
    return [...counts.entries()]
      .map(([name, count]): TagStat => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, 'sk'))
  }, [documents])

  const taggedDocuments = useMemo(() => {
    if (!activeTagFilter) return []
    return documents
      .filter((doc) => doc.tags.includes(activeTagFilter))
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }, [activeTagFilter, documents])

  function openDocument(id: string) {
    setActiveId(id)
    const cached = peekCachedDocument(id)
    if (cached) setActiveDocument(cached)
    navigate(ROUTES.document(id))
    onNavigate?.()
  }

  if (tagStats.length === 0) {
    return (
      <div className="library-empty-state">
        <div className="library-empty-state-icon">
          <TagIcon className="h-5 w-5" />
        </div>
        <p className="library-empty-state-title">Žiadne štítky</p>
        <p className="library-empty-state-text">
          Štítky pridáte cez menu dokumentu v záložke Priečinky.
        </p>
      </div>
    )
  }

  return (
    <div className="library-tags-view">
      <div className="library-tag-grid">
        {tagStats.map(({ name, count }) => {
          const isActive = activeTagFilter === name
          return (
            <button
              key={name}
              type="button"
              className={cn('library-tag-chip', isActive && 'is-active')}
              aria-pressed={isActive}
              onClick={() => setTagFilter(isActive ? null : name)}
            >
              <span className="library-tag-chip-name">{name}</span>
              <span className="library-tag-chip-count">{count}</span>
            </button>
          )
        })}
      </div>

      {activeTagFilter ? (
        <div className="library-tags-results">
          <p className="library-tags-results-label">
            Dokumenty so štítkom <strong>{activeTagFilter}</strong>
          </p>
          <ul className="library-doc-list">
            {taggedDocuments.map((doc) => (
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
        </div>
      ) : (
        <p className="library-tags-hint">Vyberte štítok a zobrazia sa súvisiace dokumenty.</p>
      )}
    </div>
  )
}
