import { useMemo } from 'react'
import {
  buildHeaderFooterLines,
  formatExportDate,
} from '@/lib/editor/page-header-footer'
import { normalizePageSetup, type PageSetup } from '@/lib/editor/page-setup'
import { getSheetPosition, shouldShowHeaderFooter, type PageSegment } from '@/lib/editor/page-segments'

type PageHeaderFooterOverlaysProps = {
  pageSetup: PageSetup
  pageSegments: PageSegment[]
  documentTitle: string
  paddingTop: number
  printLayout?: {
    enabled: boolean
    columns: 1 | 2
    paperWidth: number
    paperHeight: number
    gap: number
  }
}

export function PageHeaderFooterOverlays({
  pageSetup,
  pageSegments,
  documentTitle,
  paddingTop,
  printLayout,
}: PageHeaderFooterOverlaysProps) {
  const normalized = normalizePageSetup(pageSetup)
  const config = normalized.headerFooter

  const pages = useMemo(() => {
    if (!config.enabled) return []

    const date = formatExportDate()
    const totalPages = pageSegments.length

    return pageSegments
      .filter((segment) => shouldShowHeaderFooter(pageSetup, segment.pageNumber))
      .map((segment) => {
        const lines = buildHeaderFooterLines(config, {
          title: documentTitle,
          page: segment.pageNumber,
          pages: totalPages,
          date,
        })

        if (printLayout?.enabled) {
          const position = getSheetPosition(
            segment.pageNumber - 1,
            printLayout.columns,
            printLayout.paperWidth,
            printLayout.paperHeight,
            printLayout.gap,
          )

          return {
            page: segment.pageNumber,
            header: lines.header,
            footer: lines.footer,
            style: {
              left: position.left,
              top: position.top,
              width: printLayout.paperWidth,
              height: printLayout.paperHeight,
            },
            mode: 'sheet' as const,
          }
        }

        const pageTop = paddingTop + segment.start
        return {
          page: segment.pageNumber,
          header: lines.header,
          footer: lines.footer,
          pageTop,
          contentHeight: segment.height,
          mode: 'flow' as const,
        }
      })
  }, [config, documentTitle, paddingTop, pageSegments, pageSetup, printLayout])

  if (!pages.length) return null

  return (
    <>
      {pages.map((page) =>
        page.mode === 'sheet' ? (
          <div
            key={page.page}
            className="editor-page-chrome editor-page-chrome--sheet"
            aria-hidden="true"
            style={page.style}
          >
            {page.header && <div className="editor-page-header">{page.header}</div>}
            {page.footer && <div className="editor-page-footer">{page.footer}</div>}
          </div>
        ) : (
          <div key={page.page} className="editor-page-chrome" aria-hidden="true">
            {page.header && (
              <div className="editor-page-header" style={{ top: page.pageTop + 10 }}>
                {page.header}
              </div>
            )}
            {page.footer && (
              <div
                className="editor-page-footer"
                style={{ top: page.pageTop + page.contentHeight - 28 }}
              >
                {page.footer}
              </div>
            )}
          </div>
        ),
      )}
    </>
  )
}
