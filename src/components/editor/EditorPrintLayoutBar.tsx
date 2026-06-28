import { useAtom, useSetAtom } from 'jotai'
import { Columns2, LayoutGrid, Minus, Plus, Printer, Rows2 } from 'lucide-react'
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
}

export function EditorPrintLayoutBar({ onPrint }: EditorPrintLayoutBarProps) {
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
      <div className="editor-print-bar-group">
        <Button
          variant={printLayoutEnabled ? 'default' : 'outline'}
          size="sm"
          onClick={() => setPrintLayoutEnabled(!printLayoutEnabled)}
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          Rozloženie strán
        </Button>
      </div>

      {printLayoutEnabled && (
        <>
          <div className="editor-print-bar-group">
            <span className="editor-print-bar-label">Stĺpce</span>
            <Button
              variant={printColumns === 1 ? 'default' : 'outline'}
              size="icon"
              className="h-7 w-7"
              title="Jeden stĺpec"
              onClick={() => setPrintColumns(1)}
            >
              <Rows2 className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={printColumns === 2 ? 'default' : 'outline'}
              size="icon"
              className="h-7 w-7"
              title="Dva stĺpce"
              onClick={() => setPrintColumns(2)}
            >
              <Columns2 className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div className="editor-print-bar-group">
            <span className="editor-print-bar-label">Zoom</span>
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => adjustZoom(-0.1)}>
              <Minus className="h-3.5 w-3.5" />
            </Button>
            <span className="editor-print-bar-zoom">{Math.round(printZoom * 100)}%</span>
            <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => adjustZoom(0.1)}>
              <Plus className="h-3.5 w-3.5" />
            </Button>
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
