import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { CalendarDays, Database, LayoutGrid, Table2 } from 'lucide-react'
import {
  NOTE_PRIORITY_OPTIONS,
  NOTE_STATUS_OPTIONS,
  parseNoteProperties,
  setNoteProperty,
  type NotePropertyKey,
} from '@/lib/library/document-properties'
import { setDocumentTags, type DocumentSummary } from '@/lib/db/api'
import { ROUTES } from '@/lib/routes'
import { toast } from '@/lib/toast'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setActiveDocumentId, updateDocuments } from '@/store/documentsSlice'
import { cn } from '@/lib/utils'

type LibraryDatabaseViewProps = {
  onNavigate?: () => void
}

type DbLayout = 'table' | 'board' | 'calendar'

export function LibraryDatabaseView({ onNavigate }: LibraryDatabaseViewProps) {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const documents = useAppSelector((state) => state.documents.documents)
  const [layout, setLayout] = useState<DbLayout>('table')
  const [projectFilter, setProjectFilter] = useState('all')

  const rows = useMemo(() => {
    return documents
      .filter((doc) => !doc.deletedAt)
      .map((doc) => ({
        doc,
        props: parseNoteProperties(doc.tags),
      }))
      .sort((a, b) => b.doc.updatedAt - a.doc.updatedAt)
  }, [documents])

  const projects = useMemo(() => {
    const set = new Set<string>()
    for (const row of rows) {
      if (row.props.project) set.add(row.props.project)
    }
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [rows])

  const filtered = useMemo(() => {
    if (projectFilter === 'all') return rows
    return rows.filter((row) => row.props.project === projectFilter)
  }, [projectFilter, rows])

  const boardColumns = useMemo(() => {
    type BoardStatus = (typeof NOTE_STATUS_OPTIONS)[number] | 'other'
    const cols: Array<{ status: BoardStatus; items: typeof filtered }> = NOTE_STATUS_OPTIONS.map(
      (status) => ({
        status,
        items: filtered.filter((row) => (row.props.status ?? 'inbox') === status),
      }),
    )
    const other = filtered.filter(
      (row) =>
        !NOTE_STATUS_OPTIONS.includes(
          (row.props.status ?? 'inbox') as (typeof NOTE_STATUS_OPTIONS)[number],
        ),
    )
    if (other.length > 0) {
      cols.push({ status: 'other', items: other })
    }
    return cols
  }, [filtered])

  const calendarGroups = useMemo(() => {
    const map = new Map<string, typeof filtered>()
    const undated: typeof filtered = []
    for (const row of filtered) {
      const due = row.props.due?.trim()
      if (!due) {
        undated.push(row)
        continue
      }
      const bucket = map.get(due) ?? []
      bucket.push(row)
      map.set(due, bucket)
    }
    const dated = [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
    return { dated, undated }
  }, [filtered])

  function openDoc(doc: DocumentSummary) {
    dispatch(setActiveDocumentId(doc.id))
    void navigate(ROUTES.document(doc.id))
    onNavigate?.()
  }

  async function updateProp(doc: DocumentSummary, key: NotePropertyKey, value: string) {
    try {
      const next = setNoteProperty(doc.tags, key, value || null)
      await setDocumentTags(doc.id, next)
      dispatch(
        updateDocuments((prev) =>
          prev.map((item) => (item.id === doc.id ? { ...item, tags: next } : item)),
        ),
      )
    } catch (error) {
      toast.error(t('library.database.saveError'), String(error))
    }
  }

  return (
    <div className="library-database">
      <p className="library-database__kicker">
        <Database className="h-3.5 w-3.5" aria-hidden />
        {t('library.database.title')}
      </p>
      <p className="library-database__hint">{t('library.database.hint')}</p>

      <div className="library-database__toolbar">
        <div className="library-database__layout" role="group" aria-label={t('library.database.layoutAria')}>
          <button
            type="button"
            className={cn('library-database__layout-btn', layout === 'table' && 'is-active')}
            onClick={() => setLayout('table')}
          >
            <Table2 className="h-3.5 w-3.5" aria-hidden />
            {t('library.database.layoutTable')}
          </button>
          <button
            type="button"
            className={cn('library-database__layout-btn', layout === 'board' && 'is-active')}
            onClick={() => setLayout('board')}
          >
            <LayoutGrid className="h-3.5 w-3.5" aria-hidden />
            {t('library.database.layoutBoard')}
          </button>
          <button
            type="button"
            className={cn('library-database__layout-btn', layout === 'calendar' && 'is-active')}
            onClick={() => setLayout('calendar')}
          >
            <CalendarDays className="h-3.5 w-3.5" aria-hidden />
            {t('library.database.layoutCalendar')}
          </button>
        </div>
        <label className="library-database__filter">
          <span>{t('library.database.project')}</span>
          <select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)}>
            <option value="all">{t('library.database.allProjects')}</option>
            {projects.map((project) => (
              <option key={project} value={project}>
                {project}
              </option>
            ))}
          </select>
        </label>
      </div>

      {filtered.length === 0 ? (
        <p className="library-database__empty">{t('library.database.empty')}</p>
      ) : layout === 'table' ? (
        <div className="library-database__table-wrap">
          <table className="library-database__table">
            <thead>
              <tr>
                <th>{t('library.database.note')}</th>
                <th>{t('library.database.status')}</th>
                <th>{t('library.database.project')}</th>
                <th>{t('library.database.due')}</th>
                <th>{t('library.database.priority')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ doc, props }) => (
                <tr key={doc.id}>
                  <td>
                    <button type="button" className="library-database__note" onClick={() => openDoc(doc)}>
                      {doc.title.trim() || t('common.untitled')}
                    </button>
                  </td>
                  <td>
                    <select
                      value={props.status ?? ''}
                      onChange={(event) => void updateProp(doc, 'status', event.target.value)}
                      aria-label={t('library.database.status')}
                    >
                      <option value="">{t('library.database.unset')}</option>
                      {NOTE_STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {t(`library.database.statusOptions.${status}`)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <input
                      value={props.project ?? ''}
                      placeholder={t('library.database.projectPlaceholder')}
                      onBlur={(event) => void updateProp(doc, 'project', event.target.value)}
                      defaultValue={props.project ?? ''}
                      key={`${doc.id}-project-${props.project ?? ''}`}
                      aria-label={t('library.database.project')}
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      value={props.due ?? ''}
                      onChange={(event) => void updateProp(doc, 'due', event.target.value)}
                      aria-label={t('library.database.due')}
                    />
                  </td>
                  <td>
                    <select
                      value={props.priority ?? ''}
                      onChange={(event) => void updateProp(doc, 'priority', event.target.value)}
                      aria-label={t('library.database.priority')}
                    >
                      <option value="">{t('library.database.unset')}</option>
                      {NOTE_PRIORITY_OPTIONS.map((priority) => (
                        <option key={priority} value={priority}>
                          {t(`library.database.priorityOptions.${priority}`)}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : layout === 'board' ? (
        <div className="library-database__board">
          {boardColumns.map((column) => (
            <section key={column.status} className="library-database__column">
              <h4>
                {column.status === 'other'
                  ? t('library.database.other')
                  : t(`library.database.statusOptions.${column.status}`)}
                <span>{column.items.length}</span>
              </h4>
              <ul>
                {column.items.map(({ doc, props }) => (
                  <li key={doc.id}>
                    <button type="button" onClick={() => openDoc(doc)}>
                      <span className="library-database__card-title">
                        {doc.title.trim() || t('common.untitled')}
                      </span>
                      {props.project ? (
                        <span className="library-database__card-meta">{props.project}</span>
                      ) : null}
                      {props.due ? (
                        <span className="library-database__card-meta">{props.due}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <div className="library-database__calendar">
          {calendarGroups.dated.map(([due, items]) => (
            <section key={due} className="library-database__day">
              <h4>
                <time dateTime={due}>{due}</time>
                <span>{items.length}</span>
              </h4>
              <ul>
                {items.map(({ doc, props }) => (
                  <li key={doc.id}>
                    <button type="button" onClick={() => openDoc(doc)}>
                      <span className="library-database__card-title">
                        {doc.title.trim() || t('common.untitled')}
                      </span>
                      {props.project ? (
                        <span className="library-database__card-meta">{props.project}</span>
                      ) : null}
                      {props.status ? (
                        <span className="library-database__card-meta">
                          {t(`library.database.statusOptions.${props.status}`, {
                            defaultValue: props.status,
                          })}
                        </span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {calendarGroups.undated.length > 0 ? (
            <section className="library-database__day is-undated">
              <h4>
                {t('library.database.noDue')}
                <span>{calendarGroups.undated.length}</span>
              </h4>
              <ul>
                {calendarGroups.undated.map(({ doc, props }) => (
                  <li key={doc.id}>
                    <button type="button" onClick={() => openDoc(doc)}>
                      <span className="library-database__card-title">
                        {doc.title.trim() || t('common.untitled')}
                      </span>
                      {props.project ? (
                        <span className="library-database__card-meta">{props.project}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {calendarGroups.dated.length === 0 && calendarGroups.undated.length === 0 ? (
            <p className="library-database__empty">{t('library.database.empty')}</p>
          ) : null}
        </div>
      )}
    </div>
  )
}
