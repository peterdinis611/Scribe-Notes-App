import { useCallback, useEffect, useState } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { useNavigate } from '@tanstack/react-router'
import { ArrowDownLeft, ArrowUpRight, FileText, Link2, PanelRightClose, RotateCcw } from 'lucide-react'
import { listBacklinks, listOutgoingLinks, type DocumentSummary } from '@/lib/db/api'
import { ROUTES } from '@/lib/routes'
import { toast } from '@/lib/toast'
import { formatRelativeTime } from '@/lib/utils'
import { activeDocumentIdAtom } from '@/store/documents'

type BacklinksPanelProps = {
  onClose: () => void
}

function countLabel(count: number): string {
  if (count === 1) return 'dokument'
  if (count > 1 && count < 5) return 'dokumenty'
  return 'dokumentov'
}

export function BacklinksPanel({ onClose }: BacklinksPanelProps) {
  const activeId = useAtomValue(activeDocumentIdAtom)
  const setActiveId = useSetAtom(activeDocumentIdAtom)
  const navigate = useNavigate()
  const [backlinks, setBacklinks] = useState<DocumentSummary[]>([])
  const [outgoing, setOutgoing] = useState<DocumentSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    if (!activeId) {
      setBacklinks([])
      setOutgoing([])
      return
    }
    setLoading(true)
    Promise.all([listBacklinks(activeId), listOutgoingLinks(activeId)])
      .then(([incoming, outbound]) => {
        if (cancelled) return
        setBacklinks(incoming)
        setOutgoing(outbound)
      })
      .catch((error) => {
        if (!cancelled) toast.error('Nepodarilo sa načítať odkazy', String(error))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [activeId, reloadKey])

  const handleOpen = useCallback(
    (id: string) => {
      setActiveId(id)
      navigate(ROUTES.document(id))
    },
    [navigate, setActiveId],
  )

  const renderList = (docs: DocumentSummary[], emptyText: string) => {
    if (docs.length === 0) {
      return <p className="backlinks-section-empty">{emptyText}</p>
    }
    return docs.map((doc) => (
      <button
        key={doc.id}
        type="button"
        className="backlink-item"
        onClick={() => handleOpen(doc.id)}
        title={doc.title}
      >
        <FileText className="h-4 w-4 shrink-0 opacity-60" />
        <span className="backlink-item-body">
          <span className="backlink-item-title">{doc.title || 'Bez názvu'}</span>
          <span className="backlink-item-time">{formatRelativeTime(doc.updatedAt)}</span>
        </span>
      </button>
    ))
  }

  const total = backlinks.length + outgoing.length

  return (
    <aside className="backlinks-panel titlebar-no-drag" aria-label="Prepojenia">
      <div className="backlinks-panel-header">
        <div>
          <h2 className="backlinks-panel-title">Prepojenia</h2>
          <p className="backlinks-panel-subtitle">
            {total === 0 ? 'Žiadne prepojenia' : `${total} ${countLabel(total)}`}
          </p>
        </div>
        <div className="backlinks-panel-header-actions">
          <button
            type="button"
            className="comments-panel-icon-btn"
            title="Obnoviť"
            onClick={() => setReloadKey((value) => value + 1)}
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="comments-panel-icon-btn"
            aria-label="Skryť prepojenia"
            onClick={onClose}
          >
            <PanelRightClose className="h-4 w-4" />
          </button>
        </div>
      </div>

      {loading && total === 0 ? (
        <p className="comments-panel-empty">Načítavam…</p>
      ) : total === 0 ? (
        <p className="comments-panel-empty">
          <Link2 className="h-5 w-5 opacity-40" />
          Žiadne prepojenia. Napíšte <code>[[</code> a prepojte dokumenty.
        </p>
      ) : (
        <div className="backlinks-panel-list">
          <div className="backlinks-section">
            <h3 className="backlinks-section-title">
              <ArrowDownLeft className="h-3.5 w-3.5" />
              Odkazy sem
              <span className="backlinks-section-count">{backlinks.length}</span>
            </h3>
            {renderList(backlinks, 'Zatiaľ sem neodkazuje žiadny dokument.')}
          </div>

          <div className="backlinks-section">
            <h3 className="backlinks-section-title">
              <ArrowUpRight className="h-3.5 w-3.5" />
              Odkazy odtiaľto
              <span className="backlinks-section-count">{outgoing.length}</span>
            </h3>
            {renderList(outgoing, 'Tento dokument zatiaľ na nič neodkazuje.')}
          </div>
        </div>
      )}
    </aside>
  )
}
