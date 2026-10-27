import { CalendarDays, FilePlus, FolderKanban, FolderPlus, Lock, Plus, Search, Trash2 } from 'lucide-react'
import {
  lazy,
  startTransition,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { ScrollArea } from '@/components/ui/scroll-area'
import { FolderTree } from '@/components/FolderTree'
import SmartFoldersSection from '@/components/SmartFoldersSection'
import { LibraryFilterBanner } from '@/components/LibraryFilterBanner'
import { LibraryBulkBar } from '@/components/library/LibraryBulkBar'
import { LibrarySmartFilters } from '@/components/library/LibrarySmartFilters'
import { LibrarySwitcher } from '@/components/library/LibrarySwitcher'
import { LibraryViewTabs, type LibraryView } from '@/components/LibraryViewTabs'

const LibraryFavoritesView = lazy(() =>
  import('@/components/LibraryFavoritesView').then((m) => ({ default: m.LibraryFavoritesView })),
)
const LibraryRecentView = lazy(() =>
  import('@/components/LibraryRecentView').then((m) => ({ default: m.LibraryRecentView })),
)
const LibraryTagsView = lazy(() =>
  import('@/components/LibraryTagsView').then((m) => ({ default: m.LibraryTagsView })),
)
const LibraryJournalView = lazy(() =>
  import('@/components/LibraryJournalView').then((m) => ({ default: m.LibraryJournalView })),
)
const LibraryLinkGraphView = lazy(() =>
  import('@/components/LibraryLinkGraphView').then((m) => ({ default: m.LibraryLinkGraphView })),
)
const LibraryDuplicatesPanel = lazy(() =>
  import('@/components/LibraryDuplicatesPanel').then((m) => ({ default: m.LibraryDuplicatesPanel })),
)
const LibraryTasksPanel = lazy(() =>
  import('@/components/LibraryTasksPanel').then((m) => ({ default: m.LibraryTasksPanel })),
)
const LibraryDatabaseView = lazy(() =>
  import('@/components/LibraryDatabaseView').then((m) => ({ default: m.LibraryDatabaseView })),
)
const LibraryWikiHealthPanel = lazy(() =>
  import('@/components/LibraryWikiHealthPanel').then((m) => ({ default: m.LibraryWikiHealthPanel })),
)
const LibraryChatPanel = lazy(() =>
  import('@/components/LibraryChatPanel').then((m) => ({ default: m.LibraryChatPanel })),
)
import { SidebarRail } from '@/components/layout/SidebarRail'
import { SidebarSearchResults } from '@/components/SidebarSearchResults'
import { listWikiHealth } from '@/lib/db/api'
import { nlpListOpenTasks } from '@/lib/db/nlp-api'
import { visibleLibraryDocuments } from '@/lib/db/library-sync'
import { openTodayNote } from '@/lib/journal-notes'
import { promptAndCreateFolder, promptAndCreateVaultFolder } from '@/lib/library/create-folder'
import { createDocumentInFolder } from '@/lib/library/create-document-in-folder'
import { scheduleIdle } from '@/lib/schedule-idle'
import { ROUTES } from '@/lib/routes'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { IconTooltip } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { openAgentPanel, setAgentPanelOpen, setLibraryGraphAroundActive, setLibraryView, setTrashOpen } from '@/store/documentsSlice'
import {
  setCommandPaletteOpen,
} from '@/store/foldersSlice'
import { setSyncConflictsOpen } from '@/store/uiSlice'
import { useResizableSidebar } from '@/hooks/useResizableSidebar'
import { getPluginsGeneration, listPluginSidebarPanels, subscribePlugins } from '@/lib/plugins'

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
      className="library-conflict-badge"
      onClick={() => dispatch(setSyncConflictsOpen(true))}
      title={t('syncConflicts.badge', { count })}
    >
      {t('syncConflicts.badge', { count })}
    </button>
  )
}

