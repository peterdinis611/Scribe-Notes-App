import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ReactCrop, { convertToPixelCrop, cropToCanvas, type Crop, type PixelCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cropAspectRatio, initialPercentCrop, type CropAspectId } from '@/lib/editor/image-crop'
import { cn } from '@/lib/utils'

type ImageCropDialogProps = {
  open: boolean
  src: string
  onClose: () => void
  onCropped: (dataUrl: string) => void
}

export function ImageCropDialog({ open, src, onClose, onCropped }: ImageCropDialogProps) {
  const { t } = useTranslation()
  const imgRef = useRef<HTMLImageElement>(null)
  const [aspectId, setAspectId] = useState<CropAspectId>('free')
  const [crop, setCrop] = useState<Crop>()
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>()
  const [busy, setBusy] = useState(false)
  const aspect = cropAspectRatio(aspectId)

  useEffect(() => {
    if (!open) return
    setAspectId('free')
    setCrop(undefined)
    setCompletedCrop(undefined)
    setBusy(false)
  }, [open, src])

  function onImageLoad(event: React.SyntheticEvent<HTMLImageElement>) {
    const image = event.currentTarget
    const next = initialPercentCrop(image.naturalWidth, image.naturalHeight, aspect)
    setCrop(next)
    if (image.width > 0 && image.height > 0) {
      setCompletedCrop(convertToPixelCrop(next, image.width, image.height))
    }
  }

  function setAspect(id: CropAspectId) {
    setAspectId(id)
    const image = imgRef.current
    if (!image) return
    const next = initialPercentCrop(image.naturalWidth, image.naturalHeight, cropAspectRatio(id))
    setCrop(next)
    if (image.width > 0 && image.height > 0) {
      setCompletedCrop(convertToPixelCrop(next, image.width, image.height))
    }
  }

  async function applyCrop() {
    const image = imgRef.current
    if (!image || !completedCrop?.width || !completedCrop?.height) return
    setBusy(true)
    try {
      const canvas = document.createElement('canvas')
      await cropToCanvas(image, canvas, completedCrop)
      onCropped(canvas.toDataURL('image/png'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="image-crop-dialog max-w-[720px] titlebar-no-drag" showClose>
        <h2 className="m-0 text-[15px] font-semibold">{t('image.cropTitle')}</h2>
        <p className="mt-1 text-[12px] text-[var(--color-muted-foreground)]">{t('image.cropHint')}</p>
        <div className="image-crop-dialog__aspects mt-3" role="group" aria-label={t('image.cropAspect')}>
          {(['free', 'square', 'photo', 'wide'] as const).map((id) => (
            <button
              key={id}
              type="button"
              className={cn('image-crop-dialog__aspect', aspectId === id && 'is-active')}
              onClick={() => setAspect(id)}
            >
              {t(`image.aspect.${id}`)}
            </button>
          ))}
        </div>
        <div className="image-crop-dialog__stage mt-3">
          <ReactCrop
            crop={crop}
            aspect={aspect}
            ruleOfThirds
            keepSelection
            onChange={(_, percentCrop) => setCrop(percentCrop)}
            onComplete={(next) => setCompletedCrop(next)}
          >
            <img
              ref={imgRef}
              src={src}
              alt=""
              crossOrigin="anonymous"
              onLoad={onImageLoad}
            />
          </ReactCrop>
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button size="sm" disabled={busy || !completedCrop?.width} onClick={() => void applyCrop()}>
            {t('image.applyCrop')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
