import { useMemo } from 'react'
import {
  buildHeaderFooterLines,
  formatExportDate,
} from '@/lib/editor/page-header-footer'
import { normalizePageSetup, type PageSetup } from '@/lib/editor/page-setup'

type PageHeaderFooterOverlaysProps = {
  pageSetup: PageSetup
  pageCount: number
  pageLayout: {
    paddingTop: number
    contentHeight: number
  }
  documentTitle: string
}

export function PageHeaderFooterOverlays({
  pageSetup,
  pageCount,
  pageLayout,
  documentTitle,
}: PageHeaderFooterOverlaysProps) {
  const normalized = normalizePageSetup(pageSetup)
  const config = normalized.headerFooter

  const pages = useMemo(() => {
    if (!config.enabled) return []

    const date = formatExportDate()
    return Array.from({ length: pageCount }, (_, index) => {
      const page = index + 1
      const pageTop = pageLayout.paddingTop + index * pageLayout.contentHeight
      const lines = buildHeaderFooterLines(config, {
        title: documentTitle,
        page,
        pages: pageCount,
        date,
      })

      return {
        page,
        pageTop,
        header: lines.header,
        footer: lines.footer,
      }
    })
  }, [config, documentTitle, pageCount, pageLayout.contentHeight, pageLayout.paddingTop])

  if (!pages.length) return null

  return (
    <>
      {pages.map(({ page, pageTop, header, footer }) => (
        <div key={page} className="editor-page-chrome" aria-hidden="true">
          {header && (
            <div className="editor-page-header" style={{ top: pageTop + 10 }}>
              {header}
            </div>
          )}
          {footer && (
            <div
              className="editor-page-footer"
              style={{ top: pageTop + pageLayout.contentHeight - 28 }}
            >
              {footer}
            </div>
          )}
        </div>
      ))}
    </>
  )
}
