import { useEffect, useState } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { Clock, RotateCcw } from 'lucide-react'
import { confirm } from '@tauri-apps/plugin-dialog'
import { cacheDocument } from '@/lib/cache/document-cache'
import {
  listDocumentRevisions,
  restoreDocumentRevision,
  type DocumentRevision,
} from '@/lib/db/api'
import { formatRelativeTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { activeDocumentAtom, activeDocumentIdAtom, documentsAtom } from '@/store/documents'

type RevisionHistoryPanelProps = {
  onClose: () => void
}

export function RevisionHistoryPanel({ onClose }: RevisionHistoryPanelProps) {
  const activeId = useAtomValue(activeDocumentIdAtom)
  const setActiveDocument = useSetAtom(activeDocumentAtom)
  const setDocuments = useSetAtom(documentsAtom)
  const [revisions, setRevisions] = useState<DocumentRevision[]>([])
  const [loading, setLoading] = useState(true)
  const [restoringId, setRestoringId] = useState<string | null>(null)

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
    } finally {
      setRestoringId(null)
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
          ))}
      </div>
    </aside>
  )
}
