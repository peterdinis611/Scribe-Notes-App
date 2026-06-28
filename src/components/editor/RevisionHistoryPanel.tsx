import { useEffect, useState } from 'react'
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
import { diffLines } from '@/lib/revisions/diff-text'
import { formatRelativeTime } from '@/lib/utils'
import { toast } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import { activeDocumentAtom, activeDocumentIdAtom, documentsAtom } from '@/store/documents'

type RevisionHistoryPanelProps = {
  onClose: () => void
}

export function RevisionHistoryPanel({ onClose }: RevisionHistoryPanelProps) {
  const activeId = useAtomValue(activeDocumentIdAtom)
  const activeDocument = useAtomValue(activeDocumentAtom)
  const setActiveDocument = useSetAtom(activeDocumentAtom)
  const setDocuments = useSetAtom(documentsAtom)
  const [revisions, setRevisions] = useState<DocumentRevision[]>([])
  const [loading, setLoading] = useState(true)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [comparingId, setComparingId] = useState<string | null>(null)
  const [diffLoadingId, setDiffLoadingId] = useState<string | null>(null)
  const [compareRevision, setCompareRevision] = useState<DocumentRevision | null>(null)
  const [compareLines, setCompareLines] = useState<ReturnType<typeof diffLines> | null>(null)

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
    setCompareRevision(null)
    setCompareLines(null)
    setComparingId(null)
  }, [activeId])

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
      setCompareRevision(null)
      setCompareLines(null)
      setComparingId(null)
    } catch {
      toast.error('Obnovenie verzie zlyhalo')
    } finally {
      setRestoringId(null)
    }
  }

  async function handleCompare(revision: DocumentRevision) {
    if (!activeDocument) return

    if (comparingId === revision.id) {
      setCompareRevision(null)
      setCompareLines(null)
      setComparingId(null)
      return
    }

    setDiffLoadingId(revision.id)
    try {
      const detail = await getDocumentRevision(revision.id)
      const oldText = tiptapToPlainText(detail.contentJson)
      const newText = tiptapToPlainText(activeDocument.contentJson)
      setCompareRevision(revision)
      setCompareLines(diffLines(oldText, newText))
      setComparingId(revision.id)
    } catch {
      toast.error('Porovnanie verzií zlyhalo')
    } finally {
      setDiffLoadingId(null)
    }
  }

  return (
    <aside className="revision-panel titlebar-no-drag">
      <div className="revision-panel-header">
        <div>
          <h2 className="revision-panel-title">História verzií</h2>
          <p className="revision-panel-subtitle">Automaticky uložené verzie dokumentu</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Zavrieť
        </Button>
      </div>

      <div className="revision-panel-body">
        {loading && <p className="revision-panel-empty">Načítavam verzie…</p>}
        {!loading && revisions.length === 0 && (
          <p className="revision-panel-empty">
            Zatiaľ žiadne uložené verzie. Verzie sa vytvárajú pri každom uložení dokumentu.
          </p>
        )}
        {!loading &&
          revisions.map((revision) => (
            <div key={revision.id} className="revision-panel-item">
              <div className="revision-panel-item-main">
                <Clock className="h-3.5 w-3.5 shrink-0 opacity-50" />
                <div>
                  <p className="revision-panel-item-title">{revision.title}</p>
                  <p className="revision-panel-item-time">{formatRelativeTime(revision.createdAt)}</p>
                </div>
              </div>
              <div className="revision-panel-item-actions">
                <Button
                  variant={comparingId === revision.id ? 'default' : 'outline'}
                  size="sm"
                  disabled={diffLoadingId === revision.id}
                  onClick={() => void handleCompare(revision)}
                >
                  <GitCompare className="h-3.5 w-3.5" />
                  {diffLoadingId === revision.id
                    ? 'Načítavam…'
                    : comparingId === revision.id
                      ? 'Skryť'
                      : 'Porovnať'}
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
          ))}
      </div>

      {compareRevision && compareLines && (
        <RevisionDiffView
          revisionTitle={compareRevision.title}
          revisionCreatedAt={compareRevision.createdAt}
          lines={compareLines}
          onClose={() => {
            setCompareRevision(null)
            setCompareLines(null)
            setComparingId(null)
          }}
        />
      )}
    </aside>
  )
}
