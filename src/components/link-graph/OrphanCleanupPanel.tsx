import { Link2, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { isUntitledOrphanTitle } from '@/lib/link-graph/orphan-cleanup'
import type { LinkGraphOrphan, SearchHit } from '@/lib/db/api'
import { cn } from '@/lib/utils'

export type OrphanSimilarRow = {
  id: string
  title: string
  similar: SearchHit[]
}

type OrphanCleanupPanelProps = {
  untitledOrphans: LinkGraphOrphan[]
  rows: OrphanSimilarRow[]
  onOpen: (id: string) => void
  onArchive: (ids: string[]) => void
  className?: string
  /** When the map is empty because of Favorites/Around/tag filters. */
  filterHint?: string | null
  onClearFilters?: () => void
}

export function OrphanCleanupPanel({
  untitledOrphans,
  rows,
  onOpen,
  onArchive,
  className,
  filterHint,
  onClearFilters,
}: OrphanCleanupPanelProps) {
  const { t } = useTranslation()
  const hasRows = rows.length > 0
  const hasUntitled = untitledOrphans.length > 0
  if (!hasRows && !hasUntitled) return null

  return (
    <section
      className={cn(
        'library-orphan-cleanup rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[color-mix(in_srgb,var(--color-surface)_88%,transparent)]',
        className,
      )}
      aria-label={t('linkGraph.orphanCleanupTitle')}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <h3 className="m-0 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--color-muted-foreground)]">
            {t('linkGraph.orphanCleanupTitle')}
          </h3>
          {hasRows ? (
            <Badge variant="muted" className="tabular-nums">
              {rows.length}
            </Badge>
          ) : null}
        </div>
        {hasUntitled ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-[11px]"
            onClick={() => onArchive(untitledOrphans.map((item) => item.id))}
          >
            <Trash2 className="h-3 w-3" />
            {t('linkGraph.orphanArchiveUntitled', { count: untitledOrphans.length })}
          </Button>
        ) : null}
      </header>

      {hasRows ? (
        <>
          <Separator />
          <ScrollArea className="max-h-[min(40vh,280px)]">
            <ul className="m-0 list-none divide-y divide-[var(--color-border)] p-0">
              {rows.map((row) => {
                const top = row.similar[0]
                const untitled = isUntitledOrphanTitle(row.title)
                const similarTitles = row.similar
                  .slice(0, 2)
                  .map((hit) => hit.title)
                  .filter(Boolean)
                return (
                  <li key={row.id} className="flex flex-col gap-1.5 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        className="inline-flex max-w-full items-center gap-1.5 truncate text-left text-[13px] font-medium text-[var(--color-foreground)] hover:text-[var(--color-accent)]"
                        onClick={() => onOpen(row.id)}
                      >
                        <span className="truncate">{row.title || t('libraryChat.untitled')}</span>
                        {untitled ? (
                          <Badge variant="tag" className="shrink-0">
                            {t('linkGraph.orphanUntitledBadge')}
                          </Badge>
                        ) : null}
                      </button>
                      {similarTitles.length > 0 ? (
                        <p className="m-0 mt-0.5 truncate text-[11px] text-[var(--color-muted-foreground)]">
                          {t('linkGraph.orphanSuggestHint', { titles: similarTitles.join(' · ') })}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-1">
                      {top ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 gap-1 px-2 text-[11px] text-[var(--color-accent)]"
                          title={t('linkGraph.orphanSuggestHint', {
                            titles: similarTitles.join(' · '),
                          })}
                          onClick={() => onOpen(row.id)}
                        >
                          <Link2 className="h-3 w-3" />
                          {t('linkGraph.orphanSuggestLink')}
                          <span className="max-w-[9rem] truncate opacity-80">→ {top.title}</span>
                        </Button>
                      ) : null}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[11px] text-[var(--color-muted-foreground)]"
                        onClick={() => void onArchive([row.id])}
                      >
                        {t('linkGraph.orphanArchiveOne')}
                      </Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </ScrollArea>
        </>
      ) : null}

      {filterHint ? (
        <>
          <Separator />
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <p className="m-0 text-[12px] text-[var(--color-muted-foreground)]">{filterHint}</p>
            {onClearFilters ? (
              <Button type="button" variant="outline" size="sm" className="h-7 text-[11px]" onClick={onClearFilters}>
                {t('linkGraph.clearMapFilters')}
              </Button>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  )
}
