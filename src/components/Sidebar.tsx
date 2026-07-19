import { FolderPlus, Search, Trash2 } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollArea } from '@/components/ui/scroll-area'
import { FolderTree } from '@/components/FolderTree'
import { LibraryFavoritesView } from '@/components/LibraryFavoritesView'
import { LibraryFilterBanner } from '@/components/LibraryFilterBanner'
import { LibraryTagsView } from '@/components/LibraryTagsView'
import { LibraryLinkGraphView } from '@/components/LibraryLinkGraphView'
import { LibraryViewTabs, type LibraryView } from '@/components/LibraryViewTabs'
import { SidebarRail } from '@/components/layout/SidebarRail'
import { SidebarSearchResults } from '@/components/SidebarSearchResults'
import { createFolder } from '@/lib/db/api'
import { promptInput } from '@/lib/input-dialog'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setTrashOpen } from '@/store/documentsSlice'
import {
  setCommandPaletteOpen,
  updateExpandedFolderIds,
  updateFolders,
} from '@/store/foldersSlice'

type SidebarProps = {
  isCompact?: boolean
  isOpen?: boolean
  onClose?: () => void
}

const libraryActionClass =
  'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-none bg-transparent text-[var(--color-muted-foreground)] transition-[background,color] hover:bg-[var(--color-hover)] hover:text-[var(--color-foreground)]'

export function Sidebar({ isCompact = false, isOpen = true, onClose }: SidebarProps) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [libraryView, setLibraryView] = useState<LibraryView>('folders')
  const scrollRef = useRef<HTMLDivElement>(null)
  const dispatch = useAppDispatch()
  const documents = useAppSelector((state) => state.documents.documents)
  const isContentSearch = query.trim().length >= 2

  const favoriteCount = useMemo(
    () => documents.filter((doc) => doc.isFavorite).length,
    [documents],
  )

  const tagCount = useMemo(() => {
    const tags = new Set<string>()
    for (const doc of documents) {
      for (const tag of doc.tags) tags.add(tag)
    }
    return tags.size
  }, [documents])

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
        isCompact &&
          'max-xl:fixed max-xl:inset-y-0 max-xl:left-0 max-xl:z-40 max-xl:w-[min(calc(var(--sidebar-rail-width)+var(--sidebar-width)),92vw)] max-xl:-translate-x-[105%] max-xl:shadow-none max-xl:transition-transform max-xl:duration-200',
        isCompact && isOpen && 'max-xl:translate-x-0 max-xl:shadow-[16px_0_48px_rgba(0,0,0,0.22)]',
      )}
    >
      <div className="relative flex min-h-0 flex-1">
        <div
          className="sidebar-brand-drag titlebar-drag absolute left-[var(--sidebar-rail-width)] right-0 top-0 z-0 h-12"
          aria-hidden="true"
        />
        <SidebarRail onNavigate={onClose} />

        <div className="app-sidebar-panel titlebar-no-drag min-h-0">
          <div className="px-3 pb-1 pt-3">
            <p className="m-0 truncate px-1 text-[13px] font-semibold tracking-[-0.02em] text-[var(--color-foreground)]">
              {t('library.title')}
            </p>
            <p className="m-0 mt-0.5 truncate px-1 text-[11px] text-[var(--color-muted-foreground)]">
              {t('library.documentCount', { count: documents.length })}
            </p>
          </div>

          <div className="px-2 py-1.5">
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
              <div className="px-2 pb-1 pt-0.5">
                <LibraryViewTabs
                  value={libraryView}
                  favoriteCount={favoriteCount}
                  tagCount={tagCount}
                  onChange={setLibraryView}
                />
              </div>

              <div className="library-section-sep" aria-hidden="true" />

              {libraryView === 'folders' && (
                <>
                  <LibraryFilterBanner />
                  <div className="flex items-center justify-between gap-2 px-3 pb-1 pt-2">
                    <h2 className="m-0 text-[11px] font-medium text-[var(--color-muted-foreground)]">
                      {t('library.allDocuments')}
                    </h2>
                    <div className="inline-flex items-center gap-0.5">
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
                    <div className="px-1 pb-3">
                      <FolderTree query={query} scrollRef={scrollRef} onNavigate={onClose} />
                    </div>
                  </ScrollArea>
                </>
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

              {libraryView === 'graph' && (
                <ScrollArea className="min-h-0 flex-1">
                  <LibraryLinkGraphView />
                </ScrollArea>
              )}
            </>
          )}
        </div>
      </div>
    </aside>
  )
}
