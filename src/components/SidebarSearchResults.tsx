import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { FileText } from 'lucide-react'
import { useSetAtom } from 'jotai'
import { searchDocuments, type SearchHit } from '@/lib/db/api'
import { ROUTES } from '@/lib/routes'
import { cn, debounce } from '@/lib/utils'
import { activeDocumentIdAtom } from '@/store/documents'

type SidebarSearchResultsProps = {
  query: string
  onNavigate?: () => void
}

export function SidebarSearchResults({ query, onNavigate }: SidebarSearchResultsProps) {
  const navigate = useNavigate()
  const setActiveId = useSetAtom(activeDocumentIdAtom)
  const [hits, setHits] = useState<SearchHit[]>([])
  const [loading, setLoading] = useState(false)

  const search = useMemo(
    () =>
      debounce(async (value: string) => {
        if (value.trim().length < 2) {
          setHits([])
          setLoading(false)
          return
        }
        setLoading(true)
        try {
          setHits(await searchDocuments(value.trim(), 20))
        } catch {
          setHits([])
        } finally {
          setLoading(false)
        }
      }, 220),
    [],
  )

  useEffect(() => {
    search(query)
  }, [query, search])

  if (query.trim().length < 2) return null

  return (
    <div className="sidebar-search-results titlebar-no-drag">
      <p className="sidebar-search-results-label">Výsledky v obsahu</p>
      {loading && <p className="sidebar-search-results-empty">Hľadám…</p>}
      {!loading && hits.length === 0 && (
        <p className="sidebar-search-results-empty">Nič sa nenašlo</p>
      )}
      {!loading &&
        hits.map((hit) => (
          <button
            key={hit.documentId}
            type="button"
            className={cn('sidebar-search-hit')}
            onClick={() => {
              setActiveId(hit.documentId)
              navigate(ROUTES.document(hit.documentId))
              onNavigate?.()
            }}
          >
            <FileText className="h-3.5 w-3.5 shrink-0 opacity-50" />
            <span className="sidebar-search-hit-body">
              <span className="sidebar-search-hit-title">{hit.title}</span>
              <span
                className="sidebar-search-hit-snippet"
                dangerouslySetInnerHTML={{ __html: hit.snippet }}
              />
            </span>
          </button>
        ))}
    </div>
  )
}
