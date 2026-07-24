import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Archive,
  BookOpen,
  CalendarDays,
  FileText,
  FolderTree,
  GitFork,
  Keyboard,
  Link2,
  PenLine,
  Search,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { SettingsKbd } from '@/components/settings/SettingsPrimitives'
import { cn } from '@/lib/utils'

export const DOCS_TOPIC_IDS = [
  'overview',
  'documents',
  'library',
  'linkGraph',
  'wikiLinks',
  'editor',
  'search',
  'journal',
  'ai',
  'backup',
  'shortcuts',
] as const

export type DocsTopicId = (typeof DOCS_TOPIC_IDS)[number]

const TOPIC_ICONS: Record<DocsTopicId, LucideIcon> = {
  overview: BookOpen,
  documents: FileText,
  library: FolderTree,
  linkGraph: GitFork,
  wikiLinks: Link2,
  editor: PenLine,
  search: Search,
  journal: CalendarDays,
  ai: Sparkles,
  backup: Archive,
  shortcuts: Keyboard,
}

function useActiveTopic(ids: DocsTopicId[], enabled: boolean) {
  const [activeId, setActiveId] = useState<DocsTopicId | null>(ids[0] ?? null)

  useEffect(() => {
    if (!enabled || ids.length === 0) {
      setActiveId(null)
      return
    }

    const elements = ids
      .map((id) => document.getElementById(`docs-${id}`))
      .filter((el): el is HTMLElement => el != null)

    if (elements.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        const top = visible[0]
        if (top?.target.id.startsWith('docs-')) {
          setActiveId(top.target.id.replace('docs-', '') as DocsTopicId)
        }
      },
      { rootMargin: '-20% 0px -55% 0px', threshold: [0, 0.25, 0.5, 1] },
    )

    for (const el of elements) observer.observe(el)
    setActiveId(ids[0] ?? null)

    return () => observer.disconnect()
  }, [enabled, ids])

  return activeId
}

