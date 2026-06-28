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
import { cn } from '@/lib/utils'
import { activeDocumentAtom, activeDocumentIdAtom, documentsAtom } from '@/store/documents'

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

  return (
    <aside className={cn('revision-panel titlebar-no-drag', compareState && 'revision-panel--compare')}>
      <div className="revision-panel-header">
        <div>
          <h2 className="revision-panel-title">História verzií</h2>
          <p className="revision-panel-subtitle">Automaticky uložené verzie dokumentu</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Zavrieť
        </Button>
      </div>

      {!loading && compareOptions.length >= 2 && (
        <section className="revision-compare-controls">
          <p className="revision-compare-label">Porovnať verzie</p>
          <div className="revision-compare-selects">
            <label className="revision-compare-field">
              <span>Verzia A</span>
              <select
                value={versionAId}
                onChange={(event) => setVersionAId(event.target.value)}
              >
                {compareOptions.map((option) => (
                  <option key={`a-${option.id}`} value={option.id}>
                    {option.label} · {formatRelativeTime(option.createdAt)}
                  </option>
                ))}
              </select>
            </label>
            <label className="revision-compare-field">
              <span>Verzia B</span>
              <select
                value={versionBId}
                onChange={(event) => setVersionBId(event.target.value)}
              >
                {compareOptions.map((option) => (
                  <option key={`b-${option.id}`} value={option.id}>
                    {option.label} · {formatRelativeTime(option.createdAt)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <Button
            variant="default"
            size="sm"
            className="revision-compare-run"
            disabled={!canCompare || compareLoading}
            onClick={() => void runCompare(versionAId, versionBId)}
          >
            <GitCompare className="h-3.5 w-3.5" />
            {compareLoading ? 'Porovnávam…' : 'Porovnať'}
          </Button>
        </section>
      )}

      <div className="revision-panel-body">
        {loading && <p className="revision-panel-empty">Načítavam verzie…</p>}
        {!loading && revisions.length === 0 && (
          <p className="revision-panel-empty">
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
                  'revision-panel-item',
                  (isSelectedA || isSelectedB) && 'revision-panel-item--selected',
                )}
              >
                <div className="revision-panel-item-main">
                  <Clock className="h-3.5 w-3.5 shrink-0 opacity-50" />
                  <div>
                    <p className="revision-panel-item-title">{revision.title}</p>
                    <p className="revision-panel-item-time">{formatRelativeTime(revision.createdAt)}</p>
                  </div>
                </div>

                <div className="revision-panel-item-tags">
                  {isSelectedA && <span className="revision-panel-tag">A</span>}
                  {isSelectedB && <span className="revision-panel-tag">B</span>}
                </div>

                <div className="revision-panel-item-actions">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSelectVersion(revision.id, 'a')}
                  >
                    A
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleSelectVersion(revision.id, 'b')}
                  >
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
    </aside>
  )
}
