import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { FileText, FolderPlus, Search, Settings2, Star, Tag as TagIcon, Trash2 } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { FolderTree } from '@/components/FolderTree'
import { SidebarSearchResults } from '@/components/SidebarSearchResults'
import { createFolder } from '@/lib/db/api'
import { promptInput } from '@/lib/input-dialog'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import {
  activeTagFilterAtom,
  documentsAtom,
  favoritesOnlyFilterAtom,
  trashOpenAtom,
} from '@/store/documents'
import { commandPaletteOpenAtom, expandedFolderIdsAtom, foldersAtom } from '@/store/folders'

type SidebarProps = {
  isCompact?: boolean
  isOpen?: boolean
  onClose?: () => void
}

const navLinkClass =
  'inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 text-[12px] font-medium text-[var(--color-muted-foreground)] no-underline transition-[background,color,border-color] duration-120 hover:bg-[var(--color-hover)] hover:text-[var(--color-foreground)]'

const navLinkActiveClass =
  'border-[var(--color-accent)] bg-[var(--color-selection)] font-semibold text-[var(--color-accent)]'

const libraryActionClass =
  'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[var(--color-border)] bg-transparent text-[var(--color-muted-foreground)] transition-[background,color,border-color] hover:border-[color-mix(in_srgb,var(--color-accent)_30%,var(--color-border))] hover:bg-[var(--color-hover)] hover:text-[var(--color-accent)]'

