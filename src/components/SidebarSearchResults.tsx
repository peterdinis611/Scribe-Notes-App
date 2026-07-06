import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { FileText } from 'lucide-react'
import { searchDocuments, type SearchHit } from '@/lib/db/api'
import { ROUTES } from '@/lib/routes'
import { debounce } from '@/lib/utils'
import { useAppDispatch } from '@/store/hooks'
import { setActiveDocumentId } from '@/store/documentsSlice'

type SidebarSearchResultsProps = {
  query: string
  onNavigate?: () => void
}

export function SidebarSearchResults({ query, onNavigate }: SidebarSearchResultsProps) {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
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
    <div className="titlebar-no-drag px-3 pb-2">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--color-muted-foreground)]">
        Výsledky v obsahu
      </p>
      {loading && (
        <p className="px-1 py-2 text-[12px] text-[var(--color-muted-foreground)]">Hľadám…</p>
      )}
      {!loading && hits.length === 0 && (
        <p className="px-1 py-2 text-[12px] text-[var(--color-muted-foreground)]">Nič sa nenašlo</p>
      )}
      {!loading &&
        hits.map((hit) => (
          <button
            key={hit.documentId}
            type="button"
            className="mb-0.5 flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[var(--color-hover)]"
            onClick={() => {
              dispatch(setActiveDocumentId(hit.documentId))
              navigate(ROUTES.document(hit.documentId))
              onNavigate?.()
            }}
          >
            <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-50" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12px] font-medium text-[var(--color-foreground)]">
                {hit.title}
              </span>
              <span
                className="line-clamp-2 text-[11px] leading-snug text-[var(--color-muted-foreground)] [&_mark]:rounded-sm [&_mark]:bg-[var(--color-selection)] [&_mark]:px-0.5 [&_mark]:text-[var(--color-accent)]"
                dangerouslySetInnerHTML={{ __html: hit.snippet }}
              />
            </span>
          </button>
        ))}
    </div>
  )
}
