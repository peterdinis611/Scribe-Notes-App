import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAtom } from 'jotai'
import { FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DEFAULT_PAGE_SETUP,
  PAGE_MARGIN_PRESETS,
  PAPER_SIZES,
  type PageSetup,
  type PaperSizeId,
} from '@/lib/editor/page-setup'
import { cn } from '@/lib/utils'
import { pageSetupAtom } from '@/store/settings'

type PageSetupDialogProps = {
  open: boolean
  onClose: () => void
}

function matchesMarginPreset(setup: PageSetup, presetId: string) {
  const preset = PAGE_MARGIN_PRESETS.find((item) => item.id === presetId)
  if (!preset) return false
  return (
    setup.marginTop === preset.setup.marginTop &&
    setup.marginBottom === preset.setup.marginBottom &&
    setup.marginLeft === preset.setup.marginLeft &&
    setup.marginRight === preset.setup.marginRight
  )
}

export function PageSetupDialog({ open, onClose }: PageSetupDialogProps) {
  const [pageSetup, setPageSetup] = useAtom(pageSetupAtom)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  if (!open || !mounted) return null

  function update(partial: Partial<PageSetup>) {
    setPageSetup({ ...pageSetup, ...partial })
  }

  function resetDefaults() {
    setPageSetup(DEFAULT_PAGE_SETUP)
  }

  return createPortal(
    <div className="input-dialog-backdrop titlebar-no-drag" onClick={onClose}>
      <div
        className="page-setup-dialog"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Nastavenie stránky"
      >
        <div className="page-setup-dialog-header">
          <FileText className="h-5 w-5" />
          <div>
            <h2 className="page-setup-dialog-title">Nastavenie stránky</h2>
            <p className="page-setup-dialog-desc">Veľkosť papiera a okraje — ako v Apple Pages.</p>
          </div>
        </div>

        <section className="page-setup-section">
          <h3 className="page-setup-section-title">Veľkosť papiera</h3>
          <div className="page-setup-chip-row">
            {(Object.keys(PAPER_SIZES) as PaperSizeId[]).map((sizeId) => (
              <button
                key={sizeId}
                type="button"
                className={cn('page-setup-chip', pageSetup.paperSize === sizeId && 'is-active')}
                onClick={() => update({ paperSize: sizeId })}
              >
                {PAPER_SIZES[sizeId].label}
              </button>
            ))}
          </div>
        </section>

        <section className="page-setup-section">
          <h3 className="page-setup-section-title">Okraje</h3>
          <div className="page-setup-chip-row">
            {PAGE_MARGIN_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={cn('page-setup-chip', matchesMarginPreset(pageSetup, preset.id) && 'is-active')}
                onClick={() => update(preset.setup)}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="page-setup-grid">
            <label className="page-setup-field">
              <span>Hore (px)</span>
              <input
                type="number"
                min={24}
                max={160}
                value={pageSetup.marginTop}
                onChange={(event) => update({ marginTop: Number(event.target.value) })}
              />
            </label>
            <label className="page-setup-field">
              <span>Dole (px)</span>
              <input
                type="number"
                min={24}
                max={160}
                value={pageSetup.marginBottom}
                onChange={(event) => update({ marginBottom: Number(event.target.value) })}
              />
            </label>
            <label className="page-setup-field">
              <span>Vľavo (px)</span>
              <input
                type="number"
                min={24}
                max={160}
                value={pageSetup.marginLeft}
                onChange={(event) => update({ marginLeft: Number(event.target.value) })}
              />
            </label>
            <label className="page-setup-field">
              <span>Vpravo (px)</span>
              <input
                type="number"
                min={24}
                max={160}
                value={pageSetup.marginRight}
                onChange={(event) => update({ marginRight: Number(event.target.value) })}
              />
            </label>
          </div>
        </section>

        <div className="page-setup-preview">
          <div
            className="page-setup-preview-sheet"
            style={{
              aspectRatio: `${PAPER_SIZES[pageSetup.paperSize].width} / ${PAPER_SIZES[pageSetup.paperSize].height}`,
            }}
          >
            <div
              className="page-setup-preview-content"
              style={{
                top: `${(pageSetup.marginTop / PAPER_SIZES[pageSetup.paperSize].height) * 100}%`,
                bottom: `${(pageSetup.marginBottom / PAPER_SIZES[pageSetup.paperSize].height) * 100}%`,
                left: `${(pageSetup.marginLeft / PAPER_SIZES[pageSetup.paperSize].width) * 100}%`,
                right: `${(pageSetup.marginRight / PAPER_SIZES[pageSetup.paperSize].width) * 100}%`,
              }}
            />
          </div>
        </div>

        <div className="input-dialog-actions">
          <Button type="button" variant="ghost" size="sm" onClick={resetDefaults}>
            Predvolené
          </Button>
          <Button type="button" variant="default" size="sm" onClick={onClose}>
            Hotovo
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
