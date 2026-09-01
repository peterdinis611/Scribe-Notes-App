import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { Clock, FileText, Plus, Settings2, Tag as TagIcon } from 'lucide-react'
import { TagManageDialog } from '@/components/library/TagManageDialog'
import { colorForTag } from '@/lib/library/tag-colors'
import { peekCachedDocument } from '@/lib/cache/document-cache'
import { promptInput } from '@/lib/input-dialog'
import {
  collectMetaOptions,
  groupTags,
  makeMetaTag,
  type TagKind,
} from '@/lib/library/tag-meta'
import { ROUTES } from '@/lib/routes'
import { cn, formatRelativeTime } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  setActiveDocument,
  setActiveDocumentId,
  setActiveTagFilter,
  setMetaFilters,
} from '@/store/documentsSlice'
import { Button } from '@/components/ui/button'

type LibraryTagsViewProps = {
  onNavigate?: () => void
}

export function LibraryTagsView({ onNavigate }: LibraryTagsViewProps) {
  const { t } = useTranslation()
  const documents = useAppSelector((state) => state.documents.documents)
  const activeId = useAppSelector((state) => state.documents.activeDocumentId)
  const activeTagFilter = useAppSelector((state) => state.documents.activeTagFilter)
  const metaFilters = useAppSelector((state) => state.documents.metaFilters)
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const [manageOpen, setManageOpen] = useState(false)

  const allTags = useMemo(() => {
    const tags: string[] = []
    for (const doc of documents) {
      tags.push(...doc.tags)
    }
    return tags
  }, [documents])

  const groups = useMemo(() => groupTags([...new Set(allTags)]), [allTags])
  const options = useMemo(() => collectMetaOptions(allTags), [allTags])

  const taggedDocuments = useMemo(() => {
    return documents
      .filter((doc) => {
        if (doc.deletedAt != null) return false
        if (activeTagFilter && !doc.tags.includes(activeTagFilter)) return false
        if (metaFilters.status) {
          const needle = makeMetaTag('status', metaFilters.status)
          if (!doc.tags.some((tag) => tag.toLowerCase() === needle.toLowerCase())) return false
        }
        if (metaFilters.project) {
          const needle = makeMetaTag('project', metaFilters.project)
          if (!doc.tags.some((tag) => tag.toLowerCase() === needle.toLowerCase())) return false
        }
        if (metaFilters.year) {
          const needle = makeMetaTag('year', metaFilters.year)
          if (!doc.tags.some((tag) => tag.toLowerCase() === needle.toLowerCase())) return false
        }
        return Boolean(activeTagFilter || metaFilters.status || metaFilters.project || metaFilters.year)
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }, [activeTagFilter, documents, metaFilters])

  function openDocument(id: string) {
    dispatch(setActiveDocumentId(id))
    const cached = peekCachedDocument(id)
    if (cached) dispatch(setActiveDocument(cached))
    navigate(ROUTES.document(id))
    onNavigate?.()
  }

  function togglePlainTag(name: string) {
    dispatch(setActiveTagFilter(activeTagFilter === name ? null : name))
  }

  function toggleMeta(kind: Exclude<TagKind, 'plain'>, value: string) {
    const current = metaFilters[kind]
    dispatch(setMetaFilters({ [kind]: current === value ? null : value }))
  }

  async function addProjectFilter() {
    const value = await promptInput({
      title: t('library.addProjectTag'),
      placeholder: t('library.projectPlaceholder'),
    })
    if (!value?.trim()) return
    dispatch(setMetaFilters({ project: value.trim() }))
  }

  const uniqueTags = useMemo(() => [...new Set(allTags)].sort(), [allTags])

  const hasAnyTags = allTags.length > 0

  if (!hasAnyTags) {
    return (
      <div className="library-empty-state">
        <div className="library-empty-state-icon">
          <TagIcon className="h-5 w-5" />
        </div>
        <p className="library-empty-state-title">{t('library.noTags')}</p>
        <p className="library-empty-state-text">{t('library.noTagsHint')}</p>
        <p className="mt-2 px-4 text-center text-[11px] text-[var(--color-muted-foreground)]">
          {t('library.metaTagHint')}
        </p>
      </div>
    )
  }

  return (
    <div className="library-tags-view">
      <div className="mb-3 flex items-center justify-between gap-2 px-0.5">
        <h3 className="m-0 text-[11px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-foreground)]">
          {t('library.filters.tags')}
        </h3>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1 px-2 text-[11px]"
          onClick={() => setManageOpen(true)}
        >
          <Settings2 className="h-3 w-3" />
          {t('library.tags.manage')}
        </Button>
      </div>

      <section className="mb-3">
        <h3 className="mb-1.5 px-0.5 text-[11px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-foreground)]">
          {t('library.filters.status')}
        </h3>
        <div className="library-tag-grid">
          {options.statuses.map((status) => (
            <button
              key={status}
              type="button"
              className={cn('library-tag-chip', metaFilters.status === status && 'is-active')}
              onClick={() => toggleMeta('status', status)}
            >
              <span className="library-tag-chip-name">{status}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="mb-3">
        <h3 className="mb-1.5 px-0.5 text-[11px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-foreground)]">
          {t('library.filters.project')}
        </h3>
        <div className="library-tag-grid">
          {options.projects.map((project) => (
            <button
              key={project}
              type="button"
              className={cn('library-tag-chip', metaFilters.project === project && 'is-active')}
              onClick={() => toggleMeta('project', project)}
            >
              <span className="library-tag-chip-name">{project}</span>
            </button>
          ))}
          <button
            type="button"
            className="library-tag-chip"
            onClick={() => void addProjectFilter()}
          >
            <Plus className="h-3 w-3" />
            <span className="library-tag-chip-name">{t('library.addProject')}</span>
          </button>
        </div>
      </section>

      <section className="mb-3">
        <h3 className="mb-1.5 px-0.5 text-[11px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-foreground)]">
          {t('library.filters.year')}
        </h3>
        <div className="library-tag-grid">
          {(options.years.length > 0
            ? options.years
            : [String(new Date().getFullYear())]
          ).map((year) => (
            <button
              key={year}
              type="button"
              className={cn('library-tag-chip', metaFilters.year === year && 'is-active')}
              onClick={() => toggleMeta('year', year)}
            >
              <span className="library-tag-chip-name">{year}</span>
            </button>
          ))}
        </div>
      </section>

      {groups.plain.length > 0 && (
        <section className="mb-3">
          <h3 className="mb-1.5 px-0.5 text-[11px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-foreground)]">
            {t('library.filters.tags')}
          </h3>
          <div className="library-tag-grid">
            {groups.plain.map(({ raw, value }) => {
              const count = documents.filter((doc) => doc.tags.includes(raw)).length
              const isActive = activeTagFilter === raw
              return (
                <button
                  key={raw}
                  type="button"
                  className={cn('library-tag-chip', isActive && 'is-active')}
                  aria-pressed={isActive}
                  onClick={() => togglePlainTag(raw)}
                  style={{ '--tag-color': colorForTag(raw) } as React.CSSProperties}
                >
                  <span className="library-tag-chip-name">{value}</span>
                  <span className="library-tag-chip-count">{count}</span>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {(activeTagFilter || metaFilters.status || metaFilters.project || metaFilters.year) && (
        <div className="library-tags-results">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="library-tags-results-label m-0">
              {t('library.filteredDocuments', { count: taggedDocuments.length })}
            </p>
            <Button
              size="sm"
              variant="ghost"
              className="h-7"
              onClick={() => {
                dispatch(setActiveTagFilter(null))
                dispatch(setMetaFilters({ status: null, project: null, year: null }))
              }}
            >
              {t('library.clearFilter')}
            </Button>
          </div>
          <ul className="library-doc-list">
            {taggedDocuments.map((doc) => (
              <li key={doc.id}>
                <button
                  type="button"
                  className={cn('library-doc-card', activeId === doc.id && 'is-active')}
                  onClick={() => openDocument(doc.id)}
                >
                  <div className="library-doc-card-icon">
                    <FileText className="h-4 w-4" />
                  </div>
                  <div className="library-doc-card-body">
                    <p className="library-doc-card-title">{doc.title}</p>
                    <p className="library-doc-card-meta">
                      <Clock className="h-3 w-3" />
                      {formatRelativeTime(doc.updatedAt)}
                    </p>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <TagManageDialog open={manageOpen} onClose={() => setManageOpen(false)} tags={uniqueTags} />
    </div>
  )
}
