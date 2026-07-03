import { useCallback, useEffect, useState } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'
import { useNavigate } from '@tanstack/react-router'
import { FileText, Link2, PanelRightClose, RotateCcw } from 'lucide-react'
import { listBacklinks, type DocumentSummary } from '@/lib/db/api'
import { ROUTES } from '@/lib/routes'
import { toast } from '@/lib/toast'
import { formatRelativeTime } from '@/lib/utils'
import { activeDocumentIdAtom } from '@/store/documents'

type BacklinksPanelProps = {
  onClose: () => void
}

export function BacklinksPanel({ onClose }: BacklinksPanelProps) {
  const activeId = useAtomValue(activeDocumentIdAtom)
  const setActiveId = useSetAtom(activeDocumentIdAtom)
  const navigate = useNavigate()
  const [links, setLinks] = useState<DocumentSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    if (!activeId) {
      setLinks([])
      return
    }
    setLoading(true)
    listBacklinks(activeId)
      .then((result) => {
        if (!cancelled) setLinks(result)
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

  return (
    <aside className="backlinks-panel titlebar-no-drag" aria-label="Odkazy sem">
      <div className="backlinks-panel-header">
        <div>
          <h2 className="backlinks-panel-title">Odkazy sem</h2>
          <p className="backlinks-panel-subtitle">
            {links.length === 0
              ? 'Žiadne prepojenia'
              : `${links.length} ${links.length === 1 ? 'dokument' : links.length < 5 ? 'dokumenty' : 'dokumentov'}`}
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
            aria-label="Skryť odkazy"
            onClick={onClose}
          >
            <PanelRightClose className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="backlinks-panel-list">
        {loading && links.length === 0 ? (
          <p className="comments-panel-empty">Načítavam…</p>
        ) : links.length === 0 ? (
          <p className="comments-panel-empty">
            <Link2 className="h-5 w-5 opacity-40" />
            Zatiaľ sem neodkazuje žiadny dokument. Napíšte <code>[[</code> a prepojte dokumenty.
          </p>
        ) : (
          links.map((doc) => (
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
        )}
      </div>
    </aside>
  )
}
