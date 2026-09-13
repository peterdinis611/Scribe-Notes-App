import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { resolveImageSrc } from '@/lib/editor/image-utils'

type ImageLightboxProps = {
  open: boolean
  src: string
  alt?: string
  onClose: () => void
}

export function ImageLightbox({ open, src, alt, onClose }: ImageLightboxProps) {
  const { t } = useTranslation()
  const resolved = resolveImageSrc(src)

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
      className="image-lightbox titlebar-no-drag"
      role="dialog"
      aria-modal="true"
      aria-label={t('image.lightbox')}
      onClick={onClose}
    >
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
        onClick={(event) => event.stopPropagation()}
        draggable={false}
      />
    </div>,
    document.body,
  )
}
