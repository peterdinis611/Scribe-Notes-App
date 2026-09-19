import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Background,
  BackgroundVariant,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
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
import { openUrl } from '@tauri-apps/plugin-opener'
import { Link2, Minus, Plus, Square, Trash2, ZoomIn, ZoomOut, Download } from 'lucide-react'
import '@xyflow/react/dist/style.css'
import { CanvasNoteActions, CanvasNoteNode } from '@/components/canvas/CanvasNoteNode'
import {
  canvasEdgesToFlow,
  cardsToNodes,
  createNoteNode,
  flowToCanvasDocument,
  type CanvasNoteData,
} from '@/lib/canvas/flow'
import { emptyCanvasDocument, parseCanvasDocument, serializeCanvasDocument } from '@/lib/canvas/types'
import { cacheDocument, hashContent } from '@/lib/cache/document-cache'
import { flushPendingWrites, updateDocument } from '@/lib/db/api'
import { applyDiskPersistResult } from '@/lib/disk-sync'
import { toast } from '@/lib/toast'
import { cn, debounce } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setActiveDocument, setSaveStatus, updateDocuments } from '@/store/documentsSlice'
import { isOpenLibraryDocumentId } from '@/lib/trash-document'
import { store } from '@/store/index'

const AUTO_SAVE_DELAY_MS = 600
const nodeTypes: NodeTypes = { note: CanvasNoteNode }

const defaultEdgeOptions = {
  type: 'smoothstep' as const,
  animated: false,
}

