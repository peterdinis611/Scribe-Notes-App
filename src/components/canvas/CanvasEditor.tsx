import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  useViewport,
  type Connection,
  type Edge,
  type EdgeChange,
  type IsValidConnection,
  type Node,
  type NodeChange,
  type NodeTypes,
} from '@xyflow/react'
import {
  Circle,
  Frame,
  Link2,
  Minus,
  MousePointer2,
  Plus,
  Square,
  StickyNote,
  Trash2,
  Type,
  ZoomIn,
  ZoomOut,
  Download,
  Layers,
  BringToFront,
  SendToBack,
} from 'lucide-react'
import '@xyflow/react/dist/style.css'
import { DocumentLoadingState } from '@/components/DocumentLoadingState'
import { CanvasFrameNode } from '@/components/canvas/CanvasFrameNode'
import { CanvasNoteNode } from '@/components/canvas/CanvasNoteNode'
import { CanvasObjectActions } from '@/components/canvas/CanvasObjectActions'
import { CanvasShapeNode } from '@/components/canvas/CanvasShapeNode'
import { CanvasTextNode } from '@/components/canvas/CanvasTextNode'
import {
  canvasEdgesToFlow,
  createObjectNode,
  flowToCanvasDocument,
  nextZIndex,
  objectsToNodes,
  type CanvasObjectData,
} from '@/lib/canvas/flow'
import {
  CANVAS_FILL_PRESETS,
  CANVAS_STROKE_PRESETS,
  emptyCanvasDocument,
  parseCanvasDocument,
  serializeCanvasDocument,
  type CanvasObjectKind,
} from '@/lib/canvas/types'
import { cacheDocument, hashContent } from '@/lib/cache/document-cache'
import { flushPendingWrites, updateDocument } from '@/lib/db/api'
import { applyDiskPersistResult } from '@/lib/disk-sync'
import { toast } from '@/lib/toast'
import { cn, debounce } from '@/lib/utils'
import { IconTooltip } from '@/components/ui/tooltip'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setActiveDocument, setSaveStatus, updateDocuments } from '@/store/documentsSlice'
import { isOpenLibraryDocumentId } from '@/lib/trash-document'
import { store } from '@/store/index'

const AUTO_SAVE_DELAY_MS = 600

type CanvasTool = 'select' | 'link' | CanvasObjectKind

const nodeTypes: NodeTypes = {
  note: CanvasNoteNode,
  frame: CanvasFrameNode,
  rect: CanvasShapeNode,
  ellipse: CanvasShapeNode,
  text: CanvasTextNode,
}

const defaultEdgeOptions = {
  type: 'smoothstep' as const,
  animated: false,
}

const PLACE_TOOLS: CanvasObjectKind[] = ['note', 'frame', 'rect', 'ellipse', 'text']

function kindLabelKey(kind: CanvasObjectKind): string {
  switch (kind) {
    case 'note':
      return 'canvas.toolNote'
    case 'frame':
      return 'canvas.toolFrame'
    case 'rect':
      return 'canvas.toolRect'
    case 'ellipse':
      return 'canvas.toolEllipse'
    case 'text':
      return 'canvas.toolText'
  }
}

