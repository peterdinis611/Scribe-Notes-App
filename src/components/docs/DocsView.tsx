import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { Search, X } from 'lucide-react'
import { APP_SHORT_VERSION } from '@/lib/app-version'
import {
  DOCS_GROUPS,
  DOCS_QUICK_LINKS,
  DOCS_TOPIC_IDS,
  DOCS_TOPIC_TIPS,
  type DocsTopicId,
} from './docs-groups'

export { DOCS_TOPIC_IDS, type DocsTopicId }

type DocsTopic = {
  id: DocsTopicId
  title: string
  summary: string
  paragraphs: string[]
  points: string[]
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function topicMatches(topic: DocsTopic, query: string): boolean {
  if (!query) return true
  const haystack = [topic.title, topic.summary, ...topic.paragraphs, ...topic.points]
    .join('\n')
    .toLowerCase()
  return haystack.includes(query)
}

function scrollToTopic(id: DocsTopicId) {
  const el = document.getElementById(`docs-${id}`)
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/** In-app Docs — grove editorial field guide. */
export function DocsView() {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [activeId, setActiveId] = useState<DocsTopicId>('overview')
  const deferredQuery = useDeferredValue(query.trim().toLowerCase())
  const searchRef = useRef<HTMLInputElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)

  const topics = useMemo<DocsTopic[]>(
    () =>
      DOCS_TOPIC_IDS.map((id) => ({
        id,
        title: t(`settings.docs.topics.${id}.title`, { version: APP_SHORT_VERSION }),
        summary: t(`settings.docs.topics.${id}.summary`, { version: APP_SHORT_VERSION }),
        paragraphs: asStringList(
          t(`settings.docs.topics.${id}.paragraphs`, {
            returnObjects: true,
            version: APP_SHORT_VERSION,
          }),
        ),
        points: asStringList(
          t(`settings.docs.topics.${id}.points`, {
            returnObjects: true,
            version: APP_SHORT_VERSION,
          }),
        ),
      })),
    [t],
  )

  const topicById = useMemo(() => {
    const map = new Map<DocsTopicId, DocsTopic>()
    for (const topic of topics) map.set(topic.id, topic)
    return map
  }, [topics])

  const visibleGroups = useMemo(() => {
    return DOCS_GROUPS.map((group) => {
      const groupTopics = group.topics
        .map((id) => topicById.get(id))
        .filter((topic): topic is DocsTopic => !!topic && topicMatches(topic, deferredQuery))
      return { ...group, topics: groupTopics }
    }).filter((group) => group.topics.length > 0)
  }, [deferredQuery, topicById])

  const matchCount = useMemo(
    () => visibleGroups.reduce((sum, group) => sum + group.topics.length, 0),
    [visibleGroups],
  )

  const clearSearch = useCallback(() => {
    setQuery('')
    searchRef.current?.focus()
  }, [])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape' && query) {
        event.preventDefault()
        clearSearch()
        return
      }
      if (
        event.key === '/' &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'TEXTAREA'
      ) {
        event.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [clearSearch, query])

  useEffect(() => {
    const root = pageRef.current
    if (!root || deferredQuery) return

    const articles = root.querySelectorAll<HTMLElement>('.docs-shell-topic[id]')
    if (articles.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        const top = visible[0]
        if (!top?.target.id.startsWith('docs-')) return
        const id = top.target.id.slice('docs-'.length) as DocsTopicId
        if (DOCS_TOPIC_IDS.includes(id)) setActiveId(id)
      },
      {
        root,
        rootMargin: '-12% 0px -62% 0px',
        threshold: [0.15, 0.4, 0.7],
      },
    )

    for (const article of articles) observer.observe(article)
    return () => observer.disconnect()
  }, [deferredQuery, visibleGroups])

  const searchPlaceholder = t('settings.docs.searchPlaceholder')
  let revealIndex = 0

  return (
    <div className="docs-page" ref={pageRef}>
      <div className="docs-layout">
        <aside className="docs-toc" aria-label={t('settings.docs.onThisPage')}>
          <p className="docs-toc-heading">{t('settings.docs.onThisPage')}</p>
          <nav className="docs-toc-nav">
            {DOCS_GROUPS.map((group) => (
              <div key={group.id} className="docs-toc-group">
                <p className="docs-toc-group-label">{t(`settings.docs.groups.${group.id}`)}</p>
                {group.topics.map((id) => {
                  const topic = topicById.get(id)
                  if (!topic) return null
                  const hidden = deferredQuery && !topicMatches(topic, deferredQuery)
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`docs-toc-item${activeId === id ? ' is-active' : ''}${hidden ? ' is-dimmed' : ''}`}
                      onClick={() => {
                        if (query) setQuery('')
                        setActiveId(id)
                        window.setTimeout(() => scrollToTopic(id), query ? 40 : 0)
                      }}
                    >
                      {topic.title}
                    </button>
                  )
                })}
              </div>
            ))}
          </nav>
        </aside>

        <div className="docs-shell">
          <header className="docs-shell-head">
            <div className="docs-shell-hero-mark" aria-hidden="true" />
            <p className="docs-shell-kicker">
              {t('welcome.brandWithEdition', { version: APP_SHORT_VERSION })}
            </p>
            <h1 className="docs-shell-title">
              {t('settings.docs.pageTitle', { version: APP_SHORT_VERSION })}
            </h1>
            <p className="docs-shell-lead">
              {t('settings.docs.pageDescription', { version: APP_SHORT_VERSION })}
            </p>

            <div className="docs-shell-search-wrap">
              <Search className="docs-shell-search-icon" aria-hidden="true" size={16} strokeWidth={2} />
              <input
                ref={searchRef}
                className="docs-shell-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={searchPlaceholder}
                autoComplete="off"
                spellCheck={false}
                aria-label={searchPlaceholder}
              />
              {query ? (
                <button
                  type="button"
                  className="docs-shell-search-clear"
                  onClick={clearSearch}
                  aria-label={t('settings.docs.clearSearch')}
                >
                  <X size={14} strokeWidth={2.2} />
                </button>
              ) : (
                <kbd className="docs-shell-search-kbd">/</kbd>
              )}
            </div>

            {!deferredQuery ? (
              <div className="docs-quick">
                <p className="docs-quick-label">{t('settings.docs.quickStart')}</p>
                <div className="docs-quick-row">
                  {DOCS_QUICK_LINKS.map((id) => {
                    const topic = topicById.get(id)
                    if (!topic) return null
                    return (
                      <button
                        key={id}
                        type="button"
                        className="docs-quick-chip"
                        onClick={() => {
                          setActiveId(id)
                          scrollToTopic(id)
                        }}
                      >
                        {topic.title}
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : (
              <p className="docs-shell-match-count" role="status">
                {matchCount === 0
                  ? t('settings.docs.noResults')
                  : t('settings.docs.matchCount', {
                      count: matchCount,
                      defaultValue_one: '{{count}} topic matches',
                      defaultValue_other: '{{count}} topics match',
                    })}
              </p>
            )}
          </header>

          {visibleGroups.length === 0 ? (
            <div className="docs-shell-empty" role="status">
              <p>{t('settings.docs.noResults')}</p>
              <span>{t('settings.docs.noResultsHint')}</span>
              <button type="button" className="docs-shell-empty-clear" onClick={clearSearch}>
                {t('settings.docs.clearSearch')}
              </button>
            </div>
          ) : (
            <div className="docs-shell-groups">
              {visibleGroups.map((group) => (
                <section
                  key={group.id}
                  className="docs-shell-group"
                  aria-labelledby={`docs-group-${group.id}`}
                >
                  <h2 id={`docs-group-${group.id}`} className="docs-shell-group-label">
                    {t(`settings.docs.groups.${group.id}`)}
                  </h2>
                  {group.topics.map((topic) => {
                    const delay = Math.min(revealIndex, 14) * 40
                    revealIndex += 1
                    const tip = DOCS_TOPIC_TIPS[topic.id]
                    return (
                      <article
                        key={topic.id}
                        id={`docs-${topic.id}`}
                        className={`docs-shell-topic${activeId === topic.id && !deferredQuery ? ' is-active' : ''}`}
                        style={{ animationDelay: `${delay}ms` }}
                      >
                        <h3 className="docs-shell-topic-title">{topic.title}</h3>
                        {topic.summary ? (
                          <p className="docs-shell-topic-summary">{topic.summary}</p>
                        ) : null}
                        {topic.paragraphs.map((paragraph, index) => (
                          <p key={`${topic.id}-p-${index}`} className="docs-shell-topic-body">
                            {paragraph}
                          </p>
                        ))}
                        {topic.points.length > 0 ? (
                          <ul className="docs-shell-topic-points">
                            {topic.points.map((point, index) => (
                              <li key={`${topic.id}-pt-${index}`}>{point}</li>
                            ))}
                          </ul>
                        ) : null}
                        {tip ? (
                          <p className="docs-shell-tip">
                            <span className="docs-shell-tip-label">{t('settings.docs.tipLabel')}</span>
                            {tip.shortcut ? <kbd>{tip.shortcut}</kbd> : null}{' '}
                            {t(`settings.docs.${tip.tipKey}`)}
                          </p>
                        ) : null}
                      </article>
                    )
                  })}
                </section>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
