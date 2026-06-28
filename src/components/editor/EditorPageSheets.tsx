import { normalizePageSetup, PAPER_SIZES, type PageSetup } from '@/lib/editor/page-setup'
import { getSheetPosition, type PageSegment } from '@/lib/editor/page-segments'

const PAGE_GAP = 28

type EditorPageSheetsProps = {
  pageSetup: PageSetup
  pageSegments: PageSegment[]
  columns: 1 | 2
}

export function EditorPageSheets({ pageSetup, pageSegments, columns }: EditorPageSheetsProps) {
  const normalized = normalizePageSetup(pageSetup)
  const paper = PAPER_SIZES[normalized.paperSize]

  return (
    <div className="editor-page-sheets" aria-hidden="true">
      {pageSegments.map((segment, index) => {
        const position = getSheetPosition(index, columns, paper.width, paper.height, PAGE_GAP)

        return (
          <div
            key={segment.pageNumber}
            className="editor-page-sheet"
            style={{
              width: paper.width,
              height: paper.height,
              transform: `translate(${position.left}px, ${position.top}px)`,
            }}
          >
            <span className="editor-page-sheet-label">Strana {segment.pageNumber}</span>
          </div>
        )
      })}
    </div>
  )
}

export { PAGE_GAP as EDITOR_PAGE_GAP }

export function getEditorPrintStageSize(
  pageCount: number,
  columns: 1 | 2,
  pageSetup: PageSetup,
): { width: number; height: number } {
  const paper = PAPER_SIZES[normalizePageSetup(pageSetup).paperSize]
  if (columns === 1) {
    return {
      width: paper.width,
      height: pageCount * paper.height + Math.max(0, pageCount - 1) * PAGE_GAP,
    }
  }

  const rows = Math.ceil(pageCount / 2)
  return {
    width: paper.width * 2 + PAGE_GAP,
    height: rows * paper.height + Math.max(0, rows - 1) * PAGE_GAP,
  }
}
