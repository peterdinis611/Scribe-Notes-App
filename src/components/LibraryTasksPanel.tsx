import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { CheckSquare, Folder, LoaderCircle, Square } from 'lucide-react'
import { nlpListOpenTasks, type DocumentTask } from '@/lib/db/nlp-api'
import { flattenFoldersForPicker } from '@/lib/library/folders'
import { ROUTES } from '@/lib/routes'
import { toast } from '@/lib/toast'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setActiveDocumentId, setPendingEditorSearch, setFindReplaceOpen } from '@/store/documentsSlice'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type LibraryTasksPanelProps = {
  onNavigate?: () => void
}

function dueSortKey(dueHint: string | null): number {
  if (!dueHint) return Number.POSITIVE_INFINITY
  const match = dueHint.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return Number.POSITIVE_INFINITY - 1
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
}

export function LibraryTasksPanel({ onNavigate }: LibraryTasksPanelProps) {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const folders = useAppSelector((state) => state.folders.folders)
  const [tasks, setTasks] = useState<DocumentTask[]>([])
  const [loading, setLoading] = useState(true)
  const [folderId, setFolderId] = useState<string>('all')

  const folderItems = useMemo(() => flattenFoldersForPicker(folders), [folders])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const rows = await nlpListOpenTasks(240, folderId === 'all' ? null : folderId)
      setTasks(rows)
    } catch (error) {
      toast.error(t('library.tasks.loadError'), String(error))
      setTasks([])
    } finally {
      setLoading(false)
    }
  }, [folderId, t])

  useEffect(() => {
    void load()
  }, [load])

  const grouped = useMemo(() => {
    const sorted = [...tasks].sort((a, b) => {
      const dueDiff = dueSortKey(a.dueHint) - dueSortKey(b.dueHint)
      if (dueDiff !== 0) return dueDiff
      return a.text.localeCompare(b.text, undefined, { sensitivity: 'base' })
    })
    const map = new Map<string, { title: string; items: DocumentTask[] }>()
    for (const task of sorted) {
      const id = task.documentId || 'unknown'
      const title = task.documentTitle?.trim() || t('common.untitled')
      const bucket = map.get(id) ?? { title, items: [] }
      bucket.items.push(task)
      map.set(id, bucket)
    }
    return [...map.entries()].sort((a, b) => {
      const aDue = Math.min(...a[1].items.map((item) => dueSortKey(item.dueHint)))
      const bDue = Math.min(...b[1].items.map((item) => dueSortKey(item.dueHint)))
      if (aDue !== bDue) return aDue - bDue
      return a[1].title.localeCompare(b[1].title, undefined, { sensitivity: 'base' })
    })
  }, [t, tasks])

  function openTask(task: DocumentTask) {
    const documentId = task.documentId
    if (!documentId) return
    dispatch(setActiveDocumentId(documentId))
    const needle = task.text.trim().slice(0, 80)
    if (needle) {
      dispatch(setFindReplaceOpen(true))
      dispatch(setPendingEditorSearch(needle))
    }
    void navigate(ROUTES.document(documentId))
    onNavigate?.()
  }

  return (
    <div className="library-tasks">
      <p className="library-tasks__kicker">
        <CheckSquare className="h-3.5 w-3.5" aria-hidden />
        {t('library.tasks.title')}
      </p>
      <p className="library-tasks__hint">{t('library.tasks.hint')}</p>

      <div className="library-tasks__filter">
        <Select value={folderId} onValueChange={setFolderId}>
          <SelectTrigger
            size="sm"
            className="library-tasks__select"
            aria-label={t('library.tasks.folderFilter')}
          >
            <span className="library-tasks__select-value">
              <Folder className="library-tasks__select-icon" aria-hidden />
              <SelectValue placeholder={t('library.tasks.allFolders')} />
            </span>
          </SelectTrigger>
          <SelectContent align="start" className="library-tasks__select-menu">
            <SelectItem value="all">{t('library.tasks.allFolders')}</SelectItem>
            {folderItems.map(({ folder, depth }) => (
              <SelectItem key={folder.id} value={folder.id}>
                <span
                  className="library-tasks__folder-option"
                  style={{ paddingInlineStart: `${depth * 12}px` }}
                >
                  {folder.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <p className="library-tasks__status">
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden />
          {t('common.loading')}
        </p>
      ) : tasks.length === 0 ? (
        <p className="library-tasks__empty">{t('library.tasks.empty')}</p>
      ) : (
        <>
          <p className="library-tasks__count">
            {t('library.tasks.count', { count: tasks.length, notes: grouped.length })}
          </p>
          <div className="library-tasks__groups">
            {grouped.map(([documentId, group]) => (
              <section key={documentId} className="library-tasks__group">
                <h4 className="library-tasks__doc">{group.title}</h4>
                <ul className="library-tasks__list">
                  {group.items.map((task, index) => (
                    <li key={`${documentId}-${task.text}-${index}`}>
                      <button
                        type="button"
                        className="library-tasks__item"
                        onClick={() => openTask(task)}
                      >
                        <Square className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-55" aria-hidden />
                        <span className="min-w-0">
                          <span className="library-tasks__text">{task.text}</span>
                          {task.dueHint ? (
                            <span className="library-tasks__due">{task.dueHint}</span>
                          ) : null}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
