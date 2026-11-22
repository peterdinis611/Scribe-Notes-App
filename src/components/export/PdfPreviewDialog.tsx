import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, Loader2, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { IconTooltip } from '@/components/ui/tooltip'
import { previewPdfExport } from '@/lib/db/api'
import { base64ToPdfUrl } from '@/lib/pdf/pdf-viewer-config'
import type { PageSetup } from '@/lib/editor/page-setup'
import { cn } from '@/lib/utils'

type PdfPreviewDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  html: string
  plainText: string
  pageSetup?: PageSetup
  onExport: () => void
  /** Ask parent to re-serialize print HTML from the live document. */
  onRequestFreshHtml?: () => void
}

export function PdfPreviewDialog({
  open,
  onOpenChange,
  title,
  html,
  plainText,
  pageSetup,
  onExport,
  onRequestFreshHtml,
}: PdfPreviewDialogProps) {
  const { t } = useTranslation()
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** Snapshot frozen when the sheet opens — avoids regen on every autosave. */
  const snapshotRef = useRef<{
    html: string
    plainText: string
    title: string
    pageSetup?: PageSetup
  } | null>(null)
  const genSeq = useRef(0)

  const close = useCallback(() => onOpenChange(false), [onOpenChange])

  const generate = useCallback(
    async (snap: {
      html: string
      plainText: string
      title: string
      pageSetup?: PageSetup
    }) => {
      if (!snap.html.trim()) return
      const seq = ++genSeq.current
      setLoading(true)
      setError(null)
      try {
        const result = await previewPdfExport(
          snap.html,
          snap.plainText,
          snap.title,
          snap.pageSetup,
        )
        if (seq !== genSeq.current) return
        setPdfUrl((current) => {
          if (current) URL.revokeObjectURL(current)
          return base64ToPdfUrl(result.dataBase64)
        })
      } catch (cause: unknown) {
        if (seq !== genSeq.current) return
        const message = cause instanceof Error ? cause.message : String(cause)
        setError(message || t('pdfPreview.errorFallback'))
      } finally {
        if (seq === genSeq.current) setLoading(false)
      }
    },
    [t],
  )

  // Open → freeze snapshot once and generate. Close → revoke URL.
  useEffect(() => {
    if (!open) {
      genSeq.current += 1
      snapshotRef.current = null
      setPdfUrl((current) => {
        if (current) URL.revokeObjectURL(current)
        return null
      })
      setError(null)
      setLoading(false)
      return
    }
    if (!html.trim()) {
      // Parent is (re)serializing — keep spinner up.
      setLoading(true)
      return
    }
    if (snapshotRef.current) return
    snapshotRef.current = { html, plainText, title, pageSetup }
    void generate(snapshotRef.current)
  }, [open, html, plainText, title, pageSetup, generate])

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

  function refresh() {
    snapshotRef.current = null
    setPdfUrl((current) => {
      if (current) URL.revokeObjectURL(current)
      return null
    })
    setError(null)
    setLoading(true)
    if (onRequestFreshHtml) {
      onRequestFreshHtml()
      return
    }
    const snap = { html, plainText, title, pageSetup }
    snapshotRef.current = snap
    void generate(snap)
  }

  return (
    <div
      className={cn('pdf-preview-root titlebar-no-drag', open && 'is-open')}
      aria-hidden={!open}
      role="dialog"
      aria-modal="true"
      aria-label={t('pdfPreview.ariaLabel', { title })}
    >
      {open && (
        <button
          type="button"
          className="pdf-preview-backdrop"
          aria-label={t('common.close')}
          onClick={close}
        />
      )}

      <div className={cn('pdf-preview-sheet pdf-preview-sheet--native', open && 'is-open')}>
        <header className="pdf-preview-header">
          <div className="pdf-preview-header-text">
            <p className="pdf-preview-eyebrow">{t('pdfPreview.title')}</p>
            <h2 className="pdf-preview-title">{title}</h2>
          </div>

          <div className="pdf-preview-toolbar">
            <Button
              variant="outline"
              size="sm"
              disabled={loading || !html.trim()}
              onClick={refresh}
            >
              <RefreshCw className="h-3.5 w-3.5 shrink-0" />
              {t('pdfPreview.refresh')}
            </Button>
            <Button variant="outline" size="sm" disabled={loading || !!error} onClick={onExport}>
              <Download className="h-3.5 w-3.5 shrink-0" />
              {t('pdfPreview.export')}
            </Button>

            <IconTooltip label={t('common.close')}>
              <Button variant="ghost" size="icon" aria-label={t('common.close')} onClick={close}>
                <X className="h-4 w-4" />
              </Button>
            </IconTooltip>
          </div>
        </header>

        <div className="pdf-preview-viewport pdf-preview-viewport--native">
          {loading && (
            <div className="pdf-preview-state">
              <Loader2 className="h-8 w-8 animate-spin text-[var(--color-muted-foreground)]" />
              <p>{t('pdfPreview.generating')}</p>
            </div>
          )}

          {!loading && error && (
            <div className="pdf-preview-state is-error">
              <p>{error}</p>
              <p className="pdf-preview-state-hint">{t('pdfPreview.errorHint')}</p>
            </div>
          )}

          {!loading && !error && pdfUrl && (
            <iframe
              className="pdf-preview-native-frame"
              title={t('pdfPreview.ariaLabel', { title })}
              src={pdfUrl}
            />
          )}
        </div>
      </div>
    </div>
  )
}
