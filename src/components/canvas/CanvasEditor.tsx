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
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceAround,
  ArrowRight,
  BringToFront,
  Circle,
  Copy,
  Download,
  FilePlus,
  FileText,
  Frame,
  Group,
  Hand,
  ImageDown,
  Layers,
  LayoutTemplate,
  Link2,
  Minus,
  MousePointer2,
  MoveHorizontal,
  Pencil,
  Plus,
  SendToBack,
  Sparkles,
  Square,
  StickyNote,
  Trash2,
  Type,
  Ungroup,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import '@xyflow/react/dist/style.css'
import { DocumentLoadingState } from '@/components/DocumentLoadingState'
import { CanvasDocLinkNode } from '@/components/canvas/CanvasDocLinkNode'
import { CanvasFrameNode } from '@/components/canvas/CanvasFrameNode'
import { CanvasLineNode } from '@/components/canvas/CanvasLineNode'
import { CanvasNoteNode } from '@/components/canvas/CanvasNoteNode'
import { CanvasObjectActions } from '@/components/canvas/CanvasObjectActions'
import { CanvasPenNode } from '@/components/canvas/CanvasPenNode'
import { CanvasShapeNode } from '@/components/canvas/CanvasShapeNode'
import { CanvasTextNode } from '@/components/canvas/CanvasTextNode'
import { alignNodes, type AlignMode } from '@/lib/canvas/align'
import { logCanvasAudit } from '@/lib/canvas/audit'
import { openTiptapFromCanvasSelection } from '@/lib/canvas/create-canvas'
import {
  buildClipboardPayload,
  createCanvasHistory,
  parseClipboardPayload,
} from '@/lib/canvas/history'
import {
  absolutePosition,
  canvasEdgesToFlow,
  createObjectNode,
  flowToCanvasDocument,
  nextZIndex,
  objectToNode,
  objectsToNodes,
  type CanvasObjectData,
} from '@/lib/canvas/flow'
import { snapNodePosition, type SnapGuide } from '@/lib/canvas/snap'
import { buildCanvasTemplate, type CanvasTemplateId } from '@/lib/canvas/templates'
import {
  CANVAS_FILL_PRESETS,
  CANVAS_STROKE_PRESETS,
  canvasObjectsToPlainText,
  createCanvasObject,
  emptyCanvasDocument,
  parseCanvasDocument,
  serializeCanvasDocument,
  type CanvasObjectKind,
  type CanvasPoint,
} from '@/lib/canvas/types'
import { cacheDocument, hashContent } from '@/lib/cache/document-cache'
import { flushPendingWrites, updateDocument } from '@/lib/db/api'
import { nlpExtractTakeaways } from '@/lib/db/nlp-api'
import { applyDiskPersistResult } from '@/lib/disk-sync'
import { toast } from '@/lib/toast'
import { cn, debounce } from '@/lib/utils'
import { IconTooltip } from '@/components/ui/tooltip'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setActiveDocument, setSaveStatus, updateDocuments } from '@/store/documentsSlice'
import { isOpenLibraryDocumentId } from '@/lib/trash-document'
import { store } from '@/store/index'
import { useNavigate } from '@tanstack/react-router'

const AUTO_SAVE_DELAY_MS = 600
const GRID = 16

type CanvasTool = 'select' | 'hand' | 'link' | 'docLink' | 'pen' | CanvasObjectKind

const nodeTypes: NodeTypes = {
  note: CanvasNoteNode,
  frame: CanvasFrameNode,
  rect: CanvasShapeNode,
  ellipse: CanvasShapeNode,
  text: CanvasTextNode,
  line: CanvasLineNode,
  arrow: CanvasLineNode,
  docLink: CanvasDocLinkNode,
  pen: CanvasPenNode,
}

const defaultEdgeOptions = {
  type: 'smoothstep' as const,
  animated: false,
}

const PLACE_TOOLS: CanvasObjectKind[] = [
  'note',
  'frame',
  'rect',
  'ellipse',
  'text',
  'line',
  'arrow',
]

const DRAG_CREATE_TOOLS = new Set<CanvasObjectKind>([
  'frame',
  'rect',
  'ellipse',
  'line',
  'arrow',
])

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
    case 'line':
      return 'canvas.toolLine'
    case 'arrow':
      return 'canvas.toolArrow'
    case 'docLink':
      return 'canvas.toolDocLink'
    case 'pen':
      return 'canvas.toolPen'
  }
}

