import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ArrowLeftRight,
  BookmarkPlus,
  Clock,
  Eye,
  GitCompare,
  Pencil,
  Pin,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import { confirm } from '@tauri-apps/plugin-dialog'
import { RevisionDiffView } from '@/components/editor/RevisionDiffView'
import { cacheDocument } from '@/lib/cache/document-cache'
import {
  createNamedRevision,
  deleteDocumentRevision,
  diffDocumentRevisions,
  getDocumentRevision,
  listDocumentRevisions,
  renameDocumentRevision,
  restoreDocumentRevision,
  type DocumentRevision,
} from '@/lib/db/api'
import { promptInput } from '@/lib/input-dialog'
import {
  buildSideBySideFromLines,
  CURRENT_REVISION_ID,
  type DiffLine,
  type DiffViewMode,
  type SideBySideRow,
} from '@/lib/revisions/diff-text'
import { tiptapToPlainText } from '@/lib/export/plain-text'
import {
  buildRevisionCompareOptions,
  findRevisionOption,
  normalizeComparePair,
} from '@/lib/revisions/revision-compare'
import { nlpAnalyzeRevisionDiff, type RevisionAiReport } from '@/lib/db/nlp-api'
import { toast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn, formatRelativeTime } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setActiveDocument, updateDocuments } from '@/store/documentsSlice'
import { EditorSidePanel, EditorSidePanelHeader } from '@/components/editor/EditorSidePanelPrimitives'

type RevisionHistoryPanelProps = {
  onClose: () => void
}

type CompareState = {
  left: { id: string; label: string; createdAt: number }
  right: { id: string; label: string; createdAt: number }
  lines: DiffLine[]
  sideBySideRows: SideBySideRow[]
  ai?: RevisionAiReport | null
}

type PreviewState = {
  id: string
  title: string
  label: string | null
  createdAt: number
  plainText: string
}

