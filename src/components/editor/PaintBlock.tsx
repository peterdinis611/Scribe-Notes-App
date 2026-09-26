import { NodeViewWrapper } from '@tiptap/react'
import type { NodeViewProps } from '@tiptap/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Eraser,
  LoaderCircle,
  Paintbrush,
  Redo2,
  ScanText,
  Trash2,
  Undo2,
} from 'lucide-react'
import { invoke } from '@/lib/tauri'
import { saveDocumentImage } from '@/lib/db/api'
import { useAppSelector } from '@/store/hooks'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import {
  PAINT_DEFAULT_BG,
  PAINT_DEFAULT_COLOR,
  PAINT_DEFAULT_HEIGHT,
  PAINT_DEFAULT_WIDTH,
  PAINT_INK_COLORS,
  parsePaintStrokes,
  renderPaintStrokes,
  serializePaintStrokes,
  type PaintStroke,
  type PaintTool,
} from '@/lib/editor/paint'

function pointerToCanvas(
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect()
  const scaleX = canvas.width / Math.max(1, rect.width)
  const scaleY = canvas.height / Math.max(1, rect.height)
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY,
  }
}

export function PaintBlock({ node, selected, deleteNode, updateAttributes, getPos }: NodeViewProps) {
  const { t } = useTranslation()
  const activeId = useAppSelector((state) => state.documents.activeDocumentId)
  const width = Number(node.attrs.width) || PAINT_DEFAULT_WIDTH
  const height = Number(node.attrs.height) || PAINT_DEFAULT_HEIGHT
  const background = String(node.attrs.background || PAINT_DEFAULT_BG)
  const ocrText = String(node.attrs.ocrText || '').trim()

  const [strokes, setStrokes] = useState<PaintStroke[]>(() => parsePaintStrokes(node.attrs.strokes))
  const [redoStack, setRedoStack] = useState<PaintStroke[][]>([])
  const [tool, setTool] = useState<PaintTool>('pen')
  const [color, setColor] = useState(PAINT_DEFAULT_COLOR)
  const [brush, setBrush] = useState(3)
  const [drawing, setDrawing] = useState(false)
  const [ocrBusy, setOcrBusy] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const strokesRef = useRef(strokes)
  const draftRef = useRef<PaintStroke | null>(null)
  const persistTimer = useRef<number | null>(null)

  strokesRef.current = strokes

  const paint = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const live = draftRef.current ? [...strokesRef.current, draftRef.current] : strokesRef.current
    renderPaintStrokes(ctx, live, { background, width, height })
  }, [background, height, width])

  useEffect(() => {
    setStrokes(parsePaintStrokes(node.attrs.strokes))
  }, [node.attrs.strokes])

  useEffect(() => {
    paint()
  }, [paint, strokes])

  function schedulePersist(next: PaintStroke[]) {
    if (persistTimer.current) window.clearTimeout(persistTimer.current)
    persistTimer.current = window.setTimeout(() => {
      updateAttributes({ strokes: serializePaintStrokes(next) })
    }, 180)
  }

  function commitStrokes(next: PaintStroke[], pushUndo = true) {
    if (pushUndo) setRedoStack([])
    setStrokes(next)
    strokesRef.current = next
    schedulePersist(next)
    requestAnimationFrame(paint)
  }

  function beginStroke(event: React.PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0) return
    const canvas = canvasRef.current
    if (!canvas) return
    event.preventDefault()
    canvas.setPointerCapture(event.pointerId)
    const point = pointerToCanvas(canvas, event.clientX, event.clientY)
    draftRef.current = {
      tool,
      color: tool === 'eraser' ? '#000000' : color,
      width: tool === 'eraser' ? Math.max(brush * 2.5, 8) : brush,
      points: [point],
    }
    setDrawing(true)
    paint()
  }

  function moveStroke(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing || !draftRef.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const point = pointerToCanvas(canvas, event.clientX, event.clientY)
    const last = draftRef.current.points[draftRef.current.points.length - 1]
    if (last && Math.hypot(point.x - last.x, point.y - last.y) < 0.8) return
    draftRef.current.points.push(point)
    paint()
  }

  function endStroke(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing) return
    const canvas = canvasRef.current
    if (canvas?.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId)
    }
    const draft = draftRef.current
    draftRef.current = null
    setDrawing(false)
    if (draft && draft.points.length > 0) {
      commitStrokes([...strokesRef.current, draft])
    } else {
      paint()
    }
  }

  function undo() {
    if (strokes.length === 0) return
    const next = strokes.slice(0, -1)
    setRedoStack((stack) => [...stack, strokes])
    commitStrokes(next, false)
  }

  function redo() {
    const previous = redoStack[redoStack.length - 1]
    if (!previous) return
    setRedoStack((stack) => stack.slice(0, -1))
    commitStrokes(previous, false)
  }

  function clearAll() {
    if (strokes.length === 0) return
    setRedoStack((stack) => [...stack, strokes])
    commitStrokes([], false)
    updateAttributes({ ocrText: '' })
  }

  async function runOcr() {
    const canvas = canvasRef.current
    if (!canvas || !activeId) {
      toast.error(t('paint.ocrNoDocument'))
      return
    }
    setOcrBusy(true)
    try {
      const dataUrl = canvas.toDataURL('image/png')
      const base64 = dataUrl.replace(/^data:image\/png;base64,/, '')
      const path = await saveDocumentImage(activeId, `paint-${Date.now()}.png`, base64)
      let text = ''
      try {
        const fromBytes = await invoke<{ text: string }>('extract_image_ocr_base64', {
          imageBase64: base64,
          mimeHint: 'image/png',
        })
        text = fromBytes.text?.trim() ?? ''
      } catch {
        const fromPath = await invoke<{ text: string }>('extract_image_ocr', { imagePath: path })
        text = fromPath.text?.trim() ?? ''
      }
      updateAttributes({ ocrText: text, strokes: serializePaintStrokes(strokesRef.current) })
      if (text) toast.success(t('paint.ocrDone'))
      else toast.error(t('paint.ocrEmpty'))
    } catch (error) {
      toast.error(t('paint.ocrError'), String(error))
    } finally {
      setOcrBusy(false)
    }
  }

  function handleDelete() {
    const pos = typeof getPos === 'function' ? getPos() : null
    if (typeof pos === 'number') {
      // Prefer command so history records cleanly when available.
    }
    deleteNode()
  }

  return (
    <NodeViewWrapper
      className={cn('paint-block', selected && 'is-selected', drawing && 'is-drawing')}
      data-drag-handle
    >
      <div className="paint-block__toolbar" contentEditable={false}>
        <span className="paint-block__brand">{t('paint.title')}</span>
        <div className="paint-block__tools">
          <button
            type="button"
            className={cn('paint-block__btn', tool === 'pen' && 'is-active')}
            aria-label={t('paint.pen')}
            title={t('paint.pen')}
            onClick={() => setTool('pen')}
          >
            <Paintbrush className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className={cn('paint-block__btn', tool === 'eraser' && 'is-active')}
            aria-label={t('paint.eraser')}
            title={t('paint.eraser')}
            onClick={() => setTool('eraser')}
          >
            <Eraser className="h-3.5 w-3.5" />
          </button>
          <label className="paint-block__size">
            <span className="sr-only">{t('paint.size')}</span>
            <input
              type="range"
              min={1}
              max={24}
              value={brush}
              onChange={(event) => setBrush(Number(event.target.value))}
            />
          </label>
          <div className="paint-block__swatches" role="listbox" aria-label={t('paint.colors')}>
            {PAINT_INK_COLORS.map((swatch) => (
              <button
                key={swatch}
                type="button"
                className={cn('paint-block__swatch', color === swatch && 'is-active')}
                style={{ background: swatch }}
                aria-label={swatch}
                onClick={() => {
                  setColor(swatch)
                  setTool('pen')
                }}
              />
            ))}
          </div>
        </div>
        <div className="paint-block__actions">
          <button type="button" className="paint-block__btn" disabled={strokes.length === 0} onClick={undo} title={t('paint.undo')}>
            <Undo2 className="h-3.5 w-3.5" />
          </button>
          <button type="button" className="paint-block__btn" disabled={redoStack.length === 0} onClick={redo} title={t('paint.redo')}>
            <Redo2 className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className="paint-block__btn"
            disabled={ocrBusy || strokes.length === 0}
            onClick={() => void runOcr()}
            title={t('paint.ocr')}
          >
            {ocrBusy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <ScanText className="h-3.5 w-3.5" />}
          </button>
          <button type="button" className="paint-block__btn" disabled={strokes.length === 0} onClick={clearAll} title={t('paint.clear')}>
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <button type="button" className="paint-block__btn paint-block__btn--danger" onClick={handleDelete} title={t('common.delete')}>
            ×
          </button>
        </div>
      </div>

      <div className="paint-block__stage" contentEditable={false}>
        <canvas
          ref={canvasRef}
          className="paint-block__canvas"
          width={width}
          height={height}
          style={{ background }}
          onPointerDown={beginStroke}
          onPointerMove={moveStroke}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
          onPointerLeave={(event) => {
            if (drawing) endStroke(event)
          }}
        />
        <div className="paint-block__grain" aria-hidden />
      </div>

      {ocrText ? (
        <p className="paint-block__ocr-text" contentEditable={false}>
          <span className="paint-block__ocr-label">{t('paint.ocrLabel')}</span>
          {ocrText}
        </p>
      ) : null}
    </NodeViewWrapper>
  )
}
