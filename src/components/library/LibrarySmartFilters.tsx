import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setLibrarySmartFilter } from '@/store/documentsSlice'
import type { LibrarySmartFilter } from '@/lib/library/smart-filters'
import { documentMatchesSmartFilter, LIBRARY_SMART_FILTER_IDS } from '@/lib/library/smart-filters'
import { knownCanvasDocumentIds } from '@/lib/canvas/known'
import { isLibraryDocumentVisible } from '@/lib/db/library-sync'
import { scheduleIdle } from '@/lib/schedule-idle'
import { cn } from '@/lib/utils'

const FILTERS: LibrarySmartFilter[] = [...LIBRARY_SMART_FILTER_IDS]

export function LibrarySmartFilters() {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const active = useAppSelector((state) => state.documents.librarySmartFilter)
  const documents = useAppSelector((state) => state.documents.documents)
  const recentDocumentIds = useAppSelector((state) => state.documents.recentDocumentIds)
  const [orphanIds, setOrphanIds] = useState<Set<string>>(new Set())
  const [stubIds, setStubIds] = useState<Set<string>>(new Set())
  const [taskDocIds, setTaskDocIds] = useState<Set<string>>(new Set())
  const [mediaDocIds, setMediaDocIds] = useState<Set<string>>(new Set())
  const canvasIds = useMemo(() => knownCanvasDocumentIds(), [documents.length])

  useEffect(() => {
    let cancelled = false
    const cancel = scheduleIdle(() => {
      void (async () => {
        try {
          const { listLinkGraph, listWikiHealth, listLibraryAssets } = await import('@/lib/db/api')
          const { nlpListOpenTasks } = await import('@/lib/db/nlp-api')
          // Stagger: graph first (cheap-ish), then heavier wiki/NLP/assets.
          const graph = await listLinkGraph().catch(() => null)
          if (cancelled) return
          setOrphanIds(new Set(graph?.orphans.map((item) => item.id) ?? []))

          const [health, tasks, assets] = await Promise.all([
            listWikiHealth({ stubLimit: 200, stubMaxWords: 40 }).catch(() => null),
            nlpListOpenTasks(400).catch(() => []),
            listLibraryAssets().catch(() => []),
          ])
          if (cancelled) return
          setStubIds(new Set(health?.stubs.map((row) => row.id) ?? []))
          setTaskDocIds(
            new Set(tasks.map((row) => row.documentId).filter((id): id is string => Boolean(id))),
          )
          setMediaDocIds(
            new Set(
              assets
                .filter((asset) =>
                  ['image', 'video', 'lottie', 'model3d', 'svg'].includes(String(asset.kind)),
                )
                .map((asset) => asset.documentId)
                .filter(Boolean),
            ),
          )
        } catch {
          /* keep empty counts */
        }
      })()
    }, 3000)

    return () => {
      cancelled = true
      cancel()
    }
  }, [documents.length])

  const counts = useMemo(() => {
    const visible = documents.filter((doc) => isLibraryDocumentVisible(doc))
    const options = {
      orphanIds,
      recentDocumentIds,
      canvasIds,
      stubIds,
      taskDocIds,
      mediaDocIds,
    }
    const next = {} as Record<LibrarySmartFilter, number>
    for (const filter of FILTERS) {
      next[filter] =
        filter === 'none'
          ? visible.length
          : visible.filter((doc) => documentMatchesSmartFilter(doc, filter, options)).length
    }
    return next
  }, [
    documents,
    orphanIds,
    recentDocumentIds,
    canvasIds,
    stubIds,
    taskDocIds,
    mediaDocIds,
  ])

  const labels = useMemo(
    () =>
      ({
        none: t('library.smartFilters.all'),
        unlinked: t('library.smartFilters.unlinked'),
        untagged: t('library.smartFilters.untagged'),
        unread: t('library.smartFilters.unread'),
        canvas: t('library.smartFilters.canvas'),
        stubs: t('library.smartFilters.stubs'),
        tasks: t('library.smartFilters.tasks'),
        media: t('library.smartFilters.media'),
      }) satisfies Record<LibrarySmartFilter, string>,
    [t],
  )

  return (
    <div className="library-smart-filters titlebar-no-drag" data-tour="library-filters">
      <span className="library-smart-filters-label">{t('library.smartFilters.label')}</span>
      <div className="library-smart-filters-row">
        {FILTERS.map((filter) => (
          <button
            key={filter}
            type="button"
            className={cn('library-smart-filter-chip', active === filter && 'is-active')}
            onClick={() => dispatch(setLibrarySmartFilter(filter))}
          >
            {labels[filter]}
            <span className="library-smart-filter-count">{counts[filter]}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
