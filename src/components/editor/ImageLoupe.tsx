import {
  useEffect,
  useId,
  useRef,
  useState,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

const LOUPE_SIZE = 168
const ZOOM_MIN = 1.75
const ZOOM_MAX = 4
const ZOOM_DEFAULT = 2.4

type ImageLoupeProps = {
  imgRef: RefObject<HTMLImageElement | null>
  src: string
  enabled: boolean
  label: string
  /** Last known pointer over the image — seeds the lens when Alt arms mid-hover. */
  pointerRef?: RefObject<{ x: number; y: number } | null>
}

type LoupePose = {
  x: number
  y: number
  bgSizeW: number
  bgSizeH: number
  bgPosX: number
  bgPosY: number
}

function poseFromEvent(
  img: HTMLImageElement,
  clientX: number,
  clientY: number,
  zoom: number,
): LoupePose | null {
  const rect = img.getBoundingClientRect()
  if (rect.width < 8 || rect.height < 8) return null
  const offsetX = Math.min(Math.max(clientX - rect.left, 0), rect.width)
  const offsetY = Math.min(Math.max(clientY - rect.top, 0), rect.height)
  const bgSizeW = rect.width * zoom
  const bgSizeH = rect.height * zoom
  const radius = LOUPE_SIZE / 2
  return {
    x: clientX - radius,
    y: clientY - radius,
    bgSizeW,
    bgSizeH,
    bgPosX: -(offsetX * zoom - radius),
    bgPosY: -(offsetY * zoom - radius),
  }
}

/** Circular magnifier that tracks the pointer over an editor image. */
export function ImageLoupe({ imgRef, src, enabled, label, pointerRef }: ImageLoupeProps) {
  const labelId = useId()
  const [pose, setPose] = useState<LoupePose | null>(null)
  const [zoom, setZoom] = useState(ZOOM_DEFAULT)
  const zoomRef = useRef(zoom)
  zoomRef.current = zoom

  useEffect(() => {
    if (!enabled) {
      setPose(null)
      setZoom(ZOOM_DEFAULT)
      return
    }

    const img = imgRef.current
    if (!img) return

    const clear = () => setPose(null)

    const seed = pointerRef?.current
    if (seed) {
      const next = poseFromEvent(img, seed.x, seed.y, zoomRef.current)
      if (next) setPose(next)
    }

    const onMove = (event: PointerEvent) => {
      const next = poseFromEvent(img, event.clientX, event.clientY, zoomRef.current)
      setPose(next)
    }

    const onLeave = () => clear()

    const onWheel = (event: WheelEvent) => {
      if (!poseFromEvent(img, event.clientX, event.clientY, zoomRef.current)) return
      event.preventDefault()
      event.stopPropagation()
      const delta = event.deltaY > 0 ? -0.2 : 0.2
      const nextZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoomRef.current + delta))
      zoomRef.current = nextZoom
      setZoom(nextZoom)
      const next = poseFromEvent(img, event.clientX, event.clientY, nextZoom)
      if (next) setPose(next)
    }

    img.classList.add('is-loupe-target')
    img.addEventListener('pointermove', onMove)
    img.addEventListener('pointerenter', onMove)
    img.addEventListener('pointerleave', onLeave)
    img.addEventListener('wheel', onWheel, { passive: false })

    return () => {
      img.classList.remove('is-loupe-target')
      img.removeEventListener('pointermove', onMove)
      img.removeEventListener('pointerenter', onMove)
      img.removeEventListener('pointerleave', onLeave)
      img.removeEventListener('wheel', onWheel)
      clear()
    }
  }, [enabled, imgRef, pointerRef, src])

  if (!enabled || !pose || !src || typeof document === 'undefined') return null

  return createPortal(
    <div
      className={cn('image-loupe', 'titlebar-no-drag')}
      style={{
        width: LOUPE_SIZE,
        height: LOUPE_SIZE,
        left: pose.x,
        top: pose.y,
        backgroundImage: `url(${JSON.stringify(src)})`,
        backgroundSize: `${pose.bgSizeW}px ${pose.bgSizeH}px`,
        backgroundPosition: `${pose.bgPosX}px ${pose.bgPosY}px`,
      }}
      role="img"
      aria-labelledby={labelId}
    >
      <span id={labelId} className="image-loupe-sr">
        {label}
      </span>
      <span className="image-loupe-rim" aria-hidden="true" />
      <span className="image-loupe-glass" aria-hidden="true" />
      <span className="image-loupe-zoom" aria-hidden="true">
        {zoom.toFixed(1)}×
      </span>
    </div>,
    document.body,
  )
}
