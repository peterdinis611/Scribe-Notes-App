import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAtom } from 'jotai'
import { FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DEFAULT_PAGE_SETUP,
  PAGE_MARGIN_PRESETS,
  PAPER_SIZES,
  normalizePageSetup,
  type FirstPageSetup,
  type PageHeaderFooter,
  type PageSetup,
  type PageWatermark,
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
  const normalized = normalizePageSetup(pageSetup)
  const headerFooter = normalized.headerFooter
  const watermark = normalized.watermark
  const firstPage = normalized.firstPage
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

  function updateHeaderFooter(partial: Partial<PageHeaderFooter>) {
    setPageSetup({
      ...pageSetup,
      headerFooter: {
        ...headerFooter,
        ...partial,
      },
    })
  }

  function updateWatermark(partial: Partial<PageWatermark>) {
    setPageSetup({
      ...pageSetup,
      watermark: {
        ...watermark,
        ...partial,
      },
    })
  }

  function updateFirstPage(partial: Partial<FirstPageSetup>) {
    setPageSetup({
      ...pageSetup,
      firstPage: {
        ...firstPage,
        ...partial,
      },
    })
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
          <FileText className="h-5 w-5 shrink-0" />
          <div>
            <h2 className="page-setup-dialog-title">Nastavenie stránky</h2>
            <p className="page-setup-dialog-desc">Veľkosť papiera, okraje, hlavička, vodoznak a prvá strana.</p>
          </div>
        </div>

        <div className="page-setup-dialog-body">
          <div className="page-setup-dialog-grid">
            <div className="page-setup-dialog-main">
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

              <section className="page-setup-section">
                <div className="page-setup-section-head">
                  <h3 className="page-setup-section-title">Hlavička a pätička</h3>
                  <label className="page-setup-toggle">
                    <input
                      type="checkbox"
                      checked={headerFooter.enabled}
                      onChange={(event) => updateHeaderFooter({ enabled: event.target.checked })}
                    />
                    <span>Zapnúť</span>
                  </label>
                </div>

                {headerFooter.enabled && (
                  <>
                    <p className="page-setup-hint">
                      Premenné: {'{title}'}, {'{page}'}, {'{pages}'}, {'{date}'}
                    </p>
                    <div className="page-setup-stack">
                      <label className="page-setup-field">
                        <span>Hlavička</span>
                        <input
                          type="text"
                          value={headerFooter.headerText}
                          placeholder="{title}"
                          onChange={(event) => updateHeaderFooter({ headerText: event.target.value })}
                        />
                      </label>
                      <label className="page-setup-field">
                        <span>Pätička</span>
                        <input
                          type="text"
                          value={headerFooter.footerText}
                          placeholder="Voliteľný text pätičky"
                          onChange={(event) => updateHeaderFooter({ footerText: event.target.value })}
                        />
                      </label>
                      <label className="page-setup-toggle page-setup-toggle--inline">
                        <input
                          type="checkbox"
                          checked={headerFooter.showPageNumber}
                          onChange={(event) => updateHeaderFooter({ showPageNumber: event.target.checked })}
                        />
                        <span>Zobraziť číslo strany</span>
                      </label>
                    </div>
                  </>
                )}
              </section>

              <section className="page-setup-section">
                <div className="page-setup-section-head">
                  <h3 className="page-setup-section-title">Vodoznak</h3>
                  <label className="page-setup-toggle">
                    <input
                      type="checkbox"
                      checked={watermark.enabled}
                      onChange={(event) => updateWatermark({ enabled: event.target.checked })}
                    />
                    <span>Zapnúť</span>
                  </label>
                </div>

                {watermark.enabled && (
                  <div className="page-setup-stack">
                    <label className="page-setup-field">
                      <span>Text</span>
                      <input
                        type="text"
                        value={watermark.text}
                        placeholder="Koncept"
                        onChange={(event) => updateWatermark({ text: event.target.value })}
                      />
                    </label>
                    <div className="page-setup-grid">
                      <label className="page-setup-field">
                        <span>Priehľadnosť</span>
                        <input
                          type="number"
                          min={0.05}
                          max={0.35}
                          step={0.01}
                          value={watermark.opacity}
                          onChange={(event) => updateWatermark({ opacity: Number(event.target.value) })}
                        />
                      </label>
                      <label className="page-setup-field">
                        <span>Uhol (°)</span>
                        <input
                          type="number"
                          min={-90}
                          max={90}
                          value={watermark.angle}
                          onChange={(event) => updateWatermark({ angle: Number(event.target.value) })}
                        />
                      </label>
                    </div>
                    <div className="page-setup-chip-row">
                      {['Koncept', 'Dôverné', 'Návrh'].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          className="page-setup-chip"
                          onClick={() => updateWatermark({ text: preset })}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              <section className="page-setup-section page-setup-section--last">
                <div className="page-setup-section-head">
                  <h3 className="page-setup-section-title">Prvá strana odlišná</h3>
                  <label className="page-setup-toggle">
                    <input
                      type="checkbox"
                      checked={firstPage.different}
                      onChange={(event) => updateFirstPage({ different: event.target.checked })}
                    />
                    <span>Zapnúť</span>
                  </label>
                </div>

                {firstPage.different && (
                  <div className="page-setup-stack">
                    <label className="page-setup-toggle page-setup-toggle--inline">
                      <input
                        type="checkbox"
                        checked={firstPage.hideHeaderFooter}
                        onChange={(event) => updateFirstPage({ hideHeaderFooter: event.target.checked })}
                      />
                      <span>Skryť hlavičku a pätičku na prvej strane</span>
                    </label>
                    <div className="page-setup-grid">
                      <label className="page-setup-field">
                        <span>Hore prvá strana (px)</span>
                        <input
                          type="number"
                          min={24}
                          max={200}
                          value={firstPage.marginTop ?? pageSetup.marginTop}
                          onChange={(event) => updateFirstPage({ marginTop: Number(event.target.value) })}
                        />
                      </label>
                      <label className="page-setup-field">
                        <span>Dole prvá strana (px)</span>
                        <input
                          type="number"
                          min={24}
                          max={200}
                          value={firstPage.marginBottom ?? pageSetup.marginBottom}
                          onChange={(event) => updateFirstPage({ marginBottom: Number(event.target.value) })}
                        />
                      </label>
                    </div>
                  </div>
                )}
              </section>
            </div>

            <div className="page-setup-preview">
              <p className="page-setup-preview-label">Náhľad okrajov</p>
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
          </div>
        </div>

        <div className="page-setup-dialog-footer">
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