export function RevisionHistoryPanel({ onClose }: RevisionHistoryPanelProps) {
  const { t } = useTranslation()
  const activeId = useAppSelector((state) => state.documents.activeDocumentId)
  const activeDocument = useAppSelector((state) => state.documents.activeDocument)
  const dispatch = useAppDispatch()
  const [revisions, setRevisions] = useState<DocumentRevision[]>([])
  const [loading, setLoading] = useState(true)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [naming, setNaming] = useState(false)
  const [compareLoading, setCompareLoading] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [versionAId, setVersionAId] = useState(CURRENT_REVISION_ID)
  const [versionBId, setVersionBId] = useState(CURRENT_REVISION_ID)
  const [compareState, setCompareState] = useState<CompareState | null>(null)
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [viewMode, setViewMode] = useState<DiffViewMode>('split')
  const [changesOnly, setChangesOnly] = useState(false)
  const [contextLines, setContextLines] = useState(2)
  const [wordHighlight, setWordHighlight] = useState(true)

  const compareOptions = useMemo(() => {
    const options = buildRevisionCompareOptions(revisions, activeDocument?.updatedAt ?? Date.now())
    return options.map((option) =>
      option.id === CURRENT_REVISION_ID
        ? { ...option, label: t('panels.revisions.currentVersion') }
        : option,
    )
  }, [activeDocument?.updatedAt, revisions, t])

  async function refreshRevisions(documentId: string) {
    const next = await listDocumentRevisions(documentId, 50)
    setRevisions(next)
    return next
  }

  useEffect(() => {
    if (!activeId) {
      setRevisions([])
      setLoading(false)
      return
    }

    setLoading(true)
    void refreshRevisions(activeId)
      .catch(() => setRevisions([]))
      .finally(() => setLoading(false))
  }, [activeId])

  useEffect(() => {
    setCompareState(null)
    setPreview(null)
    setVersionAId(revisions[1]?.id ?? CURRENT_REVISION_ID)
    setVersionBId(CURRENT_REVISION_ID)
    setChangesOnly(false)
  }, [activeId, revisions])

  async function runCompare(nextAId: string, nextBId: string) {
    if (!activeDocument || !activeId) return

    if (nextAId === nextBId) {
      toast.error(t('panels.revisions.selectTwoVersions'))
      return
    }

    const { olderId, newerId } = normalizeComparePair(
      nextAId,
      nextBId,
      revisions,
      activeDocument.updatedAt,
    )

    setCompareLoading(true)
    setPreview(null)
    try {
      const currentPlain =
        olderId === CURRENT_REVISION_ID || newerId === CURRENT_REVISION_ID
          ? tiptapToPlainText(activeDocument.contentJson)
          : undefined
      const diff = await diffDocumentRevisions(activeId, olderId, newerId, currentPlain)
      const olderText = diff.oldText
      const newerText = diff.newText

      const olderOption = findRevisionOption(olderId, compareOptions)
      const newerOption = findRevisionOption(newerId, compareOptions)
      if (!olderOption || !newerOption) return

      let ai: RevisionAiReport | null = null
      try {
        ai = await nlpAnalyzeRevisionDiff({
          oldText: olderText,
          newText: newerText,
          maxBullets: 6,
        })
      } catch {
        ai = null
      }

      setCompareState({
        left: {
          id: olderOption.id,
          label: olderOption.label,
          createdAt: olderOption.createdAt,
        },
        right: {
          id: newerOption.id,
          label: newerOption.label,
          createdAt: newerOption.createdAt,
        },
        lines: diff.lines,
        sideBySideRows: buildSideBySideFromLines(diff.lines),
        ai,
      })
      setVersionAId(olderId)
      setVersionBId(newerId)
    } catch {
      toast.error(t('panels.revisions.compareError'))
    } finally {
      setCompareLoading(false)
    }
  }

  async function handleNameCurrent() {
    if (!activeId) return
    const label = await promptInput({
      title: t('panels.revisions.nameVersionTitle'),
      placeholder: t('panels.revisions.nameVersionPlaceholder'),
      confirmLabel: t('panels.revisions.nameVersionConfirm'),
    })
    if (!label?.trim()) return

    setNaming(true)
    try {
      await createNamedRevision(activeId, label.trim(), true)
      await refreshRevisions(activeId)
      toast.success(t('panels.revisions.nameVersionSuccess'))
    } catch {
      toast.error(t('panels.revisions.nameVersionError'))
    } finally {
      setNaming(false)
    }
  }

  async function handleRename(revision: DocumentRevision) {
    const label = await promptInput({
      title: t('panels.revisions.renameTitle'),
      placeholder: t('panels.revisions.nameVersionPlaceholder'),
      defaultValue: revision.label ?? '',
      confirmLabel: t('common.save'),
    })
    if (label === null) return

    try {
      await renameDocumentRevision(revision.id, label.trim() || null, revision.pinned)
      if (activeId) await refreshRevisions(activeId)
    } catch {
      toast.error(t('panels.revisions.renameError'))
    }
  }

  async function handleTogglePin(revision: DocumentRevision) {
    try {
      await renameDocumentRevision(revision.id, revision.label, !revision.pinned)
      if (activeId) await refreshRevisions(activeId)
    } catch {
      toast.error(t('panels.revisions.pinError'))
    }
  }

  async function handlePreview(revision: DocumentRevision) {
    setPreviewLoading(true)
    setCompareState(null)
    try {
      const detail = await getDocumentRevision(revision.id)
      setPreview({
        id: detail.id,
        title: detail.title,
        label: detail.label,
        createdAt: detail.createdAt,
        plainText: tiptapToPlainText(detail.contentJson).trim() || t('panels.revisions.previewEmpty'),
      })
    } catch {
      toast.error(t('panels.revisions.previewError'))
    } finally {
      setPreviewLoading(false)
    }
  }

  async function handleDelete(revision: DocumentRevision) {
    const confirmed = await confirm(
      t('panels.revisions.deleteConfirm', {
        title: revision.label?.trim() || revision.title,
      }),
      {
        title: t('panels.revisions.deleteConfirmTitle'),
        kind: 'warning',
        okLabel: t('common.delete'),
        cancelLabel: t('common.cancel'),
      },
    )
    if (!confirmed) return

    setDeletingId(revision.id)
    try {
      await deleteDocumentRevision(revision.id)
      if (preview?.id === revision.id) setPreview(null)
      if (compareState?.left.id === revision.id || compareState?.right.id === revision.id) {
        setCompareState(null)
      }
      if (activeId) await refreshRevisions(activeId)
      toast.success(t('panels.revisions.deleteSuccess'))
    } catch {
      toast.error(t('panels.revisions.deleteError'))
    } finally {
      setDeletingId(null)
    }
  }

  async function handleRestore(revision: DocumentRevision) {
    const confirmed = await confirm(
      t('panels.revisions.restoreConfirm', {
        title: revision.label?.trim() || revision.title,
        time: formatRelativeTime(revision.createdAt),
      }),
      {
        title: t('panels.revisions.restoreConfirmTitle'),
        kind: 'warning',
        okLabel: t('common.restore'),
        cancelLabel: t('common.cancel'),
      },
    )
    if (!confirmed) return

    setRestoringId(revision.id)
    try {
      const restored = cacheDocument(await restoreDocumentRevision(revision.id))
      dispatch(setActiveDocument(restored))
      dispatch(
        updateDocuments((prev) =>
          prev.map((item) =>
            item.id === restored.id
              ? {
                  ...item,
                  title: restored.title,
                  filePath: restored.filePath,
                  updatedAt: restored.updatedAt,
                }
              : item,
          ),
        ),
      )
      toast.success(t('panels.revisions.restoreSuccess'), formatRelativeTime(revision.createdAt))
      setCompareState(null)
      setPreview(null)
      if (activeId) await refreshRevisions(activeId)
    } catch {
      toast.error(t('panels.revisions.restoreError'))
    } finally {
      setRestoringId(null)
    }
  }

  function handleQuickCompare(revision: DocumentRevision) {
    void runCompare(revision.id, CURRENT_REVISION_ID)
  }

  function handleSelectVersion(revisionId: string, side: 'a' | 'b') {
    if (side === 'a') {
      setVersionAId(revisionId)
      return
    }
    setVersionBId(revisionId)
  }

  function handleSwapSides() {
    setVersionAId(versionBId)
    setVersionBId(versionAId)
  }

  const canCompare = compareOptions.length >= 2 && versionAId !== versionBId

  function formatVersionLabel(option: (typeof compareOptions)[number]) {
    return `${option.label} · ${formatRelativeTime(option.createdAt)}`
  }

  return (
    <EditorSidePanel
      minWidth={compareState || preview ? 560 : undefined}
      className="titlebar-no-drag"
    >
      <EditorSidePanelHeader
        title={t('editorPanels.revisions')}
        subtitle={t('panels.revisions.subtitle')}
        actions={
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={!activeId || naming}
              onClick={() => void handleNameCurrent()}
            >
              <BookmarkPlus className="h-3.5 w-3.5" />
              {naming ? t('panels.revisions.naming') : t('panels.revisions.nameVersion')}
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              {t('common.close')}
            </Button>
          </div>
        }
      />

      {!loading && compareOptions.length >= 2 && (
        <section className="border-b border-[var(--color-border)] px-3.5 pb-3.5 pt-2.5">
          <p className="m-0 mb-2.5 text-[11px] font-bold uppercase tracking-[0.04em] text-[var(--color-muted-foreground)]">
            {t('panels.revisions.compareTitle')}
          </p>
          <div className="rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5">
            <div className="grid gap-2.5">
              <div className="grid gap-1">
                <label
                  htmlFor="revision-version-a"
                  className="text-[11px] font-medium text-[var(--color-muted-foreground)]"
                >
                  {t('panels.revisions.versionA')}
                </label>
                <Select value={versionAId} onValueChange={setVersionAId}>
                  <SelectTrigger id="revision-version-a" aria-label={t('panels.revisions.versionA')}>
                    <SelectValue placeholder={t('panels.revisions.selectVersionA')} />
                  </SelectTrigger>
                  <SelectContent>
                    {compareOptions.map((option) => (
                      <SelectItem
                        key={`a-${option.id}`}
                        value={option.id}
                        textValue={formatVersionLabel(option)}
                      >
                        <span className="flex min-w-0 items-center justify-between gap-2">
                          <span className="truncate font-medium">{option.label}</span>
                          <span className="shrink-0 text-[11px] text-[var(--color-muted-foreground)]">
                            {formatRelativeTime(option.createdAt)}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-center">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSwapSides}
                  title={t('panels.revisions.swapSides')}
                >
                  <ArrowLeftRight className="h-3.5 w-3.5" />
                  {t('panels.revisions.swapSides')}
                </Button>
              </div>

              <div className="grid gap-1">
                <label
                  htmlFor="revision-version-b"
                  className="text-[11px] font-medium text-[var(--color-muted-foreground)]"
                >
                  {t('panels.revisions.versionB')}
                </label>
                <Select value={versionBId} onValueChange={setVersionBId}>
                  <SelectTrigger id="revision-version-b" aria-label={t('panels.revisions.versionB')}>
                    <SelectValue placeholder={t('panels.revisions.selectVersionB')} />
                  </SelectTrigger>
                  <SelectContent>
                    {compareOptions.map((option) => (
                      <SelectItem
                        key={`b-${option.id}`}
                        value={option.id}
                        textValue={formatVersionLabel(option)}
                      >
                        <span className="flex min-w-0 items-center justify-between gap-2">
                          <span className="truncate font-medium">{option.label}</span>
                          <span className="shrink-0 text-[11px] text-[var(--color-muted-foreground)]">
                            {formatRelativeTime(option.createdAt)}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              variant="default"
              size="sm"
              className="mt-2.5 w-full"
              disabled={!canCompare || compareLoading}
              onClick={() => void runCompare(versionAId, versionBId)}
            >
              <GitCompare className="h-3.5 w-3.5" />
              {compareLoading ? t('panels.revisions.comparing') : t('panels.revisions.compare')}
            </Button>
          </div>
        </section>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2.5">
        {loading && (
          <p className="px-2 py-3 text-[12px] leading-relaxed text-[var(--color-muted-foreground)]">
            {t('panels.revisions.loading')}
          </p>
        )}
        {!loading && revisions.length === 0 && (
          <p className="px-2 py-3 text-[12px] leading-relaxed text-[var(--color-muted-foreground)]">
            {t('panels.revisions.empty')}
          </p>
        )}
        {!loading &&
          revisions.map((revision) => {
            const isSelectedA = versionAId === revision.id
            const isSelectedB = versionBId === revision.id
            const displayTitle = revision.label?.trim() || revision.title

            return (
              <div
                key={revision.id}
                className={cn(
                  'flex flex-col gap-2.5 rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-2.5',
                  (isSelectedA || isSelectedB) &&
                    'border-[var(--color-selection-strong)] bg-[color-mix(in_srgb,var(--color-selection)_35%,var(--color-surface-elevated))]',
                  revision.pinned &&
                    'border-[color-mix(in_srgb,var(--color-accent)_45%,var(--color-border))]',
                )}
              >
                <div className="flex min-w-0 items-start gap-2">
                  <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-50" />
                  <div className="min-w-0 flex-1">
                    <p className="m-0 flex items-center gap-1.5 truncate text-[12px] font-semibold">
                      {revision.pinned ? (
                        <Pin className="h-3 w-3 shrink-0 text-[var(--color-accent)]" aria-hidden />
                      ) : null}
                      <span className="truncate">{displayTitle}</span>
                    </p>
                    <p className="mt-0.5 text-[11px] text-[var(--color-muted-foreground)]">
                      {formatRelativeTime(revision.createdAt)}
                      {revision.label?.trim() ? ` · ${revision.title}` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex gap-1.5">
                  {isSelectedA && (
                    <span className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-[var(--color-selection)] px-1.5 text-[11px] font-bold">
                      A
                    </span>
                  )}
                  {isSelectedB && (
                    <span className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full bg-[var(--color-selection)] px-1.5 text-[11px] font-bold">
                      B
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <Button variant="outline" size="sm" onClick={() => handleSelectVersion(revision.id, 'a')}>
                    A
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleSelectVersion(revision.id, 'b')}>
                    B
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={compareLoading}
                    onClick={() => handleQuickCompare(revision)}
                  >
                    <GitCompare className="h-3.5 w-3.5" />
                    {t('panels.revisions.vsCurrent')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={previewLoading}
                    onClick={() => void handlePreview(revision)}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    {t('panels.revisions.preview')}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => void handleRename(revision)}>
                    <Pencil className="h-3.5 w-3.5" />
                    {t('panels.revisions.rename')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleTogglePin(revision)}
                    title={revision.pinned ? t('panels.revisions.unpin') : t('panels.revisions.pin')}
                  >
                    <Pin className="h-3.5 w-3.5" />
                    {revision.pinned ? t('panels.revisions.unpin') : t('panels.revisions.pin')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={restoringId === revision.id}
                    onClick={() => void handleRestore(revision)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {restoringId === revision.id
                      ? t('panels.revisions.restoring')
                      : t('common.restore')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={deletingId === revision.id}
                    onClick={() => void handleDelete(revision)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    {deletingId === revision.id
                      ? t('panels.revisions.deleting')
                      : t('common.delete')}
                  </Button>
                </div>
              </div>
            )
          })}
      </div>

      {preview ? (
        <div className="flex max-h-[40vh] flex-col border-t border-[var(--color-border)] bg-[var(--color-background)]">
          <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3">
            <div>
              <p className="m-0 text-[13px] font-semibold">{t('panels.revisions.previewTitle')}</p>
              <p className="mt-1 text-[11px] text-[var(--color-muted-foreground)]">
                {(preview.label?.trim() || preview.title) +
                  ' · ' +
                  formatRelativeTime(preview.createdAt)}
              </p>
            </div>
            <button
              type="button"
              className="border-none bg-transparent text-[12px] text-[var(--color-muted-foreground)]"
              onClick={() => setPreview(null)}
            >
              {t('common.close')}
            </button>
          </div>
          <pre className="m-0 overflow-auto whitespace-pre-wrap break-words px-4 py-3 font-mono text-[12px] leading-relaxed text-[var(--color-foreground)]">
            {preview.plainText}
          </pre>
        </div>
      ) : null}

      {compareState && (
        <>
          {compareState.ai ? (
            <div className="mx-3 mb-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-[12px] leading-snug text-[var(--color-foreground)]">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-muted-foreground)]">
                  {t('panels.revisions.revisionAi')}
                  <span className="ml-1.5 font-medium normal-case tracking-normal opacity-70">
                    · {compareState.ai.source}
                  </span>
                </span>
                <span className="inline-flex items-center gap-2">
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                      compareState.ai.changeKind === 'expansion' &&
                        'bg-[color-mix(in_srgb,#22c55e_18%,transparent)] text-[#15803d]',
                      compareState.ai.changeKind === 'trim' &&
                        'bg-[color-mix(in_srgb,#ef4444_14%,transparent)] text-[#b91c1c]',
                      compareState.ai.changeKind === 'rewrite' &&
                        'bg-[color-mix(in_srgb,#f59e0b_18%,transparent)] text-[#b45309]',
                      compareState.ai.changeKind === 'structural' &&
                        'bg-[color-mix(in_srgb,var(--color-accent)_18%,transparent)] text-[var(--color-accent)]',
                      !['expansion', 'trim', 'rewrite', 'structural'].includes(
                        compareState.ai.changeKind,
                      ) && 'bg-[var(--color-selection)] text-[var(--color-foreground)]',
                    )}
                  >
                    {t(`panels.revisions.changeKind.${compareState.ai.changeKind}`)}
                  </span>
                  <span className="text-[10px] text-[var(--color-muted-foreground)]">
                    {t('panels.revisions.nlpDiffChange', {
                      percent: Math.round((compareState.ai.stats?.changeRatio ?? 0) * 100),
                    })}
                  </span>
                </span>
              </div>
              <p className="mb-1 text-[13px] font-semibold">{compareState.ai.headline}</p>
              {compareState.ai.summary ? (
                <p className="mb-2 text-[12px] text-[var(--color-muted-foreground)]">
                  {compareState.ai.summary}
                </p>
              ) : null}
              {compareState.ai.bullets?.length ? (
                <ul className="mb-0 space-y-1.5 text-[11px]">
                  {compareState.ai.bullets.map((bullet) => (
                    <li key={`${bullet.kind}-${bullet.text.slice(0, 40)}`} className="flex gap-1.5">
                      <span
                        className={cn(
                          'mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full',
                          bullet.severity === 'critical' && 'bg-[#b91c1c]',
                          bullet.severity === 'warn' && 'bg-[#b45309]',
                          bullet.severity === 'info' && 'bg-[#15803d]',
                        )}
                        aria-hidden
                      />
                      <span>{bullet.text}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          <RevisionDiffView
            left={{
              label: compareState.left.label,
              createdAt: compareState.left.createdAt,
            }}
            right={{
              label: compareState.right.label,
              createdAt: compareState.right.createdAt,
            }}
            lines={compareState.lines}
            sideBySideRows={compareState.sideBySideRows}
            viewMode={viewMode}
            changesOnly={changesOnly}
            contextLines={contextLines}
            wordHighlight={wordHighlight}
            gainedTerms={compareState.ai?.gainedTerms}
            lostTerms={compareState.ai?.lostTerms}
            onViewModeChange={setViewMode}
            onChangesOnlyChange={setChangesOnly}
            onContextLinesChange={setContextLines}
            onWordHighlightChange={setWordHighlight}
            onClose={() => setCompareState(null)}
          />
        </>
      )}
    </EditorSidePanel>
  )
}