function CanvasFlow() {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const { screenToFlowPosition, zoomIn, zoomOut, setViewport, deleteElements } =
    useReactFlow()
  const viewport = useViewport()
  const activeDocument = useAppSelector((state) => state.documents.activeDocument)
  const activeId = useAppSelector((state) => state.documents.activeDocumentId)

  const [nodes, setNodes] = useState<Node<CanvasNoteData>[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [linkMode, setLinkMode] = useState(false)
  const [linkFromId, setLinkFromId] = useState<string | null>(null)
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
    setNodes(cardsToNodes(parsed.cards))
    setEdges(canvasEdgesToFlow(parsed.edges))
    setLinkMode(false)
    setLinkFromId(null)
    lastPersistedHashRef.current = hashContent(serializeCanvasDocument(parsed))
  }, [activeDocument?.id])

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
      debounce((docId: string, nextNodes: Node<CanvasNoteData>[], nextEdges: Edge[]) => {
        void persistContent(docId, serializeCanvasDocument(flowToCanvasDocument(nextNodes, nextEdges)))
      }, AUTO_SAVE_DELAY_MS),
    [persistContent],
  )

  const commitFlow = useCallback(
    (nextNodes: Node<CanvasNoteData>[], nextEdges: Edge[]) => {
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
    (changes: NodeChange<Node<CanvasNoteData>>[]) => {
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
      setLinkMode(false)
    },
    [commitFlow],
  )

  const isValidConnection = useCallback<IsValidConnection>(
    (connection) => Boolean(connection.source && connection.target && connection.source !== connection.target),
    [],
  )

  const addCardAt = useCallback(
    (position: { x: number; y: number }) => {
      const node = createNoteNode(position)
      setNodes((current) => {
        const next = [...current, node]
        commitFlow(next, edgesRef.current)
        return next
      })
      setLinkFromId(null)
      setLinkMode(false)
    },
    [commitFlow],
  )

  const handleNoteText = useCallback(
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

  const noteActions = useMemo(() => ({ onTextChange: handleNoteText }), [handleNoteText])

  const selectedCount = nodes.filter((node) => node.selected).length + edges.filter((edge) => edge.selected).length

  async function deleteSelected() {
    const selectedNodes = nodes.filter((node) => node.selected)
    const selectedEdges = edges.filter((edge) => edge.selected)
    if (selectedNodes.length === 0 && selectedEdges.length === 0) return
    await deleteElements({ nodes: selectedNodes, edges: selectedEdges })
    setLinkFromId(null)
    setLinkMode(false)
  }

  if (!activeId || !activeDocument) {
    return (
      <div className="editor-shell">
        <div className="flex flex-1 items-center justify-center text-sm text-[var(--color-muted-foreground)]">
          {t('editor.loading')}
        </div>
      </div>
    )
  }

  return (
    <div className="editor-shell canvas-shell">
      <div className="canvas-toolbar" role="toolbar" aria-label={t('canvas.toolbar')}>
        <button
          type="button"
          className="canvas-toolbar-btn"
          onClick={() => {
            const rect = surfaceRef.current?.getBoundingClientRect()
            addCardAt(
              screenToFlowPosition({
                x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
                y: rect ? rect.top + rect.height / 2 : window.innerHeight / 2,
              }),
            )
          }}
          title={t('canvas.addCard')}
        >
          <Square className="h-3.5 w-3.5" />
          <span>{t('canvas.addCard')}</span>
        </button>
        <button
          type="button"
          className={cn('canvas-toolbar-btn', linkMode && 'is-active')}
          onClick={() => {
            setLinkMode((prev) => {
              const next = !prev
              if (!next) setLinkFromId(null)
              return next
            })
          }}
          title={t('canvas.linkCards')}
        >
          <Link2 className="h-3.5 w-3.5" />
          <span>{t('canvas.linkCards')}</span>
        </button>
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
            toast.success('Canvas exported as SVG')
          }}
          title="Export Canvas SVG"
        >
          <Download className="h-3.5 w-3.5" />
          <span>Export SVG</span>
        </button>
        <div className="canvas-toolbar-spacer" />
        <button
          type="button"
          className="canvas-toolbar-btn canvas-toolbar-btn--icon"
          onClick={() => void zoomOut()}
          title={t('canvas.zoomOut')}
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="canvas-toolbar-btn canvas-toolbar-btn--icon"
          onClick={() => void setViewport({ x: 0, y: 0, zoom: 1 })}
          title={t('canvas.resetView')}
        >
          <Minus className="h-3.5 w-3.5" />
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="canvas-toolbar-btn canvas-toolbar-btn--icon"
          onClick={() => void zoomIn()}
          title={t('canvas.zoomIn')}
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </button>
        <span className="canvas-toolbar-meta">{Math.round(viewport.zoom * 100)}%</span>
      </div>

      <CanvasNoteActions.Provider value={noteActions}>
        <div ref={surfaceRef} className="canvas-surface canvas-surface--flow">
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
            proOptions={{ hideAttribution: true }}
            onNodeClick={(_event, node) => {
              if (!linkMode) return
              if (!linkFromId) {
                setLinkFromId(node.id)
                return
              }
              if (linkFromId === node.id) return
              onConnect({ source: linkFromId, target: node.id, sourceHandle: null, targetHandle: null })
            }}
            onDoubleClick={(event) => {
              if ((event.target as HTMLElement).closest('.react-flow__node, .canvas-card, textarea')) {
                return
              }
              addCardAt(screenToFlowPosition({ x: event.clientX, y: event.clientY }))
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
              nodeColor="var(--color-accent)"
            />
            <Panel position="bottom-left" className="canvas-flow-credit">
              <button
                type="button"
                onClick={() => {
                  void openUrl('https://reactflow.dev/').catch(() => undefined)
                }}
              >
                React Flow
              </button>
            </Panel>
          </ReactFlow>

          {nodes.length === 0 && (
            <div className="canvas-empty-hint">
              <p>{t('canvas.emptyHint')}</p>
            </div>
          )}

          {(linkMode || linkFromId) && (
            <div className="canvas-link-banner" role="status">
              {linkFromId ? t('canvas.linkPickTarget') : t('canvas.linkPickSource')}
            </div>
          )}
        </div>
      </CanvasNoteActions.Provider>
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
