import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import { useTranslation } from 'react-i18next'
import {
  Link2,
  Minus,
  Plus,
  Square,
  Trash2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import {
  DEFAULT_CARD_H,
  DEFAULT_CARD_W,
  emptyCanvasDocument,
  parseCanvasDocument,
  serializeCanvasDocument,
  type CanvasCard,
  type CanvasDocument,
  type CanvasEdge,
} from '@/lib/canvas/types'
import { cacheDocument, hashContent } from '@/lib/cache/document-cache'
import { flushPendingWrites, updateDocument } from '@/lib/db/api'
import { applyDiskPersistResult } from '@/lib/disk-sync'
import { toast } from '@/lib/toast'
import { cn, debounce } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  setActiveDocument,
  setSaveStatus,
  updateDocuments,
} from '@/store/documentsSlice'
import { isOpenLibraryDocumentId } from '@/lib/trash-document'
import { store } from '@/store/index'

const AUTO_SAVE_DELAY_MS = 600
const MIN_ZOOM = 0.35
const MAX_ZOOM = 2.5

type Camera = { x: number; y: number; zoom: number }

type DragState =
  | { kind: 'pan'; startX: number; startY: number; originX: number; originY: number }
  | {
      kind: 'card'
      id: string
      startX: number
      startY: number
      originX: number
      originY: number
    }

type Selection =
  | { kind: 'card'; id: string }
  | { kind: 'edge'; id: string }
  | null

