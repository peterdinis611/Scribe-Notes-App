import { Columns2, FileText, LayoutGrid, Minus, Plus, Printer, Rows2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { IconTooltip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  setPrintLayoutColumns,
  setPrintLayoutEnabled,
  setPrintZoom,
} from '@/store/settingsSlice'

type EditorPrintLayoutBarProps = {
  onPrint: () => void
  onOpenPageSetup: () => void
}

export function EditorPrintLayoutBar({ onPrint, onOpenPageSetup }: EditorPrintLayoutBarProps) {
  const { t } = useTranslation()
  const printLayoutEnabled = useAppSelector((state) => state.settings.printLayoutEnabled)
  const printZoom = useAppSelector((state) => state.settings.printZoom)
  const printColumns = useAppSelector((state) => state.settings.printLayoutColumns)
  const dispatch = useAppDispatch()

  function adjustZoom(delta: number) {
    const next = Math.min(1, Math.max(0.5, Number((printZoom + delta).toFixed(2))))
    dispatch(setPrintZoom(next))
  }

  return (
    <div className="editor-print-bar titlebar-no-drag">
      <div className="editor-print-bar-group editor-print-bar-group--primary">
        <button
          type="button"
          className={cn('editor-print-mode-toggle', printLayoutEnabled && 'is-active')}
          aria-pressed={printLayoutEnabled}
          onClick={() => dispatch(setPrintLayoutEnabled(!printLayoutEnabled))}
        >
          <LayoutGrid className="h-4 w-4 shrink-0" />
          <span>{t('printLayout.pageLayout')}</span>
          <span className={cn('editor-print-mode-indicator', printLayoutEnabled && 'is-on')} />
        </button>

        <Button variant="outline" size="sm" onClick={onOpenPageSetup}>
          <FileText className="h-3.5 w-3.5" />
          {t('printLayout.pageSetup')}
        </Button>
      </div>

      {printLayoutEnabled && (
        <>
          <div className="editor-print-bar-divider" aria-hidden="true" />

          <div className="editor-print-bar-group">
            <span className="editor-print-bar-label">{t('printLayout.preview')}</span>
            <div className="editor-print-bar-segmented">
              <IconTooltip label={t('printLayout.oneColumn')}>
                <button
                  type="button"
                  className={cn('editor-print-bar-segment', printColumns === 1 && 'is-active')}
                  aria-label={t('printLayout.oneColumn')}
                  aria-pressed={printColumns === 1}
                  onClick={() => dispatch(setPrintLayoutColumns(1))}
                >
                  <Rows2 className="h-3.5 w-3.5" />
                </button>
              </IconTooltip>
              <IconTooltip label={t('printLayout.twoColumnsSpread')}>
                <button
                  type="button"
                  className={cn('editor-print-bar-segment', printColumns === 2 && 'is-active')}
                  aria-label={t('printLayout.twoColumnsSpread')}
                  aria-pressed={printColumns === 2}
                  onClick={() => dispatch(setPrintLayoutColumns(2))}
                >
                  <Columns2 className="h-3.5 w-3.5" />
                </button>
              </IconTooltip>
            </div>
          </div>

          <div className="editor-print-bar-group">
            <span className="editor-print-bar-label">{t('printLayout.zoom')}</span>
            <div className="editor-print-bar-zoom-controls">
              <IconTooltip label={t('printLayout.zoomOut')}>
                <Button variant="outline" size="icon" className="h-7 w-7" aria-label={t('printLayout.zoomOut')} onClick={() => adjustZoom(-0.1)}>
                  <Minus className="h-3.5 w-3.5" />
                </Button>
              </IconTooltip>
              <span className="editor-print-bar-zoom">{Math.round(printZoom * 100)}%</span>
              <IconTooltip label={t('printLayout.zoomIn')}>
                <Button variant="outline" size="icon" className="h-7 w-7" aria-label={t('printLayout.zoomIn')} onClick={() => adjustZoom(0.1)}>
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </IconTooltip>
            </div>
          </div>
        </>
      )}

      <div className={cn('editor-print-bar-group', 'editor-print-bar-group--end')}>
        <Button variant="outline" size="sm" onClick={onPrint}>
          <Printer className="h-3.5 w-3.5" />
          {t('fileMenu.print')}
        </Button>
      </div>
    </div>
  )
}
