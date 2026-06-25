import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, Loader2, X } from 'lucide-react'
import { PDFViewer } from '@embedpdf/react-pdf-viewer'
import { Button } from '@/components/ui/button'
import { previewPdfExport } from '@/lib/db/api'
import { base64ToPdfUrl, createPdfViewerConfig } from '@/lib/pdf/pdf-viewer-config'
import { cn } from '@/lib/utils'

type PdfPreviewDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  html: string
  plainText: string
  onExport: () => void
}

export function PdfPreviewDialog({
  open,
  onOpenChange,
  title,
  html,
  plainText,
  onExport,
}: PdfPreviewDialogProps) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = useCallback(() => onOpenChange(false), [onOpenChange])

  const viewerConfig = useMemo(
    () => (pdfUrl ? createPdfViewerConfig(pdfUrl) : null),
    [pdfUrl],
  )

  useEffect(() => {
    if (!open) {
      setPdfUrl((current) => {
        if (current) URL.revokeObjectURL(current)
        return null
      })
      setError(null)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    void previewPdfExport(html, plainText, title)
      .then((result) => {
        if (cancelled) return
        setPdfUrl((current) => {
          if (current) URL.revokeObjectURL(current)
          return base64ToPdfUrl(result.dataBase64)
        })
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        const message = cause instanceof Error ? cause.message : String(cause)
        setError(message || 'Nepodarilo sa vygenerovať náhľad PDF.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open, html, plainText, title])

  useEffect(() => {
    if (!open) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, close])

  return (
    <div
      className={cn('pdf-preview-root titlebar-no-drag', open && 'is-open')}
      aria-hidden={!open}
      role="dialog"
      aria-modal="true"
      aria-label={`Náhľad PDF: ${title}`}
    >
      {open && (
        <button type="button" className="pdf-preview-backdrop" aria-label="Zavrieť" onClick={close} />
      )}

      <div className={cn('pdf-preview-sheet pdf-preview-sheet--embedpdf', open && 'is-open')}>
        <header className="pdf-preview-header">
          <div className="pdf-preview-header-text">
            <p className="pdf-preview-eyebrow">Náhľad PDF</p>
            <h2 className="pdf-preview-title">{title}</h2>
          </div>

          <div className="pdf-preview-toolbar">
            <Button variant="outline" size="sm" disabled={loading || !!error} onClick={onExport}>
              <Download className="h-3.5 w-3.5 shrink-0" />
              Exportovať
            </Button>

            <Button variant="ghost" size="icon" aria-label="Zavrieť" onClick={close}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <div className="pdf-preview-viewport pdf-preview-viewport--embedpdf">
          {loading && (
            <div className="pdf-preview-state">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--color-muted-foreground)]" />
              <p>Generujem PDF náhľad…</p>
            </div>
          )}

          {!loading && error && (
            <div className="pdf-preview-state is-error">
              <p>{error}</p>
              <p className="pdf-preview-state-hint">
                PDF export vyžaduje macOS a nástroj textutil. Skúste exportovať priamo do súboru.
              </p>
            </div>
          )}

          {!loading && !error && viewerConfig && (
            <PDFViewer
              key={pdfUrl}
              config={viewerConfig}
              className="pdf-preview-embedpdf"
              style={{ width: '100%', height: '100%' }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
