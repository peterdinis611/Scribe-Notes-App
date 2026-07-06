import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { ArrowDownLeft, ArrowUpRight, FileText, Link2, PanelRightClose, RotateCcw } from 'lucide-react'
import { listBacklinks, listOutgoingLinks, type DocumentSummary } from '@/lib/db/api'
import { ROUTES } from '@/lib/routes'
import { toast } from '@/lib/toast'
import { formatRelativeTime } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setActiveDocumentId } from '@/store/documentsSlice'
import {
  EditorSidePanel,
  EditorSidePanelEmpty,
  EditorSidePanelHeader,
  EditorSidePanelIconButton,
  EditorSidePanelList,
} from '@/components/editor/EditorSidePanelPrimitives'

type BacklinksPanelProps = {
  onClose: () => void
}

function countLabel(count: number): string {
  if (count === 1) return 'dokument'
  if (count > 1 && count < 5) return 'dokumenty'
  return 'dokumentov'
}

export function BacklinksPanel({ onClose }: BacklinksPanelProps) {
  const activeId = useAppSelector((state) => state.documents.activeDocumentId)
  const dispatch = useAppDispatch()
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
      dispatch(setActiveDocumentId(id))
      navigate(ROUTES.document(id))
    },
    [dispatch, navigate],
  )

  const renderList = (docs: DocumentSummary[], emptyText: string) => {
    if (docs.length === 0) {
      return <p className="m-0 mt-0.5 text-[11.5px] text-[var(--color-muted-foreground)]">{emptyText}</p>
    }
    return docs.map((doc) => (
      <button
        key={doc.id}
        type="button"
        className="flex w-full items-center gap-2.5 rounded-[9px] border border-transparent bg-transparent px-2.5 py-2 text-left transition-[background,border-color] duration-120 hover:border-[var(--color-border)] hover:bg-[var(--color-surface-elevated)]"
        onClick={() => handleOpen(doc.id)}
        title={doc.title}
      >
        <FileText className="h-4 w-4 shrink-0 opacity-60" />
        <span className="flex min-w-0 flex-col gap-px">
          <span className="truncate text-[12.5px] font-medium text-[var(--color-foreground)]">
            {doc.title || 'Bez názvu'}
          </span>
          <span className="text-[10.5px] text-[var(--color-muted-foreground)]">
            {formatRelativeTime(doc.updatedAt)}
          </span>
        </span>
      </button>
    ))
  }

  const total = backlinks.length + outgoing.length

  return (
    <EditorSidePanel className="titlebar-no-drag" aria-label="Prepojenia">
      <EditorSidePanelHeader
        title="Prepojenia"
        subtitle={total === 0 ? 'Žiadne prepojenia' : `${total} ${countLabel(total)}`}
        actions={
          <div className="inline-flex gap-0.5">
            <EditorSidePanelIconButton title="Obnoviť" onClick={() => setReloadKey((value) => value + 1)}>
              <RotateCcw className="h-4 w-4" />
            </EditorSidePanelIconButton>
            <EditorSidePanelIconButton aria-label="Skryť prepojenia" onClick={onClose}>
              <PanelRightClose className="h-4 w-4" />
            </EditorSidePanelIconButton>
          </div>
        }
      />

      {loading && total === 0 ? (
        <EditorSidePanelEmpty>Načítavam…</EditorSidePanelEmpty>
      ) : total === 0 ? (
        <EditorSidePanelEmpty>
          <Link2 className="h-5 w-5 opacity-40" />
          Žiadne prepojenia. Napíšte{' '}
          <code className="rounded bg-[var(--color-hover)] px-1 text-[11px]">[[</code> a prepojte dokumenty.
        </EditorSidePanelEmpty>
      ) : (
        <EditorSidePanelList className="gap-1">
          <div>
            <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-foreground)]">
              <ArrowDownLeft className="h-3.5 w-3.5" />
              Odkazy sem
              <span className="ml-auto rounded-full bg-[var(--color-hover)] px-1.5 text-[10px] font-semibold">
                {backlinks.length}
              </span>
            </h3>
            {renderList(backlinks, 'Zatiaľ sem neodkazuje žiadny dokument.')}
          </div>

          <div className="mt-3.5 border-t border-[var(--color-border)] pt-3">
            <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-foreground)]">
              <ArrowUpRight className="h-3.5 w-3.5" />
              Odkazy odtiaľto
              <span className="ml-auto rounded-full bg-[var(--color-hover)] px-1.5 text-[10px] font-semibold">
                {outgoing.length}
              </span>
            </h3>
            {renderList(outgoing, 'Tento dokument zatiaľ na nič neodkazuje.')}
          </div>
        </EditorSidePanelList>
      )}
    </EditorSidePanel>
  )
}