export function Sidebar({ isCompact = false, isOpen = true, onClose }: SidebarProps) {
  const [query, setQuery] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const setCommandPaletteOpen = useSetAtom(commandPaletteOpenAtom)
  const setFolders = useSetAtom(foldersAtom)
  const setExpandedIds = useSetAtom(expandedFolderIdsAtom)
  const documents = useAtomValue(documentsAtom)
  const [favoritesOnly, setFavoritesOnly] = useAtom(favoritesOnlyFilterAtom)
  const [activeTagFilter, setTagFilter] = useAtom(activeTagFilterAtom)
  const setTrashOpen = useSetAtom(trashOpenAtom)

  const availableTags = useMemo(() => {
    const tags = new Set<string>()
    for (const doc of documents) {
      for (const tag of doc.tags) tags.add(tag)
    }
    return [...tags].sort()
  }, [documents])
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const onSettingsPage = pathname.startsWith('/settings')
  const onEditorPage = pathname === '/' || pathname.startsWith('/doc/')
  const isContentSearch = query.trim().length >= 2

  const handleCreateFolder = useCallback(async () => {
    const name = await promptInput({
      title: 'Nový priečinok',
      defaultValue: 'Nový priečinok',
      placeholder: 'Názov priečinka',
      confirmLabel: 'Vytvoriť',
    })
    if (!name) return
    const folder = await createFolder({ name })
    setFolders((prev) => [...prev, folder])
    setExpandedIds((prev: Set<string>) => new Set(prev).add(folder.id))
    toast.success('Priečinok vytvorený', folder.name)
  }, [setExpandedIds, setFolders])

  return (
    <aside
      className={cn(
        'flex h-full w-[var(--sidebar-width,280px)] shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-sidebar)] backdrop-blur-2xl backdrop-saturate-[180%]',
        isCompact &&
          'max-xl:fixed max-xl:inset-y-0 max-xl:left-0 max-xl:z-40 max-xl:w-[min(var(--sidebar-width,280px),88vw)] max-xl:-translate-x-[105%] max-xl:shadow-none max-xl:transition-transform max-xl:duration-180',
        isCompact && isOpen && 'max-xl:translate-x-0 max-xl:shadow-[12px_0_40px_rgba(0,0,0,0.28)]',
      )}
    >
      <div className="relative px-4 pb-2 pt-4">
        <div
          className="sidebar-brand-drag titlebar-drag absolute bottom-0 left-[var(--titlebar-traffic-lights-width,78px)] right-0 top-0 z-0"
          aria-hidden="true"
        />
        <div className="titlebar-no-drag">
          <p className="m-0 text-[18px] font-bold tracking-[-0.03em] text-[var(--color-foreground)]">
            Scribe
          </p>
          <p className="mt-0.5 text-[12px] text-[var(--color-muted-foreground)]">Textový editor</p>
        </div>
      </div>

      <nav className="titlebar-no-drag flex gap-1 px-3 pb-3" aria-label="Navigácia">
        <Link
          to="/"
          className={cn(navLinkClass, onEditorPage && navLinkActiveClass)}
          onClick={() => onClose?.()}
        >
          <FileText className="h-4 w-4" />
          Editor
        </Link>
        <Link
          to="/settings/appearance"
          className={cn(navLinkClass, onSettingsPage && navLinkActiveClass)}
          onClick={() => onClose?.()}
        >
          <Settings2 className="h-4 w-4" />
          Nastavenia
        </Link>
      </nav>

      <div className="titlebar-no-drag px-3 pb-2.5">
        <div className="relative flex items-center">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 z-1 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-muted-foreground)]"
            aria-hidden="true"
          />
          <Input
            type="search"
            className="h-8 pl-[30px] pr-11 text-[12px]"
            placeholder="Hľadať v dokumentoch…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button
            type="button"
            className="absolute right-1.5 top-1/2 inline-flex h-[22px] min-w-7 -translate-y-1/2 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-1.5 text-[11px] font-medium text-[var(--color-muted-foreground)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-foreground)]"
            onClick={() => setCommandPaletteOpen(true)}
            title="Príkazová paleta"
            aria-label="Otvoriť príkazovú paletu"
          >
            ⌘K
          </button>
        </div>
      </div>

      <SidebarSearchResults query={query} onNavigate={onClose} />

      {!isContentSearch && (
        <>
          <div className="titlebar-no-drag flex items-center justify-between gap-2 px-3 pb-2">
            <h2 className="m-0 text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--color-muted-foreground)]">
              Knižnica
            </h2>
            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                className={cn(
                  libraryActionClass,
                  favoritesOnly &&
                    'border-[color-mix(in_srgb,var(--color-accent)_40%,var(--color-border))] bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-[var(--color-accent)]',
                )}
                onClick={() => setFavoritesOnly((value) => !value)}
                title="Iba obľúbené"
                aria-label="Iba obľúbené"
                aria-pressed={favoritesOnly}
              >
                <Star className={cn('h-4 w-4', favoritesOnly && 'fill-current')} />
              </button>
              <button
                type="button"
                className={libraryActionClass}
                onClick={() => setTrashOpen(true)}
                title="Kôš"
                aria-label="Kôš"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                className={libraryActionClass}
                onClick={() => void handleCreateFolder()}
                title="Nový priečinok"
                aria-label="Nový priečinok"
              >
                <FolderPlus className="h-4 w-4" />
              </button>
            </div>
          </div>

          {availableTags.length > 0 && (
            <div className="titlebar-no-drag flex items-center gap-1.5 px-3 pb-2">
              <TagIcon className="h-3.5 w-3.5 shrink-0 opacity-60" />
              <div className="flex min-w-0 flex-wrap gap-1">
                {activeTagFilter && (
                  <Badge
                    variant="accent"
                    className="cursor-default"
                    onClick={() => setTagFilter(null)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') setTagFilter(null)
                    }}
                  >
                    {activeTagFilter} ✕
                  </Badge>
                )}
                {!activeTagFilter &&
                  availableTags.map((tagName) => (
                    <Badge
                      key={tagName}
                      className="cursor-default hover:border-[color-mix(in_srgb,var(--color-accent)_35%,var(--color-border))] hover:text-[var(--color-accent)]"
                      onClick={() => setTagFilter(tagName)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') setTagFilter(tagName)
                      }}
                    >
                      {tagName}
                    </Badge>
                  ))}
              </div>
            </div>
          )}

          <ScrollArea className="flex-1" viewportRef={scrollRef}>
            <div className="px-1 pb-3">
              <FolderTree query={query} scrollRef={scrollRef} onNavigate={onClose} />
            </div>
          </ScrollArea>
        </>
      )}
    </aside>
  )
}