function CanvasFlow() {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { screenToFlowPosition, zoomIn, zoomOut, setViewport, deleteElements, fitView } =
    useReactFlow()
  const viewport = useViewport()
  const activeDocument = useAppSelector((state) => state.documents.activeDocument)
  const activeId = useAppSelector((state) => state.documents.activeDocumentId)
  const libraryDocs = useAppSelector((state) => state.documents.documents)

  const [nodes, setNodes] = useState<Node<CanvasObjectData>[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [tool, setTool] = useState<CanvasTool>('select')
  const [linkFromId, setLinkFromId] = useState<string | null>(null)
  const [layersOpen, setLayersOpen] = useState(true)
  const [docPickerOpen, setDocPickerOpen] = useState(false)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const [spacePan, setSpacePan] = useState(false)
  const [takeawaysBusy, setTakeawaysBusy] = useState(false)
  const [snapGuides, setSnapGuides] = useState<SnapGuide[]>([])
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const penStrokeRef = useRef<{ points: CanvasPoint[]; nodeId: string } | null>(null)
  const historyRef = useRef(createCanvasHistory())
  const dragCreateRef = useRef<{
    kind: CanvasObjectKind
    start: { x: number; y: number }
    nodeId: string
  } | null>(null)
  const draggingRef = useRef(false)

  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  const viewportRef = useRef(viewport)
  const titleRef = useRef(activeDocument?.title ?? '')
  const lastPersistedHashRef = useRef<string | null>(null)
  const latestDocIdRef = useRef<string | null>(activeId)

  nodesRef.current = nodes
  edgesRef.current = edges
  viewportRef.current = viewport
  titleRef.current = activeDocument?.title ?? ''
  latestDocIdRef.current = activeId

  const serializeCurrent = useCallback(
    (nextNodes: Node<CanvasObjectData>[], nextEdges: Edge[]) =>
      serializeCanvasDocument(
        flowToCanvasDocument(nextNodes, nextEdges, {
          x: viewportRef.current.x,
          y: viewportRef.current.y,
          zoom: viewportRef.current.zoom,
        }),
      ),
    [],
  )

  useEffect(() => {
    if (!activeDocument) return
    const parsed = parseCanvasDocument(activeDocument.contentJson) ?? emptyCanvasDocument()
    const nextNodes = objectsToNodes(parsed.objects)
    const nextEdges = canvasEdgesToFlow(parsed.edges)
    setNodes(nextNodes)
    setEdges(nextEdges)
    historyRef.current.reset({ nodes: nextNodes, edges: nextEdges })
    setTool('select')
    setLinkFromId(null)
    setDocPickerOpen(false)
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
        void persistContent(docId, serializeCurrent(nextNodes, nextEdges))
      }, AUTO_SAVE_DELAY_MS),
    [persistContent, serializeCurrent],
  )

  const commitFlow = useCallback(
    (nextNodes: Node<CanvasObjectData>[], nextEdges: Edge[], opts?: { history?: boolean }) => {
      if (opts?.history !== false) {
        historyRef.current.commit({ nodes: nextNodes, edges: nextEdges })
      } else {
        historyRef.current.sync({ nodes: nextNodes, edges: nextEdges })
      }
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
      const contentJson = serializeCurrent(nodesRef.current, edgesRef.current)
      if (hashContent(contentJson) === lastPersistedHashRef.current) return
      void persistContent(id, contentJson)
    }
  }, [persistContent, queueSave, serializeCurrent])

  const onNodesChange = useCallback(
    (changes: NodeChange<Node<CanvasObjectData>>[]) => {
      const isDrag = changes.some((c) => c.type === 'position' && 'dragging' in c && c.dragging)
      const dragEnd = changes.some((c) => c.type === 'position' && 'dragging' in c && c.dragging === false)
      if (isDrag && !draggingRef.current) {
        draggingRef.current = true
        historyRef.current.commit({ nodes: nodesRef.current, edges: edgesRef.current })
      }
      setNodes((current) => {
        const next = applyNodeChanges(changes, current)
        const structural = changes.some((change) => change.type !== 'select')
        if (dragEnd) {
          draggingRef.current = false
          commitFlow(next, edgesRef.current, { history: false })
        } else if (structural && isDrag) {
          historyRef.current.sync({ nodes: next, edges: edgesRef.current })
          if (activeId) {
            dispatch(setSaveStatus('dirty'))
            queueSave(activeId, next, edgesRef.current)
          }
        } else if (structural) {
          commitFlow(next, edgesRef.current)
        }
        return next
      })
    },
    [activeId, commitFlow, dispatch, queueSave],
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
    (
      kind: CanvasObjectKind,
      position: { x: number; y: number },
      extras?: Parameters<typeof createObjectNode>[3],
    ) => {
      const node = createObjectNode(kind, position, nextZIndex(nodesRef.current), extras)
      setNodes((current) => {
        const next = [...current.map((n) => ({ ...n, selected: false })), { ...node, selected: true }]
        commitFlow(next, edgesRef.current)
        return next
      })
      setLinkFromId(null)
      setTool('select')
      return node.id
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
                style: {
                  ...node.style,
                  ...(patch.opacity != null ? { opacity: patch.opacity } : {}),
                },
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
    setNodes((current) => {
      const target = current.find((n) => n.id === id)
      const groupId = target?.data.groupId
      if (groupId) {
        return current.map((node) => ({
          ...node,
          selected: node.id === id || node.data.groupId === groupId,
        }))
      }
      return current.map((node) => ({ ...node, selected: node.id === id }))
    })
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

  function applyAlign(mode: AlignMode) {
    const ids = new Set(selectedNodes.map((n) => n.id))
    if (ids.size < 2) return
    setNodes((current) => {
      const next = alignNodes(current, ids, mode)
      commitFlow(next, edgesRef.current)
      return next
    })
  }

  function groupSelected() {
    if (selectedNodes.length < 2) return
    const groupId = crypto.randomUUID()
    const ids = new Set(selectedNodes.map((n) => n.id))
    setNodes((current) => {
      const next = current.map((node) =>
        ids.has(node.id) ? { ...node, data: { ...node.data, groupId } } : node,
      )
      commitFlow(next, edgesRef.current)
      return next
    })
  }

  function ungroupSelected() {
    const ids = new Set(selectedNodes.map((n) => n.id))
    if (ids.size === 0) return
    setNodes((current) => {
      const next = current.map((node) =>
        ids.has(node.id) ? { ...node, data: { ...node.data, groupId: '' } } : node,
      )
      commitFlow(next, edgesRef.current)
      return next
    })
  }

  async function deleteSelected() {
    const selectedNodeList = nodes.filter((node) => node.selected)
    const selectedEdgeList = edges.filter((edge) => edge.selected)
    if (selectedNodeList.length === 0 && selectedEdgeList.length === 0) return
    await deleteElements({ nodes: selectedNodeList, edges: selectedEdgeList })
    void logCanvasAudit('canvas_object_delete', 'Deleted canvas selection', {
      documentId: activeId,
      count: selectedNodeList.length,
    })
    setLinkFromId(null)
  }

  function applyHistorySnapshot(snapshot: { nodes: Node<CanvasObjectData>[]; edges: Edge[] } | null) {
    if (!snapshot) return
    setNodes(snapshot.nodes)
    setEdges(snapshot.edges)
    if (activeId) {
      dispatch(setSaveStatus('dirty'))
      queueSave(activeId, snapshot.nodes, snapshot.edges)
    }
  }

  function duplicateSelected() {
    if (selectedNodes.length === 0) return
    const z = nextZIndex(nodesRef.current)
    const clones = selectedNodes.map((node, index) => {
      const w = node.width ?? 160
      const h = node.height ?? 120
      const clone = createObjectNode(
        node.data.kind,
        {
          x: node.position.x + w / 2 + 24,
          y: node.position.y + h / 2 + 24,
        },
        z + index,
        {
          w,
          h,
          documentId: node.data.documentId,
          documentTitle: node.data.documentTitle,
        },
      )
      return {
        ...clone,
        selected: true,
        data: {
          ...clone.data,
          ...node.data,
          zIndex: z + index,
          groupId: '',
        },
      }
    })
    setNodes((current) => {
      const next = [
        ...current.map((n) => ({ ...n, selected: false })),
        ...clones,
      ]
      commitFlow(next, edgesRef.current)
      return next
    })
  }

  async function copySelected() {
    if (selectedNodes.length === 0) return
    const payload = buildClipboardPayload(selectedNodes)
    try {
      await navigator.clipboard.writeText(payload)
      toast.success(t('canvas.copied'))
    } catch {
      toast.error(t('canvas.copyFailed'))
    }
  }

  async function pasteClipboard() {
    try {
      const raw = await navigator.clipboard.readText()
      const objects = parseClipboardPayload(raw)
      if (!objects?.length) return
      const z = nextZIndex(nodesRef.current)
      const clones = objects.map((obj, index) => {
        const node = createObjectNode(
          obj.kind,
          { x: obj.x + obj.w / 2 + 32, y: obj.y + obj.h / 2 + 32 },
          z + index,
          {
            w: obj.w,
            h: obj.h,
            x: obj.x + 32,
            y: obj.y + 32,
            documentId: obj.documentId,
            documentTitle: obj.documentTitle,
          },
        )
        return {
          ...node,
          selected: true,
          data: {
            ...node.data,
            text: obj.text,
            label: obj.label,
            fill: obj.fill,
            stroke: obj.stroke,
            strokeWidth: obj.strokeWidth,
            fontSize: obj.fontSize,
            color: obj.color,
            opacity: obj.opacity,
            cornerRadius: obj.cornerRadius,
            rotation: obj.rotation,
            groupId: '',
            documentId: obj.documentId,
            documentTitle: obj.documentTitle,
            zIndex: z + index,
          },
        }
      })
      setNodes((current) => {
        const next = [...current.map((n) => ({ ...n, selected: false })), ...clones]
        commitFlow(next, edgesRef.current)
        return next
      })
    } catch {
      // ignore clipboard errors
    }
  }

  async function extractTakeaways() {
    const texts = selectedNodes
      .filter((n) => n.data.kind === 'note' || n.data.kind === 'text')
      .map((n) => n.data.text.trim())
      .filter(Boolean)
    if (texts.length === 0) {
      toast.error(t('canvas.takeawaysNeedText'))
      return
    }
    setTakeawaysBusy(true)
    try {
      const result = await nlpExtractTakeaways({ text: texts.join('\n\n'), limit: 8 })
      const items = result.takeaways ?? []
      if (items.length === 0) {
        toast.error(t('canvas.takeawaysEmpty'))
        return
      }
      const anchor = selectedNodes[0]
      const baseX = (anchor?.position.x ?? 0) + (anchor?.width ?? 200) + 40
      const baseY = anchor?.position.y ?? 0
      const z = nextZIndex(nodesRef.current)
      const newNodes = items.map((item, index) => {
        const node = createObjectNode('note', { x: baseX + 100, y: baseY + index * 140 + 60 }, z + index)
        return {
          ...node,
          selected: true,
          data: { ...node.data, text: item.text, zIndex: z + index },
        }
      })
      setNodes((current) => {
        const next = [...current.map((n) => ({ ...n, selected: false })), ...newNodes]
        commitFlow(next, edgesRef.current)
        return next
      })
      toast.success(t('canvas.takeawaysAdded', { count: items.length }))
    } catch (error) {
      toast.error(t('canvas.takeawaysFailed'), String(error))
    } finally {
      setTakeawaysBusy(false)
    }
  }

  function exportPlainText() {
    const doc = flowToCanvasDocument(nodesRef.current, edgesRef.current)
    const source =
      selectedNodes.length > 0
        ? doc.objects.filter((o) => selectedNodes.some((n) => n.id === o.id))
        : doc.objects
    const text = canvasObjectsToPlainText(source)
    if (!text) {
      toast.error(t('canvas.exportTextEmpty'))
      return
    }
    void navigator.clipboard.writeText(text).then(
      () => toast.success(t('canvas.exportedText')),
      () => toast.error(t('canvas.copyFailed')),
    )
  }

  function insertDocLink(docId: string, title: string) {
    const rect = surfaceRef.current?.getBoundingClientRect()
    placeObjectAt(
      'docLink',
      screenToFlowPosition({
        x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
        y: rect ? rect.top + rect.height / 2 : window.innerHeight / 2,
      }),
      { documentId: docId, documentTitle: title },
    )
    setDocPickerOpen(false)
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return
      }
      const meta = event.metaKey || event.ctrlKey
      if (event.code === 'Space' && !event.repeat) {
        event.preventDefault()
        setSpacePan(true)
        return
      }
      if (meta && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) applyHistorySnapshot(historyRef.current.redo())
        else applyHistorySnapshot(historyRef.current.undo())
        return
      }
      if (meta && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        duplicateSelected()
        return
      }
      if (meta && event.key.toLowerCase() === 'c') {
        event.preventDefault()
        void copySelected()
        return
      }
      if (meta && event.key.toLowerCase() === 'v') {
        event.preventDefault()
        void pasteClipboard()
        return
      }
      if (!meta) {
        if (event.key === 'v' || event.key === 'V') setTool('select')
        if (event.key === 'h' || event.key === 'H') setTool('hand')
        if (event.key === 'f' || event.key === 'F') setTool('frame')
        if (event.key === 'r' || event.key === 'R') setTool('rect')
        if (event.key === 'o' || event.key === 'O') setTool('ellipse')
        if (event.key === 't' || event.key === 'T') setTool('text')
        if (event.key === 'n' || event.key === 'N') setTool('note')
        if (event.key === 'a' || event.key === 'A') setTool('arrow')
        if (event.key === 'p' || event.key === 'P') setTool('pen')
        if (event.key === 'l' || event.key === 'L') {
          setTool('link')
          setLinkFromId(null)
        }
      }
      if (event.key === 'Escape') {
        setTool('select')
        setLinkFromId(null)
        setDocPickerOpen(false)
        setNodes((current) => current.map((n) => ({ ...n, selected: false })))
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        const selected = nodesRef.current.filter((n) => n.selected)
        if (selected.length === 0) return
        event.preventDefault()
        const step = event.shiftKey ? GRID : 1
        const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
        const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
        setNodes((current) => {
          const next = current.map((node) =>
            node.selected
              ? {
                  ...node,
                  position: { x: node.position.x + dx, y: node.position.y + dy },
                }
              : node,
          )
          commitFlow(next, edgesRef.current)
          return next
        })
      }
    }
    function onKeyUp(event: KeyboardEvent) {
      if (event.code === 'Space') setSpacePan(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [activeId, commitFlow, dispatch, queueSave, t])

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
          {(
            [
              ['select', MousePointer2, t('canvas.toolSelect')],
              ['hand', Hand, t('canvas.toolHand')],
              ['note', StickyNote, t('canvas.toolNote')],
              ['frame', Frame, t('canvas.toolFrame')],
              ['rect', Square, t('canvas.toolRect')],
              ['ellipse', Circle, t('canvas.toolEllipse')],
              ['text', Type, t('canvas.toolText')],
              ['line', Minus, t('canvas.toolLine')],
              ['arrow', ArrowRight, t('canvas.toolArrow')],
              ['pen', Pencil, t('canvas.toolPen')],
              ['link', Link2, t('canvas.linkCards')],
            ] as const
          ).map(([id, Icon, label]) => (
            <IconTooltip key={id} label={label}>
              <button
                type="button"
                className={cn(
                  'canvas-toolbar-btn canvas-toolbar-btn--icon',
                  tool === id && 'is-active',
                )}
                onClick={() => {
                  if (id === 'link') {
                    setTool((prev) => (prev === 'link' ? 'select' : 'link'))
                    setLinkFromId(null)
                    return
                  }
                  setTool(id)
                  setLinkFromId(null)
                }}
                aria-label={label}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            </IconTooltip>
          ))}
          <IconTooltip label={t('canvas.toolDocLink')}>
            <button
              type="button"
              className={cn('canvas-toolbar-btn canvas-toolbar-btn--icon', docPickerOpen && 'is-active')}
              onClick={() => setDocPickerOpen((prev) => !prev)}
              aria-label={t('canvas.toolDocLink')}
            >
              <FileText className="h-3.5 w-3.5" />
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
        <IconTooltip label={t('canvas.duplicate')}>
          <button
            type="button"
            className="canvas-toolbar-btn canvas-toolbar-btn--icon"
            disabled={selectedNodes.length === 0}
            onClick={() => duplicateSelected()}
            aria-label={t('canvas.duplicate')}
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        </IconTooltip>
        <IconTooltip label={t('canvas.group')}>
          <button
            type="button"
            className="canvas-toolbar-btn canvas-toolbar-btn--icon"
            disabled={selectedNodes.length < 2}
            onClick={() => groupSelected()}
            aria-label={t('canvas.group')}
          >
            <Group className="h-3.5 w-3.5" />
          </button>
        </IconTooltip>
        <IconTooltip label={t('canvas.ungroup')}>
          <button
            type="button"
            className="canvas-toolbar-btn canvas-toolbar-btn--icon"
            disabled={selectedNodes.length === 0}
            onClick={() => ungroupSelected()}
            aria-label={t('canvas.ungroup')}
          >
            <Ungroup className="h-3.5 w-3.5" />
          </button>
        </IconTooltip>
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

        <div className="canvas-align-rail" role="group" aria-label={t('canvas.alignGroup')}>
          {(
            [
              ['left', AlignStartVertical],
              ['centerX', AlignCenterVertical],
              ['right', AlignEndVertical],
              ['top', AlignStartHorizontal],
              ['middleY', AlignCenterHorizontal],
              ['bottom', AlignEndHorizontal],
              ['distributeX', AlignHorizontalSpaceAround],
              ['distributeY', AlignVerticalSpaceAround],
            ] as const
          ).map(([mode, Icon]) => (
            <IconTooltip key={mode} label={t(`canvas.align.${mode}`)}>
              <button
                type="button"
                className="canvas-toolbar-btn canvas-toolbar-btn--icon"
                disabled={selectedNodes.length < 2}
                onClick={() => applyAlign(mode)}
                aria-label={t(`canvas.align.${mode}`)}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            </IconTooltip>
          ))}
        </div>

        <button
          type="button"
          className="canvas-toolbar-btn"
          disabled={takeawaysBusy || selectedNodes.every((n) => n.data.kind !== 'note' && n.data.kind !== 'text')}
          onClick={() => void extractTakeaways()}
          title={t('canvas.takeaways')}
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span>{t('canvas.takeaways')}</span>
        </button>
        <button
          type="button"
          className="canvas-toolbar-btn"
          onClick={() => exportPlainText()}
          title={t('canvas.exportText')}
        >
          <MoveHorizontal className="h-3.5 w-3.5" />
          <span>{t('canvas.exportText')}</span>
        </button>
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
          className={cn('canvas-toolbar-btn', templatesOpen && 'is-active')}
          onClick={() => setTemplatesOpen((prev) => !prev)}
          title={t('canvas.templates')}
        >
          <LayoutTemplate className="h-3.5 w-3.5" />
          <span>{t('canvas.templates')}</span>
        </button>
        <button
          type="button"
          className="canvas-toolbar-btn"
          disabled={selectedNodes.length === 0}
          onClick={() => {
            const doc = flowToCanvasDocument(nodesRef.current, edgesRef.current)
            const selected = doc.objects.filter((o) => selectedNodes.some((n) => n.id === o.id))
            void openTiptapFromCanvasSelection(dispatch, navigate, t, selected).then(
              () => toast.success(t('canvas.insertedTiptap')),
              (error) => toast.error(t('canvas.insertTiptapFailed'), String(error)),
            )
          }}
          title={t('canvas.insertTiptap')}
        >
          <FilePlus className="h-3.5 w-3.5" />
          <span>{t('canvas.insertTiptap')}</span>
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
            void logCanvasAudit('canvas_export_svg', 'Exported canvas SVG', {
              documentId: activeId,
            })
            toast.success(t('canvas.exportedSvg'))
          }}
          title={t('canvas.exportSvg')}
        >
          <Download className="h-3.5 w-3.5" />
          <span>{t('canvas.exportSvg')}</span>
        </button>
        <button
          type="button"
          className="canvas-toolbar-btn"
          onClick={() => {
            const el = surfaceRef.current
            if (!el) return
            const width = el.clientWidth
            const height = el.clientHeight
            const svgData = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%">${new XMLSerializer().serializeToString(el)}</foreignObject></svg>`
            const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
            const url = URL.createObjectURL(blob)
            const img = new Image()
            img.onload = () => {
              const canvas = document.createElement('canvas')
              canvas.width = width * 2
              canvas.height = height * 2
              const ctx = canvas.getContext('2d')
              if (!ctx) {
                URL.revokeObjectURL(url)
                return
              }
              ctx.scale(2, 2)
              ctx.fillStyle = getComputedStyle(el).backgroundColor || '#fff'
              ctx.fillRect(0, 0, width, height)
              ctx.drawImage(img, 0, 0, width, height)
              canvas.toBlob((png) => {
                URL.revokeObjectURL(url)
                if (!png) return
                const pngUrl = URL.createObjectURL(png)
                const link = document.createElement('a')
                link.href = pngUrl
                link.download = `${activeDocument?.title || 'canvas'}.png`
                link.click()
                URL.revokeObjectURL(pngUrl)
                void logCanvasAudit('canvas_export_png', 'Exported canvas PNG', {
                  documentId: activeId,
                })
                toast.success(t('canvas.exportedPng'))
              }, 'image/png')
            }
            img.onerror = () => {
              URL.revokeObjectURL(url)
              toast.error(t('canvas.exportPngFailed'))
            }
            img.src = url
          }}
          title={t('canvas.exportPng')}
        >
          <ImageDown className="h-3.5 w-3.5" />
          <span>{t('canvas.exportPng')}</span>
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

      {(primarySelected || selectedNodes.length > 1) && (
        <div className="canvas-props" role="group" aria-label={t('canvas.properties')}>
          <span className="canvas-props-kind">
            {primarySelected
              ? t(kindLabelKey(primarySelected.data.kind))
              : t('canvas.multiSelected', { count: selectedNodes.length })}
          </span>
          <div className="canvas-props-group">
            <span className="canvas-props-label">{t('canvas.fill')}</span>
            <div className="canvas-swatches">
              {CANVAS_FILL_PRESETS.map((fill) => (
                <button
                  key={fill}
                  type="button"
                  className={cn(
                    'canvas-swatch',
                    primarySelected?.data.fill === fill && 'is-active',
                  )}
                  style={{
                    background:
                      fill === 'transparent'
                        ? 'repeating-conic-gradient(#ccc 0% 25%, #fff 0% 50%) 50% / 8px 8px'
                        : fill,
                  }}
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
                    primarySelected?.data.stroke === stroke && 'is-active',
                  )}
                  style={{ borderColor: stroke, background: 'var(--color-surface)' }}
                  onClick={() => patchSelected({ stroke })}
                  aria-label={t('canvas.stroke')}
                />
              ))}
            </div>
          </div>
          <div className="canvas-props-group">
            <span className="canvas-props-label">{t('canvas.strokeWidth')}</span>
            <input
              type="range"
              min={0}
              max={8}
              step={0.5}
              value={primarySelected?.data.strokeWidth ?? 1}
              onChange={(event) => patchSelected({ strokeWidth: Number(event.target.value) })}
              className="canvas-props-range"
            />
          </div>
          <div className="canvas-props-group">
            <span className="canvas-props-label">{t('canvas.opacity')}</span>
            <input
              type="range"
              min={0.15}
              max={1}
              step={0.05}
              value={primarySelected?.data.opacity ?? 1}
              onChange={(event) => patchSelected({ opacity: Number(event.target.value) })}
              className="canvas-props-range"
            />
          </div>
          {(!primarySelected ||
            primarySelected.data.kind === 'rect' ||
            primarySelected.data.kind === 'frame' ||
            primarySelected.data.kind === 'note' ||
            primarySelected.data.kind === 'docLink') && (
            <div className="canvas-props-group">
              <span className="canvas-props-label">{t('canvas.cornerRadius')}</span>
              <input
                type="range"
                min={0}
                max={32}
                step={1}
                value={primarySelected?.data.cornerRadius ?? 10}
                onChange={(event) => patchSelected({ cornerRadius: Number(event.target.value) })}
                className="canvas-props-range"
              />
            </div>
          )}
          {primarySelected &&
            (primarySelected.data.kind === 'text' || primarySelected.data.kind === 'note') && (
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
          <div className="canvas-props-group">
            <span className="canvas-props-label">{t('canvas.rotation')}</span>
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={primarySelected?.data.rotation ?? 0}
              onChange={(event) => {
                const rotation = Number(event.target.value)
                setNodes((current) => {
                  const next = current.map((node) =>
                    node.selected
                      ? {
                          ...node,
                          data: { ...node.data, rotation },
                          style: {
                            ...node.style,
                            transform: rotation ? `rotate(${rotation}deg)` : undefined,
                          },
                        }
                      : node,
                  )
                  commitFlow(next, edgesRef.current)
                  return next
                })
              }}
              className="canvas-props-range"
            />
            <span className="canvas-toolbar-meta">{primarySelected?.data.rotation ?? 0}°</span>
          </div>
        </div>
      )}

      <CanvasObjectActions.Provider value={objectActions}>
        <div
          ref={surfaceRef}
          className={cn(
            'canvas-surface canvas-surface--flow',
            placing && 'is-placing',
            tool === 'link' && 'is-linking',
            (spacePan || tool === 'hand') && 'is-space-pan',
            tool === 'pen' && 'is-drawing',
          )}
          onMouseDown={(event) => {
            if (event.button !== 0) return
            const target = event.target as HTMLElement
            if (!target.classList.contains('react-flow__pane')) return

            if (tool === 'pen') {
              event.preventDefault()
              const start = screenToFlowPosition({ x: event.clientX, y: event.clientY })
              const obj = createCanvasObject('pen', start, nextZIndex(nodesRef.current), {
                x: start.x,
                y: start.y,
                w: 8,
                h: 8,
              })
              obj.points = [{ x: 0, y: 0 }]
              const node = objectToNode(obj)
              penStrokeRef.current = { points: [{ x: 0, y: 0 }], nodeId: node.id }
              setNodes((current) => [
                ...current.map((n) => ({ ...n, selected: false })),
                { ...node, selected: true },
              ])
              return
            }

            if (!placing || !DRAG_CREATE_TOOLS.has(tool as CanvasObjectKind)) return
            event.preventDefault()
            const start = screenToFlowPosition({ x: event.clientX, y: event.clientY })
            const kind = tool as CanvasObjectKind
            const node = createObjectNode(kind, start, nextZIndex(nodesRef.current), {
              x: start.x,
              y: start.y,
              w: 16,
              h: kind === 'line' || kind === 'arrow' ? 24 : 16,
            })
            dragCreateRef.current = { kind, start, nodeId: node.id }
            setNodes((current) => [
              ...current.map((n) => ({ ...n, selected: false })),
              { ...node, selected: true },
            ])
          }}
          onMouseMove={(event) => {
            const pen = penStrokeRef.current
            if (pen) {
              const origin = nodesRef.current.find((n) => n.id === pen.nodeId)?.position
              if (!origin) return
              const cur = screenToFlowPosition({ x: event.clientX, y: event.clientY })
              const local = { x: cur.x - origin.x, y: cur.y - origin.y }
              pen.points.push(local)
              const xs = pen.points.map((p) => p.x)
              const ys = pen.points.map((p) => p.y)
              const minX = Math.min(...xs)
              const minY = Math.min(...ys)
              const maxX = Math.max(...xs)
              const maxY = Math.max(...ys)
              const w = Math.max(8, maxX - minX + 8)
              const h = Math.max(8, maxY - minY + 8)
              setNodes((current) =>
                current.map((node) =>
                  node.id === pen.nodeId
                    ? {
                        ...node,
                        width: w,
                        height: h,
                        style: { ...node.style, width: w, height: h },
                        data: { ...node.data, points: [...pen.points] },
                      }
                    : node,
                ),
              )
              return
            }

            const drag = dragCreateRef.current
            if (!drag) return
            const cur = screenToFlowPosition({ x: event.clientX, y: event.clientY })
            const x = Math.min(drag.start.x, cur.x)
            const y = Math.min(drag.start.y, cur.y)
            const w = Math.max(16, Math.abs(cur.x - drag.start.x))
            const h =
              drag.kind === 'line' || drag.kind === 'arrow'
                ? 24
                : Math.max(16, Math.abs(cur.y - drag.start.y))
            setNodes((current) =>
              current.map((node) =>
                node.id === drag.nodeId
                  ? {
                      ...node,
                      position: { x, y },
                      width: w,
                      height: h,
                      style: { ...node.style, width: w, height: h },
                    }
                  : node,
              ),
            )
          }}
          onMouseUp={() => {
            if (penStrokeRef.current) {
              const id = penStrokeRef.current.nodeId
              penStrokeRef.current = null
              setTool('select')
              commitFlow(nodesRef.current, edgesRef.current)
              void logCanvasAudit('canvas_object_create', 'Created pen stroke', {
                documentId: activeId,
                objectId: id,
              })
              return
            }
            const drag = dragCreateRef.current
            if (!drag) return
            dragCreateRef.current = null
            setTool('select')
            commitFlow(nodesRef.current, edgesRef.current)
            void logCanvasAudit('canvas_object_create', `Created ${drag.kind}`, {
              documentId: activeId,
              objectId: drag.nodeId,
            })
          }}
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
            snapGrid={[GRID, GRID]}
            deleteKeyCode={['Backspace', 'Delete']}
            zoomOnDoubleClick={false}
            panOnDrag={
              spacePan || tool === 'hand' ? true : tool === 'select' ? [1] : tool === 'pen' ? false : true
            }
            selectionOnDrag={tool === 'select' && !spacePan}
            selectionMode={SelectionMode.Partial}
            multiSelectionKeyCode="Shift"
            nodesDraggable={tool === 'select' && !spacePan}
            elementsSelectable={tool === 'select' || tool === 'link'}
            proOptions={{ hideAttribution: true }}
            onNodeDrag={(_event, node) => {
              const snapped = snapNodePosition(node, nodesRef.current, node.position)
              setSnapGuides(snapped.guides)
              if (
                snapped.position.x !== node.position.x ||
                snapped.position.y !== node.position.y
              ) {
                setNodes((current) =>
                  current.map((n) =>
                    n.id === node.id ? { ...n, position: snapped.position } : n,
                  ),
                )
              }
            }}
            onNodeDragStop={(_event, node) => {
              setSnapGuides([])
              // Nest into frame when dropped inside (absolute coords).
              const byId = new Map(nodesRef.current.map((n) => [n.id, n]))
              const abs = absolutePosition(
                { ...node, position: node.position },
                byId,
              )
              const w = node.width ?? 160
              const h = node.height ?? 120
              const cx = abs.x + w / 2
              const cy = abs.y + h / 2
              let parentFrame: Node<CanvasObjectData> | null = null
              for (const candidate of nodesRef.current) {
                if (candidate.id === node.id || candidate.data.kind !== 'frame') continue
                if (node.parentId === candidate.id) continue
                const frameAbs = absolutePosition(candidate, byId)
                const fw = candidate.width ?? 360
                const fh = candidate.height ?? 240
                if (
                  cx >= frameAbs.x &&
                  cy >= frameAbs.y &&
                  cx <= frameAbs.x + fw &&
                  cy <= frameAbs.y + fh
                ) {
                  parentFrame = candidate
                }
              }
              if (parentFrame) {
                const frameAbs = absolutePosition(parentFrame, byId)
                setNodes((current) => {
                  const next = current.map((n) =>
                    n.id === node.id
                      ? {
                          ...n,
                          parentId: parentFrame!.id,
                          extent: 'parent' as const,
                          position: {
                            x: abs.x - frameAbs.x,
                            y: abs.y - frameAbs.y,
                          },
                          data: { ...n.data, parentId: parentFrame!.id },
                        }
                      : n,
                  )
                  commitFlow(next, edgesRef.current)
                  return next
                })
                void logCanvasAudit('canvas_object_move', 'Nested object into frame', {
                  documentId: activeId,
                  objectId: node.id,
                  parentId: parentFrame.id,
                })
              } else {
                void logCanvasAudit('canvas_object_move', 'Moved canvas object', {
                  documentId: activeId,
                  objectId: node.id,
                })
              }
            }}
            onPaneClick={(event) => {
              if (dragCreateRef.current || penStrokeRef.current) return
              if (placing && !DRAG_CREATE_TOOLS.has(tool as CanvasObjectKind) && tool !== 'pen') {
                placeObjectAt(
                  tool as CanvasObjectKind,
                  screenToFlowPosition({ x: event.clientX, y: event.clientY }),
                )
              }
            }}
            onNodeClick={(event, node) => {
              if (tool === 'link') {
                if (!linkFromId) {
                  setLinkFromId(node.id)
                  return
                }
                if (linkFromId === node.id) return
                onConnect({
                  source: linkFromId,
                  target: node.id,
                  sourceHandle: null,
                  targetHandle: null,
                })
                return
              }
              if (event.shiftKey) return
              if (node.data.groupId) {
                const gid = node.data.groupId
                setNodes((current) =>
                  current.map((n) => ({
                    ...n,
                    selected: n.data.groupId === gid,
                  })),
                )
              }
            }}
            onDoubleClick={(event) => {
              if (tool !== 'select') return
              if (
                (event.target as HTMLElement).closest(
                  '.react-flow__node, .canvas-card, .canvas-shape, .canvas-frame, .canvas-text-node, .canvas-doclink, .canvas-line-node, textarea, input',
                )
              ) {
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
                if (data?.kind === 'docLink') return 'var(--color-accent)'
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

          {snapGuides.length > 0 && (
            <div className="canvas-snap-guides" aria-hidden="true">
              {snapGuides.map((guide, index) => (
                <div
                  key={`${guide.orientation}-${guide.value}-${index}`}
                  className={cn(
                    'canvas-snap-guide',
                    guide.orientation === 'x' ? 'is-x' : 'is-y',
                  )}
                  style={
                    guide.orientation === 'x'
                      ? { left: guide.value * viewport.zoom + viewport.x }
                      : { top: guide.value * viewport.zoom + viewport.y }
                  }
                />
              ))}
            </div>
          )}

          {templatesOpen && (
            <aside className="canvas-doc-picker" aria-label={t('canvas.templates')}>
              <header className="canvas-layers-head">
                <span>{t('canvas.templates')}</span>
                <button
                  type="button"
                  className="canvas-toolbar-btn canvas-toolbar-btn--icon"
                  onClick={() => setTemplatesOpen(false)}
                  aria-label={t('canvas.close')}
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
              </header>
              <ul className="canvas-layers-list">
                {(['blank', 'brainstorm', 'roadmap'] as CanvasTemplateId[]).map((id) => (
                  <li key={id}>
                    <button
                      type="button"
                      className="canvas-layers-item"
                      onClick={() => {
                        const doc = buildCanvasTemplate(id)
                        const nextNodes = objectsToNodes(doc.objects)
                        const nextEdges = canvasEdgesToFlow(doc.edges)
                        setNodes(nextNodes)
                        setEdges(nextEdges)
                        commitFlow(nextNodes, nextEdges)
                        setTemplatesOpen(false)
                        void logCanvasAudit('canvas_template', `Applied template ${id}`, {
                          documentId: activeId,
                          template: id,
                        })
                        toast.success(t('canvas.templateApplied', { name: t(`canvas.template.${id}.label`) }))
                      }}
                    >
                      <span className="canvas-layers-kind">{t(`canvas.template.${id}.label`)}</span>
                      <span className="canvas-layers-title">{t(`canvas.template.${id}.hint`)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </aside>
          )}

          {docPickerOpen && (
            <aside className="canvas-doc-picker" aria-label={t('canvas.toolDocLink')}>
              <header className="canvas-layers-head">
                <span>{t('canvas.pickDocument')}</span>
                <button
                  type="button"
                  className="canvas-toolbar-btn canvas-toolbar-btn--icon"
                  onClick={() => setDocPickerOpen(false)}
                  aria-label={t('canvas.close')}
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
              </header>
              <ul className="canvas-layers-list">
                {libraryDocs.length === 0 ? (
                  <li className="canvas-layers-empty">{t('canvas.noDocuments')}</li>
                ) : (
                  libraryDocs.slice(0, 40).map((doc) => (
                    <li key={doc.id}>
                      <button
                        type="button"
                        className="canvas-layers-item"
                        onClick={() => insertDocLink(doc.id, doc.title || t('canvas.docLinkUntitled'))}
                      >
                        <span className="canvas-layers-kind">{t('canvas.toolDocLink')}</span>
                        <span className="canvas-layers-title">{doc.title || t('canvas.docLinkUntitled')}</span>
                      </button>
                    </li>
                  ))
                )}
              </ul>
            </aside>
          )}

          {layersOpen && (
            <aside className="canvas-layers" aria-label={t('canvas.layers')}>
              <header className="canvas-layers-head">
                <span>{t('canvas.layers')}</span>
                <span className="canvas-toolbar-meta">{nodes.length}</span>
              </header>
              <div className="canvas-design-panel">
                <span className="canvas-props-label">{t('canvas.design')}</span>
                <p className="canvas-design-hint">{t('canvas.designHint')}</p>
              </div>
              <ul className="canvas-layers-list">
                {layers.length === 0 ? (
                  <li className="canvas-layers-empty">{t('canvas.layersEmpty')}</li>
                ) : (
                  layers.map((node) => {
                    const kind = node.data.kind
                    const title =
                      kind === 'frame'
                        ? node.data.label || t('canvas.frameDefault')
                        : kind === 'docLink'
                          ? node.data.documentTitle || t('canvas.docLinkUntitled')
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