function TopicBody({ topicId }: { topicId: DocsTopicId }) {
  const { t, i18n } = useTranslation()
  const base = `settings.docs.topics.${topicId}`

  const paragraphs = t(`${base}.paragraphs`, { returnObjects: true })
  const points = t(`${base}.points`, { returnObjects: true })

  const paragraphList = Array.isArray(paragraphs) ? (paragraphs as string[]) : []
  const pointList = Array.isArray(points) ? (points as string[]) : []

  // Fallback if older flat body string is still present
  if (paragraphList.length === 0 && pointList.length === 0) {
    const body = i18n.exists(`${base}.body`) ? t(`${base}.body`) : ''
    if (!body) return null
    return (
      <p className="m-0 whitespace-pre-line text-[13.5px] leading-[1.65] text-[var(--color-muted-foreground)]">
        {body}
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {paragraphList.map((text) => (
        <p
          key={text}
          className="m-0 text-[13.5px] leading-[1.65] text-[var(--color-muted-foreground)]"
        >
          {text}
        </p>
      ))}
      {pointList.length > 0 && (
        <ul className="m-0 list-none space-y-2 p-0">
          {pointList.map((point) => (
            <li
              key={point}
              className="flex gap-2.5 text-[13.5px] leading-[1.55] text-[var(--color-muted-foreground)]"
            >
              <span
                className="mt-[8px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-accent)]"
                aria-hidden="true"
              />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      )}
      {topicId === 'search' && (
        <p className="m-0 flex flex-wrap items-center gap-2 text-[12.5px] text-[var(--color-muted-foreground)]">
          <span>{t('settings.docs.tipLabel')}</span>
          <SettingsKbd>⌘K</SettingsKbd>
          <span>{t('settings.docs.searchTip')}</span>
        </p>
      )}
      {topicId === 'journal' && (
        <p className="m-0 flex flex-wrap items-center gap-2 text-[12.5px] text-[var(--color-muted-foreground)]">
          <span>{t('settings.docs.tipLabel')}</span>
          <SettingsKbd>⌘⇧D</SettingsKbd>
          <span>{t('settings.docs.journalTip')}</span>
        </p>
      )}
    </div>
  )
}

export function DocsView() {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const filteredIds = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return [...DOCS_TOPIC_IDS]

    return DOCS_TOPIC_IDS.filter((id) => {
      const title = t(`settings.docs.topics.${id}.title`).toLowerCase()
      const summary = t(`settings.docs.topics.${id}.summary`).toLowerCase()
      const paragraphs = t(`settings.docs.topics.${id}.paragraphs`, { returnObjects: true })
      const points = t(`settings.docs.topics.${id}.points`, { returnObjects: true })
      const blob = [
        title,
        summary,
        ...(Array.isArray(paragraphs) ? paragraphs : []),
        ...(Array.isArray(points) ? points : []),
      ]
        .join(' ')
        .toLowerCase()
      return blob.includes(q)
    })
  }, [query, t])

  const activeId = useActiveTopic(filteredIds, query.trim().length === 0)

  function scrollToTopic(id: DocsTopicId) {
    const el = document.getElementById(`docs-${id}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="docs-page flex min-h-0 flex-1 flex-col overflow-hidden">
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <div className="mx-auto flex w-full max-w-[980px] flex-col gap-8 px-6 py-8 sm:px-8 lg:flex-row lg:items-start lg:gap-10 lg:px-10 lg:py-10">
          <aside className="docs-toc lg:sticky lg:top-0 lg:w-[200px] lg:shrink-0 lg:pt-1">
            <div className="mb-5 space-y-3 lg:mb-6">
              <div className="flex items-center gap-2.5">
                <div className="inline-flex h-9 w-9 items-center justify-center rounded-[11px] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-accent)]">
                  <BookOpen className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h1 className="m-0 text-[18px] font-bold tracking-[-0.03em] text-[var(--color-foreground)]">
                    {t('settings.docs.pageTitle')}
                  </h1>
                </div>
              </div>
              <p className="m-0 text-[12.5px] leading-relaxed text-[var(--color-muted-foreground)] lg:hidden">
                {t('settings.docs.pageDescription')}
              </p>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-muted-foreground)]" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t('settings.docs.searchPlaceholder')}
                  className="h-8 pl-8 text-[12.5px]"
                  aria-label={t('settings.docs.searchPlaceholder')}
                />
              </div>
            </div>

            <p className="mb-2 hidden text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-muted-foreground)] lg:block">
              {t('settings.docs.onThisPage')}
            </p>

            <nav
              aria-label={t('settings.docs.onThisPage')}
              className="docs-toc-nav -mx-1 flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-col lg:overflow-visible lg:pb-0 [&::-webkit-scrollbar]:hidden"
            >
              {filteredIds.map((id) => {
                const Icon = TOPIC_ICONS[id]
                const isActive = activeId === id && query.trim().length === 0
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => scrollToTopic(id)}
                    className={cn(
                      'inline-flex shrink-0 items-center gap-2 rounded-[var(--radius-md)] px-2.5 py-1.5 text-left text-[12.5px] transition-colors',
                      'hover:bg-[var(--color-hover)]',
                      isActive
                        ? 'bg-[var(--color-selection)] font-medium text-[var(--color-accent)]'
                        : 'text-[var(--color-muted-foreground)]',
                    )}
                  >
                    <Icon className="hidden h-3.5 w-3.5 shrink-0 opacity-70 lg:block" />
                    <span className="truncate">{t(`settings.docs.topics.${id}.title`)}</span>
                  </button>
                )
              })}
            </nav>
          </aside>

          <div className="min-w-0 flex-1">
            <header className="mb-7 hidden space-y-2 lg:block">
              <p className="m-0 max-w-[52ch] text-[14px] leading-relaxed text-[var(--color-muted-foreground)]">
                {t('settings.docs.pageDescription')}
              </p>
            </header>

            {filteredIds.length === 0 ? (
              <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-12 text-center">
                <Search className="mx-auto mb-3 h-5 w-5 text-[var(--color-muted-foreground)]" />
                <p className="m-0 text-[14px] font-medium text-[var(--color-foreground)]">
                  {t('settings.docs.noResults')}
                </p>
                <p className="mt-1 text-[12.5px] text-[var(--color-muted-foreground)]">
                  {t('settings.docs.noResultsHint')}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredIds.map((id, index) => {
                  const Icon = TOPIC_ICONS[id]
                  return (
                    <article
                      key={id}
                      id={`docs-${id}`}
                      className="docs-topic scroll-mt-6 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-4 sm:px-6 sm:py-5"
                      style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
                    >
                      <div className="mb-3 flex items-start gap-3">
                        <div className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border border-[var(--color-border)] bg-[var(--color-surface-elevated)] text-[var(--color-accent)]">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 pt-0.5">
                          <h2 className="m-0 text-[15px] font-semibold tracking-[-0.02em] text-[var(--color-foreground)]">
                            {t(`settings.docs.topics.${id}.title`)}
                          </h2>
                          <p className="mt-0.5 text-[12px] leading-snug text-[var(--color-muted-foreground)]">
                            {t(`settings.docs.topics.${id}.summary`)}
                          </p>
                        </div>
                      </div>
                      <TopicBody topicId={id} />
                    </article>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
