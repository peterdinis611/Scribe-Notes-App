import { useMemo } from 'react'
import { PDFViewer } from '@embedpdf/react-pdf-viewer'
import { useTranslation } from 'react-i18next'
import { getPdfiumWasmUrl } from '@/lib/pdf/pdfium-engine'
import { cn } from '@/lib/utils'

type EmbedPdfPageViewerProps = {
  url: string
  title: string
  className?: string
}

function themePreference(): 'light' | 'dark' {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

/** PDF preview powered by EmbedPDF (PDFium), replaces the old pdf.js canvas viewer. */
export function EmbedPdfPageViewer({ url, title, className }: EmbedPdfPageViewerProps) {
  const { t } = useTranslation()
  const preference = themePreference()
  const config = useMemo(
    () => ({
      src: url,
      worker: true,
      wasmUrl: getPdfiumWasmUrl(),
      fontFallback: null as null,
      fonts: { ui: null, signature: null },
      tabBar: 'never' as const,
      theme: { preference },
      disabledCategories: [
        'annotation',
        'redaction',
        'document-print',
        'export',
        'form',
        'signature',
        'stamp',
        'attachment',
      ],
    }),
    [url, preference],
  )

  return (
    <div
      className={cn('embed-pdf-viewer', className)}
      aria-label={t('pdfPreview.pageAria', { page: 1, total: 1, title })}
    >
      <PDFViewer config={config} style={{ width: '100%', height: '100%', minHeight: 360 }} />
    </div>
  )
}

/** @deprecated Use EmbedPdfPageViewer */
export const PdfJsPageViewer = EmbedPdfPageViewer
