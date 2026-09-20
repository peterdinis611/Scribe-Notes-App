import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { FileWarning, Link2Off, LoaderCircle, Network, Unlink } from 'lucide-react'
import {
  getDocument,
  listWikiHealth,
  resolveWikiLink,
  type WikiHealth,
  type WikiHealthOrphan,
  type WikiHealthStub,
  type WikiHealthUnresolved,
} from '@/lib/db/api'
import { ROUTES } from '@/lib/routes'
import { toast } from '@/lib/toast'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  setActiveDocument,
  setActiveDocumentId,
  setFindReplaceOpen,
  setPendingEditorSearch,
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

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await listWikiHealth({ unresolvedLimit: 120, stubMaxWords: 40, stubLimit: 80 })
      setHealth(result)
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

          <HealthSection
            icon={Unlink}
            title={t('library.wikiHealth.orphans')}
            empty={t('library.wikiHealth.orphansEmpty')}
            items={orphans}
            renderItem={(item: WikiHealthOrphan) => (
              <button
                type="button"
                className="library-wiki-health__item"
                onClick={() => openDocument(item.id)}
              >
                <span className="library-wiki-health__text">{item.title || t('common.untitled')}</span>
              </button>
            )}
          />

          <HealthSection
            icon={Link2Off}
            title={t('library.wikiHealth.unresolved')}
            empty={t('library.wikiHealth.unresolvedEmpty')}
            items={unresolved}
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
                  {top ? (
                    <div className="library-wiki-health__suggest">
                      <span className="library-wiki-health__suggest-label">
                        {t('library.wikiHealth.didYouMean', { title: top.title })}
                      </span>
                      <button
                        type="button"
                        className="library-wiki-health__fix"
                        disabled={resolvingKey === resolveKey}
                        onClick={() => void handleResolve(item, top)}
                      >
                        {resolvingKey === resolveKey
                          ? t('common.loading')
                          : t('library.wikiHealth.fixWith', { title: top.title })}
                      </button>
                    </div>
                  ) : null}
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
}: {
  icon: typeof Unlink
  title: string
  empty: string
  items: T[]
  renderItem: (item: T, index: number) => React.ReactNode
}) {
  return (
    <section className="library-wiki-health__section">
      <h4 className="library-wiki-health__section-title">
        <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
        {title}
        <span className="library-wiki-health__badge">{items.length}</span>
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
