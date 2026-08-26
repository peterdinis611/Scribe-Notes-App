import { FileText } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { FontFamilyField } from '@/components/editor/FontFamilyField'
import {
  applyDocumentStylePreset,
  DOCUMENT_STYLE_PRESETS,
  type DocumentStylePresetId,
} from '@/lib/editor/document-style-presets'
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
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { setPageSetup } from '@/store/settingsSlice'

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
  const { t } = useTranslation()
  const pageSetup = useAppSelector((state) => state.settings.pageSetup)
  const dispatch = useAppDispatch()
  const normalized = normalizePageSetup(pageSetup)
  const headerFooter = normalized.headerFooter
  const watermark = normalized.watermark
  const firstPage = normalized.firstPage
  const typography = normalized.typography

  function update(partial: Partial<PageSetup>) {
    dispatch(setPageSetup(normalizePageSetup({ ...pageSetup, ...partial, stylePresetId: null })))
  }

  function applyPreset(id: DocumentStylePresetId) {
    dispatch(setPageSetup(applyDocumentStylePreset(id)))
  }

  function resetDefaults() {
    dispatch(setPageSetup(DEFAULT_PAGE_SETUP))
  }

  function updateHeaderFooter(partial: Partial<PageHeaderFooter>) {
    dispatch(
      setPageSetup({
        ...pageSetup,
        headerFooter: {
          ...headerFooter,
          ...partial,
        },
      }),
    )
  }

  function updateWatermark(partial: Partial<PageWatermark>) {
    dispatch(
      setPageSetup({
        ...pageSetup,
        watermark: {
          ...watermark,
          ...partial,
        },
      }),
    )
  }

  function updateFirstPage(partial: Partial<FirstPageSetup>) {
    dispatch(
      setPageSetup({
        ...pageSetup,
        firstPage: {
          ...firstPage,
          ...partial,
        },
      }),
    )
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className="flex h-[min(85vh,720px)] max-h-[85vh] max-w-3xl flex-col gap-0 overflow-hidden p-0 titlebar-no-drag"
        showClose
      >
        <div className="flex shrink-0 items-start gap-3 border-b border-[var(--color-border)] px-5 py-4">
          <FileText className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-accent)]" />
          <div>
            <h2 className="m-0 text-[16px] font-semibold">{t('pageStyles.title')}</h2>
            <p className="mt-1 text-[12px] text-[var(--color-muted-foreground)]">
              {t('pageStyles.subtitle')}
            </p>
          </div>
        </div>

        <div className="page-setup-dialog-body min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="grid gap-6 p-5 lg:grid-cols-[1fr_180px]">
            <div className="space-y-5">
              <section>
                <h3 className="mb-1 text-[12px] font-semibold uppercase tracking-[0.04em] text-[var(--color-muted-foreground)]">
                  {t('pageStyles.presetsHeading')}
                </h3>
                <p className="mb-2 mt-0 text-[11px] leading-relaxed text-[var(--color-muted-foreground)]">
                  {t('pageStyles.presetsHint')}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {DOCUMENT_STYLE_PRESETS.map((preset) => {
                    const active = normalized.stylePresetId === preset.id
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        className={cn(
                          'rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 text-left transition-colors hover:bg-[var(--color-hover)]',
                          active &&
                            'border-[var(--color-accent)] bg-[var(--color-selection)]',
                        )}
                        onClick={() => applyPreset(preset.id)}
                      >
                        <span className="block text-[13px] font-medium text-[var(--color-foreground)]">
                          {t(preset.labelKey)}
                        </span>
                        <span className="mt-0.5 block text-[11px] text-[var(--color-muted-foreground)]">
                          {t(preset.descriptionKey)}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>

              <section>
                <h3 className="mb-1 text-[12px] font-semibold uppercase tracking-[0.04em] text-[var(--color-muted-foreground)]">
                  {t('pageStyles.typography')}
                </h3>
                <p className="mb-2 mt-0 text-[11px] leading-relaxed text-[var(--color-muted-foreground)]">
                  {t('pageStyles.typographyHint')}
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <label className={fieldClass}>
                    <span>{t('pageStyles.fontSize')}</span>
                    <Input
                      type="number"
                      min={12}
                      max={28}
                      value={typography.fontSize}
                      onChange={(event) =>
                        update({
                          typography: {
                            ...typography,
                            fontSize: Number(event.target.value),
                          },
                        })
                      }
                    />
                  </label>
                  <label className={fieldClass}>
                    <span>{t('pageStyles.lineHeight')}</span>
                    <Input
                      type="number"
                      min={1.2}
                      max={2.4}
                      step={0.05}
                      value={typography.lineHeight}
                      onChange={(event) =>
                        update({
                          typography: {
                            ...typography,
                            lineHeight: Number(event.target.value),
                          },
                        })
                      }
                    />
                  </label>
                  <label className={cn(fieldClass, 'col-span-2')}>
                    <span>{t('pageStyles.fontFamily')}</span>
                    <FontFamilyField
                      value={typography.fontFamily}
                      onChange={(fontFamily) =>
                        update({
                          typography: {
                            ...typography,
                            fontFamily,
                          },
                        })
                      }
                    />
                  </label>
                </div>
              </section>

              <section>
                <h3 className="mb-1 text-[12px] font-semibold uppercase tracking-[0.04em] text-[var(--color-muted-foreground)]">
                  {t('pageStyles.paperHeading')}
                </h3>
                <p className="mb-2 mt-0 text-[11px] leading-relaxed text-[var(--color-muted-foreground)]">
                  {t('pageStyles.paperHint')}
                </p>
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
                <h3 className="mb-1 text-[12px] font-semibold uppercase tracking-[0.04em] text-[var(--color-muted-foreground)]">
                  {t('pageStyles.marginsHeading')}
                </h3>
                <p className="mb-2 mt-0 text-[11px] leading-relaxed text-[var(--color-muted-foreground)]">
                  {t('pageStyles.marginsHint')}
                </p>
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {PAGE_MARGIN_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      className={chipClass(matchesMarginPreset(pageSetup, preset.id))}
                      onClick={() => update(preset.setup)}
                    >
                      {t(`pageStyles.marginPresets.${preset.id}`)}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className={fieldClass}>
                    <span>{t('pageStyles.marginTop')}</span>
                    <Input type="number" min={24} max={160} value={pageSetup.marginTop} onChange={(event) => update({ marginTop: Number(event.target.value) })} />
                  </label>
                  <label className={fieldClass}>
                    <span>{t('pageStyles.marginBottom')}</span>
                    <Input type="number" min={24} max={160} value={pageSetup.marginBottom} onChange={(event) => update({ marginBottom: Number(event.target.value) })} />
                  </label>
                  <label className={fieldClass}>
                    <span>{t('pageStyles.marginLeft')}</span>
                    <Input type="number" min={24} max={160} value={pageSetup.marginLeft} onChange={(event) => update({ marginLeft: Number(event.target.value) })} />
                  </label>
                  <label className={fieldClass}>
                    <span>{t('pageStyles.marginRight')}</span>
                    <Input type="number" min={24} max={160} value={pageSetup.marginRight} onChange={(event) => update({ marginRight: Number(event.target.value) })} />
                  </label>
                </div>
              </section>

              <section>
                <div className="mb-1 flex items-center justify-between gap-3">
                  <h3 className="m-0 text-[12px] font-semibold uppercase tracking-[0.04em] text-[var(--color-muted-foreground)]">
                    {t('pageStyles.headerFooterHeading')}
                  </h3>
                  <label className="inline-flex items-center gap-2 text-[12px]">
                    <input type="checkbox" checked={headerFooter.enabled} onChange={(event) => updateHeaderFooter({ enabled: event.target.checked })} />
                    <span>{t('pageStyles.enable')}</span>
                  </label>
                </div>

                {headerFooter.enabled && (
                  <div className="space-y-3">
                    <p className="m-0 text-[11px] leading-relaxed text-[var(--color-muted-foreground)]">
                      {t('pageStyles.headerFooterHint')}
                    </p>
                    <label className={fieldClass}>
                      <span>{t('pageStyles.header')}</span>
                      <Input type="text" value={headerFooter.headerText} placeholder="{title}" onChange={(event) => updateHeaderFooter({ headerText: event.target.value })} />
                    </label>
                    <label className={fieldClass}>
                      <span>{t('pageStyles.footer')}</span>
                      <Input type="text" value={headerFooter.footerText} placeholder={t('pageStyles.footerPlaceholder')} onChange={(event) => updateHeaderFooter({ footerText: event.target.value })} />
                    </label>
                    <label className="inline-flex items-center gap-2 text-[12px]">
                      <input type="checkbox" checked={headerFooter.showPageNumber} onChange={(event) => updateHeaderFooter({ showPageNumber: event.target.checked })} />
                      <span>{t('pageStyles.showPageNumber')}</span>
                    </label>
                  </div>
                )}
              </section>

              <section>
                <div className="mb-1 flex items-center justify-between gap-3">
                  <h3 className="m-0 text-[12px] font-semibold uppercase tracking-[0.04em] text-[var(--color-muted-foreground)]">
                    {t('pageStyles.watermarkHeading')}
                  </h3>
                  <label className="inline-flex items-center gap-2 text-[12px]">
                    <input type="checkbox" checked={watermark.enabled} onChange={(event) => updateWatermark({ enabled: event.target.checked })} />
                    <span>{t('pageStyles.enable')}</span>
                  </label>
                </div>
                <p className="mb-2 mt-0 text-[11px] leading-relaxed text-[var(--color-muted-foreground)]">
                  {t('pageStyles.watermarkHint')}
                </p>

                {watermark.enabled && (
                  <div className="space-y-3">
                    <label className={fieldClass}>
                      <span>{t('pageStyles.watermarkText')}</span>
                      <Input type="text" value={watermark.text} placeholder={t('pageStyles.watermarkTextPlaceholder')} onChange={(event) => updateWatermark({ text: event.target.value })} />
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <label className={fieldClass}>
                        <span>{t('pageStyles.opacity')}</span>
                        <Input type="number" min={0.05} max={0.35} step={0.01} value={watermark.opacity} onChange={(event) => updateWatermark({ opacity: Number(event.target.value) })} />
                      </label>
                      <label className={fieldClass}>
                        <span>{t('pageStyles.angle')}</span>
                        <Input type="number" min={-90} max={90} value={watermark.angle} onChange={(event) => updateWatermark({ angle: Number(event.target.value) })} />
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(
                        [
                          ['draft', t('pageStyles.watermarkPresets.draft')],
                          ['confidential', t('pageStyles.watermarkPresets.confidential')],
                          ['proposal', t('pageStyles.watermarkPresets.proposal')],
                        ] as const
                      ).map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          className={chipClass(false)}
                          onClick={() => updateWatermark({ text: label })}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </section>

              <section>
                <div className="mb-1 flex items-center justify-between gap-3">
                  <h3 className="m-0 text-[12px] font-semibold uppercase tracking-[0.04em] text-[var(--color-muted-foreground)]">
                    {t('pageStyles.firstPageHeading')}
                  </h3>
                  <label className="inline-flex items-center gap-2 text-[12px]">
                    <input type="checkbox" checked={firstPage.different} onChange={(event) => updateFirstPage({ different: event.target.checked })} />
                    <span>{t('pageStyles.enable')}</span>
                  </label>
                </div>
                <p className="mb-2 mt-0 text-[11px] leading-relaxed text-[var(--color-muted-foreground)]">
                  {t('pageStyles.firstPageHint')}
                </p>

                {firstPage.different && (
                  <div className="space-y-3">
                    <label className="inline-flex items-center gap-2 text-[12px]">
                      <input type="checkbox" checked={firstPage.hideHeaderFooter} onChange={(event) => updateFirstPage({ hideHeaderFooter: event.target.checked })} />
                      <span>{t('pageStyles.hideHeaderFooterFirst')}</span>
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <label className={fieldClass}>
                        <span>{t('pageStyles.firstMarginTop')}</span>
                        <Input type="number" min={24} max={200} value={firstPage.marginTop ?? pageSetup.marginTop} onChange={(event) => updateFirstPage({ marginTop: Number(event.target.value) })} />
                      </label>
                      <label className={fieldClass}>
                        <span>{t('pageStyles.firstMarginBottom')}</span>
                        <Input type="number" min={24} max={200} value={firstPage.marginBottom ?? pageSetup.marginBottom} onChange={(event) => updateFirstPage({ marginBottom: Number(event.target.value) })} />
                      </label>
                    </div>
                  </div>
                )}
              </section>
            </div>

            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--color-muted-foreground)]">
                {t('pageStyles.marginsPreview')}
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
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--color-border)] px-5 py-3">
          <Button type="button" variant="ghost" size="sm" onClick={resetDefaults}>
            {t('pageStyles.resetDefaults')}
          </Button>
          <Button type="button" variant="default" size="sm" onClick={onClose}>
            {t('pageStyles.done')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
