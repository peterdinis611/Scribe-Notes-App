import { CalendarDays, FolderPlus, Search, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { ScrollArea } from '@/components/ui/scroll-area'
import { FolderTree } from '@/components/FolderTree'
import SmartFoldersSection from '@/components/SmartFoldersSection'
import { LibraryFavoritesView } from '@/components/LibraryFavoritesView'
import { LibraryFilterBanner } from '@/components/LibraryFilterBanner'
import { LibraryBulkBar } from '@/components/library/LibraryBulkBar'
import { LibrarySmartFilters } from '@/components/library/LibrarySmartFilters'
import { LibraryRecentView } from '@/components/LibraryRecentView'
import { LibraryTagsView } from '@/components/LibraryTagsView'
import { LibraryJournalView } from '@/components/LibraryJournalView'
import { LibraryLinkGraphView } from '@/components/LibraryLinkGraphView'
import { LibraryChatPanel } from '@/components/LibraryChatPanel'
import { AgentPanel } from '@/components/AgentPanel'
import { LibraryDuplicatesPanel } from '@/components/LibraryDuplicatesPanel'
import { LibraryTasksPanel } from '@/components/LibraryTasksPanel'
import { LibraryWikiHealthPanel } from '@/components/LibraryWikiHealthPanel'
import { LibrarySwitcher } from '@/components/library/LibrarySwitcher'
import { LibraryViewTabs } from '@/components/LibraryViewTabs'
import { SidebarRail } from '@/components/layout/SidebarRail'
import { SidebarSearchResults } from '@/components/SidebarSearchResults'
import { listWikiHealth } from '@/lib/db/api'
import { nlpListOpenTasks } from '@/lib/db/nlp-api'
import { visibleLibraryDocuments } from '@/lib/db/library-sync'
import { openTodayNote } from '@/lib/journal-notes'
import { promptAndCreateFolder } from '@/lib/library/create-folder'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { IconTooltip } from '@/components/ui/tooltip'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setLibraryGraphAroundActive, setLibraryView, setTrashOpen } from '@/store/documentsSlice'
import {
  setCommandPaletteOpen,
} from '@/store/foldersSlice'
import { setSyncConflictsOpen } from '@/store/uiSlice'
import { useResizableSidebar } from '@/hooks/useResizableSidebar'

type SidebarProps = {
  isCompact?: boolean
  isOpen?: boolean
  onClose?: () => void
}

function ConflictBadge() {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const count = useAppSelector((state) => state.libraries.openConflictCount)
  if (count < 1) return null

  return (
    <button
      type="button"
      className="mt-1.5 h-[26px] w-full cursor-pointer rounded-lg border border-[color-mix(in_srgb,var(--color-destructive)_45%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-destructive)_10%,var(--color-surface))] font-[family-name:var(--font-mono)] text-[10px] font-[650] uppercase tracking-[0.04em] text-[var(--color-destructive)] hover:bg-[color-mix(in_srgb,var(--color-destructive)_16%,var(--color-surface))]"
      onClick={() => dispatch(setSyncConflictsOpen(true))}
      title={t('syncConflicts.badge', { count })}
    >
      {t('syncConflicts.badge', { count })}
    </button>
  )
}

const libraryActionClass =
  'library-docs-action inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-transparent bg-transparent text-[var(--color-muted-foreground)] transition-[background,color,border-color] hover:border-[var(--color-border)] hover:bg-[var(--color-hover)] hover:text-[var(--color-foreground)]'

