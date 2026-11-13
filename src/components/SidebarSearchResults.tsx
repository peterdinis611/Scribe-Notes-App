import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { FileText, Sparkles, Type } from 'lucide-react'
import { expandSearchQuery, searchNeedle } from '@/lib/ai'
import { searchDocuments, type SearchHit } from '@/lib/db/api'
import { isLibraryDocumentVisible } from '@/lib/db/library-sync'
import { nlpSearch, nlpStatus } from '@/lib/db/nlp-api'
import { ROUTES } from '@/lib/routes'
import { useDebouncer } from '@/lib/pacer'
import { sanitizeSnippet } from '@/lib/search-snippet'
import { citationSearchQuery } from '@/lib/editor/citation-jump'
import { fuzzyFilter } from '@/lib/search/fuzzy'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setActiveDocumentId, setPendingEditorSearch } from '@/store/documentsSlice'

type SidebarSearchResultsProps = {
  query: string
  onNavigate?: () => void
}

type TitleHit = {
  documentId: string
  title: string
  tags: string[]
}

export function SidebarSearchResults({ query, onNavigate }: SidebarSearchResultsProps) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const documents = useAppSelector((state) => state.documents.documents)
  const [hits, setHits] = useState<SearchHit[]>([])
  const [loading, setLoading] = useState(false)
  const [nlpEnabled, setNlpEnabled] = useState(false)
  const [titleNeedle, setTitleNeedle] = useState('')

  const trimmed = query.trim()

  useEffect(() => {
    let cancelled = false
    if (trimmed.length < 2) {
      setTitleNeedle('')
      return
    }
    void expandSearchQuery(trimmed, 4).then((result) => {
      if (!cancelled) setTitleNeedle(result.rewritten || trimmed)
    })
    return () => {
      cancelled = true
    }
  }, [trimmed])

  const titleHits = useMemo((): TitleHit[] => {
    if (trimmed.length < 2) return []
    const needle = titleNeedle.trim() || trimmed
    const visible = documents.filter(isLibraryDocumentVisible)
    return fuzzyFilter(visible, needle, (doc) => [doc.title, ...(doc.tags ?? [])], {
      limit: 12,
      // Stricter than command-palette fuzzy — “regular” title search.
      threshold: 0.28,
    }).map((doc) => ({
      documentId: doc.id,
      title: doc.title,
      tags: doc.tags ?? [],
    }))
  }, [documents, trimmed, titleNeedle])

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
        const needle = await searchNeedle(value)
        if (nlpEnabled) {
          setHits(await nlpSearch(needle, { limit: 20, mode: 'hybrid' }))
        } else {
          setHits(await searchDocuments(needle, 20))
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

  if (trimmed.length < 2) return null

  const contentHits = hits.filter(
    (hit) => !titleHits.some((title) => title.documentId === hit.documentId),
  )
  const empty = !loading && titleHits.length === 0 && contentHits.length === 0

  const openDocument = (documentId: string, needle?: string) => {
    if (needle) dispatch(setPendingEditorSearch(needle))
    dispatch(setActiveDocumentId(documentId))
    navigate(ROUTES.document(documentId))
    onNavigate?.()
  }

  return (
    <div className="titlebar-no-drag px-3 pb-2">
      {titleHits.length > 0 && (
        <div className="mb-2">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--color-muted-foreground)]">
            {t('library.titleSearchResults')}
          </p>
          {titleHits.map((hit) => (
            <button
              key={`title-${hit.documentId}`}
              type="button"
              className="mb-0.5 flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[var(--color-hover)]"
              onClick={() => openDocument(hit.documentId)}
            >
              <Type className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-50" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12px] font-medium text-[var(--color-foreground)]">
                  {hit.title}
                </span>
                {hit.tags.length > 0 && (
                  <span className="line-clamp-1 text-[11px] leading-snug text-[var(--color-muted-foreground)]">
                    {hit.tags.join(' · ')}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}

      {empty && (
        <p className="px-1 py-2 text-[12px] text-[var(--color-muted-foreground)]">{t('library.searchEmpty')}</p>
      )}

      {(loading || contentHits.length > 0) && (
        <>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--color-muted-foreground)]">
            {t('library.searchResults')}
          </p>
          {loading && (
            <p className="px-1 py-2 text-[12px] text-[var(--color-muted-foreground)]">
              {t('library.searching')}
            </p>
          )}
          {!loading &&
            contentHits.map((hit) => {
              const semantic = hit.matchKind === 'semantic' || hit.matchKind === 'both'
              return (
                <button
                  key={hit.documentId}
                  type="button"
                  className="mb-0.5 flex w-full items-start gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[var(--color-hover)]"
                  onClick={() => {
                    const needle = citationSearchQuery(hit.snippet) || trimmed
                    openDocument(hit.documentId, needle || undefined)
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
        </>
      )}
    </div>
  )
}
