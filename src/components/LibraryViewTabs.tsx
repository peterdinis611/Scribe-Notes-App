import {
  CalendarDays,
  CheckSquare,
  Copy,
  FolderTree,
  GitBranch,
  History,
  MessageCircle,
  Network,
  Star,
  Tag as TagIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { IconTooltip } from '@/components/ui/tooltip'

export type LibraryView =
  | 'folders'
  | 'recent'
  | 'favorites'
  | 'tags'
  | 'graph'
  | 'journal'
  | 'chat'
  | 'duplicates'
  | 'tasks'
  | 'wikiHealth'

type LibraryViewTabsProps = {
  value: LibraryView
  favoriteCount: number
  tagCount: number
  recentCount?: number
  taskCount?: number
  wikiHealthCount?: number
  onChange: (view: LibraryView) => void
}

export function LibraryViewTabs({
  value,
  favoriteCount,
  tagCount,
  recentCount = 0,
  taskCount = 0,
  wikiHealthCount = 0,
  onChange,
}: LibraryViewTabsProps) {
  const { t } = useTranslation()

  const tabs: { id: LibraryView; label: string; icon: typeof FolderTree }[] = [
    { id: 'folders', label: t('library.tabs.folders'), icon: FolderTree },
    { id: 'recent', label: t('library.tabs.recent'), icon: History },
    { id: 'favorites', label: t('library.tabs.favorites'), icon: Star },
    { id: 'journal', label: t('library.tabs.journal'), icon: CalendarDays },
    { id: 'tags', label: t('library.tabs.tags'), icon: TagIcon },
    { id: 'graph', label: t('library.tabs.graph'), icon: GitBranch },
    { id: 'duplicates', label: t('library.tabs.duplicates'), icon: Copy },
    { id: 'tasks', label: t('library.tabs.tasks'), icon: CheckSquare },
    { id: 'wikiHealth', label: t('library.tabs.wikiHealth'), icon: Network },
    { id: 'chat', label: t('library.tabs.chat'), icon: MessageCircle },
  ]

  function countFor(view: LibraryView) {
    if (view === 'favorites') return favoriteCount
    if (view === 'tags') return tagCount
    if (view === 'recent') return recentCount
    if (view === 'tasks') return taskCount
    if (view === 'wikiHealth') return wikiHealthCount
    return null
  }

  return (
    <nav className="flex flex-col gap-0.5 border-0 bg-transparent p-0 titlebar-no-drag" aria-label={t('library.tabs.ariaLabel')}>
      {tabs.map((tab) => {
        const count = countFor(tab.id)
        const Icon = tab.icon
        const isActive = value === tab.id

        return (
          <IconTooltip key={tab.id} label={tab.label}>
            <button
              type="button"
              role="tab"
              aria-selected={isActive}
              className={cn(
                'flex w-full min-w-0 cursor-default items-center justify-start gap-2 rounded-[var(--radius-sm)] border border-transparent bg-transparent px-2 py-1.5 text-[13px] font-medium text-[var(--color-muted-foreground)] transition-[background,color,border-color] duration-120 hover:bg-[var(--color-hover)] hover:text-[var(--color-foreground)]',
                isActive &&
                  'bg-[var(--color-selection)] text-[var(--color-foreground)] shadow-none [[html[data-ui-skin=press]_&]]:border-[color-mix(in_srgb,var(--color-accent)_28%,transparent)] [[html[data-ui-skin=press]_&]]:bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] [[html[data-ui-skin=press]_&]]:shadow-[inset_2px_0_0_0_var(--color-accent)]',
              )}
              data-tour={tab.id === 'chat' ? 'library-chat' : undefined}
              onClick={() => onChange(tab.id)}
              aria-label={tab.label}
            >
              <Icon
                className={cn(
                  'h-4 w-4 shrink-0 text-inherit opacity-85',
                  isActive && 'text-[var(--color-accent)] opacity-100',
                  tab.id === 'favorites' && isActive && 'fill-current',
                )}
              />
              <span className="min-w-0 flex-1 overflow-hidden text-left text-ellipsis whitespace-nowrap">
                {tab.label}
              </span>
              {count !== null && count > 0 && (
                <span
                  className={cn(
                    'min-w-0 rounded-[var(--radius-sm)] bg-transparent p-0 font-[family-name:var(--font-mono)] text-[10px] font-medium leading-none tracking-[0.02em] text-[var(--color-muted-foreground)]',
                    isActive && 'text-[var(--color-accent)]',
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          </IconTooltip>
        )
      })}
    </nav>
  )
}
