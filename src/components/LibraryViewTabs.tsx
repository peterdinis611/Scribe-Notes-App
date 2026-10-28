import {
  Bot,
  CalendarDays,
  CheckSquare,
  Copy,
  Database,
  FolderTree,
  GitBranch,
  HardDrive,
  History,
  MessageSquare,
  MoreHorizontal,
  Network,
  Star,
  Tag as TagIcon,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { IconTooltip } from '@/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/** Keep in sync with `scribe_ui::LIBRARY_VIEW_IDS` / UiManifest.libraryViewIds. */
export const LIBRARY_VIEW_IDS = [
  'folders',
  'recent',
  'favorites',
  'tags',
  'graph',
  'journal',
  'chat',
  'agent',
  'duplicates',
  'tasks',
  'database',
  'wikiHealth',
  'storage',
] as const

export type LibraryView = (typeof LIBRARY_VIEW_IDS)[number]

const PRIMARY_VIEWS: LibraryView[] = ['folders', 'recent', 'favorites', 'journal']

type TabDef = { id: LibraryView; label: string; icon: typeof FolderTree }

type LibraryViewTabsProps = {
  value: LibraryView
  agentOpen?: boolean
  storageModeEnabled?: boolean
  favoriteCount: number
  tagCount: number
  recentCount?: number
  taskCount?: number
  wikiHealthCount?: number
  onChange: (view: LibraryView) => void
  /** Extra controls rendered after the view icons (filter, create). */
  trailing?: ReactNode
}

export function LibraryViewTabs({
  value,
  agentOpen = false,
  storageModeEnabled = false,
  favoriteCount,
  tagCount,
  recentCount = 0,
  taskCount = 0,
  wikiHealthCount = 0,
  onChange,
  trailing,
}: LibraryViewTabsProps) {
  const { t } = useTranslation()

  const tabs: TabDef[] = [
    { id: 'folders', label: t('library.tabs.folders'), icon: FolderTree },
    { id: 'recent', label: t('library.tabs.recent'), icon: History },
    { id: 'favorites', label: t('library.tabs.favorites'), icon: Star },
    { id: 'journal', label: t('library.tabs.journal'), icon: CalendarDays },
    { id: 'tags', label: t('library.tabs.tags'), icon: TagIcon },
    { id: 'graph', label: t('library.tabs.graph'), icon: GitBranch },
    ...(storageModeEnabled
      ? [{ id: 'storage' as const, label: t('library.tabs.storage'), icon: HardDrive }]
      : []),
    { id: 'duplicates', label: t('library.tabs.duplicates'), icon: Copy },
    { id: 'tasks', label: t('library.tabs.tasks'), icon: CheckSquare },
    { id: 'database', label: t('library.tabs.database'), icon: Database },
    { id: 'wikiHealth', label: t('library.tabs.wikiHealth'), icon: Network },
    { id: 'chat', label: t('library.tabs.chat'), icon: MessageSquare },
    { id: 'agent', label: t('library.tabs.agent'), icon: Bot },
  ]

  const primary = tabs.filter((tab) => PRIMARY_VIEWS.includes(tab.id))
  const secondary = tabs.filter((tab) => !PRIMARY_VIEWS.includes(tab.id))
  const activeSecondary = secondary.find((tab) =>
    tab.id === 'agent' ? agentOpen : value === tab.id,
  )
  const ActiveSecondaryIcon = activeSecondary?.icon

  function countFor(view: LibraryView) {
    if (view === 'favorites') return favoriteCount
    if (view === 'tags') return tagCount
    if (view === 'recent') return recentCount
    if (view === 'tasks') return taskCount
    if (view === 'wikiHealth') return wikiHealthCount
    return null
  }

  function isActive(id: LibraryView) {
    return id === 'agent' ? agentOpen : value === id
  }

  return (
    <nav className="library-view-strip titlebar-no-drag" aria-label={t('library.tabs.ariaLabel')}>
      <div className="library-view-strip-primary" role="tablist">
        {primary.map((tab) => {
          const count = countFor(tab.id)
          const Icon = tab.icon
          const active = isActive(tab.id)
          const tip = count && count > 0 ? `${tab.label} (${count})` : tab.label
          return (
            <IconTooltip key={tab.id} label={tip}>
              <button
                type="button"
                role="tab"
                aria-selected={active}
                className={cn('library-view-icon', active && 'is-active')}
                onClick={() => onChange(tab.id)}
                aria-label={tip}
              >
                <Icon className={cn('h-4 w-4', tab.id === 'favorites' && active && 'fill-current')} />
                {count !== null && count > 0 && <span className="library-view-dot" aria-hidden />}
              </button>
            </IconTooltip>
          )
        })}

        <DropdownMenu>
          <IconTooltip label={activeSecondary?.label ?? t('library.tabs.more')}>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={cn('library-view-icon', activeSecondary && 'is-active')}
                aria-label={activeSecondary?.label ?? t('library.tabs.more')}
              >
                {ActiveSecondaryIcon ? (
                  <ActiveSecondaryIcon className="h-4 w-4" />
                ) : (
                  <MoreHorizontal className="h-4 w-4" />
                )}
              </button>
            </DropdownMenuTrigger>
          </IconTooltip>
          <DropdownMenuContent align="start" className="min-w-[12rem]">
            {secondary.map((tab) => {
              const count = countFor(tab.id)
              const Icon = tab.icon
              const active = isActive(tab.id)
              const showSep = tab.id === 'chat'
              return (
                <div key={tab.id}>
                  {showSep && <DropdownMenuSeparator />}
                  <DropdownMenuItem
                    className={cn(active && 'bg-[var(--color-hover)] text-[var(--color-foreground)]')}
                    data-tour={
                      tab.id === 'chat'
                        ? 'library-chat'
                        : tab.id === 'agent'
                          ? 'library-agent'
                          : undefined
                    }
                    onSelect={() => onChange(tab.id)}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="flex-1">{tab.label}</span>
                    {count !== null && count > 0 && (
                      <span className="font-[family-name:var(--font-mono)] text-[10px] text-[var(--color-muted-foreground)]">
                        {count}
                      </span>
                    )}
                  </DropdownMenuItem>
                </div>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {trailing ? <div className="library-view-strip-trailing">{trailing}</div> : null}
    </nav>
  )
}
