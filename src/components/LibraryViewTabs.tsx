import { FolderTree, GitBranch, Star, Tag as TagIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

export type LibraryView = 'folders' | 'favorites' | 'tags' | 'graph'

type LibraryViewTabsProps = {
  value: LibraryView
  favoriteCount: number
  tagCount: number
  onChange: (view: LibraryView) => void
}

export function LibraryViewTabs({ value, favoriteCount, tagCount, onChange }: LibraryViewTabsProps) {
  const { t } = useTranslation()

  const tabs: { id: LibraryView; label: string; icon: typeof FolderTree }[] = [
    { id: 'folders', label: t('library.tabs.folders'), icon: FolderTree },
    { id: 'favorites', label: t('library.tabs.favorites'), icon: Star },
    { id: 'tags', label: t('library.tabs.tags'), icon: TagIcon },
    { id: 'graph', label: t('library.tabs.graph'), icon: GitBranch },
  ]

  function countFor(view: LibraryView) {
    if (view === 'favorites') return favoriteCount
    if (view === 'tags') return tagCount
    return null
  }

  return (
    <nav className="library-view-tabs titlebar-no-drag" aria-label={t('library.tabs.ariaLabel')}>
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
            <Icon
              className={cn(
                'library-view-tab-icon h-4 w-4 shrink-0',
                tab.id === 'favorites' && isActive && 'fill-current',
              )}
            />
            <span className="library-view-tab-label">{tab.label}</span>
            {count !== null && count > 0 && (
              <span className="library-view-tab-count">{count}</span>
            )}
          </button>
        )
      })}
    </nav>
  )
}
