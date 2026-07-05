import { useEffect, useMemo, useState } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { Clock, GitCompare, RotateCcw } from 'lucide-react'
import { confirm } from '@tauri-apps/plugin-dialog'
import { RevisionDiffView } from '@/components/editor/RevisionDiffView'
import { cacheDocument } from '@/lib/cache/document-cache'
import {
  getDocumentRevision,
  listDocumentRevisions,
  restoreDocumentRevision,
  type DocumentRevision,
} from '@/lib/db/api'
import { tiptapToPlainText } from '@/lib/export/plain-text'
import {
  CURRENT_REVISION_ID,
  diffLines,
  diffSideBySide,
  type DiffLine,
  type DiffViewMode,
  type SideBySideRow,
} from '@/lib/revisions/diff-text'
import {
  buildRevisionCompareOptions,
  findRevisionOption,
  normalizeComparePair,
} from '@/lib/revisions/revision-compare'
import { formatRelativeTime } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { activeDocumentAtom, activeDocumentIdAtom, documentsAtom } from '@/store/documents'
import { EditorSidePanel, EditorSidePanelHeader } from '@/components/editor/EditorSidePanelPrimitives'

type RevisionHistoryPanelProps = {
  onClose: () => void
}

type CompareState = {
  left: { id: string; label: string; createdAt: number }
  right: { id: string; label: string; createdAt: number }
  lines: DiffLine[]
  sideBySideRows: SideBySideRow[]
}

