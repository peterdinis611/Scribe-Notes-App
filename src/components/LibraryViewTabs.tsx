import { FolderTree, Star, Tag as TagIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export type LibraryView = 'folders' | 'favorites' | 'tags'

type LibraryViewTabsProps = {
  value: LibraryView
  favoriteCount: number
  tagCount: number
  onChange: (view: LibraryView) => void
}

const tabs: { id: LibraryView; label: string; icon: typeof FolderTree }[] = [
  { id: 'folders', label: 'Priečinky', icon: FolderTree },
  { id: 'favorites', label: 'Obľúbené', icon: Star },
  { id: 'tags', label: 'Štítky', icon: TagIcon },
]

export function LibraryViewTabs({ value, favoriteCount, tagCount, onChange }: LibraryViewTabsProps) {
  function countFor(view: LibraryView) {
    if (view === 'favorites') return favoriteCount
    if (view === 'tags') return tagCount
    return null
  }

  return (
    <div className="library-view-tabs titlebar-no-drag" role="tablist" aria-label="Zobrazenie knižnice">
      {tabs.map((tab) => {
        const count = countFor(tab.id)
        const Icon = tab.icon
        const isActive = value === tab.id

        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={cn('library-view-tab', isActive && 'is-active')}
            onClick={() => onChange(tab.id)}
          >
            <Icon className={cn('h-3.5 w-3.5 shrink-0', tab.id === 'favorites' && isActive && 'fill-current')} />
            <span>{tab.label}</span>
            {count !== null && count > 0 && <span className="library-view-tab-count">{count}</span>}
          </button>
        )
      })}
    </div>
  )
}
