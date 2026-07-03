import { normalizePageSetup, type PageSetup } from '@/lib/editor/page-setup'
import { getAlignedSheetTop, getSheetPosition, type PageSegment } from '@/lib/editor/page-segments'

type PageWatermarkOverlaysProps = {
  pageSetup: PageSetup
  pageSegments: PageSegment[]
  columns: 1 | 2
  paperWidth: number
  paperHeight: number
  gap: number
  paddingTop?: number
  printLayout?: boolean
}

export function PageWatermarkOverlays({
  pageSetup,
  pageSegments,
  columns,
  paperWidth,
  paperHeight,
  gap,
  paddingTop = 0,
  printLayout = false,
}: PageWatermarkOverlaysProps) {
  const normalized = normalizePageSetup(pageSetup)
  const watermark = normalized.watermark

  if (!watermark.enabled || !watermark.text.trim()) return null

  return (
    <>
      {pageSegments.map((segment, index) => {
        const spread = printLayout
          ? getSheetPosition(index, columns, paperWidth, paperHeight, gap)
          : { left: 0, top: 0 }
        const alignedTop = printLayout
          ? getAlignedSheetTop(index, segment, paddingTop, gap)
          : paddingTop + segment.start

        const top = printLayout ? alignedTop : paddingTop + segment.start
        const left = printLayout ? spread.left : 0
        const height = printLayout ? paperHeight : segment.height
        const width = paperWidth

        return (
          <div
            key={`watermark-${segment.pageNumber}`}
            className="editor-page-watermark"
            aria-hidden="true"
            style={{
              left,
              top,
              width,
              height,
              ['--watermark-opacity' as string]: String(watermark.opacity),
              ['--watermark-angle' as string]: `${watermark.angle}deg`,
            }}
          >
            <span>{watermark.text.trim()}</span>
          </div>
        )
      })}
    </>
  )
}