export function RevisionHistoryPanel({ onClose }: RevisionHistoryPanelProps) {
  const activeId = useAtomValue(activeDocumentIdAtom)
  const activeDocument = useAtomValue(activeDocumentAtom)
  const setActiveDocument = useSetAtom(activeDocumentAtom)
  const setDocuments = useSetAtom(documentsAtom)
  const [revisions, setRevisions] = useState<DocumentRevision[]>([])
  const [loading, setLoading] = useState(true)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [compareLoading, setCompareLoading] = useState(false)
  const [versionAId, setVersionAId] = useState(CURRENT_REVISION_ID)
  const [versionBId, setVersionBId] = useState(CURRENT_REVISION_ID)
  const [compareState, setCompareState] = useState<CompareState | null>(null)
  const [viewMode, setViewMode] = useState<DiffViewMode>('split')
  const [changesOnly, setChangesOnly] = useState(false)

  const compareOptions = useMemo(
    () =>
      buildRevisionCompareOptions(revisions, activeDocument?.updatedAt ?? Date.now()),
    [activeDocument?.updatedAt, revisions],
  )

  useEffect(() => {
    if (!activeId) {
      setRevisions([])
      setLoading(false)
      return
    }

    setLoading(true)
    void listDocumentRevisions(activeId, 30)
      .then(setRevisions)
      .catch(() => setRevisions([]))
      .finally(() => setLoading(false))
  }, [activeId])

  useEffect(() => {
    setCompareState(null)
    setVersionAId(revisions[1]?.id ?? CURRENT_REVISION_ID)
    setVersionBId(CURRENT_REVISION_ID)
    setChangesOnly(false)
  }, [activeId, revisions])

  async function loadRevisionText(revisionId: string): Promise<string> {
    if (!activeDocument) return ''

    if (revisionId === CURRENT_REVISION_ID) {
      return tiptapToPlainText(activeDocument.contentJson)
    }

    const detail = await getDocumentRevision(revisionId)
    return tiptapToPlainText(detail.contentJson)
  }

  async function runCompare(nextAId: string, nextBId: string) {
    if (!activeDocument) return

    if (nextAId === nextBId) {
      toast.error('Vyberte dve rôzne verzie')
      return
    }

    const { olderId, newerId } = normalizeComparePair(
      nextAId,
      nextBId,
      revisions,
      activeDocument.updatedAt,
    )

    setCompareLoading(true)
    try {
      const [olderText, newerText] = await Promise.all([
        loadRevisionText(olderId),
        loadRevisionText(newerId),
      ])

      const olderOption = findRevisionOption(olderId, compareOptions)
      const newerOption = findRevisionOption(newerId, compareOptions)
      if (!olderOption || !newerOption) return

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
        lines: diffLines(olderText, newerText),
        sideBySideRows: diffSideBySide(olderText, newerText),
      })
      setVersionAId(olderId)
      setVersionBId(newerId)
    } catch {
      toast.error('Porovnanie verzií zlyhalo')
    } finally {
      setCompareLoading(false)
    }
  }

  async function handleRestore(revision: DocumentRevision) {
    const confirmed = await confirm(
      `Obnoviť verziu „${revision.title}" z ${formatRelativeTime(revision.createdAt)}? Aktuálny obsah bude nahradený.`,
      { title: 'Obnoviť verziu', kind: 'warning', okLabel: 'Obnoviť', cancelLabel: 'Zrušiť' },
    )
    if (!confirmed) return

    setRestoringId(revision.id)
    try {
      const restored = cacheDocument(await restoreDocumentRevision(revision.id))
      setActiveDocument(restored)
      setDocuments((prev) =>
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
      )
      toast.success('Verzia obnovená', formatRelativeTime(revision.createdAt))
      setCompareState(null)
    } catch {
      toast.error('Obnovenie verzie zlyhalo')
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

  const canCompare = compareOptions.length >= 2 && versionAId !== versionBId

  function formatVersionLabel(option: (typeof compareOptions)[number]) {
    return `${option.label} · ${formatRelativeTime(option.createdAt)}`
  }

  return (
    <EditorSidePanel
      width={compareState ? 560 : 300}
      className="titlebar-no-drag"
    >
      <EditorSidePanelHeader
        title="História verzií"
        subtitle="Automaticky uložené verzie dokumentu"
        actions={
          <Button variant="ghost" size="sm" onClick={onClose}>
            Zavrieť
          </Button>
        }
      />

      {!loading && compareOptions.length >= 2 && (
        <section className="border-b border-[var(--color-border)] px-3.5 pb-3.5 pt-2.5">
          <p className="m-0 mb-2.5 text-[11px] font-bold uppercase tracking-[0.04em] text-[var(--color-muted-foreground)]">
            Porovnať verzie
          </p>
          <div className="rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5">
            <div className="grid gap-2.5">
              <div className="grid gap-1">
                <label htmlFor="revision-version-a" className="text-[11px] font-medium text-[var(--color-muted-foreground)]">
                  Verzia A
                </label>
                <Select value={versionAId} onValueChange={setVersionAId}>
                  <SelectTrigger id="revision-version-a" aria-label="Verzia A">
                    <SelectValue placeholder="Vyberte verziu A" />
                  </SelectTrigger>
                  <SelectContent>
                    {compareOptions.map((option) => (
                      <SelectItem key={`a-${option.id}`} value={option.id} textValue={formatVersionLabel(option)}>
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

              <div className="grid gap-1">
                <label htmlFor="revision-version-b" className="text-[11px] font-medium text-[var(--color-muted-foreground)]">
                  Verzia B
                </label>
                <Select value={versionBId} onValueChange={setVersionBId}>
                  <SelectTrigger id="revision-version-b" aria-label="Verzia B">
                    <SelectValue placeholder="Vyberte verziu B" />
                  </SelectTrigger>
                  <SelectContent>
                    {compareOptions.map((option) => (
                      <SelectItem key={`b-${option.id}`} value={option.id} textValue={formatVersionLabel(option)}>
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
              {compareLoading ? 'Porovnávam…' : 'Porovnať'}
            </Button>
          </div>
        </section>
      )}

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2.5">
        {loading && <p className="px-2 py-3 text-[12px] leading-relaxed text-[var(--color-muted-foreground)]">Načítavam verzie…</p>}
        {!loading && revisions.length === 0 && (
          <p className="px-2 py-3 text-[12px] leading-relaxed text-[var(--color-muted-foreground)]">
            Zatiaľ žiadne uložené verzie. Verzie sa vytvárajú pri každom uložení dokumentu.
          </p>
        )}
        {!loading &&
          revisions.map((revision) => {
            const isSelectedA = versionAId === revision.id
            const isSelectedB = versionBId === revision.id

            return (
              <div
                key={revision.id}
                className={cn(
                  'flex flex-col gap-2.5 rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-elevated)] p-2.5',
                  (isSelectedA || isSelectedB) &&
                    'border-[var(--color-selection-strong)] bg-[color-mix(in_srgb,var(--color-selection)_35%,var(--color-surface-elevated))]',
                )}
              >
                <div className="flex min-w-0 items-start gap-2">
                  <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-50" />
                  <div className="min-w-0">
                    <p className="m-0 truncate text-[12px] font-semibold">{revision.title}</p>
                    <p className="mt-0.5 text-[11px] text-[var(--color-muted-foreground)]">
                      {formatRelativeTime(revision.createdAt)}
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
                    vs aktuálna
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={restoringId === revision.id}
                    onClick={() => void handleRestore(revision)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {restoringId === revision.id ? 'Obnovujem…' : 'Obnoviť'}
                  </Button>
                </div>
              </div>
            )
          })}
      </div>

      {compareState && (
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
          onViewModeChange={setViewMode}
          onChangesOnlyChange={setChangesOnly}
          onClose={() => setCompareState(null)}
        />
      )}
    </EditorSidePanel>
  )
}
