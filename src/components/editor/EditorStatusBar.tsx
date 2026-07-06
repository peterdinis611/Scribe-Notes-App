import { Columns2, FileText, LayoutGrid, Minus, Plus, Printer, Rows2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { countWords } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import {
  setPrintLayoutColumns,
  setPrintLayoutEnabled,
  setPrintZoom,
} from '@/store/settingsSlice'
import { EditorPagination } from '@/components/EditorPagination'

type EditorStatusBarProps = {
  currentPage: number
  pageCount: number
  onPageChange: (page: number) => void
  onPrint: () => void
  onOpenPageSetup: () => void
}

export function EditorStatusBar({
  currentPage,
  pageCount,
  onPageChange,
  onPrint,
  onOpenPageSetup,
}: EditorStatusBarProps) {
  const document = useAppSelector((state) => state.documents.activeDocument)
  const printLayoutEnabled = useAppSelector((state) => state.settings.printLayoutEnabled)
  const printZoom = useAppSelector((state) => state.settings.printZoom)
  const printColumns = useAppSelector((state) => state.settings.printLayoutColumns)
  const dispatch = useAppDispatch()

  const words = document ? countWords(document.contentJson) : 0

  function adjustZoom(delta: number) {
    const next = Math.min(1, Math.max(0.5, Number((printZoom + delta).toFixed(2))))
    dispatch(setPrintZoom(next))
  }

  return (
    <footer className="editor-status-bar titlebar-no-drag">
      <div className="editor-status-bar-left">
        <button
          type="button"
          className={cn('editor-status-chip', printLayoutEnabled && 'is-active')}
          aria-pressed={printLayoutEnabled}
          onClick={() => dispatch(setPrintLayoutEnabled(!printLayoutEnabled))}
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          <span>Rozloženie</span>
        </button>
        <button type="button" className="editor-status-chip" onClick={onOpenPageSetup}>
          <FileText className="h-3.5 w-3.5" />
          <span>Stránka</span>
        </button>

        {printLayoutEnabled && (
          <>
            <div className="editor-status-divider" aria-hidden="true" />
            <div className="editor-status-segmented">
              <button
                type="button"
                className={cn('editor-status-segment', printColumns === 1 && 'is-active')}
                title="Jeden stĺpec"
                aria-pressed={printColumns === 1}
                onClick={() => dispatch(setPrintLayoutColumns(1))}
              >
                <Rows2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                className={cn('editor-status-segment', printColumns === 2 && 'is-active')}
                title="Dva stĺpce"
                aria-pressed={printColumns === 2}
                onClick={() => dispatch(setPrintLayoutColumns(2))}
              >
                <Columns2 className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="editor-status-zoom">
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => adjustZoom(-0.1)}>
                <Minus className="h-3 w-3" />
              </Button>
              <span>{Math.round(printZoom * 100)}%</span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => adjustZoom(0.1)}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </>
        )}
      </div>

      <div className="editor-status-bar-center">
        <EditorPagination
          currentPage={currentPage}
          pageCount={pageCount}
          onPageChange={onPageChange}
          compact
        />
      </div>

      <div className="editor-status-bar-right">
        {document && (
          <span className="editor-status-meta">
            {words} {words === 1 ? 'slovo' : words < 5 ? 'slová' : 'slov'}
          </span>
        )}
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2.5 text-[12px]" onClick={onPrint}>
          <Printer className="h-3.5 w-3.5" />
          Tlačiť
        </Button>
      </div>
    </footer>
  )
}
