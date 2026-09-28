import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useNavigate } from '@tanstack/react-router'
import {
  diffPlainTexts,
  getDocument,
  getDocumentRevision,
  listDocumentRevisions,
  updateDocument,
} from '@/lib/db/api'
import { plainTextToTipTapContent } from '@/lib/editor/block-snippets'
import { listSyncConflicts, resolveSyncConflict, type SyncConflict } from '@/lib/db/libraries-api'
import { tiptapToPlainText } from '@/lib/export/plain-text'
import { reloadLibraryFromBackend } from '@/lib/library-reload'
import type { DiffLine } from '@/lib/revisions/diff-text'
import { ROUTES } from '@/lib/routes'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setActiveDocumentId } from '@/store/documentsSlice'
import { setOpenConflictCount } from '@/store/librariesSlice'
import { setSyncConflictsOpen } from '@/store/uiSlice'

type ConflictPreview = {
  appText: string | null
  diskText: string | null
}

type MergeState = {
  conflictId: string
  documentId: string
  lines: DiffLine[]
  /** For each changed index: 'app' | 'disk' | 'both' */
  picks: Record<number, 'app' | 'disk' | 'both'>
  draft: string
}

function formatTs(value: number): string {
  try {
    return new Date(value).toLocaleString()
  } catch {
    return String(value)
  }
}

function buildDraftFromPicks(lines: DiffLine[], picks: Record<number, 'app' | 'disk' | 'both'>): string {
  const out: string[] = []
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (line.type === 'unchanged') {
      out.push(line.text)
      continue
    }
    if (line.type === 'removed') {
      const next = lines[i + 1]
      const pick = picks[i] ?? 'app'
      if (next?.type === 'added') {
        if (pick === 'app' || pick === 'both') out.push(line.text)
        if (pick === 'disk' || pick === 'both') out.push(next.text)
        i += 1
      } else if (pick !== 'disk') {
        out.push(line.text)
      }
      continue
    }
    if (line.type === 'added') {
      const pick = picks[i] ?? 'disk'
      if (pick !== 'app') out.push(line.text)
    }
  }
  return out.join('\n')
}