export function Sidebar({ isCompact = false, isOpen = true, onClose }: SidebarProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [smartComposeOpen, setSmartComposeOpen] = useState(false)
  const [pluginsGeneration, setPluginsGeneration] = useState(() => getPluginsGeneration())
  const scrollRef = useRef<HTMLDivElement>(null)
  useEffect(() => subscribePlugins(() => setPluginsGeneration(getPluginsGeneration())), [])
  const pluginPanels = useMemo(() => listPluginSidebarPanels(), [pluginsGeneration])
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const documents = useAppSelector((state) => state.documents.documents)
  const folders = useAppSelector((state) => state.folders.folders)
  const recentDocumentIds = useAppSelector((state) => state.documents.recentDocumentIds)
  const recentlyClosedIds = useAppSelector((state) => state.documents.recentlyClosedIds)
  const libraryView = useAppSelector((state) => state.documents.libraryView)
  const agentPanelOpen = useAppSelector((state) => state.documents.agentPanelOpen)
  const graphAroundActive = useAppSelector((state) => state.documents.libraryGraphAroundActive)
  const storageModeEnabled = useAppSelector((state) => state.settings.storageModeEnabled)
  const contentView = libraryView === 'agent' ? 'folders' : libraryView
  const isContentSearch = query.trim().length >= 2

  useEffect(() => {
    if (pathname === '/storage' && storageModeEnabled && libraryView !== 'storage') {
      dispatch(setLibraryView('storage'))
    }
  }, [dispatch, libraryView, pathname, storageModeEnabled])

  useEffect(() => {
    if (!storageModeEnabled && libraryView === 'storage') {
      dispatch(setLibraryView('folders'))
      if (pathname === '/storage') {
        void navigate(ROUTES.home())
      }
    }
  }, [dispatch, libraryView, navigate, pathname, storageModeEnabled])

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
    const cancel = scheduleIdle(() => {
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
    }, 2500)
    return () => {
      cancelled = true
      cancel()
    }
  }, [visibleDocuments.length])

  const { resizing, onResizePointerDown, resetWidth } = useResizableSidebar()

  const handleCreateFolder = useCallback(async () => {
    await promptAndCreateFolder({ t, dispatch })
  }, [dispatch, t])

  const handleViewChange = useCallback(
    (view: LibraryView) => {
      if (view === 'agent') {
        if (agentPanelOpen) dispatch(setAgentPanelOpen(false))
        else dispatch(openAgentPanel({ persona: 'general' }))
        return
      }
      // Keep the tab chrome responsive while heavy views (graph/chat/…) load.
      startTransition(() => {
        if (view === 'chat') {
          dispatch(setLibraryView('chat'))
          return
        }
        if (view === 'graph') {
          dispatch(setLibraryGraphAroundActive(false))
          dispatch(setLibraryView('graph'))
          return
        }
        if (view === 'storage') {
          dispatch(setLibraryView('storage'))
          void navigate(ROUTES.storageMode())
          onClose?.()
          return
        }
        if (libraryView === 'storage' && pathname === '/storage') {
          void navigate(ROUTES.home())
        }
        dispatch(setLibraryView(view))
      })
    },
    [agentPanelOpen, dispatch, libraryView, navigate, onClose, pathname],
  )

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

        <div className="app-sidebar-panel library-desk titlebar-no-drag min-h-0" data-tour="library-panel">
          <header className="library-desk-head">
            <div className="library-desk-identity">
              <LibrarySwitcher />
              <p className="library-desk-count">
                {t('library.documentCount', { count: visibleDocuments.length })}
              </p>
            </div>
            <ConflictBadge />

            <div className="library-desk-search" data-tour="library-search">
              <Search className="library-desk-search-icon" aria-hidden="true" />
              <input
                type="search"
                className="library-desk-search-input"
                placeholder={t('library.searchPlaceholder')}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <button
                type="button"
                className="library-desk-search-cmd"
                onClick={() => dispatch(setCommandPaletteOpen(true))}
                title={t('shortcuts.commandPalette.label')}
                aria-label={t('shortcuts.commandPalette.label')}
              >
                ⌘K
              </button>
            </div>
          </header>

          <SidebarSearchResults query={query} onNavigate={onClose} />

          {!isContentSearch && (
            <>
              <div className="library-desk-chrome" data-tour="library-views">
                <LibraryViewTabs
                  value={libraryView}
                  agentOpen={agentPanelOpen}
                  storageModeEnabled={storageModeEnabled}
                  favoriteCount={favoriteCount}
                  tagCount={tagCount}
                  recentCount={recentCount}
                  taskCount={taskCount}
                  wikiHealthCount={wikiHealthCount}
                  onChange={handleViewChange}
                  trailing={
                    contentView === 'folders' ? (
                      <>
                        <LibrarySmartFilters />
                        <IconTooltip label={t('library.newPageInFolder')}>
                          <button
                            type="button"
                            className="library-view-icon is-accent"
                            onClick={() =>
                              void createDocumentInFolder({
                                folderId: null,
                                t,
                                dispatch,
                                navigate: (route) => navigate(route),
                              }).then(() => onClose?.())
                            }
                            aria-label={t('library.newPageInFolder')}
                          >
                            <FilePlus className="h-4 w-4" />
                          </button>
                        </IconTooltip>
                        <DropdownMenu>
                          <IconTooltip label={t('library.moreActions')}>
                            <DropdownMenuTrigger asChild>
                              <button
                                type="button"
                                className="library-view-icon"
                                aria-label={t('library.moreActions')}
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                            </DropdownMenuTrigger>
                          </IconTooltip>
                          <DropdownMenuContent align="end" className="min-w-[12rem]">
                            <DropdownMenuItem onSelect={() => void handleCreateFolder()}>
                              <FolderPlus className="h-4 w-4" />
                              {t('library.newFolder')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onSelect={() =>
                                void promptAndCreateVaultFolder({ t, dispatch }).catch(() => undefined)
                              }
                            >
                              <Lock className="h-4 w-4" />
                              {t('library.newVaultFolder')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => setSmartComposeOpen(true)}>
                              <FolderKanban className="h-4 w-4" />
                              {t('smartFolders.add')}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onSelect={() => {
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
                            >
                              <CalendarDays className="h-4 w-4" />
                              {t('journal.today')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => dispatch(setTrashOpen(true))}>
                              <Trash2 className="h-4 w-4" />
                              {t('library.trash')}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </>
                    ) : null
                  }
                />
                {contentView === 'folders' && (
                  <>
                    <LibraryFilterBanner />
                    <LibraryBulkBar />
                  </>
                )}
              </div>

              {contentView === 'folders' && (
                <div className="library-desk-body">
                  <div
                    ref={scrollRef}
                    className="library-folders-scroll"
                    data-tour="library-tree-scroll"
                  >
                    <div className="folder-tree px-1.5 pb-3" data-tour="library-tree">
                      <SmartFoldersSection
                        onNavigate={onClose}
                        composeOpen={smartComposeOpen}
                        onComposeOpenChange={setSmartComposeOpen}
                      />
                      <FolderTree query={query} scrollRef={scrollRef} onNavigate={onClose} />
                      {pluginPanels.length > 0 && (
                        <div className="mt-2 border-t border-[var(--color-border)] px-1 py-2">
                          {pluginPanels.map((panel) => (
                            <div key={panel.entryId} className="mb-1 last:mb-0">
                              {panel.render()}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {contentView !== 'folders' && (
                <ScrollArea className="library-desk-alt min-h-0 flex-1">
                  <div className="pb-3">
                    <Suspense fallback={null}>
                      {contentView === 'recent' && (
                        <div className="px-1 pb-3 pt-1">
                          <LibraryRecentView onNavigate={onClose} />
                        </div>
                      )}
                      {contentView === 'favorites' && (
                        <div className="px-1 pb-3 pt-1">
                          <LibraryFavoritesView onNavigate={onClose} />
                        </div>
                      )}
                      {contentView === 'tags' && (
                        <div className="px-1 pb-3 pt-1">
                          <LibraryTagsView onNavigate={onClose} />
                        </div>
                      )}
                      {contentView === 'journal' && <LibraryJournalView onNavigate={onClose} />}
                      {contentView === 'graph' && (
                        <LibraryLinkGraphView
                          initialAroundActive={graphAroundActive}
                          onAroundActiveConsumed={() => dispatch(setLibraryGraphAroundActive(false))}
                        />
                      )}
                      {contentView === 'duplicates' && <LibraryDuplicatesPanel onNavigate={onClose} />}
                      {contentView === 'tasks' && <LibraryTasksPanel onNavigate={onClose} />}
                      {contentView === 'database' && <LibraryDatabaseView onNavigate={onClose} />}
                      {contentView === 'wikiHealth' && <LibraryWikiHealthPanel onNavigate={onClose} />}
                      {contentView === 'chat' && (
                        <div className="px-1 pb-3 pt-1">
                          <LibraryChatPanel />
                        </div>
                      )}
                    </Suspense>
                    {contentView === 'storage' && (
                      <div className="px-3 py-3 text-[12px] leading-relaxed text-[var(--color-muted-foreground)]">
                        <p className="m-0 text-[13px] font-semibold tracking-[-0.01em] text-[var(--color-foreground)]">
                          {t('library.tabs.storage')}
                        </p>
                        <p className="mt-1.5 m-0">{t('storageMode.sidebarHint')}</p>
                        <button
                          type="button"
                          className="mt-3 inline-flex h-8 items-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-[12px] font-medium text-[var(--color-foreground)] hover:bg-[var(--color-hover)]"
                          onClick={() => {
                            void navigate(ROUTES.storageMode())
                            onClose?.()
                          }}
                        >
                          {t('storageMode.openBrowser')}
                        </button>
                      </div>
                    )}
                    {pluginPanels.length > 0 && (
                      <div className="border-t border-[var(--color-border)] px-1 py-2">
                        {pluginPanels.map((panel) => (
                          <div key={panel.entryId} className="mb-1 last:mb-0">
                            {panel.render()}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </ScrollArea>
              )}
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
