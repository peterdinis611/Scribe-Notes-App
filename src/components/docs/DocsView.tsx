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
  X,
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

const DOC_GROUPS: { id: string; topics: DocsTopicId[] }[] = [
  { id: 'basics', topics: ['overview', 'documents'] },
  { id: 'organize', topics: ['library', 'linkGraph', 'wikiLinks'] },
  { id: 'write', topics: ['editor', 'search', 'journal'] },
  { id: 'power', topics: ['ai', 'backup', 'shortcuts'] },
]

const QUICK_LINKS: DocsTopicId[] = ['library', 'wikiLinks', 'search', 'ai']

const TOPIC_TIPS: Partial<Record<DocsTopicId, { keys: string; tipKey: string }>> = {
  search: { keys: '⌘K', tipKey: 'searchTip' },
  journal: { keys: '⌘⇧D', tipKey: 'journalTip' },
  shortcuts: { keys: '⌘,', tipKey: 'shortcutsTip' },
}

function useActiveTopic(ids: DocsTopicId[], root: HTMLElement | null, enabled: boolean) {
  const [activeId, setActiveId] = useState<DocsTopicId | null>(ids[0] ?? null)

  useEffect(() => {
    if (!enabled || ids.length === 0 || !root) {
      setActiveId(ids[0] ?? null)
      return
    }

    const elements = ids
      .map((id) => root.querySelector(`#docs-${id}`))
      .filter((el): el is HTMLElement => el instanceof HTMLElement)

    if (elements.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
        const top = visible[0]
        if (top?.target.id.startsWith('docs-')) {
          setActiveId(top.target.id.replace('docs-', '') as DocsTopicId)
        }
      },
      { root, rootMargin: '-12% 0px -62% 0px', threshold: [0, 0.2, 0.5] },
    )

    for (const el of elements) observer.observe(el)
    setActiveId(ids[0] ?? null)
    return () => observer.disconnect()
  }, [enabled, ids, root])

  return activeId
}

function TopicBody({ topicId }: { topicId: DocsTopicId }) {
  const { t, i18n } = useTranslation()
  const base = `settings.docs.topics.${topicId}`
  const paragraphs = t(`${base}.paragraphs`, { returnObjects: true })
  const points = t(`${base}.points`, { returnObjects: true })
  const paragraphList = Array.isArray(paragraphs) ? (paragraphs as string[]) : []
  const pointList = Array.isArray(points) ? (points as string[]) : []
  const tip = TOPIC_TIPS[topicId]

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
    <div className="space-y-3.5">
      {paragraphList.map((text) => (
        <p key={text} className="m-0 text-[13.5px] leading-[1.65] text-[var(--color-muted-foreground)]">
          {text}
        </p>
      ))}
      {pointList.length > 0 && (
        <ul className="docs-point-list m-0 list-none space-y-2.5 p-0">
          {pointList.map((point) => (
            <li key={point} className="docs-point-item">
              <span className="docs-point-dot" aria-hidden="true" />
              <span className="text-[13.5px] leading-[1.55] text-[var(--color-muted-foreground)]">
                {point}
              </span>
            </li>
          ))}
        </ul>
      )}
      {tip && (
        <div className="docs-tip">
          <span className="docs-tip-label">{t('settings.docs.tipLabel')}</span>
          <SettingsKbd>{tip.keys}</SettingsKbd>
          <span>{t(`settings.docs.${tip.tipKey}`)}</span>
        </div>
      )}
    </div>
  )
}

