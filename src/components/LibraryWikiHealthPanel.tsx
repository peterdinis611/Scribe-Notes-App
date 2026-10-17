import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { Columns2, FileWarning, Link2Off, LoaderCircle, Network, Unlink } from 'lucide-react'
import {
  createDocument,
  getDocument,
  listGraphHubs,
  listWikiHealth,
  resolveWikiLink,
  updateDocument,
  type WikiHealth,
  type WikiHealthOrphan,
  type WikiHealthStub,
  type WikiHealthUnresolved,
} from '@/lib/db/api'
import { ROUTES } from '@/lib/routes'
import { kvGet, kvSet } from '@/lib/storage/kv'
import { toast } from '@/lib/toast'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  setActiveDocument,
  setActiveDocumentId,
  setFindReplaceOpen,
  setPendingEditorSearch,
  setSecondaryDocumentId,
} from '@/store/documentsSlice'

type LibraryWikiHealthPanelProps = {
  onNavigate?: () => void
}

export function LibraryWikiHealthPanel({ onNavigate }: LibraryWikiHealthPanelProps) {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const activeId = useAppSelector((state) => state.documents.activeDocumentId)
  const [health, setHealth] = useState<WikiHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [resolvingKey, setResolvingKey] = useState<string | null>(null)
  const [nlpThreshold, setNlpThreshold] = useState(() => {
    const raw = Number(kvGet('scribe-wiki-nlp-threshold'))
    return Number.isFinite(raw) ? Math.min(0.95, Math.max(0.4, raw)) : 0.72
  })
  const [hubs, setHubs] = useState<Array<{ id: string; title: string; backlinks: number; outgoing: number }>>(
    [],
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [result, nextHubs] = await Promise.all([
        listWikiHealth({ unresolvedLimit: 120, stubMaxWords: 40, stubLimit: 80 }),
        listGraphHubs(12).catch(() => []),
      ])
      setHealth(result)
      setHubs(nextHubs)
    } catch (error) {
      toast.error(t('library.wikiHealth.loadError'), String(error))
      setHealth(null)
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    void load()
  }, [load])

  function openDocument(documentId: string, search?: string) {
    if (!documentId) return
    dispatch(setActiveDocumentId(documentId))
    const needle = search?.trim().slice(0, 80)
    if (needle) {
      dispatch(setFindReplaceOpen(true))
      dispatch(setPendingEditorSearch(needle))
    }
    void navigate(ROUTES.document(documentId))
    onNavigate?.()
  }

  function openInSplit(documentId: string) {
    if (!documentId) return
    dispatch(setSecondaryDocumentId(documentId))
    onNavigate?.()
  }

  async function handleCreate(item: WikiHealthUnresolved) {
    const title = item.label.trim()
    if (!title) return
    const key = `create:${item.documentId}:${item.label}`
    setResolvingKey(key)
    try {
      const doc = await createDocument({ title })
      const result = await resolveWikiLink(item.documentId, item.label, doc.id)
      toast.success(
        t('library.wikiHealth.created', {
          title: result.targetTitle || doc.title || title,
          label: item.label,
        }),
      )
      if (activeId === item.documentId) {
        const refreshed = await getDocument(item.documentId)
        if (refreshed) dispatch(setActiveDocument(refreshed))
      }
      await load()
    } catch (error) {
      toast.error(t('library.wikiHealth.createError'), String(error))
    } finally {
      setResolvingKey(null)
    }
  }

  async function handleCreateAllUnresolved() {
    const items = health?.unresolved ?? []
    if (!items.length) return
    setResolvingKey('create:all')
    let created = 0
    const seen = new Set<string>()
    try {
      for (const item of items) {
        const title = item.label.trim()
        if (!title) continue
        const dedupe = `${item.documentId}::${title.toLowerCase()}`
        if (seen.has(dedupe)) continue
        seen.add(dedupe)
        const doc = await createDocument({ title })
        await resolveWikiLink(item.documentId, item.label, doc.id)
        created += 1
      }
      toast.success(t('library.wikiHealth.batchCreated', { count: created }))
      if (activeId) {
        try {
          const refreshed = await getDocument(activeId)
          if (refreshed) dispatch(setActiveDocument(refreshed))
        } catch {
          /* ignore */
        }
      }
      await load()
    } catch (error) {
      toast.error(t('library.wikiHealth.createError'), String(error))
    } finally {
      setResolvingKey(null)
    }
  }

  /** Enrich unresolved rows with NLP suggestions, then auto-resolve confident matches. */
  async function handleNlpSuggestBatch() {
    const items = health?.unresolved ?? []
    if (!items.length) return
    setResolvingKey('nlp:batch')
    try {
      const { nlpSuggestWikiLinks } = await import('@/lib/db/nlp-api')
      const byDoc = new Map<string, WikiHealthUnresolved[]>()
      for (const item of items) {
        const list = byDoc.get(item.documentId) ?? []
        list.push(item)
        byDoc.set(item.documentId, list)
      }
      let resolved = 0
      let enriched = 0
      const nextUnresolved = [...items]
      for (const [documentId, rows] of byDoc) {
        const suggestions = await nlpSuggestWikiLinks(documentId, 12).catch(() => [])
        for (const row of rows) {
          const fold = row.label.trim().toLowerCase()
          const match = suggestions.find(
            (suggestion) =>
              suggestion.documentId &&
              (suggestion.phrase?.trim().toLowerCase() === fold ||
                suggestion.title?.trim().toLowerCase() === fold),
          )
          if (!match?.documentId) continue
          enriched += 1
          const idx = nextUnresolved.findIndex(
            (item) => item.documentId === row.documentId && item.label === row.label,
          )
          if (idx >= 0) {
            nextUnresolved[idx] = {
              ...nextUnresolved[idx],
              suggestions: [
                { id: match.documentId, title: match.title, score: match.score ?? 0 },
                ...(nextUnresolved[idx].suggestions ?? []),
              ],
            }
          }
          if ((match.score ?? 0) >= nlpThreshold) {
            await resolveWikiLink(row.documentId, row.label, match.documentId)
            resolved += 1
          }
        }
      }
      setHealth((prev) => (prev ? { ...prev, unresolved: nextUnresolved } : prev))
      toast.success(
        t('library.wikiHealth.nlpBatchDone', { enriched, resolved }),
      )
      if (resolved > 0) await load()
    } catch (error) {
      toast.error(t('library.wikiHealth.nlpBatchError'), String(error))
    } finally {
      setResolvingKey(null)
    }
  }

  async function handleExpandStub(item: WikiHealthStub) {
    const key = `expand:${item.id}`
    setResolvingKey(key)
    try {
      const doc = await getDocument(item.id)
      const seed = t('library.wikiHealth.stubExpandSeed', { title: item.title || t('common.untitled') })
      let content: { type: string; content: unknown[] }
      try {
        content = JSON.parse(doc.contentJson) as { type: string; content: unknown[] }
        if (!content?.content) throw new Error('bad doc')
      } catch {
        content = { type: 'doc', content: [] }
      }
      content.content = [
        ...(content.content ?? []),
        {
          type: 'heading',
          attrs: { level: 2 },
          content: [{ type: 'text', text: t('library.wikiHealth.stubExpandHeading') }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: seed }],
        },
        {
          type: 'bulletList',
          content: [1, 2, 3].map((n) => ({
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: t('library.wikiHealth.stubExpandBullet', { n }) }],
              },
            ],
          })),
        },
      ]
      await updateDocument({ id: item.id, contentJson: JSON.stringify(content) })
      toast.success(t('library.wikiHealth.stubExpanded'))
      openDocument(item.id)
      await load()
    } catch (error) {
      toast.error(t('library.wikiHealth.stubExpandError'), String(error))
    } finally {
      setResolvingKey(null)
    }
  }

  async function handleResolve(
    item: WikiHealthUnresolved,
    suggestion: { id: string; title: string },
  ) {
    const key = `${item.documentId}:${item.label}:${suggestion.id}`
    setResolvingKey(key)
    try {
      const result = await resolveWikiLink(item.documentId, item.label, suggestion.id)
      toast.success(
        t('library.wikiHealth.resolved', {
          label: item.label,
          title: result.targetTitle || suggestion.title,
        }),
      )
      if (activeId === item.documentId) {
        try {
          const refreshed = await getDocument(item.documentId)
          dispatch(setActiveDocument(refreshed))
        } catch {
          // Panel refresh is enough if editor reload fails.
        }
      }
      await load()
    } catch (error) {
      toast.error(t('library.wikiHealth.resolveError'), String(error))
    } finally {
      setResolvingKey(null)
    }
  }

  const orphans = health?.orphans ?? []
  const unresolved = health?.unresolved ?? []
  const stubs = health?.stubs ?? []
  const total = orphans.length + unresolved.length + stubs.length

  return (
    <div className="library-wiki-health">
      <p className="library-wiki-health__kicker">
        <Network className="h-3.5 w-3.5" aria-hidden />
        {t('library.wikiHealth.title')}
      </p>
      <p className="library-wiki-health__hint">{t('library.wikiHealth.hint')}</p>

      {loading ? (
        <p className="library-wiki-health__status">
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
          {t('common.loading')}
        </p>
      ) : total === 0 ? (
        <p className="library-wiki-health__empty">{t('library.wikiHealth.empty')}</p>
      ) : (
        <>
          <p className="library-wiki-health__count">
            {t('library.wikiHealth.count', {
              orphans: orphans.length,
              unresolved: unresolved.length,
              stubs: stubs.length,
            })}
          </p>

          {hubs.length > 0 ? (
            <HealthSection
              icon={Network}
              title={t('library.wikiHealth.hubs')}
              empty={t('library.wikiHealth.hubsEmpty')}
              items={hubs}
              renderItem={(item) => (
                <div className="library-wiki-health__row">
                  <button
                    type="button"
                    className="library-wiki-health__item"
                    onClick={() => openDocument(item.id)}
                  >
                    <span className="min-w-0">
                      <span className="library-wiki-health__text">
                        {item.title || t('common.untitled')}
                      </span>
                      <span className="library-wiki-health__meta">
                        {t('library.wikiHealth.hubStats', {
                          backlinks: item.backlinks,
                          outgoing: item.outgoing,
                        })}
                      </span>
                    </span>
                  </button>
                </div>
              )}
            />
          ) : null}

          <HealthSection
            icon={Unlink}
            title={t('library.wikiHealth.orphans')}
            empty={t('library.wikiHealth.orphansEmpty')}
            items={orphans}
            renderItem={(item: WikiHealthOrphan) => (
              <div className="library-wiki-health__row">
                <button
                  type="button"
                  className="library-wiki-health__item"
                  onClick={() => openDocument(item.id)}
                >
                  <span className="library-wiki-health__text">{item.title || t('common.untitled')}</span>
                </button>
                <button
                  type="button"
                  className="library-wiki-health__resolve"
                  title={t('library.wikiHealth.openSplit')}
                  aria-label={t('library.wikiHealth.openSplit')}
                  onClick={() => openInSplit(item.id)}
                >
                  <Columns2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          />

          <HealthSection
            icon={Link2Off}
            title={t('library.wikiHealth.unresolved')}
            empty={t('library.wikiHealth.unresolvedEmpty')}
            items={unresolved}
            headerAction={
              unresolved.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <label className="library-wiki-health__threshold">
                    <span>{t('library.wikiHealth.nlpThreshold')}</span>
                    <input
                      type="number"
                      min={0.4}
                      max={0.95}
                      step={0.01}
                      value={nlpThreshold}
                      onChange={(event) => {
                        const next = Number(event.target.value)
                        const clamped = Number.isFinite(next)
                          ? Math.min(0.95, Math.max(0.4, next))
                          : 0.72
                        setNlpThreshold(clamped)
                        kvSet('scribe-wiki-nlp-threshold', String(clamped))
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="library-wiki-health__resolve"
                    disabled={resolvingKey === 'nlp:batch'}
                    onClick={() => void handleNlpSuggestBatch()}
                  >
                    {resolvingKey === 'nlp:batch'
                      ? t('common.loading')
                      : t('library.wikiHealth.nlpSuggestBatch')}
                  </button>
                  {unresolved.length > 1 ? (
                    <button
                      type="button"
                      className="library-wiki-health__resolve"
                      disabled={resolvingKey === 'create:all'}
                      onClick={() => void handleCreateAllUnresolved()}
                    >
                      {resolvingKey === 'create:all'
                        ? t('common.loading')
                        : t('library.wikiHealth.createAll', { count: unresolved.length })}
                    </button>
                  ) : null}
                </div>
              ) : null
            }
            renderItem={(item: WikiHealthUnresolved) => {
              const top = item.suggestions?.[0]
              const resolveKey = top
                ? `${item.documentId}:${item.label}:${top.id}`
                : null
              return (
                <div className="library-wiki-health__unresolved">
                  <button
                    type="button"
                    className="library-wiki-health__item"
                    onClick={() => openDocument(item.documentId, `[[${item.label}]]`)}
                  >
                    <span className="min-w-0">
                      <span className="library-wiki-health__text">[[{item.label}]]</span>
                      <span className="library-wiki-health__meta">
                        {item.documentTitle || t('common.untitled')}
                      </span>
                    </span>
                  </button>
                  <div className="library-wiki-health__suggest">
                    {top ? (
                      <>
                        <span className="library-wiki-health__suggest-label">
                          {t('library.wikiHealth.didYouMean', { title: top.title })}
                        </span>
                        <button
                          type="button"
                          className="library-wiki-health__resolve"
                          disabled={resolvingKey === resolveKey}
                          onClick={() => void handleResolve(item, top)}
                        >
                          {resolvingKey === resolveKey
                            ? t('common.loading')
                            : t('library.wikiHealth.fixWith', { title: top.title })}
                        </button>
                      </>
                    ) : null}
                    <button
                      type="button"
                      className="library-wiki-health__resolve"
                      disabled={resolvingKey === `create:${item.documentId}:${item.label}`}
                      onClick={() => void handleCreate(item)}
                    >
                      {resolvingKey === `create:${item.documentId}:${item.label}`
                        ? t('common.loading')
                        : t('library.wikiHealth.createNote', { title: item.label })}
                    </button>
                  </div>
                </div>
              )
            }}
          />

          <HealthSection
            icon={FileWarning}
            title={t('library.wikiHealth.stubs')}
            empty={t('library.wikiHealth.stubsEmpty')}
            items={stubs}
            renderItem={(item: WikiHealthStub) => (
              <div className="library-wiki-health__row">
                <button
                  type="button"
                  className="library-wiki-health__item"
                  onClick={() => openDocument(item.id)}
                >
                  <span className="min-w-0">
                    <span className="library-wiki-health__text">{item.title || t('common.untitled')}</span>
                    <span className="library-wiki-health__meta">
                      {t('library.wikiHealth.stubWords', { count: item.wordCount })}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  className="library-wiki-health__resolve"
                  disabled={resolvingKey === `expand:${item.id}`}
                  onClick={() => void handleExpandStub(item)}
                >
                  {resolvingKey === `expand:${item.id}`
                    ? t('common.loading')
                    : t('library.wikiHealth.expandStub')}
                </button>
                <button
                  type="button"
                  className="library-wiki-health__resolve"
                  title={t('library.wikiHealth.openSplit')}
                  aria-label={t('library.wikiHealth.openSplit')}
                  onClick={() => openInSplit(item.id)}
                >
                  <Columns2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          />
        </>
      )}
    </div>
  )
}

function HealthSection<T>({
  icon: Icon,
  title,
  empty,
  items,
  renderItem,
  headerAction,
}: {
  icon: typeof Unlink
  title: string
  empty: string
  items: T[]
  renderItem: (item: T, index: number) => React.ReactNode
  headerAction?: React.ReactNode
}) {
  return (
    <section className="library-wiki-health__section">
      <h4 className="library-wiki-health__section-title">
        <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
        {title}
        <span className="library-wiki-health__badge">{items.length}</span>
        {headerAction}
      </h4>
      {items.length === 0 ? (
        <p className="library-wiki-health__section-empty">{empty}</p>
      ) : (
        <ul className="library-wiki-health__list">
          {items.slice(0, 60).map((item, index) => (
            <li key={index}>{renderItem(item, index)}</li>
          ))}
        </ul>
      )}
    </section>
  )
}
