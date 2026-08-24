import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type ImageCropDialogProps = {
  open: boolean
  src: string
  onClose: () => void
  onCropped: (dataUrl: string) => void
}

type CropRect = { x: number; y: number; w: number; h: number }

export function ImageCropDialog({ open, src, onClose, onCropped }: ImageCropDialogProps) {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [natural, setNatural] = useState({ w: 0, h: 0 })
  const [crop, setCrop] = useState<CropRect>({ x: 0, y: 0, w: 0, h: 0 })
  const dragRef = useRef<{ startX: number; startY: number; origin: CropRect } | null>(null)

  useEffect(() => {
    if (!open) return
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      const w = image.naturalWidth
      const h = image.naturalHeight
      setNatural({ w, h })
      const size = Math.min(w, h) * 0.8
      setCrop({
        x: (w - size) / 2,
        y: (h - size) / 2,
        w: size,
        h: size,
      })
      const canvas = canvasRef.current
      if (!canvas) return
      const maxW = 520
      const scale = Math.min(1, maxW / w)
      canvas.width = Math.round(w * scale)
      canvas.height = Math.round(h * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
    }
    image.src = src
  }, [open, src])

  function displayScale() {
    const canvas = canvasRef.current
    if (!canvas || !natural.w) return 1
    return canvas.width / natural.w
  }

  function handlePointerDown(event: React.PointerEvent) {
    const canvas = canvasRef.current
    if (!canvas) return
    const scale = displayScale()
    const rect = canvas.getBoundingClientRect()
    const x = (event.clientX - rect.left) / scale
    const y = (event.clientY - rect.top) / scale
    dragRef.current = { startX: x, startY: y, origin: crop }
    canvas.setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event: React.PointerEvent) {
    const drag = dragRef.current
    const canvas = canvasRef.current
    if (!drag || !canvas) return
    const scale = displayScale()
    const rect = canvas.getBoundingClientRect()
    const x = (event.clientX - rect.left) / scale
    const y = (event.clientY - rect.top) / scale
    const dx = x - drag.startX
    const dy = y - drag.startY
    const next = {
      x: Math.max(0, Math.min(natural.w - drag.origin.w, drag.origin.x + dx)),
      y: Math.max(0, Math.min(natural.h - drag.origin.h, drag.origin.y + dy)),
      w: drag.origin.w,
      h: drag.origin.h,
    }
    setCrop(next)
  }

  function handlePointerUp(event: React.PointerEvent) {
    dragRef.current = null
    try {
      canvasRef.current?.releasePointerCapture(event.pointerId)
    } catch {
      // ignore
    }
  }

  async function applyCrop() {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('Failed to load image'))
      image.src = src
    })
    const out = document.createElement('canvas')
    out.width = Math.max(1, Math.round(crop.w))
    out.height = Math.max(1, Math.round(crop.h))
    const ctx = out.getContext('2d')
    if (!ctx) return
    ctx.drawImage(image, crop.x, crop.y, crop.w, crop.h, 0, 0, out.width, out.height)
    onCropped(out.toDataURL('image/png'))
  }

  const scale = displayScale()

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-[580px] titlebar-no-drag" showClose>
        <h2 className="m-0 text-[15px] font-semibold">{t('image.cropTitle')}</h2>
        <p className="mt-1 text-[12px] text-[var(--color-muted-foreground)]">
          {t('image.cropHint')}
        </p>
        <div className="relative mt-3 overflow-hidden rounded-lg border border-[var(--color-border)]">
          <canvas
            ref={canvasRef}
            className="block max-w-full cursor-move"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          />
          {natural.w > 0 && (
            <div
              className="pointer-events-none absolute border-2 border-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)]"
              style={{
                left: crop.x * scale,
                top: crop.y * scale,
                width: crop.w * scale,
                height: crop.h * scale,
              }}
            />
          )}
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" onClick={() => void applyCrop()}>
            {t('image.applyCrop')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
