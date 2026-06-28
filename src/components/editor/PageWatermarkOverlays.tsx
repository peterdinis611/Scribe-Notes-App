import { normalizePageSetup, type PageSetup } from '@/lib/editor/page-setup'
import { getSheetPosition, type PageSegment } from '@/lib/editor/page-segments'

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
        const position = printLayout
          ? getSheetPosition(index, columns, paperWidth, paperHeight, gap)
          : { left: 0, top: paddingTop + segment.start }

        const height = printLayout ? paperHeight : segment.height
        const width = printLayout ? paperWidth : paperWidth

        return (
          <div
            key={`watermark-${segment.pageNumber}`}
            className="editor-page-watermark"
            aria-hidden="true"
            style={{
              left: position.left,
              top: position.top,
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