export function DocsView() {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null)

  useEffect(() => {
    setScrollEl(scrollRef.current)
  }, [])

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

  const filteredSet = useMemo(() => new Set(filteredIds), [filteredIds])
  const activeId = useActiveTopic(filteredIds, scrollEl, query.trim().length === 0)

  function scrollToTopic(id: DocsTopicId) {
    const el = scrollRef.current?.querySelector(`#docs-${id}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="docs-page flex min-h-0 flex-1 flex-col overflow-hidden">
      <div ref={scrollRef} className="docs-scroll min-h-0 flex-1 overflow-y-auto">
        <div className="docs-shell mx-auto w-full max-w-[1040px] px-5 py-7 sm:px-8 lg:px-10 lg:py-9">
          <header className="docs-hero">
            <div className="docs-hero-copy">
              <p className="docs-hero-eyebrow">{t('nav.docs')}</p>
              <h1 className="docs-hero-title">{t('settings.docs.pageTitle')}</h1>
              <p className="docs-hero-desc">{t('settings.docs.pageDescription')}</p>
            </div>

            <div className="docs-search-wrap">
              <Search className="docs-search-icon" aria-hidden="true" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('settings.docs.searchPlaceholder')}
                className="docs-search-input h-10 border-[var(--color-border)] bg-[var(--color-surface)] pl-9 pr-9 text-[13px]"
                aria-label={t('settings.docs.searchPlaceholder')}
              />
              {query && (
                <button
                  type="button"
                  className="docs-search-clear"
                  onClick={() => setQuery('')}
                  aria-label={t('common.close')}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {!query && (
              <div className="docs-quick">
                <p className="docs-quick-label">{t('settings.docs.quickStart')}</p>
                <div className="docs-quick-row">
                  {QUICK_LINKS.map((id) => {
                    const Icon = TOPIC_ICONS[id]
                    return (
                      <button
                        key={id}
                        type="button"
                        className="docs-quick-chip"
                        onClick={() => scrollToTopic(id)}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0 opacity-80" />
                        <span>{t(`settings.docs.topics.${id}.title`)}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </header>

          <div className="docs-layout">
            <aside className="docs-toc" aria-label={t('settings.docs.onThisPage')}>
              <p className="docs-toc-heading">{t('settings.docs.onThisPage')}</p>
              <nav className="docs-toc-nav">
                {DOC_GROUPS.map((group) => {
                  const topics = group.topics.filter((id) => filteredSet.has(id))
                  if (topics.length === 0) return null
                  return (
                    <div key={group.id} className="docs-toc-group">
                      <p className="docs-toc-group-label">
                        {t(`settings.docs.groups.${group.id}`)}
                      </p>
                      {topics.map((id) => {
                        const Icon = TOPIC_ICONS[id]
                        const isActive = activeId === id && !query.trim()
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => scrollToTopic(id)}
                            className={cn('docs-toc-item', isActive && 'is-active')}
                          >
                            <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" />
                            <span className="truncate">{t(`settings.docs.topics.${id}.title`)}</span>
                          </button>
                        )
                      })}
                    </div>
                  )
                })}
              </nav>
            </aside>

            <div className="docs-content min-w-0">
              {filteredIds.length === 0 ? (
                <div className="docs-empty">
                  <Search className="mx-auto mb-3 h-5 w-5 text-[var(--color-muted-foreground)]" />
                  <p className="m-0 text-[14px] font-medium text-[var(--color-foreground)]">
                    {t('settings.docs.noResults')}
                  </p>
                  <p className="mt-1 text-[12.5px] text-[var(--color-muted-foreground)]">
                    {t('settings.docs.noResultsHint')}
                  </p>
                  <button type="button" className="docs-empty-clear" onClick={() => setQuery('')}>
                    {t('settings.docs.clearSearch')}
                  </button>
                </div>
              ) : (
                <div className="docs-topics">
                  {DOC_GROUPS.map((group) => {
                    const topics = group.topics.filter((id) => filteredSet.has(id))
                    if (topics.length === 0) return null
                    return (
                      <section key={group.id} className="docs-section">
                        <h2 className="docs-section-title">
                          {t(`settings.docs.groups.${group.id}`)}
                        </h2>
                        <div className="docs-section-stack">
                          {topics.map((id, index) => {
                            const Icon = TOPIC_ICONS[id]
                            return (
                              <article
                                key={id}
                                id={`docs-${id}`}
                                className="docs-topic"
                                style={{ animationDelay: `${Math.min(index, 6) * 40}ms` }}
                              >
                                <div className="docs-topic-head">
                                  <div className="docs-topic-icon">
                                    <Icon className="h-4 w-4" />
                                  </div>
                                  <div className="min-w-0">
                                    <h3 className="docs-topic-title">
                                      {t(`settings.docs.topics.${id}.title`)}
                                    </h3>
                                    <p className="docs-topic-summary">
                                      {t(`settings.docs.topics.${id}.summary`)}
                                    </p>
                                  </div>
                                </div>
                                <TopicBody topicId={id} />
                              </article>
                            )
                          })}
                        </div>
                      </section>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