export function Sidebar({ isCompact = false, isOpen = true, onClose }: SidebarProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const documents = useAppSelector((state) => state.documents.documents)
  const folders = useAppSelector((state) => state.folders.folders)
  const recentDocumentIds = useAppSelector((state) => state.documents.recentDocumentIds)
  const recentlyClosedIds = useAppSelector((state) => state.documents.recentlyClosedIds)
  const libraryView = useAppSelector((state) => state.documents.libraryView)
  const graphAroundActive = useAppSelector((state) => state.documents.libraryGraphAroundActive)
  const isContentSearch = libraryView !== 'chat' && libraryView !== 'agent' && query.trim().length >= 2

  const visibleDocuments = useMemo(() => visibleLibraryDocuments(documents), [documents])

  const favoriteCount = useMemo(
    () => visibleDocuments.filter((doc) => doc.isFavorite).length,
    [visibleDocuments],
  )

  const recentCount = useMemo(() => {
    const alive = new Set(visibleDocuments.map((doc) => doc.id))
    const unique = new Set(
      [...recentDocumentIds, ...recentlyClosedIds].filter((id) => alive.has(id)),
    )
    return unique.size
  }, [visibleDocuments, recentDocumentIds, recentlyClosedIds])

  const tagCount = useMemo(() => {
    const tags = new Set<string>()
    for (const doc of visibleDocuments) {
      for (const tag of doc.tags) tags.add(tag)
    }
    return tags.size
  }, [visibleDocuments])

  const [taskCount, setTaskCount] = useState(0)
  const [wikiHealthCount, setWikiHealthCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    void Promise.all([
      nlpListOpenTasks(200).catch(() => [] as Awaited<ReturnType<typeof nlpListOpenTasks>>),
      listWikiHealth({ unresolvedLimit: 80, stubMaxWords: 40, stubLimit: 40 }).catch(() => null),
    ]).then(([tasks, health]) => {
      if (cancelled) return
      setTaskCount(tasks.length)
      if (health) {
        setWikiHealthCount(health.orphans.length + health.unresolved.length + health.stubs.length)
      } else {
        setWikiHealthCount(0)
      }
    })
    return () => {
      cancelled = true
    }
  }, [visibleDocuments.length])

  const { resizing, onResizePointerDown, resetWidth } = useResizableSidebar()

  const handleCreateFolder = useCallback(async () => {
    await promptAndCreateFolder({ t, dispatch })
  }, [dispatch, t])

  return (
    <aside
      className={cn(
        'app-sidebar',
        resizing && 'is-resizing',
        isCompact && !isOpen && 'hidden',
        isCompact &&
          'max-xl:fixed max-xl:inset-y-0 max-xl:left-0 max-xl:z-40 max-xl:h-svh max-xl:max-h-svh max-xl:w-[min(calc(var(--sidebar-rail-width)+var(--sidebar-width)),92vw)] max-xl:shadow-none max-xl:transition-transform max-xl:duration-200',
        isCompact && isOpen && 'max-xl:translate-x-0 max-xl:shadow-[16px_0_48px_rgba(0,0,0,0.22)]',
      )}
    >
      <div className="relative flex h-full min-h-0 w-full flex-1">
        <div
          className="sidebar-brand-drag titlebar-drag absolute left-[var(--sidebar-rail-width)] right-0 top-0 z-0 h-12"
          aria-hidden="true"
        />
        <SidebarRail onNavigate={onClose} />

        <div className="app-sidebar-panel titlebar-no-drag min-h-0" data-tour="library-panel">
          <div className="@container/library-head min-w-0 px-3 pb-1 pt-3">
            <p className="m-0 truncate px-1 font-[family-name:var(--font-display)] text-[15px] font-extrabold tracking-[-0.03em] text-[var(--color-foreground)]">
              {t('library.title')}
            </p>
            <p className="m-0 mt-0.5 truncate px-1 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.04em] text-[var(--color-muted-foreground)]">
              {t('library.documentCount', { count: visibleDocuments.length })}
            </p>
            <LibrarySwitcher />
            <ConflictBadge />
          </div>

          <div className="px-2 py-1.5" data-tour="library-search">
            <div className="relative flex items-center rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--color-border)_90%,transparent)] bg-[color-mix(in_srgb,var(--color-background)_55%,transparent)] transition-[border-color,background] duration-120 focus-within:border-[color-mix(in_srgb,var(--color-accent)_45%,var(--color-border))] focus-within:bg-[var(--color-background)]">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 z-1 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-muted-foreground)]"
                aria-hidden="true"
              />
              <input
                type="search"
                className="h-8 w-full rounded-[var(--radius-sm)] border-0 bg-transparent py-0 pr-10 pl-[30px] text-[13px] text-[var(--color-foreground)] outline-none placeholder:text-[var(--color-muted-foreground)]"
                placeholder={t('library.searchPlaceholder')}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <button
                type="button"
                className="absolute top-1/2 right-1.5 inline-flex h-[18px] min-w-7 -translate-y-1/2 items-center justify-center rounded-[var(--radius-sm)] border border-[color-mix(in_srgb,var(--color-border)_80%,transparent)] bg-transparent px-1 font-[family-name:var(--font-mono)] text-[10px] font-medium text-[var(--color-muted-foreground)] transition-[color,background,border-color] duration-100 hover:border-[color-mix(in_srgb,var(--color-accent)_35%,var(--color-border))] hover:bg-[var(--color-hover)] hover:text-[var(--color-foreground)]"
                onClick={() => dispatch(setCommandPaletteOpen(true))}
                title={t('shortcuts.commandPalette.label')}
                aria-label={t('shortcuts.commandPalette.label')}
              >
                ⌘K
              </button>
            </div>
          </div>

          <SidebarSearchResults query={query} onNavigate={onClose} />

          {!isContentSearch && (
            <>
              <div className="px-2 pb-1 pt-0.5" data-tour="library-views">
                <LibraryViewTabs
                  value={libraryView}
                  favoriteCount={favoriteCount}
                  tagCount={tagCount}
                  recentCount={recentCount}
                  taskCount={taskCount}
                  wikiHealthCount={wikiHealthCount}
                  onChange={(view) => dispatch(setLibraryView(view))}
                />
              </div>

              <div
                className="mx-3 my-2 h-px bg-[linear-gradient(90deg,var(--color-accent),color-mix(in_srgb,var(--color-border)_80%,transparent)_28%,transparent)]"
                aria-hidden="true"
              />

              {libraryView === 'folders' && (
                <>
                  <LibraryFilterBanner />
                  <LibrarySmartFilters />
                  <LibraryBulkBar />
                  <div className="library-docs-header">
                    <h2 className="library-docs-heading">{t('library.allDocuments')}</h2>
                    <div className="library-docs-actions">
                      <IconTooltip label={t('library.newFolder')}>
                        <button
                          type="button"
                          className="library-new-folder-btn"
                          onClick={() => void handleCreateFolder()}
                          aria-label={t('library.newFolder')}
                        >
                          <FolderPlus className="h-3.5 w-3.5" />
                          <span className="library-new-folder-label">{t('library.newFolder')}</span>
                        </button>
                      </IconTooltip>
                      <IconTooltip label={t('journal.today')}>
                        <button
                          type="button"
                          className={libraryActionClass}
                          onClick={() => {
                            void openTodayNote({
                              documents,
                              folders,
                              dispatch,
                              navigate,
                              t: (key, options) => t(key, options),
                            }).catch((error) => {
                              toast.error(t('journal.openError'), String(error))
                            })
                          }}
                          aria-label={t('journal.today')}
                        >
                          <CalendarDays className="h-3.5 w-3.5" />
                        </button>
                      </IconTooltip>
                      <IconTooltip label={t('library.trash')}>
                        <button
                          type="button"
                          className={libraryActionClass}
                          onClick={() => dispatch(setTrashOpen(true))}
                          aria-label={t('library.trash')}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </IconTooltip>
                    </div>
                  </div>
                  <ScrollArea className="min-h-0 flex-1" viewportRef={scrollRef}>
                    <div className="folder-tree px-1.5 pb-3" data-tour="library-tree">
                      <SmartFoldersSection onNavigate={onClose} />
                      <FolderTree query={query} scrollRef={scrollRef} onNavigate={onClose} />
                    </div>
                  </ScrollArea>
                </>
              )}

              {libraryView === 'recent' && (
                <ScrollArea className="min-h-0 flex-1">
                  <div className="px-1 pb-3 pt-1">
                    <LibraryRecentView onNavigate={onClose} />
                  </div>
                </ScrollArea>
              )}

              {libraryView === 'favorites' && (
                <ScrollArea className="min-h-0 flex-1">
                  <div className="px-1 pb-3 pt-1">
                    <LibraryFavoritesView onNavigate={onClose} />
                  </div>
                </ScrollArea>
              )}

              {libraryView === 'tags' && (
                <ScrollArea className="min-h-0 flex-1">
                  <div className="px-1 pb-3 pt-1">
                    <LibraryTagsView onNavigate={onClose} />
                  </div>
                </ScrollArea>
              )}

              {libraryView === 'journal' && (
                <ScrollArea className="min-h-0 flex-1">
                  <LibraryJournalView onNavigate={onClose} />
                </ScrollArea>
              )}

              {libraryView === 'graph' && (
                <ScrollArea className="min-h-0 flex-1">
                  <LibraryLinkGraphView
                    initialAroundActive={graphAroundActive}
                    onAroundActiveConsumed={() => dispatch(setLibraryGraphAroundActive(false))}
                  />
                </ScrollArea>
              )}

              {libraryView === 'duplicates' && (
                <ScrollArea className="min-h-0 flex-1">
                  <LibraryDuplicatesPanel onNavigate={onClose} />
                </ScrollArea>
              )}

              {libraryView === 'tasks' && (
                <ScrollArea className="min-h-0 flex-1">
                  <LibraryTasksPanel onNavigate={onClose} />
                </ScrollArea>
              )}

              {libraryView === 'wikiHealth' && (
                <ScrollArea className="min-h-0 flex-1">
                  <LibraryWikiHealthPanel onNavigate={onClose} />
                </ScrollArea>
              )}

              {libraryView === 'chat' && <LibraryChatPanel onNavigate={onClose} />}
              {libraryView === 'agent' && <AgentPanel onNavigate={onClose} />}
            </>
          )}
        </div>
      </div>
      <button
        type="button"
        className="sidebar-resize-handle titlebar-no-drag"
        aria-label={t('library.resize')}
        title={t('library.resizeHint')}
        onPointerDown={onResizePointerDown}
        onDoubleClick={resetWidth}
      />
    </aside>
  )
}
