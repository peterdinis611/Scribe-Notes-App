import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { FileText, Sparkles } from 'lucide-react'
import { searchDocuments, type SearchHit } from '@/lib/db/api'
import { nlpSearch, nlpStatus } from '@/lib/db/nlp-api'
import { ROUTES } from '@/lib/routes'
import { useDebouncer } from '@/lib/pacer'
import { sanitizeSnippet } from '@/lib/search-snippet'
import { citationSearchQuery } from '@/lib/editor/citation-jump'
import { useAppDispatch } from '@/store/hooks'
import { setActiveDocumentId, setPendingEditorSearch } from '@/store/documentsSlice'

type SidebarSearchResultsProps = {
  query: string
  onNavigate?: () => void
}

export function SidebarSearchResults({ query, onNavigate }: SidebarSearchResultsProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const [hits, setHits] = useState<SearchHit[]>([])
  const [loading, setLoading] = useState(false)
  const [nlpEnabled, setNlpEnabled] = useState(false)

  useEffect(() => {
    let cancelled = false
    void nlpStatus()
      .then((status) => {
        if (!cancelled) setNlpEnabled(Boolean(status.enabled && status.sidecarOk))
      })
      .catch(() => {
        if (!cancelled) setNlpEnabled(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const searchDebouncer = useDebouncer(
    async (value: string) => {
      if (value.trim().length < 2) {
        setHits([])
        setLoading(false)
        return
      }
      setLoading(true)
      try {
        if (nlpEnabled) {
          setHits(await nlpSearch(value.trim(), { limit: 20, mode: 'hybrid' }))
        } else {
          setHits(await searchDocuments(value.trim(), 20))
        }
      } catch {
        try {
          setHits(await searchDocuments(value.trim(), 20))
        } catch {
          setHits([])
        }
      } finally {
        setLoading(false)
      }
    },
    { wait: 200 },
  )

  useEffect(() => {
    searchDebouncer.maybeExecute(query)
  }, [query, searchDebouncer, nlpEnabled])

  useEffect(() => {
    return () => searchDebouncer.cancel()
  }, [searchDebouncer])

  if (query.trim().length < 2) return null

  return (
    <div className="titlebar-no-drag px-3 pb-2">
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--color-muted-foreground)]">
        {t('library.searchResults')}
      </p>
      {loading && (
        <p className="px-1 py-2 text-[12px] text-[var(--color-muted-foreground)]">{t('library.searching')}</p>
      )}
      {!loading && hits.length === 0 && (
        <p className="px-1 py-2 text-[12px] text-[var(--color-muted-foreground)]">{t('library.searchEmpty')}</p>
      )}
      {!loading &&
        hits.map((hit) => {
          const semantic =
            hit.matchKind === 'semantic' || hit.matchKind === 'both'
          return (
            <button
              key={hit.documentId}
              type="button"
              className="mb-0.5 flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[var(--color-hover)]"
              onClick={() => {
                const needle = citationSearchQuery(hit.snippet) || query.trim()
                if (needle) dispatch(setPendingEditorSearch(needle))
                dispatch(setActiveDocumentId(hit.documentId))
                navigate(ROUTES.document(hit.documentId))
                onNavigate?.()
              }}
            >
              {semantic ? (
                <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-60 text-[var(--color-accent)]" />
              ) : (
                <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-50" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-medium text-[var(--color-foreground)]">
                  {hit.title}
                </span>
                <span
                  className="line-clamp-2 text-[11px] leading-snug text-[var(--color-muted-foreground)] [&_mark]:rounded-sm [&_mark]:bg-[var(--color-selection)] [&_mark]:px-0.5 [&_mark]:text-[var(--color-accent)]"
                  dangerouslySetInnerHTML={{ __html: sanitizeSnippet(hit.snippet) }}
                />
              </span>
            </button>
          )
        })}
    </div>
  )
}
