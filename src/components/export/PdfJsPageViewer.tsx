import { useCallback, useEffect, useRef, useState } from 'react'
import { getDocument, type PDFDocumentProxy } from 'pdfjs-dist'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { IconTooltip } from '@/components/ui/tooltip'
import { ensurePdfjsWorker } from '@/lib/pdf/pdfjs-worker'
import { cn } from '@/lib/utils'

type PdfJsPageViewerProps = {
  url: string
  title: string
  className?: string
}

export function PdfJsPageViewer({ url, title, className }: PdfJsPageViewerProps) {
  const { t } = useTranslation()
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const pdfRef = useRef<PDFDocumentProxy | null>(null)
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null)

  const [pageCount, setPageCount] = useState(0)
  const [page, setPage] = useState(1)
  const [pageTurn, setPageTurn] = useState<'idle' | 'next' | 'prev'>('idle')
  const [loadingDoc, setLoadingDoc] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stageWidth, setStageWidth] = useState(0)
  const pageRef = useRef(1)

  useEffect(() => {
    ensurePdfjsWorker()
    let cancelled = false
    setLoadingDoc(true)
    setError(null)
    setPage(1)
    setPageCount(0)

    const task = getDocument(url)
    void task.promise
      .then((pdf) => {
        if (cancelled) {
          void pdf.destroy()
          return
        }
        pdfRef.current = pdf
        setPageCount(pdf.numPages)
        setLoadingDoc(false)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        const message = cause instanceof Error ? cause.message : String(cause)
        setError(message || t('pdfPreview.errorFallback'))
        setLoadingDoc(false)
      })

    return () => {
      cancelled = true
      renderTaskRef.current?.cancel()
      renderTaskRef.current = null
      const pdf = pdfRef.current
      pdfRef.current = null
      if (pdf) void pdf.destroy()
    }
  }, [url, t])

  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0
      setStageWidth(Math.floor(width))
    })
    observer.observe(el)
    setStageWidth(Math.floor(el.clientWidth))
    return () => observer.disconnect()
  }, [loadingDoc])

  const goToPage = useCallback(
    (next: number) => {
      if (pageCount < 1) return
      const clamped = Math.min(pageCount, Math.max(1, next))
      if (clamped === pageRef.current) return
      setPageTurn(clamped > pageRef.current ? 'next' : 'prev')
      pageRef.current = clamped
      setPage(clamped)
    },
    [pageCount],
  )

  useEffect(() => {
    pageRef.current = page
  }, [page])

  useEffect(() => {
    if (pageTurn === 'idle') return
    const timer = window.setTimeout(() => setPageTurn('idle'), 280)
    return () => window.clearTimeout(timer)
  }, [pageTurn, page])

  useEffect(() => {
    const pdf = pdfRef.current
    const canvas = canvasRef.current
    if (!pdf || !canvas || loadingDoc || pageCount < 1 || stageWidth < 32) return

    let cancelled = false
    renderTaskRef.current?.cancel()

    void pdf
      .getPage(page)
      .then(async (pdfPage) => {
        if (cancelled) return
        const base = pdfPage.getViewport({ scale: 1 })
        const padding = 32
        const fitScale = Math.min(2.5, Math.max(0.5, (stageWidth - padding) / base.width))
        const viewport = pdfPage.getViewport({ scale: fitScale })
        const context = canvas.getContext('2d', { alpha: false })
        if (!context) throw new Error('Canvas 2D unavailable')

        const outputScale = window.devicePixelRatio || 1
        canvas.width = Math.floor(viewport.width * outputScale)
        canvas.height = Math.floor(viewport.height * outputScale)
        canvas.style.width = `${Math.floor(viewport.width)}px`
        canvas.style.height = `${Math.floor(viewport.height)}px`
        context.setTransform(outputScale, 0, 0, outputScale, 0, 0)

        const renderTask = pdfPage.render({
          canvasContext: context,
          viewport,
        })
        renderTaskRef.current = renderTask
        await renderTask.promise
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        const name = cause && typeof cause === 'object' && 'name' in cause ? String(cause.name) : ''
        if (name === 'RenderingCancelledException') return
        const message = cause instanceof Error ? cause.message : String(cause)
        setError(message || t('pdfPreview.errorFallback'))
      })

    return () => {
      cancelled = true
      renderTaskRef.current?.cancel()
      renderTaskRef.current = null
    }
  }, [page, pageCount, stageWidth, loadingDoc, t])

  useEffect(() => {
    if (pageCount <= 1) return

    function onKeyDown(event: KeyboardEvent) {
      const target = event.target
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return
      }
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault()
        goToPage(page - 1)
      } else if (event.key === 'ArrowRight' || event.key === 'PageDown') {
        event.preventDefault()
        goToPage(page + 1)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [page, pageCount, goToPage])

  const multiPage = pageCount > 1

  return (
    <div className={cn('pdf-js-viewer', className)}>
      {loadingDoc && (
        <div className="pdf-js-viewer-busy">
          <Loader2 className="h-7 w-7 animate-spin text-[var(--color-muted-foreground)]" />
          <p>{t('pdfPreview.loadingPages')}</p>
        </div>
      )}

      {error && (
        <div className="pdf-preview-state is-error">
          <p>{error}</p>
        </div>
      )}

      {!error && (
        <div ref={stageRef} className="pdf-js-viewer-stage">
          {multiPage && (
            <IconTooltip label={t('pagination.previousPage')}>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="pdf-js-viewer-nav pdf-js-viewer-nav--prev"
                disabled={page <= 1}
                aria-label={t('pagination.previousPage')}
                onClick={() => goToPage(page - 1)}
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
            </IconTooltip>
          )}

          <canvas
            ref={canvasRef}
            className={cn(
              'pdf-js-viewer-canvas',
              pageTurn !== 'idle' && 'pdf-js-viewer-canvas--turn',
              pageTurn === 'next' && 'is-next',
              pageTurn === 'prev' && 'is-prev',
            )}
            aria-label={t('pdfPreview.pageAria', { page, total: pageCount || 1, title })}
          />

          {multiPage && (
            <IconTooltip label={t('pagination.nextPage')}>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="pdf-js-viewer-nav pdf-js-viewer-nav--next"
                disabled={page >= pageCount}
                aria-label={t('pagination.nextPage')}
                onClick={() => goToPage(page + 1)}
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </IconTooltip>
          )}
        </div>
      )}

      {multiPage && !error && (
        <div className="pdf-js-viewer-footer" aria-live="polite">
          <IconTooltip label={t('pagination.previousPage')}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="pdf-js-viewer-footer-arrow"
              disabled={page <= 1}
              aria-label={t('pagination.previousPage')}
              onClick={() => goToPage(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </IconTooltip>
          <span
            key={page}
            className={cn(
              'pdf-js-viewer-page-label',
              pageTurn !== 'idle' && 'pdf-js-viewer-page-label--tick',
            )}
          >
            {t('pagination.summary', { current: page, total: pageCount })}
          </span>
          <IconTooltip label={t('pagination.nextPage')}>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="pdf-js-viewer-footer-arrow"
              disabled={page >= pageCount}
              aria-label={t('pagination.nextPage')}
              onClick={() => goToPage(page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </IconTooltip>
        </div>
      )}
    </div>
  )
}