export function SyncConflictsDialog() {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const open = useAppSelector((state) => state.ui.syncConflictsOpen)
  const [conflicts, setConflicts] = useState<SyncConflict[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [previews, setPreviews] = useState<Record<string, ConflictPreview>>({})
  const [loadingPreview, setLoadingPreview] = useState<string | null>(null)
  const [merge, setMerge] = useState<MergeState | null>(null)
  const [savingMerge, setSavingMerge] = useState(false)

  useEffect(() => {
    if (!open) return
    void listSyncConflicts()
      .then((rows) => {
        setConflicts(rows)
        dispatch(setOpenConflictCount(rows.length))
      })
      .catch(() => setConflicts([]))
  }, [dispatch, open])

  async function loadPreview(item: SyncConflict) {
    if (previews[item.id]) {
      setExpandedId((prev) => (prev === item.id ? null : item.id))
      return
    }
    setLoadingPreview(item.id)
    setExpandedId(item.id)
    try {
      const [revisions, current] = await Promise.all([
        listDocumentRevisions(item.documentId, 12),
        getDocument(item.documentId).catch(() => null),
      ])
      const before = revisions.find((rev) =>
        (rev.label || '').toLowerCase().includes('before sync conflict'),
      )
      let appText: string | null = null
      if (before) {
        const detail = await getDocumentRevision(before.id)
        appText = tiptapToPlainText(detail.contentJson).slice(0, 12_000)
      }
      const diskText = current
        ? tiptapToPlainText(current.contentJson).slice(0, 12_000)
        : null
      setPreviews((prev) => ({
        ...prev,
        [item.id]: { appText, diskText },
      }))
    } catch {
      setPreviews((prev) => ({
        ...prev,
        [item.id]: { appText: null, diskText: null },
      }))
    } finally {
      setLoadingPreview(null)
    }
  }

  async function startMerge(item: SyncConflict) {
    setLoadingPreview(item.id)
    try {
      let preview = previews[item.id]
      if (!preview) {
        const [revisions, current] = await Promise.all([
          listDocumentRevisions(item.documentId, 12),
          getDocument(item.documentId).catch(() => null),
        ])
        const before = revisions.find((rev) =>
          (rev.label || '').toLowerCase().includes('before sync conflict'),
        )
        let appText: string | null = null
        if (before) {
          const detail = await getDocumentRevision(before.id)
          appText = tiptapToPlainText(detail.contentJson).slice(0, 12_000)
        }
        const diskText = current
          ? tiptapToPlainText(current.contentJson).slice(0, 12_000)
          : null
        preview = { appText, diskText }
        setPreviews((prev) => ({ ...prev, [item.id]: preview! }))
      }

      const left = preview.appText ?? ''
      const right = preview.diskText ?? ''
      const diff = await diffPlainTexts(left, right)
      const picks: Record<number, 'app' | 'disk' | 'both'> = {}
      diff.lines.forEach((line, index) => {
        if (line.type === 'removed') picks[index] = 'app'
        if (line.type === 'added') picks[index] = 'disk'
      })
      setMerge({
        conflictId: item.id,
        documentId: item.documentId,
        lines: diff.lines,
        picks,
        draft: buildDraftFromPicks(diff.lines, picks),
      })
      setExpandedId(item.id)
    } catch (error) {
      toast.error(t('syncConflicts.resolveError'), String(error))
    } finally {
      setLoadingPreview(null)
    }
  }

  function setPick(index: number, pick: 'app' | 'disk' | 'both') {
    setMerge((prev) => {
      if (!prev) return prev
      const picks = { ...prev.picks, [index]: pick }
      return { ...prev, picks, draft: buildDraftFromPicks(prev.lines, picks) }
    })
  }

  async function saveMerge() {
    if (!merge) return
    setSavingMerge(true)
    try {
      const content = {
        type: 'doc',
        content: plainTextToTipTapContent(merge.draft),
      }
      await updateDocument({
        id: merge.documentId,
        contentJson: JSON.stringify(content),
      })
      await resolveSyncConflict(merge.conflictId, 'app')
      const next = await listSyncConflicts()
      setConflicts(next)
      dispatch(setOpenConflictCount(next.length))
      await reloadLibraryFromBackend(dispatch, { preserveActive: true })
      setMerge(null)
      toast.success(t('syncConflicts.mergeSaved'))
      if (next.length === 0) dispatch(setSyncConflictsOpen(false))
    } catch (error) {
      toast.error(t('syncConflicts.resolveError'), String(error))
    } finally {
      setSavingMerge(false)
    }
  }

  async function resolve(id: string, keep: 'app' | 'disk') {
    try {
      await resolveSyncConflict(id, keep)
      const next = await listSyncConflicts()
      setConflicts(next)
      dispatch(setOpenConflictCount(next.length))
      await reloadLibraryFromBackend(dispatch, { preserveActive: true })
      if (merge?.conflictId === id) setMerge(null)
      if (next.length === 0) dispatch(setSyncConflictsOpen(false))
    } catch (error) {
      toast.error(t('syncConflicts.resolveError'), String(error))
    }
  }

  const mergeRows = useMemo(() => {
    if (!merge) return []
    const rows: Array<{ index: number; app?: string; disk?: string }> = []
    for (let i = 0; i < merge.lines.length; i += 1) {
      const line = merge.lines[i]
      if (line.type === 'unchanged') continue
      if (line.type === 'removed') {
        const next = merge.lines[i + 1]
        if (next?.type === 'added') {
          rows.push({ index: i, app: line.text, disk: next.text })
          i += 1
        } else {
          rows.push({ index: i, app: line.text })
        }
      } else if (line.type === 'added') {
        rows.push({ index: i, disk: line.text })
      }
    }
    return rows
  }, [merge])

  return (
    <Dialog open={open} onOpenChange={(next) => dispatch(setSyncConflictsOpen(next))}>
      {open && (
        <DialogContent className="titlebar-no-drag max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('syncConflicts.title')}</DialogTitle>
            <DialogDescription>{t('syncConflicts.hint')}</DialogDescription>
          </DialogHeader>
          {conflicts.length === 0 ? (
            <p className="mt-1 text-[12px] text-[var(--color-muted-foreground)]">
              {t('syncConflicts.empty')}
            </p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {conflicts.map((item) => {
                const preview = previews[item.id]
                const expanded = expandedId === item.id
                const merging = merge?.conflictId === item.id
                return (
                  <li
                    key={item.id}
                    className="rounded-lg border border-[color-mix(in_srgb,var(--color-border)_80%,transparent)] p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="m-0 font-[650]">{item.title}</p>
                        <p className="mt-1 text-[12px] text-[var(--color-muted-foreground)]">
                          {t('syncConflicts.meta', {
                            disk: formatTs(item.diskUpdatedAt),
                            app: formatTs(item.dbUpdatedAt),
                          })}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => void loadPreview(item)}
                        >
                          {loadingPreview === item.id
                            ? t('common.loading')
                            : expanded
                              ? t('syncConflicts.hideDiff')
                              : t('syncConflicts.showDiff')}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => void startMerge(item)}
                        >
                          {t('syncConflicts.merge')}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            dispatch(setActiveDocumentId(item.documentId))
                            void navigate(ROUTES.document(item.documentId))
                            dispatch(setSyncConflictsOpen(false))
                          }}
                        >
                          {t('syncConflicts.openDocument')}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => void resolve(item.id, 'app')}
                        >
                          {t('syncConflicts.keepApp')}
                        </Button>
                        <Button type="button" size="sm" onClick={() => void resolve(item.id, 'disk')}>
                          {t('syncConflicts.keepDisk')}
                        </Button>
                      </div>
                    </div>
                    {expanded && !merging ? (
                      <div className="sync-conflict-diff">
                        <div className="sync-conflict-diff-pane">
                          <p className="sync-conflict-diff-label">{t('syncConflicts.appVersion')}</p>
                          <pre className="sync-conflict-diff-body">
                            {preview?.appText?.trim() || t('syncConflicts.noAppRevision')}
                          </pre>
                        </div>
                        <div className="sync-conflict-diff-pane">
                          <p className="sync-conflict-diff-label">{t('syncConflicts.diskVersion')}</p>
                          <pre className="sync-conflict-diff-body">
                            {preview?.diskText?.trim() || t('syncConflicts.noAppRevision')}
                          </pre>
                        </div>
                      </div>
                    ) : null}
                    {merging && merge ? (
                      <div className="mt-3 space-y-2">
                        <p className="m-0 text-[12px] text-[var(--color-muted-foreground)]">
                          {t('syncConflicts.mergeHint')}
                        </p>
                        <ul className="m-0 flex max-h-40 list-none flex-col gap-1.5 overflow-auto p-0">
                          {mergeRows.map((row) => (
                            <li
                              key={row.index}
                              className="rounded-md border border-[color-mix(in_srgb,var(--color-border)_75%,transparent)] p-2 text-[12px]"
                            >
                              <div className="mb-1 flex flex-wrap gap-1">
                                {(['app', 'disk', 'both'] as const).map((pick) => (
                                  <button
                                    key={pick}
                                    type="button"
                                    className={cn(
                                      'library-chat-chip',
                                      (merge.picks[row.index] ?? 'app') === pick && 'is-active',
                                    )}
                                    onClick={() => setPick(row.index, pick)}
                                  >
                                    {t(`syncConflicts.pick.${pick}`)}
                                  </button>
                                ))}
                              </div>
                              {row.app != null ? (
                                <p className="m-0 text-[color-mix(in_srgb,#ef4444_70%,var(--color-foreground))]">
                                  − {row.app || '⏎'}
                                </p>
                              ) : null}
                              {row.disk != null ? (
                                <p className="m-0 text-[color-mix(in_srgb,#22c55e_70%,var(--color-foreground))]">
                                  + {row.disk || '⏎'}
                                </p>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                        <textarea
                          className="min-h-32 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2 font-[family-name:var(--font-mono)] text-[12px] leading-relaxed"
                          value={merge.draft}
                          onChange={(event) =>
                            setMerge((prev) =>
                              prev ? { ...prev, draft: event.target.value } : prev,
                            )
                          }
                        />
                        <div className="flex justify-end gap-1.5">
                          <Button type="button" size="sm" variant="ghost" onClick={() => setMerge(null)}>
                            {t('common.cancel')}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            disabled={savingMerge}
                            onClick={() => void saveMerge()}
                          >
                            {savingMerge ? t('common.loading') : t('syncConflicts.mergeSave')}
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
        </DialogContent>
      )}
    </Dialog>
  )
}
