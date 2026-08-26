import { useCallback, useEffect, useMemo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import {
  ArrowDownLeft,
  ArrowUpRight,
  FileText,
  GitFork,
  Link2,
  PanelRightClose,
  RotateCcw,
} from 'lucide-react'
import {
  listBacklinks,
  listLinkGraph,
  listOutgoingLinks,
  searchDocuments,
  type DocumentSummary,
  type LinkGraphEdge,
  type SearchHit,
} from '@/lib/db/api'
import { ROUTES } from '@/lib/routes'
import { toast } from '@/lib/toast'
import { cn, formatRelativeTime } from '@/lib/utils'
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

type MiniNode = { id: string; title: string; x: number; y: number }

function buildMiniNeighborhood(
  centerId: string,
  centerTitle: string,
  incoming: DocumentSummary[],
  outgoing: DocumentSummary[],
  size: number,
): { nodes: MiniNode[]; edges: Array<{ from: string; to: string }> } {
  const nodes: MiniNode[] = [
    { id: centerId, title: centerTitle, x: size / 2, y: size / 2 },
  ]
  const edges: Array<{ from: string; to: string }> = []
  const placed = new Set<string>([centerId])

  const neighbors = [
    ...incoming.map((doc) => ({ doc, direction: 'in' as const })),
    ...outgoing.map((doc) => ({ doc, direction: 'out' as const })),
  ].filter((item) => {
    if (placed.has(item.doc.id)) return false
    placed.add(item.doc.id)
    return true
  })

  const radius = size * 0.34
  neighbors.forEach((item, index) => {
    const angle = (index / Math.max(neighbors.length, 1)) * Math.PI * 2 - Math.PI / 2
    nodes.push({
      id: item.doc.id,
      title: item.doc.title,
      x: size / 2 + Math.cos(angle) * radius,
      y: size / 2 + Math.sin(angle) * radius,
    })
    if (item.direction === 'in') edges.push({ from: item.doc.id, to: centerId })
    else edges.push({ from: centerId, to: item.doc.id })
  })

  return { nodes, edges }
}

export function BacklinksPanel({ onClose }: BacklinksPanelProps) {
  const { t } = useTranslation()
  const activeId = useAppSelector((state) => state.documents.activeDocumentId)
  const activeTitle = useAppSelector((state) => state.documents.activeDocument?.title ?? '')
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const [backlinks, setBacklinks] = useState<DocumentSummary[]>([])
  const [outgoing, setOutgoing] = useState<DocumentSummary[]>([])
  const [unlinked, setUnlinked] = useState<SearchHit[]>([])
  const [graphEdges, setGraphEdges] = useState<LinkGraphEdge[]>([])
  const [loading, setLoading] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    if (!activeId) {
      setBacklinks([])
      setOutgoing([])
      setUnlinked([])
      setGraphEdges([])
      return
    }
    setLoading(true)
    const title = activeTitle.trim()
    Promise.all([
      listBacklinks(activeId),
      listOutgoingLinks(activeId),
      listLinkGraph(),
      title.length >= 2 ? searchDocuments(title, 24) : Promise.resolve([] as SearchHit[]),
    ])
      .then(([incoming, outbound, graph, hits]) => {
        if (cancelled) return
        setBacklinks(incoming)
        setOutgoing(outbound)
        setGraphEdges(graph.edges)
        const linkedIds = new Set(incoming.map((doc) => doc.id))
        setUnlinked(
          hits.filter(
            (hit) => hit.documentId !== activeId && !linkedIds.has(hit.documentId),
          ),
        )
      })
      .catch((error) => {
        if (!cancelled) toast.error(t('panels.backlinks.loadError'), String(error))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [activeId, activeTitle, reloadKey, t])

  const handleOpen = useCallback(
    (id: string) => {
      dispatch(setActiveDocumentId(id))
      navigate(ROUTES.document(id))
    },
    [dispatch, navigate],
  )

  const mini = useMemo(() => {
    if (!activeId) return null
    return buildMiniNeighborhood(
      activeId,
      activeTitle || t('common.untitled'),
      backlinks,
      outgoing,
      180,
    )
  }, [activeId, activeTitle, backlinks, outgoing, t])

  const openFullGraph = useCallback(() => {
    void navigate(ROUTES.graph({ around: true }))
  }, [navigate])

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
            {doc.title || t('common.untitled')}
          </span>
          <span className="text-[10.5px] text-[var(--color-muted-foreground)]">
            {formatRelativeTime(doc.updatedAt)}
          </span>
        </span>
      </button>
    ))
  }

  const total = backlinks.length + outgoing.length
  const relatedEdgeCount = useMemo(() => {
    if (!activeId) return 0
    return graphEdges.filter(
      (edge) => edge.sourceId === activeId || edge.targetId === activeId,
    ).length
  }, [activeId, graphEdges])

  return (
    <EditorSidePanel className="titlebar-no-drag" aria-label={t('panels.backlinks.title')}>
      <EditorSidePanelHeader
        title={t('panels.backlinks.title')}
        subtitle={
          total === 0
            ? t('panels.backlinks.subtitle')
            : `${t('panels.backlinks.subtitle')} · ${t('library.documentCount', { count: total })}`
        }
        actions={
          <div className="inline-flex gap-0.5">
            <EditorSidePanelIconButton
              title={t('panels.backlinks.openGraph')}
              onClick={openFullGraph}
            >
              <GitFork className="h-4 w-4" />
            </EditorSidePanelIconButton>
            <EditorSidePanelIconButton title={t('common.refresh')} onClick={() => setReloadKey((value) => value + 1)}>
              <RotateCcw className="h-4 w-4" />
            </EditorSidePanelIconButton>
            <EditorSidePanelIconButton aria-label={t('panels.backlinks.hide')} onClick={onClose}>
              <PanelRightClose className="h-4 w-4" />
            </EditorSidePanelIconButton>
          </div>
        }
      />

      {loading && total === 0 ? (
        <EditorSidePanelEmpty>{t('common.loading')}</EditorSidePanelEmpty>
      ) : total === 0 ? (
        <EditorSidePanelEmpty>
          <Link2 className="h-5 w-5 opacity-40" />
          <Trans
            i18nKey="panels.backlinks.emptyHint"
            components={{
              code: <code className="rounded bg-[var(--color-hover)] px-1 text-[11px]" />,
            }}
          />
        </EditorSidePanelEmpty>
      ) : (
        <EditorSidePanelList className="gap-1">
          {mini && mini.nodes.length > 1 && (
            <div className="mb-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2">
              <div className="mb-1.5 flex flex-col gap-0.5 px-0.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-foreground)]">
                    {t('panels.backlinks.neighborhood')}
                  </span>
                  <button
                    type="button"
                    className="text-[11px] font-medium text-[var(--color-accent)] hover:underline"
                    onClick={openFullGraph}
                  >
                    {t('panels.backlinks.openGraph')}
                  </button>
                </div>
                <p className="m-0 text-[10px] leading-snug text-[var(--color-muted-foreground)]">
                  {t('panels.backlinks.neighborhoodHint')}
                </p>
              </div>
              <svg viewBox="0 0 180 180" className="mx-auto block h-[160px] w-full" role="img" aria-label={t('panels.backlinks.neighborhood')}>
                {mini.edges.map((edge) => {
                  const from = mini.nodes.find((node) => node.id === edge.from)
                  const to = mini.nodes.find((node) => node.id === edge.to)
                  if (!from || !to) return null
                  return (
                    <line
                      key={`${edge.from}-${edge.to}`}
                      x1={from.x}
                      y1={from.y}
                      x2={to.x}
                      y2={to.y}
                      stroke="var(--color-border)"
                      strokeWidth={1.5}
                    />
                  )
                })}
                {mini.nodes.map((node) => {
                  const isCenter = node.id === activeId
                  return (
                    <g key={node.id}>
                      <circle
                        cx={node.x}
                        cy={node.y}
                        r={isCenter ? 10 : 7}
                        className={cn(
                          'cursor-pointer',
                          isCenter ? 'fill-[var(--color-accent)]' : 'fill-[var(--color-muted-foreground)]',
                        )}
                        opacity={isCenter ? 1 : 0.75}
                        onClick={() => !isCenter && handleOpen(node.id)}
                      >
                        <title>{node.title || t('common.untitled')}</title>
                      </circle>
                      <text
                        x={node.x}
                        y={node.y + (isCenter ? 22 : 18)}
                        textAnchor="middle"
                        className="fill-[var(--color-muted-foreground)] text-[8px]"
                      >
                        {(node.title || t('common.untitled')).slice(0, 14)}
                      </text>
                    </g>
                  )
                })}
              </svg>
              <p className="m-0 mt-1 text-center text-[10.5px] text-[var(--color-muted-foreground)]">
                {t('panels.backlinks.edgeSummary', { count: relatedEdgeCount || mini.edges.length })}
              </p>
            </div>
          )}

          <div>
            <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-foreground)]">
              <ArrowDownLeft className="h-3.5 w-3.5" />
              {t('panels.backlinks.incoming')}
              <span className="ml-auto rounded-full bg-[var(--color-hover)] px-1.5 text-[10px] font-semibold">
                {backlinks.length}
              </span>
            </h3>
            {renderList(backlinks, t('panels.backlinks.incomingEmpty'))}
          </div>

          <div className="mt-3.5 border-t border-[var(--color-border)] pt-3">
            <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-foreground)]">
              <ArrowUpRight className="h-3.5 w-3.5" />
              {t('panels.backlinks.outgoing')}
              <span className="ml-auto rounded-full bg-[var(--color-hover)] px-1.5 text-[10px] font-semibold">
                {outgoing.length}
              </span>
            </h3>
            {renderList(outgoing, t('panels.backlinks.outgoingEmpty'))}
          </div>

          <div className="mt-3.5 border-t border-[var(--color-border)] pt-3">
            <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.03em] text-[var(--color-muted-foreground)]">
              <Link2 className="h-3.5 w-3.5" />
              {t('panels.backlinks.unlinked')}
              <span className="ml-auto rounded-full bg-[var(--color-hover)] px-1.5 text-[10px] font-semibold">
                {unlinked.length}
              </span>
            </h3>
            <p className="m-0 mb-1.5 text-[10.5px] text-[var(--color-muted-foreground)]">
              {t('panels.backlinks.unlinkedHint')}
            </p>
            {unlinked.length === 0 ? (
              <p className="m-0 mt-0.5 text-[11.5px] text-[var(--color-muted-foreground)]">
                {t('panels.backlinks.unlinkedEmpty')}
              </p>
            ) : (
              unlinked.map((hit) => (
                <button
                  key={hit.documentId}
                  type="button"
                  className="flex w-full items-center gap-2.5 rounded-[9px] border border-transparent bg-transparent px-2.5 py-2 text-left transition-[background,border-color] duration-120 hover:border-[var(--color-border)] hover:bg-[var(--color-surface-elevated)]"
                  onClick={() => handleOpen(hit.documentId)}
                  title={hit.title}
                >
                  <FileText className="h-4 w-4 shrink-0 opacity-60" />
                  <span className="flex min-w-0 flex-col gap-px">
                    <span className="truncate text-[12.5px] font-medium text-[var(--color-foreground)]">
                      {hit.title || t('common.untitled')}
                    </span>
                    <span className="truncate text-[10.5px] text-[var(--color-muted-foreground)]">
                      {hit.snippet.replace(/<\/?mark>/g, '')}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </EditorSidePanelList>
      )}
    </EditorSidePanel>
  )
}
