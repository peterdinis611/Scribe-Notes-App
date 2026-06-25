import { useSetAtom } from 'jotai'
import { FileText, FolderPlus, Search, Settings2 } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { ScrollArea } from '@/components/ui/scroll-area'
import { FolderTree } from '@/components/FolderTree'
import { SidebarSearchResults } from '@/components/SidebarSearchResults'
import { createFolder } from '@/lib/db/api'
import { promptInput } from '@/lib/input-dialog'
import { cn } from '@/lib/utils'
import { commandPaletteOpenAtom, expandedFolderIdsAtom, foldersAtom } from '@/store/folders'

type SidebarProps = {
  isCompact?: boolean
  isOpen?: boolean
  onClose?: () => void
}

export function Sidebar({ isCompact = false, isOpen = true, onClose }: SidebarProps) {
  const [query, setQuery] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const setCommandPaletteOpen = useSetAtom(commandPaletteOpenAtom)
  const setFolders = useSetAtom(foldersAtom)
  const setExpandedIds = useSetAtom(expandedFolderIdsAtom)
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
  }, [setExpandedIds, setFolders])

  return (
    <aside className={cn('app-sidebar', isCompact && 'app-sidebar--drawer', isCompact && isOpen && 'is-open')}>
      <div className="sidebar-brand">
        <div className="sidebar-brand-drag titlebar-drag" aria-hidden="true" />
        <div className="titlebar-no-drag">
          <p className="sidebar-brand-name">Scribe</p>
          <p className="sidebar-brand-tagline">Textový editor</p>
        </div>
      </div>

      <nav className="sidebar-nav titlebar-no-drag" aria-label="Navigácia">
        <Link
          to="/"
          className={cn('sidebar-nav-item', onEditorPage && 'is-active')}
          onClick={() => onClose?.()}
        >
          <FileText className="h-4 w-4" />
          Editor
        </Link>
        <Link
          to="/settings/appearance"
          className={cn('sidebar-nav-item', onSettingsPage && 'is-active')}
          onClick={() => onClose?.()}
        >
          <Settings2 className="h-4 w-4" />
          Nastavenia
        </Link>
      </nav>

      <div className="sidebar-search titlebar-no-drag">
        <div className="sidebar-search-wrap">
          <Search className="sidebar-search-icon" aria-hidden="true" />
          <input
            type="search"
            className="sidebar-search-input"
            placeholder="Hľadať v dokumentoch…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button
            type="button"
            className="sidebar-search-kbd"
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
          <div className="sidebar-library-header titlebar-no-drag">
            <h2 className="sidebar-library-title">Knižnica</h2>
            <button
              type="button"
              className="sidebar-library-action"
              onClick={() => void handleCreateFolder()}
              title="Nový priečinok"
              aria-label="Nový priečinok"
            >
              <FolderPlus className="h-4 w-4" />
            </button>
          </div>

          <ScrollArea className="sidebar-list flex-1" viewportRef={scrollRef}>
            <div className="sidebar-list-inner">
              <FolderTree query={query} scrollRef={scrollRef} onNavigate={onClose} />
            </div>
          </ScrollArea>
        </>
      )}
    </aside>
  )
}
