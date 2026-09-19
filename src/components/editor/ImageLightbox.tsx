import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { resolveImageSrc } from '@/lib/editor/image-utils'
import { cn } from '@/lib/utils'

type ImageLightboxProps = {
  open: boolean
  src: string
  displaySrc?: string
  animated?: boolean
  alt?: string
  onClose: () => void
}

export function ImageLightbox({ open, src, displaySrc, animated, alt, onClose }: ImageLightboxProps) {
  const { t } = useTranslation()
  const resolved = displaySrc || resolveImageSrc(src)

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose, open])

  if (!open || !resolved || typeof document === 'undefined') return null

  return createPortal(
    <div
      className={cn('image-lightbox titlebar-no-drag', animated && 'is-animated')}
      role="dialog"
      aria-modal="true"
      aria-label={t('image.lightbox')}
      onClick={onClose}
    >
      <div className="image-lightbox-backdrop" aria-hidden="true" />
      <button
        type="button"
        className="image-lightbox-close"
        onClick={onClose}
        title={t('common.close')}
        aria-label={t('common.close')}
      >
        <X className="h-5 w-5" />
      </button>
      <img
        src={resolved}
        alt={alt ?? ''}
        className="image-lightbox-img"
        decoding={animated ? 'sync' : 'async'}
        onClick={(event) => event.stopPropagation()}
        draggable={false}
      />
    </div>,
    document.body,
  )
}
