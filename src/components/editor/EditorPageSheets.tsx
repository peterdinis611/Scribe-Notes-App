import { normalizePageSetup, PAPER_SIZES, type PageSetup } from '@/lib/editor/page-setup'
import {
  getAlignedSheetTop,
  getSheetPosition,
  resolvePrintStageSize,
  type PageSegment,
} from '@/lib/editor/page-segments'

const PAGE_GAP = 28

type EditorPageSheetsProps = {
  pageSetup: PageSetup
  pageSegments: PageSegment[]
  columns: 1 | 2
  paddingTop: number
}

export function EditorPageSheets({
  pageSetup,
  pageSegments,
  columns,
  paddingTop,
}: EditorPageSheetsProps) {
  const normalized = normalizePageSetup(pageSetup)
  const paper = PAPER_SIZES[normalized.paperSize]

  return (
    <div className="editor-page-sheets" aria-hidden="true">
      {pageSegments.map((segment, index) => {
        const alignedTop = getAlignedSheetTop(index, segment, paddingTop, PAGE_GAP)
        const spread = getSheetPosition(index, columns, paper.width, paper.height, PAGE_GAP)

        return (
          <div
            key={segment.pageNumber}
            className="editor-page-sheet"
            style={{
              width: paper.width,
              height: paper.height,
              transform: `translate(${spread.left}px, ${alignedTop}px)`,
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
  pageSegments: PageSegment[],
  paddingTop: number,
  paddingBottom: number,
): { width: number; height: number } {
  const paper = PAPER_SIZES[normalizePageSetup(pageSetup).paperSize]
  return resolvePrintStageSize(
    pageSegments,
    { paddingTop, paddingBottom },
    paper.width,
    paper.height,
    PAGE_GAP,
    columns,
    pageCount,
  )
}
