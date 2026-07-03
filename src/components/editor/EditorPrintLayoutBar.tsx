import { useAtom, useSetAtom } from 'jotai'
import { Columns2, FileText, LayoutGrid, Minus, Plus, Printer, Rows2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  printLayoutColumnsAtom,
  printLayoutEnabledAtom,
  printZoomAtom,
  setPrintLayoutColumnsAtom,
  setPrintLayoutEnabledAtom,
  setPrintZoomAtom,
} from '@/store/settings'

type EditorPrintLayoutBarProps = {
  onPrint: () => void
  onOpenPageSetup: () => void
}

export function EditorPrintLayoutBar({ onPrint, onOpenPageSetup }: EditorPrintLayoutBarProps) {
  const [printLayoutEnabled] = useAtom(printLayoutEnabledAtom)
  const [printZoom] = useAtom(printZoomAtom)
  const [printColumns] = useAtom(printLayoutColumnsAtom)
  const setPrintLayoutEnabled = useSetAtom(setPrintLayoutEnabledAtom)
  const setPrintZoom = useSetAtom(setPrintZoomAtom)
  const setPrintColumns = useSetAtom(setPrintLayoutColumnsAtom)

  function adjustZoom(delta: number) {
    setPrintZoom(Math.min(1, Math.max(0.5, Number((printZoom + delta).toFixed(2)))))
  }

  return (
    <div className="editor-print-bar titlebar-no-drag">
      <div className="editor-print-bar-group editor-print-bar-group--primary">
        <button
          type="button"
          className={cn('editor-print-mode-toggle', printLayoutEnabled && 'is-active')}
          aria-pressed={printLayoutEnabled}
          onClick={() => setPrintLayoutEnabled(!printLayoutEnabled)}
        >
          <LayoutGrid className="h-4 w-4 shrink-0" />
          <span>Rozloženie strán</span>
          <span className={cn('editor-print-mode-indicator', printLayoutEnabled && 'is-on')} />
        </button>

        <Button variant="outline" size="sm" onClick={onOpenPageSetup}>
          <FileText className="h-3.5 w-3.5" />
          Nastavenie stránky
        </Button>
      </div>

      {printLayoutEnabled && (
        <>
          <div className="editor-print-bar-divider" aria-hidden="true" />

          <div className="editor-print-bar-group">
            <span className="editor-print-bar-label">Náhľad</span>
            <div className="editor-print-bar-segmented">
              <button
                type="button"
                className={cn('editor-print-bar-segment', printColumns === 1 && 'is-active')}
                title="Jeden stĺpec"
                aria-pressed={printColumns === 1}
                onClick={() => setPrintColumns(1)}
              >
                <Rows2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className={cn('editor-print-bar-segment', printColumns === 2 && 'is-active')}
                title="Dva stĺpce (spred)"
                aria-pressed={printColumns === 2}
                onClick={() => setPrintColumns(2)}
              >
                <Columns2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="editor-print-bar-group">
            <span className="editor-print-bar-label">Zoom</span>
            <div className="editor-print-bar-zoom-controls">
              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => adjustZoom(-0.1)}>
                <Minus className="h-3.5 w-3.5" />
              </Button>
              <span className="editor-print-bar-zoom">{Math.round(printZoom * 100)}%</span>
              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => adjustZoom(0.1)}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </>
      )}

      <div className={cn('editor-print-bar-group', 'editor-print-bar-group--end')}>
        <Button variant="outline" size="sm" onClick={onPrint}>
          <Printer className="h-3.5 w-3.5" />
          Tlačiť…
        </Button>
      </div>
    </div>
  )
}
