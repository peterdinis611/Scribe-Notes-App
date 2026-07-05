import { useAtom } from 'jotai'
import { FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
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

const chipClass = (active: boolean) =>
  cn(
    'inline-flex h-7 items-center rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[12px] transition-colors hover:bg-[var(--color-hover)]',
    active && 'border-[var(--color-accent)] bg-[var(--color-selection)] font-medium text-[var(--color-accent)]',
  )

const fieldClass = 'grid gap-1 text-[12px] text-[var(--color-muted-foreground)] [&_input]:h-8 [&_input]:rounded-md [&_input]:border [&_input]:border-[var(--color-border)] [&_input]:bg-[var(--color-background)] [&_input]:px-2 [&_input]:text-[13px] [&_input]:text-[var(--color-foreground)]'

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

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-3xl flex-col gap-0 overflow-hidden p-0 titlebar-no-drag" showClose>
        <div className="flex items-start gap-3 border-b border-[var(--color-border)] px-5 py-4">
          <FileText className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-accent)]" />
          <div>
            <h2 className="m-0 text-[16px] font-semibold">Nastavenie stránky</h2>
            <p className="mt-1 text-[12px] text-[var(--color-muted-foreground)]">
              Veľkosť papiera, okraje, hlavička, vodoznak a prvá strana.
            </p>
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="grid gap-6 p-5 lg:grid-cols-[1fr_180px]">
            <div className="space-y-5">
              <section>
                <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.04em] text-[var(--color-muted-foreground)]">
                  Veľkosť papiera
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(PAPER_SIZES) as PaperSizeId[]).map((sizeId) => (
                    <button
                      key={sizeId}
                      type="button"
                      className={chipClass(pageSetup.paperSize === sizeId)}
                      onClick={() => update({ paperSize: sizeId })}
                    >
                      {PAPER_SIZES[sizeId].label}
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.04em] text-[var(--color-muted-foreground)]">
                  Okraje
                </h3>
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {PAGE_MARGIN_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className={chipClass(matchesMarginPreset(pageSetup, preset.id))}
                      onClick={() => update(preset.setup)}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className={fieldClass}>
                    <span>Hore (px)</span>
                    <Input type="number" min={24} max={160} value={pageSetup.marginTop} onChange={(event) => update({ marginTop: Number(event.target.value) })} />
                  </label>
                  <label className={fieldClass}>
                    <span>Dole (px)</span>
                    <Input type="number" min={24} max={160} value={pageSetup.marginBottom} onChange={(event) => update({ marginBottom: Number(event.target.value) })} />
                  </label>
                  <label className={fieldClass}>
                    <span>Vľavo (px)</span>
                    <Input type="number" min={24} max={160} value={pageSetup.marginLeft} onChange={(event) => update({ marginLeft: Number(event.target.value) })} />
                  </label>
                  <label className={fieldClass}>
                    <span>Vpravo (px)</span>
                    <Input type="number" min={24} max={160} value={pageSetup.marginRight} onChange={(event) => update({ marginRight: Number(event.target.value) })} />
                  </label>
                </div>
              </section>

              <section>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="m-0 text-[12px] font-semibold uppercase tracking-[0.04em] text-[var(--color-muted-foreground)]">
                    Hlavička a pätička
                  </h3>
                  <label className="inline-flex items-center gap-2 text-[12px]">
                    <input type="checkbox" checked={headerFooter.enabled} onChange={(event) => updateHeaderFooter({ enabled: event.target.checked })} />
                    <span>Zapnúť</span>
                  </label>
                </div>

                {headerFooter.enabled && (
                  <div className="space-y-3">
                    <p className="m-0 text-[11px] text-[var(--color-muted-foreground)]">
                      Premenné: {'{title}'}, {'{page}'}, {'{pages}'}, {'{date}'}
                    </p>
                    <label className={fieldClass}>
                      <span>Hlavička</span>
                      <Input type="text" value={headerFooter.headerText} placeholder="{title}" onChange={(event) => updateHeaderFooter({ headerText: event.target.value })} />
                    </label>
                    <label className={fieldClass}>
                      <span>Pätička</span>
                      <Input type="text" value={headerFooter.footerText} placeholder="Voliteľný text pätičky" onChange={(event) => updateHeaderFooter({ footerText: event.target.value })} />
                    </label>
                    <label className="inline-flex items-center gap-2 text-[12px]">
                      <input type="checkbox" checked={headerFooter.showPageNumber} onChange={(event) => updateHeaderFooter({ showPageNumber: event.target.checked })} />
                      <span>Zobraziť číslo strany</span>
                    </label>
                  </div>
                )}
              </section>

              <section>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="m-0 text-[12px] font-semibold uppercase tracking-[0.04em] text-[var(--color-muted-foreground)]">
                    Vodoznak
                  </h3>
                  <label className="inline-flex items-center gap-2 text-[12px]">
                    <input type="checkbox" checked={watermark.enabled} onChange={(event) => updateWatermark({ enabled: event.target.checked })} />
                    <span>Zapnúť</span>
                  </label>
                </div>

                {watermark.enabled && (
                  <div className="space-y-3">
                    <label className={fieldClass}>
                      <span>Text</span>
                      <Input type="text" value={watermark.text} placeholder="Koncept" onChange={(event) => updateWatermark({ text: event.target.value })} />
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <label className={fieldClass}>
                        <span>Priehľadnosť</span>
                        <Input type="number" min={0.05} max={0.35} step={0.01} value={watermark.opacity} onChange={(event) => updateWatermark({ opacity: Number(event.target.value) })} />
                      </label>
                      <label className={fieldClass}>
                        <span>Uhol (°)</span>
                        <Input type="number" min={-90} max={90} value={watermark.angle} onChange={(event) => updateWatermark({ angle: Number(event.target.value) })} />
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {['Koncept', 'Dôverné', 'Návrh'].map((preset) => (
                        <button key={preset} type="button" className={chipClass(false)} onClick={() => updateWatermark({ text: preset })}>
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              <section>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h3 className="m-0 text-[12px] font-semibold uppercase tracking-[0.04em] text-[var(--color-muted-foreground)]">
                    Prvá strana odlišná
                  </h3>
                  <label className="inline-flex items-center gap-2 text-[12px]">
                    <input type="checkbox" checked={firstPage.different} onChange={(event) => updateFirstPage({ different: event.target.checked })} />
                    <span>Zapnúť</span>
                  </label>
                </div>

                {firstPage.different && (
                  <div className="space-y-3">
                    <label className="inline-flex items-center gap-2 text-[12px]">
                      <input type="checkbox" checked={firstPage.hideHeaderFooter} onChange={(event) => updateFirstPage({ hideHeaderFooter: event.target.checked })} />
                      <span>Skryť hlavičku a pätičku na prvej strane</span>
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <label className={fieldClass}>
                        <span>Hore prvá strana (px)</span>
                        <Input type="number" min={24} max={200} value={firstPage.marginTop ?? pageSetup.marginTop} onChange={(event) => updateFirstPage({ marginTop: Number(event.target.value) })} />
                      </label>
                      <label className={fieldClass}>
                        <span>Dole prvá strana (px)</span>
                        <Input type="number" min={24} max={200} value={firstPage.marginBottom ?? pageSetup.marginBottom} onChange={(event) => updateFirstPage({ marginBottom: Number(event.target.value) })} />
                      </label>
                    </div>
                  </div>
                )}
              </section>
            </div>

            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--color-muted-foreground)]">
                Náhľad okrajov
              </p>
              <div
                className="relative w-full rounded-md border border-[var(--color-border)] bg-white"
                style={{
                  aspectRatio: `${PAPER_SIZES[pageSetup.paperSize].width} / ${PAPER_SIZES[pageSetup.paperSize].height}`,
                }}
              >
                <div
                  className="absolute rounded-sm border border-dashed border-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-selection)_30%,transparent)]"
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
        </ScrollArea>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--color-border)] px-5 py-3">
          <Button type="button" variant="ghost" size="sm" onClick={resetDefaults}>
            Predvolené
          </Button>
          <Button type="button" variant="default" size="sm" onClick={onClose}>
            Hotovo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
