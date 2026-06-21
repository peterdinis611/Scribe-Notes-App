import { useSetAtom } from 'jotai'
import { FileText, Search, Settings2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { ScrollArea } from '@/components/ui/scroll-area'
import { FolderTree } from '@/components/FolderTree'
import { cn } from '@/lib/utils'
import { commandPaletteOpenAtom } from '@/store/folders'

export function Sidebar() {
  const [query, setQuery] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const setCommandPaletteOpen = useSetAtom(commandPaletteOpenAtom)
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const onSettingsPage = pathname.startsWith('/settings')
  const onEditorPage = pathname === '/' || pathname.startsWith('/doc/')

  return (
    <aside className="app-sidebar">
      <div className="sidebar-brand titlebar-drag">
        <div className="titlebar-no-drag">
          <p className="sidebar-brand-name">Scribe</p>
          <p className="sidebar-brand-tagline">Textový editor</p>
        </div>
      </div>

      <nav className="sidebar-nav titlebar-no-drag" aria-label="Navigácia">
        <Link
          to="/"
          className={cn('sidebar-nav-item', onEditorPage && 'is-active')}
        >
          <FileText className="h-4 w-4" />
          Editor
        </Link>
        <Link
          to="/settings/appearance"
          className={cn('sidebar-nav-item', onSettingsPage && 'is-active')}
        >
          <Settings2 className="h-4 w-4" />
          Nastavenia
        </Link>
      </nav>

      <div className="sidebar-search titlebar-no-drag">
        <button
          type="button"
          className="sidebar-search-field sidebar-search-trigger"
          onClick={() => setCommandPaletteOpen(true)}
        >
          <Search className="sidebar-search-icon" aria-hidden="true" />
          <span className="sidebar-search-placeholder">Hľadať… ⌘K</span>
        </button>
        <input
          type="search"
          className="sidebar-search-input sidebar-search-input--filter"
          placeholder="Filtrovať strom…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <ScrollArea className="sidebar-list flex-1" viewportRef={scrollRef}>
        <div className="sidebar-list-inner">
          <FolderTree query={query} scrollRef={scrollRef} />
        </div>
      </ScrollArea>
    </aside>
  )
}