function clampZoom(zoom: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

function cardCenter(card: CanvasCard) {
  return { x: card.x + card.w / 2, y: card.y + card.h / 2 }
}

export function CanvasEditor() {
  const { t } = useTranslation()
  const dispatch = useAppDispatch()
  const activeDocument = useAppSelector((state) => state.documents.activeDocument)
  const activeId = useAppSelector((state) => state.documents.activeDocumentId)

  const [doc, setDoc] = useState<CanvasDocument>(() => emptyCanvasDocument())
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, zoom: 1 })
  const [selection, setSelection] = useState<Selection>(null)
  const [linkFromId, setLinkFromId] = useState<string | null>(null)
  const [linkMode, setLinkMode] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [spaceDown, setSpaceDown] = useState(false)

  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const docRef = useRef(doc)
  const titleRef = useRef(activeDocument?.title ?? '')
  const lastPersistedHashRef = useRef<string | null>(null)
  const latestDocIdRef = useRef<string | null>(activeId)

  docRef.current = doc
  titleRef.current = activeDocument?.title ?? ''
  latestDocIdRef.current = activeId

  useEffect(() => {
    if (!activeDocument) return
    const parsed = parseCanvasDocument(activeDocument.contentJson) ?? emptyCanvasDocument()
    setDoc(parsed)
    setSelection(null)
    setLinkFromId(null)
    setLinkMode(false)
    setEditingId(null)
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
      debounce((docId: string, next: CanvasDocument) => {
        void persistContent(docId, serializeCanvasDocument(next))
      }, AUTO_SAVE_DELAY_MS),
    [persistContent],
  )

  const commitDoc = useCallback(
    (updater: (prev: CanvasDocument) => CanvasDocument) => {
      setDoc((prev) => {
        const next = updater(prev)
        if (activeId) {
          dispatch(setSaveStatus('dirty'))
          queueSave(activeId, next)
        }
        return next
      })
    },
    [activeId, dispatch, queueSave],
  )

  useEffect(() => {
    return () => {
      queueSave.cancel()
      const id = latestDocIdRef.current
      if (!id) return
      const contentJson = serializeCanvasDocument(docRef.current)
      if (hashContent(contentJson) === lastPersistedHashRef.current) return
      void persistContent(id, contentJson)
    }
  }, [persistContent, queueSave])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'Space') {
        const target = event.target as HTMLElement | null
        if (target?.closest('textarea, input, [contenteditable="true"]')) return
        setSpaceDown(true)
        event.preventDefault()
      }
    }
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpaceDown(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('textarea, input, [contenteditable="true"]')) return
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      if (!selection) return
      event.preventDefault()
      if (selection.kind === 'card') {
        const id = selection.id
        commitDoc((prev) => ({
          ...prev,
          cards: prev.cards.filter((card) => card.id !== id),
          edges: prev.edges.filter((edge) => edge.from !== id && edge.to !== id),
        }))
        setSelection(null)
        setLinkFromId((from) => (from === id ? null : from))
        setLinkMode(false)
        setEditingId((edit) => (edit === id ? null : edit))
      } else {
        const id = selection.id
        commitDoc((prev) => ({
          ...prev,
          edges: prev.edges.filter((edge) => edge.id !== id),
        }))
        setSelection(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [commitDoc, selection])

  const screenToWorld = useCallback(
    (clientX: number, clientY: number) => {
      const rect = surfaceRef.current?.getBoundingClientRect()
      if (!rect) return { x: 0, y: 0 }
      return {
        x: (clientX - rect.left - camera.x) / camera.zoom,
        y: (clientY - rect.top - camera.y) / camera.zoom,
      }
    },
    [camera],
  )

  const addCardAt = useCallback(
    (worldX: number, worldY: number) => {
      const id = crypto.randomUUID()
      const card: CanvasCard = {
        id,
        x: worldX - DEFAULT_CARD_W / 2,
        y: worldY - DEFAULT_CARD_H / 2,
        w: DEFAULT_CARD_W,
        h: DEFAULT_CARD_H,
        text: '',
      }
      commitDoc((prev) => ({ ...prev, cards: [...prev.cards, card] }))
      setSelection({ kind: 'card', id })
      setEditingId(id)
      setLinkFromId(null)
      setLinkMode(false)
    },
    [commitDoc],
  )

  const handleSurfacePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 1) return
    const panGesture = event.button === 1 || spaceDown || event.altKey
    if (panGesture) {
      dragRef.current = {
        kind: 'pan',
        startX: event.clientX,
        startY: event.clientY,
        originX: camera.x,
        originY: camera.y,
      }
      event.currentTarget.setPointerCapture(event.pointerId)
      setEditingId(null)
      return
    }
    if ((event.target as HTMLElement).closest('[data-canvas-card], [data-canvas-edge]')) {
      return
    }
    setSelection(null)
    setLinkFromId(null)
    setLinkMode(false)
    setEditingId(null)
    dragRef.current = {
      kind: 'pan',
      startX: event.clientX,
      startY: event.clientY,
      originX: camera.x,
      originY: camera.y,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleSurfacePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag) return
    const dx = event.clientX - drag.startX
    const dy = event.clientY - drag.startY
    if (drag.kind === 'pan') {
      setCamera((prev) => ({ ...prev, x: drag.originX + dx, y: drag.originY + dy }))
      return
    }
    commitDoc((prev) => ({
      ...prev,
      cards: prev.cards.map((card) =>
        card.id === drag.id
          ? { ...card, x: drag.originX + dx / camera.zoom, y: drag.originY + dy / camera.zoom }
          : card,
      ),
    }))
  }

  const handleSurfacePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current) {
      dragRef.current = null
      try {
        event.currentTarget.releasePointerCapture(event.pointerId)
      } catch {
        // ignore
      }
    }
  }

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    const rect = surfaceRef.current?.getBoundingClientRect()
    if (!rect) return
    const cursorX = event.clientX - rect.left
    const cursorY = event.clientY - rect.top
    const factor = event.deltaY > 0 ? 0.92 : 1.08
    setCamera((prev) => {
      const nextZoom = clampZoom(prev.zoom * factor)
      const worldX = (cursorX - prev.x) / prev.zoom
      const worldY = (cursorY - prev.y) / prev.zoom
      return {
        zoom: nextZoom,
        x: cursorX - worldX * nextZoom,
        y: cursorY - worldY * nextZoom,
      }
    })
  }

  const handleCardPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
    card: CanvasCard,
  ) => {
    if (event.button !== 0) return
    event.stopPropagation()
    if (spaceDown) return

    const connectFrom =
      linkFromId ??
      (event.shiftKey && selection?.kind === 'card' ? selection.id : null)

    if (linkMode && !connectFrom) {
      setLinkFromId(card.id)
      setSelection({ kind: 'card', id: card.id })
      return
    }

    if (connectFrom) {
      if (connectFrom !== card.id) {
        const exists = doc.edges.some(
          (edge) =>
            (edge.from === connectFrom && edge.to === card.id) ||
            (edge.from === card.id && edge.to === connectFrom),
        )
        if (!exists) {
          const edge: CanvasEdge = {
            id: crypto.randomUUID(),
            from: connectFrom,
            to: card.id,
          }
          commitDoc((prev) => ({ ...prev, edges: [...prev.edges, edge] }))
          setSelection({ kind: 'edge', id: edge.id })
        } else {
          setSelection({ kind: 'card', id: card.id })
        }
      }
      setLinkFromId(null)
      setLinkMode(false)
      return
    }

    setSelection({ kind: 'card', id: card.id })
    if (editingId !== card.id) setEditingId(null)
    dragRef.current = {
      kind: 'card',
      id: card.id,
      startX: event.clientX,
      startY: event.clientY,
      originX: card.x,
      originY: card.y,
    }
    surfaceRef.current?.setPointerCapture(event.pointerId)
  }

  const cardMap = useMemo(() => {
    const map = new Map<string, CanvasCard>()
    for (const card of doc.cards) map.set(card.id, card)
    return map
  }, [doc.cards])

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
            const cx = rect ? rect.width / 2 : 400
            const cy = rect ? rect.height / 2 : 300
            addCardAt((cx - camera.x) / camera.zoom, (cy - camera.y) / camera.zoom)
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
              else if (selection?.kind === 'card') setLinkFromId(selection.id)
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
          disabled={!selection}
          onClick={() => {
            if (!selection) return
            if (selection.kind === 'card') {
              const id = selection.id
              commitDoc((prev) => ({
                ...prev,
                cards: prev.cards.filter((card) => card.id !== id),
                edges: prev.edges.filter((edge) => edge.from !== id && edge.to !== id),
              }))
            } else {
              const id = selection.id
              commitDoc((prev) => ({
                ...prev,
                edges: prev.edges.filter((edge) => edge.id !== id),
              }))
            }
            setSelection(null)
            setLinkFromId(null)
            setLinkMode(false)
            setEditingId(null)
          }}
          title={t('canvas.deleteSelected')}
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span>{t('canvas.deleteSelected')}</span>
        </button>
        <div className="canvas-toolbar-spacer" />
        <button
          type="button"
          className="canvas-toolbar-btn canvas-toolbar-btn--icon"
          onClick={() => setCamera((prev) => ({ ...prev, zoom: clampZoom(prev.zoom * 0.9) }))}
          title={t('canvas.zoomOut')}
        >
          <ZoomOut className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="canvas-toolbar-btn canvas-toolbar-btn--icon"
          onClick={() => setCamera({ x: 0, y: 0, zoom: 1 })}
          title={t('canvas.resetView')}
        >
          <Minus className="h-3.5 w-3.5" />
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="canvas-toolbar-btn canvas-toolbar-btn--icon"
          onClick={() => setCamera((prev) => ({ ...prev, zoom: clampZoom(prev.zoom * 1.1) }))}
          title={t('canvas.zoomIn')}
        >
          <ZoomIn className="h-3.5 w-3.5" />
        </button>
        <span className="canvas-toolbar-meta">{Math.round(camera.zoom * 100)}%</span>
      </div>

      <div
        ref={surfaceRef}
        className={cn('canvas-surface', spaceDown && 'is-panning')}
        onPointerDown={handleSurfacePointerDown}
        onPointerMove={handleSurfacePointerMove}
        onPointerUp={handleSurfacePointerUp}
        onPointerCancel={handleSurfacePointerUp}
        onWheel={handleWheel}
        onDoubleClick={(event) => {
          if ((event.target as HTMLElement).closest('[data-canvas-card]')) return
          const world = screenToWorld(event.clientX, event.clientY)
          addCardAt(world.x, world.y)
        }}
      >
        <div className="canvas-grid" aria-hidden />
        <div
          className="canvas-world"
          style={{
            transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,
          }}
        >
          <svg className="canvas-edges" overflow="visible" aria-hidden>
            {doc.edges.map((edge) => {
              const from = cardMap.get(edge.from)
              const to = cardMap.get(edge.to)
              if (!from || !to) return null
              const a = cardCenter(from)
              const b = cardCenter(to)
              const selected = selection?.kind === 'edge' && selection.id === edge.id
              return (
                <g key={edge.id} data-canvas-edge={edge.id}>
                  <line
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    className={cn('canvas-edge-hit', selected && 'is-selected')}
                    onPointerDown={(event) => {
                      event.stopPropagation()
                      setSelection({ kind: 'edge', id: edge.id })
                      setLinkFromId(null)
                      setEditingId(null)
                    }}
                  />
                  <line
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    className={cn('canvas-edge', selected && 'is-selected')}
                  />
                </g>
              )
            })}
          </svg>

          {doc.cards.map((card) => {
            const selected = selection?.kind === 'card' && selection.id === card.id
            const linking = linkFromId === card.id
            const editing = editingId === card.id
            return (
              <div
                key={card.id}
                data-canvas-card={card.id}
                className={cn(
                  'canvas-card',
                  selected && 'is-selected',
                  linking && 'is-link-source',
                )}
                style={{
                  left: card.x,
                  top: card.y,
                  width: card.w,
                  height: card.h,
                }}
                onPointerDown={(event) => handleCardPointerDown(event, card)}
                onDoubleClick={(event) => {
                  event.stopPropagation()
                  setSelection({ kind: 'card', id: card.id })
                  setEditingId(card.id)
                  setLinkFromId(null)
                }}
              >
                {editing ? (
                  <textarea
                    className="canvas-card-input"
                    value={card.text}
                    autoFocus
                    placeholder={t('canvas.cardPlaceholder')}
                    onChange={(event) => {
                      const text = event.target.value
                      commitDoc((prev) => ({
                        ...prev,
                        cards: prev.cards.map((item) =>
                          item.id === card.id ? { ...item, text } : item,
                        ),
                      }))
                    }}
                    onBlur={() => setEditingId(null)}
                    onPointerDown={(event) => event.stopPropagation()}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.preventDefault()
                        setEditingId(null)
                      }
                    }}
                  />
                ) : (
                  <div
                    className={cn(
                      'canvas-card-text',
                      !card.text.trim() && 'is-placeholder',
                    )}
                  >
                    {card.text.trim() ? card.text : t('canvas.cardPlaceholder')}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {doc.cards.length === 0 && (
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
    </div>
  )
}
