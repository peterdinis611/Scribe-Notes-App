import { useEffect, useMemo, useState } from 'react'
import { Check, ListFilter } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setLibrarySmartFilter } from '@/store/documentsSlice'
import type { LibrarySmartFilter } from '@/lib/library/smart-filters'
import { documentMatchesSmartFilter, LIBRARY_SMART_FILTER_IDS } from '@/lib/library/smart-filters'
import { knownCanvasDocumentIds } from '@/lib/canvas/known'
import { isLibraryDocumentVisible } from '@/lib/db/library-sync'
import { scheduleIdle } from '@/lib/schedule-idle'
import { cn } from '@/lib/utils'
import { IconTooltip } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

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

  const isFiltered = active !== 'none'
  const tip = isFiltered
    ? `${t('library.smartFilters.label')}: ${labels[active]} (${counts[active]})`
    : t('library.smartFilters.label')

  return (
    <div className="library-smart-filters titlebar-no-drag" data-tour="library-filters">
      <DropdownMenu>
        <IconTooltip label={tip}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn('library-view-icon', isFiltered && 'is-active')}
              aria-label={tip}
            >
              <ListFilter className="h-4 w-4" />
              {isFiltered && <span className="library-view-badge">{counts[active]}</span>}
            </button>
          </DropdownMenuTrigger>
        </IconTooltip>
        <DropdownMenuContent align="end" className="min-w-[12rem]">
          {FILTERS.map((filter) => (
            <DropdownMenuItem
              key={filter}
              className={cn(active === filter && 'bg-[var(--color-hover)]')}
              onSelect={() => dispatch(setLibrarySmartFilter(filter))}
            >
              <span className="flex-1">{labels[filter]}</span>
              <span className="font-[family-name:var(--font-mono)] text-[10px] text-[var(--color-muted-foreground)]">
                {counts[filter]}
              </span>
              {active === filter && <Check className="h-3.5 w-3.5 text-[var(--color-accent)]" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