function CanvasFlow() {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const { screenToFlowPosition, zoomIn, zoomOut, setViewport, deleteElements, fitView } =
    useReactFlow()
  const viewport = useViewport()
  const activeDocument = useAppSelector((state) => state.documents.activeDocument)
  const activeId = useAppSelector((state) => state.documents.activeDocumentId)

  const [nodes, setNodes] = useState<Node<CanvasObjectData>[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [tool, setTool] = useState<CanvasTool>('select')
  const [linkFromId, setLinkFromId] = useState<string | null>(null)
  const [layersOpen, setLayersOpen] = useState(true)
  const surfaceRef = useRef<HTMLDivElement | null>(null)

  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  const titleRef = useRef(activeDocument?.title ?? '')
  const lastPersistedHashRef = useRef<string | null>(null)
  const latestDocIdRef = useRef<string | null>(activeId)

  nodesRef.current = nodes
  edgesRef.current = edges
  titleRef.current = activeDocument?.title ?? ''
  latestDocIdRef.current = activeId

  useEffect(() => {
    if (!activeDocument) return
    const parsed = parseCanvasDocument(activeDocument.contentJson) ?? emptyCanvasDocument()
    setNodes(objectsToNodes(parsed.objects))
    setEdges(canvasEdgesToFlow(parsed.edges))
    setTool('select')
    setLinkFromId(null)
    lastPersistedHashRef.current = hashContent(serializeCanvasDocument(parsed))
    if (parsed.viewport) {
      void setViewport(parsed.viewport)
    }
  }, [activeDocument?.id, setViewport])

  const persistContent = useCallback(
    async (docId: string, contentJson: string) => {
      if (!isOpenLibraryDocumentId(store.getState().documents.documents, docId)) {
        return false
      }
      const contentHash = hashContent(contentJson)
      if (contentHash === lastPersistedHashRef.current) return true

      try {
        dispatch(setSaveStatus('saving'))
        const updated = cacheDocument(
          await updateDocument({
            id: docId,
            title: titleRef.current || t('canvas.defaultTitle'),
            contentJson,
          }),
        )
        if (!isOpenLibraryDocumentId(store.getState().documents.documents, docId)) {
          return false
        }
        if (latestDocIdRef.current === docId) {
          lastPersistedHashRef.current = contentHash
          dispatch(setActiveDocument(updated))
          dispatch(setSaveStatus('saved'))
        }
        dispatch(
          updateDocuments((prev) =>
            prev.map((item) =>
              item.id === updated.id
                ? {
                    ...item,
                    title: updated.title,
                    filePath: updated.filePath,
                    updatedAt: updated.updatedAt,
                  }
                : item,
            ),
          ),
        )
        try {
          const result = await flushPendingWrites(docId)
          applyDiskPersistResult(dispatch, result)
        } catch {
          // Disk flush is best-effort after save.
        }
        return true
      } catch (error) {
        if (latestDocIdRef.current === docId) {
          dispatch(setSaveStatus('error'))
        }
        toast.error(t('toasts.saveError'), String(error))
        return false
      }
    },
    [dispatch, t],
  )

  const queueSave = useMemo(
    () =>
      debounce((docId: string, nextNodes: Node<CanvasObjectData>[], nextEdges: Edge[]) => {
        void persistContent(docId, serializeCanvasDocument(flowToCanvasDocument(nextNodes, nextEdges)))
      }, AUTO_SAVE_DELAY_MS),
    [persistContent],
  )

  const commitFlow = useCallback(
    (nextNodes: Node<CanvasObjectData>[], nextEdges: Edge[]) => {
      if (activeId) {
        dispatch(setSaveStatus('dirty'))
        queueSave(activeId, nextNodes, nextEdges)
      }
    },
    [activeId, dispatch, queueSave],
  )

  useEffect(() => {
    return () => {
      queueSave.cancel()
      const id = latestDocIdRef.current
      if (!id) return
      const contentJson = serializeCanvasDocument(
        flowToCanvasDocument(nodesRef.current, edgesRef.current),
      )
      if (hashContent(contentJson) === lastPersistedHashRef.current) return
      void persistContent(id, contentJson)
    }
  }, [persistContent, queueSave])

  const onNodesChange = useCallback(
    (changes: NodeChange<Node<CanvasObjectData>>[]) => {
      setNodes((current) => {
        const next = applyNodeChanges(changes, current)
        const structural = changes.some((change) => change.type !== 'select')
        if (structural) commitFlow(next, edgesRef.current)
        return next
      })
    },
    [commitFlow],
  )

  const onEdgesChange = useCallback(
    (changes: EdgeChange<Edge>[]) => {
      setEdges((current) => {
        const next = applyEdgeChanges(changes, current)
        const structural = changes.some((change) => change.type !== 'select')
        if (structural) commitFlow(nodesRef.current, next)
        return next
      })
    },
    [commitFlow],
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((current) => {
        const next = addEdge({ ...connection, type: 'smoothstep' }, current)
        commitFlow(nodesRef.current, next)
        return next
      })
      setLinkFromId(null)
      setTool('select')
    },
    [commitFlow],
  )

  const isValidConnection = useCallback<IsValidConnection>(
    (connection) => Boolean(connection.source && connection.target && connection.source !== connection.target),
    [],
  )

  const placeObjectAt = useCallback(
    (kind: CanvasObjectKind, position: { x: number; y: number }) => {
      const node = createObjectNode(kind, position, nextZIndex(nodesRef.current))
      setNodes((current) => {
        const next = [...current.map((n) => ({ ...n, selected: false })), { ...node, selected: true }]
        commitFlow(next, edgesRef.current)
        return next
      })
      setLinkFromId(null)
      setTool('select')
    },
    [commitFlow],
  )

  const patchSelected = useCallback(
    (patch: Partial<CanvasObjectData>) => {
      setNodes((current) => {
        const next = current.map((node) =>
          node.selected
            ? {
                ...node,
                data: { ...node.data, ...patch },
              }
            : node,
        )
        commitFlow(next, edgesRef.current)
        return next
      })
    },
    [commitFlow],
  )

  const handleTextChange = useCallback(
    (id: string, text: string) => {
      setNodes((current) => {
        const next = current.map((node) =>
          node.id === id ? { ...node, data: { ...node.data, text } } : node,
        )
        commitFlow(next, edgesRef.current)
        return next
      })
    },
    [commitFlow],
  )

  const handleLabelChange = useCallback(
    (id: string, label: string) => {
      setNodes((current) => {
        const next = current.map((node) =>
          node.id === id ? { ...node, data: { ...node.data, label } } : node,
        )
        commitFlow(next, edgesRef.current)
        return next
      })
    },
    [commitFlow],
  )

  const objectActions = useMemo(
    () => ({ onTextChange: handleTextChange, onLabelChange: handleLabelChange }),
    [handleTextChange, handleLabelChange],
  )

  const selectedNodes = nodes.filter((node) => node.selected)
  const selectedCount =
    selectedNodes.length + edges.filter((edge) => edge.selected).length
  const primarySelected = selectedNodes.length === 1 ? selectedNodes[0] : null

  const layers = useMemo(
    () =>
      [...nodes].sort(
        (a, b) => (b.data.zIndex ?? b.zIndex ?? 0) - (a.data.zIndex ?? a.zIndex ?? 0),
      ),
    [nodes],
  )

  function selectNode(id: string) {
    setNodes((current) =>
      current.map((node) => ({ ...node, selected: node.id === id })),
    )
    setTool('select')
  }

  function reorderSelected(direction: 'front' | 'back') {
    if (selectedNodes.length === 0) return
    const selectedIds = new Set(selectedNodes.map((n) => n.id))
    setNodes((current) => {
      const zs = current.map((n) => n.data.zIndex ?? n.zIndex ?? 0)
      const extreme = direction === 'front' ? Math.max(...zs) + 1 : Math.min(...zs) - 1
      const next = current.map((node) => {
        if (!selectedIds.has(node.id)) return node
        return {
          ...node,
          zIndex: extreme,
          style: { ...node.style, zIndex: extreme },
          data: { ...node.data, zIndex: extreme },
        }
      })
      commitFlow(next, edgesRef.current)
      return next
    })
  }

  async function deleteSelected() {
    const selectedNodeList = nodes.filter((node) => node.selected)
    const selectedEdgeList = edges.filter((edge) => edge.selected)
    if (selectedNodeList.length === 0 && selectedEdgeList.length === 0) return
    await deleteElements({ nodes: selectedNodeList, edges: selectedEdgeList })
    setLinkFromId(null)
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return
      }
      if (event.key === 'v' || event.key === 'V') setTool('select')
      if (event.key === 'f' || event.key === 'F') setTool('frame')
      if (event.key === 'r' || event.key === 'R') setTool('rect')
      if (event.key === 'o' || event.key === 'O') setTool('ellipse')
      if (event.key === 't' || event.key === 'T') setTool('text')
      if (event.key === 'n' || event.key === 'N') setTool('note')
      if (event.key === 'l' || event.key === 'L') {
        setTool('link')
        setLinkFromId(null)
      }
      if (event.key === 'Escape') {
        setTool('select')
        setLinkFromId(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  if (!activeId || !activeDocument) {
    return (
      <div className="editor-shell">
        <DocumentLoadingState label={t('editor.loading')} />
      </div>
    )
  }

  const placing = PLACE_TOOLS.includes(tool as CanvasObjectKind)

  return (
    <div className="editor-shell canvas-shell">
      <div className="canvas-toolbar" role="toolbar" aria-label={t('canvas.toolbar')}>
        <div className="canvas-tool-rail" role="group" aria-label={t('canvas.tools')}>
          <IconTooltip label={t('canvas.toolSelect')}>
            <button
              type="button"
              className={cn('canvas-toolbar-btn canvas-toolbar-btn--icon', tool === 'select' && 'is-active')}
              onClick={() => {
                setTool('select')
                setLinkFromId(null)
              }}
              aria-label={t('canvas.toolSelect')}
            >
              <MousePointer2 className="h-3.5 w-3.5" />
            </button>
          </IconTooltip>
          <IconTooltip label={t('canvas.toolNote')}>
            <button
              type="button"
              className={cn('canvas-toolbar-btn canvas-toolbar-btn--icon', tool === 'note' && 'is-active')}
              onClick={() => setTool('note')}
              aria-label={t('canvas.toolNote')}
            >
              <StickyNote className="h-3.5 w-3.5" />
            </button>
          </IconTooltip>
          <IconTooltip label={t('canvas.toolFrame')}>
            <button
              type="button"
              className={cn('canvas-toolbar-btn canvas-toolbar-btn--icon', tool === 'frame' && 'is-active')}
              onClick={() => setTool('frame')}
              aria-label={t('canvas.toolFrame')}
            >
              <Frame className="h-3.5 w-3.5" />
            </button>
          </IconTooltip>
          <IconTooltip label={t('canvas.toolRect')}>
            <button
              type="button"
              className={cn('canvas-toolbar-btn canvas-toolbar-btn--icon', tool === 'rect' && 'is-active')}
              onClick={() => setTool('rect')}
              aria-label={t('canvas.toolRect')}
            >
              <Square className="h-3.5 w-3.5" />
            </button>
          </IconTooltip>
          <IconTooltip label={t('canvas.toolEllipse')}>
            <button
              type="button"
              className={cn('canvas-toolbar-btn canvas-toolbar-btn--icon', tool === 'ellipse' && 'is-active')}
              onClick={() => setTool('ellipse')}
              aria-label={t('canvas.toolEllipse')}
            >
              <Circle className="h-3.5 w-3.5" />
            </button>
          </IconTooltip>
          <IconTooltip label={t('canvas.toolText')}>
            <button
              type="button"
              className={cn('canvas-toolbar-btn canvas-toolbar-btn--icon', tool === 'text' && 'is-active')}
              onClick={() => setTool('text')}
              aria-label={t('canvas.toolText')}
            >
              <Type className="h-3.5 w-3.5" />
            </button>
          </IconTooltip>
          <IconTooltip label={t('canvas.linkCards')}>
            <button
              type="button"
              className={cn('canvas-toolbar-btn canvas-toolbar-btn--icon', tool === 'link' && 'is-active')}
              onClick={() => {
                setTool((prev) => (prev === 'link' ? 'select' : 'link'))
                setLinkFromId(null)
              }}
              aria-label={t('canvas.linkCards')}
            >
              <Link2 className="h-3.5 w-3.5" />
            </button>
          </IconTooltip>
        </div>

        <button
          type="button"
          className="canvas-toolbar-btn"
          disabled={selectedCount === 0}
          onClick={() => void deleteSelected()}
          title={t('canvas.deleteSelected')}
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span>{t('canvas.deleteSelected')}</span>
        </button>
        <IconTooltip label={t('canvas.bringFront')}>
          <button
            type="button"
            className="canvas-toolbar-btn canvas-toolbar-btn--icon"
            disabled={selectedNodes.length === 0}
            onClick={() => reorderSelected('front')}
            aria-label={t('canvas.bringFront')}
          >
            <BringToFront className="h-3.5 w-3.5" />
          </button>
        </IconTooltip>
        <IconTooltip label={t('canvas.sendBack')}>
          <button
            type="button"
            className="canvas-toolbar-btn canvas-toolbar-btn--icon"
            disabled={selectedNodes.length === 0}
            onClick={() => reorderSelected('back')}
            aria-label={t('canvas.sendBack')}
          >
            <SendToBack className="h-3.5 w-3.5" />
          </button>
        </IconTooltip>
        <button
          type="button"
          className={cn('canvas-toolbar-btn', layersOpen && 'is-active')}
          onClick={() => setLayersOpen((prev) => !prev)}
          title={t('canvas.layers')}
        >
          <Layers className="h-3.5 w-3.5" />
          <span>{t('canvas.layers')}</span>
        </button>
        <button
          type="button"
          className="canvas-toolbar-btn"
          onClick={() => {
            const el = surfaceRef.current
            if (!el) return
            const svgData = `<svg xmlns="http://www.w3.org/2000/svg" width="${el.clientWidth}" height="${el.clientHeight}"><foreignObject width="100%" height="100%">${new XMLSerializer().serializeToString(el)}</foreignObject></svg>`
            const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
            const url = URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = `${activeDocument?.title || 'canvas'}.svg`
            link.click()
            URL.revokeObjectURL(url)
            toast.success(t('canvas.exportedSvg'))
          }}
          title={t('canvas.exportSvg')}
        >
          <Download className="h-3.5 w-3.5" />
          <span>{t('canvas.exportSvg')}</span>
        </button>
        <div className="canvas-toolbar-spacer" />
        <IconTooltip label={t('canvas.zoomOut')}>
          <button
            type="button"
            className="canvas-toolbar-btn canvas-toolbar-btn--icon"
            onClick={() => void zoomOut()}
            aria-label={t('canvas.zoomOut')}
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
        </IconTooltip>
        <IconTooltip label={t('canvas.resetView')}>
          <button
            type="button"
            className="canvas-toolbar-btn canvas-toolbar-btn--icon"
            onClick={() => void fitView({ padding: 0.2 })}
            aria-label={t('canvas.resetView')}
          >
            <Minus className="h-3.5 w-3.5" />
            <Plus className="h-3.5 w-3.5" />
          </button>
        </IconTooltip>
        <IconTooltip label={t('canvas.zoomIn')}>
          <button
            type="button"
            className="canvas-toolbar-btn canvas-toolbar-btn--icon"
            onClick={() => void zoomIn()}
            aria-label={t('canvas.zoomIn')}
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
        </IconTooltip>
        <span className="canvas-toolbar-meta">{Math.round(viewport.zoom * 100)}%</span>
      </div>

      {primarySelected && (
        <div className="canvas-props" role="group" aria-label={t('canvas.properties')}>
          <span className="canvas-props-kind">{t(kindLabelKey(primarySelected.data.kind))}</span>
          <div className="canvas-props-group">
            <span className="canvas-props-label">{t('canvas.fill')}</span>
            <div className="canvas-swatches">
              {CANVAS_FILL_PRESETS.map((fill) => (
                <button
                  key={fill}
                  type="button"
                  className={cn(
                    'canvas-swatch',
                    primarySelected.data.fill === fill && 'is-active',
                  )}
                  style={{ background: fill === 'transparent' ? 'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50% / 8px 8px' : fill }}
                  onClick={() => patchSelected({ fill })}
                  aria-label={t('canvas.fill')}
                />
              ))}
            </div>
          </div>
          <div className="canvas-props-group">
            <span className="canvas-props-label">{t('canvas.stroke')}</span>
            <div className="canvas-swatches">
              {CANVAS_STROKE_PRESETS.map((stroke) => (
                <button
                  key={stroke}
                  type="button"
                  className={cn(
                    'canvas-swatch canvas-swatch--stroke',
                    primarySelected.data.stroke === stroke && 'is-active',
                  )}
                  style={{ borderColor: stroke, background: 'var(--color-surface)' }}
                  onClick={() => patchSelected({ stroke })}
                  aria-label={t('canvas.stroke')}
                />
              ))}
            </div>
          </div>
          {(primarySelected.data.kind === 'text' || primarySelected.data.kind === 'note') && (
            <div className="canvas-props-group">
              <span className="canvas-props-label">{t('canvas.fontSize')}</span>
              <input
                type="range"
                min={12}
                max={48}
                step={1}
                value={primarySelected.data.fontSize || 14}
                onChange={(event) => patchSelected({ fontSize: Number(event.target.value) })}
                className="canvas-props-range"
              />
              <span className="canvas-toolbar-meta">{primarySelected.data.fontSize || 14}</span>
            </div>
          )}
        </div>
      )}

      <CanvasObjectActions.Provider value={objectActions}>
        <div
          ref={surfaceRef}
          className={cn(
            'canvas-surface canvas-surface--flow',
            placing && 'is-placing',
            tool === 'link' && 'is-linking',
          )}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            defaultEdgeOptions={defaultEdgeOptions}
            minZoom={0.35}
            maxZoom={2.5}
            snapToGrid
            snapGrid={[16, 16]}
            deleteKeyCode={['Backspace', 'Delete']}
            zoomOnDoubleClick={false}
            panOnDrag={tool === 'select' || tool === 'link' ? [1] : true}
            selectionOnDrag={tool === 'select'}
            selectionMode={SelectionMode.Partial}
            nodesDraggable={tool === 'select'}
            elementsSelectable={tool === 'select' || tool === 'link'}
            proOptions={{ hideAttribution: true }}
            onPaneClick={(event) => {
              if (placing) {
                placeObjectAt(tool as CanvasObjectKind, screenToFlowPosition({
                  x: event.clientX,
                  y: event.clientY,
                }))
              }
            }}
            onNodeClick={(_event, node) => {
              if (tool !== 'link') return
              if (!linkFromId) {
                setLinkFromId(node.id)
                return
              }
              if (linkFromId === node.id) return
              onConnect({ source: linkFromId, target: node.id, sourceHandle: null, targetHandle: null })
            }}
            onDoubleClick={(event) => {
              if (tool !== 'select') return
              if ((event.target as HTMLElement).closest('.react-flow__node, .canvas-card, .canvas-shape, .canvas-frame, .canvas-text-node, textarea, input')) {
                return
              }
              placeObjectAt('note', screenToFlowPosition({ x: event.clientX, y: event.clientY }))
            }}
          >
            <Background
              id="scribe-dots"
              variant={BackgroundVariant.Dots}
              gap={22}
              size={1.4}
              color="var(--color-separator)"
            />
            <MiniMap
              pannable
              zoomable
              className="canvas-minimap"
              maskColor="color-mix(in srgb, var(--color-canvas) 72%, transparent)"
              nodeColor={(node) => {
                const data = node.data as CanvasObjectData | undefined
                if (data?.kind === 'frame') return 'var(--color-border)'
                if (data?.kind === 'text') return 'var(--color-foreground)'
                return 'var(--color-accent)'
              }}
            />
          </ReactFlow>

          {nodes.length === 0 && (
            <div className="canvas-empty-hint">
              <p>{t('canvas.emptyHint')}</p>
            </div>
          )}

          {(tool === 'link' || linkFromId) && (
            <div className="canvas-link-banner" role="status">
              {linkFromId ? t('canvas.linkPickTarget') : t('canvas.linkPickSource')}
            </div>
          )}

          {placing && (
            <div className="canvas-place-banner" role="status">
              {t('canvas.placeHint', { tool: t(kindLabelKey(tool as CanvasObjectKind)) })}
            </div>
          )}

          {layersOpen && (
            <aside className="canvas-layers" aria-label={t('canvas.layers')}>
              <header className="canvas-layers-head">
                <span>{t('canvas.layers')}</span>
                <span className="canvas-toolbar-meta">{nodes.length}</span>
              </header>
              <ul className="canvas-layers-list">
                {layers.length === 0 ? (
                  <li className="canvas-layers-empty">{t('canvas.layersEmpty')}</li>
                ) : (
                  layers.map((node) => {
                    const kind = node.data.kind
                    const title =
                      kind === 'frame'
                        ? node.data.label || t('canvas.frameDefault')
                        : node.data.text.trim() || t(kindLabelKey(kind))
                    return (
                      <li key={node.id}>
                        <button
                          type="button"
                          className={cn('canvas-layers-item', node.selected && 'is-active')}
                          onClick={() => selectNode(node.id)}
                        >
                          <span className="canvas-layers-kind">{t(kindLabelKey(kind))}</span>
                          <span className="canvas-layers-title">{title}</span>
                        </button>
                      </li>
                    )
                  })
                )}
              </ul>
            </aside>
          )}
        </div>
      </CanvasObjectActions.Provider>
    </div>
  )
}

export function CanvasEditor() {
  return (
    <ReactFlowProvider>
      <CanvasFlow />
    </ReactFlowProvider>
  )
}
