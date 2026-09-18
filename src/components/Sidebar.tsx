import { FolderPlus, CalendarDays, Search, Trash2 } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { ScrollArea } from '@/components/ui/scroll-area'
import { FolderTree } from '@/components/FolderTree'
import { LibraryFavoritesView } from '@/components/LibraryFavoritesView'
import { LibraryFilterBanner } from '@/components/LibraryFilterBanner'
import { LibraryBulkBar } from '@/components/library/LibraryBulkBar'
import { LibrarySmartFilters } from '@/components/library/LibrarySmartFilters'
import { LibraryRecentView } from '@/components/LibraryRecentView'
import { LibraryTagsView } from '@/components/LibraryTagsView'
import { LibraryJournalView } from '@/components/LibraryJournalView'
import { LibraryLinkGraphView } from '@/components/LibraryLinkGraphView'
import { LibraryChatPanel } from '@/components/LibraryChatPanel'
import { LibraryViewTabs } from '@/components/LibraryViewTabs'
import { SidebarRail } from '@/components/layout/SidebarRail'
import { SidebarSearchResults } from '@/components/SidebarSearchResults'
import { visibleLibraryDocuments } from '@/lib/db/library-sync'
import { createFolder } from '@/lib/db/api'
import { openTodayNote } from '@/lib/journal-notes'
import { promptInput } from '@/lib/input-dialog'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setLibraryGraphAroundActive, setLibraryView, setTrashOpen } from '@/store/documentsSlice'
import {
  setCommandPaletteOpen,
  updateExpandedFolderIds,
  updateFolders,
} from '@/store/foldersSlice'
import { useResizableSidebar } from '@/hooks/useResizableSidebar'

type SidebarProps = {
  isCompact?: boolean
  isOpen?: boolean
  onClose?: () => void
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
  const isContentSearch = libraryView !== 'chat' && query.trim().length >= 2

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
  const { resizing, onResizePointerDown, resetWidth } = useResizableSidebar()

  const handleCreateFolder = useCallback(async () => {
    const name = await promptInput({
      title: t('library.newFolder'),
      defaultValue: t('library.newFolder'),
      placeholder: t('library.folderNamePlaceholder'),
      confirmLabel: t('common.create'),
    })
    if (!name) return
    const folder = await createFolder({ name })
    dispatch(updateFolders((prev) => [...prev, folder]))
    dispatch(updateExpandedFolderIds((prev) => [...prev, folder.id]))
    toast.success(t('toasts.folderCreated'), folder.name)
  }, [dispatch, t])

  return (
    <aside
      className={cn(
        'app-sidebar',
        resizing && 'is-resizing',
        isCompact &&
          'max-xl:fixed max-xl:inset-y-0 max-xl:left-0 max-xl:z-40 max-xl:w-[min(calc(var(--sidebar-rail-width)+var(--sidebar-width)),92vw)] max-xl:-translate-x-[105%] max-xl:shadow-none max-xl:transition-transform max-xl:duration-200',
        isCompact && isOpen && 'max-xl:translate-x-0 max-xl:shadow-[16px_0_48px_rgba(0,0,0,0.22)]',
      )}
    >
      <div className="relative flex h-full min-h-0 flex-1">
        <div
          className="sidebar-brand-drag titlebar-drag absolute left-[var(--sidebar-rail-width)] right-0 top-0 z-0 h-12"
          aria-hidden="true"
        />
        <SidebarRail onNavigate={onClose} />

        <div className="app-sidebar-panel titlebar-no-drag min-h-0" data-tour="library-panel">
          <div className="library-panel-head px-3 pb-1 pt-3">
            <p className="library-panel-title m-0 truncate px-1">
              {t('library.title')}
            </p>
            <p className="library-panel-meta m-0 mt-0.5 truncate px-1">
              {t('library.documentCount', { count: visibleDocuments.length })}
            </p>
          </div>

          <div className="px-2 py-1.5" data-tour="library-search">
            <div className="library-search relative flex items-center">
              <Search
                className="pointer-events-none absolute left-2.5 top-1/2 z-1 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-muted-foreground)]"
                aria-hidden="true"
              />
              <input
                type="search"
                className="library-search-input"
                placeholder={t('library.searchPlaceholder')}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <button
                type="button"
                className="library-search-kbd"
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
                  onChange={(view) => dispatch(setLibraryView(view))}
                />
              </div>

              <div className="library-section-sep" aria-hidden="true" />

              {libraryView === 'folders' && (
                <>
                  <LibraryFilterBanner />
                  <LibrarySmartFilters />
                  <LibraryBulkBar />
                  <div className="library-docs-header">
                    <h2 className="library-docs-heading">{t('library.allDocuments')}</h2>
                    <div className="library-docs-actions">
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
                        title={t('journal.today')}
                        aria-label={t('journal.today')}
                      >
                        <CalendarDays className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className={libraryActionClass}
                        onClick={() => dispatch(setTrashOpen(true))}
                        title={t('library.trash')}
                        aria-label={t('library.trash')}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        className={libraryActionClass}
                        onClick={() => void handleCreateFolder()}
                        title={t('library.newFolder')}
                        aria-label={t('library.newFolder')}
                      >
                        <FolderPlus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <ScrollArea className="min-h-0 flex-1" viewportRef={scrollRef}>
                    <div className="folder-tree px-1.5 pb-3" data-tour="library-tree">
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

              {libraryView === 'chat' && <LibraryChatPanel onNavigate={onClose} />}
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
