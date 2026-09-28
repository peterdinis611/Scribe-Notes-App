import { useEffect, useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { resolveChartDialog } from '@/lib/chart-dialog'
import {
  chartSpecFromGrid,
  D3_CHART_DEFAULT_SOURCE,
  D3_CHART_TEMPLATES,
  D3_CHART_TYPES,
  parseD3ChartSpec,
  renderD3ChartSource,
  stringifyD3ChartSpec,
  type D3ChartType,
} from '@/lib/editor/d3-chart'
import { cn } from '@/lib/utils'
import { useAppSelector } from '@/store/hooks'

function specToGrid(source: string): { type: D3ChartType; title: string; grid: string } {
  const parsed = parseD3ChartSpec(source)
  if (!parsed.ok) {
    return {
      type: 'bar',
      title: '',
      grid: 'month,value\nJan,12\nFeb,19\nMar,15',
    }
  }
  const x = parsed.spec.x || 'label'
  const y = Array.isArray(parsed.spec.y) ? parsed.spec.y : [String(parsed.spec.y || 'value')]
  const header = [x, ...y].join(',')
  const rows = parsed.spec.data.map((row) =>
    [x, ...y].map((field) => String(row[field] ?? '')).join(','),
  )
  return {
    type: parsed.spec.type,
    title: parsed.spec.title || '',
    grid: [header, ...rows].join('\n'),
  }
}

export function ChartBuilderDialogHost() {
  const { t } = useTranslation()
  const dialog = useAppSelector((state) => state.ui.chartDialog)
  const open = dialog.open
  const titleId = useId()
  const gridId = useId()
  const [type, setType] = useState<D3ChartType>('bar')
  const [title, setTitle] = useState('')
  const [grid, setGrid] = useState('month,value\nJan,12\nFeb,19\nMar,15')
  const [advanced, setAdvanced] = useState(false)
  const [jsonSource, setJsonSource] = useState(D3_CHART_DEFAULT_SOURCE)

  useEffect(() => {
    if (!open || !dialog.open) return
    const seed = dialog.initialSource.trim() || D3_CHART_DEFAULT_SOURCE
    const fromSpec = specToGrid(seed)
    setType(fromSpec.type)
    setTitle(fromSpec.title)
    setGrid(fromSpec.grid)
    setJsonSource(seed)
    setAdvanced(false)
  }, [dialog, open])

  const built = useMemo(() => {
    if (advanced) {
      const parsed = parseD3ChartSpec(jsonSource)
      return parsed.ok
        ? { ok: true as const, source: stringifyD3ChartSpec(parsed.spec), error: null }
        : { ok: false as const, source: jsonSource, error: parsed.error }
    }
    const result = chartSpecFromGrid(grid, type, title)
    return result.ok
      ? { ok: true as const, source: result.source, error: null }
      : { ok: false as const, source: '', error: result.error }
  }, [advanced, grid, jsonSource, title, type])

  const preview = useMemo(() => {
    if (!built.ok) return null
    return renderD3ChartSource(built.source)
  }, [built])

  function close(result: Parameters<typeof resolveChartDialog>[0]) {
    resolveChartDialog(result)
  }

  function applyTemplate(next: D3ChartType) {
    const template = D3_CHART_TEMPLATES[next]
    const fromSpec = specToGrid(template.source)
    setType(next)
    setTitle(fromSpec.title)
    setGrid(fromSpec.grid)
    setJsonSource(template.source)
  }

  function submit() {
    if (!built.ok) return
    close({ source: built.source, clear: false })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close(null)
      }}
    >
      {open ? (
        <DialogContent className="titlebar-no-drag max-w-2xl gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-[var(--color-border)] px-5 py-4">
            <DialogTitle>
              {dialog.open && dialog.intent === 'edit'
                ? t('d3Chart.builder.editTitle')
                : t('d3Chart.builder.insertTitle')}
            </DialogTitle>
            <DialogDescription>{t('d3Chart.builder.description')}</DialogDescription>
          </DialogHeader>

          <div className="grid max-h-[min(72vh,720px)] gap-4 overflow-y-auto px-5 py-4">
            <div className="flex flex-wrap gap-1.5">
              {D3_CHART_TYPES.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                    type === item
                      ? 'border-[var(--color-accent)] bg-[color-mix(in_srgb,var(--color-accent)_14%,transparent)] text-[var(--color-accent)]'
                      : 'border-[var(--color-border)] text-[var(--color-muted-foreground)] hover:text-[var(--color-foreground)]',
                  )}
                  onClick={() => applyTemplate(item)}
                >
                  {t(`d3Chart.types.${item}`)}
                </button>
              ))}
            </div>

            {!advanced ? (
              <>
                <label className="grid gap-1.5 text-[12px] text-[var(--color-muted-foreground)]" htmlFor={titleId}>
                  {t('d3Chart.builder.titleLabel')}
                  <Input
                    id={titleId}
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder={t('d3Chart.builder.titlePlaceholder')}
                  />
                </label>
                <label className="grid gap-1.5 text-[12px] text-[var(--color-muted-foreground)]" htmlFor={gridId}>
                  {t('d3Chart.builder.gridLabel')}
                  <textarea
                    id={gridId}
                    className="min-h-[120px] w-full resize-y rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-mono text-[12px] leading-relaxed text-[var(--color-foreground)] outline-none focus-visible:border-[var(--color-accent)]"
                    value={grid}
                    spellCheck={false}
                    onChange={(event) => setGrid(event.target.value)}
                  />
                  <span className="text-[11px]">{t('d3Chart.builder.gridHint')}</span>
                </label>
              </>
            ) : (
              <label className="grid gap-1.5 text-[12px] text-[var(--color-muted-foreground)]">
                {t('d3Chart.builder.jsonLabel')}
                <textarea
                  className="min-h-[180px] w-full resize-y rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-mono text-[12px] leading-relaxed text-[var(--color-foreground)] outline-none focus-visible:border-[var(--color-accent)]"
                  value={jsonSource}
                  spellCheck={false}
                  onChange={(event) => setJsonSource(event.target.value)}
                />
              </label>
            )}

            <div
              className={cn(
                'min-h-[160px] rounded-[var(--radius-sm)] border px-3 py-3',
                preview?.ok
                  ? 'border-[var(--color-border)] bg-[var(--color-surface)]'
                  : 'border-[color-mix(in_srgb,#dc2626_35%,var(--color-border))] bg-[color-mix(in_srgb,#dc2626_6%,var(--color-surface))]',
              )}
            >
              {preview?.ok ? (
                <div
                  className="d3-chart-builder-preview [&_svg]:max-w-full [&_svg]:h-auto"
                  dangerouslySetInnerHTML={{ __html: preview.svg }}
                />
              ) : (
                <p className="m-0 text-[12px] text-[#b91c1c]">
                  {built.error || preview?.error || t('d3Chart.builder.previewEmpty')}
                </p>
              )}
            </div>
          </div>

          <DialogFooter className="border-t border-[var(--color-border)] px-5 py-3">
            <Button type="button" variant="ghost" size="sm" onClick={() => setAdvanced((value) => !value)}>
              {advanced ? t('d3Chart.builder.simpleMode') : t('d3Chart.builder.advancedMode')}
            </Button>
            <div className="flex-1" />
            <Button type="button" variant="ghost" size="sm" onClick={() => close(null)}>
              {t('common.cancel')}
            </Button>
            {dialog.open && dialog.intent === 'edit' ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => close({ source: '', clear: true })}
              >
                {t('d3Chart.builder.remove')}
              </Button>
            ) : null}
            <Button type="button" size="sm" disabled={!built.ok} onClick={submit}>
              {dialog.open && dialog.intent === 'edit' ? t('common.save') : t('d3Chart.builder.insert')}
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  )
}
